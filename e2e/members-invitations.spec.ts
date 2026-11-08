// e2e/members-invitations.spec.ts
// OWNER管理と招待リンクを実Cookieで確認し、配送はローカルstubに限定する。

import {
  test, // 実Cookieを使うE2Eケースを登録する関数
  expect, // 期待値を生成する関数
  invite, // OWNERの実フォームから招待を送信しDB状態を検証する関数
  invitationLink, // 所有stubから一致する最新の招待URLを取得する関数
  invitationRecipientEmail, // 所有scopeに予約した招待先メールを返す関数
  replayAs, // 正規Actionを別本人の実Cookieで再送する関数
} from "./member-fixtures";

test("最後のACTIVE OWNERは通常UIでもdisabled改変でも失われない", // 実Cookieを使うE2Eケースを登録する関数
  /**
   * 唯一のOWNERの降格と停止を実フォームから試し、DB行が不変であることを確認する。
   */
  async ({ members }) => { // 所有する入力を受け取り操作・照合するコールバック
    try { // 所有する入力を受け取り操作・照合するコールバック
      const { admin, database, data } = members;
      const before = await database.clubMembership.findFirstOrThrow({ // 所有するDB行を取得し不在なら失敗するメソッド
        where: {
          id: data.actors.aOwner.membershipId,
          clubId: data.clubs.a.id,
        }
      });
      await admin.goto(`/club/${data.clubs.a.slug}/admin/members`); // 実画面へナビゲーションするメソッド
      await admin.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        hasText: data.users.aOwner.email
      })
        .getByRole("button", { // roleと表示名で要素を選ぶメソッド
          name: "権限・状態を変更",
          exact: true
        }).click(); // 正規のボタンを操作するメソッド
      const dialog = admin.getByRole("dialog"); // roleと表示名で要素を選ぶメソッド
      for (const violation of ["role", "status"] as const) { // 型を明示するアサーション / リテラル型を保持する指定
        const field = dialog.locator(`select[name="${violation}"]`); // フォーム・hidden値などの要素を選ぶメソッド
        const value = violation === "role" ? "MEMBER" : "SUSPENDED";
        await expect(field.locator(`option[value="${value}"]`)).toBeDisabled(); // 無効な選択肢であることを検証するメソッド / 期待値を生成する関数 / フォーム・hidden値などの要素を選ぶメソッド
        await field.evaluate( // 画面内で試験用のhidden値やdisabledを変更するメソッド
          /**
           * クライアントのdisabledだけを外し、Action側にも拒否判定があることを確認する。
           */
          (element) => { // 所有する入力を受け取り操作・照合するコールバック
            for (const option of element.querySelectorAll("option")) { // 画面内の対象要素を列挙するメソッド
              option.disabled = false;
            }
          },
        );
        await field.selectOption(value); // フォームの選択値を変更するメソッド
        await dialog.getByRole("button", { // roleと表示名で要素を選ぶメソッド
          name: "変更を保存する",
          exact: true
        }).click(); // 正規のボタンを操作するメソッド
        await expect(dialog.getByText("最後の有効なOWNERは降格・利用停止・退会扱いにできません。先に別のメンバーをOWNERに設定してください。", { // 期待値を生成する関数 / 固定の表示文で要素を選ぶメソッド
          exact: true
        })).toBeVisible(); // 画面表示を検証するメソッド
        expect(await database.clubMembership.findFirstOrThrow({ // 期待値を生成する関数 / 所有するDB行を取得し不在なら失敗するメソッド
          where: {
            id: before.id,
            clubId: before.clubId,
          }
        })).toEqual(before); // 構造と値の一致を検証するメソッド
        await dialog.locator('select[name="role"]').selectOption("OWNER"); // フォームの選択値を変更するメソッド / フォーム・hidden値などの要素を選ぶメソッド
        await dialog.locator('select[name="status"]').selectOption("ACTIVE"); // フォームの選択値を変更するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      }
      await dialog.getByRole("button", { // roleと表示名で要素を選ぶメソッド
        name: "キャンセル",
        exact: true
      }).click(); // 正規のボタンを操作するメソッド
      await admin.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        hasText: data.users.aMember.email
      })
        .getByRole("button", { // roleと表示名で要素を選ぶメソッド
          name: "権限・状態を変更",
          exact: true
        }).click(); // 正規のボタンを操作するメソッド
      await admin.getByRole("dialog").locator('select[name="role"]').selectOption("COACH"); // フォームの選択値を変更するメソッド / フォーム・hidden値などの要素を選ぶメソッド / roleと表示名で要素を選ぶメソッド
      await admin.getByRole("dialog").getByRole("button", { // roleと表示名で要素を選ぶメソッド
        name: "変更を保存する",
        exact: true
      }).click(); // 正規のボタンを操作するメソッド
      await expect(admin.getByRole("dialog")).toHaveCount(0); // DOM要素数を検証するメソッド / 期待値を生成する関数 / roleと表示名で要素を選ぶメソッド
      expect(await database.clubMembership.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          id: data.actors.aMember.membershipId,
          clubId: data.clubs.a.id,
          role: "COACH",
          status: "ACTIVE",
        }
      })).toBe(1); // 値の一致を検証するメソッド
    } catch {
      throw new Error("F12_MEMBER_CASE_FAILED"); // 秘密やURLを含めない固定例外のコンストラクター / 秘密を含めない固定例外のコンストラクター
    }
  },
);

