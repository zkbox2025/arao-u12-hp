// src/infrastructure/line/line-messaging-api.test.ts
// LINE APIの10秒の打ち切りと、時間切れを結果不明として返す動作を、実通信なしで確認する。

import {
  afterEach, // 各ケースの後処理を登録する関数
  describe, // テスト群を定義する関数
  expect, // 期待値を検証する関数
  it, // テストケースを定義する関数
  vi, // モック・スパイを扱う関数群
} from "vitest";

import {
  sendLinePushMessage, // LINEへpushメッセージを1通要求し、受付結果を返す関数
} from "@/src/infrastructure/line/line-messaging-api";

/**
 * テストで使う、架空のLINE送信入力。
 */
const input = {
  channelAccessToken: "FAKE_CHANNEL_ACCESS_TOKEN",
  lineGroupId: `C${"a".repeat(32)}`,
  message: "架空の非公開メッセージ",
  retryKey: "00000000-0000-4000-8000-000000000000",
}; // 架空の送信入力オブジェクト

/**
 * 時間切れ・通常の通信エラーの扱いを確認するテスト群。実通信も実時間の待機も行わない。
 */
describe("sendLinePushMessage の打ち切り", () => { // テスト群を定義する関数
  afterEach(
    /**
     * スパイを元に戻し、他のケースへ影響を残さない。
     */
    () => { // 後処理のコールバック
      vi.restoreAllMocks(); // スパイとモックを元に戻す関数
    },
  );

  /**
   * AbortSignal.timeoutを10秒で作り、その信号をfetchへ渡すことを確認する。
   */
  it("10秒で中断する信号を作り、fetchへ渡す", async () => { // テストケースを定義する関数 / 非同期コールバック
    const controller = new AbortController(); // 中断を手動で起こすコントローラーのコンストラクター
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout") // 打ち切り信号の生成メソッドを監視する関数
      .mockReturnValue(controller.signal); // 手動で制御できる信号へ置き換えるメソッド
    const fetchSpy = vi
      .spyOn(globalThis, "fetch") // HTTP送信関数を監視する関数
      .mockResolvedValue(new Response("", { status: 200 })); // 受付成功の架空応答を返すメソッド / 応答のコンストラクター

    const result = await sendLinePushMessage(input); // LINEへの送信要求関数

    expect(result).toEqual({ success: true }); // 期待値を検証する関数 / 結果の比較メソッド
    expect(timeoutSpy).toHaveBeenCalledExactlyOnceWith(10_000); // 期待値を検証する関数 / 10秒で1回だけ呼ばれた検証メソッド
    expect(fetchSpy.mock.calls[0][1]?.signal).toBe(controller.signal); // 期待値を検証する関数 / fetchへ渡した信号の比較メソッド
  });

  /**
   * 時間切れで中断された場合は、結果不明として返し、例外の原文を結果へ含めないことを確認する。
   */
  it("時間切れは結果不明として返し、例外の内容を含めない", async () => { // テストケースを定義する関数 / 非同期コールバック
    const controller = new AbortController(); // 中断を手動で起こすコントローラーのコンストラクター
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal); // 打ち切り信号を手動制御へ置き換える関数
    vi.spyOn(globalThis, "fetch").mockImplementation( // HTTP送信関数を信号で中断される動作へ置き換える関数
      /**
       * 信号が中断されたときに、その理由で失敗するPromiseを返す。
       */
      (_url, init) => new Promise<Response>( // 非同期結果のコンストラクター
        /**
         * 中断イベントを待ち、中断の理由で拒否する。
         */
        (_resolve, reject) => { // Promiseの初期化コールバック
          init?.signal?.addEventListener( // 中断イベントの購読メソッド
            "abort",
            /**
             * 中断の理由（TimeoutError）で失敗させる。
             */
            () => { // 中断時のコールバック
              reject(init.signal?.reason); // 中断の理由で拒否するメソッド
            },
            { once: true },
          );
        },
      ),
    );

    const pending = sendLinePushMessage(input); // 中断前の送信要求（未完了のPromise）を開始する関数
    controller.abort( // 時間切れを再現する中断メソッド
      new DOMException("PRIVATE_RAW_TIMEOUT_TEXT", "TimeoutError"), // 時間切れ例外のコンストラクター
    );
    const result = await pending; // 時間切れ後の結果を待つ

    expect(result).toEqual({ // 期待値を検証する関数 / 結果の比較メソッド
      success: false,
      errorCode: "LINE_RESULT_UNKNOWN_TIMEOUT",
      errorDetail: "LINEへの送信結果を確認できませんでした。",
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_RAW_TIMEOUT_TEXT"); // 期待値を検証する関数 / 文字列化関数 / 原文を含まない検証メソッド
  });

  /**
   * 【修正】時間切れ以外の通信エラーも、送信失敗と断定せず「送信結果不明」の説明で返すことを確認する。
   * errorCodeは既存のLINE_NETWORK_ERRORを維持する。
   */
  it("時間切れ以外の通信エラーも、送信失敗と断定しない結果不明の説明で返す", async () => { // テストケースを定義する関数 / 非同期コールバック
    vi.spyOn(globalThis, "fetch").mockRejectedValue( // HTTP送信関数を通信エラーで失敗させるメソッド
      new Error("PRIVATE_RAW_NETWORK_TEXT"), // 通常のエラーのコンストラクター
    );

    const result = await sendLinePushMessage(input); // LINEへの送信要求関数

    expect(result).toEqual({ // 期待値を検証する関数 / 結果の比較メソッド
      success: false,
      errorCode: "LINE_NETWORK_ERROR",
      errorDetail: "LINEへの送信結果を確認できませんでした。",
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_RAW_NETWORK_TEXT"); // 【追加】期待値を検証する関数 / 文字列化関数 / 原文を含まない検証メソッド
  });
});
