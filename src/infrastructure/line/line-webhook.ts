// src/infrastructure/line/line-webhook.ts
// LINE Webhookの署名検証と受信した中身の解析して適切な情報のみを取得する関数

//※webhookの流れ
//①ライン公式アカウントがライングループ内に投稿された登録コードを検知
//②LINEのサーバーは、「LINE Developers」に登録しておいたサーバーの住所（Webhook URL）に向けて、データ本体（ペイロード）をインターネット経由で送る
//③開発者のサーバーが検知して検証にうつる

import "server-only";

import {
  createHmac,//秘密の合言葉（鍵）を使って、データ専用の『署名（Channel Secretを使って毎回新しく作られるスタンプ）』を作成する関数
  timingSafeEqual,//ハッカーのストップウォッチ（時間計測）による攻撃を完全に防ぐ、超厳重な比較関数
} from "node:crypto";

/**
 * LINE側のリクエストサイズ上限を超えないよう、
 * アプリでも2,000,000byteを超えるWebhook本文を処理しない。
 */
export const LINE_WEBHOOK_MAX_BODY_BYTES =
  2_000_000;

const SHA256_DIGEST_BYTES =//SHA-256でハッシュ化した時に必ず32バイトになるという定義
  32;

/*
 * HMAC-SHA256の32byteを標準Base64へ変換すると、
 * 43文字 + padding 1文字の44文字になる。
 */
//以下、LINE公式の仕様通りの正しい形（形式）で作られているか」をチェックして検証するためのパターン定義
const LINE_SIGNATURE_PATTERN =//LINEから届くWebhookのヘッダーに含まれる「デジタルハンコ（署名）」が正しい形か
  /^[A-Za-z0-9+/]{43}=$/;

const LINE_BOT_USER_ID_PATTERN =//ライン公式アカウントのユーザーIDのパターン
  /^U[0-9a-f]{32}$/;

const LINE_GROUP_ID_PATTERN =//ライングループIDのパターン
  /^C[0-9a-f]{32}$/;

  //公式ラインから送信されたwebhookで検知したテキストメッセージの型
export type LineWebhookGroupTextMessage = {
  groupId: string;
  text: string;
};

//ラインサーバーからwebhook URLに届いた膨大な情報から適切な情報を抜き出す関数
export type ParsedLineWebhookPayload = {
  destination: string;//公式アカウントのユーザーID
  eventCount: number;//何件の出来事が含まれてるのか
  groupTextMessages:
    LineWebhookGroupTextMessage[];
};

//ラインサーバーからwebhookURLに届いた情報の中身を抜き出した際のエラー一覧
export type LineWebhookPayloadParseErrorCode =
  | "PAYLOAD_TOO_LARGE"//中身が大きすぎる
  | "INVALID_JSON"//データの形式（JSON）が不正である
  | "INVALID_PAYLOAD";//中身の項目が不正である

  //ラインサーバーからwebhookURLに届いた情報の中身を抜き出した結果
export type ParseLineWebhookPayloadResult =
  | {
      success: true;
      data:
        ParsedLineWebhookPayload;
    }
  | {
      success: false;
      error:
        LineWebhookPayloadParseErrorCode;
    };

    //純粋なオブジェクト（データが詰まった箱）の型
type UnknownRecord =
  Record<string, unknown>;

  //純粋なオブジェクト（データが詰まった箱）に厳選するための関数（trueかfalseか）
function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&//オブジェクト（データが詰まった箱）であり
    value !== null &&//nullではない
    !Array.isArray(value)//配列ではない
  );
}

//2,000,000byte以内のWebhook本文を通過させる関数（trueかfalse）
function isBodyWithinLimit(
  rawBody: string,
): boolean {
  return (
    Buffer.byteLength(
      rawBody,
      "utf8",
    ) <=
    LINE_WEBHOOK_MAX_BODY_BYTES
  );
}

//署名（Channel Secretを使って毎回新しく作られるスタンプ）を
//プログラムが計算できるBuffer形式に変換する関数
function decodeLineSignature(
  signature: string,//署名（Base64の形式で暗号化されてるもの）（Channel Secretを使って毎回新しく作られるスタンプ）
): Buffer | null {
  if (
    !LINE_SIGNATURE_PATTERN.test(//LINEから届くWebhookのヘッダーに含まれる署名が正しい形か
      signature,
    )
  ) {
    return null;
  }

  //署名(Base64形式)をプログラムが計算できるBuffer形式に変換する
  const decoded =
    Buffer.from(
      signature,
      "base64",
    );

  if (
    decoded.length !==
      SHA256_DIGEST_BYTES ||//本当に32バイトの正しい長さを持っているか
    decoded.toString("base64") !==//変換する前後でデータが改ざんされてないか
      signature
  ) {
    return null;
  }

  return decoded;
}

/**
 * 受信したraw bodyを変更せず、Channel Secretを鍵とした
 * HMAC-SHA256でx-line-signatureを検証する。
 */
