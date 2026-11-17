// e2e/content-fixtures.ts
// 実ログインのCookieをメモリ内だけで複製し、content操作を独立contextで確認する。

import {
  CLUB_ATTACHMENT_BUCKET, // 【追加】クラブ添付PDFを保存するprivate bucketの名前
} from "../src/infrastructure/storage/club-attachment-storage-constants";
import {
  createHash, // 実行と本人に対応する試験IPを導く関数 / 実行と本人に対応する試験用hashを生成する関数
  randomUUID // テスト資源を識別するUUIDを生成する関数
} from "node:crypto";
import {
  test as base,
  expect // 期待値を生成する関数
} from "@playwright/test";
import type {
  BrowserContext, // 実Cookieを独立して保持するbrowser context型
  Page // 実画面を操作するpage型
} from "@playwright/test";
import type {
  PrismaClient // ガード後の専用DB client型
} from "@prisma/client";
import {
  requireMvpTestEnvironment // F12専用の接続前ガード関数
} from "../tests/mvp/environment";
import {
  parseContentFixture, // 制御payloadと実行・本人・所属の対応を検証する関数
  encryptContentFixtureToken // 同じ実行の鍵とclubIdで架空LINE tokenを暗号化する関数
} from "../tests/mvp/content-fixture";
import type {
  ContentFixturePayload // 所有する制御payloadの契約型
} from "../tests/mvp/content-fixture";
import type {
  MvpE2eSession // 同じrunのpreloaderと接続の契約型
} from "../tests/mvp/outbound-stub.mjs";

/**
 * 同じ仕様を別々の画面・Repositoryへ通すcontent種別。
 */
export type ContentKind = "events" | "notice"; // イベント・お知らせの種別型
/**
 * workerが保持する所有DB・接続契約・実Cookie。秘密をディスクへ保存しない。
 */
type ContentWorker = { // worker内の所有DB・実Cookie・制御の契約型
  database: PrismaClient; // ガード後の専用DB client型
  data: ContentFixturePayload["database"]; // 所有する制御payloadの契約型
  session: Readonly<MvpE2eSession>; // 読取専用にする型 / 同じrunのpreloaderと接続の契約型
  cookies: Record<"aOwner" | "aMember" | "bOwner", Awaited<ReturnType<BrowserContext["cookies"]>>>; // キーと値を対応付ける辞書型 / 非同期結果の解決値を得る型 / 関数の戻り値を取得する型 / 実Cookieを独立して保持するbrowser context型
  targetId: string; // 文字列型
  control: (body: Record<string, unknown>) => Promise<unknown>; // 受け取った引数から結果を返す関数型 / キーと値を対応付ける辞書型 / 文字列型 / 未確定の入力型 / 非同期の完了を表す型
};
/**
 * 一つのE2Eへ渡す所有contextと、サーバー処理結果を照合する操作。
 */
export type ContentScenario = ContentWorker & { // 独立contextでcontentを操作する契約型 / worker内の所有DB・実Cookie・制御の契約型
  admin: Page; // 実画面を操作するpage型
  member: Page; // 実画面を操作するpage型
  foreignAdmin: Page; // 実画面を操作するpage型
  title: string; // 文字列型
  path: (kind: ContentKind, suffix?: string, club?: "a" | "b", admin?: boolean) => string; // 受け取った引数から結果を返す関数型 / イベント・お知らせの種別型 / 文字列型 / 真偽値型
  prepare: (kind: ContentKind, page?: Page) => Promise<void>; // 受け取った引数から結果を返す関数型 / イベント・お知らせの種別型 / 実画面を操作するpage型 / 非同期の完了を表す型 / 戻り値を利用しない型
  save: (page?: Page) => Promise<void>; // 受け取った引数から結果を返す関数型 / 実画面を操作するpage型 / 非同期の完了を表す型 / 戻り値を利用しない型
  identify: (kind: ContentKind, title?: string) => Promise<string>; // 受け取った引数から結果を返す関数型 / イベント・お知らせの種別型 / 文字列型 / 非同期の完了を表す型
  remove: (kind: ContentKind, id: string) => Promise<void>; // 受け取った引数から結果を返す関数型 / イベント・お知らせの種別型 / 文字列型 / 非同期の完了を表す型 / 戻り値を利用しない型
};
/**
 * 所有するloopback制御要求だけを期限付きで送り、原文・secretを例外へ残さない。
 */