test("MEMBERの直接招待Actionと、B membershipId付き更新の別Cookie再送を拒否する", // 実Cookieを使うE2Eケースを登録する関数
  /**
   * 正規OWNERの暗号化済みActionを実MEMBER Cookieで再送し、所属・招待の非更新を確認する。
   */
  async ({ members }) => { // 所有する入力を受け取り操作・照合するコールバック
    try { // 所有する入力を受け取り操作・照合するコールバック
      const { admin, member, foreignAdmin, database, data } = members;
      await member.goto(`/club/${data.clubs.a.slug}/admin/members`); // 実画面へナビゲーションするメソッド
      await expect(member.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached(); // DOMへの存在を検証するメソッド / 期待値を生成する関数 / 同じ属性の先頭要素を選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
      await admin.goto(`/club/${data.clubs.a.slug}/admin/members`); // 実画面へナビゲーションするメソッド
      const form = admin.locator("form").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        has: admin.locator('input[name="email"]') // フォーム・hidden値などの要素を選ぶメソッド
      });
      const email = invitationRecipientEmail(data.scopeId); // 所有scopeに予約した招待先メールを返す関数
      await form.locator('input[name="email"]').fill(email); // 架空の入力値を設定するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      await form.locator('input[name="name"]').fill("F12招待先"); // 【追加】必須の氏名を入力してActionのPOSTを発生させるlocator・入力メソッド
      await form.locator('select[name="role"]').selectOption("MEMBER"); // フォームの選択値を変更するメソッド / フォーム・hidden値などの要素を選ぶメソッド
      const invitations = await database.clubInvitation.findMany({ // 所有条件に合うDB行を取得するメソッド
        where: {
          clubId: data.clubs.a.id
        }
      });
      await replayAs(admin, member, // 正規Actionを別本人の実Cookieで再送する関数
        /**
         * 正規OWNERのフォームを送信するが、通信境界でMEMBER Cookieへ持ち替える。
         */
        () => form.getByRole("button", { // 所有する入力を受け取り操作・照合するコールバック / roleと表示名で要素を選ぶメソッド
          name: "招待メールを送信する",
          exact: true
        }).click(), // 正規のボタンを操作するメソッド
      );
      expect(await database.clubInvitation.findMany({ // 期待値を生成する関数 / 所有条件に合うDB行を取得するメソッド
        where: {
          clubId: data.clubs.a.id
        }
      })).toEqual(invitations); // 構造と値の一致を検証するメソッド
      const before = await database.clubMembership.findMany({ // 所有条件に合うDB行を取得するメソッド
        where: {
          clubId: data.clubs.b.id
        },
        orderBy: {
          id: "asc"
        }
      });
      await foreignAdmin.goto(`/club/${data.clubs.b.slug}/admin/members`); // 実画面へナビゲーションするメソッド
      await foreignAdmin.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        hasText: data.users.aOwner.email
      })
        .getByRole("button", { // roleと表示名で要素を選ぶメソッド
          name: "権限・状態を変更",
          exact: true
        }).click(); // 正規のボタンを操作するメソッド
      await foreignAdmin.getByRole("dialog").locator('select[name="role"]').selectOption("COACH"); // フォームの選択値を変更するメソッド / フォーム・hidden値などの要素を選ぶメソッド / roleと表示名で要素を選ぶメソッド
      await replayAs(foreignAdmin, admin, // 正規Actionを別本人の実Cookieで再送する関数
        /**
         * B OWNERの対象membershipIdを保持したActionを、B MEMBERの実Cookieで再送する。
         */
        () => foreignAdmin.getByRole("dialog").getByRole("button", { // 所有する入力を受け取り操作・照合するコールバック / roleと表示名で要素を選ぶメソッド
          name: "変更を保存する",
          exact: true
        }).click(), // 正規のボタンを操作するメソッド
      );
      expect(await database.clubMembership.findMany({ // 期待値を生成する関数 / 所有条件に合うDB行を取得するメソッド
        where: {
          clubId: data.clubs.b.id
        },
        orderBy: {
          id: "asc"
        }
      })).toEqual(before); // 構造と値の一致を検証するメソッド
    } catch {
      throw new Error("F12_MEMBER_CASE_FAILED"); // 秘密やURLを含めない固定例外のコンストラクター / 秘密を含めない固定例外のコンストラクター
    }
  },
);

