// e2e/action-boundaries.spec.ts
// 正規UIの成功を対照に、同じbuildの実Actionを直接POSTして境界と副作用を照合する。

import {
  randomUUID,
} from "node:crypto";
import {
  test as contentTest, // 実Cookie・content・private Storageを所有するfixture
  expect, // 同じPlaywrightの期待値検証関数
} from "./content-fixtures";
import {
  test, // LINE設定と報告回収台帳を持つ実Cookie fixture
  operationsControl, // 認証付き私有stubを制御する関数
} from "./operations-fixtures";
import {
  invite, // 正規OWNERフォームから招待し受付を照合する関数
  invitationLink, // 所有stubから宛先・クラブの一致するURLを取得する関数
} from "./member-fixtures";
import {
  captureAction, // 正規UIのActionを実行前に捕捉する関数
  editAction, // 実要求の業務項目・明示bindを厳密に差し替える関数
  postAction, // 選択本人の実Cookieで同じHTTPS入口へ再送する関数
  actionState, // 所有DB・Storage・配送の比較用hashを取得する関数
  safeBoundary, // 例外原文を固定コードへ変換する関数
} from "./action-requests";
import {
  createMvpFixturePdf, // 小さな架空PDFをメモリ上で生成する関数
} from "../tests/mvp/local-services-fixture";

