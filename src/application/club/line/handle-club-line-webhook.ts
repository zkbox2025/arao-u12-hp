// src/application/club/line/handle-club-line-webhook.ts
// webhookKeyでクラブ設定をDBから取得し、署名を検証し、完全一致した登録コードだけを一度限りで消費する統括Application Service

import "server-only";

import {
  parseClubLineRegistrationCode, //LINEのテキストメッセージ全体が登録コードと完全一致する場合だけ返す。前後の空白、改行、説明文を含むメッセージは受け付けない。
} from "@/domain/club/line/line-registration-code";

import {
  LINE_WEBHOOK_MAX_BODY_BYTES,//LINE側のリクエストサイズ上限を超えないよう、 アプリでも2,000,000byteを超えるWebhook本文を処理しない。
  parseLineWebhookPayload,//webhook本文（LINEが送ってきた一言一句そのまんまの姿）から、検証後に、destination（公式アカウントのユーザーID）、eventCount（何件の出来事が含まれてるのか）、groupTextMessages（テキストメッセージ：groupIdとtext）を安全に抜き出す関数
  verifyLineWebhookSignature,//署名検証関数：受信したraw body(Webhook本文（LINEが送ってきた一言一句そのまんまの姿）)とChannel Secretで正解の署名を作成し送られてきた署名と比較して正しい署名か検証する
} from "@/src/infrastructure/line/line-webhook";

import {
  consumeClubLineRegistrationTokenAndUpsertTarget,//有効な登録コードを一度だけ消費し、同じtransactionで通知先を無効で登録する。
//既存グループの再登録時は名前・roleを保持し、必ず無効へ戻す。
//管理画面でオーナーが通知を有効化できるようにするための『下準備（データの保存と取得）』を行う
  findClubLineSettingForWebhook, //webhookKeyから署名検証に必要な最小限の設定をDBから取得する（事前にDBに公式ライン情報を登録していること前提で、公式ラインからの登録コード投稿検知からのwebhookが送られてきた際に署名検証するためのデータを取得する）
} from "@/src/infrastructure/prisma/repositories/club-line-setting-repository";

import {
  decryptLineCredential,//DBにあるチャンネルシークレットを安全に開封する関数（ラインから送られてきたものと照合するため）
} from "@/src/infrastructure/security/line-credential-crypto";

import {
  hashToken,//生トークンをSHA-256でハッシュ化する。
} from "@/src/infrastructure/security/token";

//クラブ別ラインwebhook検証関数の結果の型
export type HandleClubLineWebhookResult =
  | {
      status: 200;
      outcome:
        | "VERIFICATION_SUCCEEDED"//検証成功
        | "PROCESSED"//処理完了
        | "REGISTRATION_SUCCEEDED";//登録完了
    }
  | {
      status: 400;
      outcome: "INVALID_REQUEST";//不正なリクエスト
    }
  | {
      status: 401;
      outcome: "UNAUTHORIZED";//認証エラー
    }
  | {
      status: 403;
      outcome: "FORBIDDEN";//閲覧権限なし
    }
  | {
      status: 404;
      outcome: "NOT_FOUND";//データが見つからない
    }
  | {
      status: 413;
      outcome: "PAYLOAD_TOO_LARGE";//データのサイズが大きすぎる
    }
  | {
      status: 503;
      outcome: "SERVICE_UNAVAILABLE";//サービス利用不可(設定行はあるけれど、Bot IDやシークレットが空っぽで動かせない)
    };

  //クラブ別ラインwebhook検証関数の入力値の型
type HandleClubLineWebhookInput = {
  webhookKey: string;
  signature: string | null;
  rawBody: string;
  now?: Date;
};

