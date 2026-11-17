// e2e/account-children.spec.ts
// 保護者の実Cookieから氏名・子ども・複数クラブ所属と改ざん拒否を確認する。

import {
  randomUUID // 試験資源の識別用UUIDを生成する関数
} from "node:crypto";
import {
  test, // 実Cookieを使うE2Eケースを登録する関数
  expect, // 期待値を生成する関数
  confirmAccount, // 確認付きフォームから保存してダイアログ終了を待つ関数
  replayAs // 正規Actionを別本人の実Cookieで再送する関数
} from "./member-fixtures";

test("本人氏名と子どもの作成・編集・クラブ追加・退会をUIで行い、他クラブ所属を維持する", // 実Cookieを使うE2Eケースを登録する関数
  /**
   * A OWNERとB MEMBERを兼ねる保護者が、同じ子を両クラブで使う正当な操作を確認する。
   */
  async ({ members }) => { // 所有する入力を受け取り操作・照合するコールバック
    try { // 所有する入力を受け取り操作・照合するコールバック
      const { admin, database, data } = members;
      const name = "F12子ども-" + randomUUID(); // 試験資源の識別用UUIDを生成する関数
      await admin.goto(`/club/${data.clubs.a.slug}/account`); // 実画面へナビゲーションするメソッド
      const account = admin.locator("form").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: admin.locator('input[name="name"]') // フォーム・hidden値などの要素を選ぶメソッド
      }).filter({ // 条件に一致する要素だけを選ぶメソッド
        hasNot: admin.locator('select[name="grade"]') // フォーム・hidden値などの要素を選ぶメソッド
      });
      await account.locator('input[name="name"]').fill("F12本人名更新"); // 架空の入力値を設定するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      await confirmAccount(admin, account); // 確認付きフォームから保存してダイアログ終了を待つ関数
      expect(await database.appUser.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          id: data.users.aOwner.id,
          name: "F12本人名更新"
        }
      })).toBe(1); // 値の一致を検証するメソッド
      const create = admin.locator("form").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: admin.getByText("子どもを新しく登録", { // 固定の表示文で要素を選ぶメソッド
          exact: true
        })
      });
      await create.locator('input[name="name"]').fill(name); // 架空の入力値を設定するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      await create.locator('select[name="grade"]').selectOption("ELEMENTARY_3"); // フォームの選択値を変更するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      await confirmAccount(admin, create); // 確認付きフォームから保存してダイアログ終了を待つ関数
      const child = await database.child.findFirstOrThrow({ // 所有するDB行を取得し不在なら失敗するメソッド
        where: {
          parentId: data.users.aOwner.id,
          name
        }
      });
      const item = admin.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: admin.locator(`input[name="childId"][value="${child.id}"]`) // フォーム・hidden値などの要素を選ぶメソッド
      });
      const edit = item.locator("form").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: admin.locator('select[name="grade"]') // 【修正】候補form内を基準に学年欄を探すメソッド
      });
      await expect(edit).toHaveCount(1); // 【追加】編集フォームが1件に絞れていることを検証する関数・メソッド
      await edit.locator('input[name="name"]').fill(name + "編集"); // 架空の入力値を設定するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      await edit.locator('select[name="grade"]').selectOption("ELEMENTARY_4"); // フォームの選択値を変更するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      await confirmAccount(admin, edit); // 確認付きフォームから保存してダイアログ終了を待つ関数
      expect(await database.child.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          id: child.id,
          parentId: child.parentId,
          name: name + "編集",
          grade: "ELEMENTARY_4"
        }
      })).toBe(1); // 値の一致を検証するメソッド
      await admin.goto(`/club/${data.clubs.b.slug}/account`); // 実画面へナビゲーションするメソッド
      await admin.getByRole("button", { // roleと表示名で要素を選ぶメソッド
        name: "登録済みの子どもを現在クラブへ追加",
        exact: true
      }).click(); // 正規のボタンを操作するメソッド
      const candidate = admin.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: admin.locator(`input[name="childId"][value="${child.id}"]`) // フォーム・hidden値などの要素を選ぶメソッド
      });
      await candidate.getByRole("button", { // roleと表示名で要素を選ぶメソッド
        name: "現在クラブへ追加する",
        exact: true
      }).click(); // 正規のボタンを操作するメソッド
      await admin.getByRole("dialog").getByRole("button", { // roleと表示名で要素を選ぶメソッド
        name: "現在クラブへ追加する",
        exact: true
      }).click(); // 正規のボタンを操作するメソッド
      await expect(admin.getByRole("dialog")).toHaveCount(0); // DOM要素数を検証するメソッド / 期待値を生成する関数 / roleと表示名で要素を選ぶメソッド
      expect(await database.childClubMembership.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          childId: child.id,
          parentUserId: child.parentId,
          status: "ACTIVE",
          clubId: {
            in: [data.clubs.a.id, data.clubs.b.id]
          }
        }
      })).toBe(2); // 値の一致を検証するメソッド
      await admin.goto(`/club/${data.clubs.a.slug}/account`); // 実画面へナビゲーションするメソッド
      const added = admin.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: admin.locator(`input[name="childId"][value="${child.id}"]`) // フォーム・hidden値などの要素を選ぶメソッド
      });
      await added.getByRole("button", { // roleと表示名で要素を選ぶメソッド
        name: "現在クラブから外す",
        exact: true
      }).click(); // 正規のボタンを操作するメソッド
      await admin.getByRole("dialog").getByRole("button", { // roleと表示名で要素を選ぶメソッド
        name: "現在クラブから外す",
        exact: true
      }).click(); // 正規のボタンを操作するメソッド
      await expect(admin.getByRole("dialog")).toHaveCount(0); // DOM要素数を検証するメソッド / 期待値を生成する関数 / roleと表示名で要素を選ぶメソッド
      expect(await database.childClubMembership.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          childId: child.id,
          clubId: data.clubs.a.id,
          status: "WITHDRAWN"
        }
      })).toBe(1); // 値の一致を検証するメソッド
      expect(await database.childClubMembership.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          childId: child.id,
          clubId: data.clubs.b.id,
          status: "ACTIVE"
        }
      })).toBe(1); // 値の一致を検証するメソッド
      expect(await database.child.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          id: child.id,
          parentId: child.parentId
        }
      })).toBe(1); // 値の一致を検証するメソッド
    } catch {
      throw new Error("F12_MEMBER_CASE_FAILED"); // 秘密やURLを含めない固定例外のコンストラクター / 秘密を含めない固定例外のコンストラクター
    }
  },
);

