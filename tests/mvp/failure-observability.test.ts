// tests/mvp/failure-observability.test.ts
// 実DB・SDK通信なしで、出力の境界跨ぎ・系統分離・監視失敗を検証する。

import {
  expect,
  it,
} from "vitest";
import {
  createMvpOutputObserver, // 原文を公開せず架空sentinelの出力件数だけを保持する関数
  mvpFailureSentinel, // 実行IDと境界に束縛した架空sentinelの生成関数
} from "./failure-observability.mjs";
import {
  startMvpChild, // 所有子プロセス群を起動する関数
  waitMvpChild, // 子の失敗・期限・終了を照合する関数
} from "../../scripts/test-e2e.mjs";

const RUN = "a".repeat(32); // 架空実行IDを生成するメソッド

it("全chunk境界で検出でき、前の末尾にある同じ出現を二重集計しない", // ケース登録関数
  /**
   * すべての分割位置で同じsentinelを一度だけ検出する。
   */
  () => { // 境界分割の検証コールバック
    for (const channel of ["resend", "line", "storage"] as const) { // 境界キーのリテラル型アサーション
      const text = mvpFailureSentinel(RUN, channel); // 架空値生成関数
      for (let split = 0;split <= text.length;split++) {
        const monitor = createMvpOutputObserver(RUN); // 出力監視器生成関数
        monitor.observe("stdout", Buffer.from(text.slice(0, split))); // 出力を照合するメソッド / バイト列生成関数 / 分割メソッド
        monitor.observe("stdout", Buffer.from(text.slice(split))); // 出力を照合するメソッド / バイト列生成関数 / 分割メソッド
        monitor.observe("stdout", Buffer.from("ordinary log")); // 後続出力を照合するメソッド / バイト列生成関数
        expect(monitor.counts).toEqual({ // 構造を比較するメソッド / 期待値を検証する関数
          stdout: 1,
          stderr: 0
        }); // 検出件数の検証関数・比較メソッド
        expect(JSON.stringify(monitor)).not.toContain(text); // 原文が公開値にないことを検証する関数 / JSON化・含有判定メソッド
        expect( // 固定終端エラーを検証する関数
          /**
           * 検出した漏えいを成功扱いにしない。
           */
          () => monitor.finish(), // 終端照合のコールバック・メソッド
        ).toThrow("F12_OBSERVABILITY_FAILED"); // 固定例外の比較メソッド
      }
    }
  },
);

it("異なるstreamを結合せず、大量の通常出力後もstderr漏えいを数える", // ケース登録関数
  /**
   * ログの量やstdout・stderrの交錯で見逃しや偽陽性が起きないことを確認する。
   */
  () => { // 出力系統の検証コールバック
    const monitor = createMvpOutputObserver(RUN); // 出力監視器生成関数
    const text = mvpFailureSentinel(RUN, "line"); // 架空値生成関数
    monitor.observe("stdout", Buffer.from(text.slice(0, 20))); // 系統別照合メソッド / バイト列生成関数 / 分割メソッド
    monitor.observe("stderr", Buffer.from(text.slice(20))); // 系統別照合メソッド / バイト列生成関数 / 分割メソッド
    expect(monitor.counts).toEqual({ // 構造を比較するメソッド / 期待値を検証する関数
      stdout: 0,
      stderr: 0
    }); // 偽陽性がないことを検証する関数・比較メソッド
    monitor.observe("stderr", Buffer.alloc(1024 * 1024, 120)); // 通常出力の照合メソッド / 架空バイト列生成関数
    monitor.observe("stderr", Buffer.from(text + text)); // 複数出現の照合メソッド / バイト列生成関数
    expect(monitor.counts).toEqual({ // 構造を比較するメソッド / 期待値を検証する関数
      stdout: 0,
      stderr: 2
    }); // 件数の検証関数・比較メソッド
  },
);

