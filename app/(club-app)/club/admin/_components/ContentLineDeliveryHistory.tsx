// app/(club-app)/club/admin/_components/ContentLineDeliveryHistory.tsx
// お知らせ・イベント共通LINE送信履歴

import {
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
} from "@/domain/shared/date-time/club-date-time";

import {
  createRequestId,//リクエストID作成関数
} from "@/domain/shared/request-id";

import type {
  LineDeliveryStatus,//"PENDING" | "PROCESSING" | "SENT" | "FAILED"
} from "@/types/prisma";


//LINEの送信（配信）に失敗した際、安全に再送処理（リトライ）を実行するための関数のルール（型定義）
type RetryLineDeliveryAction = (
  clubSlug: string,
  contentId: string,
  failedDeliveryId: string,//失敗した際のID
  expectedRequestId: string,//リクエストIDが一致しない場合、再送を拒否するためのリクエストID
  formData: FormData,
) => Promise<never>;

type ContentLineDeliveryHistoryProps = {
  headingId: string;//見出しのID
  clubSlug: string;
  contentId: string;
  timeZone: string;
  retryAction:
    RetryLineDeliveryAction;
  deliveries://送信履歴の配列
    readonly {
      id: string;
      status:
        LineDeliveryStatus;
      targetNameSnapshot:
        string | null;
      requestedAt: Date;
      sentAt: Date | null;
      errorDetail: string | null;
    }[];
};

//送信ステータスを日本語に変換する関数
function getStatusLabel(
  status: LineDeliveryStatus,
): string {
  switch (status) {
    case "PENDING":
      return "送信待ち";
    case "PROCESSING":
      return "送信中";
    case "SENT":
      return "送信済み";
    case "FAILED":
      return "送信失敗";
  }
}

// お知らせ・イベント共通LINE送信履歴
export function ContentLineDeliveryHistory({
  headingId,//見出しのID
  clubSlug,
  contentId,
  timeZone,
  retryAction,
  deliveries,
}: ContentLineDeliveryHistoryProps) {
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-neutral-200 p-5"
    >
      <h2
        id={headingId}
        className="font-bold text-neutral-900"
      >
        LINE送信履歴
      </h2>

      {deliveries.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-600">
          LINE送信履歴はありません。
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {deliveries.map(
            (delivery) => {
              const retryRequestId =
                delivery.status ===
                "FAILED"
                  ? createRequestId()
                  : null;

              const boundRetryAction =//失敗の場合、再処理を実行する関数に引数をバインドする
                retryRequestId
                  ? retryAction.bind(
                      null,
                      clubSlug,
                      contentId,
                      delivery.id,
                      retryRequestId,
                    )
                  : null;

              return (
                <li
                  key={delivery.id}
                  className="rounded-md border border-neutral-200 p-3"
                >
                  <p className="font-medium text-neutral-900">
                    {delivery.targetNameSnapshot ??
                      "LINE通知先"}
                  </p>

                  <p className="mt-1 text-sm text-neutral-700">
                    状態：
                    {getStatusLabel(
                      delivery.status,
                    )}
                  </p>

                  <p className="mt-1 text-sm text-neutral-700">
                    依頼日時：
                    {formatClubDateTime(
                      delivery.requestedAt,
                      timeZone,
                    )}
                  </p>

                  {delivery.sentAt ? (
                    <p className="mt-1 text-sm text-neutral-700">
                      送信日時：
                      {formatClubDateTime(
                        delivery.sentAt,
                        timeZone,
                      )}
                    </p>
                  ) : null}

                  {delivery.status ===
                  "FAILED" ? (
                    <>
                      <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm text-red-700">
                        {delivery.errorDetail ??
                          "LINE通知に失敗しました。"}
                      </p>

                      {boundRetryAction &&
                      retryRequestId ? (
                        <form
                          action={
                            boundRetryAction
                          }
                          className="mt-3"
                        >
                          <input
                            type="hidden"
                            name="requestId"
                            value={
                              retryRequestId
                            }
                          />

                          <button
                            type="submit"
                            className="rounded-md border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                          >
                            再送する
                          </button>
                        </form>
                      ) : null}
                    </>
                  ) : null}
                </li>
              );
            },
          )}
        </ul>
      )}
    </section>
  );
}