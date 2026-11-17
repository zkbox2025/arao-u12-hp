// e2e/failure-observability.spec.ts
// 架空sentinelを実SDKの故障応答に入れ、Action・HTML・許可DB列・親監視の検出件数を照合する。

import {
  test as contentTest, // contentとStorageを所有する実Cookie fixture
  expect, // 同じPlaywrightの期待値検証関数
} from "./content-fixtures";
import {
  test, // 報告IDの回収台帳を持つ実Cookie fixture
  operationsControl, // 同一runの私有stubを制御する関数
  reserveSupportReport, // 正規フォームの報告IDを送信前に回収登録する関数
} from "./operations-fixtures";
import {
  captureAction, // 正規UIのAction要求を捕捉する関数
  postAction, // 同一入口へ再送し本文のsentinel含有だけを返す関数
  safeBoundary, // 失敗原文を固定コードへ変換する関数
} from "./action-requests";
import {
  mvpFailureSentinel, // 実行ID・境界に束縛した架空sentinelを作る関数
} from "../tests/mvp/failure-observability.mjs";
import {
  createMvpFixturePdf, // 小さな架空PDFをメモリ上で作る関数
} from "../tests/mvp/local-services-fixture";
import {
  CLUB_ATTACHMENT_BUCKET, // クラブ添付PDFを保存するprivate bucket名
} from "../src/infrastructure/storage/club-attachment-storage-constants";

/**
 * 認証済み私有応答から注入件数と出力検出件数だけを取り、監視器なしを成功にしない。
 */
function evidence( // 故障注入・非出力の証拠を抽出する関数
  input: unknown, // 私有応答の未確定型
  channel: "resend" | "line" | "storage", // 故障境界の型
): number { // 注入済み件数の数値型
  const value = input as { // 私有応答の最小構造への型アサーション
    faults?: Record<string, number>; // 故障件数の辞書型
    fixture?: { // 項目ごとの値を定義するオブジェクト型
      observability?: { // 項目ごとの値を定義するオブジェクト型
        stdout: number; // 数値型
        stderr: number // 数値型
      }
    }; // 親の出力監視件数型
  };
  const counts = value.fixture?.observability;
  if (!counts ||
    counts.stdout !== 0 ||
    counts.stderr !== 0 ||
    !Number.isSafeInteger(value.faults?.[channel])) { // 件数が提供されていることを検証する関数
    throw new Error("F12_OBSERVABILITY_EVIDENCE_FAILED"); // 原文を含めない固定例外コンストラクター
  }
  return value.faults![channel];
}

