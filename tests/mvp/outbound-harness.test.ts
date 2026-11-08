// tests/mvp/outbound-harness.test.ts
// 架空の設定と所有loopbackだけでSDK送信・非fetch遮断・TLS・子停止を確認する。
import {
  CLUB_ATTACHMENT_BUCKET, // 【追加】クラブ添付PDFのprivate bucket名
} from "../../src/infrastructure/storage/club-attachment-storage-constants";
import {
  spawn,
} from "node:child_process";
import {
  X509Certificate, // 【追加】一時証明書の許可hostを検証するクラス
  randomBytes,
} from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import {
  tmpdir,
} from "node:os";
import {
  join,
  resolve,
} from "node:path";
import {
  pathToFileURL,
} from "node:url";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import {
  ModuleKind,
  ScriptTarget,
  transpileModule,
} from "typescript";
import {
  assertMvpE2eReport, // Playwright JSONで実成功・skipなしを検証する関数
  assertNoMvpEgress, // 同期記録とstubで通信違反を検出する関数
  createMvpCertificate, // 所有一時領域でTLS証明書を生成する関数
  createMvpWorkerPreload, // 同じ遮断ソースからthread用同期preloadを生成する関数
  runMvpE2e, // 専用環境でproduction E2Eと資源回収を実行する関数
  startMvpChild, // 所有する子プロセス群を起動する関数
  startMvpTls, // 同じrunのNextへ中継するHTTPS入口を起動する関数
  waitMvpChild, // 子の終了・期限超過・中断を検証する関数
} from "../../scripts/test-e2e.mjs";
import {
  listenMvpServer, // 所有serverをloopbackへbindする関数
  ownMvpServer, // 所有serverと接続の回収関数を作る関数
  readMvpE2eSession, // preload・明示flag・接続契約を検証する関数
  startMvpOutboundStub, // 当該runの送信stubとbrowser proxyを起動する関数
} from "./outbound-stub.mjs";
import verifyMvpE2eOwner from "./outbound-stub.mjs"; // 所有runの準備完了を確認するglobal setup関数
const ROOT = resolve(import.meta.dirname, "../.."); // 絶対パスを解決する関数
const RUN_ID = "a".repeat(32); // 文字列を指定回数繰り返すメソッド
const PRIVATE = "F12_FAKE_PRIVATE_NEVER_LOG";
const CLUB = "11111111-1111-4111-8111-111111111111";
const STORAGE_PATH = `/storage/v1/object/${CLUB_ATTACHMENT_BUCKET}/clubs/${CLUB}/events/example.pdf`; // 【修正】実bucketの所有pathで故障条件を確認する
let directory: string; // 文字列型
let secret: string; // 文字列型
let workerPreload: string; // 文字列型
let stub: Awaited<ReturnType<typeof startMvpOutboundStub>>; // 当該runの送信stubとbrowser proxyを起動する関数 / 非同期結果の解決値の型 / 関数の戻り値の型
const cleanup: Array<() => Promise<void>> = []; // 戻り値を使わない型 / 回収関数の配列型 / 非同期結果の型
/**
 * 同じ実行のsecret・runIdを使い、制御内容はコンソールへ出さない。
 */
async function control(value: Record<string, unknown>, token = secret) { // この処理を定義する関数・コールバック / 同じ実行のsecret・runIdを使い、制御内容はコンソールへ出さない / 文字列型 / 未確定の値の型 / キーと値の対応を表す型
  return await fetch(stub.origin + "/control", { // HTTP通信を実行する関数
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mvp-secret": token,
    },
    body: JSON.stringify({ // JSONへ直列化するメソッド
      runId: RUN_ID,
      ...value
    }),
  });
}
/**
 * SDKを本物のNodeプロセスで読み込み、preloader適用後の結果だけをメモリへ回収する。
 */
