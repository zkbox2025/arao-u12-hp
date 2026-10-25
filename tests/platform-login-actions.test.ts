// tests/platform-login-actions.test.ts
// 実DB・Auth・Cookie・メールを使わず、専用認証Actionの許可・拒否・障害を確認する。

import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import {
  platformLoginAction, // Platform専用ログインAction関数
  platformLogoutAction, // 現在のローカルセッションだけを終了するAction関数
} from "@/app/(club-app)/platform-login/actions";
import type {
  PlatformLoginActionState, // パスワードを含めないログインAction state型
} from "@/domain/platform/platform-login-form";
import {
  DomainError, // 画面表示可能な固定コード・メッセージを持つエラークラス
} from "@/domain/shared/domain-error";
import {
  isRequestId, // UUID v4のrequestIdを検証する関数
} from "@/domain/shared/request-id";

const mocks = vi.hoisted( // import前にモックを生成するメソッド
  /**
   * 認証・権限・試行記録・遷移の境界を置換するモックを作る。
   */
  () => ({ // モック生成コールバック関数
    meta: vi.fn(), // ヘッダー取得モックの生成メソッド
    limit: vi.fn(), // 試行制限モックの生成メソッド
    save: vi.fn(), // 試行ログ保存モックの生成メソッド
    client: vi.fn(), // クライアント生成モックの生成メソッド
    signIn: vi.fn(), // パスワード認証モックの生成メソッド
    signOut: vi.fn(), // ローカルログアウトモックの生成メソッド
    admin: vi.fn(), // Platform管理者読取モックの生成メソッド
    redirect: vi.fn(), // 画面遷移モックの生成メソッド
  }),
);

vi.mock( // ヘッダー取得モジュールの置換メソッド
  "@/lib/security/request",
  /**
   * 実ヘッダーを読まず、試験用リクエスト情報を返す。
   */
  () => ({ getRequestMeta: mocks.meta }), // メタ情報取得モックを公開するコールバック関数
);
vi.mock( // 試行制限モジュールの置換メソッド
  "@/lib/security/login-rate-limit",
  /**
   * saltや実DBへ接続せず、試行制限の判定を差し替える。
   */
  () => ({ checkLoginRateLimit: mocks.limit }), // 制限判定モックを公開するコールバック関数
);
vi.mock( // 試行記録モジュールの置換メソッド
  "@/lib/security/login-submission-log",
  /**
   * DBへの書込みを行わず、保存値を検証できるようにする。
   */
  () => ({ saveLoginSubmissionLog: mocks.save }), // 試行記録モックを公開するコールバック関数
);
vi.mock( // Authクライアントモジュールの置換メソッド
  "@/src/infrastructure/supabase/server",
  /**
   * 実Cookie・Authを操作せず、認証応答を置換する。
   */
  () => ({ createClient: mocks.client }), // クライアント生成モックを公開するコールバック関数
);
vi.mock( // 管理者Repositoryモジュールの置換メソッド
  "@/src/infrastructure/prisma/repositories/platform-admin-repository",
  /**
   * 所属を作成せず、有効管理者の読取結果を差し替える。
   */
  () => ({ findActivePlatformAdminByUserId: mocks.admin }), // 権限読取モックを公開するコールバック関数
);
vi.mock( // Next navigationモジュールの置換メソッド
  "next/navigation",
  /**
   * 遷移はモックにし、制御例外の再送出にはNext公開APIを使う。
   */
  async (original) => ({ // 元モジュールを読む非同期コールバック関数
    ...await original<typeof import("next/navigation")>(), // 元モジュール読込関数 / Next navigationモジュールの型
    redirect: mocks.redirect, // 遷移モック関数の参照
  }),
);

const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "admin@example.test";
const PASSWORD = "  Private-password1!  ";
const PRIVATE = "private-db-token-cookie";
const IP = "192.0.2.17";
const UA = "private-user-agent";

/**
 * 画面の初期stateを作り、前state由来の余分な値を使わないことを検証可能にする。
 */
