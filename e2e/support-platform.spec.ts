// e2e/support-platform.spec.ts
// 会員の実受付・配送stub障害・独立したPlatform管理を実Cookieと所有DBで照合する。

import type {
  Page,
  Locator
} from "@playwright/test";
import {
  test, // 所有DB・LINE設定・報告回収台帳を持つ実Cookie fixture
  expect, // 画面とDBを照合する期待値検証関数
  operationsControl, // 同一runの認証付き私有stubを制御する関数
  reserveSupportReport, // 正規nonceと報告者所属を送信前に回収台帳へ登録する関数
  type OperationsScenario, // 専用操作と回収の契約型
} from "./operations-fixtures";
import {
  replayAs, // 正規Actionを別本人の実Cookieで再送する関数
} from "./member-fixtures";
import {
  contentDenied, // Streamingを含む404 UIとnoindexを検証する関数
} from "./content-fixtures";
import {
  supportStubCount, // 所有報告のstub受付回数だけを返す関数
} from "../tests/mvp/operations-fixture";
import {
  SUPPORT_REPORT_ACCEPTED_MESSAGE, // サポート報告の固定受付完了メッセージ
} from "../domain/club/support/support-report-form";

/**
 * 会員またはB OWNERの正規フォームで報告し、受付表示と所有DB行を照合する。
 */
async function report( // 実画面で報告し所有DBの受付を確認する関数
  scenario: OperationsScenario, // 所有DB・実画面・回収台帳の契約型
  club: "a" | "b", // 正規報告クラブのキー型
): Promise<string> { // 報告IDの非同期文字列型
  const page = club === "a" ? scenario.member : scenario.foreignAdmin;
  await page.goto(`/club/${scenario.data.clubs[club].slug}/account`); // 正規アカウント画面へ移動するメソッド
  const form = page.locator('form:has(textarea[name="message"])'); // 報告フォームを選ぶメソッド
  await form.locator('select[name="category"]').selectOption("BUG"); // 種別欄の選択・入力メソッド
  await form.locator('textarea[name="message"]').fill(`F12-${scenario.data.scopeId}-${club}-報告`); // 架空本文の選択・入力メソッド
  const id = await reserveSupportReport(scenario, page, club); // 正規IDと所属を保存前に登録する関数
  await form.getByRole("button", { // roleと名前で正規要素を選ぶメソッド
    name: "確認して送信",
    exact: true
  }).click(); // 正規確認ボタンの選択・操作メソッド
  await page.getByRole("dialog").getByRole("button", { // roleと名前で正規要素を選ぶメソッド
    name: "送信する",
    exact: true
  }).click(); // 正規ダイアログ・送信ボタン選択・操作メソッド
  await expect(page.getByRole("dialog")).toHaveCount(0); // ダイアログ終了を検証する期待値関数・選択・比較メソッド
  await expect(page.getByText(SUPPORT_REPORT_ACCEPTED_MESSAGE, { // 画面・DBの期待値を検証する関数 / 固定の期待表示で要素を選ぶメソッド
    exact: true
  })).toBeVisible(); // 固定受付表示を検証する期待値関数・選択・表示メソッド
  const saved = await scenario.database.supportReport.findFirstOrThrow({ // 正規の所属に束縛された報告を取得するメソッド
    where: {
      id,
      clubId: scenario.data.clubs[club].id,
      membershipId: scenario.data.actors[club === "a" ? "aMember" : "bOwner"].membershipId,
    },
  });
  expect(saved.status).toBe("OPEN"); // 初期対応状態を検証する期待値関数・比較メソッド
  expect(saved.reporterEmail === scenario.data.users[club === "a" ? "aMember" : "bOwner"].email).toBe(true); // 報告者本人の一致だけを検証する期待値関数・比較メソッド
  return id;
}

/**
 * 所有クラブで絞ったPlatform一覧から、対象報告の操作行を選ぶ。
 */