export function verifyLineWebhookSignature(
  input: {
    rawBody: string;//Webhook本文（LINEが送ってきた一言一句そのまんまの姿）
    signature: string;//署名（Channel Secretを使って毎回新しく作られるスタンプ）
    channelSecret: string;//秘密の鍵
  },
): boolean {
  if (
    input.channelSecret.length ===//秘密の鍵が何もない
      0 ||
    !isBodyWithinLimit(//2,000,000byte以内のWebhook本文を通過させる関数（trueかfalse）
      input.rawBody,//Webhook本文（LINEが送ってきた一言一句そのまんまの姿）
    )
  ) {
    return false;
  }

  //ラインから届いたデータのヘッダーにあった署名をBuffer形式にする
  const actualSignature =
    decodeLineSignature(//署名（Channel Secretを使って毎回新しく作られるスタンプ）をプログラムが計算できるBuffer形式に変換する関数
      input.signature,
    );

  if (!actualSignature) {
    return false;
  }

  //LINEから届いた署名及びwebhook本文（LINEが送ってきた一言一句そのまんまの姿）（署名を作成するときにwebhook本文が正しくないと合わないため）が本物かどうかを確かめるために、
  // サーバー側で署名を計算してBuffer形式へ新しく作り出している処理
  const expectedSignature =
    createHmac(//秘密の合言葉（鍵）を使って、データ専用の『署名（Channel Secretを使って毎回新しく作られるスタンプ）』を作成する関数
      "sha256",
      input.channelSecret,//チャンネルシークレットと安全な暗号ルール（SHA-256）を使って計算する準備をする
    )
      .update(
        input.rawBody,//Webhook本文（LINEが送ってきた一言一句そのまんまの姿）を世界共通の文字コード（"utf8"）を使ってcreateHmacに読み込ませる準備をする
        "utf8",
      )
      .digest();//出力する

      //署名が正しいか（同じ秘密の鍵を使って作られたものか）を検証する
  if (
    actualSignature.length !==//ラインから届いたデータのヘッダーにあった署名をBuffer形式にしたもの
    expectedSignature.length//サーバーがわで署名が本物かを確認するために作成した署名
  ) {
    return false;
  }

  //署名が正しいかを比較する（1文字目が違っていようが、全部合っていようが、絶対に毎回、すべての文字を最後まで生真面目にチェックして、常に同じ時間をかけてから返事をする）
  return timingSafeEqual(//ハッカーのストップウォッチ（時間計測）による攻撃を完全に防ぐ、超厳重な比較関数
    actualSignature,//ラインから届いたデータのヘッダーにあった署名をBuffer形式にしたもの
    expectedSignature,//サーバーがわで署名が本物かを確認するために作成した署名
  );
}

//ラインから送ってきたテキストメッセージ（groupIdとtext）が
// 純粋なオブジェクトで文字列でタイプが適切でパターンが適切かを検証する関数
function buildGroupTextMessage(
  event: UnknownRecord,//純粋なオブジェクト（データが詰まった箱）の型
): LineWebhookGroupTextMessage | null { //公式ラインから送信されたwebhookで検知したテキストメッセージの型(groupIdとtext)かnull
  if (
    event.type !==
    "message"
  ) {
    return null;
  }

  const source =
    event.source;

  const message =
    event.message;

  if (
    !isRecord(source) ||//純粋なオブジェクト（データが詰まった箱）に厳選するための関数（trueかfalseか）
    source.type !== "group" ||
    typeof source.groupId !==
      "string" ||
    !LINE_GROUP_ID_PATTERN.test(
      source.groupId,
    ) ||
    !isRecord(message) ||//純粋なオブジェクト（データが詰まった箱）に厳選するための関数（trueかfalseか）
    message.type !== "text" ||
    typeof message.text !==
      "string"
  ) {
    return null;
  }

  return {
    groupId:
      source.groupId,

    /*
     * 登録コードは完全一致で判定するため、
     * trimや改行除去を行わず受信値をそのまま返す。
     */
    text:
      message.text,
  };
}


//webhook本文（LINEが送ってきた一言一句そのまんまの姿）から、検証後に、destination（公式アカウントのユーザーID）、
// eventCount（何件の出来事が含まれてるのか）、groupTextMessages（テキストメッセージ：groupIdとtext）を安全に抜き出す関数
export function parseLineWebhookPayload(
  rawBody: string,
): ParseLineWebhookPayloadResult {//ラインサーバーからwebhookURLに届いた情報の中身を抜き出した結果の型
  if (
    !isBodyWithinLimit(//2,000,000byte以内のWebhook本文を通過させる関数（trueかfalse）
      rawBody,
    )
  ) {
    return {
      success: false,
      error:
        "PAYLOAD_TOO_LARGE",
    };
  }

  let parsed: unknown;

  //webhook本文（LINEが送ってきた一言一句そのまんまの姿）が正しいJSON形式の文字列かどうかを検証
  try {
    parsed =
      JSON.parse(rawBody) as
        unknown;//JSON.parseの結果がどんな型かわからないからunknownをつける
  } catch {
    return {
      success: false,
      error: "INVALID_JSON",//データの形式（JSON）が不正である
    };
  }

  if (
    !isRecord(parsed) ||//純粋なオブジェクト（データが詰まった箱）に厳選するための関数（trueかfalseか）
    typeof parsed.destination !==
      "string" ||
    !LINE_BOT_USER_ID_PATTERN.test(
      parsed.destination,
    ) ||
    !Array.isArray(//配列ではない
      parsed.events,
    ) ||
    !parsed.events.every(//中身がオブジェクトになっていない
      isRecord,
    )
  ) {
    return {
      success: false,
      error:
        "INVALID_PAYLOAD",//中身が不正
    };
  }

  //正しいテキストメッセージ（groupIdとtext）だけを検証済みwebhook本文（LINEが送ってきた一言一句そのまんまの姿）から
  //抜き出して、新しい1つのリスト（配列）にまとめる処理
  const groupTextMessages =
    parsed.events.flatMap(
      (event) => {
        const message =
          buildGroupTextMessage(//ラインから送ってきたテキストメッセージ（groupIdとtext）が純粋なオブジェクトで文字列でタイプが適切でパターンが適切かを検証する関数
            event,
          );

        return message
          ? [message]
          : [];
      },
    );

  return {
    success: true,
    data: {
      destination:
        parsed.destination,
      eventCount:
        parsed.events.length,
      groupTextMessages,
    },
  };
}