function state(): PlatformLoginActionState { // 初期state生成関数 / 公開ログインstate型
  return {
    status: "idle",
    values: { email: "" },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
}

/**
 * 単一項目のログイン送信値を生成する。
 */
function form(): FormData { // 送信値生成関数 / FormData型
  const data = new FormData(); // FormDataコンストラクター
  data.set("email", " ＡＤＭＩＮ＠ＥＸＡＭＰＬＥ．ＴＥＳＴ "); // メール項目の設定メソッド
  data.set("password", PASSWORD); // パスワード項目の設定メソッド
  data.set("requestId", REQUEST_ID); // 識別値の設定メソッド
  return data;
}

/**
 * redirectが処理を中断することを試験用例外で再現する。
 */
function redirected(): never { // 遷移制御の再現関数 / 正常終了しないnever型
  throw new Error("NEXT_REDIRECT"); // 固定制御例外のErrorコンストラクター
}

/**
 * 試行ログ・運用ログに、個人情報やパスワード・例外原文が含まれないことを確認する。
 */
function expectSafeLogs(): void { // ログ非開示の検証関数 / 値を返さないvoid型
  const output = JSON.stringify([ // 呼出し記録をJSON化するメソッド
    mocks.save.mock.calls,
    vi.mocked(console.error).mock.calls, // consoleモックの型を取得するメソッド
  ]);
  for (const value of [EMAIL, PASSWORD, PRIVATE, IP, UA]) {
    expect(output).not.toContain(value); // 期待値生成・秘密値非反射の比較メソッド
  }
}

/**
 * Nextの公開APIから実際の制御例外を取得し、動作を再現する試験へ渡す。
 */
async function nextControl(): Promise<unknown> { // 制御例外取得関数 / 不明値の非同期結果型
  const navigation = await vi.importActual<typeof import("next/navigation")>( // 元モジュール読込メソッド / navigationモジュールの型
    "next/navigation",
  );
  try {
    navigation.redirect("/platform-login"); // Next制御例外を生成する関数
  } catch (error) {
    return error;
  }
  throw new Error("Nextの制御例外を取得できません。"); // 試験前提の違反を示す固定Errorコンストラクター
}

beforeEach( // 前処理を登録する関数
  /**
   * 所属なしの有効管理者と成功応答を初期状態とし、console出力を試験内へ閉じる。
   */
  () => { // 試験前処理のコールバック関数
    vi.resetAllMocks(); // モック状態の初期化メソッド
    vi.spyOn(console, "error").mockImplementation( // consoleを試験用に置換するメソッド
      /**
       * 運用ログを外へ出さず、呼出し履歴だけを残す。
       */
      () => undefined, // 出力を行わないコールバック関数
    );
    mocks.meta.mockResolvedValue({ // ヘッダー応答を設定するメソッド
      ip: IP,
      userAgent: UA,
    });
    mocks.limit.mockResolvedValue({ // ハッシュ化後の制限判定を設定するメソッド
      allowed: true,
      reason: null,
      ipHash: "ip-hash",
      emailHash: "email-hash",
    });
    mocks.save.mockResolvedValue(undefined); // 試行記録成功を設定するメソッド
    mocks.client.mockResolvedValue({ // クライアント応答を設定するメソッド
      auth: {
        signInWithPassword: mocks.signIn, // 認証モック関数の参照
        signOut: mocks.signOut, // セッション終了モック関数の参照
      },
    });
    mocks.signIn.mockResolvedValue({ // 認証成功を設定するメソッド
      data: {
        user: {
          id: USER_ID,
          role: "OWNER",
        },
        session: { access_token: PRIVATE },
      },
      error: null,
    });
    mocks.signOut.mockResolvedValue({ error: null }); // セッション終了成功を設定するメソッド
    mocks.admin.mockResolvedValue({ // 有効管理者を設定するメソッド
      id: USER_ID,
      role: "DEVELOPER",
    });
    mocks.redirect.mockImplementation(redirected); // 遷移モック実装の設定メソッド / 固定制御例外生成関数の参照
  },
);

afterEach( // 後処理を登録する関数
  /**
   * consoleの実装を元に戻し、他の試験へモックを持ち越さない。
   */
  () => { // 後処理のコールバック関数
    expectSafeLogs(); // 試行ログと運用ログの秘密値非反射を確認する関数
    vi.restoreAllMocks(); // spyを元の実装へ戻すメソッド
  },
);

it.each(["DEVELOPER", "SUPPORT"] as const)( // 許可ロール別の試験メソッド / 読取専用リテラル型
  "%sは所属を参照せず、固定support先へ進む",
  /**
   * 認証・最新権限・ハッシュ化ログの順序と、任意遷移・偽造権限の不採用を確認する。
   */
  async (role) => { // 許可ロール別の非同期試験コールバック
    mocks.admin.mockResolvedValue({ // 管理者ロールの応答設定メソッド
      id: USER_ID,
      role,
    });
    const data = form(); // 送信値生成関数
    data.set("returnTo", "https://foreign.example.test"); // 任意遷移先の設定メソッド
    data.set("clubId", "foreign-club"); // 任意クラブIDの設定メソッド
    data.set("role", "DEVELOPER"); // 偽造ロールの設定メソッド
    await expect(platformLoginAction(state(), data)).rejects.toThrow("NEXT_REDIRECT"); // Action・state生成関数 / 期待値生成・制御例外の比較メソッド
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith({ // 制限関数参照 / 期待値生成・引数比較メソッド
      ip: IP,
      email: EMAIL,
    });
    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith({ // Auth関数参照 / 期待値生成・引数比較メソッド
      email: EMAIL,
      password: PASSWORD,
    });
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith(USER_ID); // 権限関数参照 / 期待値生成・本人ID比較メソッド
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ // 記録関数参照 / 期待値生成・許可列比較メソッド
      ipHash: "ip-hash",
      emailHash: "email-hash",
      result: "SUCCESS",
      reason: null,
    });
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/platform/support"); // 遷移関数参照 / 期待値生成・固定先比較メソッド
    expect(mocks.signOut).not.toHaveBeenCalled(); // セッション終了参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.limit.mock.invocationCallOrder[0]).toBeLessThan(mocks.signIn.mock.invocationCallOrder[0]); // 期待値生成・制限判定が認証より先であることの比較メソッド
  },
);

