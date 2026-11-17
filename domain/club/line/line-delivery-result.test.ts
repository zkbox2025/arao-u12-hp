// domain/club/line/line-delivery-result.test.ts
// LINE配信の「送信結果不明」の判定関数と、時間の定数を確認する。

import {
  describe, // テスト群を定義する関数
  expect, // 期待値を検証する関数
  it, // テストケースを定義する関数
} from "vitest";

import {
  getLineRetryKeyResendWindowStart, // 【追加】再送してよい最も古い依頼日時を返す関数
  isLineDeliveryResultUnknown, // errorCodeが送信結果不明のものか判定する関数
  LINE_DELIVERY_RESULT_UNKNOWN_ERROR_CODES, // 送信結果不明を表すerrorCodeの一覧
  LINE_DELIVERY_RESULT_UNKNOWN_DETAIL, // 送信結果不明のFAILEDに保存する固定の説明文
  LINE_RETRY_KEY_SAFETY_MARGIN_MILLISECONDS, // 【追加】再送期限の安全余裕（10分）のミリ秒
  LINE_RETRY_KEY_VALID_MILLISECONDS, // retry keyが有効な期間（24時間）のミリ秒
} from "@/domain/club/line/line-delivery-result";

/**
 * 結果不明の判定と、時間の定数の契約を確認するテスト群。
 */
describe("LINE配信の送信結果不明", () => { // テスト群を定義する関数
  /**
   * retry keyの有効期間（24時間）と、結果不明の説明文が、決定した方針と一致することを確認する。
   */
  it("retry keyの有効期間は24時間で数え、説明文は固定である", () => { // テストケースを定義する関数
    expect(LINE_RETRY_KEY_VALID_MILLISECONDS).toBe(24 * 60 * 60 * 1000); // 期待値を検証する関数 / 数値の比較メソッド
    expect(LINE_DELIVERY_RESULT_UNKNOWN_DETAIL).toBe("LINEへの送信結果を確認できませんでした。"); // 期待値を検証する関数 / 文字列の比較メソッド
  });

  /**
   * 【修正】結果不明の4つのerrorCode（通信エラーを含む）だけが、結果不明と判定されることを確認する。
   */
  it.each(LINE_DELIVERY_RESULT_UNKNOWN_ERROR_CODES)( // 一覧の各値でケースを定義するメソッド
    "%s は結果不明と判定する",
    /**
     * 一覧のerrorCodeがtrueになることを確認する。
     */
    (code) => { // errorCodeを受け取る検証コールバック
      expect(isLineDeliveryResultUnknown(code)).toBe(true); // 期待値を検証する関数 / 結果不明の判定関数 / 真偽値の比較メソッド
    },
  );

  /**
   * 通常の失敗やnullを、結果不明と誤判定しないことを確認する。
   */
  it.each([
    "LINE_HTTP_400",
    "LINE_HTTP_500",
    "LINE_TARGET_DISABLED",
    "LINE_SETTING_INCOMPLETE",
    "LINE_CREDENTIAL_ERROR",
    "",
    null,
    undefined,
  ])( // 通常の失敗の値ごとにケースを定義するメソッド
    "%s は結果不明と判定しない（通常の再送操作の対象）",
    /**
     * 通常の失敗とnullがfalseになることを確認する。
     */
    (code) => { // errorCodeを受け取る検証コールバック
      expect(isLineDeliveryResultUnknown(code)).toBe(false); // 期待値を検証する関数 / 結果不明の判定関数 / 真偽値の比較メソッド
    },
  );

  /**
   * 【追加】結果不明のerrorCodeが、通信エラーを含む4種であることを確認する。
   */
  it("結果不明は、タイムアウト・通信エラー・上限到達・再送期限切れの4種である", () => { // テストケースを定義する関数
    expect([...LINE_DELIVERY_RESULT_UNKNOWN_ERROR_CODES].sort()).toEqual([ // 期待値を検証する関数 / 配列の複製とソートのメソッド / 配列の比較メソッド
      "LINE_NETWORK_ERROR",
      "LINE_RESULT_UNKNOWN_CLAIM_LIMIT",
      "LINE_RESULT_UNKNOWN_RETRY_KEY_EXPIRED",
      "LINE_RESULT_UNKNOWN_TIMEOUT",
    ]);
  });

  /**
   * 【追加】再送してよい最も古い依頼日時が、24時間から安全余裕（10分）を引いた時点であることを確認する。
   */
  it("再送期限は、24時間から10分を引いた時点より新しい依頼日時までである", () => { // テストケースを定義する関数
    const now = new Date("2026-11-10T12:00:00.000Z"); // 判定時点の日時のコンストラクター
    const start = getLineRetryKeyResendWindowStart(now); // 再送してよい最も古い依頼日時を返す関数

    expect(LINE_RETRY_KEY_SAFETY_MARGIN_MILLISECONDS).toBe(10 * 60 * 1000); // 期待値を検証する関数 / 数値の比較メソッド
    expect(start.toISOString()).toBe("2026-11-09T12:10:00.000Z"); // 期待値を検証する関数 / 日時の文字列化メソッド / 文字列の比較メソッド
    expect(now.getTime() - start.getTime()).toBe( // 期待値を検証する関数 / 時刻を数値にするメソッド / 数値の比較メソッド
      LINE_RETRY_KEY_VALID_MILLISECONDS -
        LINE_RETRY_KEY_SAFETY_MARGIN_MILLISECONDS,
    );
    expect(now.getTime() - start.getTime()).toBeLessThan( // 期待値を検証する関数 / 数値の大小比較メソッド
      LINE_RETRY_KEY_VALID_MILLISECONDS, // 公式の有効期間より短く数える（安全側）
    );
  });
});