async function managementRow( // 所有クラブで絞ったPlatformの対象報告行を選ぶ関数
  scenario: OperationsScenario, // 実Platformログインと所有クラブの契約型
  club: "a" | "b", // 所有クラブキー型
  id: string, // 予約済み報告IDの文字列型
): Promise<{ // 管理画面と対象行を返す非同期型
  page: Page; // 実Cookieの管理画面型
  row: Locator; // 対象報告行の選択型
}> {
  const page = await scenario.platform(); // 正規フォームによる実Platformログイン関数
  await page.goto(`/platform/support?clubId=${scenario.data.clubs[club].id}`); // 所有クラブだけに絞る新規読込メソッド
  const row = page.locator("tr").filter({ // 対象報告の行選択・絞り込みメソッド
    has: page.locator(`input[name="reportId"][value="${id}"]`), // 行内を基準に報告IDを照合するメソッド
  });
  await expect(row).toHaveCount(1); // 操作対象が一行であることを検証する期待値関数・比較メソッド
  return {
    page,
    row
  };
}

/**
 * 通知成功と拒否を別ケースにし、受付保存と外部受付結果を混同しない。
 */
for (const mode of ["success", "rejected"] as const) { // stubの許可モードを保持するリテラル型
  test(`会員サポートはResend ${mode}でも受付を保持し通知結果だけを記録する`, // 固定モード別のE2E登録関数
    /**
     * 実配送せず、私有stubの要求件数と通知列を独立して照合する。
     */
    async ({ operations: scenario }) => { // 所有ケースのコールバック
      await operationsControl(scenario, { // 同一runのResendだけを設定する制御関数
        action: "configure",
        channel: "resend",
        mode,
      });
      const id = await report(scenario, "a"); // 実画面から会員受付を作る関数
      const saved = await scenario.database.supportReport.findUniqueOrThrow({ // 識別子に一致する所有行を取得するメソッド
        where: {
          id
        }
      }); // 保存済みの通知結果を取得するメソッド
      expect(saved.notifiedAt !== null).toBe(mode === "success"); // 通知受付日時の有無を検証する期待値関数・比較メソッド
      expect(saved.notifyError).toBe(mode === "success" ? null : "EMAIL_SEND_FAILED"); // 安全な固定エラーを検証する期待値関数・比較メソッド
      const records = await operationsControl(scenario, { // 同一runの認証付き私有stubを制御する関数
        action: "read"
      }); // 私有配送記録をメモリへ読む関数
      expect(supportStubCount(records, id)).toBe(1); // 当該報告の要求一回だけを検証する件数関数・期待値・比較メソッド
      expect(await scenario.database.supportReport.count({ // 障害後も一件だけ保持されることを検証する期待値関数・件数メソッド
        where: {
          id,
          clubId: scenario.data.clubs.a.id,
        },
      })).toBe(1); // 受付保持を検証する比較メソッド
    },
  );
}

/**
 * 所属のないPlatform本人がA/Bを管理でき、内部メモと報告者情報が会員へ出ないことを確認する。
 */
