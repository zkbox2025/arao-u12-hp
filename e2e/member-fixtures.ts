// e2e/member-fixtures.ts
// 実Cookieと所有するクラブだけを使い、招待・子ども操作の変更をケース後に回収する。

import {
  createHash // 試験用IPのhashを生成する関数
} from "node:crypto";
import {
  test as base, // fixture定義の基底となるPlaywright API
  expect // 期待値を生成する関数
} from "@playwright/test";
import type {
  BrowserContext, // 実Cookieを保持するbrowser context型
  Page, // 実画面の操作型
  Locator // 画面の要素を選ぶ操作型
} from "@playwright/test";
import type {
  PrismaClient // ガード後の専用DB client型
} from "@prisma/client";
import {
  requireMvpTestEnvironment // SDK初期化前に専用環境を検証する関数
} from "../tests/mvp/environment";
import {
  parseContentFixture // 制御payloadのrun・本人・所属を照合する関数
} from "../tests/mvp/content-fixture";
import type {
  ContentFixturePayload // 所有する制御payloadの契約型
} from "../tests/mvp/content-fixture";
import {
  invitationRecipientEmail, // 所有scopeに予約した招待先メールを返す関数
  readInvitationLink // 宛先・origin・slugが一致する招待URLだけを返す関数
} from "../tests/mvp/member-fixture";
import type {
  MvpE2eSession // runnerの同一実行・接続契約型
} from "../tests/mvp/outbound-stub.mjs";

/**
 * 招待・アカウント画面で使う本人キー。
 */
type MemberUser = "aOwner" | "aMember" | "bOwner"; // 認証済みの本人キー型
/**
 * worker内だけに保持するDB接続・実Cookie・所有ID。
 */
type MemberWorker = { // worker内のDB・実Cookie・所有ID型
  database: PrismaClient; // ガード後の専用DB client型
  data: ContentFixturePayload["database"]; // 所有する制御payloadの契約型
  session: Readonly<MvpE2eSession>; // 読取専用にする型 / runnerの同一実行・接続契約型
  cookies: Record<MemberUser, Awaited<ReturnType<BrowserContext["cookies"]>>>; // キーと値を対応付ける辞書型 / 認証済みの本人キー型 / 非同期結果の解決値を得る型 / 関数の戻り値を取得する型 / 実Cookieを保持するbrowser context型
};
/**
 * ケースごとの実Cookie画面とローカルstub制御をまとめる。
 */
export type MemberScenario = MemberWorker & { // ケース内の独立画面と所有DBの契約型 / worker内のDB・実Cookie・所有ID型
  admin: Page; // 実画面の操作型
  member: Page; // 実画面の操作型
  foreignAdmin: Page; // 実画面の操作型
  recipient: Page; // 実画面の操作型
};

/**
 * 同じrunのprivate制御口だけへ要求し、応答はメモリ内に留める。
 */
export async function memberControl(scenario: Pick<MemberWorker, "session">, // 同じ実行のprivate stubへ期限付きで要求する関数 / 必要な項目だけを選ぶ型 / worker内のDB・実Cookie・所有ID型
  action: "read" | "reset"): Promise<unknown> { // 非同期の完了を表す型 / 未確定値の型
  try {
    const { session } = scenario;
    const response = await fetch(session.stubOrigin + "/control", { // 所有する接続先へ要求する関数
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mvp-secret": session.secret,
      },
      body: JSON.stringify({ // 値をJSON文字列へ変換するメソッド
        action,
        runId: session.runId
      }),
      signal: AbortSignal.timeout(5000), // 通信の期限signalを生成するメソッド
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error("F12_MEMBER_CONTROL_FAILED"); // 秘密を含めない固定例外のコンストラクター
    }
    return await response.json(); // 応答のJSONをメモリへ取得するメソッド
  } catch {
    throw new Error("F12_MEMBER_CONTROL_FAILED"); // 秘密を含めない固定例外のコンストラクター
  }
}

/**
 * 正規メールの宛先・ローカル接続先と一致する最新の招待リンクだけを返す。
 */
