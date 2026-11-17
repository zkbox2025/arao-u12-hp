// e2e/authorization.spec.ts
// 正規のpasswordログインと既存Cookieで、クラブ・ロール・プラン・Platformの境界を確認する。

import {
  test, // 所有seedの準備・非更新検査・復元を行うPlaywright test
  expect, // 同じPlaywrightの期待値検証API
} from "./fixtures";

const A_ROLES = [
  ["aOwner", true, true],
  ["aCoach", true, false],
  ["aOfficer", true, false],
  ["aMember", false, false],
] as const; // 本人キー・管理権限・OWNER権限のリテラル型アサーション
const INACTIVE = ["INVITED", "SUSPENDED", "WITHDRAWN"] as const; // ACTIVE以外の所属状態のリテラル型アサーション
const PLANS = ["STARTER", "STANDARD", "PRO"] as const; // アプリ利用可否を確認するプランのリテラル型アサーション

test("未ログインの直接アクセスはクラブ用・Platform用の正規入口へ戻る", // E2Eケースを登録する関数
  /**
   * 空のbrowser contextから各保護URLへ要求し、HTTP redirectと最終URLを確認する。
   */
  async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
    const routes = [
      [authorization.path("a"), "/club-login"], // 所有クラブの会員パスを作る関数
      [authorization.path("a", "admin/events"), "/club-login"], // 所有クラブの管理パスを作る関数
      [authorization.path("a", "admin/members"), "/club-login"], // 所有クラブのOWNERパスを作る関数
      ["/platform/support", "/platform-login"],
    ];
    for (const [path, destination] of routes) {
      const response = await page.goto(path); // 未認証の保護URLを開くメソッド
      expect(response?.status()).toBe(200); // 期待値生成関数 / 最終HTTP状態取得メソッド / 正常応答の検証メソッド
      expect(new URL(page.url()).pathname).toBe(destination); // 期待値生成関数 / URL解析コンストラクター / 現在URL取得メソッド / 入口の照合メソッド
      const redirected = response?.request().redirectedFrom(); // 最終要求を返すメソッド / redirect前の要求を返すメソッド
      expect(redirected !== null && // 期待値生成関数 / redirect存在の検証メソッド
        redirected !== undefined).toBe(true); // 期待値生成関数 / redirect存在の検証メソッド
      const initial = await redirected?.response(); // redirect元のHTTP応答を返すメソッド
      expect([303, 307, 308].includes(initial?.status() ?? 0)).toBe(true); // 期待値生成関数 / redirect状態の照合メソッド / HTTP状態取得メソッド / 真偽値の検証メソッド
    }
  },
);

