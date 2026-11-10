// tests/mvp/outbound-preload.mjs
// runnerが所有するNode子プロセスへ明示適用し、fetchと非fetchの外向き接続を制限する。
// @ts-check
import childProcess from "node:child_process";
import dgram from "node:dgram";
import http from "node:http";
import {
  syncBuiltinESMExports,
} from "node:module";
import net from "node:net";
import {
  isAbsolute,
  resolve,
  sep,
} from "node:path";
import {
  appendFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import workers from "node:worker_threads";
import {
  promisify,
} from "node:util";
const FAILURE = "F12_OUTBOUND_BLOCKED";
const originalFetch = globalThis.fetch; // 遮断適用前のHTTP通信関数 / HTTP通信を実行する関数
const raw = process.env.MVP_E2E_PRELOAD;
const ownImport = "--import=" + import.meta.url;
/**
 * Node子プロセスへ渡す、runner所有の接続・起動契約。
 * @typedef {object} PreloadConfiguration
 * @property {string} runId 実行識別子。
 * @property {string} secret 制御secret。
 * @property {string} stubOrigin 専用HTTP stub。
 * @property {string} supabaseOrigin 実Auth・Storageのloopback。
 * @property {string} checkoutDirectory .envのない専用checkout。
 * @property {string} runtimeDirectory この実行だけの一時領域。
 * @property {string} workerPreload 同じ遮断ソースから生成した同期thread preload。
 * @property {"build" | "start" | "browser"} phase 子プロセスの段階。
 * @property {string} [browserExecutable] browser段階の登録済み実体パス。
 * @property {string} [certificatePin] browser段階の公開鍵pin。
 */
/**
 * 不足・別接続先・dotenv自動読込を、SDK初期化より前に拒否する。
 * @returns {PreloadConfiguration} 検証した実行契約。
 */
function configuration() { // この処理を定義する関数・コールバック / 不足・別接続先・dotenv自動読込を、SDK初期化より前に拒否する
  try {
    const value = JSON.parse(raw ?? ""); // JSONを解析するメソッド
    if (!value ||
      !/^[0-9a-f]{32}$/u.test(value.runId) || // 正規表現の一致を調べるメソッド
      !/^[0-9a-f]{64}$/u.test(value.secret) || // 正規表現の一致を調べるメソッド
      !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(value.stubOrigin) || // 正規表現の一致を調べるメソッド
      new URL(value.stubOrigin).origin !== value.stubOrigin || // URLを解析・構築するコンストラクター
      !/^http:\/\/(?:127\.0\.0\.1|localhost):54321$/u.test(value.supabaseOrigin) || // 正規表現の一致を調べるメソッド
      ![
        "build",
        "start",
        "browser"
      ].includes(value.phase) || // 値が含まれるか調べるメソッド
      (value.phase === "browser" &&
        (typeof value.browserExecutable !== "string" ||
          !isAbsolute(value.browserExecutable) || // 絶対パスか判定する関数
          realpathSync(value.browserExecutable) !== value.browserExecutable || // パスの実体を解決する関数
          !/^[A-Za-z0-9+/]{43}=$/u.test(value.certificatePin))) || // 正規表現の一致を調べるメソッド
      !isAbsolute(value.runtimeDirectory) || // 絶対パスか判定する関数
      !isAbsolute(value.checkoutDirectory) || // 絶対パスか判定する関数
      value.workerPreload !== resolve(realpathSync(value.runtimeDirectory), "worker-preload.cjs") || // 絶対パスを解決する関数 / パスの実体を解決する関数
      realpathSync(value.workerPreload) !== value.workerPreload || // パスの実体を解決する関数
      realpathSync(process.cwd()) !== realpathSync(value.checkoutDirectory) || // パスの実体を解決する関数 / 現在の作業ディレクトリを返すメソッド
      readdirSync(process.cwd()).some( // ファイル名だけを列挙する関数 / 現在の作業ディレクトリを返すメソッド / 一致する要素の有無を調べるメソッド
        /**
         * 各要素が、この処理の照合条件に一致するかを判定するコールバック。
         */
        (name) => /^\.env(?:\.(?:local|development(?:\.local)?|test(?:\.local)?|production.*))?$/u.test(name))) { // この処理を定義する関数・コールバック / 正規表現の一致を調べるメソッド
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    return value;
  } catch {
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
}
const config = configuration(); // 不足・別接続先・dotenv自動読込を、SDK初期化より前に拒否する
const allowedPorts = new Set([ // 重複のない集合
  3000,
  3443,
  54321,
  54322,
  Number(new URL(config.stubOrigin).port) // 数値へ変換する関数 / URLを解析・構築するコンストラクター
]);
let reporting = false;
/**
 * 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない。
 */
function blocked() { // この処理を定義する関数・コールバック / 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
  process.exitCode = 1;
  try {
    appendFileSync(resolve(config.runtimeDirectory, "violations.log"), "1\n", { // 固定の違反記録を追記する関数 / 絶対パスを解決する関数
      mode: 0o600
    });
  } catch {
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
  if (!reporting) {
    reporting = true;
    void originalFetch(config.stubOrigin + "/violation", { // 遮断適用前のHTTP通信関数
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mvp-secret": config.secret,
      },
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(1000), // 中断signalのAPI / 期限付き中断signalを作るメソッド
    }).catch( // 例外を処理するメソッド
      /**
       * 例外を処理し、原文を公開せずに失敗状態を扱うコールバック。
       */
      () => undefined).finally( // この処理を定義する関数・コールバック / 終了時の処理を登録するメソッド
        /**
         * 非同期処理の終了後に、登録した後処理を実行するコールバック。
         */
        () => { // この処理を定義する関数・コールバック
          reporting = false;
        });
  }
  return new Error(FAILURE); // 固定例外のコンストラクター
}
/**
 * TCP接続前にhost・portを照合し、未知のDNS名・IP・Unix socketを拒否する。
 * @param {unknown[]} input Nodeのconnect引数。
 * @returns {unknown[]} 接続先を数値loopbackへ固定した引数。
 */
function assertSocket(input) { // この処理を定義する関数・コールバック / TCP接続前にhost・portを照合し、未知のDNS名・IP・Unix socketを拒否する
  const args = Array.isArray(input[0]) // 配列かどうかを判定するメソッド
    ? input[0]
    : input; // 配列を扱う組込みAPI / 配列か判定するメソッド
  const first = args[0];
  const options = first &&
    typeof first === "object"
    ? /** @type {{host?: unknown, port?: unknown, path?: unknown}} */ (first)
    : {
      port: first,
      host: typeof args[1] === "string"
        ? args[1]
        : "localhost",
      path: undefined
    };
  if (options.path !== undefined &&
    options.path !== null) {
    let owned = false;
    try {
      owned = typeof options.path === "string" &&
        realpathSync(options.path).startsWith(realpathSync(config.runtimeDirectory) + sep); // パスの実体を解決する関数 / 所有領域内か照合するメソッド
    } catch {
      // 不在パスや権限エラーも、原文を公開せず同じ遮断結果へ統一する。
    }
    if (!owned) {
      throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
    }
    return args;
  }
  if (![
    "127.0.0.1",
    "localhost",
    "::1"
  ].includes(String(options.host ?? "localhost")) || // 値が含まれるか調べるメソッド / 文字列へ変換する関数
    !allowedPorts.has(Number(options.port))) { // 登録の有無を調べるメソッド / 数値へ変換する関数
    throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
  }
  const checked = {
    ...options,
    host: options.host === "::1"
      ? "::1"
      : "127.0.0.1",
    lookup: undefined,
  };
  return [
    checked,
    ...args.filter( // 条件に一致する要素を抽出するメソッド
      /**
       * 各要素が、この処理の照合条件に一致するかを判定するコールバック。
       */
      (value) => typeof value === "function") // この処理を定義する関数・コールバック
  ];
}
const originalConnect = net.Socket.prototype.connect; // 遮断適用前のsocket接続メソッド / socketのコンストラクター / 接続を開始するメソッド
/**
 * 既存の全HTTP・HTTPS・undici・pgからのTCP接続を同じallowlistで検証する。
 * @this {import("node:net").Socket}
 * @param {...unknown} args Nodeのconnect引数。
 */
net.Socket.prototype.connect = function(...args) { // socketのコンストラクター / 接続を開始するメソッド / この処理を定義する関数・コールバック
  return Reflect.apply(originalConnect, this, assertSocket(args)); // 既存関数を指定したthisと引数で呼ぶメソッド / 遮断適用前のsocket接続メソッド / TCP接続前にhost・portを照合し、未知のDNS名・IP・Unix socketを拒否する
};
/**
 * このE2Eで不要なUDP送信を、宛先やpayloadを出さず拒否する。
 */
dgram.Socket.prototype.send = function() { // socketのコンストラクター / UDP送信メソッド / この処理を定義する関数・コールバック
  throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
};
/**
 * stubから返された故障指定をSDKが実際に受け取る通信例外へ変換する。
 * @param {Response} response stub応答。
 */
function fault(response) { // この処理を定義する関数・コールバック / stubから返された故障指定をSDKが実際に受け取る通信例外へ変換する
  const mode = response.headers.get("x-mvp-fault"); // 取得する関数・メソッド
  if (mode === "timeout") {
    throw new DOMException(FAILURE, "TimeoutError"); // 通信例外を生成するコンストラクター
  }
  if (mode === "network") {
    throw new TypeError(FAILURE); // 型関連の例外コンストラクター
  }
  return response;
}
/**
 * 正確なResend・LINE受付だけをstubへ送り、ローカルAuth・Storageは実通信へ渡す。
 * @param {Parameters<typeof fetch>[0]} input fetch入力。
 * @param {Parameters<typeof fetch>[1]} [init] fetch設定。
 */
globalThis.fetch = async function(input, init) { // HTTP通信を実行する関数 / この処理を定義する関数・コールバック
  const url = new URL(input instanceof Request // URLを解析・構築するコンストラクター / Request入力の判定
    ? input.url
    : String(input)); // URLを解析・構築するコンストラクター / fetch入力をまとめるコンストラクター / 文字列へ変換する関数
  if (url.username ||
    url.password ||
    url.hash) {
    throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
  }
  const channel = url.href === "https://api.resend.com/emails"
    ? "resend"
    :
    url.href === "https://api.line.me/v2/bot/message/push"
      ? "line"
      : undefined;
  const method = String(init?.method ?? (input instanceof Request // 文字列へ変換する関数 / Request入力の判定
    ? input.method
    : "GET")).toUpperCase(); // 文字列へ変換する関数 / fetch入力をまとめるコンストラクター / 文字列を大文字にするメソッド
  const localService = url.origin === config.supabaseOrigin &&
    /^\/(?:auth|storage)\/v1\//u.test(url.pathname); // 正規表現の一致を調べるメソッド
  const owned = url.origin === config.stubOrigin ||
    url.origin === "http://127.0.0.1:3000" ||
    url.origin === "https://localhost:3443"; // 【修正】Nextのloopback正規化に合わせた専用HTTPS入口
  if ((!channel ||
    method !== "POST") &&
    !localService &&
    !owned) {
    throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
  }
  const request = new Request(input, init); // fetch入力をまとめるコンストラクター
  if (channel &&
    request.method === "POST") {
    return fault(await originalFetch(config.stubOrigin + "/send/" + channel, { // stubから返された故障指定をSDKが実際に受け取る通信例外へ変換する / 遮断適用前のHTTP通信関数
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mvp-secret": config.secret,
        "x-mvp-idempotency": request.headers.get(channel === "resend" // headerを取得するメソッド
          ? "idempotency-key"
          : "x-line-retry-key") ?? "", // 取得する関数・メソッド
      },
      body: await request.text(), // 本文を文字列で読み取るメソッド
      signal: request.signal,
      redirect: "error",
    }));
  }
  if (localService) {
    if (url.pathname.startsWith("/storage/v1/object/")) { // 文字列の先頭を照合するメソッド
      // 【追加】removeの本文はcloneだけを読み、元のrequestを変更せず転送する。
      let paths = [url.pathname];
      if (request.method === "DELETE" &&
        /^\/storage\/v1\/object\/[a-z0-9-]+$/u.test(url.pathname)) { // 【追加】bucket単位のremove APIだけを判定するメソッド
        const payload = await request.clone().json(); // 【追加】元の本文を消費せず複製するメソッド / JSONを解析するメソッド
        if (!Array.isArray(payload.prefixes) || // 【追加】削除対象が配列かを検証する関数
          payload.prefixes.length === 0 ||
          payload.prefixes.length > 100) {
          throw blocked(); // 【追加】対象を照合できない削除要求を遮断する関数
        }
        paths = [];
        for (const path of payload.prefixes) {
          if (typeof path !== "string" ||
            !/^clubs\/[0-9a-f-]{36}\/(?:events|notices)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/u
              .test(path)) { // 【追加】正規の添付object pathだけを許すメソッド
            throw blocked(); // 【追加】照合を迂回する表記を遮断する関数
          }
          paths.push(url.pathname + "/" + path); // 【追加】removeの実対象を故障照合へ追加するメソッド
        }
      }
      for (const path of paths) {
        const answer = await originalFetch(config.stubOrigin + "/storage", { // 遮断適用前のHTTP通信関数
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mvp-secret": config.secret,
          },
          body: JSON.stringify({ // JSONへ直列化するメソッド
            method: request.method,
            path
          }),
          signal: request.signal,
          redirect: "error",
        });
        if (!answer.ok) {
          throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
        }
        const decision = await answer.json(); // JSON応答を読み取るメソッド
        if (decision.mode !== "success") {
          const headers = new Headers({ // HTTP headerを扱うコンストラクター
            "Content-Type": "application/json"
          });
          if (decision.mode === "timeout" ||
            decision.mode === "network") {
            headers.set("x-mvp-fault", decision.mode); // 値を設定するメソッド
          }
          return fault(new Response(JSON.stringify({ // stubから返された故障指定をSDKが実際に受け取る通信例外へ変換する / HTTP応答を生成するコンストラクター / JSONへ直列化するメソッド
            message: decision.sentinel === `F12_FAKE_SENTINEL_${config.runId}_storage`
              ? decision.sentinel
              : "F12_STORAGE_FAILURE", // 【追加】当該runの架空値だけをStorage SDKへ返す
          }), {
            status: decision.mode === "rejected"
              ? 400
              : 503,
            headers,
          }));
        }
      }
    }
    return await originalFetch(request, { // 遮断適用前のHTTP通信関数
      redirect: "error"
    });
  }
  if (owned) {
    return await originalFetch(request, { // 遮断適用前のHTTP通信関数
      redirect: "error"
    });
  }
  throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
};
const originalSpawn = childProcess.spawn; // 元の子プロセス起動関数 / 子プロセスを起動する関数
const originalExecFile = childProcess.execFile; // 元の非shell子プロセス起動関数 / 非shell子プロセスを起動する関数
const originalFork = childProcess.fork; // 元のNode fork起動関数 / Node子プロセスを起動する関数
const shells = new Set([ // 重複のない集合
  "npm run env:validate",
  "node scripts/validate-env.mjs",
  "prisma generate && next build",
  "next start --hostname 127.0.0.1 --port 3000",
]);
/**
 * Node workerと既存npm lifecycleだけを許可し、任意shell・curl等へ逃がさない。
 * @param {string} file 実行ファイル。
 * @param {unknown[]} args 起動引数。
 */
function assertChild(file, args) { // この処理を定義する関数・コールバック / Node workerと既存npm lifecycleだけを許可し、任意shell・curl等へ逃がさない
  if (file === process.execPath ||
    file === "node") {
    if (args.some( // 一致する要素の有無を調べるメソッド
      /**
       * 各要素が、この処理の照合条件に一致するかを判定するコールバック。
       */
      (value) => typeof value !== "string" || // この処理を定義する関数・コールバック
        /^(?:-r|--require|--import|--loader|--experimental-loader)(?:=|$)/u.test(value))) { // 正規表現の一致を調べるメソッド
      throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
    }
    return;
  }
  if ((file === "/bin/sh" ||
    file === "sh") &&
    args.length === 2 &&
    args[0] === "-c" &&
    typeof args[1] === "string" &&
    shells.has(args[1])) { // 登録の有無を調べるメソッド
    return;
  }
  throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
}
/**
 * 子が環境やexecArgvを作り直しても、同じpreloaderを必ず引き継ぐ。
 * @param {Record<string, unknown> | undefined} options 元の起動設定。
 */
function childOptions(options) { // この処理を定義する関数・コールバック / 子が環境やexecArgvを作り直しても、同じpreloaderを必ず引き継ぐ
  return {
    ...options,
    shell: false,
    detached: false,
    env: {
      ...process.env,
      ... /** @type {NodeJS.ProcessEnv} */(options?.env ?? {}),
      NODE_OPTIONS: ownImport,
      MVP_E2E_PRELOAD: raw,
      NODE_ENV: "production",
    },
  };
}
/**
 * Node・既存lifecycleだけを同じ通信制約付きで起動する。
 * @param {string} file 実行ファイル。
 * @param {unknown[] | Record<string, unknown>} [input] 起動引数または設定。
 * @param {Record<string, unknown>} [options] 起動設定。
 */
function guardedSpawn(file, input = [], options = {}) { // この処理を定義する関数・コールバック / Node・既存lifecycleだけを同じ通信制約付きで起動する
  const args = Array.isArray(input) // 配列かどうかを判定するメソッド
    ? input
    : []; // 配列を扱う組込みAPI / 配列か判定するメソッド
  const settings = Array.isArray(input) // 配列かどうかを判定するメソッド
    ? options
    : input; // 配列を扱う組込みAPI / 配列か判定するメソッド
  if (config.phase === "browser" &&
    file === config.browserExecutable) {
    if (args.filter( // 条件に一致する要素を抽出するメソッド
      /**
       * 各要素が、この処理の照合条件に一致するかを判定するコールバック。
       */
      (arg) => String(arg).startsWith("--proxy-server=")).length !== 1 || // この処理を定義する関数・コールバック / 文字列へ変換する関数 / 文字列の先頭を照合するメソッド
      !args.includes("--proxy-server=" + config.stubOrigin) || // 値が含まれるか調べるメソッド
      args.filter( // 条件に一致する要素を抽出するメソッド
        /**
         * 各要素が、この処理の照合条件に一致するかを判定するコールバック。
         */
        (arg) => String(arg).startsWith("--proxy-bypass-list=")).length !== 1 || // この処理を定義する関数・コールバック / 文字列へ変換する関数 / 文字列の先頭を照合するメソッド
      !args.includes("--proxy-bypass-list=<-loopback>") || // 値が含まれるか調べるメソッド
      args.filter( // 条件に一致する要素を抽出するメソッド
        /**
         * 各要素が、この処理の照合条件に一致するかを判定するコールバック。
         */
        (arg) => String(arg).startsWith("--ignore-certificate-errors-spki-list=")).length !== 1 || // この処理を定義する関数・コールバック / 文字列へ変換する関数 / 文字列の先頭を照合するメソッド
      !args.includes("--ignore-certificate-errors-spki-list=" + config.certificatePin) || // 値が含まれるか調べるメソッド
      !args.includes("--disable-quic") || // 値が含まれるか調べるメソッド
      args.some( // 一致する要素の有無を調べるメソッド
        /**
         * 各要素が、この処理の照合条件に一致するかを判定するコールバック。
         */
        (arg) => /^(?:--no-proxy-server|--proxy-pac-url|--proxy-auto-detect|--enable-quic|--ignore-certificate-errors(?:=|$)|--disable-web-security)/u.test(String(arg)))) { // この処理を定義する関数・コールバック / 正規表現の一致を調べるメソッド / 文字列へ変換する関数
      throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
    }
    return Reflect.apply(originalSpawn, childProcess, [ // 既存関数を指定したthisと引数で呼ぶメソッド / 元の子プロセス起動関数
      file,
      args,
      {
        ...settings,
        shell: false,
        detached: false,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: resolve(config.runtimeDirectory, "tmp"), // 絶対パスを解決する関数
          TZ: "UTC",
        },
      }
    ]);
  }
  assertChild(file, args); // Node workerと既存npm lifecycleだけを許可し、任意shell・curl等へ逃がさない
  return Reflect.apply(originalSpawn, childProcess, [ // 既存関数を指定したthisと引数で呼ぶメソッド / 元の子プロセス起動関数
    file,
    args,
    childOptions(settings) // 子が環境やexecArgvを作り直しても、同じpreloaderを必ず引き継ぐ
  ]);
}
Object.defineProperty(childProcess, "spawn", { // オブジェクトを扱う組込みAPI / プロパティを定義するメソッド
  value: guardedSpawn // 置き換える関数 / Node・既存lifecycleだけを同じ通信制約付きで起動する
});
/**
 * 非shellのNode起動にもpreloaderを適用する。
 * @param {...unknown} input execFile引数。
 */