async function probe(source: string, overrides: Record<string, string> = {}) { // この処理を定義する関数・コールバック / SDKを本物のNodeプロセスで読み込み、preloader適用後の結果だけをメモリへ回収する / 文字列型 / キーと値の対応を表す型
  return await new Promise<{ // 非同期結果を扱うPromise
    code: number | null; // 数値型
    output: string; // 文字列型
    error: string; // 文字列型
  }>(
    /**
     * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
     */
    (accept, reject) => { // この処理を定義する関数・コールバック / 成功を通知する関数 / 失敗を通知する関数
      const child = spawn(process.execPath, [ // 子プロセスを起動する関数
        "--conditions=react-server",
        "--import",
        join(ROOT, "tests/mvp/outbound-preload.mjs"), // パスを結合する関数
        "--input-type=module",
        "-e",
        source,
      ], {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          MVP_E2E_PRELOAD: JSON.stringify({ // JSONへ直列化するメソッド
            runId: RUN_ID,
            secret,
            stubOrigin: stub.origin,
            supabaseOrigin: "http://127.0.0.1:54321",
            checkoutDirectory: directory,
            runtimeDirectory: directory,
            workerPreload,
            phase: "build",
          }),
          ...overrides,
        },
        stdio: [
          "ignore",
          "pipe",
          "pipe"
        ],
      });
      let output = "";
      let error = "";
      child.stdout.on("data",  // イベントを監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        (data) => { // この処理を定義する関数・コールバック
          output += String(data); // 文字列へ変換する関数
        });
      child.stderr.on("data",  // イベントを監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        (data) => { // この処理を定義する関数・コールバック
          error += String(data); // 文字列へ変換する関数
        });
      const timer = setTimeout( // 待機上限を設定する関数
        /**
         * 待機時間の経過後に、この処理の完了または失敗を通知するコールバック。
         */
        () => { // この処理を定義する関数・コールバック
          child.kill("SIGKILL"); // 所有プロセスへ終了通知を送る関数
          reject(new Error("F12_PROBE_TIMEOUT")); // 失敗を通知する関数 / 固定例外のコンストラクター
        }, 10000);
      child.once("error",  // イベントを一度だけ監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        () => { // この処理を定義する関数・コールバック
          clearTimeout(timer); // 待機timerを解除する関数
          reject(new Error("F12_PROBE_START_FAILED")); // 失敗を通知する関数 / 固定例外のコンストラクター
        });
      child.once("close",  // イベントを一度だけ監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        (code) => { // この処理を定義する関数・コールバック
          clearTimeout(timer); // 待機timerを解除する関数
          accept({ // 成功を通知する関数
            code,
            output,
            error
          });
        });
    });
}
beforeEach( // ケース前の準備を登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    directory = mkdtempSync(join(tmpdir(), "f12-outbound-test-")); // 一時領域を作る関数 / パスを結合する関数 / 一時領域の基準パスを返す関数
    symlinkSync( // 【追加】一時領域から既存SDKを参照できるようにする関数
  join(ROOT, "node_modules"), // 【追加】既存SDKのパスを組み立てる関数
  join(directory, "node_modules"), // 【追加】一時領域の参照先パスを組み立てる関数
  "dir",
);
    secret = randomBytes(32).toString("hex"); // 検証用乱数を生成する関数 / 文字列へ変換するメソッド
    workerPreload = await createMvpWorkerPreload(directory, ROOT); // 同じ遮断ソースからthread用同期preloadを生成する関数
    stub = await startMvpOutboundStub({ // 当該runの送信stubとbrowser proxyを起動する関数
      runId: RUN_ID,
      secret,
      supabaseOrigin: "http://127.0.0.1:54321",
    });
    cleanup.push(stub.close); // 配列へ要素を追加するメソッド / 所有資源を閉じる関数・メソッド
  });
afterEach( // ケース後の回収を登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    try {
      for (const close of cleanup.splice(0).reverse()) { // 所有資源を閉じる関数・メソッド / 配列から要素を取り出すメソッド / 配列の順序を反転するメソッド
        await close(); // 所有資源を閉じる関数・メソッド
      }
    }
    finally {
      vi.restoreAllMocks(); // 監視・置換した関数を元へ戻す関数
      rmSync(directory, { // 所有する一時資源を削除する関数
        recursive: true,
        force: true
      });
    }
  });
it("制御はsecret・run・loopbackを照合し、無認証・別run・Origin付き要求を拒否する",  // 試験ケースを登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    expect((await control({ // 期待値を生成する関数 / 同じ実行のsecret・runIdを使い、制御内容はコンソールへ出さない
      action: "status"
    }, "wrong")).status).toBe(404); // 値の一致を検証するメソッド
    expect((await control({ // 期待値を生成する関数 / 同じ実行のsecret・runIdを使い、制御内容はコンソールへ出さない
      action: "status",
      runId: "b".repeat(32) // 文字列を指定回数繰り返すメソッド
    })).status).toBe(404); // 値の一致を検証するメソッド
    const response = await fetch(stub.origin + "/control", { // HTTP通信を実行する関数
      method: "POST",
      headers: {
        "x-mvp-secret": secret,
        Origin: "https://remote.invalid"
      },
      body: "{}",
    });
    expect(response.status).toBe(404); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(stub.status()).toEqual({ // 期待値を生成する関数 / 実行全体の遮断件数はresetで消さず、集計だけを返す / 構造の一致を検証するメソッド
      violations: 0,
      requests: 0
    });
  });
it.each([ // 試験ケースを登録する関数 / パラメーター別試験を登録するメソッド
  [
    "success",
    true,
    true
  ],
  [
    "rejected",
    false,
    false
  ],
  [
    "conflict",
    false,
    true
  ],
  [
    "server-error",
    false,
    false
  ],
  [
    "timeout",
    false,
    false
  ],
  [
    "network",
    false,
    false
  ],
] as const)("実Resend SDKと実LINE adapterで%sを受け取り、外部へ送らない",  // constの型
  /**
   * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
   */
  async (mode, mailAccepted, lineAccepted) => { // この処理を定義する関数・コールバック
    await control({ // 同じ実行のsecret・runIdを使い、制御内容はコンソールへ出さない
      action: "configure",
      channel: "resend",
      mode
    });
    await control({ // 同じ実行のsecret・runIdを使い、制御内容はコンソールへ出さない
      action: "configure",
      channel: "line",
      mode
    });
    const compiled = transpileModule(readFileSync(join(ROOT, "src/infrastructure/line/line-messaging-api.ts"), "utf8"), { // TypeScriptからJavaScriptを生成する関数 / 指定したファイルを読む関数 / パスを結合する関数
      compilerOptions: {
        module: ModuleKind.ESNext,
        target: ScriptTarget.ES2022
      }
    }).outputText;
    const lineModule = "data:text/javascript;base64," + Buffer.from(compiled.replace('import "server-only";', "import " + JSON.stringify(pathToFileURL(join(ROOT, "node_modules/server-only/empty.js")).href) + ";")).toString("base64"); // バイト列を扱うBuffer API / 値からバイト列を作る関数・対象を選ぶメソッド / 一致箇所を置換するメソッド / JSONへ直列化するメソッド / パスをURLへ変換する関数 / パスを結合する関数 / 文字列へ変換するメソッド
    const source = [
      'import {Resend} from "resend";',
      "const client = new Resend('re_FAKE_NEVER_SEND');",
      "const mail = await client.emails.send({from:'from@example.test',to:'to@example.test',subject:'fixture',html:" + JSON.stringify(PRIVATE) + "},{idempotencyKey:'mail-owned'});", // JSONへ直列化するメソッド
      "const {sendLinePushMessage} = await import(" + JSON.stringify(lineModule) + ");", // JSONへ直列化するメソッド
      "const line = await sendLinePushMessage({channelAccessToken:'FAKE',lineGroupId:'FAKE',message:" + JSON.stringify(PRIVATE) + ",retryKey:'11111111-1111-4111-8111-111111111111'});", // JSONへ直列化するメソッド
      "console.log(JSON.stringify({mail:!mail.error,line:line.success}));",
    ].join("\n"); // 値を連結するメソッド
    const result = await probe(source); // SDKを本物のNodeプロセスで読み込み、preloader適用後の結果だけをメモリへ回収する
    expect(result.code).toBe(0); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(JSON.parse(result.output)).toEqual({ // 期待値を生成する関数 / JSONを解析するメソッド / 構造の一致を検証するメソッド
      mail: mailAccepted,
      line: lineAccepted
    });
    expect(result.error).not.toContain(PRIVATE); // 期待値を生成する関数 / 期待値の否定を表すAPI / 含まれる値を検証するメソッド
    expect(result.error).not.toContain(secret); // 期待値を生成する関数 / 期待値の否定を表すAPI / 含まれる値を検証するメソッド
    const records = (await (await control({ // 同じ実行のsecret・runIdを使い、制御内容はコンソールへ出さない
      action: "read"
    })).json()).records; // JSON応答を読み取るメソッド
    expect(records).toHaveLength(2); // 期待値を生成する関数 / 件数を検証するメソッド
    expect(records[0].idempotencyKey).toBe("mail-owned"); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(records[1].idempotencyKey).toBe("11111111-1111-4111-8111-111111111111"); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(stub.status().violations).toBe(0); // 期待値を生成する関数 / 実行全体の遮断件数はresetで消さず、集計だけを返す / 値の一致を検証するメソッド
  });