test("他保護者childIdとhidden clubId・parentId・B membershipIdの混入で他人行を変更できない", // 実Cookieを使うE2Eケースを登録する関数
  /**
   * 編集bind対象とhidden値の照合、認可由来clubId・parentIdの採用を実フォームで確認する。
   */
  async ({ members }) => { // 所有する入力を受け取り操作・照合するコールバック
    try { // 所有する入力を受け取り操作・照合するコールバック
      const { admin, database, data } = members;
      const owned = await database.child.create({ // 試験所有のDB行を作成するメソッド
        data: {
          parentId: data.users.aOwner.id,
          name: "F12本人子ども",
          grade: "ELEMENTARY_2",
          clubMemberships: {
            create: {
              clubId: data.clubs.a.id
            }
          },
        }
      });
      const foreign = await database.child.create({ // 試験所有のDB行を作成するメソッド
        data: {
          parentId: data.users.bOwner.id,
          name: "F12別保護者の子ども",
          grade: "ELEMENTARY_5",
          clubMemberships: {
            create: {
              clubId: data.clubs.b.id
            }
          },
        },
        include: {
          clubMemberships: true
        }
      });
      await admin.goto(`/club/${data.clubs.a.slug}/account`); // 実画面へナビゲーションするメソッド
      const item = admin.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: admin.locator(`input[name="childId"][value="${owned.id}"]`) // フォーム・hidden値などの要素を選ぶメソッド
      });
      const form = item.locator("form").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: admin.locator('select[name="grade"]') // 【修正】候補form内を基準に学年欄を探すメソッド
      });
      await expect(form).toHaveCount(1); // 【追加】編集フォームが1件に絞れていることを検証する関数・メソッド
      await form.locator('input[name="name"]').fill("F12不正な変更"); // 【修正】Reactの入力更新を先に完了するlocator・入力メソッド
      await form.evaluate( // 【修正】フォームの送信データ生成へ一度だけ介入するメソッド
        /**
         * 【修正】再描画で戻るDOM値ではなく、確認ダイアログへ保存するFormDataを改ざんする。
         */
        (element, id) => { // 【修正】対象フォームと他保護者の子IDを受け取るコールバック
          const target = element as HTMLFormElement; // 【追加】対象をフォーム要素として扱う型アサーション
          target.addEventListener( // 【追加】FormData生成時のイベントを監視するメソッド
            "formdata",
            /**
             * 【追加】確認フォームが生成した送信データのchildIdだけを他保護者のIDへ変更する。
             */
            (event) => { // 【追加】生成したFormDataを持つイベントを受け取るコールバック
              event.formData.set("childId", id); // 【追加】送信データ内の対象IDを単一値へ置き換えるメソッド
            },
            {
              once: true,
            },
          );
        },
        foreign.id,
      );
      await confirmAccount(admin, form); // 確認付きフォームから保存してダイアログ終了を待つ関数
      await expect(form.getByText("対象の子どもを選び直してください。", { // 期待値を生成する関数 / 固定の表示文で要素を選ぶメソッド
        exact: true
      })).toBeVisible(); // 画面表示を検証するメソッド
      expect(await database.child.findFirstOrThrow({ // 期待値を生成する関数 / 所有するDB行を取得し不在なら失敗するメソッド
        where: {
          id: foreign.id,
          parentId: foreign.parentId
        },
        include: {
          clubMemberships: true
        }
      })).toEqual(foreign); // 構造と値の一致を検証するメソッド
      expect(await database.child.findFirstOrThrow({ // 期待値を生成する関数 / 所有するDB行を取得し不在なら失敗するメソッド
        where: {
          id: owned.id,
          parentId: owned.parentId
        }
      })).toEqual(owned); // 構造と値の一致を検証するメソッド
      await admin.reload(); // 更新済みの正規画面を再取得するメソッド
      const create = admin.locator("form").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: admin.getByText("子どもを新しく登録", { // 固定の表示文で要素を選ぶメソッド
          exact: true
        })
      });
      await create.locator('input[name="name"]').fill("F12認可由来の子ども"); // 架空の入力値を設定するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      await create.locator('select[name="grade"]').selectOption("ELEMENTARY_1"); // フォームの選択値を変更するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      await create.evaluate( // 画面内で試験用のhidden値やdisabledを変更するメソッド
        /**
         * 正規フォームへB側IDを追加しても、本人・現在クラブを変更できないことを確認する。
         */
        (element, ids) => { // 所有する入力を受け取り操作・照合するコールバック
          for (const [name, value] of Object.entries(ids)) { // 辞書のキーと値を列挙する関数
            const input = document.createElement("input"); // 試験用のhidden入力要素を生成するメソッド
            input.type = "hidden";
            input.name = name;
            input.value = value;
            element.appendChild(input); // 試験フォームへhidden入力を追加するメソッド
          }
        }, {
        clubId: data.clubs.b.id,
        parentId: data.users.bOwner.id,
        membershipId: data.actors.bOwner.membershipId,
      },
      );
      await confirmAccount(admin, create); // 確認付きフォームから保存してダイアログ終了を待つ関数
      const created = await database.child.findFirstOrThrow({ // 所有するDB行を取得し不在なら失敗するメソッド
        where: {
          name: "F12認可由来の子ども",
          parentId: data.users.aOwner.id
        },
        include: {
          clubMemberships: true
        }
      });
      expect(created.clubMemberships.length).toBe(1); // 値の一致を検証するメソッド / 期待値を生成する関数
      expect(created.clubMemberships[0].clubId).toBe(data.clubs.a.id); // 値の一致を検証するメソッド / 期待値を生成する関数
      expect(created.clubMemberships[0].parentUserId).toBe(data.users.aOwner.id); // 値の一致を検証するメソッド / 期待値を生成する関数
      expect(await database.child.findFirstOrThrow({ // 期待値を生成する関数 / 所有するDB行を取得し不在なら失敗するメソッド
        where: {
          id: foreign.id,
          parentId: foreign.parentId
        },
        include: {
          clubMemberships: true
        }
      })).toEqual(foreign); // 構造と値の一致を検証するメソッド
    } catch {
      throw new Error("F12_MEMBER_CASE_FAILED"); // 秘密やURLを含めない固定例外のコンストラクター / 秘密を含めない固定例外のコンストラクター
    }
  },
);