export async function invitationLink(scenario: MemberScenario, // 所有stubから一致する最新の招待URLを取得する関数 / ケース内の独立画面と所有DBの契約型
  email: string, // 文字列型
  club: "a" | "b",
  kind: "new" | "existing"): Promise<string> { // 非同期の完了を表す型 / 文字列型
  return readInvitationLink(await memberControl(scenario, "read"), email, // 宛先・origin・slugが一致する招待URLだけを返す関数 / 同じ実行のprivate stubへ期限付きで要求する関数
    scenario.session.appOrigin, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    scenario.data.clubs[club].slug, kind);
}

/**
 * 所有クラブの招待フォームを実送信し、PENDINGのDB行と画面遷移を照合する。
 */
export async function invite(scenario: MemberScenario, // OWNERの実フォームから招待を送信しDB状態を検証する関数 / ケース内の独立画面と所有DBの契約型
  page: Page, // 実画面の操作型
  club: "a" | "b",
  email: string): Promise<void> { // 文字列型 / 非同期の完了を表す型 / 戻り値を利用しない型
  const { data, database } = scenario;
  await page.goto(`/club/${data.clubs[club].slug}/admin/members`); // 実画面へナビゲーションするメソッド
  const form = page.locator("form").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
    has: page.locator('input[name="email"]') // フォーム・hidden値などの要素を選ぶメソッド
  });
  await form.locator('input[name="email"]').fill(email); // 架空の入力値を設定するメソッド / フォーム・hidden値などの要素を選ぶメソッド
  await form.locator('input[name="name"]').fill("F12招待先"); // 架空の入力値を設定するメソッド / フォーム・hidden値などの要素を選ぶメソッド
  await form.locator('select[name="role"]').selectOption("MEMBER"); // フォームの選択値を変更するメソッド / フォーム・hidden値などの要素を選ぶメソッド
  await form.getByRole("button", { // roleと表示名で要素を選ぶメソッド
    name: "招待メールを送信する",
    exact: true
  }).click(); // 正規のボタンを操作するメソッド
  await expect.poll( // 非同期の検証結果を待つメソッド
    /**
     * OWNER操作で対象クラブへ保存された招待の受付成功を待つ。
     */
    () => database.clubInvitation.count({ // 所有する入力を受け取り操作・照合するコールバック / 所有条件に合うDB行数を取得するメソッド
      where: {
        clubId: data.clubs[club].id,
        email,
        status: "SENT"
      },
    }),
  ).toBe(1); // 値の一致を検証するメソッド
  await expect(page.getByText("招待メールを送信しました。", { // 期待値を生成する関数 / 固定の表示文で要素を選ぶメソッド
    exact: true
  })).toBeVisible(); // 画面表示を検証するメソッド
}

/**
 * 確認付きアカウントフォームを操作し、正規の保存と確認ダイアログ終了を待つ。
 */
export async function confirmAccount(page: Page, // 確認付きフォームから保存してダイアログ終了を待つ関数 / 実画面の操作型
  form: Locator): Promise<void> { // 画面の要素を選ぶ操作型 / 非同期の完了を表す型 / 戻り値を利用しない型
  await form.getByRole("button", { // roleと表示名で要素を選ぶメソッド
    name: "確認して保存",
    exact: true
  }).click(); // 正規のボタンを操作するメソッド
  await page.getByRole("dialog").getByRole("button", { // roleと表示名で要素を選ぶメソッド
    name: "保存する",
    exact: true
  }).click(); // 正規のボタンを操作するメソッド
  await expect(page.getByRole("dialog")).toHaveCount(0); // DOM要素数を検証するメソッド / 期待値を生成する関数 / roleと表示名で要素を選ぶメソッド
}

/**
 * 正規の暗号化済みActionを別の実Cookieで送信し直し、元の要求を実行しない。
 * 本文・Cookie・応答・URLはメモリ内だけで扱う。
 */