async function control( // 同じrunのsecretで所有stubを制御する関数
  session: Readonly<MvpE2eSession>, // 読取専用にする型 / 同じrunのpreloaderと接続の契約型
  body: Record<string, unknown>, // キーと値を対応付ける辞書型 / 文字列型 / 未確定の入力型
): Promise<unknown> { // 非同期の完了を表す型 / 未確定の入力型
  try {
    const response = await fetch(session.stubOrigin + "/control", { // 所有するloopbackへ要求する関数
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mvp-secret": session.secret,
      },
      body: JSON.stringify({ // 値をJSON文字列へ変換するメソッド
        ...body,
        runId: session.runId
      }),
      signal: AbortSignal.timeout(5000), // 通信の期限signalを生成するメソッド
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error("F12_CONTENT_CONTROL_FAILED"); // 秘密を含めない固定例外のコンストラクター
    }
    return await response.json(); // 制御応答のJSONをメモリ内へ取得するメソッド
  } catch {
    throw new Error("F12_CONTENT_CONTROL_FAILED"); // 秘密を含めない固定例外のコンストラクター
  }
}

/**
 * Nodeだけで接続前ガードと所有照合を行い、実ログイン済みCookieを各contextへ複製する。
 * 認可fixtureの業務DB非更新契約は維持し、contentの変更はこの専用fixtureへ分離する。
 */
