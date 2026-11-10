// tests/mvp/next-e2e-server.mjs
// 使い捨てE2Eだけで公開HTTPSのhostname・portをNextへ渡し、HTTP backendはloopbackへ限定する。
// @ts-check
import http from "node:http";
import {
  realpathSync,
  readdirSync
} from "node:fs";
import {
  resolve
} from "node:path";
import {
  fileURLToPath
} from "node:url";
const FAILURE = "F12_E2E_SERVER_FAILED";

/**
 * 通信遮断preloaderと親runnerの所有契約を確認し、Nextの読込前に不正な起動を拒否する。
 * @param {Readonly<Record<string, string | undefined>>} environment 明示された起動環境。
 * @param {string} checkout 専用コピーの絶対パス。
 * @param {unknown} marker preloaderが凍結して登録した所有識別。
 * @returns {void} 検証成功時だけ呼出し元へ戻る。
 */
export function assertMvpNextServerEnvironment(environment, // 専用production serverの接続前ガード関数
  checkout,
  marker) { // 専用production serverの接続前ガード関数
  try {
    const owner = JSON.parse(environment.MVP_E2E_PRELOAD ?? ""); // 親runnerの起動契約を解析するメソッド
    if (
      environment.NODE_ENV !== "production" ||
      !marker ||
      typeof marker !== "object" ||
      !Object.isFrozen(marker) || // preloaderが凍結した値であることを確認する関数
      !("phase" in marker) ||
      marker.phase !== "start" ||
      !("runId" in marker) ||
      marker.runId !== owner.runId ||
      owner.phase !== "start" ||
      realpathSync(checkout) !== owner.checkoutDirectory // 専用コピーとの一致を確認する関数
    ) {
      throw new Error(FAILURE); // 秘密を含まない固定例外のコンストラクター
    }
    if (
      environment.RUN_MVP_TESTS !== "1" ||
      environment.MVP_TEST_DISPOSABLE !== "1" ||
      environment.RUN_MVP_E2E !== "1" ||
      environment.APP_BASE_URL !== "https://localhost:3443" ||
      readdirSync(checkout).some( // 親・preloaderの確認後にも環境ファイルの名前だけを拒否する関数・メソッド
        /**
         * Nextが自動読込する名前だけを検出し、ファイル内容は開かない。
         */
        (name) => /^\.env(?:\.(?:local|development(?:\.local)?|test(?:\.local)?|production.*))?$/u.test(name), // ファイル名の一致を調べるコールバック・メソッド
      )
    ) {
      throw new Error(FAILURE); // 専用flag・公開Origin・自動読込の不一致を拒否するコンストラクター
    }
  } catch {
    throw new Error(FAILURE); // 設定・パス・例外原文を含めないコンストラクター
  }
}

/**
 * guard後だけNextのproduction handlerを起動し、親runner所有のHTTP backendへ接続する。
 * hostname・portはブラウザーが接続する公開HTTPS入口を表し、実listenは内部3000番へ限定する。
 */
export async function startMvpNextServer() { // 公開URLを保つ専用Next起動関数
  const marker = Reflect.get(globalThis, Symbol.for("mvp.e2e.outbound.guard")); // 所有markerを取得する関数 / 共有symbolを取得するメソッド
  assertMvpNextServerEnvironment(process.env, process.cwd(), marker); // 接続前の所有確認関数 / 現在のコピーを取得するメソッド
  const { default: next } = await import("next"); // guard後だけNext APIを遅延読込する関数
  const application = next({ // インストール済みNextのcustom server APIを使う関数
    dev: false,
    dir: process.cwd(), // 専用buildの場所を取得するメソッド
    hostname: "localhost",
    port: 3443,
    quiet: true,
  });
  if (application.hostname !== "localhost" ||
    application.port !== 3443) {
    throw new Error(FAILURE); // 公開hostname・portの不一致を拒否するコンストラクター
  }
  await application.prepare(); // 既存のproduction buildからNextを準備するメソッド
  const handle = application.getRequestHandler(); // production request handlerを取得するメソッド
  const server = http.createServer( // 所有preloaderが包むHTTP backendを生成する関数
    /**
     * 親TLS proxyで所有確認済みの要求だけをNextへ渡し、例外原文は返さない。
     */
    (request, response) => { // backend要求を受け取るコールバック
      void handle(request, response).catch( // Nextのhandlerを呼ぶ関数 / 非同期例外を処理するメソッド
        /**
         * 処理失敗時は固定応答だけを返し、SDK例外やURLを表示しない。
         */
        () => { // 固定エラー応答のコールバック
          if (!response.headersSent) {
            response.writeHead(500); // 固定HTTP状態を設定するメソッド
          }
          response.end(FAILURE); // 秘密を含まない応答で終了するメソッド
        },
      );
    },
  );
  await new Promise( // backendの起動結果だけを待つ非同期処理のコンストラクター
    /**
     * 同じrunのTLS proxyだけが接続できるloopback backendを起動する。
     */
    (accept, reject) => { // 起動結果を受け取るコールバック
      server.once("error", reject); // 起動失敗を通知するメソッド / 失敗通知関数
      server.listen(3000, "127.0.0.1", // 所有するloopbackの固定portへbindするメソッド
        /**
         * loopback backendがlistenしたことだけを通知する。
         */
        () => accept(undefined), // 起動完了を通知するコールバック・関数
      ); // loopbackの固定portへbindするメソッド / 成功通知関数
    },
  );
}

if (process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { // CLI直接起動の判定関数・メソッド
  try {
    await startMvpNextServer(); // guard後だけ専用production serverを起動する関数
  } catch {
    console.error(FAILURE); // 固定コードだけを表示するメソッド
    process.exitCode = 1;
  }
}
