// src/application/club/line/send-pending-line-deliveries.ts
//DBのライン通知データの送信待ち（以前失敗したが再送信可能も含む）や５分の期限切れの送信中（遭難データ）を探して、
//DBを書き換えながら、ライン通知する関数

//と

//それらを自動で検知する関数も含む
//こう設定しておくことで、万が一お知らせ作成の瞬間にサーバーが重くてLINE送信に失敗したとしても、
// 1分後にこの関数がデータベースを見回して「あ、送信に失敗して止まってる（PENDING）データがあるぞ」
// 「あ、途中でサーバーが死んで遭難（PROCESSING）してるデータがあるぞ」と自動で検知し、
// 裏側で何事もなかったかのように再送（リトライ）を完結させてくれる。

import "server-only";

import {
  randomUUID,//独自のランダムなUUIDを自動作成する
} from "node:crypto";

import type {
  Prisma,//【追加】Prismaの検索条件などの型の名前空間
} from "@prisma/client";

import {
  LINE_DELIVERY_RESULT_UNKNOWN_DETAIL,//【追加】結果不明のFAILEDに保存する固定の説明文
  LINE_RETRY_KEY_VALID_MILLISECONDS,//【追加】retry keyが有効な期間（24時間）のミリ秒
  type LineDeliveryResultUnknownErrorCode,//【追加】結果不明のerrorCodeの型
} from "@/domain/club/line/line-delivery-result";

import {
  decryptLineCredential,//LINE資格情報を復号する。
} from "@/src/infrastructure/security/line-credential-crypto";

import {
  sendLinePushMessage,//アプリの通知についてLINE公式アカウント（Messaging API）を使って、
                      // 指定したLINEグループに直接メッセージを1通送信する
} from "@/src/infrastructure/line/line-messaging-api";

import {
  prisma,
} from "@/src/infrastructure/prisma/client";


//有効期限を５分とする
const CLAIM_LEASE_MILLISECONDS =
  5 * 60 * 1000;

/**
 * 【追加】1配信あたりの処理権の取得回数の上限（初回1回＋期限切れPROCESSINGの再claim最大2回）。
 * attemptCountは送信回数ではなく、処理権の取得回数を数える。
 */
const MAX_CLAIM_COUNT = 3; // 【追加】処理権の取得回数の上限値

/**
 * 【追加】3回目の処理も結果が記録されないまま期限切れになり、上限到達で終端化したFAILEDのerrorCode。
 * 「送信結果不明・上限到達」を表し、LINE_HTTP_*などの通常の失敗と区別する。
 */
export const LINE_DELIVERY_CLAIM_LIMIT_ERROR_CODE:
  LineDeliveryResultUnknownErrorCode =//【修正】結果不明のerrorCodeの型で検査する
  "LINE_RESULT_UNKNOWN_CLAIM_LIMIT"; // 【追加】送信結果不明・上限到達を表すerrorCode


/**
 * 【追加】配信ID（任意でclubId）を受け取り、claim可能なら原子的にPROCESSINGへ更新して配信を返す。
 * 処理権の取得がMAX_CLAIM_COUNT回に達した配信はclaimせずnullを返す。
 * 他workerが先にclaimした場合や対象外の状態の場合もnullを返す。
 */
   //データベースにあるLINE配信データを、他の処理と衝突しないように安全に
 // 「送信中（PROCESSING）」として確定させる関数
