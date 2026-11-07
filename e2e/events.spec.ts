// e2e/events.spec.ts
// イベントの実画面操作を、DB・private Storage・別contextの再表示へつなげる。

import {
  CLUB_ATTACHMENT_BUCKET, // 【追加】クラブ添付PDFを保存するprivate bucketの名前
} from "../src/infrastructure/storage/club-attachment-storage-constants";
import {
  Buffer // PDF・暗号文のバイト列を扱うクラス / PDF・暗号文を扱うバイト列の型
} from "node:buffer";
import {
  test, // 所有fixture付きのE2Eケースを登録する関数
  expect, // 期待値を生成する関数
  contentRow, // 所有クラブとcontent IDでDB行を取得する関数
  contentAttachments, // 所有クラブと親IDで添付を取得する関数
  storageNames, // 所有prefixのStorage object名を照会する関数
  memberList, // 新規ナビゲーションで会員一覧を再取得する関数
  contentDenied, // Streamingを含む404 UIとnoindexを検証する関数
} from "./content-fixtures";
import {
  createMvpFixturePdf // 小さなPDFをメモリ上で生成する関数
} from "../tests/mvp/local-services-fixture";

const KIND = "events" as const; // content種別のリテラル型を保持する型アサーション / 検証済みの値の型を明示する型アサーション / constの参照型

/**
 * 下書き・公開・既読・再確認・対象role・削除の画面表示とDB状態を照合する。
 */
