// tests/mvp/action-requests.test.ts
// 導入済みReactのencodeReplyを使い、実multipartのファイル・重複項目・bindを検証する。

import {
  execFileSync, // 【追加】DBを使わない実React codec検証用Nodeを起動する関数
} from "node:child_process";
import {
  createRequire,
} from "node:module";
import {
  expect,
  it,
} from "vitest";
import {
  editAction, // 実要求の業務項目・明示bindだけを編集する関数
  safeBoundary, // 秘密を含む例外を固定コードへ変換する関数
  type CapturedAction, // メモリ内だけで保持する正規Action要求の型
} from "../../e2e/action-requests";

const require = createRequire(import.meta.url); // 導入済みNextのReact encoderを読み込む関数
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node") as { // 導入済み実装を取得する関数 / encoder契約の型アサーション
  encodeReply: (values: unknown[]) => Promise<FormData>; // 実multipartを生成する非同期関数型
};

/**
 * 架空データだけを導入済みReactで符号化し、要求のwire契約を作る。
 */
async function fixture(): Promise<CapturedAction> { // 架空要求生成関数 / 非同期要求型
  const data = new FormData(); // 業務FormDataのコンストラクター
  data.set("requestId", "00000000-0000-4000-8000-000000000001"); // 正規nonce相当の架空値設定メソッド
  data.set("title", "owned-idを含む本文"); // IDの部分一致置換を検出する値の設定メソッド
  data.append("targetRoles", "OWNER"); // 重複する業務値を追加するメソッド
  data.append("targetRoles", "MEMBER"); // 重複する業務値を追加するメソッド
  data.set("attachmentFiles", new File(["fixture-pdf"], "test.pdf", { type: "application/pdf" })); // 架空ファイルの生成・設定メソッド
  const body = await encodeReply(["club-slug", "owned-id", { requestId: "nonce" }, data]); // 導入済みReactの実encoder関数
  const request = new Request("https://localhost:3443/owned", {
    method: "POST",
    body
  }); // 通信しない要求コンストラクター
  return {
    url: request.url,
    headers: {
      "content-type": request.headers.get("content-type")!, // 実boundary取得メソッド
      "next-action": "fixture-action-id",
    },
    body: Buffer.from(await request.arrayBuffer()), // wireバイト列取得・生成関数
  };
}

it("実React multipartのbound IDと業務項目だけを変更し、PDFと複数roleは保持する", // ケース登録関数
  /**
   * 自前の偽wire形式だけを通す試験にせず、インストール版Reactの形式を使う。
   */
  async () => { // 実wire編集の検証コールバック
    const original = await fixture(); // 架空要求生成関数
    const edited = await editAction(original, { clubId: "foreign-club" }, ["owned-id", "foreign-id"]); // 対象IDと業務値の編集関数
    const form = await new Request(edited.url, { // 通信しないHTTP要求のコンストラクター
      method: "POST",
      headers: edited.headers,
      body: new Uint8Array(edited.body) // バイト配列を生成するコンストラクター
    }).formData(); // 通信なしのmultipart解析コンストラクター・メソッド / バイト配列生成関数
    expect(form.get("_1_clubId")).toBe("foreign-club"); // 実prefixを含む編集値の取得・検証・比較メソッド
    expect(form.getAll("_1_targetRoles")).toEqual(["OWNER", "MEMBER"]); // 重複値の取得・検証・比較メソッド
    expect(form.get("_1_title")).toBe("owned-idを含む本文"); // 部分一致非置換を検証する取得・比較メソッド / 期待値関数
    expect(await (form.get("_1_attachmentFiles") as File).text()).toBe("fixture-pdf"); // PDFの保持を検証する関数 / File型の注釈・取得・本文・比較メソッド
    expect(JSON.parse(String(form.get("0")))[1]).toBe("foreign-id"); // 明示bindの改変を検証する関数 / JSON解析・文字列化・取得・比較メソッド
    expect(edited.headers["next-action"]).toBe(original.headers["next-action"]); // Action ID非ハードコードを検証する関数・比較メソッド
    expect(original.body.equals(edited.body)).toBe(false); // 元要求の非変更を検証する関数・バイト列比較メソッド
  },
);