async function claimDelivery(
  input: {
    deliveryId: string;
    clubId?: string;
  },
) {
  const now =//現在の時刻を取得
    new Date();

  const claimToken =//合言葉をランダムに生成
    randomUUID();

  const leaseExpiresAt =//今から５分後の時刻
    new Date(
      now.getTime() +
        CLAIM_LEASE_MILLISECONDS,
    );

  const retryKeyWindowStart =//【追加】retry keyが有効な最も古い依頼日時（現在から24時間前）
    new Date(//【追加】日時を作るコンストラクター
      now.getTime() -//【追加】時刻を数値にするメソッド
        LINE_RETRY_KEY_VALID_MILLISECONDS,
    );

 //データベースにあるLINE配信データを、他の処理と衝突しないように安全に
 // 「自分が送信担当（PROCESSING）」として確定させる処理
  const result =
    await prisma
      .clubLineDelivery
      .updateMany({
        //基本の絞り込み
        where: {
          id:
            input.deliveryId,//送信記録IDで絞り込む

          ...(input.clubId//クラブIDで絞り込む
            ? {
                clubId:
                  input.clubId,
              }
            : {}),

          attemptCount: {//【追加】処理権の取得回数が上限未満のものだけ（並列でも同じ更新文で判定される）
            lt: MAX_CLAIM_COUNT,
          },

        //状態の絞り込み
        //送信待ち（PENDING） であり、かつ「送信予定時刻がない（null）」、または「送信予定時刻が今を過ぎている状態）
        //送信中（PROCESSING） ではあるけれど、「5分の有効期限が切れて放置されている（遭難データ）」状態
          OR: [
            {
              status:
                "PENDING",//まだ誰も手を付けていない「送信待ち」状態かつ

              OR: [
                {
                  nextAttemptAt:
                    null,
                },
                {
                  nextAttemptAt: {//送信待ちでかつ再送信時間が今を過ぎているもの（再送信可能なもの）
                    lte: now,
                  },
                },
              ],
            },
            {
              status:
                "PROCESSING",//送信中ではあるけど、

              leaseExpiresAt: {//エラーにより５分の有効期限が切れて放置されている状態（遭難データ）
                lte: now,
              },

              requestedAt: {//【追加】同じretry keyで再送できる期間内のものだけ（有効期間は最初の送信から24時間）
                gte: retryKeyWindowStart,
              },
            },
          ],
        },

        //取得したデータを送信中に変更して保存する
        data: {//送信中に変更する
          status:
            "PROCESSING",

          claimedAt: now,
          claimToken,//ランダムな合言葉を添える
          leaseExpiresAt,

          lastAttemptAt:
            now,

          attemptCount: {
            increment: 1,
          },

          errorCode: null,
          errorDetail: null,
        },
      });

  if (
    result.count !== 1
  ) {
    return null;
  }

  //保存したデータの情報をとってくる
  return prisma
    .clubLineDelivery
    .findFirst({
      where: {
        id:
          input.deliveryId,

        claimToken,
        status:
          "PROCESSING",//送信中のデータ
      },

      select: {
        id: true,
        clubId: true,
        claimToken: true,

        messageSnapshot: true,//LINEに送るメッセージ本文（お知らせのタイトルやURLが入った文章）

        target: {
          select: {
            lineGroupId: true,
            isEnabled: true,//有効かどうか

            lineSetting: {
              select: {
                lineChannelAccessTokenEncrypted://暗号化されたアクセストークン
                  true,
              },
            },
          },
        },
      },
    });
}

/**
 * 【追加】配信IDとclaimTokenと送信結果を受け取り、claimが一致するPROCESSINGの行だけをSENTまたはFAILEDへ更新する。
 * claimTokenが一致しない旧workerの結果は反映しない。
 */
//送信処理の最終的な結果（成功か失敗か）をデータベースに保存する関数
async function finishDelivery(
  input: {
    deliveryId: string;
    claimToken: string;//ランダムな合言葉を添える

    result:
      | {
          success: true;
        }
      | {
          success: false;
          errorCode: string;
          errorDetail: string;
        };
  },
): Promise<void> {
  const now =
    new Date();

  await prisma
    .clubLineDelivery
    .updateMany({
      where: {
        id:
          input.deliveryId,

        claimToken:
          input.claimToken,

        status:
          "PROCESSING",
      },

      data: input.result.success
        ? {
            status: "SENT",
            sentAt: now,

            claimedAt: null,
            claimToken: null,
            leaseExpiresAt:
              null,

            nextAttemptAt:
              null,

            errorCode: null,
            errorDetail: null,
          }
        : {
            status: "FAILED",
            sentAt: null,

            claimedAt: null,
            claimToken: null,
            leaseExpiresAt:
              null,

            /*
             * FAILEDは自動再送しない。
             * 管理者の明示的操作で
             * 新しいDeliveryを作る。
             */
            nextAttemptAt:
              null,

            errorCode:
              input.result
                .errorCode,

            errorDetail:
              input.result
                .errorDetail,
          },
    });
}
/**
 * 【追加】配信ID（任意でclubId）を受け取り、claimからLINE送信、結果のDB保存までを1配信分行う。
 * claimできなかった場合は何もしない。戻り値はない。
 */