it.each([ // 試験ケースを登録する関数 / パラメーター別試験を登録するメソッド
  "https://remote.invalid/private",
  "https://api.resend.com/emails?bypass=1",
  "https://api.line.me/v2/bot/message/push/other",
  "http://127.0.0.1:54321/rest/v1/other",
])("未知のfetch宛先を通信前に拒否し、SDKが吸収しても違反を保持する（%#）",
  /**
   * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
   */
  async (url) => { // この処理を定義する関数・コールバック
    const result = await probe("await fetch(" + JSON.stringify(url) + ").catch(e=>console.log(e.message));"); // SDKを本物のNodeプロセスで読み込み、preloader適用後の結果だけをメモリへ回収する / JSONへ直列化するメソッド
    expect(result.code).toBe(1); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(result.output.trim()).toBe("F12_OUTBOUND_BLOCKED"); // 期待値を生成する関数 / 前後の空白を除くメソッド / 値の一致を検証するメソッド
    expect(stub.status().violations).toBeGreaterThan(0); // 期待値を生成する関数 / 実行全体の遮断件数はresetで消さず、集計だけを返す / 上限との比較を検証するメソッド
    await control({ // 同じ実行のsecret・runIdを使い、制御内容はコンソールへ出さない
      action: "reset"
    });
    expect(stub.status().violations).toBeGreaterThan(0); // 期待値を生成する関数 / 実行全体の遮断件数はresetで消さず、集計だけを返す / 上限との比較を検証するメソッド
  });
it.each([ // 試験ケースを登録する関数 / パラメーター別試験を登録するメソッド
  'const http = await import("node:http"); http.get("http://remote.invalid/");',
  'const https = await import("node:https"); https.request("https://remote.invalid/").end();',
  'const net = await import("node:net"); net.connect(443,"remote.invalid");',
  'const net = await import("node:net"); net.connect("/F12_FAKE_PRIVATE_NEVER_LOG/missing.sock");',
  'const dgram = await import("node:dgram"); dgram.createSocket("udp4").send("private",443,"remote.invalid");',
  'const child = await import("node:child_process"); child.exec("curl https://remote.invalid");',
])("非fetch・UDP・任意子コマンドも固定例外で遮断する（%#）",
  /**
   * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
   */
  async (code) => { // この処理を定義する関数・コールバック
    const result = await probe("try {" + code + "} catch(e) {console.log(e.message)}"); // SDKを本物のNodeプロセスで読み込み、preloader適用後の結果だけをメモリへ回収する
    expect(result.code).toBe(1); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(result.output.trim()).toBe("F12_OUTBOUND_BLOCKED"); // 期待値を生成する関数 / 前後の空白を除くメソッド / 値の一致を検証するメソッド
    expect(stub.status().violations).toBeGreaterThan(0); // 期待値を生成する関数 / 実行全体の遮断件数はresetで消さず、集計だけを返す / 上限との比較を検証するメソッド
  });
