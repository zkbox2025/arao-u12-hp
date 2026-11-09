// e2e/action-requests.ts
// 正規画面のAction ID・bind・Cookieをディスクへ保存せず、同じHTTPS入口へだけ再送する。

import {
  createHash,
} from "node:crypto";
import type {
  Page,
  Request as BrowserRequest,
} from "@playwright/test";
import type {
  PrismaClient,
} from "@prisma/client";

const FAILURE = "F12_ACTION_BOUNDARY_FAILED";

/**
 * 実画面で生成された要求をメモリ内でだけ保持する再送契約。
 */
export type CapturedAction = { // 正規Action要求の契約型
  url: string; // 同じOriginの送信先文字列型
  headers: Record<string, string>; // Cookieを含まない要求header辞書型
  body: Buffer; // メモリ内の要求バイト列型
};

/**
 * 実POSTのAction headerと本文を取得し、Cookie・Host・長さは再送時のcontextに任せる。
 */
function captured(request: BrowserRequest): CapturedAction { // 正規要求の抽出関数 / browser要求型 / 再送契約型
  const headers = request.headers(); // 実際の要求headerを取得するメソッド
  const body = request.postDataBuffer(); // 要求本文をバイト列で取得するメソッド
  if (!headers["next-action"] ||
    !body) {
    throw new Error(FAILURE); // 原文を含めない例外コンストラクター
  }
  for (const key of ["cookie", "host", "content-length"]) {
    delete headers[key];
  }
  return {
    url: request.url(), // 正規の送信先を取得するメソッド
    headers,
    body,
  };
}

/**
 * UIが発行した一つのActionを捕捉し、元のPOSTは実行せず、待機とrouteを必ず解除する。
 */
export async function captureAction( // 実UIの要求を捕捉する関数
  page: Page, // 正規フォームを表示する画面型
  submit: () => Promise<unknown>, // 正規ボタンを押す非同期関数型
): Promise<CapturedAction> { // メモリ内要求の非同期型
  const address = new URL(page.url()); // 現在の送信先を解析するコンストラクター / URL取得メソッド
  if (address.origin !== "https://localhost:3443") {
    throw new Error(FAILURE); // 専用HTTPS入口以外の捕捉を拒否するコンストラクター
  }
  let timer: ReturnType<typeof setTimeout> | undefined; // 待機timerの戻り値型・未設定型
  /**
   * 捕捉前の初期状態では何も通知しない。Promiseの準備時に通知先を設定する。
   */
  let accept: (value: CapturedAction) => void = () => undefined; // 要求を通知する関数型 / 捕捉要求型 / 初期コールバック
  const pending = new Promise<CapturedAction>( // 要求の到着を待つPromiseコンストラクター / 捕捉要求型
    /**
     * 要求到着と固定期限の失敗だけを呼出し元へ通知する。
     */
    (resolve, reject) => { // Promiseの準備コールバック
      accept = resolve; // 成功通知関数を保持する
      timer = setTimeout( // 期限timerを登録する関数
        /**
         * 要求が取得できなければ原文なしで失敗する。
         */
        () => reject(new Error(FAILURE)), // 固定失敗を通知するコールバック / 例外コンストラクター
        15000,
      );
    },
  );
  /**
   * 同じ画面・Originの正規Action一件だけを選ぶ。
   */
  const matches = (url: URL) => url.origin === address.origin && // 入力を受け取り操作・照合するコールバック / URLの参照型
    url.pathname === address.pathname; // URL判定コールバック / URL型
  /**
   * 捕捉するAction以外の通信は継続し、元のActionだけを通信前に中止する。
   */
  const handler: Parameters<Page["route"]>[1] = async (route) => { // route引数型から取得する型 / 画面型 / 捕捉コールバック
    const request = route.request(); // 捕捉した要求を取得するメソッド
    if (request.method() !== "POST" || // HTTP操作を取得するメソッド
      !request.headers()["next-action"]) { // HTTP操作・header取得メソッド
      await route.continue(); // Action以外を継続するメソッド
      return;
    }
    const value = captured(request); // 実要求の抽出関数
    await route.abort(); // 元の変更を実行させないメソッド
    accept(value); // 捕捉成功を通知する関数
  };
  try {
    await page.route(matches, handler); // 捕捉経路を登録するメソッド / URL判定関数 / 捕捉関数
    const [value] = await Promise.all([pending, submit()]); // 要求とUI操作を待つメソッド / 正規送信関数
    return value;
  } catch {
    throw new Error(FAILURE); // 秘密を含む要求や例外を公開しないコンストラクター
  } finally {
    clearTimeout(timer); // 待機を解除する関数
    await page.unroute(matches, handler); // 登録した捕捉だけを解除するメソッド / URL判定関数 / 捕捉関数
  }
}