//送信待ち→送信中への変更から、ライン通知送信までの一連の流れのメイン関数
async function processDelivery(
  input: {
    deliveryId: string;
    clubId?: string;
  },
): Promise<void> {
  const delivery =
    await claimDelivery(//データベースにあるLINE配信データを、他の処理と衝突しないように安全に「送信中（PROCESSING）」として確定させる関数
      input,
    );

  if (//他のサーバーが送信中にした場合などは空を返す
    !delivery ||
    !delivery.claimToken
  ) {
    return;
  }

  if (//通知先が無効になってないかの確認
    !delivery.target
      .isEnabled
  ) {
    await finishDelivery({//もし無効なら送信処理の失敗をデータベースに保存する
      deliveryId:
        delivery.id,

      claimToken:
        delivery.claimToken,

      result: {
        success: false,

        errorCode:
          "LINE_TARGET_DISABLED",

        errorDetail:
          "LINE通知先が無効になっています。",
      },
    });

    return;
  }

  const encryptedToken =//暗号化されたパスワードと送信予定のメッセージを取得
    delivery.target
      .lineSetting
      .lineChannelAccessTokenEncrypted;

  if (//暗号化されたパスワードと送信予定のメッセージを取得がなければ失敗としてDBに保存する
    !encryptedToken ||
    !delivery.messageSnapshot
  ) {
    await finishDelivery({
      deliveryId:
        delivery.id,

      claimToken:
        delivery.claimToken,

      result: {
        success: false,

        errorCode:
          "LINE_SETTING_INCOMPLETE",

        errorDetail:
          "LINE通知設定が完了していません。",
      },
    });

    return;
  }

  let accessToken: string;//パスワードを入れるための変数を用意する

  try {
    accessToken =
      decryptLineCredential({//decryptLineCredential（LINEの認証情報を解読する関数）を使って、LINEのサーバーに送れる「本物の生のパスワード（accessToken）」に翻訳（復号）する
        clubId:
          delivery.clubId,

        credentialType:
          "CHANNEL_ACCESS_TOKEN",

        encryptedValue:
          encryptedToken,//暗号化されたパスワード
      });
  } catch {
    await finishDelivery({//もし失敗したら失敗としてDBに保存する
      deliveryId:
        delivery.id,

      claimToken:
        delivery.claimToken,

      result: {
        success: false,

        errorCode:
          "LINE_CREDENTIAL_ERROR",

        errorDetail:
          "LINE通知設定を読み取れませんでした。",
      },
    });

    return;
  }

  //ライン公式アカウントを使ってライン通知を行なって、その結果を成功か失敗としてDBに保存する処理
  const result =
    await sendLinePushMessage({//アプリの通知についてLINE公式アカウント（Messaging API）を使って、
                               // 指定したLINEグループに直接メッセージを1通送信する
      channelAccessToken:
        accessToken,

      lineGroupId:
        delivery.target
          .lineGroupId,

      message:
        delivery.messageSnapshot,

      /*
       * Delivery.idはPrismaのUUID。
       */
      retryKey:
        delivery.id,
    });

  await finishDelivery({
    deliveryId:
      delivery.id,

    claimToken:
      delivery.claimToken,

    result,
  });
}

/**
 * 【追加】認可済みclubIdと配信ID一覧を受け取り、重複を除いて順にprocessDeliveryで処理する。
 */
//溜まっている送信待ち（以前失敗したが再送信可能も含む）や５分の期限切れの送信中（遭難データ）チケットを
//上から順に実送信処理（processDelivery）へ流し込む」という最終的な実行ボタン
export async function sendPendingLineDeliveries(
  input: {
    clubId: string;
    deliveryIds:
      readonly string[];
  },
): Promise<void> {
  for (
    const deliveryId
    of new Set(
      input.deliveryIds,
    )
  ) {
    await processDelivery({//送信待ち→送信中への変更から、ライン通知送信までの一連の流れのメイン関数
      clubId: input.clubId,
      deliveryId,
    });
  }
}

/**
 * 【追加】結果が記録されないまま期限切れになったPROCESSINGのうち、これ以上送信できないものを、
 * FAILED（送信結果不明）へ終端化する。自動再送はしない。
 * ・処理権の取得が上限（MAX_CLAIM_COUNT）に達した配信は、4回目の送信をしない。
 * ・retry keyの有効期間（24時間）を過ぎた配信は、同じkeyで再送できないため送信しない。
 * 再claimの条件（取得回数が上限未満・有効期間内）とは重ならないため、並列のclaimと競合しない。
 */