function guardedExecFile(...input) { // この処理を定義する関数・コールバック / 非shellのNode起動にもpreloaderを適用する
  const file = String(input[0]); // 文字列へ変換する関数
  const args = Array.isArray(input[1]) // 配列かどうかを判定するメソッド
    ? input[1]
    : []; // 配列を扱う組込みAPI / 配列か判定するメソッド
  assertChild(file, args); // Node workerと既存npm lifecycleだけを許可し、任意shell・curl等へ逃がさない
  const index = Array.isArray(input[1]) // 配列かどうかを判定するメソッド
    ? 2
    : 1; // 配列を扱う組込みAPI / 配列か判定するメソッド
  const options = input[index] &&
    typeof input[index] === "object"
    ? input[index]
    : {};
  const callback = typeof input[index] === "function"
    ? input[index]
    : input[index + 1];
  return Reflect.apply(originalExecFile, childProcess, [ // 既存関数を指定したthisと引数で呼ぶメソッド / 元の非shell子プロセス起動関数
    file,
    args,
    childOptions( // 子が環境やexecArgvを作り直しても、同じpreloaderを必ず引き継ぐ
    /** @type {Record<string, unknown>} */(options)),
    callback // 子プロセスの終了結果を受け取る関数
  ]);
}
Object.defineProperty(childProcess, "execFile", { // オブジェクトを扱う組込みAPI / プロパティを定義するメソッド
  value: guardedExecFile // 置き換える関数 / 非shellのNode起動にもpreloaderを適用する
});
/**
 * execFileのPromise版も同じ検証・preloaderを通し、stdoutとstderrを外部へ反射しない。
 */
