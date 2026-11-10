// e2e/line-settings.spec.ts
// 実画面の登録コードと署名付きHTTPを接続し、クラブ・本人・通知先の束縛を照合する。

import {
  createHash,
  createHmac,
  randomUUID
} from "node:crypto";
import type {
  Page
} from "@playwright/test";
import {
  test, // 所有LINE設定と回収台帳を備えた実Cookie fixture
  expect, // 画面・HTTP・DBを照合する期待値関数
  type OperationsScenario, // 粒度16の所有DB・画面・LINE設定の契約型
} from "./operations-fixtures";
import {
  replayAs, // 正規Actionを別本人の実Cookieで再送する関数
} from "./member-fixtures";
import {
  contentDenied, // Streamingを含む404表示とnoindexを照合する関数
} from "./content-fixtures";

/**
 * 所有クラブのLINE管理画面だけを指す相対URLを作る。
 */
function settingsPath(scenario: OperationsScenario, // 所有クラブのLINE管理URLを作る関数 / 所有DB・実Cookie・回収台帳の操作契約型
  club: "a" | "b"): string { // URL生成関数 / 操作契約型 / クラブキー型 / 文字列型
  return `/club/${scenario.data.clubs[club].slug}/admin/settings/line`;
}

/**
 * OWNERの実フォームでコードを発行し、DBにはhashだけが保存されたことを照合する。
 */
async function issueCode( // OWNERの実フォームで登録コードを発行しhash保存を照合する関数
  scenario: OperationsScenario, // 所有DBと画面の契約型
  club: "a" | "b", // 所有クラブキー型
): Promise<string> { // メモリ内だけに保持するコードの非同期文字列型
  const page = club === "a" ? scenario.admin : scenario.foreignAdmin;
  await page.goto(settingsPath(scenario, club)); // 正規画面への移動メソッド / 所有URL生成関数
  const [response] = await Promise.all([ // 【追加】正規POSTの応答とクリックを同時に待つメソッド
    page.waitForResponse( // 【追加】同じOrigin・管理画面への実POSTだけを待つメソッド
      /**
       * 【追加】先読みGETと区別し、所有クラブのコード発行Actionだけを選ぶ。
       */
      (candidate) => { // 【追加】発行Actionの応答を照合するコールバック
        const url = new URL(candidate.url()); // 【追加】応答URLをメモリ内で解析するコンストラクター・URL取得メソッド
        return candidate.request().method() === "POST" && // 【追加】要求取得・メソッド判定メソッド
          url.origin === scenario.session.appOrigin &&
          url.pathname === settingsPath(scenario, club); // 【追加】所有管理URLを作る関数
      },
    ),
    page.getByRole("button", { // 【修正】正規発行ボタンを選ぶメソッド
      name: "登録コードを発行する",
      exact: true,
    }).click(), // 【修正】実POSTを発生させる操作メソッド
  ]);
  expect(response.status()).toBe(200); // 【追加】発行ActionのHTTP成功を検証する期待値関数・状態取得・比較メソッド
  await expect(page.locator("code")).toHaveCount(1, { // 【修正】Action後の実表示を条件待機する期待値関数・選択・比較メソッド
    timeout: 15000,
  });
  const code = await page.locator("code").innerText(); // 発行値をメモリへ取得する選択・取得メソッド
  expect(/^CLUB-LINE-[A-Za-z0-9_-]{43}$/u.test(code)).toBe(true); // 書式だけを照合する期待値関数・正規表現・比較メソッド
  const hash = createHash("sha256").update(code).digest("hex"); // 保存値との比較用hashを生成・入力・終端する関数・メソッド
  const tokens = await scenario.database.clubLineRegistrationToken.findMany({ // 所有設定の未使用tokenを取得するメソッド
    where: {
      clubId: scenario.data.clubs[club].id,
      lineSettingId: scenario.line[club].id,
      usedAt: null,
      expiresAt: {
        gt: new Date(), // 有効期限比較の日時コンストラクター
      },
    },
  });
  expect(tokens.length).toBe(1); // 所有token数を検証する期待値関数・比較メソッド
  expect(tokens[0].tokenHash === hash && // 画面・DBの期待値を検証する関数
    tokens[0].tokenHash !== code).toBe(true); // 生コードが保存されていないことを検証する期待値関数・比較メソッド
  return code;
}

