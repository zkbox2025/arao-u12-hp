// tests/mvp/failure-observability.mjs
// 生の出力を返さず、実行ごとの架空sentinelが出力された回数だけを保持する。
// @ts-check

/**
 * 実行IDと外部境界に束縛した、実資格情報ではない検出用文字列を作る。
 * @param {string} runId 予約済み実行ID。
 * @param {"resend" | "line" | "storage"} channel 故障境界。
 */
export function mvpFailureSentinel(runId, channel) { // 架空sentinelを生成する関数
  if (!/^[0-9a-f]{32}$/u.test(runId) || // 実行IDの書式を調べるメソッド
    !["resend", "line", "storage"].includes(channel)) { // 故障境界を照合するメソッド
    throw new Error("F12_OBSERVABILITY_FAILED"); // 原文を含めない例外コンストラクター
  }
  return `F12_FAKE_SENTINEL_${runId}_${channel}`;
}

/**
 * stdoutとstderrを別々に走査し、chunk境界の照合に必要な末尾だけをメモリに保持する。
 * @param {string} runId 予約済み実行ID。
 */
export function createMvpOutputObserver(runId) { // 出力監視器を生成する関数
  const needles = ["resend", "line", "storage"].map( // 境界ごとの照合値へ変換するメソッド
    /**
     * 検証済み境界だけを、ASCIIの照合用バイト列へ変換する。
     */
    (channel) => Buffer.from(mvpFailureSentinel(runId, /** @type {"resend" | "line" | "storage"} */(channel))), // 照合用バイト列の生成関数 / 架空sentinel生成関数 / 境界型の注釈
  );
  const maximum = Math.max(...needles.map( // 最大照合長を求める関数 / 長さへ変換するメソッド
    /**
     * chunkを跨ぐ照合に必要な長さを返す。
     */
    (needle) => needle.length, // 長さ取得のコールバック
  ));
  const counts = {
    stdout: 0,
    stderr: 0
  };
  const tails = {
    stdout: Buffer.alloc(0), // 架空バイト列を作る関数
    stderr: Buffer.alloc(0) // 架空バイト列を作る関数
  }; // 空のバイト列を生成する関数
  return {
    counts,
    /**
     * 原文を公開せず、stream内の完全一致を数え、保持量を最大sentinel長未満に制限する。
     * @param {"stdout" | "stderr"} stream 出力系統。
     * @param {Uint8Array} chunk 破棄前の出力バイト列。
     */
    observe(stream, chunk) { // 出力の照合と件数更新を行うメソッド
      const previous = tails[stream].length;
      const bytes = Buffer.concat([tails[stream], Buffer.from(chunk)]); // chunk境界を結合する関数 / バイト列生成関数
      for (const needle of needles) {
        let index = bytes.indexOf(needle); // 完全一致位置を検索するメソッド
        while (index !== -1) {
          if (index + needle.length > previous) {
            counts[stream]++;
          }
          index = bytes.indexOf(needle, index + needle.length); // 次の重複しない出現を検索するメソッド
        }
      }
      tails[stream] = Buffer.from(bytes.subarray(-(maximum - 1))); // 小さい末尾だけを複製する関数 / 部分列を取得するメソッド
    },
    /**
     * 子プロセスのstdio終了後にも漏えいを失敗にし、記録した末尾を破棄する。
     */
    finish() { // 監視の終端を検証するメソッド
      tails.stdout = Buffer.alloc(0); // 保持していた末尾を破棄する関数
      tails.stderr = Buffer.alloc(0); // 保持していた末尾を破棄する関数
      if (counts.stdout !== 0 ||
        counts.stderr !== 0) {
        throw new Error("F12_OBSERVABILITY_FAILED"); // 原文を含めない固定例外コンストラクター
      }
    },
  };
}

/**
 * PlaywrightのJSON結果をファイルへ書かず、上限付きメモリで一度だけ解析する。
 * @param {(stream: "stdout" | "stderr", chunk: Uint8Array) => void} observe 漏えい検出器。
 */
export function createMvpReportReader(observe) { // 秘密を含み得る結果をディスクへ残さない集計器生成関数
  /** @type {Buffer[]} */
  const chunks = []; // 結果バイト列の一時配列型
  let size = 0;
  return {
    /**
     * 両系統を検出器へ渡し、JSONが出るstdoutだけを最大16MiBまで一時保持する。
     * @param {"stdout" | "stderr"} stream 出力系統。
     * @param {Uint8Array} chunk 出力バイト列。
     */
    observe(stream, chunk) { // 件数監視と結果収集のメソッド
      observe(stream, chunk); // 原文非公開の検出器へ渡す関数
      if (stream === "stdout") {
        size += chunk.byteLength;
        if (size > 16 * 1024 * 1024) {
          chunks.length = 0;
          throw new Error("F12_REPORT_FAILED"); // 上限超過を固定例外にするコンストラクター
        }
        chunks.push(Buffer.from(chunk)); // 所有バイト列だけをメモリへ複製するメソッド・関数
      }
    },
    /**
     * stdio終了後のJSONを解析し、成功・失敗にかかわらず保持したバイト列を回収する。
     * @returns {unknown} 内容を検証する前の結果。
     */
    read() { // 生バイト列を公開しない結果解析メソッド
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8")); // メモリ内JSONの結合・文字列化・解析メソッド
      } catch {
        throw new Error("F12_REPORT_FAILED"); // raw JSONを含めない固定例外コンストラクター
      } finally {
        chunks.length = 0;
      }
    },
  };
}