Object.defineProperty(guardedExecFile, promisify.custom, { // オブジェクトを扱う組込みAPI / プロパティを定義するメソッド / 非shellのNode起動にもpreloaderを適用する / Promise版の非同期APIを扱う関数
  /**
   * 可変長の起動引数を受け、検証済みexecFileの結果をPromiseとして返す。
   * @param {...unknown} args execFile引数。
   */
  value: (...args) => new Promise( // 置き換える関数 / この処理を定義する関数・コールバック / 非同期結果を扱うPromise
    /**
     * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
     */
    (accept, reject) => { // この処理を定義する関数・コールバック / 成功を通知する関数 / 失敗を通知する関数
      guardedExecFile(...args,  // 非shellのNode起動にもpreloaderを適用する
        /**
         * 子プロセスの失敗は固定例外へ変え、成功時だけ標準出力と標準エラーを返す。
         * @param {Error | null} error 終了例外。
         * @param {string} stdout 標準出力。
         * @param {string} stderr 標準エラー。
         */
        (error, stdout, stderr) => error // 【追加】入力を受け取り操作・照合するコールバック
          ? reject(new Error(FAILURE)) // 失敗を通知する関数 / 固定例外のコンストラクター
          : accept({ // 成功時の標準出力と標準エラーを返す関数
            stdout,
            stderr
          }));
    }),
});
/**
 * Nextのfork workerへも、同じpreloaderと専用環境を強制する。
 * @param {string | URL} modulePath workerのmodule。
 * @param {unknown[] | Record<string, unknown>} [input] worker引数または設定。
 * @param {Record<string, unknown>} [options] worker設定。
 */