/**
 * 架空LINEの未加工本文を署名し、同じ専用アプリのWebhookへHTTP POSTする。
 */
async function webhook( // 架空署名を付けて専用WebhookへHTTP POSTする関数
  scenario: OperationsScenario, // 所有URLと署名秘密の契約型
  club: "a" | "b", // 受付先クラブキー型
  code: string, // メモリ内だけの登録コード文字列型
  overrides: { // クラブ間の差し替え条件型
    key?: string; // 公開識別子の文字列型
    secret?: string; // 架空署名秘密の文字列型
    destination?: string; // 架空Bot IDの文字列型
    malformed?: boolean; // 署名書式不正の真偽値型
  } = {},
) { // APIRequestContextの応答を返す関数
  const setting = scenario.line[club];
  const body = JSON.stringify({ // 署名対象の未加工本文を作るメソッド
    destination: overrides.destination ?? setting.lineBotUserId,
    events: [{
      type: "message",
      source: {
        type: "group",
        groupId: "C" + setting.id.replaceAll("-", ""), // 所有設定IDから架空group IDを作るメソッド
      },
      message: {
        type: "text",
        text: code,
      },
    }],
  });
  const signature = createHmac("sha256", overrides.secret ?? setting.secret).update(body).digest("base64"); // 未加工本文の署名生成関数・入力・符号化メソッド
  return scenario.admin.context().request.post(`/api/line/webhook/${overrides.key ?? setting.webhookKey}`, { // 実HTTPのcontext取得・POSTメソッド
    headers: {
      "Content-Type": "application/json",
      "x-line-signature": overrides.malformed ? "invalid" : signature,
    },
    data: body,
    maxRedirects: 0,
  });
}

/**
 * 二クラブのtoken・通知先をメモリ内比較値にし、HTTP拒否の前後差分を検出する。
 */
async function lineState(scenario: OperationsScenario): Promise<string> { // 比較値取得関数 / 操作契約型 / 非同期文字列型
  const ids = [scenario.data.clubs.a.id, scenario.data.clubs.b.id];
  return JSON.stringify(await scenario.database.$transaction([ // 比較値の直列化メソッド / 読取transactionメソッド
    scenario.database.clubLineRegistrationToken.findMany({ // 所有tokenを固定順で読むメソッド
      where: {
        clubId: {
          in: ids
        }
      },
      orderBy: {
        id: "asc"
      },
    }),
    scenario.database.clubLineTarget.findMany({ // 所有通知先を固定順で読むメソッド
      where: {
        clubId: {
          in: ids
        }
      },
      orderBy: {
        id: "asc"
      },
    }),
  ]));
}

/**
 * 正規Webhookで無効登録し、OWNERの実フォームでのみ有効化する。
 */