/**
 * FormData内の業務項目を差し替え、明示bindのroot第2引数だけを元IDとの完全一致で改変する。
 * 【修正】FormDataに含まれるprogressive enhancement用のopaque metadataは編集しない。
 * 暗号化されたclosureは復号せず、変更対象を見つけられない形式は固定エラーで止める。
 */
export async function editAction( // 実要求の業務項目と明示bindを編集する関数
  action: CapturedAction, // メモリ内の正規要求型
  fields: Record<string, string> = {}, // 差し替える業務項目辞書型
  binding?: readonly [string, string], // 元ID・改変IDを表す読取専用tuple型
): Promise<CapturedAction> { // 編集済み要求の非同期型
  try {
    const request = new Request(action.url, { // 通信せずmultipartを解析する要求コンストラクター
      method: "POST",
      headers: action.headers,
      body: new Uint8Array(action.body), // 本文バイト列を複製するコンストラクター
    });
    let form = await request.formData(); // 【修正】実際のmultipartを解析するメソッド
    const nonces = [...form.keys()].filter( // 項目名を列挙して正規nonceを選ぶメソッド
      /**
       * Reactの実際のprefixを保ったまま業務FormDataの名前を特定する。
       */
      (key) => /^(?:_?\d+_)?requestId$/u.test(key), // 正規nonce名を判定するコールバック / 正規表現メソッド
    );
    if (nonces.length !== 1) {
      throw new Error(FAILURE); // 未対応形式を黙って通さないコンストラクター
    }
    const prefix = nonces[0].slice(0, -"requestId".length); // 実要求から業務prefixを抽出するメソッド
    const editedForm = new FormData(); // 【修正】ReactのFormDataグループ順を保持して再構築するコンストラクター
    let inserted = false;
    for (const [name, value] of form.entries()) { // 【修正】元のwire順序で項目を列挙するメソッド
      if (name.startsWith(prefix)) { // 【修正】選択した業務FormDataのグループだけを選ぶメソッド
        if (!inserted) {
          for (const [field, replacement] of Object.entries(fields)) { // 【修正】差し替える項目を同じグループの先頭へ挿入する関数
            editedForm.append(prefix + field, replacement); // 【修正】別FormDataの後ろへ追加せず正しい位置へ設定するメソッド
          }
          inserted = true;
        }
        if (Object.hasOwn(fields, name.slice(prefix.length))) { // 【修正】置換対象の元項目だけを省く所有判定関数・部分文字列取得メソッド
          continue;
        }
      }
      editedForm.append(name, value); // 【修正】opaque metadata・PDF・複数roleを元の順序で保持するメソッド
    }
    form = editedForm;
    if (binding) {
      const raw = form.get("0"); // 【修正】Reactが送るAction引数のrootモデルだけを取得するメソッド
      if (typeof raw !== "string") {
        throw new Error(FAILURE); // 【修正】未知のwire形式を拒否するコンストラクター
      }
      const argumentsModel: unknown = JSON.parse(raw); // 【修正】root引数だけを解析するメソッド / 未確定型
      if (
        !Array.isArray(argumentsModel) || // 【修正】引数列であることを検証する関数
        argumentsModel.length !== 4 ||
        typeof argumentsModel[0] !== "string" ||
        argumentsModel[1] !== binding[0] ||
        typeof argumentsModel[3] !== "string" ||
        !/^\$K[0-9a-f]+$/u.test(argumentsModel[3]) // 【修正】最後の引数が業務FormData参照であることを検証するメソッド
      ) {
        throw new Error(FAILURE); // 【修正】対象外のbindや暗号化closureを黙って置換しないコンストラクター
      }
      argumentsModel[1] = binding[1];
      form.set("0", JSON.stringify(argumentsModel)); // 【修正】第2引数だけを再符号化する設定・JSON化メソッド

    }
    const rebuilt = new Request(action.url, { // 通信しないHTTP要求のコンストラクター
      method: "POST",
      body: form
    }); // multipartを再符号化する要求コンストラクター
    return {
      ...action,
      headers: {
        ...action.headers,
        "content-type": rebuilt.headers.get("content-type")!, // 新しいboundaryを取得するメソッド
      },
      body: Buffer.from(await rebuilt.arrayBuffer()), // 再符号化バイト列の生成関数 / 本文取得メソッド
    };
  } catch {
    throw new Error(FAILURE); // FormData・bind・tokenの原文を捨てるコンストラクター
  }
}

/**
 * 選択した本人の実Cookieを使い、同じHTTPS入口へだけ要求を直接POSTする。
 */