test("イベントの下書きから削除まで別contextの一覧・詳細・未読表示が更新される", // E2Eケースを登録する関数
  /**
   * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
   */
  async ({ content }) => { // 所有する入力を受け取る検証コールバック
    test.setTimeout(60000); // ケースの実行期限を設定するメソッド
    const { admin, member, title, database, data } = content;
    await content.prepare(KIND); // 正規の新規作成フォームへ架空の入力値を設定する関数
    await admin.locator('input[name="status"][value="DRAFT"]').check(); // 対象のcheckbox・radioを有効にするメソッド / 入力名・href等で対象要素を選ぶメソッド
    await content.save(); // 正規の保存操作と一覧への遷移を確認する関数
    const id = await content.identify(KIND); // 所有クラブと題名から作成されたcontent IDを照合する関数
    expect((await contentRow(content, KIND, id))?.status).toBe("DRAFT"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 所有クラブとcontent IDでDB行を取得する関数
    await memberList(content, KIND); // 新規ナビゲーションで会員一覧を再取得する関数
    await expect(member.getByRole("heading", { // 期待値を生成する関数 / roleと名前で対象を選ぶメソッド
      name: title,
      exact: true
    })).toHaveCount(0); // DOM要素の件数を検証するメソッド
    await contentDenied(member, content.path(KIND, `/${id}`)); // Streamingを含む404 UIとnoindexを検証する関数 / 所有クラブの会員・管理URLを生成する関数
    await admin.goto(content.path(KIND, `/${id}/edit`, "a", true)); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
    await admin.locator('input[name="status"][value="PUBLISHED"]').check(); // 対象のcheckbox・radioを有効にするメソッド / 入力名・href等で対象要素を選ぶメソッド
    await admin.locator('input[name="shouldMarkAsUnread"]').check(); // 対象のcheckbox・radioを有効にするメソッド / 入力名・href等で対象要素を選ぶメソッド
    await content.save(); // 正規の保存操作と一覧への遷移を確認する関数
    const published = await contentRow(content, KIND, id); // 所有クラブとcontent IDでDB行を取得する関数
    expect(published?.status).toBe("PUBLISHED"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(published?.firstPublishedAt instanceof Date).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 公開・既読基準の日時を扱うDateコンストラクター
    await memberList(content, KIND); // 新規ナビゲーションで会員一覧を再取得する関数
    const card = member.locator("article").filter({ // 対象条件を満たす要素だけを選ぶメソッド / 入力名・href等で対象要素を選ぶメソッド
      has: member.getByRole("heading", { // roleと名前で対象を選ぶメソッド
        name: title,
        exact: true
      })
    });
    await expect(card.getByText("未読", { // 期待値を生成する関数 / 固定の表示文を選ぶメソッド
      exact: true
    })).toBeVisible(); // 画面表示を検証するメソッド
    await member.goto(content.path(KIND, `/${id}`)); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
    await expect(member.getByRole("heading", { // 期待値を生成する関数 / roleと名前で対象を選ぶメソッド
      name: title,
      exact: true
    })).toBeVisible(); // 画面表示を検証するメソッド
    await expect.poll(// 非同期の終端結果を待って検証するメソッド
      /**
       * 非同期処理の終端状態をDBまたは画面から読み取り、固定待機せず検証する。
       */
      async () => { // 所有する入力を受け取る検証コールバック
        return await database.clubEventRead.count({ // 所有条件に合う行数を取得するメソッド
          where: {
            clubId: data.clubs.a.id,
            eventId: id,
            membershipId: data.actors.aMember.membershipId
          },
        });
      }).toBe(1); // 値の一致を検証するメソッド
    await memberList(content, KIND); // 新規ナビゲーションで会員一覧を再取得する関数
    await expect(card.getByText("未読", { // 期待値を生成する関数 / 固定の表示文を選ぶメソッド
      exact: true
    })).toHaveCount(0); // DOM要素の件数を検証するメソッド
    await admin.goto(content.path(KIND, `/${id}/edit`, "a", true)); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
    await admin.locator('input[name="title"]').fill(title + "-更新"); // テスト用の入力値を設定するメソッド / 入力名・href等で対象要素を選ぶメソッド
    await admin.locator('input[name="shouldMarkAsUnread"]').check(); // 対象のcheckbox・radioを有効にするメソッド / 入力名・href等で対象要素を選ぶメソッド
    await content.save(); // 正規の保存操作と一覧への遷移を確認する関数
    expect((await contentRow(content, KIND, id))?.readRequiredAt?.getTime()).toBeGreaterThan( // 新しい未読基準時刻を検証するメソッド / 期待値を生成する関数 / 日時の数値を取得するメソッド / 所有クラブとcontent IDでDB行を取得する関数
      published?.readRequiredAt?.getTime() ?? 0, // 日時の数値を取得するメソッド
    );
    await memberList(content, KIND); // 新規ナビゲーションで会員一覧を再取得する関数
    const updated = member.locator("article").filter({ // 対象条件を満たす要素だけを選ぶメソッド / 入力名・href等で対象要素を選ぶメソッド
      has: member.getByRole("heading", { // roleと名前で対象を選ぶメソッド
        name: title + "-更新",
        exact: true
      })
    });
    await expect(updated.getByText("未読", { // 期待値を生成する関数 / 固定の表示文を選ぶメソッド
      exact: true
    })).toBeVisible(); // 画面表示を検証するメソッド
    await member.goto(content.path(KIND, `/${id}`)); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
    await expect(member.getByRole("heading", { // 期待値を生成する関数 / roleと名前で対象を選ぶメソッド
      name: title + "-更新",
      exact: true
    })).toBeVisible(); // 画面表示を検証するメソッド
    const memo = member.locator('textarea[name="content"]'); // 入力名・href等で対象要素を選ぶメソッド
    await memo.evaluate(// テスト画面内で偽の所属入力を追加するメソッド
      /**
       * テスト画面のフォームに偽の所属IDを挿入し、本人性の検証へ使用する。
       */
      (element, // 所有する入力を受け取る検証コールバック
        foreignMembershipId) => {
        const form = element.closest("form"); // 対象が属するフォームを取得するメソッド
        if (!form) {
          throw new Error("F12_CONTENT_MEMO_FORM_MISSING"); // 秘密を含めない固定例外のコンストラクター
        }
        const field = document.createElement("input"); // 偽の入力を検証するhidden要素を生成するメソッド
        field.type = "hidden";
        field.name = "membershipId";
        field.value = foreignMembershipId;
        form.append(field); // 偽の所属IDをフォームへ追加するメソッド
      }, data.actors.aOwner.membershipId);
    await memo.fill("F12本人だけのメモ"); // テスト用の入力値を設定するメソッド
    await member.getByRole("button", { // roleと名前で対象を選ぶメソッド
      name: "メモを保存",
      exact: true
    }).click(); // 正規のボタンを操作するメソッド
    await expect(member.getByText("個人メモを保存しました。", { // 期待値を生成する関数 / 固定の表示文を選ぶメソッド
      exact: true
    })).toBeVisible(); // 画面表示を検証するメソッド
    const rows = await database.clubEventMemo.findMany({ // 条件に合う所有行を取得するメソッド
      where: {
        clubId: data.clubs.a.id,
        eventId: id
      }
    });
    expect(rows.length).toBe(1); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(rows[0].membershipId === data.actors.aMember.membershipId).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数
    await admin.goto(content.path(KIND, `/${id}`)); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
    await expect(admin.locator('textarea[name="content"]')).toHaveValue(""); // フォームに復元された値を検証するメソッド / 期待値を生成する関数 / 入力名・href等で対象要素を選ぶメソッド
    await member.reload(); // 正規画面を新規取得して保存値を確認するメソッド
    await expect(member.locator('textarea[name="content"]')).toHaveValue("F12本人だけのメモ"); // フォームに復元された値を検証するメソッド / 期待値を生成する関数 / 入力名・href等で対象要素を選ぶメソッド
    await admin.goto(content.path(KIND, `/${id}/edit`, "a", true)); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
    await admin.locator('input[name="targetRoles"][value="MEMBER"]').uncheck(); // 公開対象のcheckboxを外すメソッド / 入力名・href等で対象要素を選ぶメソッド
    await content.save(); // 正規の保存操作と一覧への遷移を確認する関数
    await memberList(content, KIND); // 新規ナビゲーションで会員一覧を再取得する関数
    await expect(member.getByRole("heading", { // 期待値を生成する関数 / roleと名前で対象を選ぶメソッド
      name: title + "-更新",
      exact: true
    })).toHaveCount(0); // DOM要素の件数を検証するメソッド
    await contentDenied(member, content.path(KIND, `/${id}`)); // Streamingを含む404 UIとnoindexを検証する関数 / 所有クラブの会員・管理URLを生成する関数
    await content.remove(KIND, id); // 正規の削除確認画面からActionを実行する関数
    expect(await contentRow(content, KIND, id)).toBeNull(); // DB行の不存在を検証するメソッド / 期待値を生成する関数 / 所有クラブとcontent IDでDB行を取得する関数
    await admin.goto(content.path(KIND, "/list?date=2026-06-10&status=ALL", "a", true)); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
    await expect(admin.getByRole("heading", { // 期待値を生成する関数 / roleと名前で対象を選ぶメソッド
      name: title + "-更新",
      exact: true
    })).toHaveCount(0); // DOM要素の件数を検証するメソッド
  });

/**
 * 実PDFをアップロードし、会員Routeの署名・private拒否・実バイト列・削除を検証する。
 */
test("イベントのprivate PDFを会員Routeで取得し、公開URLは拒否される", // E2Eケースを登録する関数
  /**
   * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
   */
  async ({ content }) => { // 所有する入力を受け取る検証コールバック
    const { admin, member } = content;
    const pdf = Buffer.from(createMvpFixturePdf()); // 入力をバイト列へ変換する関数 / 小さなPDFをメモリ上で生成する関数
    await content.prepare(KIND); // 正規の新規作成フォームへ架空の入力値を設定する関数
    await admin.locator('input[name="status"][value="PUBLISHED"]').check(); // 対象のcheckbox・radioを有効にするメソッド / 入力名・href等で対象要素を選ぶメソッド
    await admin.locator('input[name="attachmentFiles"]').setInputFiles({ // メモリ内PDFを実フォームに設定するメソッド / 入力名・href等で対象要素を選ぶメソッド
      name: "f12.pdf",
      mimeType: "application/pdf",
      buffer: pdf
    });
    await content.save(); // 正規の保存操作と一覧への遷移を確認する関数
    const id = await content.identify(KIND); // 所有クラブと題名から作成されたcontent IDを照合する関数
    const attachments = await contentAttachments(content, KIND, id); // 所有クラブと親IDで添付を取得する関数
    expect(attachments.length).toBe(1); // 値の一致を検証するメソッド / 期待値を生成する関数
    const attachment = attachments[0];
    const route = `/club/${content.data.clubs.a.slug}/attachments/event/${attachment.id}`;
    await member.goto(content.path(KIND, `/${id}`)); // 新規ナビゲーションで正規画面を取得するメソッド / 所有クラブの会員・管理URLを生成する関数
    await expect(member.locator(`a[href="${route}"]`)).toBeVisible(); // 画面表示を検証するメソッド / 期待値を生成する関数 / 入力名・href等で対象要素を選ぶメソッド
    const adminRoute = `/club/${content.data.clubs.a.slug}/admin/attachments/event/${attachment.id}`;
    const adminResponse = await admin.context().request.get(adminRoute, { // 所有する画面・PDFへGET要求するメソッド / そのpageの独立contextを取得するメソッド
      maxRedirects: 0
    });
    expect(adminResponse.status()).toBe(307); // 値の一致を検証するメソッド / 期待値を生成する関数 / HTTP状態を取得するメソッド
    const deniedAdmin = await member.context().request.get(adminRoute, { // 所有する画面・PDFへGET要求するメソッド / そのpageの独立contextを取得するメソッド
      maxRedirects: 0
    });
    expect(deniedAdmin.status()).toBe(404); // 値の一致を検証するメソッド / 期待値を生成する関数 / HTTP状態を取得するメソッド
    expect(deniedAdmin.headers().location === undefined).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 要求または応答のheaderをメモリ内だけで取得するメソッド
    const response = await member.context().request.get(route, { // 所有する画面・PDFへGET要求するメソッド / そのpageの独立contextを取得するメソッド
      maxRedirects: 0
    });
    expect(response.status()).toBe(307); // 値の一致を検証するメソッド / 期待値を生成する関数 / HTTP状態を取得するメソッド
    const signed = new URL(response.headers().location); // 所有する接続URLを解析するコンストラクター / 要求または応答のheaderをメモリ内だけで取得するメソッド
    expect(signed.origin === process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(signed.pathname === `/storage/v1/object/sign/${CLUB_ATTACHMENT_BUCKET}/${attachment.storagePath}`).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数
    const token = JSON.parse(Buffer.from((signed.searchParams.get("token") ?? "").split(".")[1], "base64url").toString()); // 構造またはJSONを検証・解析するメソッド / バイト列を文字列へ変換するメソッド / 入力をバイト列へ変換する関数 / 区切りで文字列を分割するメソッド / 所有する画面・PDFへGET要求するメソッド
    expect(token.exp - token.iat).toBe(300); // 値の一致を検証するメソッド / 期待値を生成する関数
    const fetched = await member.evaluate( // 実ブラウザーで会員Routeから署名先までPDFを取得するメソッド / 実ブラウザーで会員RouteからPDFを取得するメソッド
      /**
       * Cookieを保持する会員ブラウザーで実PDFを取得し、署名URLを返さずバイト列だけを比較する。
       */
      async (path) => { // 会員Routeのpathを受け取る検証コールバック / 所有する入力を受け取る検証コールバック
        const response = await fetch(path, { // 会員の実Cookieで同一originの添付Routeを要求する関数 / 所有するloopbackへ要求する関数
          credentials: "same-origin",
          redirect: "follow",
        });
        return {
          status: response.status,
          bytes: Array.from(new Uint8Array(await response.arrayBuffer())), // 配列へ変換する関数 / バイト列コンストラクター / PDF本体を取得するメソッド / バイト列を比較用配列へ変換する関数 / PDFのバイト列を扱うコンストラクター / PDF本体をバイト列として取得するメソッド
        };
      },
      route,
    );
    expect(fetched.status).toBe(200); // 期待値生成関数 / 実ブラウザーによるPDF取得成功を検証するメソッド / 値の一致を検証するメソッド / 期待値を生成する関数
    expect(Buffer.compare(Buffer.from(fetched.bytes), pdf)).toBe(0); // 期待値生成関数 / バイト列の比較関数 / ブラウザーの配列をBufferへ変換する関数 / 一致の検証メソッド / 値の一致を検証するメソッド / 期待値を生成する関数 / PDFのバイト列を比較する関数 / 入力をバイト列へ変換する関数
    const publicStatus = await member.evaluate( // 【修正】HTTP proxyの許可経路を実ブラウザーで確認するメソッド
      /**
       * 【追加】署名もアプリ認証情報も付けず公開URLを要求し、Storage自身が拒否することを確認する。
       */
      async (url) => { // 【追加】固定ローカルoriginの公開URLを受け取る検証コールバック
        const response = await fetch(url, { // 【追加】実ブラウザーで公開URLへ未認証GETする関数
          credentials: "omit",
          redirect: "error",
        });
        return response.status;
      },
      `${signed.origin}/storage/v1/object/public/${CLUB_ATTACHMENT_BUCKET}/${attachment.storagePath}`,
    );
    expect([400, 404].includes(publicStatus)).toBe(true); // 【修正】期待値生成関数 / Storageの公開拒否状態を照合するメソッド / 真偽値を検証するメソッド
    await content.remove(KIND, id); // 正規の削除確認画面からActionを実行する関数
    await expect.poll(// 非同期の終端結果を待って検証するメソッド
      /**
       * 非同期処理の終端状態をDBまたは画面から読み取り、固定待機せず検証する。
       */
      async () => (await storageNames(content, KIND)).includes(attachment.storagePath)).toBe(false); // 値の一致を検証するメソッド / 所有する入力を受け取る検証コールバック / 固定条件・所有pathとの一致を調べるメソッド / 所有prefixのStorage object名を照会する関数
  });

/**
 * 2枚目の実SDK uploadだけを失敗させ、DB未作成と1枚目の実補償削除を照合する。
 */
test("イベントの2枚目upload失敗ではDBを作らず先行PDFを補償する", // E2Eケースを登録する関数
  /**
   * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
   */
  async ({ content }) => { // 所有する入力を受け取る検証コールバック
    const before = await storageNames(content, KIND); // 所有prefixのStorage object名を照会する関数
    await content.control({ // 同じrunのsecretで所有stubを制御する関数
      action: "configure",
      channel: "storage",
      mode: "server-error",
      method: "POST",
      match: "prefix",
      skip: 1,
      path: `/storage/v1/object/${CLUB_ATTACHMENT_BUCKET}/clubs/${content.data.clubs.a.id}/events/`,
    });
    await content.prepare(KIND); // 正規の新規作成フォームへ架空の入力値を設定する関数
    const pdf = Buffer.from(createMvpFixturePdf()); // 入力をバイト列へ変換する関数 / 小さなPDFをメモリ上で生成する関数
    await content.admin.locator('input[name="attachmentFiles"]').setInputFiles([ // メモリ内PDFを実フォームに設定するメソッド / 入力名・href等で対象要素を選ぶメソッド
      {
        name: "first.pdf",
        mimeType: "application/pdf",
        buffer: pdf
      },
      {
        name: "second.pdf",
        mimeType: "application/pdf",
        buffer: pdf
      },
    ]);
    const submitted = content.admin.waitForResponse(// 実Actionの応答を待つメソッド
      /**
       * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
       */
      (response) => response.request().method() === "POST" && // 所有する入力を受け取る検証コールバック / HTTP操作を取得するメソッド / 対象のHTTP要求を取得するメソッド
        new URL(response.url()).pathname === content.path(KIND, "/new", "a", true)); // 所有する接続URLを解析するコンストラクター / 要求または応答のURLをメモリ内で取得するメソッド / 所有クラブの会員・管理URLを生成する関数
    await content.admin.getByRole("button", { // roleと名前で対象を選ぶメソッド
      name: "保存する",
      exact: true
    }).click(); // 正規のボタンを操作するメソッド
    await submitted;
    await expect(content.admin.getByRole("button", { // 期待値を生成する関数 / roleと名前で対象を選ぶメソッド
      name: "保存する",
      exact: true
    })).toBeEnabled(); // 送信終了後の操作可否を検証するメソッド
    const where = {
      clubId: content.data.clubs.a.id,
      title: content.title
    };
    const count = await content.database.clubEvent.count({ // 所有条件に合う行数を取得するメソッド
      where
    });
    expect(count).toBe(0); // 値の一致を検証するメソッド / 期待値を生成する関数
    const checks = await content.control({ // 同じrunのsecretで所有stubを制御する関数
      action: "read"
    }) as { // 検証済みの値の型を明示する型アサーション
      storageChecks: {
        method: string; // 文字列型
        path: string; // 文字列型
        mode: string // 文字列型
      }[];
    };
    const prefix = `/storage/v1/object/${CLUB_ATTACHMENT_BUCKET}/clubs/${content.data.clubs.a.id}/events/`;
    const uploads = checks.storageChecks.filter( // 対象条件を満たす要素だけを選ぶメソッド
      /**
       * この所有prefixの実upload操作だけを選び、validation失敗だけの成功扱いを防ぐ。
       */
      (check) => check.method === "POST" && // 所有する入力を受け取る検証コールバック
        check.path.startsWith(prefix), // 所有prefixとの先頭一致を調べるメソッド
    );
    expect(uploads.map( // 期待値を生成する関数 / 比較に必要な識別情報へ配列を写すメソッド
      /**
       * 実uploadの先行成功と2枚目の故障を順番どおり取り出す。
       */
      (check) => check.mode, // 所有する入力を受け取る検証コールバック
    )).toEqual(["success", "server-error"]); // 配列・構造の一致を検証するメソッド
    expect(checks.storageChecks.filter( // 期待値を生成する関数 / 対象条件を満たす要素だけを選ぶメソッド
      /**
       * 先行PDFの補償削除が同じ所有prefixへ実行されたことを確認する。
       */
      (check) => check.method === "DELETE" && // 所有する入力を受け取る検証コールバック
        check.path.startsWith(prefix) && // 所有prefixとの先頭一致を調べるメソッド
        check.mode === "success",
    ).length).toBe(1); // 値の一致を検証するメソッド
    // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(await storageNames(content, KIND)).toEqual(before); // 配列・構造の一致を検証するメソッド / 期待値を生成する関数 / 所有prefixのStorage object名を照会する関数
    await expect(content.admin.locator('input[name="title"]')).toHaveValue(content.title); // フォームに復元された値を検証するメソッド / 期待値を生成する関数 / 入力名・href等で対象要素を選ぶメソッド
  });

/**
 * 署名発行と削除の故障を別々に設定し、DB削除後にFAILED Jobと実objectが残ることを確認する。
 */
test("イベントのPDF取得失敗と削除Job失敗を混同しない", // E2Eケースを登録する関数
  /**
   * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
   */
  async ({ content }) => { // 所有する入力を受け取る検証コールバック
    const { admin, member, database, data } = content;
    await content.prepare(KIND); // 正規の新規作成フォームへ架空の入力値を設定する関数
    await admin.locator('input[name="status"][value="PUBLISHED"]').check(); // 対象のcheckbox・radioを有効にするメソッド / 入力名・href等で対象要素を選ぶメソッド
    await admin.locator('input[name="attachmentFiles"]').setInputFiles({ // メモリ内PDFを実フォームに設定するメソッド / 入力名・href等で対象要素を選ぶメソッド
      name: "failure.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(createMvpFixturePdf()), // 入力をバイト列へ変換する関数 / 小さなPDFをメモリ上で生成する関数
    });
    await content.save(); // 正規の保存操作と一覧への遷移を確認する関数
    const id = await content.identify(KIND); // 所有クラブと題名から作成されたcontent IDを照合する関数
    const [attachment] = await contentAttachments(content, KIND, id); // 所有クラブと親IDで添付を取得する関数
    await content.control({ // 同じrunのsecretで所有stubを制御する関数
      action: "configure",
      channel: "storage",
      method: "POST",
      mode: "server-error",
      path: `/storage/v1/object/sign/${CLUB_ATTACHMENT_BUCKET}/${attachment.storagePath}`
    });
    const failed = await member.context().request.get( // 所有する画面・PDFへGET要求するメソッド / そのpageの独立contextを取得するメソッド
      `/club/${data.clubs.a.slug}/attachments/event/${attachment.id}`, {
      maxRedirects: 0
    },
    );
    expect(failed.status()).toBe(500); // 値の一致を検証するメソッド / 期待値を生成する関数 / HTTP状態を取得するメソッド
    expect(failed.headers().location === undefined).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 要求または応答のheaderをメモリ内だけで取得するメソッド
    const signing = await content.control({ // 同じrunのsecretで所有stubを制御する関数
      action: "read"
    }) as { // 検証済みの値の型を明示する型アサーション
      storageChecks: {
        method: string; // 文字列型
        path: string; // 文字列型
        mode: string // 文字列型
      }[];
    };
    expect(signing.storageChecks.filter( // 期待値を生成する関数 / 対象条件を満たす要素だけを選ぶメソッド
      /**
       * 取得失敗が、指定した実署名APIの故障によるものか照合する。
       */
      (check) => check.method === "POST" && // 所有する入力を受け取る検証コールバック
        check.path.endsWith(attachment.storagePath) && // 故障対象の添付pathとの末尾一致を調べるメソッド
        check.mode === "server-error",
    ).length).toBe(1); // 値の一致を検証するメソッド
    // 値の一致を検証するメソッド / 期待値を生成する関数 / 要求または応答のheaderをメモリ内だけで取得するメソッド
    expect((await contentAttachments(content, KIND, id)).length).toBe(1); // 値の一致を検証するメソッド / 期待値を生成する関数 / 所有クラブと親IDで添付を取得する関数
    await content.control({ // 同じrunのsecretで所有stubを制御する関数
      action: "reset"
    });
    await content.control({ // 同じrunのsecretで所有stubを制御する関数
      action: "configure",
      channel: "storage",
      method: "DELETE",
      mode: "server-error",
      path: `/storage/v1/object/${CLUB_ATTACHMENT_BUCKET}/${attachment.storagePath}`
    });
    await content.remove(KIND, id); // 正規の削除確認画面からActionを実行する関数
    expect(await contentRow(content, KIND, id)).toBeNull(); // DB行の不存在を検証するメソッド / 期待値を生成する関数 / 所有クラブとcontent IDでDB行を取得する関数
    expect((await contentAttachments(content, KIND, id)).length).toBe(0); // 値の一致を検証するメソッド / 期待値を生成する関数 / 所有クラブと親IDで添付を取得する関数
    await expect.poll(// 非同期の終端結果を待って検証するメソッド
      /**
       * 非同期処理の終端状態をDBまたは画面から読み取り、固定待機せず検証する。
       */
      async () => { // 所有する入力を受け取る検証コールバック
        const job = await database.storageDeletionJob.findFirst({ // 条件に合う所有行を一件取得するメソッド
          where: {
            clubId: data.clubs.a.id,
            storagePath: attachment.storagePath
          },
        });
        return job?.status;
      }).toBe("FAILED"); // 値の一致を検証するメソッド
    expect((await storageNames(content, KIND)).includes(attachment.storagePath)).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 固定条件・所有pathとの一致を調べるメソッド / 所有prefixのStorage object名を照会する関数
    // 残存PDFは親runnerが所有prefix内だけを発見して回収する。
  });

/**
 * 公開Actionが作った配送行とstubの受付を別々に照合し、実LINEへの到達とは扱わない。
 */
test("イベントの公開時LINEはDB記録とローカルstub受付が対応する", // E2Eケースを登録する関数
  /**
   * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
   */
  async ({ content }) => { // 所有する入力を受け取る検証コールバック
    await content.prepare(KIND); // 正規の新規作成フォームへ架空の入力値を設定する関数
    await content.admin.locator('input[name="status"][value="PUBLISHED"]').check(); // 対象のcheckbox・radioを有効にするメソッド / 入力名・href等で対象要素を選ぶメソッド
    await content.admin.locator('input[name="shouldNotifyLine"]').check(); // 対象のcheckbox・radioを有効にするメソッド / 入力名・href等で対象要素を選ぶメソッド
    await content.admin.locator(`input[name="lineTargetIds"][value="${content.targetId}"]`).check(); // 対象のcheckbox・radioを有効にするメソッド / 入力名・href等で対象要素を選ぶメソッド
    await content.save(); // 正規の保存操作と一覧への遷移を確認する関数
    const id = await content.identify(KIND); // 所有クラブと題名から作成されたcontent IDを照合する関数
    await expect.poll(// 非同期の終端結果を待って検証するメソッド
      /**
       * 非同期処理の終端状態をDBまたは画面から読み取り、固定待機せず検証する。
       */
      async () => { // 所有する入力を受け取る検証コールバック
        const deliveries = await content.database.clubLineDelivery.findMany({ // 条件に合う所有行を取得するメソッド
          where: {
            clubId: content.data.clubs.a.id,
            targetId: content.targetId,
            eventId: id
          },
        });
        return deliveries.length === 1 ? deliveries[0].status : "MISSING_OR_DUPLICATED";
      }).toBe("SENT"); // 値の一致を検証するメソッド
    const row = await content.database.clubLineDelivery.findFirstOrThrow({ // 所有する行を取得し不存在なら失敗するメソッド
      where: {
        clubId: content.data.clubs.a.id,
        eventId: id
      },
    });
    const result = await content.control({ // 同じrunのsecretで所有stubを制御する関数
      action: "read"
    }) as { // 検証済みの値の型を明示する型アサーション
      records: {
        channel: string; // 文字列型
        idempotencyKey: string; // 文字列型
        body: unknown // 未確定の入力型
      }[];
    };
    const records = result.records.filter(// 対象条件を満たす要素だけを選ぶメソッド
      /**
       * 当該の所有ID・名前・受付情報に対応する要素だけを選ぶ。
       */
      (record) => record.channel === "line"); // 所有する入力を受け取る検証コールバック
    expect(records.length).toBe(1); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(records[0].idempotencyKey === row.id).toBe(true); // 【修正】期待値生成関数 / LINE再送防止キーと配送IDの一致を検証するメソッド
    expect(JSON.stringify(records[0].body).includes(content.title)).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 固定条件・所有pathとの一致を調べるメソッド / 値をJSON文字列へ変換するメソッド
    expect(row.sentAt instanceof Date).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 公開・既読基準の日時を扱うDateコンストラクター
  });

/**
 * A slugにBのcontent・添付IDを混ぜたGETと、B OWNERの正規ActionをB MEMBERで呼ぶPOSTを拒否する。
 */
test("イベントの別クラブIDと管理Actionの直接呼出しではBを更新できない", // E2Eケースを登録する関数
  /**
   * 受け取った所有fixtureの値を使い、このケースの操作・照合を行う。
   */
  async ({ content }) => { // 所有する入力を受け取る検証コールバック
    const { admin, member, foreignAdmin, database, data } = content;
    const foreign = await database.clubEvent.findFirstOrThrow({ // 所有する行を取得し不存在なら失敗するメソッド
      where: {
        clubId: data.clubs.b.id,
        status: "PUBLISHED",
        attachments: {
          some: {}
        }
      },
      include: {
        attachments: true
      },
    });
    const before = JSON.stringify(foreign); // 値をJSON文字列へ変換するメソッド
    for (const page of [admin, member]) {
      await contentDenied(page, content.path(KIND, `/${foreign.id}`)); // Streamingを含む404 UIとnoindexを検証する関数 / 所有クラブの会員・管理URLを生成する関数
      await contentDenied(page, content.path(KIND, `/${foreign.id}/edit`, "a", true)); // Streamingを含む404 UIとnoindexを検証する関数 / 所有クラブの会員・管理URLを生成する関数
      const denied = await page.context().request.get( // 所有する画面・PDFへGET要求するメソッド / そのpageの独立contextを取得するメソッド
        `/club/${data.clubs.a.slug}/attachments/event/${foreign.attachments[0].id}`, {
        maxRedirects: 0
      },
      );
      expect(denied.status()).toBe(404); // 値の一致を検証するメソッド / 期待値を生成する関数 / HTTP状態を取得するメソッド
      expect(denied.headers().location === undefined).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 要求または応答のheaderをメモリ内だけで取得するメソッド
      const deniedManagement = await page.context().request.get( // 所有する画面・PDFへGET要求するメソッド / そのpageの独立contextを取得するメソッド
        `/club/${data.clubs.a.slug}/admin/attachments/event/${foreign.attachments[0].id}`,
        {
          maxRedirects: 0
        },
      );
      expect(deniedManagement.status()).toBe(404); // 値の一致を検証するメソッド / 期待値を生成する関数 / HTTP状態を取得するメソッド
      expect(deniedManagement.headers().location === undefined).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 要求または応答のheaderをメモリ内だけで取得するメソッド
      // 値の一致を検証するメソッド / 期待値を生成する関数 / 要求または応答のheaderをメモリ内だけで取得するメソッド
    }

    const deniedChecks = await content.control({ // 同じrunのsecretで所有stubを制御する関数
      action: "read"
    }) as { // 検証済みの値の型を明示する型アサーション
      storageChecks: unknown[]; // 未確定の入力型
    };
    expect(deniedChecks.storageChecks.length).toBe(0); // 値の一致を検証するメソッド / 期待値を生成する関数
    const edit = content.path(KIND, `/${foreign.id}/edit`, "b", true); // 所有クラブの会員・管理URLを生成する関数
    await foreignAdmin.goto(edit); // 新規ナビゲーションで正規画面を取得するメソッド
    await foreignAdmin.locator('input[name="title"]').fill(content.title); // テスト用の入力値を設定するメソッド / 入力名・href等で対象要素を選ぶメソッド
    let replayed = false;
    await foreignAdmin.route("**" + edit, // 正規Actionの再送に必要な要求だけを捕捉するメソッド
      /**
       * 正規のAction要求を別所属のCookieで再送し、実行時の認可を検証する。
       */
      async (route) => { // 所有する入力を受け取る検証コールバック
        const request = route.request(); // 対象のHTTP要求を取得するメソッド
        if (request.method() !== "POST") { // HTTP操作を取得するメソッド
          await route.continue(); // 対象外の要求を変更せず継続するメソッド
          return;
        }
        const headers = request.headers(); // 要求または応答のheaderをメモリ内だけで取得するメソッド
        delete headers.cookie;
        delete headers["content-length"];
        const response = await admin.context().request.fetch(request.url(), { // 実Cookieと正規Action本文で所有URLへ再送するメソッド / そのpageの独立contextを取得するメソッド / 要求または応答のURLをメモリ内で取得するメソッド
          method: "POST",
          headers,
          data: request.postDataBuffer() ?? undefined, // 正規の暗号化済みAction本文をメモリへ取得するメソッド
          maxRedirects: 0,
        });
        replayed = true;
        expect(response.headers()["x-action-redirect"]?.includes("toast=event-updated") ?? false).toBe(false); // 値の一致を検証するメソッド / 期待値を生成する関数 / 固定条件・所有pathとの一致を調べるメソッド / 要求または応答のheaderをメモリ内だけで取得するメソッド
        await route.fulfill({ // 別所属で再送した応答を元の要求へ返すメソッド
          response
        });
      });
    await foreignAdmin.getByRole("button", { // roleと名前で対象を選ぶメソッド
      name: "保存する",
      exact: true
    }).click(); // 正規のボタンを操作するメソッド
    await expect.poll(// 非同期の終端結果を待って検証するメソッド
      /**
       * 非同期処理の終端状態をDBまたは画面から読み取り、固定待機せず検証する。
       */
      () => replayed).toBe(true); // 値の一致を検証するメソッド / 所有する入力を受け取る検証コールバック
    const after = await database.clubEvent.findFirstOrThrow({ // 所有する行を取得し不存在なら失敗するメソッド
      where: {
        clubId: data.clubs.b.id,
        id: foreign.id
      },
      include: {
        attachments: true
      },
    });
    expect(JSON.stringify(after) === before).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 値をJSON文字列へ変換するメソッド
  });