export const test = base.extend<{ // 所有fixtureをPlaywrightへ登録するメソッド
  content: ContentScenario // 独立contextでcontentを操作する契約型
}, {
  contentWorker: ContentWorker // worker内の所有DB・実Cookie・制御の契約型
}>({
  contentWorker: [
    /**
     * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
     */
    async ({ browser }, // 所有する入力を受け取る検証コールバック
      provideFixture) => { // Playwrightへ所有fixtureを渡す関数の引数 // Playwrightへ所有fixtureを渡す関数の引数
      const { readMvpE2eSession } = await import("../tests/mvp/outbound-stub.mjs"); // 必要なSDKまたはESMをガード後に遅延読込する関数
      const session = readMvpE2eSession(); // preloaderと当該runの接続契約を検証する関数
      const environment = requireMvpTestEnvironment({ // F12専用の接続前ガード関数
        ...process.env,
        NODE_ENV: "test",
        NODE_OPTIONS: undefined,
      }, process.cwd(), session.runId); // 専用checkoutのパスを取得する関数
      if (environment.appOrigin !== session.appOrigin) {
        throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
      }
      const payload = parseContentFixture(await control(session, { // 制御payloadと実行・本人・所属の対応を検証する関数 / 同じrunのsecretで所有stubを制御する関数
        action: "read"
      }), session.runId);
      const data = payload.database;
      const { PrismaClient } = await import("@prisma/client"); // 必要なSDKまたはESMをガード後に遅延読込する関数
      const { PrismaPg } = await import("@prisma/adapter-pg"); // 必要なSDKまたはESMをガード後に遅延読込する関数
      const database = new PrismaClient({ // ガード後のDB clientのコンストラクター
        adapter: new PrismaPg({ // 専用PostgreSQL adapterのコンストラクター
          connectionString: environment.databaseUrl,
          max: 1,
          connectionTimeoutMillis: 3000,
          statement_timeout: 5000,
        }),
        log: [],
      });
      const settingId = randomUUID(); // テスト資源を識別するUUIDを生成する関数
      const targetId = randomUUID(); // テスト資源を識別するUUIDを生成する関数
      let original: Awaited<ReturnType<typeof database.club.findFirstOrThrow>> | undefined; // 非同期結果の解決値を得る型 / 関数の戻り値を取得する型 / 既存の宣言から取得する型 / 未設定を表す型
      try {
        for (const key of ["a", "b"] as const) { // 検証済みの値の型を明示する型アサーション / リテラル型を保持する型 / リテラル型を保持する型 / constの参照型
          const owned = await database.club.findFirst({ // 条件に合う所有行を一件取得するメソッド
            where: {
              id: data.clubs[key].id,
              slug: data.clubs[key].slug,
              planType: "STANDARD"
            },
          });
          if (!owned) {
            throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
          }
        }
        for (const row of Object.values(data.actors)) { // 所有辞書の値を列挙する関数
          const found = await database.clubMembership.findFirst({ // 条件に合う所有行を一件取得するメソッド
            where: {
              id: row.membershipId,
              clubId: row.clubId,
              userId: row.userId,
              role: row.role,
              status: row.status,
            },
          });
          if (!found) {
            throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
          }
        }

        original = await database.club.findFirstOrThrow({ // 所有する行を取得し不存在なら失敗するメソッド
          where: {
            id: data.clubs.a.id
          }
        });
        await database.$transaction([ // 関連するDB処理を同じtransactionで実行するメソッド
          database.club.update({ // 所有行を更新するメソッド
            where: {
              id: data.clubs.a.id
            },
            data: {
              appBaseUrl: session.appOrigin
            }
          }),
          database.clubLineSetting.create({ // 所有クラブの架空設定を作成するメソッド
            data: {
              id: settingId,
              clubId: data.clubs.a.id,
              lineChannelAccessTokenEncrypted: encryptContentFixtureToken( // 同じ実行の鍵とclubIdで架空LINE tokenを暗号化する関数
                process.env.LINE_CREDENTIAL_ENCRYPTION_KEY, data.clubs.a.id,
              ),
            },
          }),
          database.clubLineTarget.create({ // 所有クラブの架空設定を作成するメソッド
            data: {
              id: targetId,
              clubId: data.clubs.a.id,
              lineSettingId: settingId,
              targetName: "F12架空通知先",
              lineGroupId: "C" + randomUUID().replaceAll("-", ""), // 架空の識別子から区切りを除くメソッド / テスト資源を識別するUUIDを生成する関数
              targetRoles: ["OWNER", "MEMBER"],
              isEnabled: true,
            },
          }),
        ]);
        const cookies = {} as ContentWorker["cookies"]; // 検証済みの値の型を明示する型アサーション / worker内の所有DB・実Cookie・制御の契約型
        for (const user of ["aOwner", "aMember", "bOwner"] as const) { // 検証済みの値の型を明示する型アサーション / リテラル型を保持する型 / リテラル型を保持する型 / constの参照型
          const loginAddress = createHash("sha256").update(`${session.runId}-${user}`).digest(); // 実行と本人の比較値を生成する関数 / 入力値をhashへ追加するメソッド / hashをバイト列へ変換するメソッド / 試験用hashへ実行識別情報を追加するメソッド / 実行と本人に対応する試験用hashを生成する関数
          const context = await browser.newContext({ // 別の実Cookieを使う新規browser contextを作るメソッド
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
            const page = await context.newPage(); // 所有context内にpageを作るメソッド
            await page.goto("/club-login"); // 新規ナビゲーションで正規画面を取得するメソッド
            await page.getByLabel("メールアドレス", { // ラベルで入力欄を選ぶメソッド
              exact: true
            }).fill(payload.credentials[user].email); // テスト用の入力値を設定するメソッド
            await page.getByLabel("パスワード", { // ラベルで入力欄を選ぶメソッド
              exact: true
            }).fill(payload.credentials[user].password); // テスト用の入力値を設定するメソッド
            await page.getByRole("button", { // roleと名前で対象を選ぶメソッド
              name: "ログイン",
              exact: true
            }).click(); // 正規のボタンを操作するメソッド
            const destination = user === "aOwner" ? "/club/select" :
              `/club/${data.clubs[user === "bOwner" ? "b" : "a"].slug}/events`;
            await page.waitForURL(session.appOrigin + destination); // 正規のログイン遷移を待つメソッド
            cookies[user] = await context.cookies(); // contextが保持する実Cookieをメモリへ取得するメソッド
            if (!cookies[user].some(// 対象条件に一致する要素の有無を検証するメソッド
              /**
               * 当該の所有ID・名前・受付情報に対応する要素だけを選ぶ。
               */
              (cookie) => /^sb-.+-auth-token(?:\.\d+)?$/u.test(cookie.name))) { // 所有する入力を受け取る検証コールバック / 正規表現の書式に一致するかを検証するメソッド
              throw new Error("F12_CONTENT_LOGIN_FAILED"); // 秘密を含めない固定例外のコンストラクター
            }
          } finally {
            await context.close(); // 所有browser contextを回収するメソッド
          }
        }
        await provideFixture({ // Playwrightのケースへ所有fixtureを渡す関数
          database,
          data,
          session,
          cookies,
          targetId,
          /**
           * 所有する画面・DB・制御入口だけを操作する。
           */
          control: (body) => control(session, body) // 所有する入力を受け取る検証コールバック / 同じrunのsecretで所有stubを制御する関数
        });
      } finally {
        try {
          await control(session, { // 同じrunのsecretで所有stubを制御する関数
            action: "reset"
          });
          await database.$transaction([ // 関連するDB処理を同じtransactionで実行するメソッド
            database.clubLineDelivery.deleteMany({ // 所有条件に合う行だけを回収するメソッド
              where: {
                clubId: data.clubs.a.id,
                targetId
              }
            }),
            database.clubLineTarget.deleteMany({ // 所有条件に合う行だけを回収するメソッド
              where: {
                clubId: data.clubs.a.id,
                id: targetId
              }
            }),
            database.clubLineSetting.deleteMany({ // 所有条件に合う行だけを回収するメソッド
              where: {
                clubId: data.clubs.a.id,
                id: settingId
              }
            }),
          ]);
          if (original) {
            await database.club.update({ // 所有行を更新するメソッド
              where: {
                id: original.id
              },
              data: {
                appBaseUrl: original.appBaseUrl,
                updatedAt: original.updatedAt
              },
            });
          }
        } catch {
          throw new Error("F12_CONTENT_CLEANUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
        } finally {
          await database.$disconnect(); // 専用DB接続を解放するメソッド
        }
      }
    }, {
      scope: "worker"
    }],
  /**
 * 各ケースに新しい管理者・会員contextを提供し、終了時に回収する。
 */
  content: async ({ browser, contentWorker }, // 所有する入力を受け取る検証コールバック
    provideFixture) => { // Playwrightへ所有fixtureを渡す関数の引数
    const contexts: BrowserContext[] = []; // 実Cookieを独立して保持するbrowser context型
    const title = "F12-content-" + randomUUID(); // テスト資源を識別するUUIDを生成する関数
    const { session, data, database } = contentWorker;
    try {
      const pages: Page[] = []; // 実画面を操作するpage型
      for (const user of ["aOwner", "aMember", "bOwner"] as const) { // 検証済みの値の型を明示する型アサーション / リテラル型を保持する型 / リテラル型を保持する型 / constの参照型
        const context = await browser.newContext({ // 別の実Cookieを使う新規browser contextを作るメソッド
          baseURL: session.appOrigin,
          proxy: {
            server: session.stubOrigin,
            username: session.runId,
            password: session.secret
          },
          serviceWorkers: "block",
          acceptDownloads: false,
          storageState: {
            cookies: structuredClone(contentWorker.cookies[user]), // 実Cookieをメモリ上で独立した配列へ複製する関数
            origins: []
          },
        });
        contexts.push(context); // 所有資源を配列へ登録するメソッド
        pages.push(await context.newPage()); // 所有資源を配列へ登録するメソッド / 所有context内にpageを作るメソッド
      }
      const [admin, member, foreignAdmin] = pages;
      /**
 * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
 */
      const path: ContentScenario["path"] = (kind, // 独立contextでcontentを操作する契約型 / 所有する入力を受け取る検証コールバック
        suffix = "",
        club = "a",
        management = false) =>
        `/club/${data.clubs[club].slug}/${management ? "admin/" : ""}${kind}${suffix}`;
      /**
 * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
 */
      const save: ContentScenario["save"] = async (page = admin) => { // 独立contextでcontentを操作する契約型 / 所有する入力を受け取る検証コールバック
        await page.getByRole("button", { // roleと名前で対象を選ぶメソッド
          name: "保存する",
          exact: true
        }).click(); // 正規のボタンを操作するメソッド
        await expect(page.locator('input[name="title"]')).toHaveCount(0); // DOM要素の件数を検証するメソッド / 期待値を生成する関数 / 入力名・href等で対象要素を選ぶメソッド
      };
      /**
 * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
 */
      const identify: ContentScenario["identify"] = async (kind, // 独立contextでcontentを操作する契約型 / 所有する入力を受け取る検証コールバック
        name = title) => {
        const where = {
          clubId: data.clubs.a.id,
          title: name
        };
        const rows = kind === "events" ? await database.clubEvent.findMany({ // 条件に合う所有行を取得するメソッド
          where
        }) :
          await database.clubNotice.findMany({ // 条件に合う所有行を取得するメソッド
            where
          });
        if (rows.length !== 1) {
          throw new Error("F12_CONTENT_DB_MISMATCH"); // 秘密を含めない固定例外のコンストラクター
        }
        return rows[0].id;
      };
      await contentWorker.control({ // 同じrunのsecretで所有stubを制御する関数
        action: "reset"
      });
      await provideFixture({ // Playwrightのケースへ所有fixtureを渡す関数
        ...contentWorker,
        admin,
        member,
        foreignAdmin,
        title,
        path, // 所有クラブの会員・管理URLを生成する関数
        save, // 正規の保存と一覧遷移を確認する関数
        identify, // 所有クラブと題名からcontent IDを照合する関数
        /**
 * 所有する画面・DB・制御入口だけを操作する。
 */
        prepare: async (kind, // 所有する入力を受け取る検証コールバック
          page = admin) => {
          await page.goto(path(kind, "/new", "a", true)); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
          await page.locator('input[name="title"]').fill(title); // テスト用の入力値を設定するメソッド / 入力名・href等で対象要素を選ぶメソッド
          await page.locator('textarea[name="content"]').fill("F12架空の本文"); // テスト用の入力値を設定するメソッド / 入力名・href等で対象要素を選ぶメソッド
          if (kind === "events") {
            await page.locator('input[name="startDate"]').fill("2026-06-10"); // テスト用の入力値を設定するメソッド / 入力名・href等で対象要素を選ぶメソッド
            await page.locator('input[name="startTime"]').fill("09:00"); // テスト用の入力値を設定するメソッド / 入力名・href等で対象要素を選ぶメソッド
          }
          await page.locator('input[name="targetRoles"][value="MEMBER"]').check(); // 対象のcheckbox・radioを有効にするメソッド / 入力名・href等で対象要素を選ぶメソッド
        },
        /**
 * 所有する画面・DB・制御入口だけを操作する。
 */
        remove: async (kind, // 所有する入力を受け取る検証コールバック
          id) => {
          await admin.goto(path(kind, `/${id}/edit`, "a", true)); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
          await admin.getByRole("button", { // roleと名前で対象を選ぶメソッド
            name: "削除",
            exact: true
          }).click(); // 正規のボタンを操作するメソッド
          await admin.getByRole("dialog").getByRole("button", { // roleと名前で対象を選ぶメソッド
            name: "削除する",
            exact: true
          }).click(); // 正規のボタンを操作するメソッド
          await expect(admin.getByRole("dialog")).toHaveCount(0); // DOM要素の件数を検証するメソッド / 期待値を生成する関数 / roleと名前で対象を選ぶメソッド
        },
      });
    } finally {
      try {
        await contentWorker.control({ // 同じrunのsecretで所有stubを制御する関数
          action: "reset"
        });
      } finally {
        for (const context of contexts) {
          await context.close(); // 所有browser contextを回収するメソッド
        }
      }
    }
  },
});

/**
 * content専用fixtureと同じPlaywrightの検証APIを公開する。
 */
export { expect }; // Playwrightの期待値を検証する関数

/**
 * 所有クラブをwhereへ含め、画面が保存したcontentのDB行を取得する。
 */
export async function contentRow(content: ContentScenario, // 所有クラブとcontent IDでDB行を取得する関数 / 独立contextでcontentを操作する契約型
  kind: ContentKind, // イベント・お知らせの種別型
  id: string) { // 文字列型
  const where = {
    clubId: content.data.clubs.a.id,
    id
  };
  return kind === "events" ? await content.database.clubEvent.findFirst({ // 条件に合う所有行を一件取得するメソッド
    where
  }) :
    await content.database.clubNotice.findFirst({ // 条件に合う所有行を一件取得するメソッド
      where
    });
}
/**
 * 所有クラブと親IDを指定して、添付の識別情報を取得する。
 */
export async function contentAttachments(content: ContentScenario, // 所有クラブと親IDで添付を取得する関数 / 独立contextでcontentを操作する契約型
  kind: ContentKind, // イベント・お知らせの種別型
  id: string) { // 文字列型
  return kind === "events" ? await content.database.clubEventAttachment.findMany({ // 条件に合う所有行を取得するメソッド
    where: {
      clubId: content.data.clubs.a.id,
      eventId: id
    },
  }) : await content.database.clubNoticeAttachment.findMany({ // 条件に合う所有行を取得するメソッド
    where: {
      clubId: content.data.clubs.a.id,
      noticeId: id
    },
  });
}
/**
 * Storage SDKを管理権限で初期化せず、所有prefixのobject名だけをDBから取得する。
 */
export async function storageNames(content: ContentScenario, // 所有prefixのStorage object名を照会する関数 / 独立contextでcontentを操作する契約型
  kind: ContentKind): Promise<string[]> { // イベント・お知らせの種別型 / 非同期の完了を表す型 / 文字列型
  const rows = await content.database.$queryRawUnsafe<{ // placeholderで所有prefixを限定したSQLを実行するメソッド
    name: string // 文字列型
  }[]>(
    "SELECT name FROM storage.objects WHERE bucket_id = $1 AND name LIKE $2 ORDER BY name",
    CLUB_ATTACHMENT_BUCKET, // 【修正】実アプリと同じbucketだけのobjectを照会する
    `clubs/${content.data.clubs.a.id}/${kind === "events" ? "events" : "notices"}/%`,
  );
  return rows.map(// 比較に必要な識別情報へ配列を写すメソッド
    /**
     * 入力した所有行から、比較に必要な識別情報を取り出す。
     */
    (row) => row.name); // 所有する入力を受け取る検証コールバック
}
/**
 * 新規ナビゲーションで会員一覧を取得し、古いClient DOMをcache検証に使用しない。
 */
export async function memberList(content: ContentScenario, // 新規ナビゲーションで会員一覧を再取得する関数 / 独立contextでcontentを操作する契約型
  kind: ContentKind): Promise<void> { // イベント・お知らせの種別型 / 非同期の完了を表す型 / 戻り値を利用しない型
  await content.member.goto(content.path(kind, kind === "events" ? "/list?date=2026-06-10" : "?limit=150")); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
}
/**
 * Streamingの404を含め、本文を出さず固定404 UIとnoindexを確認する。
 */
export async function contentDenied(page: Page, // Streamingを含む404 UIとnoindexを検証する関数 / 実画面を操作するpage型
  path: string): Promise<void> { // 文字列型 / 非同期の完了を表す型 / 戻り値を利用しない型
  const response = await page.goto(path); // 新規ナビゲーションで正規画面を取得するメソッド
  expect([200, 404].includes(response?.status() ?? 0)).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 固定条件・所有pathとの一致を調べるメソッド / HTTP状態を取得するメソッド
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached(); // 【修正】期待値生成関数 / noindex要素を選ぶメソッド / 重複を許して先頭を取得するメソッド / 存在検証メソッド
  await expect(page.getByRole("heading", { // 期待値を生成する関数 / 拒否画面の見出しを選ぶメソッド / roleと名前で対象を選ぶメソッド
    name: /^(404|イベントが見つかりません|お知らせが見つかりません)$/u,
  })).toBeVisible(); // 画面表示を検証するメソッド
}