for (const kind of ["events", "notice"] as const) { // content種別を限定するリテラル型アサーション
  /**
   * 正規作成・更新と、別Cookie・ID・添付・Origin・Action識別子の拒否を別々に照合する。
   */
  contentTest(`${kind}の実POSTはMEMBER・他クラブ・関連ID・Originの境界を維持する`, // E2E登録関数
    /**
     * 正規画面が生成したbindとnonceを使い、拒否前後のDB・Storage・送信記録を比較する。
     */
    async ({ content }) => { // 所有contentの検証コールバック
      contentTest.setTimeout(90000); // 複数の正規HTTP操作の期限を設定するメソッド
      await safeBoundary( // 秘密を含めない例外境界関数
        /**
         * 二クラブの資源を区別し、正規UIが成功する同一入力で境界を検証する。
         */
        async () => { // 操作・比較のコールバック
          const { admin, member, foreignAdmin, database, data } = content;
          const foreignId = randomUUID(); // 所有するB親IDを生成する関数
          const attachmentId = randomUUID(); // 所有するB添付IDを生成する関数
          const foreignPath = `clubs/${data.clubs.b.id}/${kind === "events" ? "events" : "notices"}/${foreignId}/${attachmentId}.pdf`;
          try {
            const parent = {
              id: foreignId,
              clubId: data.clubs.b.id,
              title: "F12境界B",
              content: "F12架空本文",
              targetRoles: ["MEMBER" as const], // 対象roleのリテラル型アサーション
              createdByMembershipId: data.actors.bOwner.membershipId,
            };
            const attachment = {
              id: attachmentId,
              clubId: data.clubs.b.id,
              fileName: "foreign.pdf",
              storagePath: foreignPath,
              mimeType: "application/pdf",
              sizeBytes: 100,
            };
            if (kind === "events") {
              await database.clubEvent.create({ // 所有Bの試験用親行を作成するメソッド
                data: {
                  ...parent,
                  startAt: new Date("2026-06-10T00:00:00Z"), // 試験日時のコンストラクター
                },
              });
              await database.clubEventAttachment.create({ // Bの関連IDを準備するメソッド
                data: {
                  ...attachment,
                  eventId: foreignId
                },
              });
            } else {
              await database.clubNotice.create({ data: parent }); // 所有Bの試験用親行を作成するメソッド
              await database.clubNoticeAttachment.create({ // Bの関連IDを準備するメソッド
                data: {
                  ...attachment,
                  noticeId: foreignId
                },
              });
            }
            await content.prepare(kind); // Aの正規新規フォームを準備する関数
            await admin.locator('input[type="file"]').setInputFiles({ // 正規PDF入力を選択・設定するメソッド
              name: "owned.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.from(createMvpFixturePdf()), // PDFのバイト列変換関数 / 架空PDF生成関数
            });
            await content.save(); // 正規UIからDB・Storageへ保存する関数
            const id = await content.identify(kind); // 正規保存の親IDを照合する関数
            await member.goto(content.path(kind)); // A MEMBERのCookieを持つ画面を開くメソッド / 所有URL生成関数
            await foreignAdmin.goto(content.path(kind, "", "b")); // B OWNERの画面を開くメソッド / 所有URL生成関数
            await admin.goto(content.path(kind, `/${id}/edit`, "a", true)); // 正規更新画面を開くメソッド / 所有URL生成関数
            await admin.locator('input[name="title"]').fill(content.title + "更新"); // 正規の変更値を入力するメソッド
            const action = await captureAction(admin, // 実UIのPOSTを捕捉する関数
              /**
               * 正規保存ボタンだけを操作し、Action識別子をハードコードしない。
               */
              () => admin.getByRole("button", { // 入力を受け取り操作・照合するコールバック / roleと表示名で要素を選ぶメソッド
                name: "保存する",
                exact: true
              }).click(), // ボタン選択・操作のコールバック
            );
            const clubs = [data.clubs.a.id, data.clubs.b.id];
            const before = await actionState(database, clubs, await content.control({ action: "read" })); // 所有範囲比較関数 / 私有stub参照関数
            for (const actor of [member, foreignAdmin]) {
              const result = await postAction(actor, action); // 別Cookieの直接POST関数
              expect(result.redirected).toBe(false); // 成功遷移がないことを検証する関数・メソッド
              expect(await actionState(database, clubs, await content.control({ action: "read" }))).toBe(before); // 非更新比較関数 / 私有参照関数 / 期待値・比較メソッド
            }
            const idAttack = await editAction(action, {}, [id, foreignId]); // 明示bindの親IDだけを変更する関数
            const attachmentAttack = await editAction(action, { deleteAttachmentIds: attachmentId }); // A親へB添付IDを混ぜる関数
            for (const attack of [idAttack, attachmentAttack]) {
              const result = await postAction(admin, attack); // 正規OWNERのまま関連IDを改変する関数
              expect(result.redirected).toBe(false); // アプリscope拒否を検証する関数・メソッド
              expect(await actionState(database, clubs, await content.control({ action: "read" }))).toBe(before); // 所有範囲の非更新比較関数 / 私有参照関数 / 期待値・比較メソッド
            }
            const origin = await postAction(admin, action, { origin: "https://attacker.invalid" }); // 通信先を変えずOriginだけを変える関数
            expect(origin.status >= 400 && // 期待値を検証する関数
              !origin.redirected).toBe(true); // OriginのHTTP拒否を検証する関数・メソッド
            expect(await actionState(database, clubs, await content.control({ action: "read" }))).toBe(before); // DB・Storage・送信の非更新比較関数 / 私有参照関数 / 期待値・比較メソッド
            const invalid = await postAction(admin, action, { invalidateAction: true }); // 業務scope拒否と別のAction解決失敗を作る関数
            expect(invalid.status >= 400 && // 期待値を検証する関数
              !invalid.redirected).toBe(true); // framework拒否の状態を検証する関数・メソッド
            expect(await actionState(database, clubs, await content.control({ action: "read" }))).toBe(before); // 非更新比較関数 / 私有参照関数 / 期待値・比較メソッド
            const ownedAttachment = kind === "events"
              ? await database.clubEventAttachment.findFirstOrThrow({ // 所有行を取得し不存在を拒否するメソッド
                where: {
                  clubId: data.clubs.a.id,
                  eventId: id
                }
              }) // 正規添付の取得メソッド
              : await database.clubNoticeAttachment.findFirstOrThrow({ // 所有行を取得し不存在を拒否するメソッド
                where: {
                  clubId: data.clubs.a.id,
                  noticeId: id
                }
              }); // 正規添付の取得メソッド
            const valid = await editAction(action, { // 正規Actionの業務値・明示bindを編集する関数
              clubId: data.clubs.b.id,
              deleteAttachmentIds: ownedAttachment.id,
            }); // hidden clubIdを混ぜても正規A操作になることを検証する関数
            await postAction(admin, valid); // 正規Cookie・bindの成功対照を実行する関数
            const updated = kind === "events"
              ? await database.clubEvent.findUniqueOrThrow({ where: { id } }) // 正規更新後の親取得メソッド
              : await database.clubNotice.findUniqueOrThrow({ where: { id } }); // 正規更新後の親取得メソッド
            expect(updated.clubId === data.clubs.a.id && // 期待値を検証する関数
              updated.title === content.title + "更新").toBe(true); // server由来scopeの維持を検証する関数・メソッド
            const remaining = kind === "events"
              ? await database.clubEventAttachment.count({ // 所有条件の件数を取得するメソッド
                where: {
                  id: ownedAttachment.id,
                  clubId: data.clubs.a.id
                }
              }) // 正規添付の削除後件数取得メソッド
              : await database.clubNoticeAttachment.count({ // 所有条件の件数を取得するメソッド
                where: {
                  id: ownedAttachment.id,
                  clubId: data.clubs.a.id
                }
              }); // 正規添付の削除後件数取得メソッド
            expect(remaining).toBe(0); // 正当な添付削除対照の期待値関数・比較メソッド
          } finally {
            if (kind === "events") {
              await database.clubEvent.deleteMany({ // 所有条件に合う行だけを回収するメソッド
                where: {
                  id: foreignId,
                  clubId: data.clubs.b.id
                }
              }); // 所有B試験親だけを回収するメソッド
            } else {
              await database.clubNotice.deleteMany({ // 所有条件に合う行だけを回収するメソッド
                where: {
                  id: foreignId,
                  clubId: data.clubs.b.id
                }
              }); // 所有B試験親だけを回収するメソッド
            }
            await database.storageDeletionJob.deleteMany({ // 所有条件に合う行だけを回収するメソッド
              where: {
                clubId: data.clubs.b.id,
                storagePath: foreignPath
              }
            }); // 作成した架空pathのjobだけを回収するメソッド
          }
        },
      );
    },
  );
}