test("OWNERのコード発行・署名Webhook登録・通知先有効化と使用済みコード再送を確認する", // E2Eケース登録関数
  /**
   * stub配送を発生させず、登録と通知先設定のDB状態を実画面で確認する。
   */
  async ({ operations: scenario }) => { // 所有ケースのコールバック
    test.setTimeout(60000); // 【追加】複数の実ActionとRSC反映を含むケースの期限を設定するメソッド
    const code = await issueCode(scenario, "a"); // 正規発行とhash保存の検証関数
    const response = await webhook(scenario, "a", code); // 正規署名付きHTTP送信関数
    expect(response.status()).toBe(200); // 公開HTTP状態を検証する期待値関数・取得・比較メソッド
    expect(await response.json()).toEqual({ // 画面・DBの期待値を検証する関数 / 公開応答をJSONとしてメモリへ取得するメソッド / 期待する構造との一致を検証するメソッド
      ok: true
    }); // 公開応答を検証する期待値関数・JSON取得・比較メソッド
    const target = await scenario.database.clubLineTarget.findFirstOrThrow({ // 所有通知先を取得するメソッド
      where: {
        clubId: scenario.data.clubs.a.id,
        lineSettingId: scenario.line.a.id,
      },
    });
    expect(target.isEnabled).toBe(false); // 初期無効を検証する期待値関数・比較メソッド
    expect(target.targetRoles).toEqual([]); // 初期通知対象が空であることを検証する期待値関数・比較メソッド
    await scenario.admin.goto(settingsPath(scenario, "a")); // 新規読込メソッド / 所有URL生成関数
    const form = scenario.admin.locator('form:has(input[name="targetName"])'); // 通知先フォームを選ぶメソッド
    await expect(form).toHaveCount(1); // 対象フォーム数を検証する期待値関数・比較メソッド
    await form.locator('input[name="targetName"]').fill("F12通知先"); // 名称欄の選択・入力メソッド
    await form.locator('input[name="targetRoles"][value="MEMBER"]').check(); // 対象roleの選択・有効化メソッド
    await form.locator('input[name="isEnabled"]').check(); // 通知先有効化欄の選択・操作メソッド
    await form.getByRole("button", { // roleと名前で正規要素を選ぶメソッド
      name: "設定を保存する",
      exact: true
    }).click(); // 保存ボタンの選択・操作メソッド
    await expect.poll( // DB更新の完了を検証するメソッド
      /**
       * URLや秘密を出さず、所有通知先の有効化だけを待つ。
       */
      async () => (await scenario.database.clubLineTarget.findUniqueOrThrow({ // 所有通知先取得のコールバック・メソッド
        where: {
          id: target.id
        },
      })).isEnabled,
    ).toBe(true); // 有効化済みを検証するメソッド
    const saved = await scenario.database.clubLineTarget.findUniqueOrThrow({ // 識別子に一致する所有行を取得するメソッド
      where: {
        id: target.id
      }
    }); // 保存値を取得するメソッド
    expect(saved.targetName).toBe("F12通知先"); // 正規名称を検証する期待値関数・比較メソッド
    expect(saved.targetRoles).toEqual(["MEMBER"]); // 正規対象roleを検証する期待値関数・比較メソッド
    const before = await lineState(scenario); // 再送前の比較値を取得する関数
    expect((await webhook(scenario, "a", code)).status()).toBe(200); // 再送HTTP関数・状態取得・期待値・比較メソッド
    expect(await lineState(scenario) === before).toBe(true); // 使用済みコードが設定を変えないことを検証する関数・比較メソッド
  },
);

/**
 * key・署名秘密・destination・登録tokenのクラブ間入替でDB非更新を確認する。
 */
test("A/BのWebhook key・署名・destination・登録tokenの入替は対象を作らない", // E2Eケース登録関数
  /**
   * 公開応答の失敗分類と、200で無視される別クラブtokenを区別する。
   */
  async ({ operations: scenario }) => { // 所有ケースのコールバック
    test.setTimeout(60000); // 【追加】複数の実ActionとRSC反映を含むケースの期限を設定するメソッド
    const a = await issueCode(scenario, "a"); // Aの正規コード発行関数
    const b = await issueCode(scenario, "b"); // Bの正規コード発行関数
    const before = await lineState(scenario); // 二クラブの比較値取得関数
    const cases = [
      {
        key: randomUUID(), // 試験資源のUUIDを予約する関数
        expected: 404
      }, // 未登録の公開識別子を生成する関数
      {
        key: scenario.line.b.webhookKey,
        expected: 401
      },
      {
        secret: scenario.line.b.secret,
        expected: 401
      },
      {
        destination: scenario.line.b.lineBotUserId,
        expected: 403
      },
      {
        malformed: true,
        expected: 401
      },
    ];
    for (const entry of cases) {
      const response = await webhook(scenario, "a", a, entry); // 差し替えた実HTTPを送る関数
      expect(response.status()).toBe(entry.expected); // 公開状態の取得・期待値・比較メソッド
      const body = await response.json(); // 公開応答をメモリへ取得するメソッド
      expect(body.ok).toBe(false); // 公開拒否フラグを検証する期待値関数・比較メソッド
      expect(body.message).toBe( // 公開メッセージだけを検証する期待値関数・比較メソッド
        entry.expected === 404 ? "Not found" : entry.expected === 403 ? "Forbidden" : "Unauthorized",
      );
      expect(Object.keys(body).sort()).toEqual(["message", "ok"]); // 公開列だけを検証する列挙関数・整列・期待値・比較メソッド
      expect(await lineState(scenario) === before).toBe(true); // 対象・token非更新を検証する取得関数・期待値・比較メソッド
    }
    expect((await webhook(scenario, "a", b)).status()).toBe(200); // 別クラブtokenの無視を検証するHTTP関数・状態取得・期待値・比較メソッド
    expect((await webhook(scenario, "b", a)).status()).toBe(200); // 逆方向の無視を検証するHTTP関数・状態取得・期待値・比較メソッド
    expect(await lineState(scenario) === before).toBe(true); // tokenを消費していないことを検証する関数・期待値・比較メソッド
  },
);

