// src/application/club/line/schedule-line-delivery-worker.ts
//アクション完了後にライン通知の送信待ちや再送信可能な送信中のデータを通知実行するお掃除ワーカー

import "server-only";

import {
  after,
} from "next/server";

import {
  sendPendingLineDeliveries,//溜まっている送信待ち（以前失敗したが再送信可能も含む）や５分の期限切れの送信中（遭難データ）チケットを、
                            // 上から順に実送信処理（processDelivery）へ流し込む」という最終的な実行ボタン
} from "./send-pending-line-deliveries";


//アクション完了後に送信待ちや再送信可能な送信中を実行するワーカー
export function scheduleLineDeliveryWorker(
  input: {
    clubId: string;
    deliveryIds:
      readonly string[];
  },
): void {
  if (
    input.deliveryIds
      .length === 0
  ) {
    return;
  }

  /*
   * レスポンス後に早期処理する。
   * 失敗・プロセス終了時もPENDINGはDBに残り、
   * Cronが後から回収する。
   */
  after(async () => {
    try {
      await sendPendingLineDeliveries(//溜まっている送信待ち（以前失敗したが再送信可能も含む）や５分の期限切れの送信中（遭難データ）チケットを、
                            // 上から順に実送信処理（processDelivery）へ流し込む」という最終的な実行ボタン
                           
        input,
      );
    } catch (error) {//エラーなら以下を処理する
      console.error(
        "line_delivery_worker_failed",
        {
          clubId:
            input.clubId,

          deliveryCount:
            input.deliveryIds
              .length,

          errorName:
            error instanceof Error
              ? error.name
              : "UnknownError",
        },
      );
    }
  });
}