/**
 * 正規の会員role更新要求にB所属IDを混ぜても、A OWNERにB操作権限を与えない。
 */
test("membershipIdの改変とMEMBER Cookieを拒否し、正規OWNERの更新は成功する", // E2E登録関数
  /**
   * 正規のダイアログから要求を取得し、同じ入力とnonceの成功を最後に確認する。
   */
  async ({ operations: scenario }) => { // 所有操作の検証コールバック
    await safeBoundary( // 固定例外境界関数
      /**
       * 別クラブ所属ID・別roleのCookieと正規操作を比較する。
       */
      async () => { // 操作と照合のコールバック
        const { admin, member, database, data } = scenario;
        await member.goto(`/club/${data.clubs.a.slug}/account`); // 比較するMEMBER画面を開くメソッド
        await admin.goto(`/club/${data.clubs.a.slug}/admin/members`); // 正規会員管理画面を開くメソッド
        await admin.locator("li").filter({ hasText: data.users.aMember.email }).getByRole("button", { // roleと表示名で要素を選ぶメソッド / 条件に合う要素を選ぶメソッド / フォーム・要素を選ぶメソッド
          name: "権限・状態を変更",
          exact: true
        }).click(); // 対象会員行の選択・操作メソッド
        const dialog = admin.getByRole("dialog"); // 正規編集ダイアログを選ぶメソッド
        await dialog.locator('select[name="role"]').selectOption("COACH"); // 正規の変更を入力するメソッド
        const action = await captureAction(admin, // 実Action捕捉関数
          /**
           * 正規ダイアログの保存を発行する。
           */
          () => dialog.getByRole("button", { // 入力を受け取り操作・照合するコールバック / roleと表示名で要素を選ぶメソッド
            name: "変更を保存する",
            exact: true
          }).click(), // ボタン選択・操作のコールバック
        );
        const clubs = [data.clubs.a.id, data.clubs.b.id];
        const before = await actionState(database, clubs, await operationsControl(scenario, { action: "read" })); // 非更新比較関数 / 私有制御参照関数
        await postAction(member, action); // MEMBER Cookieで直接POSTする関数
        expect(await actionState(database, clubs, await operationsControl(scenario, { action: "read" }))).toBe(before); // 非更新比較関数 / 私有制御関数 / 期待値・比較メソッド
        await postAction(admin, await editAction(action, {}, [data.actors.aMember.membershipId, data.actors.bOwner.membershipId])); // 他クラブIDへの編集・再送関数
        expect(await actionState(database, clubs, await operationsControl(scenario, { action: "read" }))).toBe(before); // 非更新比較関数 / 私有制御関数 / 期待値・比較メソッド
        await postAction(admin, action); // 正規OWNERの成功対照を送信する関数
        const saved = await database.clubMembership.findUniqueOrThrow({ where: { id: data.actors.aMember.membershipId } }); // 正規更新結果取得メソッド
        expect(saved.role).toBe("COACH"); // role更新の成功を検証する関数・比較メソッド
      },
    );
  },
);

