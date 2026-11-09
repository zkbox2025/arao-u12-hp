// scripts/test-e2e.mjs
// .envなしの専用checkoutでのみproduction build・startとHTTPS経由のE2Eを起動する。
// @ts-check
import {
  spawn,
} from "node:child_process";
import {
  createHash,
  randomBytes,
  randomUUID,
  X509Certificate,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import {
  createRequire, // 【追加】固定版SDKのCommonJS moduleを読み込む関数
} from "node:module";
import {
  tmpdir,
} from "node:os";
import {
  join,
  resolve,
} from "node:path";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";
import {
  requireMvpTestEnvironment, // 専用checkout・明示flag・接続先を検証する関数
} from "../tests/mvp/environment";
import {
  listenMvpServer, // 所有serverをloopbackへbindする関数
  ownMvpServer, // 所有serverと接続の回収関数を作る関数
  startMvpOutboundStub, // 当該runの送信stubとbrowser proxyを起動する関数
} from "../tests/mvp/outbound-stub.mjs";
import {
  createMvpReportReader, // 【追加】PlaywrightのJSONをファイルへ保存せずメモリ内で解析する関数
  createMvpOutputObserver, // 【追加】子の出力原文を保存せずsentinel検出件数だけを保持する関数
} from "../tests/mvp/failure-observability.mjs";
const FAILURE = "F12_E2E_FAILED";
const CHECKOUT = fileURLToPath(new URL("../", import.meta.url)); // URLをファイルパスへ変換する関数 / URLを解析・構築するコンストラクター
/**
 * 同じ遮断ソースをCommonJSへ変換し、eval型threadでも同期preloadできるようにする。
 * Nodeの--importだけではthreadのeval入口を保護できないため、--require用の一時版を作る。
 * @param {string} directory 所有する一時領域。
 * @param {string} checkoutDirectory 読み取る専用checkout。
 */
export async function createMvpWorkerPreload(directory, checkoutDirectory) { // この処理を定義する関数・コールバック / 同じ遮断ソースをCommonJSへ変換し、eval型threadでも同期preloadできるようにする
  const {
    transpileModule, // TypeScriptからJavaScriptを生成する関数
    ModuleKind,
    ScriptTarget,
  } = await import("typescript"); // moduleを遅延読込みする関数
  const sourceFile = join(checkoutDirectory, "tests/mvp/outbound-preload.mjs"); // パスを結合する関数
  const source = readFileSync(sourceFile, "utf8").replaceAll("import.meta.url", JSON.stringify(pathToFileURL(sourceFile).href)); // 指定したファイルを読む関数 / すべての一致箇所を置換するメソッド / JSONへ直列化するメソッド / パスをURLへ変換する関数
  const result = transpileModule(source, { // TypeScriptからJavaScriptを生成する関数
    compilerOptions: {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const file = join(directory, "worker-preload.cjs"); // パスを結合する関数
  writeFileSync(file, result.outputText, { // 所有ファイルを書き込む関数
    mode: 0o600
  });
  const violations = join(directory, "violations.log"); // パスを結合する関数
  if (!existsSync(violations)) { // ファイルの存在を調べる関数
    writeFileSync(violations, "", { // 所有ファイルを書き込む関数
      flag: "wx",
      mode: 0o600
    });
  }
  return realpathSync(file); // パスの実体を解決する関数
}
/**
 * process.exitで非同期通知が途切れても、同期記録した通信違反を成功に含めない。
 * @param {string} directory 所有する記録領域。
 * @param {{status: () => {violations: number}}} stub 所有するstub。
 */
export function assertNoMvpEgress(directory, stub) { // この処理を定義する関数・コールバック / process.exitで非同期通知が途切れても、同期記録した通信違反を成功に含めない
  if (readFileSync(join(directory, "violations.log"), "utf8") !== "" || // 指定したファイルを読む関数 / パスを結合する関数
    stub.status().violations !== 0) { // 送信と違反の件数を返すメソッド
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
}
/**
 * 所有する子プロセスの終了情報と停止操作。
 * @typedef {object} MvpChild
 * @property {Promise<{code: number | null, signal: NodeJS.Signals | null}>} exit 終了待機。
 * @property {() => boolean} finished 終了済み判定。
 * @property {() => Promise<void>} stop 所有プロセス群の停止。
 */
/**
 * 入力値をログに出さず、POSIXではworkerを含む子プロセス群を所有する。
 * @param {{file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, observe?: (stream: "stdout" | "stderr", chunk: Uint8Array) => void}} request 起動要求。
 * @returns {MvpChild} 終了と停止だけを公開するハンドル。
 */
export function startMvpChild(request) { // この処理を定義する関数・コールバック / 入力値をログに出さず、POSIXではworkerを含む子プロセス群を所有する
  const grouped = process.platform !== "win32";
  const child = spawn(request.file, request.args, { // 子プロセスを起動する関数
    cwd: request.cwd,
    env: request.env,
    detached: grouped,
    shell: false,
    stdio: request.observe ? ["ignore", "pipe", "pipe"] : "ignore", // 【追加】監視対象の出力だけをメモリへ渡す
  });
  let ended = false;
  let failed = false;
  let reaped = false;
  if (request.observe) {
    for (const stream of ["stdout", "stderr"]) {
      child[/** @type {"stdout" | "stderr"} */ (stream)]?.on("data", // 【追加】出力系統を限定する型注釈 / 生出力を転送せず受け取るメソッド
        /**
         * 【追加】出力を照合器へ渡し、監視失敗を子の失敗に変換する。
         * @param {Buffer} chunk 今回受け取った出力バイト列。
         */
        (chunk) => { // 【追加】原文を保存しない監視コールバック
          try {
            request.observe?.(/** @type {"stdout" | "stderr"} */ (stream), chunk); // 【追加】検出件数を更新する関数 / 出力系統の型注釈
          } catch {
            failed = true;
            kill("SIGKILL"); // 【追加】監視不能になった所有子を停止する関数
          }
        });
    }
  }

  const exit = new Promise( // 非同期結果を扱うPromise
    /**
     * 子とstdioの終了まで待ち、OS例外の原文は保持しない。
     */
    (accept) => { // この処理を定義する関数・コールバック / 成功を通知する関数
      child.once("error",  // イベントを一度だけ監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        () => { // この処理を定義する関数・コールバック
          failed = true;
        });
      child.once("close",  // イベントを一度だけ監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        (code, signal) => { // この処理を定義する関数・コールバック
          ended = true;
          // leader終了後は直ちに残存groupを回収し、後で再利用されたPIDへ通知しない。
          kill("SIGKILL"); // 所有プロセスへ終了通知を送る関数
          reaped = true;
          accept({ // 成功を通知する関数
            code: failed
              ? 1
              : code,
            signal
          });
        });
    });
  /**
   * 登録したPID・process groupだけへ通知し、他の開発serverへ触れない。
   * @param {NodeJS.Signals} signal 終了通知。
   */
  function kill(signal) { // この処理を定義する関数・コールバック / 所有プロセスへ終了通知を送る関数
    if (!child.pid ||
      reaped) {
      return;
    }
    try {
      if (grouped) {
        process.kill(-child.pid, signal); // 所有プロセスへ終了通知を送る関数
      } else if (!ended) {
        child.kill(signal); // 所有プロセスへ終了通知を送る関数
      }
    } catch {
      // 既に終了した所有process groupへの通知失敗は原文を出さない。
    }
  }
  return {
    exit: /** @type {MvpChild["exit"]} */ (exit),
    /**
     * 子の終了状態だけを返す。
     */
    finished() { // この処理を定義する関数・コールバック / 子の終了状態だけを返す
      return ended;
    },
    /**
     * 正常停止の猶予後は、残った所有workerを強制停止する。
     */
    async stop() { // この処理を定義する関数・コールバック / 正常停止の猶予後は、残った所有workerを強制停止する
      kill("SIGTERM"); // 所有プロセスへ終了通知を送る関数
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let timer;
      await Promise.race([ // 非同期結果を扱うPromise / 最初に完了した非同期結果を待つメソッド
        exit,
        new Promise( // 非同期結果を扱うPromise
          /**
           * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
           */
          (accept) => { // この処理を定義する関数・コールバック / 成功を通知する関数
            timer = setTimeout(accept, 1000); // 待機上限を設定する関数 / 成功を通知する関数
          }),
      ]);
      clearTimeout(timer); // 待機timerを解除する関数
      kill("SIGKILL"); // 所有プロセスへ終了通知を送る関数
      if (!ended) {
        await Promise.race([ // 非同期結果を扱うPromise / 最初に完了した非同期結果を待つメソッド
          exit,
          new Promise( // 非同期結果を扱うPromise
            /**
             * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
             */
            (_, reject) => { // この処理を定義する関数・コールバック / 未使用の成功通知関数 / 失敗を通知する関数
              timer = setTimeout( // 待機上限を設定する関数
                /**
                 * 待機時間の経過後に、この処理の完了または失敗を通知するコールバック。
                 */
                () => reject(new Error(FAILURE)), 3000); // この処理を定義する関数・コールバック / 失敗を通知する関数 / 固定例外のコンストラクター
            }),
        ]).finally( // 終了時の処理を登録するメソッド
          /**
           * 非同期処理の終了後に、登録した後処理を実行するコールバック。
           */
          () => clearTimeout(timer)); // この処理を定義する関数・コールバック / 待機timerを解除する関数
      }
    },
  };
}
/**
 * 子の失敗・signal・期限超過を固定例外にし、期限超過時は所有workerも停止する。
 * @param {MvpChild} child 所有ハンドル。
 * @param {number} timeout 待機上限。
 * @param {AbortSignal} [signal] runnerの割込み。
 */
export async function waitMvpChild(child, timeout, signal) { // この処理を定義する関数・コールバック / 子の失敗・signal・期限超過を固定例外にし、期限超過時は所有workerも停止する
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {(() => void) | undefined} */
  let onAbort;
  try {
    if (signal?.aborted) {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    const result = await Promise.race([ // 非同期結果を扱うPromise / 最初に完了した非同期結果を待つメソッド
      child.exit,
      new Promise( // 非同期結果を扱うPromise
        /**
         * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
         */
        (_, reject) => { // この処理を定義する関数・コールバック / 未使用の成功通知関数 / 失敗を通知する関数
          timer = setTimeout( // 待機上限を設定する関数
            /**
             * 待機時間の経過後に、この処理の完了または失敗を通知するコールバック。
             */
            () => reject(new Error(FAILURE)), timeout); // この処理を定義する関数・コールバック / 失敗を通知する関数 / 固定例外のコンストラクター
        }),
      new Promise( // 非同期結果を扱うPromise
        /**
         * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
         */
        (_, reject) => { // この処理を定義する関数・コールバック / 未使用の成功通知関数 / 失敗を通知する関数
          /**
           * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
           */
          onAbort = () => reject(new Error(FAILURE)); // この処理を定義する関数・コールバック / 失敗を通知する関数 / 固定例外のコンストラクター
          signal?.addEventListener("abort", onAbort, { // 中断を通知する関数
            once: true
          });
        }),
    ]);
    if (result.code !== 0 ||
      result.signal !== null) {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
  } catch {
    await child.stop(); // 所有プロセス群の停止
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
  finally {
    clearTimeout(timer); // 待機timerを解除する関数
    if (onAbort) {
      signal?.removeEventListener("abort", onAbort); // 中断を通知する関数
    }
  }
}
/**
 * 一時ディレクトリに自己署名証明書を生成し、公開鍵pinと公開CAだけを返す。
 * OSの証明書storeや本番設定は変更しない。
 * @param {string} directory 当該runの0700ディレクトリ。
 * @param {AbortSignal} [signal] runnerの割込み。
 */
export async function createMvpCertificate(directory, signal) { // この処理を定義する関数・コールバック / 一時ディレクトリに自己署名証明書を生成し、公開鍵pinと公開CAだけを返す
  const keyFile = join(directory, "key.pem"); // パスを結合する関数
  const certFile = join(directory, "cert.pem"); // パスを結合する関数
  const configFile = join(directory, "openssl.cnf"); // パスを結合する関数
  writeFileSync(configFile, [ // 所有ファイルを書き込む関数
    "[req]",
    "distinguished_name=dn",
    "[dn]",
    "[server]",
    "subjectAltName=IP:127.0.0.1,DNS:localhost", // 【修正】proxy経由のNode HTTPSも証明書のホスト名検証を維持する
    "basicConstraints=critical,CA:TRUE",
    "keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign",
    "extendedKeyUsage=serverAuth",
  ].join("\n"), { // 値を連結するメソッド
    mode: 0o600
  });
  const child = startMvpChild({ // 入力値をログに出さず、POSIXではworkerを含む子プロセス群を所有する
    file: "openssl",
    args: [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyFile,
      "-out",
      certFile,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-config",
      configFile,
      "-extensions",
      "server",
    ],
    cwd: directory,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test"
    },
  });
  await waitMvpChild(child, 20000, signal); // 子の失敗・signal・期限超過を固定例外にし、期限超過時は所有workerも停止する
  chmodSync(keyFile, 0o600); // 所有ファイルの権限を設定する関数
  chmodSync(certFile, 0o600); // 所有ファイルの権限を設定する関数
  const cert = readFileSync(certFile); // 指定したファイルを読む関数
  const key = readFileSync(keyFile); // 指定したファイルを読む関数
  const publicKey = new X509Certificate(cert).publicKey.export({ // X.509証明書を読むコンストラクター / 公開鍵を指定形式へ変換するメソッド
    type: "spki",
    format: "der"
  });
  const pin = createHash("sha256").update(publicKey).digest("base64"); // ハッシュ計算器を生成する関数 / ハッシュへ入力を追加するメソッド / ハッシュ値を確定するメソッド
  return {
    cert,
    key,
    certFile,
    pin
  };
}
/**
 * 専用HTTPS入口から内部Nextへ中継し、同じrunのNode応答だけを受け入れる。
 * @param {{cert: Buffer, key: Buffer}} certificate 当該runのTLS情報。
 * @param {{runId: string, secret: string}} owner 所有契約。
 * @param {{frontend: number, backend: number}} [ports] 単体試験では所有する動的portを指定する。
 */
export async function startMvpTls(certificate, owner, ports = { // この処理を定義する関数・コールバック / 専用HTTPS入口から内部Nextへ中継し、同じrunのNode応答だけを受け入れる
  frontend: 3443,
  backend: 3000
}) {
  const server = https.createServer(certificate,  // serverを生成する関数
    /**
     * 所有serverのrequestを受け取り、この接続の応答処理を実行するコールバック。
     */
    (request, response) => { // この処理を定義する関数・コールバック
      const headers = {
        ...request.headers,
        host: "localhost:3443", // 【修正】Nextのloopback正規化に合わせた専用HTTPS入口
        "x-forwarded-host": "localhost:3443", // 【修正】Nextのloopback正規化に合わせた専用HTTPS入口
        "x-forwarded-proto": "https",
        "x-mvp-upstream-secret": owner.secret,
      };
      delete headers["proxy-authorization"];
      const upstream = http.request({ // HTTP requestを作る関数
        host: "127.0.0.1",
        port: ports.backend,
        path: request.url,
        method: request.method,
        headers,
      },
        /**
         * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
         */
        (received) => { // この処理を定義する関数・コールバック
          if (received.headers["x-mvp-application-run"] !== owner.runId) {
            received.resume(); // streamを読み進めるメソッド
            response.writeHead(502); // HTTP状態とheaderを設定するメソッド
            response.end(FAILURE); // 送信・応答を終了するメソッド
            return;
          }
          if (request.method === "POST" &&
            String(received.headers["content-type"] ?? "").includes("text/x-component")) { // 【追加】ActionのRSC応答だけを判定する文字列変換関数・包含メソッド
            /** @type {Buffer[]} */
            const chunks = []; // 【追加】この応答だけの一時バイト列の配列型
            let length = 0;
            received.on("data", // 【追加】Action応答のバイト列を受け取るメソッド
              /**
               * 【追加】圧縮を含む元のバイト列を上限付きで一時保持する。
               */
              (chunk) => { // 【追加】応答バイト列を受け取るコールバック
                length += chunk.length;
                if (length > 4 * 1024 * 1024) {
                  received.destroy(); // 【追加】上限超過した所有upstreamを止めるメソッド
                  response.destroy(); // 【追加】不完全な応答を成功させず中断するメソッド
                  return;
                }
                chunks.push(chunk); // 【追加】元の圧縮バイト列を変更せず保持するメソッド
              },
            );
            received.once("end", // 【追加】Action応答の終端を待つメソッド
              /**
               * 【追加】完全受信後に実バイト長を付け、RSC応答の終端を明示する。
               */
              () => { // 【追加】完全な応答を転送するコールバック
                const headers = { ...received.headers };
                delete headers["transfer-encoding"];
                delete headers.connection;
                headers["content-length"] = String(length); // 【追加】実バイト長をHTTP headerへ設定する変換関数
                response.writeHead(received.statusCode ?? 502, headers); // 【追加】元の状態と圧縮形式を保つメソッド
                response.end(Buffer.concat(chunks)); // 【追加】受信済み応答を送るメソッド・バイト列結合関数
              },
            );
            received.once("error", // 【追加】所有upstreamの途中失敗を処理するメソッド
              /**
               * 【追加】受信失敗を固定の接続終了にし、例外原文を表示しない。
               */
              () => response.destroy(), // 【追加】所有応答だけを中断するコールバック・メソッド
            );
            return;
          }
          response.writeHead(received.statusCode ?? 502, received.headers); // HTTP状態とheaderを設定するメソッド
          received.pipe(response); // streamを転送するメソッド
        });
      upstream.on("error",  // イベントを監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        () => { // この処理を定義する関数・コールバック
          if (!response.headersSent) {
            response.writeHead(502); // HTTP状態とheaderを設定するメソッド
            response.end(FAILURE); // 送信・応答を終了するメソッド
          } else {
            response.destroy(); // 所有する接続を終了するメソッド
          }
        });
      request.once("aborted",  // イベントを一度だけ監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        () => upstream.destroy()); // この処理を定義する関数・コールバック / 所有する接続を終了するメソッド
      request.pipe(upstream); // streamを転送するメソッド
    });
  const close = ownMvpServer(server); // 所有資源を閉じる関数・メソッド / 所有serverと接続の回収関数を作る関数
  try {
    const port = await listenMvpServer(server, ports.frontend); // 所有serverをloopbackへbindする関数
    return {
      close, // 所有serverと接続を回収する関数
      port
    };
  } catch {
    await close(); // 所有資源を閉じる関数・メソッド
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
}
/**
 * 証明書検証を有効にしたまま、所有runのログイン画面だけを準備完了とする。
 * @param {MvpChild} application 所有するNext。
 * @param {{runId: string, cert: Buffer}} owner 所有契約と公開CA。
 * @param {() => boolean} interrupted 割込み判定。
 */
async function waitApplication(application, owner, interrupted) { // この処理を定義する関数・コールバック / 証明書検証を有効にしたまま、所有runのログイン画面だけを準備完了とする / 割込み判定
  const deadline = Date.now() + 60000; // 日時を扱う組込みAPI / 現在時刻をミリ秒で取得するメソッド
  while (Date.now() < deadline && // 日時を扱う組込みAPI / 現在時刻をミリ秒で取得するメソッド
    !interrupted()) { // 割込み判定
    if (application.finished()) { // 終了済み判定
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    const ready = await new Promise( // 非同期結果を扱うPromise
      /**
       * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
       */
      (accept) => { // この処理を定義する関数・コールバック / 成功を通知する関数
        const request = https.get("https://localhost:3443/club-login", { // 取得する関数・メソッド
          ca: owner.cert,
          timeout: 1000,
        },
          /**
           * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
           */
          (response) => { // この処理を定義する関数・コールバック
            const match = response.statusCode === 200 &&
              response.headers["x-mvp-application-run"] === owner.runId;
            response.resume(); // streamを読み進めるメソッド
            accept(match); // 成功を通知する関数
          });
        request.once("timeout",  // イベントを一度だけ監視するメソッド
          /**
           * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
           */
          () => request.destroy()); // この処理を定義する関数・コールバック / 所有する接続を終了するメソッド
        request.once("error",  // イベントを一度だけ監視するメソッド
          /**
           * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
           */
          () => accept(false)); // この処理を定義する関数・コールバック / 成功を通知する関数
      });
    if (ready &&
      !application.finished()) { // 終了済み判定
      return;
    }
    await new Promise( // 非同期結果を扱うPromise
      /**
       * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
       */
      (accept) => setTimeout(accept, 100)); // この処理を定義する関数・コールバック / 成功を通知する関数 / 待機上限を設定する関数
  }
  throw new Error(FAILURE); // 固定例外のコンストラクター
}
/**
 * JSON結果から実成功だけを数え、skip・期待失敗・retry・hook失敗を完了に含めない。
 * @param {unknown} input private領域で読んだPlaywright JSON。
 * @returns {number} 成功した実ケース数。
 */
export function assertMvpE2eReport(input) { // この処理を定義する関数・コールバック / JSON結果から実成功だけを数え、skip・期待失敗・retry・hook失敗を完了に含めない
  try {
    const report = /** @type {import("playwright/types/testReporter").JSONReport} */ (input);
    if (report.errors.length !== 0 ||
      report.stats.unexpected !== 0 ||
      report.stats.flaky !== 0 ||
      report.stats.skipped !== 0) {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    let passed = 0;
    /**
     * suiteを辿り、Chromiumで一度だけ実成功したケースを数える。
     * @param {typeof report.suites} suites suite配列。
     */
    function visit(suites) { // この処理を定義する関数・コールバック / suiteを辿り、Chromiumで一度だけ実成功したケースを数える
      for (const suite of suites) {
        for (const spec of suite.specs) {
          for (const test of spec.tests) {
            if (test.projectName !== "chromium" ||
              test.expectedStatus !== "passed" ||
              test.status !== "expected" ||
              test.results.length !== 1 ||
              test.results[0].status !== "passed" ||
              test.results[0].errors.length !== 0) {
              throw new Error(FAILURE); // 固定例外のコンストラクター
            }
            passed += 1;
          }
        }
        visit(suite.suites ?? []); // suiteを辿り、Chromiumで一度だけ実成功したケースを数える
      }
    }
    visit(report.suites); // suiteを辿り、Chromiumで一度だけ実成功したケースを数える
    if (passed === 0 ||
      passed !== report.stats.expected) {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    return passed;
  } catch {
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
}
/**
 * guard成功後だけ専用資源を起動し、production lifecycle・TLS・実E2Eを順に実行する。
 * migrationとサービス起動は行わず、既存server・既存build成果物を再利用しない。
 * @param {{environment?: Record<string, string | undefined>, checkoutDirectory?: string}} [options] 明示設定。
 */
export async function runMvpE2e(options = {}) { // この処理を定義する関数・コールバック / guard成功後だけ専用資源を起動し、production lifecycle・TLS・実E2Eを順に実行する
  /** @type {string | undefined} */
  let directory;
  /** @type {Awaited<ReturnType<typeof startMvpOutboundStub>> | undefined} */
  let stub;
  /** @type {Awaited<ReturnType<typeof startMvpTls>> | undefined} */
  let tls;
  /** @type {import("../tests/mvp/local-services-fixture.ts").MvpLocalServicesFixture | undefined} */
  let fixture;
  /** @type {typeof import("../tests/mvp/local-services-fixture.ts") | undefined} */
  let services;
  /** @type {import("@prisma/client").PrismaClient | undefined} */
  let database;
  /** @type {MvpChild[]} */
  const children = [];
  const abort = new AbortController(); // 中断要求を管理するコンストラクター
  const originalFetch = globalThis.fetch; // 遮断適用前のHTTP通信関数 / HTTP通信を実行する関数
  let cleaning = false;
  let fetchInstalled = false;
  let interrupted = false;
  let ownBuild = false;
  /** @type {ReturnType<typeof createMvpOutputObserver> | undefined} */
  let outputObserver; // 【追加】終了時まで共有する監視器の戻り値型・未設定型
  /** @type {(() => Promise<void>) | undefined} */
  let releaseBackend;
  const checkout = options.checkoutDirectory ?? CHECKOUT;
  /**
   * 所有する子だけを停止し、割込みを正常終了へ変換しない。
   */
  function interrupt() { // この処理を定義する関数・コールバック / 所有する子だけを停止し、割込みを正常終了へ変換しない
    interrupted = true;
    abort.abort(new Error(FAILURE)); // 中断を通知するメソッド / 固定例外のコンストラクター
    for (const child of children) {
      void child.stop().catch( // 所有プロセス群の停止 / 例外を処理するメソッド
        /**
         * 例外を処理し、原文を公開せずに失敗状態を扱うコールバック。
         */
        () => undefined); // この処理を定義する関数・コールバック
    }
  }
  process.once("SIGINT", interrupt); // イベントを一度だけ監視するメソッド / 所有する子だけを停止し、割込みを正常終了へ変換しない
  process.once("SIGTERM", interrupt); // イベントを一度だけ監視するメソッド / 所有する子だけを停止し、割込みを正常終了へ変換しない
  try {
    const configuration = requireMvpTestEnvironment(options.environment ?? process.env, checkout, randomUUID().replaceAll("-", "")); // 専用checkout・明示flag・接続先を検証する関数 / UUIDを生成する関数 / すべての一致箇所を置換するメソッド
    if (configuration.variables.RUN_MVP_E2E !== "1" ||
      !configuration.variables.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !configuration.variables.SUPABASE_SERVICE_ROLE_KEY ||
      realpathSync(join(checkout, "node_modules")) !== join(realpathSync(checkout), "node_modules") || // パスの実体を解決する関数 / パスを結合する関数
      existsSync(join(checkout, ".next"))) { // ファイルの存在を調べる関数 / パスを結合する関数
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    if (process.env.PLAYWRIGHT_BROWSERS_PATH !== undefined) {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    // 【修正】Playwright 1.64.1同梱のregistryからheadless shellだけを選ぶ。
    // この内部export契約はPlaywright更新時に再確認する。取得は明示セットアップで行う。
    const registry = createRequire(import.meta.url)( // 【追加】SDKを読み込むrequire生成関数 / 返されたmodule読込関数
      "playwright-core/lib/coreBundle",
    ).registry.registry;
    const executable = registry.findExecutable("chromium-headless-shell")?.executablePath(); // 【追加】登録済みbrowserを選ぶメソッド / SDKが定める実行パスを返すメソッド
    if (typeof executable !== "string") {
      throw new Error(FAILURE); // 【追加】登録済みshellがない場合の固定例外コンストラクター
    }
    const browserExecutable = realpathSync(executable); // 【修正】登録済みheadless shellの実体パスを取得する関数
    /**
     * fixtureの実Auth・Storage通信も同じoriginへ限定し、割込みとrequest期限を適用する。
     * @param {Parameters<typeof fetch>[0]} input request入力。
     * @param {Parameters<typeof fetch>[1]} [init] request設定。
     */
    globalThis.fetch = async function(input, init) { // HTTP通信を実行する関数 / この処理を定義する関数・コールバック
      const url = new URL(input instanceof Request // URLを解析・構築するコンストラクター / Request入力の判定
        ? input.url
        : String(input)); // URLを解析・構築するコンストラクター / fetch入力をまとめるコンストラクター / 文字列へ変換する関数
      if (url.origin !== configuration.supabaseOrigin ||
        url.username ||
        url.password ||
        url.hash) {
        throw new Error(FAILURE); // 固定例外のコンストラクター
      }
      const signals = [AbortSignal.timeout(10000)]; // 中断signalのAPI / 期限付き中断signalを作るメソッド
      const supplied = init?.signal ?? (input instanceof Request // fetch入力型の判定
        ? input.signal
        : undefined); // fetch入力をまとめるコンストラクター
      if (supplied) {
        signals.push(supplied); // 配列へ要素を追加するメソッド
      }
      if (!cleaning) {
        signals.push(abort.signal); // 配列へ要素を追加するメソッド
      }
      return await originalFetch(input, { // 遮断適用前のHTTP通信関数
        ...init,
        signal: AbortSignal.any(signals), // 中断signalのAPI / 中断signalをまとめるメソッド
        redirect: "error",
      });
    };
    fetchInstalled = true;
    // 原子的に取得したbuild領域だけを後片付けし、他実行の成果物を消さない。
    mkdirSync(join(checkout, ".next"), { // 所有ディレクトリを作る関数 / パスを結合する関数
      mode: 0o700
    });
    ownBuild = true;
    // Nextがbindするまではportを予約し、他の開発serverを停止・再利用しない。
    const reservation = net.createServer(); // serverを生成する関数
    releaseBackend = ownMvpServer(reservation); // 所有serverと接続の回収関数を作る関数
    await listenMvpServer(reservation, 3000); // 所有serverをloopbackへbindする関数
    directory = realpathSync(mkdtempSync(join(tmpdir(), "mvp-e2e-"))); // パスの実体を解決する関数 / 一時領域を作る関数 / パスを結合する関数 / 一時領域の基準パスを返す関数
    chmodSync(directory, 0o700); // 所有ファイルの権限を設定する関数
    mkdirSync(join(directory, "tmp"), { // 所有ディレクトリを作る関数 / パスを結合する関数
      mode: 0o700
    });
    const certificate = await createMvpCertificate(directory, abort.signal); // 一時ディレクトリに自己署名証明書を生成し、公開鍵pinと公開CAだけを返す
    const workerPreload = await createMvpWorkerPreload(directory, checkout); // 同じ遮断ソースをCommonJSへ変換し、eval型threadでも同期preloadできるようにする
    if (interrupted) {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    const secret = randomBytes(32).toString("hex"); // 検証用乱数を生成する関数 / 文字列へ変換するメソッド
    const owner = {
      runId: configuration.runId,
      secret
    };
    stub = await startMvpOutboundStub({ // 当該runの送信stubとbrowser proxyを起動する関数
      ...owner,
      supabaseOrigin: configuration.supabaseOrigin
    });
    tls = await startMvpTls(certificate, owner); // 専用HTTPS入口から内部Nextへ中継し、同じrunのNode応答だけを受け入れる
    services = await import("../tests/mvp/local-services-fixture"); // moduleを遅延読込みする関数
    fixture = services.planMvpLocalServicesFixture(configuration, {}, true); // 【修正】所有する未確認Auth招待先を予約し、DB・Auth・PDFの生成予定資源を計画する関数
    /** @type {NodeJS.ProcessEnv} */
    const environment = {
      ...configuration.variables,
      NODE_ENV: "production",
      PATH: process.env.PATH,
      TZ: "UTC",
      TMPDIR: join(directory, "tmp"), // パスを結合する関数
      NEXT_TELEMETRY_DISABLED: "1",
      CHECKPOINT_DISABLE: "1",
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
      npm_config_update_notifier: "false",
      WEBSITE_ADMIN_USER_IDS: fixture.database.users.aOwner.id,
      FORM_LOG_HASH_SALT: randomBytes(32).toString("hex"), // 検証用乱数を生成する関数 / 文字列へ変換するメソッド
      LINE_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString("base64"), // 検証用乱数を生成する関数 / 文字列へ変換するメソッド
      CRON_SECRET: randomBytes(32).toString("hex"), // 検証用乱数を生成する関数 / 文字列へ変換するメソッド
      RESEND_API_KEY: "re_F12_FAKE_NEVER_SEND",
      MAIL_FROM_ADDRESS: "from@example.test",
      ADMIN_EMAIL: "platform@example.test",
      NODE_EXTRA_CA_CERTS: certificate.certFile,
      NODE_OPTIONS: "--import=" + pathToFileURL(join(checkout, "tests/mvp/outbound-preload.mjs")).href, // パスをURLへ変換する関数 / パスを結合する関数
    };
    const preload = {
      ...owner,
      stubOrigin: stub.origin,
      supabaseOrigin: configuration.supabaseOrigin,
      checkoutDirectory: realpathSync(checkout), // パスの実体を解決する関数
      runtimeDirectory: directory,
      workerPreload,
    };
    outputObserver = createMvpOutputObserver(owner.runId); // 【追加】当該runの出力監視器を作る関数
    const build = startMvpChild({ // 入力値をログに出さず、POSIXではworkerを含む子プロセス群を所有する
      observe: outputObserver.observe, // 【追加】stdout・stderrを原文非保存の照合器へ渡す関数
      file: "npm",
      args: [
        "run",
        "build"
      ],
      cwd: checkout,
      env: {
        ...environment,
        MVP_E2E_PRELOAD: JSON.stringify({ // JSONへ直列化するメソッド
          ...preload,
          phase: "build"
        })
      },
    });
    children.push(build); // 配列へ要素を追加するメソッド
    await waitMvpChild(build, 10 * 60000, abort.signal); // 子の失敗・signal・期限超過を固定例外にし、期限超過時は所有workerも停止する
    assertNoMvpEgress(directory, stub); // process.exitで非同期通知が途切れても、同期記録した通信違反を成功に含めない
    if (interrupted) {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    const { PrismaClient } = await import("@prisma/client"); // 専用DB clientのコンストラクター / moduleを遅延読込みする関数
    const { PrismaPg } = await import("@prisma/adapter-pg"); // PostgreSQL adapterのコンストラクター / moduleを遅延読込みする関数
    database = new PrismaClient({ // 専用DB clientのコンストラクター
      adapter: new PrismaPg({ // PostgreSQL adapterのコンストラクター
        connectionString: configuration.databaseUrl,
        max: 1,
        connectionTimeoutMillis: 3000,
        statement_timeout: 5000,
      }),
      log: [],
    });
    await services.seedMvpLocalServicesFixture(database, fixture); // 確認済みpasswordユーザー→DB→private bucket→PDFの順に作成する
    /** @type {Record<string, unknown>} */
    const credentials = {};
    for (const key of Object.keys(fixture.database.users)) { // オブジェクトを扱う組込みAPI / キーを列挙するメソッド
      credentials[key] = services.getMvpFixtureCredentials(fixture, /** @type {import("../tests/mvp/database-fixture.ts").MvpFixtureUserKey} */(key)); // readyなfixtureのpasswordをメモリ上で渡す。ログ・trace・storageStateに保存しない
    }
    stub.registerFixture({ // seedした当該runのIDと認証情報を、制御secretで守る一時メモリへ登録する
      database: fixture.database,
      observability: outputObserver.counts, // 【追加】私有制御口では検出件数だけを公開する
      credentials
    }, Object.values(fixture.database.clubs).map( // オブジェクトを扱う組込みAPI / 値を列挙するメソッド / 各要素を変換するメソッド
      /**
       * 各要素を、この処理が必要とする値へ変換するコールバック。
       */
      (club) => "clubs/" + club.id + "/")); // この処理を定義する関数・コールバック
    await database.$queryRawUnsafe("SELECT 1"); // 固定SQLで専用DBへ疎通確認するメソッド
    await releaseBackend(); // 所有するbackend予約を解放する関数
    const application = startMvpChild({ // 入力値をログに出さず、POSIXではworkerを含む子プロセス群を所有する
      observe: outputObserver.observe, // 【追加】stdout・stderrを原文非保存の照合器へ渡す関数
      file: process.execPath,
      args: [
        join(checkout, "tests/mvp/next-e2e-server.mjs"), // 【修正】公開Originを保つ専用production serverのパスを作る関数
      ],
      cwd: checkout,
      env: {
        ...environment,
        MVP_E2E_PRELOAD: JSON.stringify({ // JSONへ直列化するメソッド
          ...preload,
          phase: "start"
        })
      },
    });
    children.push(application); // 配列へ要素を追加するメソッド
    await waitApplication(application, { // 証明書検証を有効にしたまま、所有runのログイン画面だけを準備完了とする
      runId: owner.runId,
      cert: certificate.cert
    },
      /**
       * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
       */
      () => interrupted); // この処理を定義する関数・コールバック
    assertNoMvpEgress(directory, stub); // process.exitで非同期通知が途切れても、同期記録した通信違反を成功に含めない
    stub.markReady(); // 所有serverの正常応答を確認した後だけreadyへ進める
    const session = {
      ...owner,
      stubOrigin: stub.origin,
      appOrigin: configuration.appOrigin,
      certificatePin: certificate.pin,
      browserExecutable,
    };
    const report = createMvpReportReader(outputObserver.observe); // 【追加】失敗時の要求・Cookieを結果ファイルへ残さない集計器生成関数 / 出力監視メソッド
    const browser = startMvpChild({ // 入力値をログに出さず、POSIXではworkerを含む子プロセス群を所有する
      observe: report.observe, // 【追加】stdout・stderrを原文非保存の照合器へ渡す関数
      file: process.execPath,
      args: [
        join(checkout, "node_modules/@playwright/test/cli.js"), // パスを結合する関数
        "test",
        "--reporter=json"
      ],
      cwd: checkout,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        RUN_MVP_TESTS: "1",
        MVP_TEST_DISPOSABLE: "1",
        RUN_MVP_E2E: "1",
        // 【追加：F12粒度13】テスト用Nodeだけへ渡す。Chromiumの環境はpreloaderが別に限定する。
        DATABASE_URL: configuration.databaseUrl,
        NEXT_PUBLIC_SUPABASE_URL: configuration.supabaseOrigin,
        APP_BASE_URL: configuration.appOrigin,
        // 【追加：F12粒度14】同じ実行の架空LINE設定だけを暗号化する。Chromiumへは渡さない。
        LINE_CREDENTIAL_ENCRYPTION_KEY: environment.LINE_CREDENTIAL_ENCRYPTION_KEY,
        MVP_E2E_SESSION: JSON.stringify(session), // JSONへ直列化するメソッド
        MVP_E2E_PRELOAD: JSON.stringify({ // JSONへ直列化するメソッド
          ...preload,
          phase: "browser",
          browserExecutable,
          certificatePin: certificate.pin,
        }),
        NODE_OPTIONS: environment.NODE_OPTIONS,
        TMPDIR: join(directory, "tmp"), // パスを結合する関数
        HOME: process.env.HOME,
        NODE_EXTRA_CA_CERTS: certificate.certFile,
      },
    });
    children.push(browser); // 配列へ要素を追加するメソッド
    await waitMvpChild(browser, 5 * 60000, abort.signal); // 子の失敗・signal・期限超過を固定例外にし、期限超過時は所有workerも停止する
    const passed = assertMvpE2eReport(report.read()); // 【修正】メモリ内結果の解析・回収メソッド / 実成功・skipなしだけを許す集計関数
    assertNoMvpEgress(directory, stub); // process.exitで非同期通知が途切れても、同期記録した通信違反を成功に含めない
    if (interrupted ||
      application.finished()) { // 終了済み判定
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    return {
      passed
    };
  } catch {
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
  finally {
    cleaning = true;
    let cleanupFailed = false;
    for (const child of children.reverse()) { // 配列の順序を反転するメソッド
      try {
        await child.stop(); // 所有プロセス群の停止
      } catch {
        cleanupFailed = true;
      }
    }
    await tls?.close().catch( // 例外を処理するメソッド / 所有serverを回収する関数
      /**
       * 例外を処理し、原文を公開せずに失敗状態を扱うコールバック。
       */
      () => { cleanupFailed = true; }); // この処理を定義する関数・コールバック
    await stub?.close().catch( // 例外を処理するメソッド / 所有serverを回収する関数
      /**
       * 例外を処理し、原文を公開せずに失敗状態を扱うコールバック。
       */
      () => { cleanupFailed = true; }); // この処理を定義する関数・コールバック
    await releaseBackend?.().catch( // 例外を処理するメソッド / 所有するbackend予約を解放する関数
      /**
       * 例外を処理し、原文を公開せずに失敗状態を扱うコールバック。
       */
      () => { cleanupFailed = true; }); // この処理を定義する関数・コールバック
    if (services &&
      fixture) {
      try {
        const report = await services.cleanupMvpLocalServicesFixture(fixture); // 登録物→DB→所有確認したAuth→新規作成した空bucketの順に補償する
        if (Object.values(report.remaining).some(Boolean)) { // オブジェクトを扱う組込みAPI / 値を列挙するメソッド / 一致する要素の有無を調べるメソッド / 真偽値へ変換する関数
          cleanupFailed = true;
        }
      } catch {
        cleanupFailed = true;
      }
    }
    await database?.$disconnect().catch( // 例外を処理するメソッド / 専用DB clientを切断するメソッド
      /**
       * 例外を処理し、原文を公開せずに失敗状態を扱うコールバック。
       */
      () => { cleanupFailed = true; }); // この処理を定義する関数・コールバック
    try {
      if (ownBuild) {
        rmSync(join(checkout, ".next"), { // 所有する一時資源を削除する関数 / パスを結合する関数
          recursive: true,
          force: true
        });
      }
      if (directory) {
        rmSync(directory, { // 所有する一時資源を削除する関数
          recursive: true,
          force: true
        });
      }
    } catch {
      cleanupFailed = true;
    }
    if (fetchInstalled) {
      globalThis.fetch = originalFetch; // HTTP通信を実行する関数 / 遮断適用前のHTTP通信関数
    }
    process.removeListener("SIGINT", interrupt); // イベント監視を解除するメソッド / 所有する子だけを停止し、割込みを正常終了へ変換しない
    process.removeListener("SIGTERM", interrupt); // イベント監視を解除するメソッド / 所有する子だけを停止し、割込みを正常終了へ変換しない
    try {
      outputObserver?.finish(); // 【追加】stdioの回収後にも遅延出力の漏えいを検証するメソッド
    } catch {
      cleanupFailed = true;
    }
    if (cleanupFailed) {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
  }
}
// 直接起動だけをCLIとして扱い、import時にサービスやDBを初期化しない。
if (process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url) { // パスをURLへ変換する関数 / 絶対パスを解決する関数
  try {
    const result = await runMvpE2e(); // guard成功後だけ専用資源を起動し、production lifecycle・TLS・実E2Eを順に実行する
    console.log("F12_E2E_PASSED", result.passed); // 固定の進捗・結果を出力する関数
  } catch {
    console.error(FAILURE); // 固定の失敗を出力する関数
    process.exitCode = 1;
  }
}
