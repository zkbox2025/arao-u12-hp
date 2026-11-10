// domain/club/line/line-delivery-result.test.ts
// LINE配信の「送信結果不明」の判定関数と、時間の定数を確認する。

import {
  describe, // テスト群を定義する関数
  expect, // 期待値を検証する関数
  it, // テストケースを定義する関数
} from "vitest";

import {
  isLineDeliveryResultUnknown, // errorCodeが送信結果不明のものか判定する関数
  LINE_DELIVERY_RESULT_UNKNOWN_ERROR_CODES, // 送信結果不明を表すerrorCodeの一覧
  LINE_DELIVERY_RESULT_UNKNOWN_DETAIL, // 送信結果不明のFAILEDに保存する固定の説明文
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
   * 結果不明の3つのerrorCodeだけが、結果不明と判定されることを確認する。
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
    "LINE_NETWORK_ERROR",
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
});