/**
 * 子どもの明示bindとhidden値を同時改変しても、他の保護者の子を変更できない。
 */
test("childIdの一致だけで保護者確認を省略せず、本人の子だけを更新する", // E2E登録関数
  /**
   * 正規の本人編集と、別保護者IDの一貫した改ざんを対照にする。
   */
  async ({ operations: scenario }) => { // 所有操作の検証コールバック
    await safeBoundary( // 固定例外境界関数
      /**
       * 同じフォームのbound・hidden childIdを変え、親scopeの拒否を確かめる。
       */
      async () => { // 検証コールバック
        const { admin, database, data } = scenario;
        const own = { id: randomUUID() }; // 所有する試験用子どもIDの生成関数
        const foreign = { id: randomUUID() }; // 所有する別保護者の子どもIDの生成関数
        try {
          await database.child.create({ // 当該ケースの本人の子どもを準備するメソッド
            data: {
              id: own.id,
              parentId: data.users.aOwner.id,
              name: "F12本人",
              grade: "ELEMENTARY_3",
              clubMemberships: {
                create: {
                  clubId: data.clubs.a.id,
                },
              },
            },
          });
          await database.child.create({ // 当該ケースの別保護者の子どもを準備するメソッド
            data: {
              id: foreign.id,
              parentId: data.users.aMember.id,
              name: "F12別保護者",
              grade: "ELEMENTARY_3",
              clubMemberships: {
                create: {
                  clubId: data.clubs.a.id,
                },
              },
            },
          });
          await admin.goto(`/club/${data.clubs.a.slug}/account`); // 正規アカウント画面を開くメソッド
          const form = admin.locator("li").filter({ has: admin.locator(`input[name="childId"][value="${own.id}"]`) }).locator("form").filter({ has: admin.locator('select[name="grade"]') }); // 本人編集フォームの選択・絞込みメソッド
          await form.locator('input[name="name"]').fill("F12本人更新"); // 正規入力を設定するメソッド
          const action = await captureAction(admin, // 正規POST捕捉関数
            /**
             * 通常と同じ確認ダイアログから保存する。
             */
            async () => { // 正規確認操作のコールバック
              await form.getByRole("button", { // roleと表示名で要素を選ぶメソッド
                name: "確認して保存",
                exact: true
              }).click(); // 確認画面の選択・操作メソッド
              await admin.getByRole("dialog").getByRole("button", { // roleと表示名で要素を選ぶメソッド
                name: "保存する",
                exact: true
              }).click(); // 実POSTを発行する選択・操作メソッド
            },
          );
          const clubs = [data.clubs.a.id, data.clubs.b.id];
          const before = await actionState(database, clubs, await operationsControl(scenario, { action: "read" })); // 比較値取得関数 / 私有stub参照関数
          const attack = await editAction(action, { childId: foreign.id }, [own.id, foreign.id]); // boundとhiddenを同時に変更する関数
          await postAction(admin, attack); // 別保護者IDの直接POST関数
          expect(await actionState(database, clubs, await operationsControl(scenario, { action: "read" }))).toBe(before); // 非更新比較関数 / 私有制御関数 / 期待値・比較メソッド
          await postAction(admin, action); // 本人の正規更新対照を送信する関数
          expect((await database.child.findUniqueOrThrow({ where: { id: own.id } })).name === "F12本人更新").toBe(true); // 本人の子の取得・更新検証メソッド / 期待値関数
        } finally {
          await database.child.deleteMany({ // このケースが予約した子どもだけを回収するメソッド
            where: {
              OR: [
                {
                  id: own.id,
                  parentId: data.users.aOwner.id
                },
                {
                  id: foreign.id,
                  parentId: data.users.aMember.id
                },
              ],
            },
          });
        }
      },
    );
  },
);