for (const [user, administrator, owner] of A_ROLES) {
  test(`${user}はAの会員画面とロールに対応する正常導線だけを利用できる`, // ロール別E2Eケースを登録する関数
    /**
     * 実フォームからログインし、管理リンク・管理URL・OWNER URLを別々に検証する。
     */
    async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
      const member = authorization.path("a"); // Aの会員パスを作る関数
      await authorization.login(user, user === "aOwner" ? "/club/select" : member); // 本人の実passwordでログインする関数
      if (user === "aOwner") {
        await expect(page.getByRole("heading", { // 期待値生成関数 / 選択画面の見出しを選ぶメソッド / 表示検証メソッド
          name: "クラブを選択",
          exact: true
        })).toBeVisible(); // 期待値生成関数 / 選択画面の見出しを選ぶメソッド / 表示検証メソッド
        await page.locator(`a[href="${member}"]`).click(); // Aの正規リンクを選ぶメソッド / リンクを操作するメソッド
      }
      await expect(page.getByRole("heading", { // 期待値生成関数 / 会員見出しを選ぶメソッド / 表示検証メソッド
        name: "月別イベント",
        exact: true
      })).toBeVisible(); // 期待値生成関数 / 会員見出しを選ぶメソッド / 表示検証メソッド
      if (administrator) {
        await page.getByRole("link", { // 正常な管理リンクを選ぶメソッド / リンクを操作するメソッド
          name: "イベント管理",
          exact: true
        }).click(); // 正常な管理リンクを選ぶメソッド / リンクを操作するメソッド
        await expect(page.getByRole("heading", { // 期待値生成関数 / 管理見出しを選ぶメソッド / 表示検証メソッド
          name: "月別イベント管理",
          exact: true
        })).toBeVisible(); // 期待値生成関数 / 管理見出しを選ぶメソッド / 表示検証メソッド
        expect(new URL(page.url()).pathname).toBe(authorization.path("a", "admin/events")); // 期待値生成関数 / URL解析コンストラクター / 現在URL取得メソッド / パス照合メソッド / 所有管理パス生成関数
      } else {
        await expect(page.getByRole("link", { // 期待値生成関数 / 管理リンクを選ぶメソッド / リンク非表示の検証メソッド
          name: "イベント管理",
          exact: true
        })).toHaveCount(0); // 期待値生成関数 / 管理リンクを選ぶメソッド / リンク非表示の検証メソッド
      }
      const admin = authorization.path("a", "admin/events"); // Aの管理パスを作る関数
      if (administrator) {
        expect((await page.goto(admin))?.status()).toBe(200); // 期待値生成関数 / 管理URLを直接開くメソッド / HTTP状態取得メソッド / 正常応答の検証メソッド
      } else {
        await authorization.deny(admin); // MEMBERによる管理URLの拒否を確認する関数
      }
      const members = authorization.path("a", "admin/members"); // AのOWNERパスを作る関数
      if (owner) {
        expect((await page.goto(members))?.status()).toBe(200); // 期待値生成関数 / OWNER URLを開くメソッド / HTTP状態取得メソッド / 正常応答の検証メソッド
        await expect(page.getByRole("heading", { // 期待値生成関数 / OWNER見出しを選ぶメソッド / 表示検証メソッド
          name: "メンバー管理",
          exact: true
        })).toBeVisible(); // 期待値生成関数 / OWNER見出しを選ぶメソッド / 表示検証メソッド
      } else {
        await authorization.deny(members); // OWNER以外の直接アクセス拒否を確認する関数
      }
    },
  );
}

for (const owner of [true, false]) {
  test(owner ? "B OWNERはBの正規管理画面を利用できる" : "A OWNER兼B MEMBERはBへAのOWNER権限を持ち込めない", // Bのロール別E2Eケースを登録する関数
    /**
     * B OWNERとA OWNER兼B MEMBERを分け、Bの公開対象と管理権限を確認する。
     */
    async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
      const member = authorization.path("b"); // Bの会員パスを作る関数
      await authorization.login(owner ? "bOwner" : "aOwner", owner ? member : "/club/select"); // Bでの役割が異なる本人を実ログインさせる関数
      if (!owner) {
        await expect(page.getByRole("heading", { // 期待値生成関数 / 複数所属の見出しを選ぶメソッド / 表示検証メソッド
          name: "クラブを選択",
          exact: true
        })).toBeVisible(); // 期待値生成関数 / 複数所属の見出しを選ぶメソッド / 表示検証メソッド
        await expect(page.locator(`a[href="${authorization.path("a")}"]`)).toBeVisible(); // 期待値生成関数 / Aの正規リンクを選ぶメソッド / 所有パス生成関数 / 表示検証メソッド
        await page.locator(`a[href="${member}"]`).click(); // Bの正規リンクを選ぶメソッド / リンクを操作するメソッド
        await expect(page.getByRole("heading", { // 期待値生成関数 / B会員画面の見出しを選ぶメソッド
          name: "月別イベント",
          exact: true,
        })).toBeVisible(); // 会員画面への正常な遷移を確認するメソッド
        expect(new URL(page.url()).pathname).toBe(member); // 期待値生成関数 / URL解析コンストラクター / 現在URL取得メソッド / Bへの遷移を確認するメソッド
      }
      expect((await page.goto(authorization.path("b", "events/list") + "?date=2026-06-10"))?.status()).toBe(200); // 期待値生成関数 / B会員一覧を開くメソッド / 所有パス生成関数 / HTTP状態取得メソッド / 正常応答の検証メソッド
      await expect(page.getByText(authorization.publicTitle, { // 期待値生成関数 / MEMBER公開題名を選ぶメソッド / 表示検証メソッド
        exact: true
      })).toBeVisible(); // 期待値生成関数 / MEMBER公開題名を選ぶメソッド / 表示検証メソッド
      await expect(page.getByText(authorization.draftTitle, { // 期待値生成関数 / 下書き題名を選ぶメソッド / 非表示の検証メソッド
        exact: true
      })).toHaveCount(0); // 期待値生成関数 / 下書き題名を選ぶメソッド / 非表示の検証メソッド
      if (owner) {
        await expect(page.getByText(authorization.staffTitle, { // 期待値生成関数 / OWNERが読めるCOACH公開題名を選ぶメソッド / 表示検証メソッド
          exact: true
        })).toBeVisible(); // 期待値生成関数 / OWNERが読めるCOACH公開題名を選ぶメソッド / 表示検証メソッド
        expect((await page.goto(authorization.path("b", "admin/events")))?.status()).toBe(200); // 期待値生成関数 / B管理画面を開くメソッド / 所有パス生成関数 / HTTP状態取得メソッド / 正常応答の検証メソッド
        expect((await page.goto(authorization.path("b", "admin/members")))?.status()).toBe(200); // 期待値生成関数 / B OWNER画面を開くメソッド / 所有パス生成関数 / HTTP状態取得メソッド / 正常応答の検証メソッド
      } else {
        await expect(page.getByText(authorization.staffTitle, { // 期待値生成関数 / COACH限定題名を選ぶメソッド / 非表示の検証メソッド
          exact: true
        })).toHaveCount(0); // 期待値生成関数 / COACH限定題名を選ぶメソッド / 非表示の検証メソッド
        await authorization.deny(authorization.path("b", "admin/events")); // B管理画面の拒否検証関数 / 所有パス生成関数
        await authorization.deny(authorization.path("b", "admin/members")); // B OWNER画面の拒否検証関数 / 所有パス生成関数
      }
    },
  );
}

