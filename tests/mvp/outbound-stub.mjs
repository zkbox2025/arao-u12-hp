// tests/mvp/outbound-stub.mjs
// 専用loopback上で送信stubとブラウザーproxyを提供し、制御情報は実行secretで保護する。
// @ts-check
import {
  timingSafeEqual,
} from "node:crypto";
import http from "node:http";
import net from "node:net";
import {
  isAbsolute,
} from "node:path";
import {
  realpathSync,
} from "node:fs";
const FAILURE = "F12_E2E_OUTBOUND_FAILED";
const MODES = new Set([ // 重複のない集合
  "success",
  "rejected",
  "conflict",
  "server-error",
  "timeout",
  "network"
]);
const LIMIT = 64 * 1024;
/**
 * runnerだけが生成し、Playwrightへメモリ経由で渡す専用接続契約。
 * @typedef {object} MvpE2eSession
 * @property {string} runId 実行を識別する32桁hex。
 * @property {string} secret 制御・proxy認証専用の64桁hex。
 * @property {string} stubOrigin 所有するHTTP stubのorigin。
 * @property {string} appOrigin 所有するHTTPS入口。
 * @property {string} certificatePin 証明書公開鍵のSHA-256 SPKI。
 * @property {string} browserExecutable Playwright登録済みbrowserの実体パス。
 */
/**
 * 内容と長さを同時に照合し、制御secretを通常の文字列比較へ渡さない。
 * @param {unknown} actual 受信した認証値。
 * @param {string} expected 当該実行の認証値。
 */
function equalSecret(actual, expected) { // この処理を定義する関数・コールバック / 内容と長さを同時に照合し、制御secretを通常の文字列比較へ渡さない
  if (typeof actual !== "string") {
    return false;
  }
  const left = Buffer.from(actual); // バイト列を扱うBuffer API / 値からバイト列を作る関数・対象を選ぶメソッド
  const right = Buffer.from(expected); // バイト列を扱うBuffer API / 値からバイト列を作る関数・対象を選ぶメソッド
  return left.length === right.length &&
    timingSafeEqual(left, right); // バイト列を定時間で比較する関数
}
/**
 * 設定原文や秘密を例外へ含めず、明示されたE2E起動契約を検証する。
 * @param {Readonly<Record<string, string | undefined>>} [environment] runnerが作った許可環境。
 * @returns {Readonly<MvpE2eSession>} 検証した接続契約。
 */