for (const channel of ["storage", "line"] as const) { // 故障境界を限定するリテラル型アサーション
  /**
   * 実Storage・LINE SDKが架空sentinelを受け取った後も、アプリの公開情報とDBには出さない。
   */
  contentTest(`${channel}故障のsentinelはRSC・HTML・DB・子の出力に出ない`, // E2E登録関数
    /**
     * 正常系対照と故障注入件数を確認し、validationだけで終わる偽の成功を防ぐ。
     */
    async ({ content }) => { // 所有contentの検証コールバック
      contentTest.setTimeout(90000); // 複数の実操作の期限を設定するメソッド
      await safeBoundary( // 固定例外境界関数
        /**
         * 正規UIから同じSDK境界を通し、故障後の実DB状態と非反射を比較する。
         */
        async () => { // 操作・検証のコールバック
          const { admin, database, data } = content;
          await content.prepare("events"); // 正規新規フォームを準備する関数
          if (channel === "storage") {
            await admin.locator('input[name="attachmentFiles"]').setInputFiles({ // PDF選択・設定メソッド
              name: "control.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.from(createMvpFixturePdf()), // PDFバイト列の生成関数 / 架空PDF生成関数
            });
          } else {
            await admin.locator('input[name="status"][value="PUBLISHED"]').check(); // 正規公開を選択するメソッド
            await admin.locator('input[name="shouldNotifyLine"]').check(); // LINE通知を選択するメソッド
            await admin.locator(`input[name="lineTargetIds"][value="${content.targetId}"]`).check(); // 所有通知先を選ぶメソッド
          }
          await content.save(); // 正常系の正規保存を行う関数
          const controlId = await content.identify("events"); // 正常系保存をDBで照合する関数
          if (channel === "line") {
            await expect.poll( // workerの正常終端を待つ検証メソッド
              /**
               * 同じ通知先・親の正常配送結果だけを待つ。
               */
              async () => (await database.clubLineDelivery.findFirst({ // 入力を受け取り操作・照合するコールバック / 所有条件で一行を取得するメソッド
                where: {
                  clubId: data.clubs.a.id,
                  eventId: controlId
                }
              }))?.status, // 正常配送を取得するコールバック・メソッド
            ).toBe("SENT"); // 正常受付を検証するメソッド
          } else {
            expect(await database.clubEventAttachment.count({ // 期待値を検証する関数 / 所有条件の件数を取得するメソッド
              where: {
                clubId: data.clubs.a.id,
                eventId: controlId
              }
            })).toBe(1); // 正常添付保存の件数取得・比較メソッド / 期待値関数
          }
          const sentinel = mvpFailureSentinel(content.session.runId, channel); // 同一runの架空sentinelを作る関数
          const before = evidence(await content.control({ action: "read" }), channel); // 出力監視・注入件数の照合関数 / 私有参照関数
          await content.control({ // 所有送信またはStorage prefixだけに故障を設定する関数
            action: "configure",
            channel,
            mode: "server-error",
            sentinel,
            ...(channel === "storage" ? {
              method: "POST",
              match: "prefix",
              path: `/storage/v1/object/${CLUB_ATTACHMENT_BUCKET}/clubs/${data.clubs.a.id}/events/`,
            } : {}),
          });
          await content.prepare("events"); // 新しい正規nonceのフォームを準備する関数
          const title = content.title + "故障";
          await admin.locator('input[name="title"]').fill(title); // 故障対象だけを識別する架空題名を入力するメソッド
          if (channel === "storage") {
            await admin.locator('input[name="attachmentFiles"]').setInputFiles({ // PDF選択・設定メソッド
              name: "failure.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.from(createMvpFixturePdf()), // PDFバイト列の生成関数 / 架空PDF生成関数
            });
          } else {
            await admin.locator('input[name="status"][value="PUBLISHED"]').check(); // 公開状態を選ぶメソッド
            await admin.locator('input[name="shouldNotifyLine"]').check(); // 通知を有効にするメソッド
            await admin.locator(`input[name="lineTargetIds"][value="${content.targetId}"]`).check(); // 正規通知先を選ぶメソッド
          }
          const action = await captureAction(admin, // 正規POST捕捉関数
            /**
             * 正規保存ボタンから実Action要求を得る。
             */
            () => admin.getByRole("button", { // 入力を受け取り操作・照合するコールバック / roleと表示名で要素を選ぶメソッド
              name: "保存する",
              exact: true
            }).click(), // ボタン選択・操作コールバック
          );
          const result = await postAction(admin, action, { sentinel }); // ActionのDTO・RSCをメモリだけで点検する関数
          expect(result.exposed).toBe(false); // 応答原文の非反射を検証する関数・比較メソッド
          if (channel === "storage") {
            expect(await database.clubEvent.count({ // 期待値を検証する関数 / 所有条件の件数を取得するメソッド
              where: {
                clubId: data.clubs.a.id,
                title
              }
            })).toBe(0); // upload失敗時のDB非作成を照合する関数・取得・比較メソッド
          } else {
            const id = await content.identify("events", title); // 故障時も保存された親を照合する関数
            await expect.poll( // 非同期workerの故障終端を待つメソッド
              /**
               * 当該親と所有クラブの配送行だけを待つ。
               */
              async () => (await database.clubLineDelivery.findFirst({ // 入力を受け取り操作・照合するコールバック / 所有条件で一行を取得するメソッド
                where: {
                  clubId: data.clubs.a.id,
                  eventId: id
                }
              }))?.status, // 配送終端を取得するコールバック・メソッド
            ).toBe("FAILED"); // 故障の終端状態を検証するメソッド
          }
          const details = await database.clubLineDelivery.findMany({ // 所有配送の許可エラー列だけを取得するメソッド
            where: { clubId: data.clubs.a.id },
            select: {
              errorCode: true,
              errorDetail: true
            },
          });
          const jobs = await database.storageDeletionJob.findMany({ // 所有jobの許可エラー列だけを取得するメソッド
            where: { clubId: data.clubs.a.id },
            select: { lastError: true },
          });
          expect(JSON.stringify([details, jobs]).includes(sentinel)).toBe(false); // DB列の非保存を検証する関数 / JSON化・含有・比較メソッド
          await admin.reload(); // HTML・初期RSCを再取得するメソッド
          expect((await admin.content()).includes(sentinel)).toBe(false); // HTMLの非反射を検証する関数 / HTML取得・含有・比較メソッド
          expect(evidence(await content.control({ action: "read" }), channel)).toBe(before + 1); // 実注入と出力件数を照合する関数 / 私有参照関数 / 期待値・比較メソッド
        },
      );
    },
  );
}

