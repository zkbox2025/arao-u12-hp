// domain/club/event/event-toast.test.ts
//// イベントのURLのトースト識別子を固定メッセージへ変換するテスト

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getClubEventToastMessage, // 【追加】単一の既知コードを固定文言へ変換する関数
} from "./event-toast";

describe( // 【追加】関連するtoast試験をまとめる関数
  "getClubEventToastMessage",
  /**
   * 【追加】既知・未知・配列・未指定queryに対するtoast変換を検証する。
   */
  () => { // 【追加】固定文言への変換結果を検証するコールバック
    it.each([ // 【追加】toastの変換試験を登録する関数
      [
        "event-created",
        "イベントを作成しました。",
      ],
      [
        "event-updated",
        "イベントを更新しました。",
      ],
      [
        "event-deleted",
        "イベントを削除しました。",
      ],
      [
        "event-delete-failed",
        "イベントを削除できませんでした。もう一度お試しください。",
      ],
      // 【追加】Actionが送る複製成功コードを固定文言へ変換する。
      [
        "event-month-copied",
        "前月の予定を下書きとして複製しました。",
      ],
    ])(
      "%sを固定メッセージへ変換する",
      /**
       * 【追加】入力コードが対応する固定文言だけへ変換されることを確認する。
       */
      ( // 【追加】固定文言への変換結果を検証するコールバック
        value,
        expected,
      ) => {
        expect( // 【追加】既存の表示・queryを構築する関数またはメソッド / 検証する値の期待値を作る関数
          getClubEventToastMessage( // 【追加】既知のコードだけを固定メッセージへ変換する関数
            value,
          ),
        ).toBe(expected);
      },
    );

    it("不明な値はnull",  // 【追加】toastの変換試験を登録する関数
      /**
       * 【追加】既知・未知・配列・未指定queryに対するtoast変換を検証する。
       */
      () => { // 【追加】固定文言への変換結果を検証するコールバック
      expect( // 【追加】既存の表示・queryを構築する関数またはメソッド / 検証する値の期待値を作る関数
        getClubEventToastMessage( // 【追加】既知のコードだけを固定メッセージへ変換する関数
          "unknown",
        ),
      ).toBeNull();
    });

    it("複数指定はnull",  // 【追加】toastの変換試験を登録する関数
      /**
       * 【追加】既知・未知・配列・未指定queryに対するtoast変換を検証する。
       */
      () => { // 【追加】固定文言への変換結果を検証するコールバック
      expect( // 【追加】既存の表示・queryを構築する関数またはメソッド / 検証する値の期待値を作る関数
        getClubEventToastMessage([ // 【追加】既知のコードだけを固定メッセージへ変換する関数
          "event-created",
        ]),
      ).toBeNull();
    });

    it("未指定はnull",  // 【追加】toastの変換試験を登録する関数
      /**
       * 【追加】既知・未知・配列・未指定queryに対するtoast変換を検証する。
       */
      () => { // 【追加】固定文言への変換結果を検証するコールバック
      expect( // 【追加】既存の表示・queryを構築する関数またはメソッド / 検証する値の期待値を作る関数
        getClubEventToastMessage( // 【追加】既知のコードだけを固定メッセージへ変換する関数
          undefined,
        ),
      ).toBeNull();
    });
  },
);
// 【追加】成功コードも、任意文字列や配列へ変わった場合は表示しない。
it.each([ // 【追加】不正な複製toastのパラメーター試験を登録する関数
  "events-month-copied",
  "event-month-copied?createdCount=999",
  "event-month-copied<script>",
  ["event-month-copied"],
])("複製成功コード以外の%jは表示しない", // 【追加】試験を登録する関数
  /**
   * 【追加】未採用コード・任意文字列付きコード・配列を固定文言へ変換しない。
   */
  (value) => { // 【追加】不正コードを検証するコールバック
    expect(getClubEventToastMessage(value)).toBeNull(); // 【追加】期待値生成関数 / 固定文言変換関数 / 非表示を比較するメソッド
  },
);