export async function postAction( // Cookie・Originを分離して再送する関数
  page: Page, // 実Cookieを保持する画面型
  action: CapturedAction, // 正規または編集済み要求型
  options: { // 項目ごとの値を定義するオブジェクト型
    origin?: string; // 文字列型
    sentinel?: string; // 文字列型
    invalidateAction?: boolean // 真偽値型
  } = {}, // 再送条件型
) {
  try {
    if (new URL(action.url).origin !== "https://localhost:3443" ||
      new URL(action.url).origin !== new URL(page.url()).origin) { // 送信先と本人画面を解析するコンストラクター / URL取得メソッド
      throw new Error(FAILURE); // 別Originへの転送を拒否するコンストラクター
    }
    const headers = { ...action.headers };
    if (options.origin) {
      headers.origin = options.origin;
    }
    if (options.invalidateAction) {
      headers["next-action"] = headers["next-action"].slice(0, -1) + // 実IDの末尾だけを改変するメソッド
        (headers["next-action"].endsWith("0") ? "1" : "0"); // 確実に別IDにするメソッド
    }
    const response = await page.context().request.fetch(action.url, { // 実contextのCookieを使う取得・HTTP要求メソッド
      method: "POST",
      headers,
      data: action.body,
      maxRedirects: 0,
      timeout: 15000,
    });
    try {
      const text = await response.text(); // DTO・RSCをメモリ内だけへ取得するメソッド
      return {
        status: response.status(), // HTTP状態だけを取得するメソッド
        redirected: Boolean(response.headers()["x-action-redirect"] || // 値を真偽値へ変換する関数 / 実要求または応答のheaderを取得するメソッド
          response.headers().location), // 遷移headerを取得するメソッド / 真偽値変換関数
        exposed: options.sentinel ? text.includes(options.sentinel) : false, // sentinelの含有だけを返すメソッド
      };
    } finally {
      await response.dispose(); // 応答原文を保持するリソースを回収するメソッド
    }
  } catch {
    throw new Error(FAILURE); // CookieやRSCを失敗表示へ載せないコンストラクター
  }
}

/**
 * 二つの所有クラブの変更対象とStorage object・送信件数をhash化し、拒否前後だけ比較する。
 */
export async function actionState( // 副作用の比較用hashを取得する関数
  database: PrismaClient, // guard済みのDB client型
  clubIds: string[], // 所有クラブIDの配列型
  stub: unknown, // 私有stubの未確定応答型
): Promise<string> { // 比較用hashの非同期文字列型
  const where = { clubId: { in: clubIds } };
  const ordered = { id: "asc" } as const; // 一定順序を指定するリテラル型アサーション
  const rows = await Promise.all([ // 所有範囲の参照結果をまとめて待つメソッド
    database.clubEvent.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered
    }), // イベント取得メソッド
    database.clubNotice.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered
    }), // お知らせ取得メソッド
    database.clubEventAttachment.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered
    }), // 添付取得メソッド
    database.clubNoticeAttachment.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered
    }), // 添付取得メソッド
    database.clubMembership.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered
    }), // 所属取得メソッド
    database.childClubMembership.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered,
      include: { child: true }
    }), // 子どもと在籍取得メソッド
    database.clubInvitation.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered
    }), // 招待取得メソッド
    database.clubLineTarget.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered
    }), // 通知先取得メソッド
    database.clubLineDelivery.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered
    }), // 配送結果取得メソッド
    database.storageDeletionJob.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered
    }), // 削除job取得メソッド
    database.supportReport.findMany({ // 所有条件で複数行を取得するメソッド
      where,
      orderBy: ordered
    }), // 報告取得メソッド
    database.$queryRaw<{ // 所有prefixに限定した固定SQL参照メソッド / 対象値を並べる配列型 / 項目ごとの値を定義するオブジェクト型
      name: string; // 文字列型
      metadata: unknown // 未確定の入力型
    }[]>`SELECT name, metadata FROM storage.objects WHERE name LIKE ANY(${clubIds.map( // Storage参照メソッド / 結果行型 / 所有prefixへの変換メソッド
      /**
       * 所有クラブのprefixだけをSQLパラメーターへ渡す。
       */
      (id) => `clubs/${id}/%`, // 所有prefix生成コールバック
    )}::text[]) ORDER BY name`,
  ]);
  const state = stub as { // 項目ごとの値を定義するオブジェクト型
    records: unknown[]; // 対象値を並べる配列型 / 未確定の入力型
    storageChecks: unknown[] // 対象値を並べる配列型 / 未確定の入力型
  }; // 私有応答の参照用型アサーション
  if (!Array.isArray(state.records) || // 配列か検証する関数
    !Array.isArray(state.storageChecks)) { // 配列契約を検証する関数
    throw new Error(FAILURE); // 応答契約違反を拒否するコンストラクター
  }
  return createHash("sha256").update(JSON.stringify([rows, state.records, state.storageChecks])).digest("hex"); // hash生成関数 / 入力・JSON化・終端メソッド
}

/**
 * 標準の失敗表示に要求・token・SQL値を含めず、固定したケース名だけを残す。
 */
export async function safeBoundary(operation: () => Promise<void>): Promise<void> { // 検証の例外境界関数 / 非同期処理関数型 / 完了型
  try {
    await operation(); // 検証処理を実行する関数
  } catch {
    throw new Error(FAILURE); // 元例外・causeを保持しないコンストラクター
  }
}