export async function replayAs(page: Page, // 正規Actionを別本人の実Cookieで再送する関数 / 実画面の操作型
  actor: Page, // 実画面の操作型
  submit: () => Promise<void>): Promise<void> { // 受け取った処理を表す関数型 / 非同期の完了を表す型 / 戻り値を利用しない型
  const path = new URL(page.url()).pathname; // URLをメモリ内で解析するコンストラクター / 要求・画面のURLをメモリ内で取得するメソッド
  let completed = false;
  await page.route("**" + path, // 正規Actionの通信を試験用に捕捉するメソッド
    /**
     * ActionのPOSTだけを別本人へ持ち替え、元Cookieの更新を防ぐ。
     */
    async (route) => { // 所有する入力を受け取り操作・照合するコールバック
      const request = route.request(); // 捕捉したHTTP要求を取得するメソッド
      if (request.method() !== "POST") { // HTTPメソッドを取得するメソッド
        await route.continue(); // 対象外の通信を変更せず継続するメソッド
        return;
      }
      const headers = request.headers(); // HTTP headerをメモリ内だけへ取得するメソッド
      delete headers.cookie;
      delete headers["content-length"];
      const response = await actor.context().request.fetch(request.url(), { // 所有する接続先へ要求する関数 / 実Cookieを保持するcontextを取得するメソッド / 要求・画面のURLをメモリ内で取得するメソッド
        method: "POST",
        headers,
        data: request.postDataBuffer() ?? undefined, // 暗号化済みAction本文をメモリ内へ取得するメソッド
        maxRedirects: 0,
      });
      expect(response.status()).toBeLessThan(500); // HTTP状態がサーバーエラーでないことを検証するメソッド / 期待値を生成する関数 / HTTP状態を取得するメソッド
      expect(response.headers()["x-action-redirect"]?.includes("toast=") ?? false).toBe(false); // 値の一致を検証するメソッド / 期待値を生成する関数 / 対象の値を含むか検証するメソッド / HTTP headerをメモリ内だけへ取得するメソッド
      completed = true;
      await route.fulfill({ // 再送した応答で元の通信を完了するメソッド
        response
      });
    },
  );
  try {
    await submit(); // 受け取った正規フォームの送信を実行する関数
    await expect.poll( // 非同期の検証結果を待つメソッド
      /**
       * POSTの再送が実際に行われたことを確認する。
       */
      () => completed, // 所有する入力を受け取り操作・照合するコールバック
    ).toBe(true); // 値の一致を検証するメソッド
  } finally {
    await page.unroute("**" + path); // 試験用の通信捕捉を解除するメソッド
  }
}

/**
 * 接続前ガードと実在照合の後だけ、実ログインのCookieをworker内へ保持する。
 */