for (const status of INACTIVE) {
  test(`${status}の本人も認証できるが、所属先へ入れない`, // 非ACTIVE状態別のE2Eケースを登録する関数
    /**
     * password認証とACTIVE所属の認可を分け、所属のない画面へ遷移することを確認する。
     */
    async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
      await authorization.configure({ // 所有する会員の状態だけを準備する関数
        memberships: {
          aMember: {
            status
          }
        }
      });
      await authorization.login("aMember", "/club/select"); // 非ACTIVEの本人を正規フォームから認証する関数
      await expect(page.getByRole("heading", { // 期待値生成関数 / 所属なしの見出しを選ぶメソッド / 表示検証メソッド
        name: "所属クラブがありません",
        exact: true
      })).toBeVisible(); // 期待値生成関数 / 所属なしの見出しを選ぶメソッド / 表示検証メソッド
      await authorization.deny(authorization.path("a")); // 会員URLの拒否検証関数 / 所有パス生成関数
      await authorization.deny(authorization.path("a", "admin/events")); // 管理URLの拒否検証関数 / 所有パス生成関数
    },
  );

  test(`既存Cookieがあっても、最新DBの${status}を確認して拒否する`, // Cookie再認可のE2Eケースを登録する関数
    /**
     * ACTIVE時に実認証し、同じpageとCookieのまま所属を失効させて直接アクセスする。
     */
    async ({ authorization }) => { // 新規pageに束縛した所有fixtureを受け取るコールバック
      await authorization.login("aCoach", authorization.path("a")); // ACTIVEの本人を実ログインさせる関数 / 所有パス生成関数
      const cookie = await authorization.cookieFingerprint(); // Cookie原文を出さず比較値を取得する関数
      await authorization.configure({ // 当該本人の最新DB状態を変更する関数
        memberships: {
          aCoach: {
            status
          }
        }
      });
      await authorization.deny(authorization.path("a", "admin/events")); // 既存Cookieによる管理URLの拒否検証関数 / 所有パス生成関数
      await authorization.deny(authorization.path("a")); // 既存Cookieによる会員URLの拒否検証関数 / 所有パス生成関数
      expect(await authorization.cookieFingerprint()).toBe(cookie); // 期待値生成関数 / 同じCookieの比較値を取得する関数 / Cookie維持の検証メソッド
    },
  );
}