it("実Supabase Storage SDKの故障注入は所有path・HTTP操作へ限定する",  // 試験ケースを登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    stub.registerFixture({}, ["clubs/" + CLUB + "/"]); // seedした当該runのIDと認証情報を、制御secretで守る一時メモリへ登録する
    expect((await control({ // 期待値を生成する関数 / 同じ実行のsecret・runIdを使い、制御内容はコンソールへ出さない
      action: "configure",
      channel: "storage",
      mode: "server-error",
      method: "POST",
      path: STORAGE_PATH.replace(CLUB, "22222222-2222-4222-8222-222222222222"), // 一致箇所を置換するメソッド
    })).status).toBe(400); // 値の一致を検証するメソッド
    expect((await control({ // 期待値を生成する関数 / 同じ実行のsecret・runIdを使い、制御内容はコンソールへ出さない
      action: "configure",
      channel: "storage",
      mode: "server-error",
      method: "POST",
      path: STORAGE_PATH,
    })).ok).toBe(true); // 値の一致を検証するメソッド
    const result = await probe([ // SDKを本物のNodeプロセスで読み込み、preloader適用後の結果だけをメモリへ回収する
      'import {createClient} from "@supabase/supabase-js";',
      'const client=createClient("http://127.0.0.1:54321","F12_FAKE_INVALID_KEY");',
      "const result=await client.storage.from(" + JSON.stringify(CLUB_ATTACHMENT_BUCKET) + ").upload(" + // 【修正】実bucket名をSDKコードのJSON文字列へ変換する関数
      JSON.stringify(STORAGE_PATH.split(`/${CLUB_ATTACHMENT_BUCKET}/`)[1]) + // JSONへ直列化するメソッド / 文字列を分割するメソッド
      ",new Uint8Array([1]),{contentType:'application/pdf'});",
      "console.log(result.error?.message);",
    ].join("\n")); // 値を連結するメソッド
    expect(result.code).toBe(0); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(result.output.trim()).toBe("F12_STORAGE_FAILURE"); // 期待値を生成する関数 / 前後の空白を除くメソッド / 値の一致を検証するメソッド
    expect(stub.status().violations).toBe(0); // 期待値を生成する関数 / 実行全体の遮断件数はresetで消さず、集計だけを返す / 値の一致を検証するメソッド
  });
it("所有prefixの2件目だけを故障させ、別クラブ・別操作・resetを区別する", // 【追加】prefix故障設定の試験を登録する関数
  /**
   * 【追加】先行1件の成功を許し、境界外のpathと操作へ故障を広げない。
   */
  async () => { // 【追加】prefixの境界と待機回数を検証するコールバック
    stub.registerFixture({}, ["clubs/" + CLUB + "/"]); // 【追加】所有クラブのprefixを登録する関数
    const prefix = `/storage/v1/object/${CLUB_ATTACHMENT_BUCKET}/clubs/${CLUB}/events/`;
    for (const path of [
      `/storage/v1/object/${CLUB_ATTACHMENT_BUCKET}/`,
      prefix.replace(CLUB, "22222222-2222-4222-8222-222222222222"), // 【追加】別クラブへ置換するメソッド
      prefix + "../",
      prefix.replace("/events/", "/events-evil/"), // 【追加】別の種別名へ置換するメソッド
      prefix + "%2f",
    ]) {
      const result = await control({ // 【追加】同じrunの認証済み制御要求を送る関数
        action: "configure",
        channel: "storage",
        mode: "server-error",
        method: "POST",
        match: "prefix",
        path,
      });
      expect(result.status).toBe(400); // 【追加】期待値生成関数 / 広すぎる故障設定の拒否を検証するメソッド
    }
    const configured = await control({ // 【追加】認証済み制御要求を送る関数
      action: "configure",
      channel: "storage",
      mode: "server-error",
      method: "POST",
      match: "prefix",
      skip: 1,
      path: prefix,
    });
    expect(configured.ok).toBe(true); // 【追加】期待値生成関数 / 故障設定の受付を検証するメソッド
    /**
     * 【追加】SDKの通信直前と同じ故障照合を、Supabaseへ接続せず行う。
     */
    async function decision(method: string, path: string) { // 【追加】故障照合関数 / HTTP操作・pathの文字列型
      const response = await fetch(stub.origin + "/storage", { // 【追加】所有loopbackへだけ要求する関数
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mvp-secret": secret
        },
        body: JSON.stringify({ // 【追加】制御入力をJSONへ変換するメソッド
          method,
          path
        }), // 【追加】照合入力をJSON化する関数
      });
      return (await response.json()).mode; // 【追加】制御応答をJSONとして取得するメソッド
    }
    expect(await decision("POST", prefix + "first.pdf")).toBe("success"); // 【追加】期待値生成関数 / 故障照合関数 / 最初の成功を検証するメソッド
    expect(await decision("DELETE", prefix + "first.pdf")).toBe("success"); // 【追加】期待値生成関数 / 故障照合関数 / 別操作の正常応答を検証するメソッド
    expect(await decision("POST", prefix + "second.pdf")).toBe("server-error"); // 【追加】期待値生成関数 / 故障照合関数 / 2件目の故障を検証するメソッド
    expect(await decision("POST", prefix.replace(CLUB, "22222222-2222-4222-8222-222222222222") + "third.pdf")).toBe("success"); // 【追加】期待値生成関数 / 故障照合関数 / 別クラブへ置換するメソッド / 境界外の正常応答を検証するメソッド
    await control({ // 【追加】同じrunのsecretで所有stubを制御する関数
      action: "reset"
    }); // 【追加】故障設定を回収する関数
    expect(await decision("POST", prefix + "after.pdf")).toBe("success"); // 【追加】期待値生成関数 / 故障照合関数 / reset後の正常応答を検証するメソッド
  },
);

