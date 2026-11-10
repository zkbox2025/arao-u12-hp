// tests/line-delivery-retry-repository.test.ts
// お知らせ・イベントの再送対象の取得が、送信結果不明のFAILEDを対象から外す条件を持つことを確認する。

import {
  beforeEach, // 各ケースの前処理を登録する関数
  describe, // テスト群を定義する関数
  expect, // 期待値を検証する関数
  it, // テストケースを定義する関数
  vi, // モック・スパイを扱う関数群
} from "vitest";

import {
  LINE_DELIVERY_RESULT_UNKNOWN_ERROR_CODES, // 送信結果不明を表すerrorCodeの一覧
} from "@/domain/club/line/line-delivery-result";
import {
  findFailedClubEventLineDeliveryForRetry, // イベントのLINE再送対象の失敗済み配信を取得する関数
} from "@/src/infrastructure/prisma/repositories/club-event-repository";
import {
  findFailedClubNoticeLineDeliveryForRetry, // お知らせのLINE再送対象の失敗済み配信を取得する関数
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";

/**
 * 共有のPrisma clientを置き換えるための、1件取得のモック関数。
 */
const prismaMock = vi.hoisted( // importより前にモックを用意する関数
  /**
   * 検索条件を記録するだけのモック関数を作る。
   */
  () => ({ // モックを返すコールバック
    findFirst: vi.fn(), // 1件取得の呼び出しを記録するモック関数
  }),
);

vi.mock("@/src/infrastructure/prisma/client", // 共有のPrisma clientを置き換える関数
  /**
   * DBへ接続せず、検索条件の記録だけを行うclientを返す。
   */
  () => ({ // モックを返すコールバック
    prisma: {
      clubLineDelivery: {
        findFirst: prismaMock.findFirst,
      },
    },
  }),
);

/**
 * 再送対象の検索条件を確認するテスト群。DBには接続しない。
 */
describe.each([
  {
    name: "お知らせ",
    contentType: "NOTICE",
    find: findFailedClubNoticeLineDeliveryForRetry,
  },
  {
    name: "イベント",
    contentType: "EVENT",
    find: findFailedClubEventLineDeliveryForRetry,
  },
] as const)("$nameのLINE再送対象の取得", ({ contentType, find }) => { // 種類ごとにテスト群を定義するメソッド / リテラル型アサーション
  beforeEach(
    /**
     * 記録を消し、検索結果なしを返す設定にする。
     */
    () => { // 前処理のコールバック
      prismaMock.findFirst.mockReset(); // モックの記録と設定を消すメソッド
      prismaMock.findFirst.mockResolvedValue(null); // 検索結果なしを返すメソッド
    },
  );

  /**
   * クラブ・配信ID・FAILEDに加え、結果不明のerrorCodeを除く条件が入ることを確認する。
   */
  it("クラブ・配信ID・FAILEDに絞り、結果不明のerrorCodeは対象から外す", async () => { // テストケースを定義する関数 / 非同期コールバック
    await find({ // 再送対象の取得関数
      clubId: "club-a",
      deliveryId: "delivery-a",
    });

    expect(prismaMock.findFirst).toHaveBeenCalledOnce(); // 期待値を検証する関数 / 呼び出し1回の検証メソッド
    const where = prismaMock.findFirst.mock.calls[0][0].where; // 記録した検索条件を取り出す
    expect(where).toMatchObject({ // 期待値を検証する関数 / 部分一致の比較メソッド
      id: "delivery-a",
      clubId: "club-a",
      contentType,
      status: "FAILED",
    });
    expect(where.OR).toEqual([ // 期待値を検証する関数 / 条件の比較メソッド
      { errorCode: null }, // errorCodeがないFAILEDは対象に残す
      {
        errorCode: {
          notIn: [...LINE_DELIVERY_RESULT_UNKNOWN_ERROR_CODES], // 結果不明のerrorCodeを除く
        },
      },
    ]);
  });
});