it("未知wire・見つからないbind・未対応の引数列は秘密原文を捨てて拒否する", // ケース登録関数
  /**
   * 改ざんを実行せず正規要求を再送してしまう偽陽性を防ぐ。
   */
  async () => { // 拒否境界の検証コールバック
    const original = await fixture(); // 架空要求生成関数
    await expect(editAction(original, {}, ["not-present", "foreign"])).rejects.toThrow("F12_ACTION_BOUNDARY_FAILED"); // 不明bindの拒否を検証する関数・編集関数・比較メソッド
    await expect(editAction({ // 期待値を検証する関数 / 正規Actionの業務値・明示bindを編集する関数
      ...original,
      body: Buffer.from("FAKE_PRIVATE") // 入力をバイト列へ複製する関数
    })).rejects.toThrow("F12_ACTION_BOUNDARY_FAILED"); // 不明wireの拒否を検証する関数・編集・バイト列生成関数・比較メソッド
    const duplicate = new FormData(); // 【修正】未対応の引数列を持つFormDataのコンストラクター
    duplicate.set("_1_requestId", "nonce"); // 業務nonce設定メソッド
    duplicate.set("0", JSON.stringify(["same", "same"])); // 【修正】未対応の引数列をJSON化・設定するメソッド
    const request = new Request(original.url, { // 通信しないHTTP要求のコンストラクター
      method: "POST",
      body: duplicate
    }); // 通信しない要求コンストラクター
    await expect(editAction({ // 【修正】未対応の引数列の拒否を検証する関数 / 要求編集関数
      ...original,
      headers: {
        ...original.headers,
        "content-type": request.headers.get("content-type")! // 名前に対応する値を取得するメソッド
      }, // 実boundaryを取得するメソッド
      body: Buffer.from(await request.arrayBuffer()), // wire生成関数 / 本文取得メソッド
    }, {}, ["same", "foreign"])).rejects.toThrow("F12_ACTION_BOUNDARY_FAILED"); // 固定例外の比較メソッド
  },
);

it("安全な例外境界は元のmessageとcauseを公開しない", // ケース登録関数
  /**
   * SQL・Cookie・RSCを含む失敗でも、Playwrightへは固定コードだけを渡す。
   */
  async () => { // 例外非公開の検証コールバック
    try {
      await safeBoundary( // 原文を捨てる関数
        /**
         * 秘密相当の架空例外を注入する。
         */
        async () => { throw new Error("FAKE_PRIVATE"); }, // 失敗コールバック / 架空例外コンストラクター
      );
      throw new Error("EXPECTED_FAILURE"); // 見逃しを検出するコンストラクター
    } catch (error) {
      expect(error instanceof Error && // 期待値を検証する関数
        error.message === "F12_ACTION_BOUNDARY_FAILED" &&
        error.cause === undefined).toBe(true); // 固定例外・causeなしを検証する関数 / 例外型の絞込み・比較メソッド
    }
  },
);


/**
 * 【追加】Reactがprogressive enhancement用に生成する、実フォームmetadataの契約。
 */
type FixtureFormAction = { // 【追加】試験用フォームmetadataの型
  name: string; // 【追加】Reactが生成したhidden項目名の文字列型
  data: FormData; // 【追加】Reactが生成したopaque metadataの型
};

/**
 * 【追加】導入済みReactに登録した架空Server Actionの、フォーム符号化に必要な最小契約。
 */
type FixtureReference = { // 【追加】架空Action参照の契約型
  bind: (receiver: null, ...values: string[]) => FixtureReference; // 【追加】引数を束縛する関数型 / 同じ参照契約型
  $$FORM_ACTION: (prefix: string) => FixtureFormAction; // 【追加】フォームmetadataを生成する関数型 / metadata契約型
};