it("実SDK removeはbucket URLでなく本文中の正確なobject pathに故障を適用する", // 【追加】削除対象照合の試験を登録する関数
  /**
   * 【追加】Storage SDKの実際のJSON形式をpreloaderへ通し、DB・Storage接続の前に失敗させる。
   */
  async () => { // 【追加】削除故障のSDK境界を確認するコールバック
    stub.registerFixture({}, ["clubs/" + CLUB + "/"]); // 【追加】当該runの所有prefixを登録する関数
    const path = `clubs/${CLUB}/events/${CLUB}/${CLUB}.pdf`;
    expect((await control({ // 【追加】期待値生成関数 / 認証済み制御要求を送る関数
      action: "configure",
      channel: "storage",
      mode: "server-error",
      method: "DELETE",
      path: `/storage/v1/object/${CLUB_ATTACHMENT_BUCKET}/` + path,
    })).ok).toBe(true); // 【追加】故障設定の受付を検証するメソッド
    const result = await probe([ // 【追加】実SDKを所有子プロセスで評価する関数
      'import {createClient} from "@supabase/supabase-js";',
      'const client=createClient("http://127.0.0.1:54321","F12_FAKE_INVALID_KEY");',
      "const result=await client.storage.from(" + JSON.stringify(CLUB_ATTACHMENT_BUCKET) + ").remove([" + JSON.stringify(path) + "]);", // 【追加】削除pathをJSONへ変換する関数
      "console.log(result.error?.message);",
    ].join("\n")); // 【追加】子プロセスのコードを組み立てるメソッド
    expect(result.code).toBe(0); // 【追加】期待値生成関数 / SDKが故障を通常の失敗結果へ変換したことを検証するメソッド
    expect(result.output.trim()).toBe("F12_STORAGE_FAILURE"); // 【追加】期待値生成関数 / 前後空白を除くメソッド / 固定失敗文の照合メソッド
    const snapshot = await (await control({ // 【追加】所有stubの制御要求を送る関数
      action: "read",
    })).json(); // 【追加】制御応答をJSONとして取得するメソッド
    expect(snapshot.storageChecks).toEqual([ // 【追加】期待値生成関数 / 実SDKの照合対象を検証するメソッド
      {
        method: "DELETE",
        path: `/storage/v1/object/${CLUB_ATTACHMENT_BUCKET}/` + path,
        mode: "server-error",
      },
    ]);
    expect(stub.status().violations).toBe(0); // 【追加】期待値生成関数 / 違反件数取得関数 / 未許可通信がない検証メソッド
  },
);

it("Node子とeval型workerが環境を作り直しても同じ遮断を解除できない",  // 試験ケースを登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    const result = await probe([ // SDKを本物のNodeプロセスで読み込み、preloader適用後の結果だけをメモリへ回収する
      'import {spawn} from "node:child_process";',
      'import {Worker} from "node:worker_threads";',
      'const code="fetch(\\\"https://remote.invalid\\\").catch(()=>{});";',
      'const child=spawn(process.execPath,["-e",code],{env:{},stdio:"ignore"});',
      'await new Promise(resolve=>child.once("close",resolve));',
      'const worker=new Worker(code,{eval:true,env:{},execArgv:[]});',
      'await new Promise(resolve=>worker.once("exit",resolve));',
      'console.log("children-finished");',
    ].join("\n")); // 値を連結するメソッド
    expect(result.output.trim()).toBe("children-finished"); // 期待値を生成する関数 / 前後の空白を除くメソッド / 値の一致を検証するメソッド
    expect(stub.status().violations).toBeGreaterThanOrEqual(2); // 期待値を生成する関数 / 実行全体の遮断件数はresetで消さず、集計だけを返す / 下限を検証するメソッド
  });
it("SDK側が即時process.exit(0)しても同期記録した通信違反を完了にしない",  // 試験ケースを登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    const result = await probe('await fetch("https://remote.invalid").catch(()=>process.exit(0));'); // SDKを本物のNodeプロセスで読み込み、preloader適用後の結果だけをメモリへ回収する
    expect(result.code).toBe(0); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(readFileSync(join(directory, "violations.log"), "utf8")).toMatch(/^1\n/u); // 期待値を生成する関数 / 指定したファイルを読む関数 / パスを結合する関数 / 書式を検証するメソッド
    expect( // 期待値を生成する関数
      /**
       * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
       */
      () => assertNoMvpEgress(directory, stub)).toThrow("F12_E2E_FAILED"); // この処理を定義する関数・コールバック / 同期記録とstubで通信違反を検出する関数 / 固定例外を検証するメソッド
  });
it("実Axiom SDKの送信も未知の外向き通信として遮断する",  // 試験ケースを登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    const result = await probe([ // SDKを本物のNodeプロセスで読み込み、preloader適用後の結果だけをメモリへ回収する
      'import {Axiom} from "@axiomhq/js";',
      'const client=new Axiom({token:"FAKE_NEVER_SEND",onError:()=>{}});',
      'client.ingest("fixture",[{value:"private"}]);',
      'await client.flush().catch(()=>{});',
      'console.log("axiom-finished");',
    ].join("\n")); // 値を連結するメソッド
    expect(result.code).toBe(1); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(result.output.trim()).toBe("axiom-finished"); // 期待値を生成する関数 / 前後の空白を除くメソッド / 値の一致を検証するメソッド
    expect( // 期待値を生成する関数
      /**
       * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
       */
      () => assertNoMvpEgress(directory, stub)).toThrow("F12_E2E_FAILED"); // この処理を定義する関数・コールバック / 同期記録とstubで通信違反を検出する関数 / 固定例外を検証するメソッド
  }, 15000);
it("custom lookupで許可hostの実接続先を外部IPへ差し替えられない",  // 試験ケースを登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    const result = await probe([ // SDKを本物のNodeプロセスで読み込み、preloader適用後の結果だけをメモリへ回収する
      'import http from "node:http";',
      'await new Promise((resolve,reject)=>{',
      'http.get(' + JSON.stringify(stub.origin.replace("127.0.0.1", "localhost")) + // JSONへ直列化するメソッド / 一致箇所を置換するメソッド
      ',{lookup(){throw new Error("LOOKUP_USED")}},res=>{res.resume();res.on("end",resolve)}).on("error",reject);',
      '});console.log("loopback-only");',
    ].join("\n")); // 値を連結するメソッド
    expect(result.code).toBe(0); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(result.output.trim()).toBe("loopback-only"); // 期待値を生成する関数 / 前後の空白を除くメソッド / 値の一致を検証するメソッド
    assertNoMvpEgress(directory, stub); // 同期記録とstubで通信違反を検出する関数
  });