export const test = base.extend<{ members: MemberScenario }, { memberWorker: MemberWorker }>({ // 所有fixtureをPlaywrightへ登録するメソッド / ケース内の独立画面と所有DBの契約型 / worker内のDB・実Cookie・所有ID型
  memberWorker: [
    /**
     * 所有する2クラブ・本人を照合し、実画面のpassword認証を一度ずつ行う。
     */
    async ({ browser }, provideFixture) => { // 所有する入力を受け取り操作・照合するコールバック
      const { readMvpE2eSession } = await import("../tests/mvp/outbound-stub.mjs"); // ガード後に必要なSDK・ESMを遅延読込する関数
      const session = readMvpE2eSession(); // runnerと同じ実行の接続契約を検証する関数
      const environment = requireMvpTestEnvironment({ // SDK初期化前に専用環境を検証する関数
        ...process.env,
        NODE_ENV: "test",
        NODE_OPTIONS: undefined,
      }, process.cwd(), session.runId); // 専用checkoutの現在パスを取得するメソッド
      if (environment.appOrigin !== session.appOrigin) {
        throw new Error("F12_MEMBER_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
      }
      const payload = parseContentFixture(await memberControl({ // 制御payloadのrun・本人・所属を照合する関数 / 同じ実行のprivate stubへ期限付きで要求する関数
        session
      }, "read"), session.runId);
      const data = payload.database;
      const { PrismaClient } = await import("@prisma/client"); // ガード後に必要なSDK・ESMを遅延読込する関数
      const { PrismaPg } = await import("@prisma/adapter-pg"); // ガード後に必要なSDK・ESMを遅延読込する関数
      const database = new PrismaClient({ // 専用DB clientのコンストラクター
        adapter: new PrismaPg({ // 専用PostgreSQL adapterのコンストラクター
          connectionString: environment.databaseUrl,
          max: 1,
          connectionTimeoutMillis: 3000,
          statement_timeout: 5000,
        }),
        log: [],
      });
      let originals: Awaited<ReturnType<typeof database.club.findMany>> = []; // 所有クラブ取得結果の配列型 / 非同期結果・戻り値・既存メソッドから型を得る指定 / 非同期結果の解決値を得る型 / 関数の戻り値を取得する型 / 既存宣言から取得する型
      try {
        originals = await database.club.findMany({ // 所有条件に合うDB行を取得するメソッド
          where: {
            id: {
              in: [data.clubs.a.id, data.clubs.b.id]
            }
          },
        });
        if (originals.length !== 2) {
          throw new Error("F12_MEMBER_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
        }
        for (const row of Object.values(data.actors)) { // 辞書の値を列挙する関数
          if (await database.clubMembership.count({ // 所有条件に合うDB行数を取得するメソッド
            where: {
              id: row.membershipId,
              clubId: row.clubId,
              userId: row.userId,
              role: row.role,
              status: row.status,
            }
          }) !== 1) {
            throw new Error("F12_MEMBER_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
          }
        }
        await database.club.updateMany({ // 所有条件に合うDB行だけを更新するメソッド
          where: {
            id: {
              in: originals.map( // 各行から照合用の値を取り出すメソッド
                /**
                 * 受け取った所有行・画面を使い、この試験の操作・照合を行う。
                 */
                (row) => row.id) // 所有する入力を受け取り操作・照合するコールバック
            }
          },
          data: {
            appBaseUrl: session.appOrigin
          },
        });
        const cookies = {} as MemberWorker["cookies"]; // 検証済みの値の型を明示する型アサーション / worker内の所有DB・実Cookie・制御の契約型 / 型を明示するアサーション / worker内のDB・実Cookie・所有ID型
        for (const user of ["aOwner", "aMember", "bOwner"] as const) { // 検証済みの値の型を明示する型アサーション / リテラル型を保持する型 / リテラル型を保持する型 / constの参照型 / 型を明示するアサーション / リテラル型を保持する指定
          const loginAddress = createHash("sha256").update(`${session.runId}-${user}`).digest(); // 実行と本人の比較値を生成する関数 / 入力値をhashへ追加するメソッド / hashをバイト列へ変換するメソッド / 試験用hashへ実行識別情報を追加するメソッド / 実行と本人に対応する試験用hashを生成する関数 / 所有行または試験用hashを更新するメソッド / 試験用IPのhashを生成する関数
          const context = await browser.newContext({ // 別の実Cookieを使う新規browser contextを作るメソッド / 独立した実Cookieのbrowser contextを作るメソッド
            baseURL: session.appOrigin,
            proxy: {
              server: session.stubOrigin,
              username: session.runId,
              password: session.secret
            },
            // 実認証の回数は増やさず、既存のIP単位のアプリ側試行制限からケースを分離する。
            extraHTTPHeaders: {
              "x-forwarded-for": `198.18.${loginAddress[0]}.${loginAddress[1]}`,
            },
            serviceWorkers: "block",
            acceptDownloads: false,
            storageState: {
              cookies: [],
              origins: []
            },
          });
          try {
            const page = await context.newPage(); // 所有context内にpageを作るメソッド / 所有context内に画面を作るメソッド
            await page.goto("/club-login"); // 新規ナビゲーションで正規画面を取得するメソッド / 実画面へナビゲーションするメソッド
            await page.getByLabel("メールアドレス", { // ラベルで入力欄を選ぶメソッド / labelに対応する入力を選ぶメソッド
              exact: true
            }).fill(payload.credentials[user].email); // テスト用の入力値を設定するメソッド / 架空の入力値を設定するメソッド
            await page.getByLabel("パスワード", { // ラベルで入力欄を選ぶメソッド / labelに対応する入力を選ぶメソッド
              exact: true
            }).fill(payload.credentials[user].password); // テスト用の入力値を設定するメソッド / 架空の入力値を設定するメソッド
            await page.getByRole("button", { // roleと名前で対象を選ぶメソッド / roleと表示名で要素を選ぶメソッド
              name: "ログイン",
              exact: true
            }).click(); // 正規のボタンを操作するメソッド
            const destination = user === "aOwner" ? "/club/select" :
              `/club/${data.clubs[user === "bOwner" ? "b" : "a"].slug}/events`;
            await page.waitForURL(session.appOrigin + destination); // 正規のログイン遷移を待つメソッド
            cookies[user] = await context.cookies(); // contextが保持する実Cookieをメモリへ取得するメソッド / 実Cookieをメモリ内へ取得するメソッド
            if (!cookies[user].some(// 対象条件に一致する要素の有無を検証するメソッド // 条件に一致する要素の有無を調べるメソッド
              /**
               * 当該の所有ID・名前・受付情報に対応する要素だけを選ぶ。
               */
              (cookie) => /^sb-.+-auth-token(?:\.\d+)?$/u.test(cookie.name))) { // 所有する入力を受け取る検証コールバック / 正規表現の書式に一致するかを検証するメソッド / 所有する入力を受け取り操作・照合するコールバック / 正規表現との一致を検証するメソッド
              throw new Error("F12_CONTENT_LOGIN_FAILED"); // 秘密を含めない固定例外のコンストラクター
            }
          } finally {
            await context.close(); // 所有browser contextを回収するメソッド
          }
        }
        await provideFixture({ // Playwrightへ所有fixtureを渡す関数
          database,
          data,
          session,
          cookies
        });
      } finally {
        try {
          for (const original of originals) {
            await database.club.update({ // 所有行または試験用hashを更新するメソッド
              where: {
                id: original.id
              },
              data: {
                appBaseUrl: original.appBaseUrl,
                updatedAt: original.updatedAt
              },
            });
          }
        } finally {
          await database.$disconnect(); // 専用DB接続を解放するメソッド
        }
      }
    },
    {
      scope: "worker"
    },
  ],
  /**
   * 実Cookieの独立contextを作り、招待・所属・子ども・氏名のケース内変更だけを回収する。
   */
  members: async ({ browser, memberWorker }, provideFixture) => { // 所有する入力を受け取り操作・照合するコールバック
    const { data, session, database } = memberWorker;
    const contexts: BrowserContext[] = []; // 実Cookieを保持するbrowser context型
    const clubIds = [data.clubs.a.id, data.clubs.b.id];
    const userIds = Object.values(data.users).map( // 各行から照合用の値を取り出すメソッド / 辞書の値を列挙する関数
      /**
       * 受け取った所有行・画面を使い、この試験の操作・照合を行う。
       */
      (user) => user.id); // 所有する入力を受け取り操作・照合するコールバック
    const originalMemberships = await database.clubMembership.findMany({ // 所有条件に合うDB行を取得するメソッド
      where: {
        clubId: {
          in: clubIds
        }
      }
    });
    const originalInvitations = await database.clubInvitation.findMany({ // 所有条件に合うDB行を取得するメソッド
      where: {
        clubId: {
          in: clubIds
        }
      },
      select: {
        id: true
      }
    });
    const originalChildren = await database.child.findMany({ // 所有条件に合うDB行を取得するメソッド
      where: {
        parentId: {
          in: userIds
        }
      },
      select: {
        id: true
      }
    });
    const originalUsers = await database.appUser.findMany({ // 所有条件に合うDB行を取得するメソッド
      where: {
        id: {
          in: userIds
        }
      }
    });
    try {
      const pages: Page[] = []; // 実画面の操作型
      for (const user of ["aOwner", "aMember", "bOwner", "recipient"] as const) { // 型を明示するアサーション / リテラル型を保持する指定
        const context = await browser.newContext({ // 独立した実Cookieのbrowser contextを作るメソッド
          baseURL: session.appOrigin,
          proxy: {
            server: session.stubOrigin,
            username: session.runId,
            password: session.secret
          },
          serviceWorkers: "block",
          acceptDownloads: false,
          storageState: {
            cookies: user === "recipient" ? [] : structuredClone(memberWorker.cookies[user]), // 実Cookieをメモリ上で複製する関数
            origins: []
          },
        });
        contexts.push(context); // 所有資源を配列へ登録するメソッド
        pages.push(await context.newPage()); // 所有資源を配列へ登録するメソッド / 所有context内に画面を作るメソッド
      }
      await memberControl(memberWorker, "reset"); // 同じ実行のprivate stubへ期限付きで要求する関数
      const [admin, member, foreignAdmin, recipient] = pages;
      await provideFixture({ // Playwrightへ所有fixtureを渡す関数
        ...memberWorker,
        admin,
        member,
        foreignAdmin,
        recipient
      });
    } catch {
      throw new Error("F12_MEMBER_CASE_FAILED"); // 秘密を含めない固定例外のコンストラクター
    } finally {
      try {
        await memberControl(memberWorker, "reset"); // 同じ実行のprivate stubへ期限付きで要求する関数
        await database.$transaction( // 関連するDB操作を一体で実行するメソッド
          /**
           * 受け取った所有行・画面を使い、この試験の操作・照合を行う。
           */
          async (transaction) => { // 所有する入力を受け取り操作・照合するコールバック
            await transaction.clubInvitation.deleteMany({ // 所有条件に合うDB行だけを回収するメソッド
              where: {
                clubId: {
                  in: clubIds
                },
                id: {
                  notIn: originalInvitations.map( // 各行から照合用の値を取り出すメソッド
                    /**
                     * 受け取った所有行・画面を使い、この試験の操作・照合を行う。
                     */
                    (row) => row.id) // 所有する入力を受け取り操作・照合するコールバック
                },
              }
            });
            await transaction.clubMembership.deleteMany({ // 所有条件に合うDB行だけを回収するメソッド
              where: {
                clubId: {
                  in: clubIds
                },
                id: {
                  notIn: originalMemberships.map( // 各行から照合用の値を取り出すメソッド
                    /**
                     * 受け取った所有行・画面を使い、この試験の操作・照合を行う。
                     */
                    (row) => row.id) // 所有する入力を受け取り操作・照合するコールバック
                },
              }
            });
            await transaction.child.deleteMany({ // 所有条件に合うDB行だけを回収するメソッド
              where: {
                parentId: {
                  in: userIds
                },
                id: {
                  notIn: originalChildren.map( // 各行から照合用の値を取り出すメソッド
                    /**
                     * 受け取った所有行・画面を使い、この試験の操作・照合を行う。
                     */
                    (row) => row.id) // 所有する入力を受け取り操作・照合するコールバック
                },
              }
            });
            for (const row of originalMemberships) {
              await transaction.clubMembership.update({ // 所有行または試験用hashを更新するメソッド
                where: {
                  id: row.id,
                  clubId: row.clubId
                },
                data: {
                  role: row.role,
                  status: row.status,
                  updatedAt: row.updatedAt,
                }
              });
            }
            for (const row of originalUsers) {
              await transaction.appUser.update({ // 所有行または試験用hashを更新するメソッド
                where: {
                  id: row.id
                },
                data: {
                  name: row.name,
                  updatedAt: row.updatedAt
                }
              });
            }
          });
      } catch {
        throw new Error("F12_MEMBER_CLEANUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
      } finally {
        for (const context of contexts) {
          await context.close(); // 所有browser contextを回収するメソッド
        }
      }
    }
  },
});

/**
 * 同じPlaywrightの期待値検証と、予約済み招待先の生成関数を公開する。
 */
export { expect, invitationRecipientEmail }; // 期待値を生成する関数 / 所有scopeに予約した招待先メールを返す関数