/**
 * MEMBERの直接コード発行Actionと、管理画面へのアクセスを拒否する。
 */
test("MEMBERの実CookieでOWNERの登録コードActionを再送しても発行しない", // E2Eケース登録関数
  /**
   * UIの非表示だけでなく正規Actionの直接POSTでもDB非更新を照合する。
   */
  async ({ operations: scenario }) => { // 所有ケースのコールバック
    test.setTimeout(60000); // 【追加】複数の実ActionとRSC反映を含むケースの期限を設定するメソッド
    await scenario.admin.goto(settingsPath(scenario, "a")); // 正規管理画面への移動メソッド・URL生成関数
    const before = await lineState(scenario); // 拒否前の比較値取得関数
    await replayAs(scenario.admin, scenario.member, // 正規Actionを別本人Cookieで再送する関数
      /**
       * 必須nonceを含む正規の発行Actionを捕捉する。
       */
      async () => { // 正規フォーム送信のコールバック
        await scenario.admin.getByRole("button", { // roleと名前で正規要素を選ぶメソッド
          name: "登録コードを発行する",
          exact: true
        }).click(); // 発行ボタン選択・操作メソッド
      },
    );
    expect(await lineState(scenario) === before).toBe(true); // 不正発行の非更新を検証する関数・期待値・比較メソッド
    await contentDenied(scenario.member, settingsPath(scenario, "a")); // 404とnoindex検証関数・所有URL生成関数
  },
);

/**
 * AのOWNERでBではMEMBERの本人へ、BのtargetId付き正規Actionを再送する。
 */
test("B targetIdの通知先更新をA OWNER・B MEMBERのCookieで再送してもBは変わらない", // E2Eケース登録関数
  /**
   * 暗号化されたbind引数を含む実Actionを使用し、hidden clubIdに依存しない。
   */
  async ({ operations: scenario }) => { // 所有ケースのコールバック
    test.setTimeout(60000); // 【追加】複数の実ActionとRSC反映を含むケースの期限を設定するメソッド
    const code = await issueCode(scenario, "b"); // Bのコード発行関数
    expect((await webhook(scenario, "b", code)).status()).toBe(200); // 正規登録のHTTP関数・状態取得・期待値・比較メソッド
    await scenario.foreignAdmin.goto(settingsPath(scenario, "b")); // Bの正規画面へ移動するメソッド・URL生成関数
    const form = scenario.foreignAdmin.locator('form:has(input[name="targetName"])'); // B通知先フォームを選ぶメソッド
    await form.locator('input[name="targetName"]').fill("F12越境変更"); // 変更欄の選択・入力メソッド
    await form.locator('input[name="targetRoles"][value="MEMBER"]').check(); // 必須通知対象の選択・操作メソッド
    const before = await lineState(scenario); // Bの拒否前比較値を取得する関数
    await replayAs(scenario.foreignAdmin, scenario.admin, // B正規ActionをB MEMBER Cookieで再送する関数
      /**
       * BのtargetIdにbindした正規更新Actionを送信する。
       */
      async () => { // 正規保存のコールバック
        await form.getByRole("button", { // roleと名前で正規要素を選ぶメソッド
          name: "設定を保存する",
          exact: true
        }).click(); // 保存ボタン選択・操作メソッド
      },
    );
    expect(await lineState(scenario) === before).toBe(true); // B非更新を検証する比較値取得関数・期待値・比較メソッド
  },
);

/**
 * Platform権限からクラブのOWNER権限を推定しない。
 */
test("クラブ所属のないPlatformAdminにもLINE管理画面を許可しない", // E2Eケース登録関数
  /**
   * 独立した実ログイン後にクラブ画面の404とDB非更新を確認する。
   */
  async ({ operations: scenario }) => { // 所有ケースのコールバック
    test.setTimeout(60000); // 【追加】複数の実ActionとRSC反映を含むケースの期限を設定するメソッド
    const page: Page = await scenario.platform(); // 実Platformログイン関数・画面型
    const before = await lineState(scenario); // 管理権限拒否前の比較値取得関数
    await contentDenied(page, settingsPath(scenario, "a")); // 404・noindexの検証関数・所有URL生成関数
    expect(await lineState(scenario) === before).toBe(true); // 一般管理権限が追加されないことを検証する関数・期待値・比較メソッド
  },
);