it.each(["email", "password", "requestId"] as const)( // 項目別試験メソッド / 読取専用リテラル型
  "%sの改ざんはAuth・試行記録より前に拒否する",
  /**
   * 重複・File・欠落を直接Actionへ送り、前stateの余分な値も反映しないことを確認する。
   */
  async (field) => { // 入力改ざんの非同期コールバック
    for (const mode of ["duplicate", "file", "missing"]) {
      const data = form(); // 送信値生成関数
      if (mode === "duplicate") {
        data.append(field, String(data.get(field))); // 同名値追加 / 文字列化 / 項目読取メソッド
      } else if (mode === "file") {
        data.set(field, new File([PRIVATE], "input.txt")); // 項目設定メソッド / Fileコンストラクター
      } else {
        data.delete(field); // 項目削除メソッド
      }
      const result = await platformLoginAction({ // ログインAction関数
        ...state(), // 初期state生成関数
        values: {
          email: EMAIL,
          password: PASSWORD,
        },
        data: { access_token: PRIVATE },
      } as unknown as PlatformLoginActionState, data); // 改ざん再現用の不明値型・公開state型アサーション
      expect(result.status).toBe("error"); // 期待値生成・エラー比較メソッド
      expect(Object.keys(result.values)).toEqual(["email"]); // キー列挙 / 期待値生成・公開項目比較メソッド
      expect(JSON.stringify(result)).not.toContain(PASSWORD); // JSON化 / 期待値生成・秘密値非反射比較メソッド
      expect(JSON.stringify(result)).not.toContain(PRIVATE); // JSON化 / 期待値生成・秘密値非反射比較メソッド
    }
    expect(mocks.client).not.toHaveBeenCalled(); // Auth参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.limit).not.toHaveBeenCalled(); // 制限参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 記録参照 / 期待値生成・未呼出し比較メソッド
  },
);