test("OFFICERからMEMBERへ変更した既存Cookieは会員画面だけを利用できる", // ロール再認可のE2Eケースを登録する関数
  /**
   * 管理者でログインしたCookieを作り直さず、最新のMEMBER権限へ降格することを確認する。
   */
  async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
    await authorization.login("aOfficer", authorization.path("a")); // 実passwordで管理者本人を認証する関数 / 所有パス生成関数
    expect((await page.goto(authorization.path("a", "admin/events")))?.status()).toBe(200); // 期待値生成関数 / 変更前の管理URLを開くメソッド / 所有パス生成関数 / HTTP状態取得メソッド / 正常応答の検証メソッド
    const cookie = await authorization.cookieFingerprint(); // Cookieの比較値を取得する関数
    await authorization.configure({ // 所有本人の最新ロールだけを変更する関数
      memberships: {
        aOfficer: {
          role: "MEMBER"
        }
      }
    });
    expect((await page.goto(authorization.path("a")))?.status()).toBe(200); // 期待値生成関数 / 会員URLを開くメソッド / 所有パス生成関数 / HTTP状態取得メソッド / 正常応答の検証メソッド
    await expect(page.getByRole("link", { // 期待値生成関数 / 管理リンクを選ぶメソッド / 非表示の検証メソッド
      name: "イベント管理",
      exact: true
    })).toHaveCount(0); // 期待値生成関数 / 管理リンクを選ぶメソッド / 非表示の検証メソッド
    await authorization.deny(authorization.path("a", "admin/events")); // 降格後の管理URL拒否検証関数 / 所有パス生成関数
    await authorization.deny(authorization.path("a", "admin/members")); // OWNER URLの拒否検証関数 / 所有パス生成関数
    expect(await authorization.cookieFingerprint()).toBe(cookie); // 期待値生成関数 / 既存Cookieの比較値取得関数 / Cookie維持の検証メソッド
  },
);

for (const planType of PLANS) {
  test(`${planType}のアプリ利用可否をログイン後の遷移と直接URLで確認する`, // プラン別E2Eケースを登録する関数
    /**
     * 認証可能でもSTARTER・PROではアプリを使えず、STANDARDだけが利用できることを確認する。
     */
    async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
      await authorization.configure({ // 所有クラブのプランを準備する関数
        plans: {
          a: planType
        }
      });
      const member = authorization.path("a"); // Aの会員パスを作る関数
      await authorization.login("aMember", planType === "STANDARD" ? member : "/club/select"); // 実認証後の期待遷移先を指定する関数
      if (planType === "STANDARD") {
        expect((await page.goto(member))?.status()).toBe(200); // 期待値生成関数 / 会員URLを直接開くメソッド / HTTP状態取得メソッド / 正常応答の検証メソッド
      } else {
        await expect(page.getByRole("heading", { // 期待値生成関数 / プラン拒否の見出しを選ぶメソッド / 表示検証メソッド
          name: "アプリを利用できるクラブがありません",
          exact: true
        })).toBeVisible(); // 期待値生成関数 / プラン拒否の見出しを選ぶメソッド / 表示検証メソッド
        await authorization.deny(member); // プランによる直接URLの拒否を検証する関数
        await authorization.deny(authorization.path("a", "admin/events")); // 管理URLの拒否検証関数 / 所有パス生成関数
      }
    },
  );
}

for (const planType of ["STARTER", "PRO"] as const) { // 利用不可プランのリテラル型アサーション
  test(`既存Cookieがあっても、STANDARDから${planType}への変更を反映する`, // 最新プランのE2Eケースを登録する関数
    /**
     * Cookieや認証状態を入れ替えず、プランの最新DB値による拒否を確認する。
     */
    async ({ authorization }) => { // 当該pageに束縛した所有fixtureを受け取るコールバック
      await authorization.login("aMember", authorization.path("a")); // 実passwordで認証する関数 / 所有パス生成関数
      const cookie = await authorization.cookieFingerprint(); // Cookieの比較値を取得する関数
      await authorization.configure({ // 所有クラブの最新プランを変更する関数
        plans: {
          a: planType
        }
      });
      await authorization.deny(authorization.path("a")); // プラン失効後の拒否検証関数 / 所有パス生成関数
      expect(await authorization.cookieFingerprint()).toBe(cookie); // 期待値生成関数 / 同じCookieの比較値を取得する関数 / Cookie維持の検証メソッド
    },
  );
}

