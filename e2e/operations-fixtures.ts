// e2e/operations-fixtures.ts
// 粒度16の操作だけを準備・回収し、一般認可fixtureの業務DB非更新契約を維持する。

import {
  createHash
} from "node:crypto";
import type {
  Page,
  BrowserContext
} from "@playwright/test";
import {
  z
} from "zod";
import {
  test as base, // 実Cookie・所有DBの準備と招待・子ども操作の回収を行うfixture
  expect, // 同じPlaywrightの期待値検証関数
  memberControl, // 同じrunの私有stubを読み取り・リセットする関数
  type MemberScenario, // 所有本人・画面・DBの操作契約型
} from "./member-fixtures";
import {
  planOperationsLineSettings, // 実行鍵とクラブを束縛した架空LINE設定を作る関数
  parseOperationsPlatform, // 同一runのPlatform本人と一時passwordを照合する関数
  type OperationsLineSetting, // DB保存前に予約したLINE設定の型
} from "../tests/mvp/operations-fixture";

const FAILURE = "F12_OPERATIONS_CASE_FAILED";

/**
 * 画面が生成した報告IDと正規の所属だけを記録する、回収用の所有条件。
 */
type ReportOwner = { // 報告の回収条件型
  clubId: string; // 所有クラブIDの文字列型
  membershipId: string; // 正規の報告者所属IDの文字列型
};

/**
 * 一ケースのLINE設定・報告台帳・遅延Platformログインをまとめる。
 */
export type OperationsScenario = MemberScenario & { // 専用操作契約型 / 共通の実Cookie・所有DB契約型
  line: Record<"a" | "b", OperationsLineSetting>; // 所有LINE設定の辞書型・準備情報型
  reports: Map<string, ReportOwner>; // 所有報告IDと回収条件の対応型
  platform: () => Promise<Page>; // 必要時だけ実ログインする関数型・非同期画面型
};

/**
 * 同一runの認証付き私有制御口へ接続し、例外原文は公開しない。
 */