function guardedFork(modulePath, input = [], options = {}) { // この処理を定義する関数・コールバック / Nextのfork workerへも、同じpreloaderと専用環境を強制する
  const args = Array.isArray(input) // 配列かどうかを判定するメソッド
    ? input
    : []; // 配列を扱う組込みAPI / 配列か判定するメソッド
  const settings = Array.isArray(input) // 配列かどうかを判定するメソッド
    ? options
    : input; // 配列を扱う組込みAPI / 配列か判定するメソッド
  return Reflect.apply(originalFork, childProcess, [ // 既存関数を指定したthisと引数で呼ぶメソッド / 元のNode fork起動関数
    modulePath,
    args,
    {
      ...childOptions(settings), // 子が環境やexecArgvを作り直しても、同じpreloaderを必ず引き継ぐ
      execArgv: [],
    }
  ]);
}
Object.defineProperty(childProcess, "fork", { // オブジェクトを扱う組込みAPI / プロパティを定義するメソッド
  value: guardedFork // 置き換える関数 / Nextのfork workerへも、同じpreloaderと専用環境を強制する
});
/**
 * 任意shellや同期外部コマンドで通信制約を回避することを拒否する。
 * @returns {never} 必ず固定例外で終了する。
 */
function denyCommand() { // この処理を定義する関数・コールバック / 任意shellや同期外部コマンドで通信制約を回避することを拒否する
  throw blocked(); // 原文を送らず遮断件数だけを通知し、SDKが例外を吸収してもrunを成功にしない
}
Object.defineProperty(childProcess, "exec", { // オブジェクトを扱う組込みAPI / プロパティを定義するメソッド
  value: denyCommand // 置き換える関数 / 任意shellや同期外部コマンドで通信制約を回避することを拒否する
});
childProcess.execSync = denyCommand; // 同期shellコマンドの実行関数 / 任意shellや同期外部コマンドで通信制約を回避することを拒否する
childProcess.execFileSync = denyCommand; // 同期の非shell子プロセス起動関数 / 任意shellや同期外部コマンドで通信制約を回避することを拒否する
childProcess.spawnSync = denyCommand; // 同期の子プロセス起動関数 / 任意shellや同期外部コマンドで通信制約を回避することを拒否する
const OriginalWorker = workers.Worker; // 元のNode worker threadのコンストラクター / Node worker threadのコンストラクター
/**
 * eval入口でも先に同期preloadを実行し、呼出し側のenv・execArgvで解除できなくする。
 */