test("複数所属でも利用できるクラブが一件なら、そのクラブへ移動する", // 所属分岐のE2Eケースを登録する関数
  /**
   * BをSTARTERにして、実ログインと選択画面の双方からAへ移動することを確認する。
   */
  async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
    await authorization.configure({ // Bだけをアプリ対象外へ準備する関数
      plans: {
        b: "STARTER"
      }
    });
    await authorization.login("aOwner", authorization.path("a")); // 利用可能な一件へ実ログインする関数 / 所有パス生成関数
    expect((await page.goto("/club/select"))?.status()).toBe(200); // 期待値生成関数 / 選択画面を開くメソッド / 最終HTTP状態取得メソッド / 正常応答の検証メソッド
    expect(new URL(page.url()).pathname).toBe(authorization.path("a")); // 期待値生成関数 / URL解析コンストラクター / 現在URL取得メソッド / 一件への遷移検証メソッド / 所有パス生成関数
    await authorization.deny(authorization.path("b")); // 利用不可のBへの拒否検証関数 / 所有パス生成関数
  },
);

test("複数所属でも利用できるクラブが零件なら、利用不可の選択画面を表示する", // 所属分岐のE2Eケースを登録する関数
  /**
   * ACTIVE所属があっても、利用可能プランがなければアプリへ移動しないことを確認する。
   */
  async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
    await authorization.configure({ // 二クラブの利用不可プランを準備する関数
      plans: {
        a: "STARTER",
        b: "PRO"
      }
    });
    await authorization.login("aOwner", "/club/select"); // ACTIVE所属のある本人を実認証する関数
    await expect(page.getByRole("heading", { // 期待値生成関数 / 利用不可の見出しを選ぶメソッド / 表示検証メソッド
      name: "アプリを利用できるクラブがありません",
      exact: true
    })).toBeVisible(); // 期待値生成関数 / 利用不可の見出しを選ぶメソッド / 表示検証メソッド
    await authorization.deny(authorization.path("a")); // Aの直接URLの拒否検証関数 / 所有パス生成関数
    await authorization.deny(authorization.path("b")); // Bの直接URLの拒否検証関数 / 所有パス生成関数
  },
);

test("Aの一般会員は、実在する別クラブと未知slugへ入れない", // 所属境界のE2Eケースを登録する関数
  /**
   * 一般会員がAだけに所属することを、実在するBと未知slugへの直接アクセスで確認する。
   */
  async ({ authorization }) => { // 当該pageに束縛した所有fixtureを受け取るコールバック
    await authorization.login("aMember", authorization.path("a")); // Aだけの本人を実認証する関数 / 所有パス生成関数
    await authorization.deny(authorization.path("b")); // 実在する別クラブの拒否検証関数 / 所有パス生成関数
    await authorization.deny(authorization.missingPath); // 存在しないslugの拒否を確認する関数
  },
);

for (const role of ["DEVELOPER", "SUPPORT"] as const) { // 有効なPlatformロールのリテラル型アサーション
  test(`クラブ所属のない${role}がPlatformの正規入口から両クラブの報告を読める`, // 独立PlatformのE2Eケースを登録する関数
    /**
     * クラブのAppUser・Membershipを持たない運営者が、意図した複数クラブ閲覧だけを行う。
     */
    async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
      await authorization.configure({ // 所有PlatformAdminのロールを準備する関数
        platform: {
          role
        }
      });
      await authorization.login("platformAdmin", "/platform/support", "platform"); // Platformの正規フォームから実認証する関数
      for (const club of ["a", "b"] as const) { // 所有クラブキーのリテラル型アサーション
        expect((await page.goto(authorization.supportPath(club)))?.status()).toBe(200); // 期待値生成関数 / 対象クラブの報告を開くメソッド / 所有Platformパス生成関数 / HTTP状態取得メソッド / 正常応答の検証メソッド
        await page.getByText("本文・内部メモ・環境情報", { // 【追加】折り畳まれた報告の詳細を選ぶメソッド
          exact: true,
        }).click(); // 【追加】報告本文を表示する正規操作のメソッド
        await expect(page.getByText(authorization.reportMessages[club], { // 期待値生成関数 / 対象クラブの報告本文を選ぶメソッド / 表示検証メソッド
          exact: true
        })).toBeVisible(); // 期待値生成関数 / 対象クラブの報告本文を選ぶメソッド / 表示検証メソッド
        const other = club === "a" ? "b" : "a";
        await expect(page.getByText(authorization.reportMessages[other], { // 期待値生成関数 / 対象外クラブの報告本文を選ぶメソッド / フィルターの検証メソッド
          exact: true
        })).toHaveCount(0); // 期待値生成関数 / 対象外クラブの報告本文を選ぶメソッド / フィルターの検証メソッド
      }
      await authorization.deny(authorization.path("a")); // Platform権限だけではクラブ会員にならないことの拒否検証関数 / 所有パス生成関数
      await authorization.deny(authorization.path("b", "admin/members")); // Platform権限だけではクラブOWNERにならないことの拒否検証関数 / 所有パス生成関数
    },
  );
}