it("同じIDを含む実Reactフォームmetadataを保持し、rootの業務引数だけを改変する", // 【追加】回帰ケース登録関数
  /**
   * 【追加】実際のReact参照から生成したmetadataを要求へ含め、全JSON置換への回帰を防ぐ。
   */
  async () => { // 【追加】実multipartの境界を照合するコールバック
    const { registerServerReference } = require("next/dist/compiled/react-server-dom-webpack/client.node") as { // 【追加】導入済みReactの参照登録関数 / 最小契約への型アサーション
      registerServerReference: (reference: () => void, id: string) => FixtureReference; // 【追加】架空関数を登録する関数型 / 登録済み参照の型
    };
    const reference = registerServerReference( // 【追加】実Reactへ架空Actionを登録する関数
      /**
       * 【追加】符号化だけに使い、通信やDB操作を行わない架空Action。
       */
      () => undefined, // 【追加】副作用を持たないコールバック
      "fixture-action-id",
    ).bind(null, "club-slug", "owned-id"); // 【追加】実画面と同じ明示bindのメソッド
    let metadata: FixtureFormAction | undefined; // 【追加】符号化が完了したmetadataの型・未設定型
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        metadata = reference.$$FORM_ACTION("fixture"); // 【追加】導入済みReactのフォーム符号化メソッド
        break;
      } catch (pending) {
        if (
          typeof pending !== "object" ||
          pending === null ||
          typeof Reflect.get(pending, "then") !== "function" // 【追加】Reactの待機thenableだけを照合するメソッド
        ) {
          throw new Error("FIXTURE_FAILED"); // 【追加】原文を公開しない固定例外コンストラクター
        }
        await (pending as Promise<unknown>); // 【追加】符号化の非同期完了を待つ型アサーション
      }
    }
    if (!metadata) {
      throw new Error("FIXTURE_FAILED"); // 【追加】符号化未完了を拒否するコンストラクター
    }
    const original = await fixture(); // 【追加】正規要求の架空生成関数
    const form = await new Request(original.url, { // 【追加】通信しない要求コンストラクター
      method: "POST",
      headers: original.headers,
      body: new Uint8Array(original.body), // 【追加】元要求のバイト列を複製するコンストラクター
    }).formData(); // 【追加】元multipartを解析するメソッド
    for (const [name, value] of metadata.data.entries()) { // 【追加】実Reactのopaque項目を列挙するメソッド
      form.set("_1_" + name, value); // 【追加】業務FormData内の実metadataを保持する設定メソッド
    }
    form.set("_1_" + metadata.name, ""); // 【追加】実ReactのAction参照名を保持する設定メソッド
    const encoded = new Request(original.url, { // 【追加】metadata付きmultipartを生成するコンストラクター
      method: "POST",
      body: form,
    });
    const complete = {
      ...original,
      headers: {
        ...original.headers,
        "content-type": encoded.headers.get("content-type")!, // 【追加】再符号化boundaryを取得するメソッド
      },
      body: Buffer.from(await encoded.arrayBuffer()), // 【追加】元要求を再符号化する生成関数・取得メソッド
    };
    const edited = await editAction(complete, {}, ["owned-id", "foreign-id"]); // 【追加】rootの対象引数だけを編集する関数
    const after = await new Request(edited.url, { // 【追加】編集結果を解析する要求コンストラクター
      method: "POST",
      headers: edited.headers,
      body: new Uint8Array(edited.body), // 【追加】編集後バイト列のコンストラクター
    }).formData(); // 【追加】編集結果のmultipart解析メソッド
    expect(JSON.parse(String(after.get("0")))[1]).toBe("foreign-id"); // 【追加】rootだけの改変を照合する関数 / JSON解析・文字列化・値取得・比較メソッド
    let metadataMatches = 0;
    for (const [name, value] of metadata.data.entries()) { // 【追加】opaque metadataを再照合する列挙メソッド
      expect(after.get("_1_" + name) === value).toBe(true); // 【追加】原文を表示せず保持を照合する関数 / 項目取得・比較メソッド
      if (typeof value === "string" && value.includes("owned-id")) { // 【追加】元IDを持つmetadataが実際にあることを調べるメソッド
        metadataMatches++;
      }
    }
    expect(metadataMatches > 0).toBe(true); // 【追加】単なるmetadata不在による成功を防ぐ検証関数・比較メソッド
  },
);


it("遅延FormDataが後続しても、追加した業務フィールドを実React decoderが受け取る", // 【追加】wire順序の回帰ケース登録関数
  /**
   * 【追加】React server条件の子で実encoder・decoderを使い、末尾追記の見かけ上の成功を防ぐ。
   */
  () => { // 【追加】実codec経路を照合するコールバック
    const helper = new URL("../../e2e/action-requests.ts", import.meta.url).href; // 【追加】当該checkoutのヘルパーを指すURLコンストラクター
    const source = [
      'import {createRequire} from "node:module";',
      'const require=createRequire(import.meta.url);',
      'const {encodeReply}=require("next/dist/compiled/react-server-dom-webpack/client.node");',
      'const {decodeReply}=require("next/dist/compiled/react-server-dom-webpack/server.node");',
      `const {editAction}=await import(${JSON.stringify(helper)});`, // 【追加】所有ヘルパーのURLだけをJSON化するメソッド
      'const main=new FormData(); main.set("requestId","fake-nonce"); main.set("title","fixture");',
      'const other=new FormData(); other.set("other","fixture-other");',
      'const wire=await encodeReply(["slug","owned-id",{deferred:Promise.resolve(other)},main]);',
      'const request=new Request("https://localhost:3443/owned",{method:"POST",body:wire});',
      'const captured={url:request.url,headers:{"content-type":request.headers.get("content-type"),"next-action":"fixture"},body:Buffer.from(await request.arrayBuffer())};',
      'const changed=await editAction(captured,{deleteAttachmentIds:"foreign-id"});',
      'const multipart=await new Request(changed.url,{method:"POST",headers:changed.headers,body:new Uint8Array(changed.body)}).formData();',
      'const decoded=await decodeReply(multipart,{});',
      'if(decoded[3].get("deleteAttachmentIds")!=="foreign-id"||decoded[3].get("title")!=="fixture"||(await decoded[2].deferred).get("other")!=="fixture-other")process.exit(1);',
      'process.stdout.write("GROUP_ORDER_OK");',
    ].join("\n"); // 【追加】架空入力だけの検証コードを連結するメソッド
    const result = execFileSync(process.execPath, [ // 【追加】実React codecの隔離Nodeを起動する関数
      "--conditions=react-server",
      "--import", "tsx",
      "--input-type=module",
      "-e", source,
    ], {
      cwd: process.cwd(), // 【追加】同じcheckoutを取得するメソッド
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });
    expect(result.toString("utf8")).toBe("GROUP_ORDER_OK"); // 【追加】原文を含まない固定結果を照合する関数 / 文字列化・比較メソッド
  },
);