async function terminateUnresendableDeliveries(): Promise<void> {
  const now =//【追加】現在の時刻を取得
    new Date();//【追加】日時を作るコンストラクター

  const retryKeyWindowStart =//【追加】retry keyが有効な最も古い依頼日時
    new Date(//【追加】日時を作るコンストラクター
      now.getTime() -//【追加】時刻を数値にするメソッド
        LINE_RETRY_KEY_VALID_MILLISECONDS,
    );

  /*
   * 先に取得回数の上限到達を終端化し、
   * 次にretry keyの有効期間切れを終端化する。
   */
  const targets: readonly {//【追加】終端化の条件とerrorCodeの組の型
    where: Prisma.ClubLineDeliveryWhereInput;//【追加】Prismaの検索条件の型
    errorCode: LineDeliveryResultUnknownErrorCode;//【追加】結果不明のerrorCodeの型
  }[] = [
    {
      where: {
        attemptCount: {//【追加】処理権の取得が上限に達している
          gte: MAX_CLAIM_COUNT,
        },
      },

      errorCode:
        LINE_DELIVERY_CLAIM_LIMIT_ERROR_CODE,
    },
    {
      where: {
        requestedAt: {//【追加】retry keyの有効期間を過ぎている
          lt: retryKeyWindowStart,
        },
      },

      errorCode:
        "LINE_RESULT_UNKNOWN_RETRY_KEY_EXPIRED",
    },
  ];

  for (const target of targets) {
    await prisma//【追加】DBクライアント
      .clubLineDelivery
      .updateMany({//【追加】条件に合う複数行をまとめて更新するメソッド
        where: {
          ...target.where,

          status:
            "PROCESSING",//【追加】結果が記録されないままの送信中

          leaseExpiresAt: {//【追加】期限切れ
            lte: now,
          },
        },

        data: {
          status: "FAILED",//【追加】既存のFAILEDへ終端化（自動再送しない）
          sentAt: null,

          claimedAt: null,
          claimToken: null,
          leaseExpiresAt:
            null,

          nextAttemptAt:
            null,

          errorCode:
            target.errorCode,

          errorDetail:
            LINE_DELIVERY_RESULT_UNKNOWN_DETAIL,
        },
      });
  }
}

/**
 * 【追加】再送できない配信を終端化したうえで、claim可能な配信をlimit件まで順にprocessDeliveryで処理する。
 * limitは1回の取得件数の上限で、同一配信の再claim回数の上限とは別である。
 */
//システム全体を見回して、今すぐ送信可能な状態（あるいは遭難状態）になっているLINE配信データを
//DBから自動で掘り出して、まとめて一括送信する『自動巡回（バッチ処理・定期実行）用の送信エンジン
export async function sendClaimableLineDeliveries(
  input: {
    limit: number;
  },
): Promise<void> {
  await terminateUnresendableDeliveries();//【追加】送信できない期限切れPROCESSINGを先に終端化する関数

  const now =
    new Date();

  const deliveries =
    await prisma
      .clubLineDelivery
      .findMany({
        where: {//自動検索する
          attemptCount: {//【追加】上限に達した配信は取得対象にしない（limitの枠を使わない）
            lt: MAX_CLAIM_COUNT,
          },

          OR: [
            {
              status:
                "PENDING",//送信待ちでかつ再送信時間が今を過ぎているもの（再送信可能なもの）

              OR: [
                {
                  nextAttemptAt://再送信時間がない
                    null,
                },
                {
                  nextAttemptAt: {//再送信時間が今を過ぎている
                    lte: now,
                  },
                },
              ],
            },
            {
              status:
                "PROCESSING",//送信中だけど、エラーにより5分の期限が切れているもの（遭難データ）

              leaseExpiresAt: {
                lte: now,
              },

              requestedAt: {//【追加】retry keyの有効期間内のものだけ（claimの条件と同じ）
                gte:
                  new Date(//【追加】日時を作るコンストラクター
                    now.getTime() -//【追加】時刻を数値にするメソッド
                      LINE_RETRY_KEY_VALID_MILLISECONDS,
                  ),
              },
            },
          ],
        },

        orderBy: [
          {
            requestedAt:
              "asc",
          },
          {
            id: "asc",
          },
        ],

        take:
          input.limit,//一度に処理する最大件数(引数)

        select: {//IDだけ取得
          id: true,
        },
      });

  for (
    const delivery
    of deliveries
  ) {
    await processDelivery({//自動送信
      deliveryId:
        delivery.id,
    });
  }
}