it("実際の子のstdout・stderrを転送せず監視し、終了後の検出も失敗にする", // ケース登録関数
  /**
   * 親runnerと同じpipe経路で、子の最後の出力まで監視する。
   */
  async () => { // 所有子プロセスの検証コールバック
    const monitor = createMvpOutputObserver(RUN); // 出力監視器生成関数
    const sentinel = mvpFailureSentinel(RUN, "storage"); // 架空値生成関数
    const child = startMvpChild({ // 所有子を起動する関数
      file: process.execPath,
      args: ["-e", `process.stdout.write(${JSON.stringify(sentinel)}); process.stderr.write(${JSON.stringify(sentinel)});`], // 架空値だけを起動用文字列へ変換するメソッド
      cwd: process.cwd(), // 現在の試験領域を取得するメソッド
      env: { NODE_ENV: "test" },
      observe: monitor.observe, // 原文を転送しない出力監視メソッド
    });
    try {
      await waitMvpChild(child, 5000); // stdio終了まで待つ関数
      expect(monitor.counts).toEqual({ // 構造を比較するメソッド / 期待値を検証する関数
        stdout: 1,
        stderr: 1
      }); // 両系統の検出を検証する関数・比較メソッド
      expect( // 固定エラーを検証する関数
        /**
         * 終了直前の出力も検出して失敗にする。
         */
        () => monitor.finish(), // 終端照合のコールバック・メソッド
      ).toThrow("F12_OBSERVABILITY_FAILED"); // 固定例外の比較メソッド
    } finally {
      await child.stop(); // 所有子だけを回収するメソッド
    }
  },
);

it("通常出力だけなら終端が成功し、不正runは固定例外で拒否する", // ケース登録関数
  /**
   * 非検出の正常系と、監視不能な入力の拒否を確認する。
   */
  () => { // 正常系と入力境界の検証コールバック
    const monitor = createMvpOutputObserver(RUN); // 出力監視器生成関数
    monitor.observe("stdout", Buffer.from("ready")); // 通常出力照合メソッド / バイト列生成関数
    expect(monitor.finish()).toBeUndefined(); // 正常終端を検証する関数・終端照合・比較メソッド
    expect( // 不正入力を検証する関数
      /**
       * 実行IDのない監視器を作らない。
       */
      () => createMvpOutputObserver("invalid"), // 不正設定の監視器生成コールバック
    ).toThrow("F12_OBSERVABILITY_FAILED"); // 固定例外の比較メソッド
  },
);

it("失敗reportのraw JSONをファイルへ保存せず解析し、二度目の読取り・容量超過は固定拒否する", // ケース登録関数
  /**
   * 結果のsplit・原文回収・上限を同じ親runner用集計器で確認する。
   */
  async () => { // 結果解析の検証コールバック
    const { createMvpReportReader } = await import("./failure-observability.mjs"); // ファイル保存しない集計器生成関数 / 遅延読込関数
    const monitor = createMvpOutputObserver(RUN); // 出力監視器生成関数
    const reader = createMvpReportReader(monitor.observe); // 結果集計器生成関数 / 原文非公開の監視メソッド
    reader.observe("stderr", Buffer.from("diagnostic")); // stderrを結果JSONへ混ぜない監視メソッド / バイト列生成関数
    reader.observe("stdout", Buffer.from('{"errors":')); // splitしたJSONの監視メソッド / バイト列生成関数
    reader.observe("stdout", Buffer.from('["FAKE_PRIVATE"]}')); // メモリ内だけの架空原文を渡すメソッド / バイト列生成関数
    expect(JSON.stringify(reader.read()).includes("FAKE_PRIVATE")).toBe(true); // メモリ内解析を検証する関数 / JSON化・解析・含有・比較メソッド
    expect( // 回収後の固定失敗を検証する関数
      /**
       * 保持した原文が再取得できないことを確認する。
       */
      () => reader.read(), // 再読取コールバック・解析メソッド
    ).toThrow("F12_REPORT_FAILED"); // 固定失敗の比較メソッド
    const limited = createMvpReportReader(monitor.observe); // 容量上限を持つ集計器生成関数 / 監視メソッド
    expect( // 上限超過を検証する関数
      /**
       * 異常な大容量出力を子の失敗へ変換する。
       */
      () => limited.observe("stdout", Buffer.alloc(16 * 1024 * 1024 + 1)), // 容量検証のコールバック・監視メソッド / 架空バイト列生成関数
    ).toThrow("F12_REPORT_FAILED"); // 固定失敗の比較メソッド
  },
);