it("global setupは所有secretを照合し、準備未完了や違反済みのserverを再利用しない",  // 試験ケースを登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    const marker = Symbol.for("mvp.e2e.outbound.guard"); // 一意のsymbolを扱う組込みAPI / 共有symbolを取得するメソッド
    Object.defineProperty(globalThis, marker, { // オブジェクトを扱う組込みAPI / プロパティを定義するメソッド
      value: {
        runId: RUN_ID,
        phase: "browser"
      },
      configurable: true,
    });
    for (const [name, value] of Object.entries({ // オブジェクトを扱う組込みAPI / キーと値の組を列挙するメソッド
      RUN_MVP_TESTS: "1",
      MVP_TEST_DISPOSABLE: "1",
      RUN_MVP_E2E: "1",
      MVP_E2E_SESSION: JSON.stringify({ // JSONへ直列化するメソッド
        runId: RUN_ID,
        secret,
        stubOrigin: stub.origin,
        appOrigin: "https://localhost:3443", // 【修正】Nextのloopback正規化に合わせた専用HTTPS入口
        certificatePin: Buffer.alloc(32).toString("base64"), // バイト列を扱うBuffer API / 指定長のバイト列を生成する関数 / 文字列へ変換するメソッド
        browserExecutable: process.execPath,
      }),
    })) {
      vi.stubEnv(name, value); // 架空の環境変数を設定する関数
    }
    try {
      await expect(verifyMvpE2eOwner()).rejects.toThrow("F12_E2E_OUTBOUND_FAILED"); // 期待値を生成する関数 / 所有runの準備完了を照合するglobal setup関数 / 固定例外を検証するメソッド
      stub.markReady(); // 所有serverの正常応答を確認した後だけreadyへ進める
      await expect(verifyMvpE2eOwner()).resolves.toBeUndefined(); // 期待値を生成する関数 / 所有runの準備完了を照合するglobal setup関数 / 未設定を検証するメソッド
      await fetch(stub.origin + "/violation", { // HTTP通信を実行する関数
        method: "POST",
        headers: {
          "x-mvp-secret": secret
        },
        body: "{}",
      });
      await expect(verifyMvpE2eOwner()).rejects.toThrow("F12_E2E_OUTBOUND_FAILED"); // 期待値を生成する関数 / 所有runの準備完了を照合するglobal setup関数 / 固定例外を検証するメソッド
    }
    finally {
      vi.unstubAllEnvs(); // 架空の環境変数を元へ戻す関数
      Reflect.deleteProperty(globalThis, marker); // プロパティを削除するメソッド
    }
  });
it.each(["remote.invalid:443", "127.0.0.1:54321"])( // 【修正】外部宛とSupabaseへの無制限tunnelを区別して試験登録するメソッド
  "CONNECT先%sをbrowser proxyが拒否し、URL原文を応答へ返さない",
  /**
   * 【修正】許可されたTLS入口以外へのCONNECTは、Supabase宛であっても拒否する。
   */
  async (destination) => { // 【修正】禁止された接続先を検証するコールバック
    const port = Number(new URL(stub.origin).port); // 数値へ変換する関数 / URLを解析・構築するコンストラクター
    const received = await new Promise<string>( // 非同期結果を扱うPromise / 文字列型
      /**
       * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
       */
      (accept, reject) => { // この処理を定義する関数・コールバック / 成功を通知する関数 / 失敗を通知する関数
        const socket = net.connect(port, "127.0.0.1",  // 接続を開始するメソッド
          /**
           * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
           */
          () => { // この処理を定義する関数・コールバック
            const authorization = Buffer.from(RUN_ID + ":" + secret).toString("base64"); // バイト列を扱うBuffer API / 値からバイト列を作る関数・対象を選ぶメソッド / 文字列へ変換するメソッド
            socket.write([ // データを書き込むメソッド
              `CONNECT ${destination} HTTP/1.1`,
              `Host: ${destination}`,
              "Proxy-Authorization: Basic " + authorization,
              "",
              "",
            ].join("\r\n")); // 値を連結するメソッド
          });
        let output = "";
        socket.on("data",  // イベントを監視するメソッド
          /**
           * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
           */
          (data) => { output += String(data); }); // この処理を定義する関数・コールバック / 文字列へ変換する関数
        socket.once("end",  // イベントを一度だけ監視するメソッド
          /**
           * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
           */
          () => accept(output)); // この処理を定義する関数・コールバック / 成功を通知する関数
        socket.once("error", reject); // イベントを一度だけ監視するメソッド / 失敗を通知する関数
      });
    expect(received).toContain("403 Forbidden"); // 期待値を生成する関数 / 含まれる値を検証するメソッド
    expect(received).not.toContain(destination); // 期待値を生成する関数 / 期待値の否定を表すAPI / 含まれる値を検証するメソッド
    expect(stub.status().violations).toBe(1); // 期待値を生成する関数 / 実行全体の遮断件数はresetで消さず、集計だけを返す / 値の一致を検証するメソッド
  });