/**
 * Resendの実SDKに架空の故障本文を返し、受付を残しつつ公開情報は固定コードに限定する。
 */
test("Resend故障のsentinelは報告DTO・HTML・許可DB列・stdout・stderrへ出ない", // E2E登録関数
  /**
   * 同じ報告フローの正常通知と失敗通知を分け、固定エラーと出力監視器を確認する。
   */
  async ({ operations: scenario }) => { // 所有操作の検証コールバック
    test.setTimeout(60000); // 二回の正規受付の期限を設定するメソッド
    await safeBoundary( // 固定例外境界関数
      /**
       * 全ての報告IDを保存前に回収台帳へ登録し、原文はメモリ内で照合する。
       */
      async () => { // 報告の操作・照合コールバック
        const { member, database, data } = scenario;
        const sentinel = mvpFailureSentinel(scenario.session.runId, "resend"); // 当該runの架空値生成関数
        const before = evidence(await operationsControl(scenario, { action: "read" }), "resend"); // 出力監視・注入証拠の照合関数 / 私有制御関数
        for (const mode of ["success", "server-error"] as const) { // 正常・故障モードのリテラル型アサーション
          await operationsControl(scenario, { // 同じrunの私有stubを制御する関数
            action: "configure",
            channel: "resend",
            mode,
            sentinel
          }); // 認証付き制御関数
          await member.goto(`/club/${data.clubs.a.slug}/account`); // 正規報告画面へ移動するメソッド
          const form = member.locator('form:has(textarea[name="message"])'); // 正規報告フォームを選ぶメソッド
          await form.locator('select[name="category"]').selectOption("BUG"); // 正規種別を選択するメソッド
          await form.locator('textarea[name="message"]').fill("F12架空障害報告"); // 架空本文を入力するメソッド
          const id = await reserveSupportReport(scenario, member, "a"); // 回収対象の正規nonceを記録する関数
          await form.getByRole("button", { // roleと表示名で要素を選ぶメソッド
            name: "確認して送信",
            exact: true
          }).click(); // 確認ダイアログを開く選択・操作メソッド
          const action = await captureAction(member, // 実POST捕捉関数
            /**
             * 正規ダイアログの確定ボタンから実要求を取得する。
             */
            () => member.getByRole("dialog").getByRole("button", { // 入力を受け取り操作・照合するコールバック / roleと表示名で要素を選ぶメソッド
              name: "送信する",
              exact: true
            }).click(), // ダイアログ・ボタン選択・操作コールバック
          );
          expect((await postAction(member, action, { sentinel })).exposed).toBe(false); // DTO・RSC点検関数 / 非反射を検証する関数・比較メソッド
          const saved = await database.supportReport.findUniqueOrThrow({ where: { id } }); // 所有報告結果を取得するメソッド
          expect(saved.clubId === data.clubs.a.id && // 期待値を検証する関数
            saved.status === "OPEN").toBe(true); // 受付保持を検証する関数・比較メソッド
          expect(saved.notifyError).toBe(mode === "success" ? null : "EMAIL_SEND_RESULT_UNKNOWN"); // 【修正】503は受付結果不明として記録する現行仕様の期待値関数・比較メソッド
          expect(saved.notifiedAt !== null).toBe(mode === "success"); // 通知受付の有無を検証する関数・比較メソッド
          expect(JSON.stringify({ // 期待値を検証する関数 / 値をJSON化するメソッド
            notifyError: saved.notifyError,
            internalNote: saved.internalNote
          }).includes(sentinel)).toBe(false); // 許可DB列を検証する関数 / JSON化・含有・比較メソッド
          await member.reload(); // 初期HTMLを再取得するメソッド
          expect((await member.content()).includes(sentinel)).toBe(false); // HTML非反射を検証する関数 / 取得・含有・比較メソッド
        }
        expect(evidence(await operationsControl(scenario, { action: "read" }), "resend")).toBe(before + 1); // 実SDK故障注入と出力監視を検証する関数 / 私有制御関数 / 期待値・比較メソッド
      },
    );
  },
);