test("PlatformはA/Bの報告を状態・内部メモ更新でき、会員画面には管理情報が出ない", // E2E登録関数
  /**
   * 本文は実受付から作り、実UIでの状態変更とメモ保存をDBまで追跡する。
   */
  async ({ operations: scenario }) => { // 所有ケースのコールバック
    test.setTimeout(60000); // 二クラブの実操作に必要なケース期限を設定するメソッド
    const ids = {
      a: await report(scenario, "a"), // A会員の正規報告を作る関数
      b: await report(scenario, "b"), // B OWNERの正規報告を作る関数
    };
    for (const club of ["a", "b"] as const) { // 二クラブのキーを保持するリテラル型
      const id = ids[club];
      const { page, row } = await managementRow(scenario, club, id); // 独立したPlatformで対象行を選ぶ関数
      await row.locator("summary").click(); // 報告本文の詳細を開く選択・操作メソッド
      await expect(row.getByText(`F12-${scenario.data.scopeId}-${club}-報告`, { // 画面・DBの期待値を検証する関数 / 固定の期待表示で要素を選ぶメソッド
        exact: true
      })).toBeVisible(); // 正規本文を検証する期待値関数・選択・表示メソッド
      await row.locator('select[name="status"]').selectOption("IN_PROGRESS"); // 自動保存されるstatusの選択・操作メソッド
      await expect.poll( // DB側のstatus保存を待つメソッド
        /**
         * 当該報告だけの対応中状態を待つ。
         */
        async () => (await scenario.database.supportReport.findUniqueOrThrow({ // 識別子に一致する所有行を取得するメソッド
          where: {
            id
          }
        })).status, // 所有報告の取得コールバック・メソッド
      ).toBe("IN_PROGRESS"); // 対応中への変更を検証するメソッド
      const note = `F12内部-${scenario.data.scopeId}-${club}`;
      await row.locator('textarea[name="internalNote"]').fill(note); // 内部メモの選択・入力メソッド
      await row.getByRole("button", { // roleと名前で正規要素を選ぶメソッド
        name: "メモを保存",
        exact: true
      }).click(); // 正規メモ保存ボタンの選択・操作メソッド
      await expect.poll( // 内部メモ保存を待つメソッド
        /**
         * 元の本文を保持したまま、同じ報告のメモだけが保存されることを確認する。
         */
        async () => (await scenario.database.supportReport.findUniqueOrThrow({ // 識別子に一致する所有行を取得するメソッド
          where: {
            id
          }
        })).internalNote === note, // 所有メモ取得と一致判定のコールバック・メソッド
      ).toBe(true); // メモ保存を検証するメソッド
      const saved = await scenario.database.supportReport.findUniqueOrThrow({ // 識別子に一致する所有行を取得するメソッド
        where: {
          id
        }
      }); // 更新後の所有報告を読むメソッド
      const platform = await page.locator('textarea[name="internalNote"]').count(); // 管理専用欄の存在を確認する選択・件数メソッド
      expect(platform).toBe(1); // 管理側の表示を検証する期待値関数・比較メソッド
      expect(saved.handledByPlatformAdminId !== null).toBe(true); // 対応者の記録を検証する期待値関数・比較メソッド
      expect(saved.resolvedAt).toBeNull(); // 対応中で解決扱いにならないことを検証する期待値関数・比較メソッド
      await scenario.member.goto(`/club/${scenario.data.clubs.a.slug}/account`); // 会員の正規画面を新規取得するメソッド
      const html = await scenario.member.content(); // 会員向けHTMLをメモリ内へ取得するメソッド
      expect(html.includes(note)).toBe(false); // 内部メモ非出力を検証する期待値関数・包含・比較メソッド
      expect(html.includes(scenario.data.users.bOwner.email)).toBe(false); // 他クラブ報告者メール非出力を検証する期待値関数・包含・比較メソッド
    }
  },
);

/**
 * 一般OWNERの画面拒否と、実Platform Actionを一般本人へ持ち替えた直接POST拒否を確認する。
 */
test("OWNER・MEMBERはPlatformの内部メモActionを直接再送しても更新できない", // E2E登録関数
  /**
   * それぞれの実Cookieで再送し、拒否前後の報告全列をメモリ内で比較する。
   */
  async ({ operations: scenario }) => { // 所有ケースのコールバック
    test.setTimeout(60000); // 複数本人の再送に必要なケース期限を設定するメソッド
    const id = await report(scenario, "a"); // 会員の正規報告を作る関数
    for (const actor of [scenario.admin, scenario.member]) {
      const { page, row } = await managementRow(scenario, "a", id); // 正規Platform行を新規取得する関数
      await row.locator('textarea[name="internalNote"]').fill("F12許可されないメモ"); // 必須メモの選択・入力メソッド
      const before = JSON.stringify(await scenario.database.supportReport.findUniqueOrThrow({ // メモリ内だけの比較値をJSON化するメソッド / 識別子に一致する所有行を取得するメソッド
        where: {
          id
        }
      })); // 拒否前の全列を取得・直列化するメソッド
      await replayAs(page, actor, // 正規Actionを一般本人のCookieで直接再送する関数
        /**
         * 本物のnonce・versionを含むPlatform更新Actionを捕捉する。
         */
        async () => { // 正規Action送信のコールバック
          await row.getByRole("button", { // roleと名前で正規要素を選ぶメソッド
            name: "メモを保存",
            exact: true
          }).click(); // 正規保存ボタンの選択・操作メソッド
        },
      );
      const after = JSON.stringify(await scenario.database.supportReport.findUniqueOrThrow({ // メモリ内だけの比較値をJSON化するメソッド / 識別子に一致する所有行を取得するメソッド
        where: {
          id
        }
      })); // 拒否後の全列を取得・直列化するメソッド
      expect(before === after).toBe(true); // 一般本人による非更新を検証する期待値関数・比較メソッド
      await contentDenied(actor, "/platform/support"); // 一般本人の管理画面拒否とnoindexを検証する関数
    }
  },
);