export function readMvpE2eSession(environment = process.env) { // この処理を定義する関数・コールバック / 設定原文や秘密を例外へ含めず、明示されたE2E起動契約を検証する
  try {
    if (environment.RUN_MVP_TESTS !== "1" ||
      environment.MVP_TEST_DISPOSABLE !== "1" ||
      environment.RUN_MVP_E2E !== "1") {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    const value = JSON.parse(environment.MVP_E2E_SESSION ?? ""); // JSONを解析するメソッド
    const guard = Reflect.get(globalThis, Symbol.for("mvp.e2e.outbound.guard")); // 取得する関数・メソッド / 一意のsymbolを扱う組込みAPI / 共有symbolを取得するメソッド
    if (!value ||
      !guard ||
      guard.runId !== value.runId ||
      guard.phase !== "browser" ||
      !/^[0-9a-f]{32}$/u.test(value.runId) || // 正規表現の一致を調べるメソッド
      !/^[0-9a-f]{64}$/u.test(value.secret) || // 正規表現の一致を調べるメソッド
      value.appOrigin !== "https://localhost:3443" || // 【修正】Nextのloopback正規化に合わせた専用HTTPS入口
      typeof value.stubOrigin !== "string" ||
      !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(value.stubOrigin) || // 正規表現の一致を調べるメソッド
      new URL(value.stubOrigin).origin !== value.stubOrigin || // URLを解析・構築するコンストラクター
      typeof value.certificatePin !== "string" ||
      !/^[A-Za-z0-9+/]{43}=$/u.test(value.certificatePin) || // 正規表現の一致を調べるメソッド
      typeof value.browserExecutable !== "string" ||
      !isAbsolute(value.browserExecutable) || // 絶対パスか判定する関数
      realpathSync(value.browserExecutable) !== value.browserExecutable) { // パスの実体を解決する関数
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    return Object.freeze(value); // オブジェクトを扱う組込みAPI / 設定の変更を防ぐメソッド
  } catch {
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
}
/**
 * サイズを制限し、認証後の制御・送信payloadだけを一時メモリへ読む。
 * @param {import("node:http").IncomingMessage} request 受信request。
 * @returns {Promise<unknown>} JSONとして読み取った値。
 */
async function readBody(request) { // この処理を定義する関数・コールバック / サイズを制限し、認証後の制御・送信payloadだけを一時メモリへ読む
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk); // バイト列を扱うBuffer API / バイト数を数えるメソッド
    if (size > LIMIT) {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
    chunks.push(chunk); // 配列へ要素を追加するメソッド
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")); // JSONを解析するメソッド / バイト列を扱うBuffer API / バイト列を結合するメソッド / 文字列へ変換するメソッド
}
/**
 * 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない。
 * @param {import("node:http").ServerResponse} response 応答先。
 * @param {number} status HTTP状態。
 * @param {unknown} value 応答するJSON。
 */
function reply(response, status, value) { // この処理を定義する関数・コールバック / 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
  response.writeHead(status, { // HTTP状態とheaderを設定するメソッド
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value)); // 送信・応答を終了するメソッド / JSONへ直列化するメソッド
}
/**
 * 固定loopbackだけへbindし、既存のlistenerがあれば引き継がず失敗する。
 * @param {import("node:net").Server} server 所有するserver。
 * @param {number} port bindするport。0はOSによる割当。
 * @returns {Promise<number>} 実際に所有したport。
 */
export async function listenMvpServer(server, port) { // この処理を定義する関数・コールバック / 固定loopbackだけへbindし、既存のlistenerがあれば引き継がず失敗する
  return await new Promise( // 非同期結果を扱うPromise
    /**
     * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
     */
    (accept, reject) => { // この処理を定義する関数・コールバック / 成功を通知する関数 / 失敗を通知する関数
      /**
       * 接続先やOS例外を含めずbind失敗を通知する。
       */
      function failed() { // この処理を定義する関数・コールバック / 接続先やOS例外を含めずbind失敗を通知する
        reject(new Error(FAILURE)); // 失敗を通知する関数 / 固定例外のコンストラクター
      }
      server.once("error", failed); // イベントを一度だけ監視するメソッド / 接続先やOS例外を含めずbind失敗を通知する
      server.listen(port, "127.0.0.1",  // 接続受付を開始するメソッド
        /**
         * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
         */
        () => { // この処理を定義する関数・コールバック
          server.removeListener("error", failed); // イベント監視を解除するメソッド / 接続先やOS例外を含めずbind失敗を通知する
          const address = server.address(); // 所有socketのbind先を取得するメソッド
          if (!address ||
            typeof address === "string") {
            reject(new Error(FAILURE)); // 失敗を通知する関数 / 固定例外のコンストラクター
          } else {
            accept(address.port); // 成功を通知する関数
          }
        });
    });
}
/**
 * 所有する接続だけを追跡し、keep-aliveやCONNECT tunnelも停止時に回収する。
 * @param {import("node:net").Server} server 所有server。
 * @returns {() => Promise<void>} 冪等な停止関数。
 */
export function ownMvpServer(server) { // この処理を定義する関数・コールバック / 所有する接続だけを追跡し、keep-aliveやCONNECT tunnelも停止時に回収する
  /** @type {Set<import("node:net").Socket>} */
  const sockets = new Set(); // 重複のない集合
  server.on("connection",  // イベントを監視するメソッド
    /**
     * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
     */
    (socket) => { // この処理を定義する関数・コールバック
      sockets.add(socket); // 集合へ値を登録するメソッド
      socket.once("close",  // イベントを一度だけ監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        () => sockets.delete(socket)); // この処理を定義する関数・コールバック / 登録値を削除するメソッド
    });
  /**
   * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
   */
  return async () => { // この処理を定義する関数・コールバック
    for (const socket of sockets) {
      socket.destroy(); // 所有する接続を終了するメソッド
    }
    if (!server.listening) {
      return;
    }
    await new Promise( // 非同期結果を扱うPromise
      /**
       * 非同期処理の完了と失敗を、呼出し元へ通知するコールバック。
       */
      (accept) => server.close( // この処理を定義する関数・コールバック / 成功を通知する関数 / 所有資源を閉じる関数・メソッド
        /**
         * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
         */
        () => accept(undefined))); // この処理を定義する関数・コールバック / 成功を通知する関数
  };
}
/**
 * 実行単位で独立した送信stubを起動する。Auth・Storage・DBは置換しない。
 * @param {{runId: string, secret: string, supabaseOrigin: string}} options 所有契約。
 */
export async function startMvpOutboundStub(options) { // この処理を定義する関数・コールバック / 実行単位で独立した送信stubを起動する。Auth・Storage・DBは置換しない
  const { CLUB_ATTACHMENT_BUCKET } = await import( // 【追加】クラブ添付PDFのprivate bucket定数を遅延読込する関数
    "../../src/infrastructure/storage/club-attachment-storage-constants"
  );
  if (!/^[0-9a-f]{32}$/u.test(options.runId) || // 正規表現の一致を調べるメソッド
    !/^[0-9a-f]{64}$/u.test(options.secret) || // 正規表現の一致を調べるメソッド
    !/^http:\/\/(?:127\.0\.0\.1|localhost):54321$/u.test(options.supabaseOrigin)) { // 正規表現の一致を調べるメソッド
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
  /** @type {{channel: string, body: unknown, idempotencyKey: string | null}[]} */
  const records = [];
  /** @type {Map<string, string>} */
  const modes = new Map(); // キーと値を対応付けるMap
  /** @type {Map<string, string>} */
  const storage = new Map(); // キーと値を対応付けるMap
  /** @type {Map<string, {
   * mode: string,
   * skip: number,
   * seen: number
   * }>} */
  const storagePrefixes = new Map(); // 【追加】所有prefixごとの故障条件を保持する集合

  /** @type {string[]} */
  let prefixes = [];
  /**
   * 【追加】SDK操作の照合結果。本文・署名queryを保持しない。
   * @type {{
   * method: string,
   * path: string,
   * mode: string
   * }[]}
   */
  const storageChecks = []; // 【追加】署名tokenを含まないHTTP操作・path・故障判定だけを記録する配列

  /** @type {unknown} */
  let fixture;
  let ready = false;
  let violations = 0;
  const basic = "Basic " + Buffer.from(options.runId + ":" + options.secret).toString("base64"); // バイト列を扱うBuffer API / 値からバイト列を作る関数・対象を選ぶメソッド / 文字列へ変換するメソッド
  /**
   * 原文を保持せず、通信遮断を成功結果から除外する件数だけを増やす。
   */
  function violate() { // この処理を定義する関数・コールバック / 原文を保持せず、通信遮断を成功結果から除外する件数だけを増やす
    violations += 1;
  }
  /**
   * browserのHTTP proxy要求を、同じSupabaseのAuth・Storageだけへ中継する。
   * @param {import("node:http").IncomingMessage} request proxy request。
   * @param {import("node:http").ServerResponse} response 応答先。
   */
  function proxy(request, response) { // この処理を定義する関数・コールバック / browserのHTTP proxy要求を、同じSupabaseのAuth・Storageだけへ中継する
    if (!equalSecret(request.headers["proxy-authorization"], basic)) { // 内容と長さを同時に照合し、制御secretを通常の文字列比較へ渡さない
      response.writeHead(407, { // HTTP状態とheaderを設定するメソッド
        "Proxy-Authenticate": 'Basic realm="MVP"'
      });
      response.end(); // 送信・応答を終了するメソッド
      return;
    }
    const url = new URL(request.url ?? ""); // URLを解析・構築するコンストラクター
    if (url.origin !== options.supabaseOrigin ||
      url.username ||
      url.password ||
      !/^\/(?:auth|storage)\/v1\//u.test(url.pathname)) { // 正規表現の一致を調べるメソッド
      violate(); // 原文を保持せず、通信遮断を成功結果から除外する件数だけを増やす
      reply(response, 403, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
        code: FAILURE
      });
      return;
    }
    const headers = {
      ...request.headers
    };
    delete headers["proxy-authorization"];
    delete headers["proxy-connection"];
    headers.host = url.host;
    const upstream = http.request(url, { // HTTP requestを作る関数
      method: request.method,
      headers,
    },
      /**
       * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
       */
      (received) => { // この処理を定義する関数・コールバック
        response.writeHead(received.statusCode ?? 502, received.headers); // HTTP状態とheaderを設定するメソッド
        received.pipe(response); // streamを転送するメソッド
      });
    upstream.on("error",  // イベントを監視するメソッド
      /**
       * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
       */
      () => { // この処理を定義する関数・コールバック
        if (!response.headersSent) {
          reply(response, 502, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
            code: FAILURE
          });
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
  }
  /**
   * 認証済みの制御・送信だけを処理し、異なるrunや外向き要求を拒否する。
   * @param {import("node:http").IncomingMessage} request 受信request。
   * @param {import("node:http").ServerResponse} response 応答先。
   */
  async function handle(request, response) { // この処理を定義する関数・コールバック / 認証済みの制御・送信だけを処理し、異なるrunや外向き要求を拒否する
    if (/^https?:\/\//u.test(request.url ?? "")) { // 正規表現の一致を調べるメソッド
      proxy(request, response); // browserのHTTP proxy要求を、同じSupabaseのAuth・Storageだけへ中継する
      return;
    }
    if (request.socket.remoteAddress !== "127.0.0.1" ||
      request.headers.origin ||
      request.method !== "POST" ||
      !equalSecret(request.headers["x-mvp-secret"], options.secret)) { // 内容と長さを同時に照合し、制御secretを通常の文字列比較へ渡さない
      reply(response, 404, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
        code: FAILURE
      });
      return;
    }
    const body = /** @type {Record<string, unknown>} */ (await readBody(request)); // サイズを制限し、認証後の制御・送信payloadだけを一時メモリへ読む
    if (request.url === "/violation") {
      violate(); // 原文を保持せず、通信遮断を成功結果から除外する件数だけを増やす
      reply(response, 200, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
        accepted: true
      });
      return;
    }
    if (request.url === "/control") {
      if (body.runId !== options.runId) {
        reply(response, 404, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
          code: FAILURE
        });
        return;
      }
      if (body.action === "status") {
        reply(response, 200, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
          runId: options.runId,
          ready,
          violations,
          requests: records.length
        });
      } else if (body.action === "read") {
        reply(response, 200, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
          records,
          storageChecks,
          fixture
        });
      } else if (body.action === "reset") {
        records.length = 0;
        storageChecks.length = 0;
        modes.clear(); // 登録値を消去するメソッド
        storage.clear(); // 登録値を消去するメソッド
        storagePrefixes.clear(); // 【追加】次のケースへ故障条件を持ち越さないメソッド
        reply(response, 200, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
          accepted: true
        });
      } else if (body.action === "configure" &&
        typeof body.mode === "string" &&
        MODES.has(body.mode)) { // 登録の有無を調べるメソッド
        if (body.channel === "resend" ||
          body.channel === "line") {
          modes.set(body.channel, body.mode); // 値を設定するメソッド
        } else if (body.channel === "storage" &&
          typeof body.path === "string" &&
          typeof body.method === "string" &&
          /^(GET|POST|PUT|DELETE)$/u.test(body.method) && // 正規表現の一致を調べるメソッド
          body.path.startsWith("/storage/v1/object/") && // 文字列の先頭を照合するメソッド
          !/[?#\\]/u.test(body.path) && // 正規表現の一致を調べるメソッド
          decodeURIComponent(body.path) === body.path && // URLのpercent表記を復号する関数
          new URL(body.path, options.supabaseOrigin).pathname === body.path && // URLを解析・構築するコンストラクター
          (body.match === undefined ||
            body.match === "exact" ||
            body.match === "prefix") &&
          Number.isSafeInteger(body.skip ?? 0) && // 【追加】故障までの成功回数を整数で検証する関数
          Number(body.skip ?? 0) >= 0 && // 【追加】負の回数を拒否する数値変換関数
          Number(body.skip ?? 0) <= 100 && // 【追加】故障設定の待機回数を制限する数値変換関数
          prefixes.some( // 【追加】登録された所有prefixからの先頭一致を検証するメソッド
            /**
             * 【追加】固定bucket内の所有クラブだけを故障対象とする。
             */
            (prefix) => new RegExp( // 【追加】所有prefixの後ろにcontent種別だけを許す判定コールバック / 正規表現コンストラクター
              "^/storage/v1/object/(?:sign/)?" + CLUB_ATTACHMENT_BUCKET + "/" + prefix + "(?:events|notices)/"
            ).test(String(body.path))) && // 【追加】正規の所有pathを検証するメソッド / 文字列変換関数
          (body.match !== "prefix" ||
            new RegExp( // 【修正】実bucketの所有content直下だけを許す正規表現コンストラクター
              "^/storage/v1/object/" + CLUB_ATTACHMENT_BUCKET + "/clubs/[0-9a-f-]{36}/(?:events|notices)/$",
              "u",
            ).test(body.path))) { // 【追加】prefix設定は所有するcontent種別の直下だけへ限定するメソッド
          if (body.match === "prefix") {
            storagePrefixes.set(body.method + " " + body.path, { // 【追加】故障条件と経過回数を登録するメソッド
              mode: body.mode,
              skip: Number(body.skip ?? 0), // 【追加】検証済み待機回数を数値へ変換する関数
              seen: 0,
            });
          } else {
            storage.set(body.method + " " + body.path, body.mode); // 【追加】完全一致の既存故障条件を登録するメソッド
          }
        } else {
          reply(response, 400, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
            code: FAILURE
          });
          return;
        }
        reply(response, 200, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
          accepted: true
        });
      } else {
        reply(response, 400, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
          code: FAILURE
        });
      }
      return;
    }
    if (request.url === "/storage") {
      const key = body.method + " " + body.path;
      let mode = storage.get(key) ?? "success"; // 【追加】完全一致の設定を優先するメソッド
      if (!storage.has(key)) { // 【追加】完全一致で指定された正常応答も優先するメソッド
        for (const [prefix, rule] of storagePrefixes) {
          if (key.startsWith(prefix)) { // 【追加】HTTP操作と所有prefixを同時に照合するメソッド
            mode = rule.seen++ < rule.skip ? "success" : rule.mode;
            break;
          }
        }
      }
      storageChecks.push({ // 【追加】SDKで実際に照合された操作を一時メモリに記録するメソッド
        method: String(body.method), // 【追加】HTTP操作を文字列に限定する関数
        path: String(body.path), // 【追加】queryを含まない照合pathを文字列に限定する関数
        mode,
      });
      reply(response, 200, { // 【追加】秘密や対象pathを含めず故障条件だけを返す関数
        mode,
      });
      return;
    }
    const channel = request.url === "/send/resend"
      ? "resend"
      :
      request.url === "/send/line"
        ? "line"
        : undefined;
    if (!channel ||
      records.length >= 100) {
      violate(); // 原文を保持せず、通信遮断を成功結果から除外する件数だけを増やす
      reply(response, 400, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
        code: FAILURE
      });
      return;
    }
    records.push({ // 配列へ要素を追加するメソッド
      channel,
      body,
      idempotencyKey: typeof request.headers["x-mvp-idempotency"] === "string"
        ? request.headers["x-mvp-idempotency"]
        : null,
    });
    const mode = modes.get(channel) ?? "success"; // 取得する関数・メソッド
    if (mode === "timeout" ||
      mode === "network") {
      response.setHeader("x-mvp-fault", mode); // 応答headerを設定するメソッド
      reply(response, 503, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
        code: FAILURE
      });
      return;
    }
    const status = mode === "success"
      ? 200
      : mode === "rejected"
        ? 422
        :
        mode === "conflict"
          ? 409
          : 503;
    reply(response, status, channel === "resend" // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
      ? status === 200
        ? {
          id: "mvp-" + options.runId
        }
        : {
          name: status === 422
            ? "validation_error"
            : "application_error",
          message: FAILURE
        }
      : {
        accepted: status === 200
      });
  }
  const server = http.createServer( // serverを生成する関数
    /**
     * 所有serverのrequestを受け取り、この接続の応答処理を実行するコールバック。
     */
    (request, response) => { // この処理を定義する関数・コールバック
      void handle(request, response).catch( // 認証済みの制御・送信だけを処理し、異なるrunや外向き要求を拒否する / 例外を処理するメソッド
        /**
         * 例外を処理し、原文を公開せずに失敗状態を扱うコールバック。
         */
        () => { // この処理を定義する関数・コールバック
          if (!response.headersSent) {
            reply(response, 400, { // 固定形式で応答し、制御値をキャッシュ・外部ログへ残さない
              code: FAILURE
            });
          } else {
            response.destroy(); // 所有する接続を終了するメソッド
          }
        });
    });
  const close = ownMvpServer(server); // 所有資源を閉じる関数・メソッド / 所有する接続だけを追跡し、keep-aliveやCONNECT tunnelも停止時に回収する
  server.on("connect",  // イベントを監視するメソッド
    /**
     * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
     */
    (request, socket, head) => { // この処理を定義する関数・コールバック
      socket.on("error", // 【追加】CONNECT接続の切断エラーを回収するメソッド
        /**
         * 【追加】ブラウザーの接続切断を受け、当該socketだけを終了する。
         */
        () => socket.destroy()); // 【追加】切断を処理するコールバック / 当該接続を閉じるメソッド
      if (!equalSecret(request.headers["proxy-authorization"], basic)) { // 内容と長さを同時に照合し、制御secretを通常の文字列比較へ渡さない
        socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="MVP"\r\n\r\n'); // 送信・応答を終了するメソッド
        return;
      }
      if (request.url !== "localhost:3443") { // 【修正】Nextのloopback正規化に合わせた専用HTTPS入口
        violate(); // 原文を保持せず、通信遮断を成功結果から除外する件数だけを増やす
        socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); // 送信・応答を終了するメソッド
        return;
      }
      const upstream = net.connect(3443, "127.0.0.1",  // 接続を開始するメソッド
        /**
         * 呼出し元が渡す値を使い、ここに定義した処理を実行するコールバック。
         */
        () => { // この処理を定義する関数・コールバック
          socket.write("HTTP/1.1 200 Connection Established\r\n\r\n"); // データを書き込むメソッド
          if (head.length) {
            upstream.write(head); // データを書き込むメソッド
          }
          socket.pipe(upstream); // streamを転送するメソッド
          upstream.pipe(socket); // streamを転送するメソッド
        });
      socket.once("close",  // イベントを一度だけ監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        () => upstream.destroy()); // この処理を定義する関数・コールバック / 所有する接続を終了するメソッド
      upstream.on("error",  // イベントを監視するメソッド
        /**
         * 登録したイベントを受け取り、この処理の状態更新や完了通知を行うコールバック。
         */
        () => socket.destroy()); // この処理を定義する関数・コールバック / 所有する接続を終了するメソッド
    });
  try {
    const port = await listenMvpServer(server, 0); // 固定loopbackだけへbindし、既存のlistenerがあれば引き継がず失敗する
    return {
      origin: "http://127.0.0.1:" + port,
      close, // 所有資源を閉じる関数・メソッド
      /**
       * 実行全体の遮断件数はresetで消さず、集計だけを返す。
       */
      status() { // この処理を定義する関数・コールバック / 実行全体の遮断件数はresetで消さず、集計だけを返す
        return {
          violations,
          requests: records.length
        };
      },
      /**
       * 所有serverの正常応答を確認した後だけreadyへ進める。
       */
      markReady() { // この処理を定義する関数・コールバック / 所有serverの正常応答を確認した後だけreadyへ進める
        ready = true;
      },
      /**
       * seedした当該runのIDと認証情報を、制御secretで守る一時メモリへ登録する。
       * @param {unknown} data 専用fixtureの公開データ。
       * @param {string[]} ownedPrefixes 当該fixtureが所有するStorage prefix。
       */
      registerFixture(data, ownedPrefixes) { // この処理を定義する関数・コールバック / seedした当該runのIDと認証情報を、制御secretで守る一時メモリへ登録する
        if (!ownedPrefixes.every( // 全要素の条件を確認するメソッド
          /**
           * 各要素が、この処理の照合条件に一致するかを判定するコールバック。
           */
          (prefix) => /^clubs\/[0-9a-f-]{36}\/$/u.test(prefix))) { // この処理を定義する関数・コールバック / 正規表現の一致を調べるメソッド
          throw new Error(FAILURE); // 固定例外のコンストラクター
        }
        fixture = data;
        prefixes = [...ownedPrefixes];
      },
    };
  } catch {
    await close(); // 所有資源を閉じる関数・メソッド
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
}
/**
 * Playwright起動前にrunnerの所有・準備完了・通信違反なしを確認するglobal setup。
 */
export default async function verifyMvpE2eOwner() { // この処理を定義する関数・コールバック / Playwright起動前にrunnerの所有・準備完了・通信違反なしを確認するglobal setup
  try {
    const session = readMvpE2eSession(); // 設定原文や秘密を例外へ含めず、明示されたE2E起動契約を検証する
    const response = await fetch(session.stubOrigin + "/control", { // HTTP通信を実行する関数
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mvp-secret": session.secret,
      },
      body: JSON.stringify({ // JSONへ直列化するメソッド
        runId: session.runId,
        action: "status"
      }),
      signal: AbortSignal.timeout(3000), // 中断signalのAPI / 期限付き中断signalを作るメソッド
      redirect: "error",
    });
    const state = await response.json(); // JSON応答を読み取るメソッド
    if (!response.ok ||
      state.runId !== session.runId ||
      !state.ready ||
      state.violations !== 0) {
      throw new Error(FAILURE); // 固定例外のコンストラクター
    }
  } catch {
    throw new Error(FAILURE); // 固定例外のコンストラクター
  }
}