test("有効なPlatform Cookieでも、最新DBで無効になれば管理URLへ入れない", // Platform再認可のE2Eケースを登録する関数
  /**
   * 正規入口で取得したCookieを維持し、PlatformAdminのisActiveだけを失効させる。
   */
  async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
    await authorization.login("platformAdmin", "/platform/support", "platform"); // 正規のPlatformフォームで実認証する関数
    const cookie = await authorization.cookieFingerprint(); // 既存Cookieの比較値を取得する関数
    await authorization.configure({ // 所有するPlatformAdminだけを無効化する関数
      platform: {
        isActive: false
      }
    });
    await authorization.deny("/platform/support"); // 最新DBによるPlatform拒否を確認する関数
    expect((await page.goto("/platform-login"))?.status()).toBe(200); // 期待値生成関数 / Platform入口を開くメソッド / HTTP状態取得メソッド / 正常応答の検証メソッド
    await expect(page.getByRole("heading", { // 期待値生成関数 / Platform入口の見出しを選ぶメソッド / 表示検証メソッド
      name: "Platformログイン",
      exact: true
    })).toBeVisible(); // 期待値生成関数 / Platform入口の見出しを選ぶメソッド / 表示検証メソッド
    expect(await authorization.cookieFingerprint()).toBe(cookie); // 期待値生成関数 / 同じCookieの比較値を取得する関数 / Cookie維持の検証メソッド
  },
);

test("一般OWNERの既存CookieはPlatform権限を持たない", // クラブ権限とPlatformの分離を確認するE2Eケースを登録する関数
  /**
   * 一般OWNERの既存セッションを維持したまま、Platform管理URLを拒否する。
   */
  async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
    await authorization.login("aOwner", "/club/select"); // 一般OWNERを実認証する関数
    const cookie = await authorization.cookieFingerprint(); // 既存Cookieの比較値を取得する関数
    await authorization.deny("/platform/support"); // クラブOWNERのPlatform越権を拒否する関数
    expect((await page.goto("/platform-login"))?.status()).toBe(200); // 期待値生成関数 / Platform入口を開くメソッド / HTTP状態取得メソッド / 正常応答の検証メソッド
    await expect(page.getByRole("heading", { // 期待値生成関数 / Platform入口の見出しを選ぶメソッド / 表示検証メソッド
      name: "Platformログイン",
      exact: true
    })).toBeVisible(); // 期待値生成関数 / Platform入口の見出しを選ぶメソッド / 表示検証メソッド
    expect(await authorization.cookieFingerprint()).toBe(cookie); // 期待値生成関数 / 同じCookieの比較値を取得する関数 / Cookie維持の検証メソッド
  },
);

test("クラブ所属のない独立運営者はクラブ用ログイン後も所属なし画面に留まる", // 零所属のE2Eケースを登録する関数
  /**
   * Auth本人の存在だけでクラブ所属やAppUserを自動作成しないことを確認する。
   */
  async ({ page, authorization }) => { // 新規pageと所有fixtureを受け取るコールバック
    await authorization.login("platformAdmin", "/club/select"); // クラブ用フォームで独立運営者を実認証する関数
    await expect(page.getByRole("heading", { // 期待値生成関数 / 零所属の見出しを選ぶメソッド / 表示検証メソッド
      name: "所属クラブがありません",
      exact: true
    })).toBeVisible(); // 期待値生成関数 / 零所属の見出しを選ぶメソッド / 表示検証メソッド
    await authorization.deny(authorization.path("a")); // 会員権限のないAへの拒否検証関数 / 所有パス生成関数
    await authorization.deny(authorization.missingPath); // 未知slugの拒否を確認する関数
  },
);