/**
 * 通知先IDと、画面にない通知先クラブをOWNERの実要求で差し替える。
 */
test("targetIdをBへ改変したLINE設定ActionはBを変更しない", // E2E登録関数
  /**
   * 両クラブに所有通知先を用意し、正規A通知先の更新だけを許可する。
   */
  async ({ operations: scenario }) => { // 所有操作の検証コールバック
    await safeBoundary( // 固定例外境界関数
      /**
       * 正規のLINE設定画面からbind済み通知先IDを取得する。
       */
      async () => { // 検証コールバック
        const { admin, database, data } = scenario;
        const ids = {
          a: randomUUID(), // 試験資源のUUIDを生成する関数
          b: randomUUID() // 試験資源のUUIDを生成する関数
        }; // 所有通知先IDの生成関数
        for (const club of ["a", "b"] as const) { // クラブキーのリテラル型アサーション
          await database.clubLineTarget.create({ // 専用fixture設定に所有通知先を作るメソッド
            data: {
              id: ids[club],
              clubId: data.clubs[club].id,
              lineSettingId: scenario.line[club].id,
              lineGroupId: "F12_FAKE_GROUP_" + ids[club],
              targetRoles: ["MEMBER"],
              isEnabled: true,
            },
          });
        }
        await admin.goto(`/club/${data.clubs.a.slug}/admin/settings/line`); // 正規設定画面を開くメソッド
        const form = admin.locator('form:has(input[name="targetName"])'); // 正規通知先フォームを選ぶメソッド
        await form.locator('input[name="targetName"]').fill("F12境界更新"); // 正規の変更を入力するメソッド
        const action = await captureAction(admin, // 正規POST捕捉関数
          /**
           * 正規の設定保存Actionを発行する。
           */
          () => form.getByRole("button", { // 入力を受け取り操作・照合するコールバック / roleと表示名で要素を選ぶメソッド
            name: "設定を保存する",
            exact: true
          }).click(), // ボタン選択・操作コールバック
        );
        const clubs = [data.clubs.a.id, data.clubs.b.id];
        const before = await actionState(database, clubs, await operationsControl(scenario, { action: "read" })); // 比較関数 / 私有stub参照関数
        await postAction(admin, await editAction(action, {}, [ids.a, ids.b])); // B通知先IDへの編集・直接POST関数
        expect(await actionState(database, clubs, await operationsControl(scenario, { action: "read" }))).toBe(before); // 非更新比較関数 / 私有制御関数 / 期待値・比較メソッド
        await postAction(admin, action); // 正規A通知先更新対照を送信する関数
        expect((await database.clubLineTarget.findUniqueOrThrow({ where: { id: ids.a } })).targetName).toBe("F12境界更新"); // 正規結果取得・比較メソッド / 期待値関数
      },
    );
  },
);