workers.Worker = class MvpWorker extends OriginalWorker { // Node worker threadのコンストラクター / eval入口でも先に同期preloadを実行し、呼出し側のenv・execArgvで解除できなくする / 元のNode worker threadのコンストラクター
  /**
   * 同一ソースのCommonJS preloadを、worker本体より前にrequireする。
   * @param {string | URL} filename worker module。
   * @param {import("node:worker_threads").WorkerOptions} [options] worker設定。
   */
  constructor(filename, options = {}) { // この処理を定義する関数・コールバック
    super(filename, { // 親のWorkerコンストラクター
      ...options,
      env: {
        ...childOptions({ // 子が環境やexecArgvを作り直しても、同じpreloaderを必ず引き継ぐ
          env: options.env
        }).env,
        NODE_OPTIONS: "",
      },
      execArgv: [
        "--require",
        config.workerPreload
      ],
    });
  }
};
if (config.phase === "start") {
  const originalCreateServer = http.createServer; // 元のHTTP server生成関数 / serverを生成する関数
  /**
   * Nextのrequest listenerを所有確認で包み、他serverの応答を再利用しない。
   * @param {...unknown} input createServerの引数。
   */
  function createOwnedServer(...input) { // この処理を定義する関数・コールバック / Nextのrequest listenerを所有確認で包み、他serverの応答を再利用しない
    const index = input.findIndex( // 一致する要素の位置を探すメソッド
      /**
       * 各要素が、この処理の照合条件に一致するかを判定するコールバック。
       */
      (value) => typeof value === "function"); // この処理を定義する関数・コールバック
    if (index >= 0) {
      const listener = /** @type {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => unknown} */ (input[index]); // Nextから渡されたrequest処理関数
      /**
       * TLS proxyの内部secretを確認し、通常の認可へ渡す前にheaderから除く。
       * @this {import("node:http").Server}
       * @param {import("node:http").IncomingMessage} request request。
       * @param {import("node:http").ServerResponse} response response。
       */
      input[index] = function(request, response) { // この処理を定義する関数・コールバック
        if (request.headers["x-mvp-upstream-secret"] !== config.secret) {
          response.writeHead(404); // HTTP状態とheaderを設定するメソッド
          response.end(); // 送信・応答を終了するメソッド
          return;
        }
        delete request.headers["x-mvp-upstream-secret"];
        const originalWriteHead = response.writeHead; // 元のHTTP header送信メソッド / HTTP状態とheaderを設定するメソッド
        /**
         * Nextがheaderを作り直した後も、送信直前に所有runの印を付ける。
         * @this {import("node:http").ServerResponse}
         * @param {...unknown} args writeHead引数。
         */
        response.writeHead = function(...args) { // HTTP状態とheaderを設定するメソッド / この処理を定義する関数・コールバック
          response.setHeader("x-mvp-application-run", config.runId); // 応答headerを設定するメソッド
          return Reflect.apply(originalWriteHead, this, args); // 既存関数を指定したthisと引数で呼ぶメソッド / 元のHTTP header送信メソッド
        };
        return Reflect.apply(listener, this, [ // request処理関数を元のthisと引数で呼び出すメソッド
          request,
          response
        ]);
      };
    }
    const server = Reflect.apply(originalCreateServer, http, input); // 既存関数を指定したthisと引数で呼ぶメソッド / 元のHTTP server生成関数
    return server;
  }
  Object.defineProperty(http, "createServer", { // オブジェクトを扱う組込みAPI / プロパティを定義するメソッド
    value: createOwnedServer // 置き換える関数 / Nextのrequest listenerを所有確認で包み、他serverの応答を再利用しない
  });
}
syncBuiltinESMExports(); // 組込みmoduleのESM参照へ変更を反映する関数
Object.defineProperty(globalThis, Symbol.for("mvp.e2e.outbound.guard"), { // オブジェクトを扱う組込みAPI / プロパティを定義するメソッド / 一意のsymbolを扱う組込みAPI / 共有symbolを取得するメソッド
  value: Object.freeze({ // オブジェクトを扱う組込みAPI / 設定の変更を防ぐメソッド
    runId: config.runId,
    phase: config.phase
  }),
  configurable: false,
});