test("新規招待を再送し、旧token・B slug・他人Cookieを拒否してから実Authで初回承諾する", // 実Cookieを使うE2Eケースを登録する関数
  /**
   * 予約した未確認Auth本人だけを使い、再送から実リンク・初回password設定までUIで接続する。
   */
  async ({ members }) => { // 所有する入力を受け取り操作・照合するコールバック
    try { // 所有する入力を受け取り操作・照合するコールバック
      const { admin, member, recipient, database, data } = members;
      const email = invitationRecipientEmail(data.scopeId); // 所有scopeに予約した招待先メールを返す関数
      await invite(members, admin, "a", email); // OWNERの実フォームから招待を送信しDB状態を検証する関数
      const original = await invitationLink(members, email, "a", "new"); // 所有stubから一致する最新の招待URLを取得する関数
      const before = await database.clubInvitation.findFirstOrThrow({ // 所有するDB行を取得し不在なら失敗するメソッド
        where: {
          clubId: data.clubs.a.id,
          email,
          status: "SENT"
        }
      });
      await database.clubInvitation.update({ // 所有行または試験用hashを更新するメソッド
        where: {
          id: before.id,
          clubId: before.clubId
        },
        data: {
          lastAttemptAt: new Date(Date.now() - 61_000), // 試験用の日時を表す型・コンストラクター / 現在の時刻をミリ秒で取得するメソッド
        }
      });
      await admin.reload(); // 更新済みの正規画面を再取得するメソッド
      await admin.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        hasText: email
      })
        .getByRole("button", { // roleと表示名で要素を選ぶメソッド
          name: "招待メールを再送する",
          exact: true
        }).click(); // 正規のボタンを操作するメソッド
      await expect(admin.getByText("招待メールを再送しました。", { // 期待値を生成する関数 / 固定の表示文で要素を選ぶメソッド
        exact: true
      })).toBeVisible(); // 画面表示を検証するメソッド
      const latest = await invitationLink(members, email, "a", "new"); // 所有stubから一致する最新の招待URLを取得する関数
      const oldDestination = new URL(new URL(original).searchParams.get("redirect_to")!); // URLをメモリ内で解析するコンストラクター / query項目を取得するメソッド
      oldDestination.pathname = "/club-invitations/accept";
      const validDestination = new URL(new URL(latest).searchParams.get("redirect_to")!); // URLをメモリ内で解析するコンストラクター / query項目を取得するメソッド
      validDestination.pathname = "/club-invitations/accept";
      const foreign = new URL(validDestination); // URLをメモリ内で解析するコンストラクター
      foreign.searchParams.set("clubSlug", data.clubs.b.slug); // query項目を単一値へ設定するメソッド
      for (const url of [oldDestination, foreign, validDestination]) {
        await member.goto(url.toString()); // 実画面へナビゲーションするメソッド / URL等を文字列にするメソッド
        await expect(member.getByRole("heading", { // 期待値を生成する関数 / roleと表示名で要素を選ぶメソッド
          name: "クラブ招待の承諾",
          exact: true
        })).toBeVisible(); // 画面表示を検証するメソッド
        await expect(member.getByRole("button", { // 期待値を生成する関数 / roleと表示名で要素を選ぶメソッド
          name: "招待を承諾する",
          exact: true
        })).toHaveCount(0); // DOM要素数を検証するメソッド
        expect(await database.clubInvitation.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
          where: {
            id: before.id,
            clubId: before.clubId,
            status: "SENT",
            acceptedAt: null
          }
        })).toBe(1); // 値の一致を検証するメソッド
      }
      const sameOrigin = await recipient.context().request.post("/auth/confirm", { // 【追加】Cookieなしの認証POSTで公開Originの認識を検証するメソッド
        headers: {
          origin: members.session.appOrigin,
          "sec-fetch-site": "same-origin",
        },
        data: {},
        maxRedirects: 0,
      });
      expect(sameOrigin.status()).toBe(400); // 【追加】Origin検査を通過し、招待context不足で拒否されることを検証する関数・メソッド
      const foreignOrigin = await recipient.context().request.post("/auth/confirm", { // 【追加】接続先は専用入口のままOrigin headerだけを偽装するメソッド
        headers: {
          origin: "https://foreign.invalid",
          "sec-fetch-site": "same-origin",
        },
        data: {},
        maxRedirects: 0,
      });
      expect(foreignOrigin.status()).toBe(403); // 【追加】異なるOriginは認証処理の前に拒否されることを検証する関数・メソッド
      await recipient.goto(latest); // 実画面へナビゲーションするメソッド
      await recipient.getByLabel("パスワード", { // labelに対応する入力を選ぶメソッド
        exact: true
      }).fill("F12-New-Recipient-Aa9!2026"); // 架空の入力値を設定するメソッド
      await recipient.getByLabel("パスワード（確認）", { // labelに対応する入力を選ぶメソッド
        exact: true
      }).fill("F12-New-Recipient-Aa9!2026"); // 架空の入力値を設定するメソッド
      await recipient.getByRole("button", { // roleと表示名で要素を選ぶメソッド
        name: "パスワードを設定して招待を承諾する",
        exact: true
      }).click(); // 正規のボタンを操作するメソッド
      await expect(recipient).toHaveURL(members.session.appOrigin + `/club/${data.clubs.a.slug}/events`); // 正規の遷移先を検証するメソッド / 期待値を生成する関数
      const accepted = await database.clubInvitation.findFirstOrThrow({ // 所有するDB行を取得し不在なら失敗するメソッド
        where: {
          id: before.id,
          clubId: before.clubId
        }
      });
      expect(accepted.status).toBe("ACCEPTED"); // 値の一致を検証するメソッド / 期待値を生成する関数
      expect(accepted.acceptedAt).not.toBeNull(); // nullとの一致を検証するメソッド / 期待値を生成する関数
      expect(await database.clubMembership.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          id: accepted.membershipId!,
          clubId: before.clubId,
          userId: accepted.authUserId!,
          role: "MEMBER",
          status: "ACTIVE",
        }
      })).toBe(1); // 値の一致を検証するメソッド
      expect(await database.appUser.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          id: accepted.authUserId!,
          email
        }
      })).toBe(1); // 値の一致を検証するメソッド
      expect(await database.clubMembership.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          clubId: data.clubs.b.id,
          userId: accepted.authUserId!
        }
      })).toBe(0); // 値の一致を検証するメソッド
    } catch {
      throw new Error("F12_MEMBER_CASE_FAILED"); // 秘密やURLを含めない固定例外のコンストラクター / 秘密を含めない固定例外のコンストラクター
    }
  },
);