/**
 * 実招待のcontext・tokenを書き換えた要求は、本人の正規承諾と分けて検証する。
 */
test("招待contextIdとtokenの改ざんは所属を作らず、正規の実Cookieだけが承諾できる", // E2E登録関数
  /**
   * 既存会員の正規招待入口を使い、生tokenやCookieは出力しない。
   */
  async ({ operations: scenario }) => { // 所有操作の検証コールバック
    test.setTimeout(60000); // 招待の複数実操作の期限を設定するメソッド
    await safeBoundary( // 固定例外境界関数
      /**
       * Bへ未所属のA MEMBERを招待し、正規nonceでの承諾を対照にする。
       */
      async () => { // 招待検証コールバック
        const { foreignAdmin, member, database, data } = scenario;
        await invite(scenario, foreignAdmin, "b", data.users.aMember.email); // B OWNERから既存会員へ正規招待する関数
        const link = await invitationLink(scenario, data.users.aMember.email, "b", "existing"); // 正規URLをメモリへ取得する関数
        await member.goto(link); // 正規のcontext Cookieを生成する入口へ移動するメソッド
        const action = await captureAction(member, // 承諾の実POST捕捉関数
          /**
           * 正規の既存アカウント用承諾を発行する。
           */
          () => member.getByRole("button", { // 入力を受け取り操作・照合するコールバック / roleと表示名で要素を選ぶメソッド
            name: "招待を承諾する",
            exact: true
          }).click(), // 正規ボタン選択・操作コールバック
        );
        const clubs = [data.clubs.a.id, data.clubs.b.id];
        const before = await actionState(database, clubs, await operationsControl(scenario, { action: "read" })); // 非更新比較関数 / 私有参照関数
        await postAction(member, await editAction(action, { contextId: randomUUID() })); // contextIdの改変・UUID生成・再送関数
        expect(await actionState(database, clubs, await operationsControl(scenario, { action: "read" }))).toBe(before); // 非更新比較関数 / 私有制御関数 / 期待値・比較メソッド
        const cookies = await member.context().cookies(); // 正規Cookieをメモリへ退避する取得メソッド
        const context = cookies.find( // 招待context Cookieだけを選ぶメソッド
          /**
           * Auth Cookieを変更せず招待のcontextだけを検証する。
           */
          (cookie) => cookie.name === "club-invitation-context", // 招待Cookie選択コールバック
        );
        expect(Boolean(context)).toBe(true); // 対象Cookieの存在を検証する関数・真偽値変換・比較メソッド
        const decoded = JSON.parse(Buffer.from(context!.value, "base64url").toString("utf8")); // 実contextをメモリ内で解析する関数・復号・文字列化メソッド
        expect(typeof decoded.tokenHash === "string").toBe(true); // 実contextのtoken契約を検証する関数・比較メソッド
        decoded.tokenHash = "0".repeat(64); // 架空の不正tokenへ置換するメソッド
        await member.context().addCookies([{ // Authは維持して招待Cookieだけを差し替えるメソッド
          ...context!,
          value: Buffer.from(JSON.stringify(decoded)).toString("base64url"), // 改変contextを符号化する関数・JSON化・文字列化メソッド
        }]);
        await postAction(member, action); // token改変要求の直接POST関数
        expect(await actionState(database, clubs, await operationsControl(scenario, { action: "read" }))).toBe(before); // 非更新比較関数 / 私有制御関数 / 期待値・比較メソッド
        await member.context().addCookies(cookies); // 正規contextをメモリから戻すメソッド
        await postAction(member, action); // 正規本人の承諾対照を送信する関数
        expect(await database.clubMembership.count({ // 期待値を検証する関数 / 所有条件の件数を取得するメソッド
          where: {
            clubId: data.clubs.b.id,
            userId: data.users.aMember.id,
            status: "ACTIVE"
          }
        })).toBe(1); // 正規所属の作成を検証する取得・比較メソッド / 期待値関数
      },
    );
  },
);