//値が文字列で中身が１文字以上あるかの検証関数（trueだと中身がある文字列確定）
function hasConfiguredValue(
  value: string | null,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

//webhook本文（すべて）をバッファー形式（プログラムが読み取れる形）に直して2000000バイトを超えていないか検証する関数(trueが超えててfalseが超えてない)
function isPayloadTooLarge(
  rawBody: string,
): boolean {
  return (
    Buffer.byteLength(
      rawBody,
      "utf8",
    ) >
    LINE_WEBHOOK_MAX_BODY_BYTES//LINE側のリクエストサイズ上限を超えないよう、 アプリでも2,000,000byteを超えるWebhook本文を処理しない。
  );
}

/**
 * webhookKeyでクラブ設定をDBから取得し、署名を検証し、完全一致した登録コードだけを一度限りで消費する関数。
 *
 * この関数は秘密値を結果や例外へ含めず、ログも出さない。
 * HTTPレスポンスと安全なログへの変換はRoute Handlerが担当する。
 */
export async function handleClubLineWebhook(
  input: HandleClubLineWebhookInput, //クラブ別ラインwebhook検証関数の入力値の型
): Promise<HandleClubLineWebhookResult> {//クラブ別ラインwebhook検証関数の結果の型（statusとoutcome）
  let setting://webhookKeyから署名検証に必要な最小限の設定をDBから取得するデータの戻り値をsettingの箱に入れる
    Awaited<
      ReturnType<
        typeof findClubLineSettingForWebhook//webhookKeyから署名検証に必要な最小限の設定をDBから取得する（事前にDBに公式ライン情報を登録していること前提で、公式ラインからの登録コード投稿検知からのwebhookが送られてきた際に署名検証するためのデータを取得する）
      >
    >;

  try {
    setting =
      await findClubLineSettingForWebhook({//webhookKeyから署名検証に必要な最小限の設定をDBから取得する（事前にDBに公式ライン情報を登録していること前提で、公式ラインからの登録コード投稿検知からのwebhookが送られてきた際に署名検証するためのデータを取得する）
        webhookKey:
          input.webhookKey,
      });
  } catch {
    return {
      status: 503,
      outcome:
        "SERVICE_UNAVAILABLE",//サービス利用不可(設定行はあるけれど、Bot IDやシークレットが空っぽで動かせない)
    };
  }

  if (!setting) {
    return {
      status: 404,
      outcome: "NOT_FOUND",//データがない
    };
  }

  if (!input.signature) {
    return {
      status: 401,
      outcome:
        "UNAUTHORIZED",//認証エラー
    };
  }

  if (
    isPayloadTooLarge(//webhook本文（すべて）をバッファー形式（プログラムが読み取れる形）に直して2000000バイトを超えていないか検証する関数(trueが超えててfalseが超えてない)
      input.rawBody,
    )
  ) {
    return {
      status: 413,
      outcome:
        "PAYLOAD_TOO_LARGE",//データのサイズが大きすぎる
    };
  }

  if (
    !hasConfiguredValue(//値が文字列で中身が１文字以上あるかの検証関数（trueだと中身がある文字列確定）
      setting.lineBotUserId,
    ) ||
    !hasConfiguredValue(
      setting
        .lineChannelSecretEncrypted,
    )
  ) {
    return {
      status: 503,
      outcome:
        "SERVICE_UNAVAILABLE",//サービス利用不可(設定行はあるけれど、Bot IDやシークレットが空っぽで動かせない)
    };
  }

  let channelSecret: string;//箱を用意する

  try {
    channelSecret =
      decryptLineCredential({//DBにあるチャンネルシークレットを安全に開封する関数（ラインから送られてきたものと照合するため）
        encryptedValue:
          setting
            .lineChannelSecretEncrypted,
        clubId:
          setting.clubId,
        credentialType:
          "CHANNEL_SECRET",
      });
  } catch {
    return {
      status: 503,
      outcome:
        "SERVICE_UNAVAILABLE",//サービス利用不可(設定行はあるけれど、Bot IDやシークレットが空っぽで動かせない)
    };
  }

  if (!channelSecret) {
    return {
      status: 503,
      outcome:
        "SERVICE_UNAVAILABLE",//サービス利用不可(設定行はあるけれど、Bot IDやシークレットが空っぽで動かせない)
    };
  }

  const isValidSignature =
    verifyLineWebhookSignature({//署名検証関数：受信したraw body(Webhook本文（LINEが送ってきた一言一句そのまんまの姿）)とChannel Secretで正解の署名を作成し送られてきた署名と比較して正しい署名か検証する
      rawBody:
        input.rawBody,
      signature:
        input.signature,
      channelSecret,
    });

  if (!isValidSignature) {
    return {
      status: 401,
      outcome:
        "UNAUTHORIZED",//認証エラー
    };
  }

  const parsed =
    parseLineWebhookPayload(//webhook本文（LINEが送ってきた一言一句そのまんまの姿）から、検証後に、destination（公式アカウントのユーザーID）、eventCount（何件の出来事が含まれてるのか）、groupTextMessages（テキストメッセージ：groupIdとtext）を安全に抜き出す関数
      input.rawBody,
    );

  if (!parsed.success) {
    if (
      parsed.error ===
      "PAYLOAD_TOO_LARGE"//中身の容量が大きすぎる
    ) {
      return {
        status: 413,
        outcome:
          "PAYLOAD_TOO_LARGE",//中身の容量が大きすぎる
      };
    }

    //容量オーバー以外のエラーは以下
    return {
      status: 400,
      outcome:
        "INVALID_REQUEST",//不正なリクエスト
    };
  }

  if (
    parsed.data.destination !==//ラインのユーザーIDが正しいかの検証
    setting.lineBotUserId
  ) {
    return {
      status: 403,
      outcome: "FORBIDDEN",//閲覧権限なし
    };
  }

  //イベントが0個のときは『LINEデベロッパー画面からの接続テスト（検証）』だと判断して、
  // その場で処理を200で成功終了させる
  if (
    parsed.data.eventCount === 0
  ) {
    return {
      status: 200,
      outcome:
        "VERIFICATION_SUCCEEDED",//検証成功
    };
  }

  const now =
    input.now ?? new Date();

  let registrationSucceeded =//登録コードの成功か失敗かの箱を一旦「失敗」とする
    false;

  for (
    const message of
    parsed.data.groupTextMessages//テキストメッセージ（groupIdとtext）
  ) {
    const registrationCode =
      parseClubLineRegistrationCode(//LINEのテキストメッセージ全体が登録コードと完全一致する場合だけ返す。前後の空白、改行、説明文を含むメッセージは受け付けない。
        message.text,
      );

    if (!registrationCode) {//LINEのテキストメッセージの一つ目のチェックで登録コードではない場合は、スキップして次の処理に入る（その後PROCESSED（処理完了）として処理完結する）。その後二つ目のチェックに入って登録コードだと以下targetの処理に続くための処理
      continue;
    }

    try {
      const target =
        await consumeClubLineRegistrationTokenAndUpsertTarget(//有効な登録コードを一度だけ消費し、同じtransactionで通知先を無効で登録する。既存グループの再登録時は名前・roleを保持し、必ず無効へ戻す。管理画面でオーナーが通知を有効化できるようにするための『下準備（データの保存と取得）』を行う
          {
            clubId:
              setting.clubId,
            lineSettingId:
              setting.id,
            tokenHash:
              hashToken(//生トークンをSHA-256でハッシュ化する。
                registrationCode,
              ),
            lineGroupId:
              message.groupId,
            now,
          },
        );

      if (target) {//成功した場合、登録コードの箱を成功とする
        registrationSucceeded =
          true;
      }
    } catch {
      /*
       * 一時的なDB障害では503を返し、
       * LINE側の再送で回復できるようにする。
       * token消費は条件付きtransactionなので再送しても冪等。
       */
      return {
        status: 503,
        outcome:
          "SERVICE_UNAVAILABLE",//サービス利用不可(設定行はあるけれど、Bot IDやシークレットが空っぽで動かせない)
      };
    }
  }

  return registrationSucceeded
    ? {
        status: 200,
        outcome:
          "REGISTRATION_SUCCEEDED",//登録完了
      }
    : {
        status: 200,
        outcome: "PROCESSED",//処理完了
      };
}