export async function operationsControl( // 同一runの認証付き私有stubを制御する関数
  scenario: Pick<OperationsScenario, "session">, // 接続契約だけを選ぶ型
  body: Record<string, unknown>, // 制御指定の辞書型・未確定値型
): Promise<unknown> { // 私有応答の非同期型・未確定型
  try {
    const { session } = scenario;
    const response = await fetch(session.stubOrigin + "/control", { // 所有stubだけへ要求する関数
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mvp-secret": session.secret,
      },
      body: JSON.stringify({ // 制御指定をJSON化するメソッド
        ...body,
        runId: session.runId,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(5000), // 制御通信の期限を作るメソッド
    });
    if (!response.ok) {
      throw new Error(FAILURE); // 制御失敗の固定例外コンストラクター
    }
    return await response.json(); // 私有応答をメモリへ取得するメソッド
  } catch {
    throw new Error(FAILURE); // URL・secret・応答原文を捨てるコンストラクター
  }
}

/**
 * 正規フォームの未使用requestIdを送信前に登録し、所属とIDの両方で回収範囲を限定する。
 */
export async function reserveSupportReport( // 正規フォームの報告IDと所属を送信前に記録する関数
  scenario: OperationsScenario, // 所有DBと回収台帳の契約型
  page: Page, // 正規報告フォームを表示する画面型
  club: "a" | "b", // 所有クラブキー型
): Promise<string> { // 登録した報告IDの非同期文字列型
  const id = await page.locator('form:has(textarea[name="message"]) input[name="requestId"]').inputValue(); // 正規フォームを選ぶ・nonceを取得するメソッド
  if (
    !z.string().uuid().safeParse(id).success || // UUIDのschema定義・入力検証メソッド
    scenario.reports.has(id) || // 二重登録を検出するメソッド
    await scenario.database.supportReport.count({ // 所有条件に合うDB行を数えるメソッド
      where: {
        id
      }
    }) !== 0 // 既存報告との衝突を検出するメソッド
  ) {
    throw new Error(FAILURE); // 既存行を回収対象にしない固定例外コンストラクター
  }
  scenario.reports.set(id, { // 保存前に回収対象を登録するメソッド
    clubId: scenario.data.clubs[club].id,
    membershipId: scenario.data.actors[club === "a" ? "aMember" : "bOwner"].membershipId,
  });
  return id;
}

/**
 * 実認証・所有照合を継承し、今回だけのLINE設定と報告をfinallyで回収する。
 */
export const test = base.extend<{ operations: OperationsScenario }>({ // 操作fixtureを追加するメソッド・契約型
  /**
   * 所有クラブに既存LINE設定がないことを確認し、一時設定だけを作成する。
   */
  operations: async ({ members, browser }, provideFixture, testInfo) => { // ケース準備と回収のコールバック・fixture提供関数
    const { database, data, session } = members;
    const line = planOperationsLineSettings(process.env.LINE_CREDENTIAL_ENCRYPTION_KEY, data.clubs); // 同一実行の架空設定を生成する関数
    const reports = new Map<string, ReportOwner>(); // 回収台帳のコンストラクター・ID文字列型・所有条件型
    const contexts: BrowserContext[] = []; // ケースが所有するbrowser contextの配列型
    const created: OperationsLineSetting[] = []; // 保存済み設定だけを登録する配列型
    let platformPage: Page | undefined; // 遅延ログイン済み画面型・未設定型
    try {
      for (const setting of Object.values(line)) { // 所有設定だけを列挙する関数
        if (await database.clubLineSetting.count({ // 既存LINE設定の有無を確認するメソッド
          where: {
            clubId: setting.clubId,
          },
        }) !== 0) {
          throw new Error(FAILURE); // 既存設定を上書きしない固定例外コンストラクター
        }
        created.push(setting); // 作成結果が不明でも所有IDを回収できるよう先に登録するメソッド
        await database.clubLineSetting.create({ // 当該runの所有クラブへ設定を保存するメソッド
          data: {
            id: setting.id,
            clubId: setting.clubId,
            webhookKey: setting.webhookKey,
            lineChannelId: "F12_FAKE_CHANNEL",
            lineBotUserId: setting.lineBotUserId,
            lineChannelSecretEncrypted: setting.lineChannelSecretEncrypted,
            lineChannelAccessTokenEncrypted: setting.lineChannelAccessTokenEncrypted,
          },
        });
      }
      await provideFixture({ // 所有資源と遅延ログイン関数をケースへ渡す関数
        ...members,
        line,
        reports,
        /**
         * 私有payloadと実DBのPlatform本人を照合し、正規フォームで一度だけログインする。
         */
        platform: async () => { // 遅延ログインのコールバック
          if (platformPage) {
            return platformPage;
          }
          const identity = parseOperationsPlatform(await memberControl(members, "read"), session.runId); // 私有応答の取得関数・本人照合関数
          expect(await database.platformAdmin.count({ // 実DBの独立したPlatform権限を検証する関数・件数取得メソッド
            where: {
              id: identity.id,
              email: identity.email,
              isActive: true,
              role: "DEVELOPER",
            },
          })).toBe(1); // 所有Platform本人が一件存在することを検証するメソッド
          const address = createHash("sha256").update(session.runId + testInfo.title).digest(); // ケース別試験IPのhash生成関数・入力追加・終端メソッド
          const context = await browser.newContext({ // 実Cookieを分離するcontext生成メソッド
            baseURL: session.appOrigin,
            proxy: {
              server: session.stubOrigin,
              username: session.runId,
              password: session.secret,
            },
            extraHTTPHeaders: {
              "x-forwarded-for": `198.18.${address[0]}.${address[1]}`,
            },
            serviceWorkers: "block",
            acceptDownloads: false,
            storageState: {
              cookies: [],
              origins: [],
            },
          });
          contexts.push(context); // 回収するcontextを先に記録するメソッド
          const page = await context.newPage(); // 所有contextに画面を作るメソッド
          await page.goto("/platform-login"); // 正規Platformログイン画面へ移動するメソッド
          await page.getByLabel("メールアドレス", { // ラベルで正規入力を選ぶメソッド
            exact: true
          }).fill(identity.email); // ラベル選択・一時メール入力メソッド
          await page.getByLabel("パスワード", { // ラベルで正規入力を選ぶメソッド
            exact: true
          }).fill(identity.password); // ラベル選択・一時password入力メソッド
          await page.getByRole("button", { // roleと名前で正規要素を選ぶメソッド
            name: "ログイン",
            exact: true
          }).click(); // 正規ログインのボタン選択・操作メソッド
          await page.waitForURL(session.appOrigin + "/platform/support"); // 実認証の成功遷移を待つメソッド
          platformPage = page;
          return page;
        },
      });
    } catch {
      throw new Error(FAILURE); // 本文・Cookie・暗号文・DB例外を捨てるコンストラクター
    } finally {
      let cleanupFailed = false;
      for (const [id, owner] of reports) {
        try {
          await database.supportReport.deleteMany({ // 登録IDと正規所属が一致する行だけを回収するメソッド
            where: {
              id,
              clubId: owner.clubId,
              membershipId: owner.membershipId,
            },
          });
          if (await database.supportReport.count({ // 所有条件に合うDB行を数えるメソッド
            where: {
              id
            }
          }) !== 0) { // 回収漏れを数えるメソッド
            cleanupFailed = true;
          }
        } catch {
          cleanupFailed = true;
        }
      }
      for (const setting of created) {
        try {
          await database.clubLineSetting.deleteMany({ // 所有設定と配下token・targetだけを回収するメソッド
            where: {
              id: setting.id,
              clubId: setting.clubId,
            },
          });
          if (await database.clubLineSetting.count({ // 所有条件に合うDB行を数えるメソッド
            where: {
              id: setting.id
            }
          }) !== 0) { // 回収漏れを数えるメソッド
            cleanupFailed = true;
          }
        } catch {
          cleanupFailed = true;
        }
      }
      try {
        await memberControl(members, "reset"); // 故障条件と私有記録を次のケースへ残さない関数
      } catch {
        cleanupFailed = true;
      }
      for (const context of contexts) {
        try {
          await context.close(); // 当該ケースの実Cookieを破棄するメソッド
        } catch {
          cleanupFailed = true;
        }
      }
      if (cleanupFailed) {
        throw new Error("F12_OPERATIONS_CLEANUP_FAILED"); // 一部回収失敗でも全回収を試みた後に失敗を通知するコンストラクター
      }
    }
  },
});

/**
 * fixtureと同じPlaywrightの期待値検証を公開する。
 */
export { expect }; // 実Cookie画面とDB状態を照合する期待値関数