it( // 試験を登録する関数
  "前stateと異なるrequestIdを拒否し、新しいIDを返す",
  /**
   * 有効なUUIDでも別フォームの操作識別値を採用しない。
   */
  async () => { // 識別値不一致の非同期コールバック
    const data = form(); // 送信値生成関数
    data.set("requestId", "55555555-5555-4555-8555-555555555555"); // 別フォーム識別値の設定メソッド
    const result = await platformLoginAction(state(), data); // Action関数 / 初期state生成関数
    expect(result.status).toBe("error"); // 期待値生成・エラー比較メソッド
    expect(isRequestId(result.requestId)).toBe(true); // UUID検証関数 / 期待値生成・比較メソッド
    expect(result.requestId).not.toBe(REQUEST_ID); // 期待値生成・識別値更新比較メソッド
    expect(mocks.limit).not.toHaveBeenCalled(); // 制限参照 / 期待値生成・未呼出し比較メソッド
  },
);

it.each([false, true])( // ブロックログ保存成否ごとの試験メソッド
  "試行制限時は認証せずBLOCKEDを記録する（記録失敗=%s）",
  /**
   * 制限超過時はAuthへ進まず、記録の例外原文も漏らさない。
   */
  async (logFails) => { // 制限超過の非同期コールバック
    mocks.limit.mockResolvedValue({ // ブロック応答の設定メソッド
      allowed: false,
      reason: "TOO_MANY_FAILED_LOGIN_BY_EMAIL",
      ipHash: "ip-hash",
      emailHash: "email-hash",
    });
    if (logFails) {
      mocks.save.mockRejectedValue(new Error(PRIVATE)); // 記録障害の設定メソッド / Errorコンストラクター
    }
    const result = await platformLoginAction(state(), form()); // Action・初期state・送信値の生成関数
    expect(result.status).toBe("error"); // 期待値生成・エラー比較メソッド
    expect(mocks.client).not.toHaveBeenCalled(); // Auth参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.save).toHaveBeenCalledWith({ // 記録参照 / 期待値生成・引数比較メソッド
      ipHash: "ip-hash",
      emailHash: "email-hash",
      result: "BLOCKED",
      reason: "TOO_MANY_FAILED_LOGIN_BY_EMAIL",
    });
  },
);

it.each(["meta", "limit", "client", "signIn", "admin"] as const)( // 障害箇所別の試験メソッド / 読取専用リテラル型
  "%sの障害を成功へ丸めず、秘密値を返さない",
  /**
   * 設定・接続・Auth・権限DBの各障害で固定エラーを返し、必要ならlocal終了を試みる。
   */
  async (operation) => { // 障害箇所別の非同期コールバック
    mocks[operation].mockRejectedValue(new Error(PRIVATE)); // 障害応答の設定メソッド / Errorコンストラクター
    const result = await platformLoginAction(state(), form()); // Action・初期state・送信値の生成関数
    expect(result.status).toBe("error"); // 期待値生成・エラー比較メソッド
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // JSON化 / 期待値生成・原文非反射の比較メソッド
    expect(mocks.redirect).not.toHaveBeenCalled(); // 遷移参照 / 期待値生成・未呼出し比較メソッド
    if (
      operation === "meta" ||
      operation === "limit"
    ) {
      expect(mocks.signIn).not.toHaveBeenCalled(); // Auth参照 / 期待値生成・未呼出し比較メソッド
    }
    if (
      operation === "signIn" ||
      operation === "admin"
    ) {
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" }); // 終了関数参照 / 期待値生成・スコープ比較メソッド
    }
  },
);