/**
 * 古い管理画面のversionによる保存が、新しいメモを上書きしないことを実Actionで確認する。
 */
test("Platformの古いversionからのメモ保存は競合し、新しい保存内容を保持する", // E2E登録関数
  /**
   * 同じ実Cookieの二画面を使い、後から保存する古いフォームの拒否を確認する。
   */
  async ({ operations: scenario }) => { // 所有ケースのコールバック
    const id = await report(scenario, "a"); // 会員の正規報告を作る関数
    const { page, row } = await managementRow(scenario, "a", id); // 正規の管理行を取得する関数
    const stale = await page.context().newPage(); // 同じCookieの別画面を作るcontext取得・画面生成メソッド
    try {
      await stale.goto(page.url()); // 同じ一覧URLをメモリ内で取得して新規表示するメソッド
      const old = stale.locator(`tr:has(input[name="reportId"][value="${id}"])`); // 古いversionを保持した対象行を選ぶメソッド
      await expect(old).toHaveCount(1); // 古いフォームの存在を検証する期待値関数・比較メソッド
      await row.locator('textarea[name="internalNote"]').fill("F12新しい保存"); // 最新メモの選択・入力メソッド
      await row.getByRole("button", { // roleと名前で正規要素を選ぶメソッド
        name: "メモを保存",
        exact: true
      }).click(); // 最新保存のボタン選択・操作メソッド
      await expect.poll( // 最新のDB保存完了を待つメソッド
        /**
         * 古い画面を操作する前に、新しい保存を確定させる。
         */
        async () => (await scenario.database.supportReport.findUniqueOrThrow({ // 識別子に一致する所有行を取得するメソッド
          where: {
            id
          }
        })).internalNote === "F12新しい保存", // 保存値取得と一致判定のコールバック・メソッド
      ).toBe(true); // 最新保存を検証するメソッド
      const before = JSON.stringify(await scenario.database.supportReport.findUniqueOrThrow({ // メモリ内だけの比較値をJSON化するメソッド / 識別子に一致する所有行を取得するメソッド
        where: {
          id
        }
      })); // 最新版の比較値を取得・直列化するメソッド
      await old.locator('textarea[name="internalNote"]').fill("F12古い画面の上書き"); // 古い画面への入力・選択メソッド
      await old.getByRole("button", { // roleと名前で正規要素を選ぶメソッド
        name: "メモを保存",
        exact: true
      }).click(); // 古いversionの保存ボタン選択・操作メソッド
      await expect(old.getByRole("alert")).toBeVisible(); // 固定競合エラーの期待値関数・選択・表示メソッド
      const after = JSON.stringify(await scenario.database.supportReport.findUniqueOrThrow({ // メモリ内だけの比較値をJSON化するメソッド / 識別子に一致する所有行を取得するメソッド
        where: {
          id
        }
      })); // 拒否後比較値の取得・直列化メソッド
      expect(before === after).toBe(true); // 最新内容の保持を検証する期待値関数・比較メソッド
      expect(await old.locator('textarea[name="internalNote"]').inputValue() === "F12古い画面の上書き").toBe(true); // 下書き保持を検証する選択・取得・期待値・比較メソッド
    } finally {
      await stale.close(); // 所有する古い画面だけを回収するメソッド
    }
  },
);