it("CONNECT中のECONNRESETでもstubの制御と後片付けを継続できる", // 【追加】接続切断の回帰試験を登録する関数
  /**
   * 【追加】所有するCONNECTの受信側へ切断を注入し、制御APIが利用可能なことを確認する。
   */
  async () => { // 【追加】実接続と固定エラーで回収処理を確認するコールバック
    const originalEmit = http.Server.prototype.emit; // 【追加】HTTP serverの元のイベント通知メソッド
    let injected = false;
    vi.spyOn(http.Server.prototype, "emit").mockImplementation( // 【追加】HTTPイベントの監視関数 / 通知を置換するメソッド
      /**
       * 【追加】通常の接続処理を呼んだ後、所有するCONNECTだけへ切断エラーを通知する。
       */
      function ( // 【追加】元のserverを保持する通知関数
        this: http.Server, // 【追加】元のHTTP server型
        event: string | symbol, // 【追加】イベント名の文字列型 / symbol型
        ...args: unknown[] // 【追加】イベント引数の未確定配列型
      ) {
        const result = Reflect.apply(originalEmit, this, [event, ...args]); // 【追加】元のイベント処理を同じthisで呼び出す関数 / 元の通知メソッド
        if (event === "connect") {
          injected = true;
          const socket = args[1] as net.Socket; // 【追加】所有CONNECTの受信socket型アサーション
          const error = Object.assign(new Error("F12_TEST_CONNECTION_RESET"), { // 【追加】固定エラーを作るコンストラクター / エラーコードを付ける関数
            code: "ECONNRESET",
          });
          socket.emit("error", error); // 【追加】受信側の通信切断を再現する通知メソッド
        }
        return result;
      },
    );
    const port = Number(new URL(stub.origin).port); // 【追加】所有proxy URLの解析コンストラクター / ポートの数値化関数
    const authorization = Buffer.from(`${RUN_ID}:${secret}`).toString("base64"); // 【追加】所有認証値のバイト列を作る関数 / Basic認証形式へ変換するメソッド
    await new Promise<void>( // 【追加】接続回収を待つ非同期結果の型 / 戻り値のない型
      /**
       * 【追加】所有proxyへ接続し、受信側の切断で接続が閉じるまで待つ。
       */
      (accept, reject) => { // 【追加】接続の完了と失敗を受け取るコールバック
        const socket = net.connect(port, "127.0.0.1", // 【追加】所有proxyだけへ接続する関数
          /**
           * 【追加】当該実行の資格情報で許可されたローカルCONNECTだけを要求する。
           */
          () => { // 【追加】所有proxyとの接続後のコールバック
            socket.write([ // 【追加】所有するCONNECT要求だけを送信するメソッド
              "CONNECT localhost:3443 HTTP/1.1", // 【修正】Nextのloopback正規化に合わせた専用HTTPS入口
              "Host: localhost:3443", // 【修正】Nextのloopback正規化に合わせた専用HTTPS入口
              "Proxy-Authorization: Basic " + authorization,
              "",
              "",
            ].join("\r\n")); // 【追加】HTTP要求を改行で連結するメソッド
          },
        );
        socket.resume(); // 【追加】応答を消費し、接続の終端を受け取るメソッド
        socket.once("error", reject); // 【追加】接続失敗を登録するメソッド / 試験失敗を通知する関数
        socket.once("close", // 【追加】接続の終了を一度だけ受け取るメソッド
          /**
           * 【追加】当該接続の回収完了を通知する。
           */
          () => accept(), // 【追加】完了を通知するコールバック / 非同期結果を完了する関数
        );
      },
    );
    expect(injected).toBe(true); // 【追加】期待値の生成関数 / 切断が注入されたことを確認するメソッド
    expect((await control({ action: "status" })).status).toBe(200); // 【追加】期待値の生成関数 / 所有制御要求の関数 / 制御継続を確認するメソッド
    expect(stub.status().violations).toBe(0); // 【追加】期待値の生成関数 / 違反件数を取得する関数 / 通信制約の維持を確認するメソッド
  },
);
it("TLSは所有証明書を検証し、所有runの応答だけを中継する",  // 試験ケースを登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    const certificate = await createMvpCertificate(directory); // 所有一時領域でTLS証明書を生成する関数
    const parsed = new X509Certificate(certificate.cert); // 【追加】一時証明書を解析するコンストラクター
    expect(parsed.checkIP("127.0.0.1")).toBe("127.0.0.1"); // 【追加】期待値生成関数 / IPの証明書検証メソッド / 一致検証メソッド
    expect(parsed.checkHost("localhost")).toBe("localhost"); // 【追加】期待値生成関数 / proxyが使用するhostの証明書検証メソッド / 一致検証メソッド
    expect(parsed.checkHost("remote.invalid")).toBeUndefined(); // 【追加】期待値生成関数 / hostの証明書検証メソッド / 外部hostを許さない検証メソッド
    expect(statSync(join(directory, "key.pem")).mode & 0o777).toBe(0o600); // 期待値を生成する関数 / 所有ファイルの属性を調べる関数 / パスを結合する関数 / 値の一致を検証するメソッド
    const backend = http.createServer( // serverを生成する関数
      /**
       * 所有serverのrequestを受け取り、この接続の応答処理を実行するコールバック。
       */
      (request, response) => { // この処理を定義する関数・コールバック
        expect(request.headers["x-mvp-upstream-secret"]).toBe(secret); // 期待値を生成する関数 / 値の一致を検証するメソッド
        expect(request.headers["x-forwarded-proto"]).toBe("https"); // 期待値を生成する関数 / 値の一致を検証するメソッド
        response.setHeader("x-mvp-application-run", RUN_ID); // 応答headerを設定するメソッド
        response.end("owned"); // 送信・応答を終了するメソッド
      });
    cleanup.push(ownMvpServer(backend)); // 配列へ要素を追加するメソッド / 所有serverと接続の回収関数を作る関数
    const port = await listenMvpServer(backend, 0); // 所有serverをloopbackへbindする関数
    const tls = await startMvpTls(certificate, { // 同じrunのNextへ中継するHTTPS入口を起動する関数
      runId: RUN_ID,
      secret
    }, {
      frontend: 0,
      backend: port
    });
    cleanup.push(tls.close); // 配列へ要素を追加するメソッド / 所有資源を閉じる関数・メソッド
    const status = await new Promise<number | undefined>( // 非同期結果を扱うPromise / 数値型
      /**
       * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
       */
      (accept, reject) => { // この処理を定義する関数・コールバック / 成功を通知する関数 / 失敗を通知する関数
        https.get("https://127.0.0.1:" + tls.port, { // 取得する関数・メソッド
          ca: certificate.cert
        },
          /**
           * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
           */
          (response) => { // この処理を定義する関数・コールバック
            response.resume(); // streamを読み進めるメソッド
            accept(response.statusCode); // 成功を通知する関数
          }).once("error", reject); // イベントを一度だけ監視するメソッド / 失敗を通知する関数
      });
    expect(status).toBe(200); // 期待値を生成する関数 / 値の一致を検証するメソッド
    expect(certificate.pin).toMatch(/^[A-Za-z0-9+/]{43}=$/u); // 期待値を生成する関数 / 書式を検証するメソッド
  });