it.each([ // 不許可管理者応答別の試験メソッド
  null,
  {
    id: "foreign-admin",
    role: "DEVELOPER",
  },
])(
  "非管理者・inactive・本人不一致はlocal終了し、一般エラーを返す %#",
  /**
   * Auth成功だけでは許可せず、有効な本人PlatformAdminが必要なことを確認する。
   */
  async (admin) => { // 権限拒否の非同期コールバック
    mocks.admin.mockResolvedValue(admin); // 管理者読取応答の設定メソッド
    const result = await platformLoginAction(state(), form()); // Action・初期state・送信値の生成関数
    expect(result.formError).toBe("メールアドレスまたはパスワードが正しくありません。"); // 期待値生成・権限非開示の固定文比較メソッド
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" }); // 終了関数参照 / 期待値生成・local終了比較メソッド
    expect(mocks.redirect).not.toHaveBeenCalled(); // 遷移参照 / 期待値生成・未呼出し比較メソッド
  },
);

it( // 試験を登録する関数
  "認証失敗では既存セッションを勝手に終了しない",
  /**
   * 明確な認証失敗を一般エラーで返し、権限読取やログアウトを行わない。
   */
  async () => { // 認証失敗の非同期コールバック
    mocks.signIn.mockResolvedValue({ // 認証失敗応答の設定メソッド
      data: { user: null },
      error: { message: PRIVATE },
    });
    const result = await platformLoginAction(state(), form()); // Action・初期state・送信値の生成関数
    expect(result.formError).toBe("メールアドレスまたはパスワードが正しくありません。"); // 期待値生成・固定文比較メソッド
    expect(mocks.signOut).not.toHaveBeenCalled(); // 終了参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.admin).not.toHaveBeenCalled(); // 権限参照 / 期待値生成・未呼出し比較メソッド
  },
);

it( // 試験を登録する関数
  "成功ログの記録障害でも成功遷移せず、local終了を試みる",
  /**
   * Auth・権限が成功しても、試行記録に失敗した場合は固定エラーで中断する。
   */
  async () => { // 記録障害の非同期コールバック
    mocks.save.mockRejectedValue(new Error(PRIVATE)); // 記録失敗の設定メソッド / Errorコンストラクター
    const result = await platformLoginAction(state(), form()); // Action・初期state・送信値の生成関数
    expect(result.status).toBe("error"); // 期待値生成・エラー比較メソッド
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" }); // 終了参照 / 期待値生成・スコープ比較メソッド
    expect(mocks.redirect).not.toHaveBeenCalled(); // 遷移参照 / 期待値生成・未呼出し比較メソッド
  },
);

it.each(["returned", "thrown"] as const)( // 終了障害の形式別試験メソッド / 読取専用リテラル型
  "権限拒否後の終了失敗（%s）を成功にしない",
  /**
   * SDKがエラーを返す場合と例外を投げる場合の両方を安全に処理する。
   */
  async (mode) => { // 終了障害の非同期コールバック
    mocks.admin.mockResolvedValue(null); // 権限拒否の設定メソッド
    if (mode === "returned") {
      mocks.signOut.mockResolvedValue({ error: { message: PRIVATE } }); // SDKエラー応答の設定メソッド
    } else {
      mocks.signOut.mockRejectedValue(new Error(PRIVATE)); // SDK例外の設定メソッド / Errorコンストラクター
    }
    const result = await platformLoginAction(state(), form()); // Action・初期state・送信値の生成関数
    expect(result.status).toBe("error"); // 期待値生成・エラー比較メソッド
    expect(mocks.redirect).not.toHaveBeenCalled(); // 遷移参照 / 期待値生成・未呼出し比較メソッド
  },
);

it( // 試験を登録する関数
  "logoutは権限確認せず自分のlocalセッションだけを終了する",
  /**
   * inactiveや一般会員も自身のlogoutが可能で、他端末のセッションに触れない。
   */
  async () => { // ログアウト成功の非同期コールバック
    mocks.admin.mockResolvedValue(null); // 権限なしの設定メソッド
    await expect(platformLogoutAction()).rejects.toThrow("NEXT_REDIRECT"); // logout関数 / 期待値生成・制御例外の比較メソッド
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" }); // 終了参照 / 期待値生成・スコープ比較メソッド
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/platform-login"); // 遷移参照 / 期待値生成・固定先比較メソッド
    expect(mocks.admin).not.toHaveBeenCalled(); // 権限参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.limit).not.toHaveBeenCalled(); // 制限参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 記録参照 / 期待値生成・未呼出し比較メソッド
  },
);