test("既存ユーザーの招待取消と旧token拒否を確認し、再招待をpassword Cookieで承諾して複数所属になる", // 実Cookieを使うE2Eケースを登録する関数
  /**
   * B OWNERからA MEMBERへ招待し、取消後の新しい案内だけでB所属を有効化する。
   */
  async ({ members }) => { // 所有する入力を受け取り操作・照合するコールバック
    try { // 所有する入力を受け取り操作・照合するコールバック
      const { foreignAdmin, member, database, data } = members;
      const email = data.users.aMember.email;
      await invite(members, foreignAdmin, "b", email); // OWNERの実フォームから招待を送信しDB状態を検証する関数
      const old = await invitationLink(members, email, "b", "existing"); // 所有stubから一致する最新の招待URLを取得する関数
      await foreignAdmin.locator("li").filter({ // 条件に一致する要素だけを選ぶメソッド / フォーム・hidden値などの要素を選ぶメソッド
        hasText: email
      })
        .getByRole("button", { // roleと表示名で要素を選ぶメソッド
          name: "招待を取り消す",
          exact: true
        }).click(); // 正規のボタンを操作するメソッド
      await foreignAdmin.getByRole("dialog").getByRole("button", { // roleと表示名で要素を選ぶメソッド
        name: "招待を取り消す",
        exact: true
      }).click(); // 正規のボタンを操作するメソッド
      await expect(foreignAdmin.getByText("招待を取り消しました。", { // 期待値を生成する関数 / 固定の表示文で要素を選ぶメソッド
        exact: true
      })).toBeVisible(); // 画面表示を検証するメソッド
      await member.goto(old); // 実画面へナビゲーションするメソッド
      await expect(member.getByRole("heading", { // 期待値を生成する関数 / roleと表示名で要素を選ぶメソッド
        name: "クラブ招待の承諾",
        exact: true
      })).toBeVisible(); // 画面表示を検証するメソッド
      await expect(member.getByRole("button", { // 期待値を生成する関数 / roleと表示名で要素を選ぶメソッド
        name: "招待を承諾する",
        exact: true
      })).toHaveCount(0); // DOM要素数を検証するメソッド
      await invite(members, foreignAdmin, "b", email); // OWNERの実フォームから招待を送信しDB状態を検証する関数
      const link = await invitationLink(members, email, "b", "existing"); // 所有stubから一致する最新の招待URLを取得する関数
      const crossed = new URL(link); // URLをメモリ内で解析するコンストラクター
      crossed.searchParams.set("clubSlug", data.clubs.a.slug); // query項目を単一値へ設定するメソッド
      await member.goto(crossed.toString()); // 実画面へナビゲーションするメソッド / URL等を文字列にするメソッド
      await expect(member.getByRole("heading", { // 期待値を生成する関数 / roleと表示名で要素を選ぶメソッド
        name: "クラブ招待の承諾",
        exact: true
      })).toBeVisible(); // 画面表示を検証するメソッド
      await expect(member.getByRole("button", { // 期待値を生成する関数 / roleと表示名で要素を選ぶメソッド
        name: "招待を承諾する",
        exact: true
      })).toHaveCount(0); // DOM要素数を検証するメソッド
      expect(await database.clubMembership.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          clubId: data.clubs.b.id,
          userId: data.users.aMember.id,
          status: "ACTIVE",
        }
      })).toBe(0); // 値の一致を検証するメソッド
      await member.goto(link); // 実画面へナビゲーションするメソッド
      await member.getByRole("button", { // roleと表示名で要素を選ぶメソッド
        name: "招待を承諾する",
        exact: true
      }).click(); // 正規のボタンを操作するメソッド
      await expect(member).toHaveURL(members.session.appOrigin + `/club/${data.clubs.b.slug}/events`); // 正規の遷移先を検証するメソッド / 期待値を生成する関数
      expect(await database.clubMembership.count({ // 期待値を生成する関数 / 所有条件に合うDB行数を取得するメソッド
        where: {
          clubId: {
            in: [data.clubs.a.id, data.clubs.b.id]
          },
          userId: data.users.aMember.id,
          status: "ACTIVE",
        }
      })).toBe(2); // 値の一致を検証するメソッド
      await member.goto("/club/select"); // 実画面へナビゲーションするメソッド
      for (const club of ["a", "b"] as const) { // 型を明示するアサーション / リテラル型を保持する指定
        await expect(member.locator(`a[href="/club/${data.clubs[club].slug}/events"]`)).toBeVisible(); // 画面表示を検証するメソッド / 期待値を生成する関数 / フォーム・hidden値などの要素を選ぶメソッド
      }
    } catch {
      throw new Error("F12_MEMBER_CASE_FAILED"); // 秘密やURLを含めない固定例外のコンストラクター / 秘密を含めない固定例外のコンストラクター
    }
  },
);