test("他保護者の正規編集Actionを本人Cookieで再送しても対象childIdを変更しない", // 実Cookieを使うE2Eケースを登録する関数
  /**
   * hiddenとbindの両方が正しい他人のActionでも、RepositoryのparentId照合で拒否する。
   */
  async ({ members }) => { // 所有する入力を受け取り操作・照合するコールバック
    try { // 所有する入力を受け取り操作・照合するコールバック
      const { admin, member, database, data } = members;
      const child = await database.child.create({ // 試験所有のDB行を作成するメソッド
        data: {
          parentId: data.users.aMember.id,
          name: "F12別保護者A",
          grade: "ELEMENTARY_2",
          clubMemberships: {
            create: {
              clubId: data.clubs.a.id
            }
          },
        },
        include: {
          clubMemberships: true
        }
      });
      await member.goto(`/club/${data.clubs.a.slug}/account`); // 実画面へナビゲーションするメソッド
      const item = member.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: member.locator(`input[name="childId"][value="${child.id}"]`) // フォーム・hidden値などの要素を選ぶメソッド
      });
      const form = item.locator("form").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: member.locator('select[name="grade"]') // 【修正】候補form内を基準に学年欄を探すメソッド
      });
      await expect(form).toHaveCount(1); // 【追加】編集フォームが1件に絞れていることを検証する関数・メソッド
      await form.locator('input[name="name"]').fill("F12許可されない編集"); // 架空の入力値を設定するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      await replayAs(member, admin, // 正規Actionを別本人の実Cookieで再送する関数
        /**
         * 正規保護者のフォーム送信を、同じクラブの別保護者Cookieへ持ち替える。
         */
        async () => { // 所有する入力を受け取り操作・照合するコールバック
          await form.getByRole("button", { // roleと表示名で要素を選ぶメソッド
            name: "確認して保存",
            exact: true
          }).click(); // 正規のボタンを操作するメソッド
          await member.getByRole("dialog").getByRole("button", { // roleと表示名で要素を選ぶメソッド
            name: "保存する",
            exact: true
          }).click(); // 正規のボタンを操作するメソッド
        },
      );
      expect(await database.child.findFirstOrThrow({ // 期待値を生成する関数 / 所有するDB行を取得し不在なら失敗するメソッド
        where: {
          id: child.id,
          parentId: child.parentId
        },
        include: {
          clubMemberships: true
        }
      })).toEqual(child); // 構造と値の一致を検証するメソッド
      await member.goto(`/club/${data.clubs.a.slug}/account`); // 実画面へナビゲーションするメソッド
      const withdrawal = member.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: member.locator(`input[name="childId"][value="${child.id}"]`) // フォーム・hidden値などの要素を選ぶメソッド
      });
      await replayAs(member, admin, // 正規Actionを別本人の実Cookieで再送する関数
        /**
         * 他保護者の正規退会Actionも別の実Cookieで送信し、子どもの所属を維持する。
         */
        async () => { // 所有する入力を受け取り操作・照合するコールバック
          await withdrawal.getByRole("button", { // roleと表示名で要素を選ぶメソッド
            name: "現在クラブから外す",
            exact: true
          }).click(); // 正規のボタンを操作するメソッド
          await member.getByRole("dialog").getByRole("button", { // roleと表示名で要素を選ぶメソッド
            name: "現在クラブから外す",
            exact: true
          }).click(); // 正規のボタンを操作するメソッド
        },
      );
      expect(await database.child.findFirstOrThrow({ // 期待値を生成する関数 / 所有するDB行を取得し不在なら失敗するメソッド
        where: {
          id: child.id,
          parentId: child.parentId
        },
        include: {
          clubMemberships: true
        }
      })).toEqual(child); // 構造と値の一致を検証するメソッド
    } catch {
      throw new Error("F12_MEMBER_CASE_FAILED"); // 秘密やURLを含めない固定例外のコンストラクター / 秘密を含めない固定例外のコンストラクター
    }
  },
);