it.each(["client", "returned", "thrown"] as const)( // logout障害形式別の試験メソッド / 読取専用リテラル型
  "logoutの%s障害で固定例外を返し、完了先へ進まない",
  /**
   * セッション終了に失敗した場合は、原文やcauseを含まないDomainErrorを返す。
   */
  async (mode) => { // logout障害の非同期コールバック
    if (mode === "client") {
      mocks.client.mockRejectedValue(new Error(PRIVATE)); // 接続障害の設定メソッド / Errorコンストラクター
    } else if (mode === "returned") {
      mocks.signOut.mockResolvedValue({ error: { message: PRIVATE } }); // SDKエラー応答の設定メソッド
    } else {
      mocks.signOut.mockRejectedValue(new Error(PRIVATE)); // SDK例外の設定メソッド / Errorコンストラクター
    }
    const result = platformLogoutAction(); // logout関数
    await expect(result).rejects.toBeInstanceOf(DomainError); // 期待値生成・クラス比較メソッド / ドメインエラークラス参照
    await expect(result).rejects.toMatchObject({ // 期待値生成・固定結果の部分一致比較メソッド
      code: "EXTERNAL_SERVICE",
      publicMessage: "ログアウトできませんでした。もう一度お試しください。",
      cause: undefined,
    });
    expect(mocks.redirect).not.toHaveBeenCalled(); // 遷移参照 / 期待値生成・未呼出し比較メソッド
  },
);

it.each(["meta", "limit", "client", "signIn", "admin", "save", "signOut"] as const)( // 制御例外発生箇所別の試験メソッド / 読取専用リテラル型
  "%sのNext制御例外を固定エラーに変換しない",
  /**
   * Nextの公開redirect APIが生成した制御例外を同一の値で再送出する。
   */
  async (operation) => { // 制御例外の非同期コールバック
    const control = await nextControl(); // Next公開APIから実際の制御例外を取得する関数
    mocks[operation].mockRejectedValue(control); // 各境界から制御例外を返すモック設定メソッド
    if (operation === "signOut") {
      mocks.admin.mockResolvedValue(null); // 拒否後の終了処理へ進める設定メソッド
    }
    await expect(platformLoginAction(state(), form())).rejects.toBe(control); // Action・初期state・送信値の生成関数 / 期待値生成・例外同一性比較メソッド
  },
);

it.each([ // 不完全な認証応答の試験メソッド
  { user: null },
  { user: { id: "" } },
  {
    user: { id: USER_ID },
    error: true,
  },
])(
  "不完全なAuth成功や矛盾した応答で権限を取得しない %#",
  /**
   * ユーザー欠落・空ID・エラー併存の応答では、作られた可能性のあるsessionを終了する。
   */
  async (response) => { // 不完全な認証応答の非同期コールバック
    mocks.signIn.mockResolvedValue({ // 不完全なAuth応答を設定するメソッド
      data: { user: response.user },
      error: "error" in response ? { message: PRIVATE } : null,
    });
    const result = await platformLoginAction(state(), form()); // Action・初期state・送信値の生成関数
    expect(result.status).toBe("error"); // 期待値生成・拒否比較メソッド
    expect(mocks.admin).not.toHaveBeenCalled(); // 権限参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" }); // 終了参照 / 期待値生成・スコープ比較メソッド
  },
);

it.each(["client", "signOut"] as const)( // logout制御例外発生箇所別の試験メソッド / 読取専用リテラル型
  "logoutの%s制御例外を固定障害へ丸めない",
  /**
   * logout側のCookie取得・終了処理でもNext制御例外を維持する。
   */
  async (operation) => { // logout制御例外の非同期コールバック
    const control = await nextControl(); // Next公開APIから実際の制御例外を取得する関数
    mocks[operation].mockRejectedValue(control); // 制御例外を返すモック設定メソッド
    await expect(platformLogoutAction()).rejects.toBe(control); // logout関数 / 期待値生成・例外同一性比較メソッド
  },
);