it("guard不成立ではSDK・server・子プロセスを起動せず固定文で失敗する",  // 試験ケースを登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    await expect(runMvpE2e({ // 期待値を生成する関数 / 専用環境でproduction E2Eと資源回収を実行する関数
      environment: {},
      checkoutDirectory: ROOT
    })).rejects.toThrow("F12_E2E_FAILED"); // 固定例外を検証するメソッド
    expect( // 期待値を生成する関数
      /**
       * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
       */
      () => readMvpE2eSession({})).toThrow("F12_E2E_OUTBOUND_FAILED"); // この処理を定義する関数・コールバック / preload・明示flag・接続契約を検証する関数 / 固定例外を検証するメソッド
  });
it("子の起動失敗とtimeoutを成功にせず、停止完了まで待つ",  // 試験ケースを登録する関数
  /**
   * 架空設定と所有資源だけで、このケースの準備・検証・後片付けを実行する。
   */
  async () => { // この処理を定義する関数・コールバック
    const failed = startMvpChild({ // 所有する子プロセス群を起動する関数
      file: join(directory, "missing"), // パスを結合する関数
      args: [],
      cwd: ROOT,
      env: {
        NODE_ENV: "test"
      }
    });
    await expect(waitMvpChild(failed, 1000)).rejects.toThrow("F12_E2E_FAILED"); // 期待値を生成する関数 / 子の終了・期限超過・中断を検証する関数 / 固定例外を検証するメソッド
    const waiting = startMvpChild({ // 所有する子プロセス群を起動する関数
      file: process.execPath,
      args: [
        "-e",
        "setInterval(()=>{},1000)"
      ],
      cwd: ROOT,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test"
      },
    });
    cleanup.push(waiting.stop); // 配列へ要素を追加するメソッド / 所有プロセス群の停止
    await expect(waitMvpChild(waiting, 50)).rejects.toThrow("F12_E2E_FAILED"); // 期待値を生成する関数 / 子の終了・期限超過・中断を検証する関数 / 固定例外を検証するメソッド
    expect(waiting.finished()).toBe(true); // 期待値を生成する関数 / 終了済み判定 / 値の一致を検証するメソッド
  });
/**
 * Playwrightの実成功1件の最小JSONを作り、ブラウザー自体は起動しない。
 */
function successfulReport() { // この処理を定義する関数・コールバック / Playwrightの実成功1件の最小JSONを作り、ブラウザー自体は起動しない
  return {
    errors: [] as unknown[], // 未確定の値の型
    stats: {
      expected: 1,
      unexpected: 0,
      flaky: 0,
      skipped: 0
    },
    suites: [{
      specs: [{
        tests: [{
          projectName: "chromium",
          expectedStatus: "passed",
          status: "expected",
          results: [{
            status: "passed",
            errors: []
          }],
        }],
      }],
    }],
  };
}
it.each([ // 試験ケースを登録する関数 / パラメーター別試験を登録するメソッド
  "skip",
  "empty",
  "retry",
  "expected-failure",
  "hook-error"
])("%sをE2E完了として集計しない",
  /**
   * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
   */
  (mode) => { // この処理を定義する関数・コールバック
    const report = successfulReport(); // Playwrightの実成功1件の最小JSONを作り、ブラウザー自体は起動しない
    expect(assertMvpE2eReport(report)).toBe(1); // 期待値を生成する関数 / Playwright JSONで実成功・skipなしを検証する関数 / 値の一致を検証するメソッド
    if (mode === "skip") {
      report.stats.skipped = 1;
    } else if (mode === "empty") {
      report.suites = [];
    } else if (mode === "retry") {
      report.suites[0].specs[0].tests[0].results.push({ // 配列へ要素を追加するメソッド
        status: "passed",
        errors: []
      });
    } else if (mode === "expected-failure") {
      report.suites[0].specs[0].tests[0].expectedStatus = "failed";
    } else {
      report.errors = [PRIVATE];
    }
    expect( // 期待値を生成する関数
      /**
       * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
       */
      () => assertMvpE2eReport(report)).toThrow("F12_E2E_FAILED"); // この処理を定義する関数・コールバック / Playwright JSONで実成功・skipなしを検証する関数 / 固定例外を検証するメソッド
  });
