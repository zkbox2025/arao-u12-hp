// tests/platform-support-actions.test.ts
// Actionの直接呼出しで実認可・入力・固定再検証・保存後失敗を確認する。HTTP Origin保護の試験ではない。

import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import {
  updateSupportReportNoteAction, // 再認可と単一値検証を行ってメモを保存するServer Action関数
  updateSupportReportStatusAction, // 再認可と単一値検証を行ってstatusを更新するServer Action関数
  type PlatformSupportActionState, // 行・操作ごとに独立させる管理操作のstate型
} from "@/app/(club-app)/platform/support/actions";
import {
  isRequestId, // UUID v4形式のrequestIdを検証する関数
} from "@/domain/shared/request-id";

const mocks = vi.hoisted( // モジュール評価前にモックを準備するメソッド
  /**
   * 実認可は通し、Auth・DB・Service・Next APIの境界だけを置換する。
   */
  () => ({ // モック生成コールバック
    getUser: vi.fn(), // Auth本人検証モックの生成メソッド
    actor: vi.fn(), // 最新管理者読取モックの生成メソッド
    status: vi.fn(), // status更新Serviceモックの生成メソッド
    note: vi.fn(), // メモ更新Serviceモックの生成メソッド
    revalidate: vi.fn(), // 再検証モックの生成メソッド
    redirect: vi.fn(), // redirectモックの生成メソッド
    notFound: vi.fn(), // notFoundモックの生成メソッド
    rethrow: vi.fn(), // Next制御例外の再送出モックの生成メソッド
  }),
);
vi.mock( // Supabase境界を置換するメソッド
  "@/src/infrastructure/supabase/server",
  /**
   * 実Authへ接続せず、getUserの応答だけを返すclientを作る。
   */
  () => ({ // モジュール置換コールバック
    createClient:
      /**
       * Auth本人検証のモックだけを持つサーバーclientを返す。
       */
      async () => ({ // client生成の非同期コールバック
        auth: {
          getUser: mocks.getUser, // 本人検証モックの関数参照
        },
      }),
  }),
);
vi.mock( // dotenv読込と実DB接続を防ぐ置換メソッド
  "@/src/infrastructure/prisma/client",
  /**
   * 認可に必要なPlatformAdminの読取だけを公開する。
   */
  () => ({ // モジュール置換コールバック
    prisma: {
      platformAdmin: {
        findFirst: mocks.actor, // 管理者読取モックの関数参照
      },
    },
  }),
);
vi.mock( // Service境界を置換するメソッド
  "@/src/application/platform/support/update-platform-support",
  /**
   * DB更新やメール送信を起動せず、操作別の結果を返す。
   */
  () => ({ // モジュール置換コールバック
    updatePlatformSupportStatus: mocks.status, // status更新Serviceのモック関数参照
    updatePlatformSupportNote: mocks.note, // メモ保存Serviceのモック関数参照
  }),
);
vi.mock( // 再検証APIを置換するメソッド
  "next/cache",
  /**
   * 実キャッシュを変更せず、固定パスへの呼出しだけを記録する。
   */
  () => ({ // モジュール置換コールバック
    revalidatePath: mocks.revalidate, // 再検証モックの関数参照
  }),
);
vi.mock( // Next制御APIを置換するメソッド
  "next/navigation",
  /**
   * redirect・404の制御例外と、再送出の境界をテストできるようにする。
   */
  () => ({ // モジュール置換コールバック
    redirect: mocks.redirect, // redirectモックの関数参照
    notFound: mocks.notFound, // notFoundモックの関数参照
    unstable_rethrow: mocks.rethrow, // 制御例外再送出モックの関数参照
  }),
);

/**
 * Nextが処理する制御例外を、通常のアプリ例外と区別する試験用クラス。
 */
class ControlError extends Error {} // 試験用制御例外クラス / Errorクラス

const USER_ID = "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6";
const REPORT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
const VERSION = "2026-10-25T10:00:00.000Z";
const NEXT_VERSION = "2026-10-26T01:00:00.000Z";
const SECRET = "test-only-private-password-token@example.test";

/**
 * 行ごとの初期stateを作り、前stateには認可情報を含めない。
 */
function state(): PlatformSupportActionState { // 初期state生成関数 / 管理操作state型
  return {
    status: "idle",
    values: {
      expectedUpdatedAt: VERSION,
    },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
}

/**
 * 行の識別値と操作別の単一項目を持つFormDataを生成する。
 */
function form(kind: "STATUS" | "NOTE"): FormData { // フォーム生成関数 / 操作名型 / FormData型
  const data = new FormData(); // フォーム値を保持するコンストラクター
  data.set("reportId", REPORT_ID); // 対象IDの設定メソッド
  data.set("requestId", REQUEST_ID); // requestIdの設定メソッド
  data.set("expectedUpdatedAt", VERSION); // versionの設定メソッド
  data.set(kind === "STATUS" ? "status" : "internalNote", kind === "STATUS" ? "RESOLVED" : " メモ "); // 操作別の項目を設定するメソッド
  return data;
}

beforeEach( // 各試験の準備を登録する関数
  /**
   * 本人・最新権限・更新結果を初期化し、制御例外の挙動を設定する。
   */
  () => { // 前処理コールバック
    vi.resetAllMocks(); // モック実装と履歴の初期化メソッド
    mocks.getUser.mockResolvedValue({ // Auth本人応答の設定メソッド
      data: { user: { id: USER_ID } },
      error: null,
    });
    mocks.actor.mockResolvedValue({ // 管理者応答の設定メソッド
      id: USER_ID,
      role: "DEVELOPER",
      isActive: true,
    });
    for (const service of [mocks.status, mocks.note]) { // 操作別Serviceモックの関数参照
      service.mockResolvedValue({ // 更新成功応答の設定メソッド
        outcome: "UPDATED",
        reportId: REPORT_ID,
        updatedAt: NEXT_VERSION,
      });
    }
    mocks.redirect.mockImplementation( // redirectの実装設定メソッド
      /**
       * 実redirectのように制御例外で処理を中断する。
       */
      () => { // redirectのコールバック
        throw new ControlError("NEXT_REDIRECT"); // 試験用制御例外のコンストラクター
      },
    );
    mocks.notFound.mockImplementation( // notFoundの実装設定メソッド
      /**
       * 実notFoundのように制御例外で処理を中断する。
       */
      () => { // notFoundのコールバック
        throw new ControlError("NEXT_NOT_FOUND"); // 試験用制御例外のコンストラクター
      },
    );
    mocks.rethrow.mockImplementation( // 制御例外再送出の実装設定メソッド
      /**
       * 試験用Next制御例外だけを再送出し、通常例外は戻す。
       */
      (error: unknown) => { // 再送出コールバック / 不明値型
        if (error instanceof ControlError) { // 制御例外クラスの判定
          throw error;
        }
      },
    );
    for (const method of ["error", "warn", "log"] as const) { // ログメソッド名の読取専用リテラル型
      vi.spyOn(console, method).mockImplementation( // ログ監視と代替実装の設定メソッド
        /**
         * 末尾で非出力を検証するため、ログの実出力を抑制する。
         */
        () => undefined, // ログ抑制コールバック
      );
    }
  },
);
afterEach( // 後処理を登録する関数
  /**
   * PW・本文・メモ・例外をログへ出さず、consoleを復元する。
   */
  () => { // 後処理コールバック
    expect(console.error).not.toHaveBeenCalled(); // ログ関数参照 / 期待値生成・未呼出し検証メソッド
    expect(console.warn).not.toHaveBeenCalled(); // 警告関数参照 / 期待値生成・未呼出し検証メソッド
    expect(console.log).not.toHaveBeenCalled(); // 通常ログ関数参照 / 期待値生成・未呼出し検証メソッド
    vi.restoreAllMocks(); // console実装の復元メソッド
  },
);

for (const kind of ["STATUS", "NOTE"] as const) { // 操作名の読取専用リテラル型
  const action = kind === "STATUS" ? updateSupportReportStatusAction : updateSupportReportNoteAction; // 操作別Server Actionの関数参照
  const service = kind === "STATUS" ? mocks.status : mocks.note; // 対応Serviceモックの関数参照
  const other = kind === "STATUS" ? mocks.note : mocks.status; // 別操作のServiceモック関数参照

  it.each(["DEVELOPER", "SUPPORT"])( // 許可ロール別の試験定義メソッド
    `${kind}は%s本人を毎回認可し、許可入力だけで保存・固定再検証する`,
    /**
     * 実際の認可helperとRepositoryを通し、本人情報や更新列をhiddenから採用しない。
     */
    async (role) => { // 許可ロールの試験コールバック
      mocks.actor.mockResolvedValue({ // 管理者応答の設定メソッド
        id: USER_ID,
        role,
        isActive: true,
      });
      const data = form(kind); // FormData生成関数
      data.set(kind === "STATUS" ? "internalNote" : "status", SECRET); // 別操作の項目を混ぜる設定メソッド
      for (const field of [
        "userId",
        "platformAdminId",
        "handledByPlatformAdminId",
        "clubId",
        "returnTo",
        "password",
        "message",
        "notifyError",
      ]) {
        data.set(field, SECRET); // 不正な追加項目を設定するメソッド
      }
      const result = await action(REPORT_ID, state(), data); // 操作別Action関数 / 初期state生成関数
      expect(service).toHaveBeenCalledExactlyOnceWith({ // モック関数参照 / 本人contextの検証メソッド
        userId: USER_ID,
        platformAdmin: {
          id: USER_ID,
          role,
        },
      }, {
        reportId: REPORT_ID,
        requestId: REQUEST_ID,
        expectedUpdatedAt: VERSION,
        ...(kind === "STATUS" ? { status: "RESOLVED" } : { internalNote: "メモ" }),
      });
      expect(result).toMatchObject({ // 期待値生成・成功stateの比較メソッド
        status: "success",
        values: { expectedUpdatedAt: NEXT_VERSION },
        data: {
          outcome: "UPDATED",
          reportId: REPORT_ID,
          updatedAt: NEXT_VERSION,
          reloadRequired: false,
        },
      });
      expect(isRequestId(result.requestId)).toBe(true); // UUID v4検証関数 / 期待値生成・真偽比較メソッド
      expect(result.requestId).not.toBe(REQUEST_ID); // 期待値生成・識別子更新の比較メソッド
      expect(JSON.stringify(result)).not.toContain(SECRET); // JSON化・期待値生成・秘密値の非包含検証メソッド
      expect(other).not.toHaveBeenCalled(); // モック関数参照 / 別操作の未呼出し検証メソッド
      expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/platform/support"); // モック関数参照 / 固定パス検証メソッド
      expect(mocks.getUser).toHaveBeenCalledTimes(1); // モック関数参照 / Auth再確認の検証メソッド
      expect(mocks.redirect).not.toHaveBeenCalled(); // モック関数参照 / 成功時に遷移しないことの検証メソッド
    },
  );

  it.each(["未ログイン", "一般会員", "inactive"])( // 不許可の本人状態別の試験定義メソッド
    `${kind}の直呼びを%sでは拒否する`,
    /**
     * 画面や前stateの権限情報に頼らず、未認証・権限なしを実helperで拒否する。
     */
    async (mode) => { // 不許可認可の試験コールバック
      if (mode === "未ログイン") {
        mocks.getUser.mockResolvedValue({ // Auth本人応答を設定するメソッド
          data: { user: null },
          error: null,
        }); // 未認証の応答設定メソッド
      } else {
        mocks.actor.mockResolvedValue(mode === "一般会員" ? null : { // 最新管理者の応答設定メソッド
          id: USER_ID,
          role: "SUPPORT",
          isActive: false,
        });
      }
      await expect(action(REPORT_ID, state(), form(kind))).rejects.toBeInstanceOf(ControlError); // Action・state・FormData生成関数 / 制御例外の検証メソッド / 例外クラス参照
      expect(service).not.toHaveBeenCalled(); // モック関数参照 / 更新未呼出しの検証メソッド
      expect(mocks.revalidate).not.toHaveBeenCalled(); // モック関数参照 / 再検証未呼出しの検証メソッド
    },
  );

  it.each(["reportId", "requestId", "expectedUpdatedAt", "operation"])( // 項目別の試験定義メソッド
    `${kind}は%sの重複・File送信を拒否する`,
    /**
     * 同じ値の重複であっても単一値の契約を満たさなければServiceを呼ばない。
     */
    async (field) => { // 単一値の試験コールバック
      const key = field === "operation" ? kind === "STATUS" ? "status" : "internalNote" : field;
      for (const file of [false, true]) {
        const data = form(kind); // フォーム生成関数
        if (file) {
          data.set(key, new File([SECRET], "private.txt")); // 項目設定メソッド / Fileコンストラクター
        } else {
          data.append(key, data.get(key) as string); // 項目の追加・取得メソッド / 文字列型へのアサーション
        }
        const result = await action(REPORT_ID, state(), data); // Action関数 / 初期state生成関数
        expect(result.status).toBe("error"); // 期待値生成・エラー状態の比較メソッド
        expect(JSON.stringify(result)).not.toContain(SECRET); // JSON化・期待値生成・秘密値非包含の検証メソッド
      }
      expect(service).not.toHaveBeenCalled(); // モック関数参照 / 更新未呼出しの検証メソッド
    },
  );

  it.each(["target", "hidden", "version", "request"])( // 改ざん箇所別の試験定義メソッド
    `${kind}はID・version・requestIdの不整合を拒否する %s`,
    /**
     * bound IDとhiddenの一致を要求し、日時やnonceの不正を固定エラーにする。
     */
    async (mode) => { // 不整合の試験コールバック
      const data = form(kind); // フォーム生成関数
      if (mode === "hidden") {
        data.set("reportId", OTHER_ID); // hidden対象IDを変更するメソッド
      }
      if (mode === "version") {
        data.set("expectedUpdatedAt", SECRET); // versionを不正にするメソッド
      }
      if (mode === "request") {
        data.set("requestId", OTHER_ID); // requestIdを不一致にするメソッド
      }
      const result = await action(mode === "target" ? OTHER_ID : REPORT_ID, state(), data); // Action関数 / 初期state生成関数
      expect(result.status).toBe("error"); // 期待値生成・エラー状態の比較メソッド
      expect(service).not.toHaveBeenCalled(); // モック関数参照 / 更新未呼出しの検証メソッド
      expect(JSON.stringify(result)).not.toContain(SECRET); // JSON化・期待値生成・秘密値非包含の検証メソッド
    },
  );

  it.each([null, [], {}, { requestId: SECRET }])( // 入力値別の試験を定義するメソッド
    `${kind}は前stateの欠落・偽装を認可やnonceの根拠にしない %#`,
    /**
     * 前state不正では固定のフォーム期限切れを返し、認可だけは毎回実行する。
     */
    async (previous) => { // 不正な前stateの試験コールバック
      const result = await action(REPORT_ID, previous as PlatformSupportActionState, form(kind)); // Action・フォーム生成関数 / state型へのアサーション
      expect(result.status).toBe("error"); // 期待値生成・エラー状態の比較メソッド
      expect(isRequestId(result.requestId)).toBe(true); // UUID検証関数 / 期待値生成・真偽比較メソッド
      expect(service).not.toHaveBeenCalled(); // モック関数参照 / 更新未呼出しの検証メソッド
      expect(mocks.getUser).toHaveBeenCalledTimes(1); // モック関数参照 / 毎回の認可検証メソッド
    },
  );

  it.each(["FORBIDDEN", "NOT_FOUND", "CONFLICT", "INVALID_INPUT", "UPDATE_FAILED", "UNKNOWN"])( // 結果分類別の試験定義メソッド
    `${kind}は%sを固定エラーにして再検証しない`,
    /**
     * Serviceの失敗に余分な本文やメモがあってもstateへ含めない。
     */
    async (outcome) => { // 失敗結果の試験コールバック
      service.mockResolvedValue({ // Service結果の応答を設定するメソッド
        outcome,
        internalNote: SECRET,
        cause: SECRET,
      }); // 余分な列を持つ失敗応答の設定メソッド
      const result = await action(REPORT_ID, state(), form(kind)); // Action・state・フォーム生成関数
      expect(result.status).toBe("error"); // 期待値生成・エラー状態の比較メソッド
      expect(mocks.revalidate).not.toHaveBeenCalled(); // モック関数参照 / 再検証未呼出しの検証メソッド
      expect(JSON.stringify(result)).not.toContain(SECRET); // JSON化・期待値生成・秘密値非包含の検証メソッド
    },
  );

  it( // 試験を登録する関数
    `${kind}は同status等のUNCHANGEDを成功とし、再検証しない`,
    /**
     * 変更なしではDBや表示の更新を追加せず、返されたversionを保持する。
     */
    async () => { // 非更新の試験コールバック
      service.mockResolvedValue({ // Service結果の応答を設定するメソッド
        outcome: "UNCHANGED",
        reportId: REPORT_ID,
        updatedAt: VERSION,
      }); // 非更新応答の設定メソッド
      const result = await action(REPORT_ID, state(), form(kind)); // Action・state・フォーム生成関数
      expect(result.status).toBe("success"); // 期待値生成・成功状態の比較メソッド
      expect(result.values.expectedUpdatedAt).toBe(VERSION); // 期待値生成・version維持の比較メソッド
      expect(mocks.revalidate).not.toHaveBeenCalled(); // モック関数参照 / 再検証未呼出しの検証メソッド
    },
  );

  it( // 試験を登録する関数
    `${kind}は保存後の再検証失敗でも成功と再読込案内を返す`,
    /**
     * 再検証障害で更新を再実行せず、新versionと保存済み状態を維持する。
     */
    async () => { // 保存後の失敗を検証するコールバック
      mocks.revalidate.mockImplementationOnce( // 再検証失敗の実装設定メソッド
        /**
         * 通常の再検証障害を試験用例外で再現する。
         */
        () => { // 再検証障害コールバック
          throw new Error(SECRET); // 試験用Errorコンストラクター
        },
      );
      const result = await action(REPORT_ID, state(), form(kind)); // Action・state・フォーム生成関数
      expect(result).toMatchObject({ // 期待値生成・保存済み状態の比較メソッド
        status: "success",
        values: { expectedUpdatedAt: NEXT_VERSION },
        data: {
          outcome: "UPDATED",
          reloadRequired: true,
        },
      });
      expect(result.data?.message).toContain("保存済み"); // 期待値生成・保存済み案内の包含検証メソッド
      expect(service).toHaveBeenCalledTimes(1); // モック関数参照 / 保存再試行なしの検証メソッド
      expect(JSON.stringify(result)).not.toContain(SECRET); // JSON化・期待値生成・秘密値非包含の検証メソッド
      expect(mocks.redirect).not.toHaveBeenCalled(); // モック関数参照 / ページ全体遷移なしの検証メソッド
    },
  );

  it.each(["service", "revalidate"])( // 制御例外の発生箇所別の試験定義メソッド
    `${kind}は%sのNext制御例外を再送出する`,
    /**
     * Nextの画面遷移や404処理を、通常の固定エラーに変換しない。
     */
    async (stage) => { // 制御例外の試験コールバック
      const error = new ControlError("NEXT_CONTROL"); // 制御例外のコンストラクター
      if (stage === "service") {
        service.mockRejectedValue(error); // 制御例外応答の設定メソッド
      } else {
        mocks.revalidate.mockImplementationOnce( // 再検証中の制御例外を設定するメソッド
          /**
           * 再検証中のNext制御例外を再現する。
           */
          () => { // 制御例外コールバック
            throw error;
          },
        );
      }
      await expect(action(REPORT_ID, state(), form(kind))).rejects.toBe(error); // Action・state・フォーム生成関数 / 同じ例外の検証メソッド
      expect(mocks.rethrow).toHaveBeenCalledWith(error); // モック関数参照 / 再送出呼出しの検証メソッド
      expect(service).toHaveBeenCalledTimes(1); // モック関数参照 / 更新再試行なしの検証メソッド
    },
  );

  it( // 試験を登録する関数
    `${kind}は秘密値入りService例外を固定エラーにする`,
    /**
     * 例外原文や内部メモをstateへ含めず、再検証・再試行しない。
     */
    async () => { // 通常例外の試験コールバック
      service.mockRejectedValue(new Error(SECRET)); // 失敗応答設定メソッド / Errorコンストラクター
      const result = await action(REPORT_ID, state(), form(kind)); // Action・state・フォーム生成関数
      expect(result.status).toBe("error"); // 期待値生成・エラー状態の比較メソッド
      expect(JSON.stringify(result)).not.toContain(SECRET); // JSON化・期待値生成・秘密値非包含の検証メソッド
      expect(mocks.revalidate).not.toHaveBeenCalled(); // モック関数参照 / 再検証未呼出しの検証メソッド
      expect(service).toHaveBeenCalledTimes(1); // モック関数参照 / 更新再試行なしの検証メソッド
    },
  );
}

for (const kind of ["STATUS", "NOTE"] as const) { // 操作名の読取専用リテラル型
  const action = kind === "STATUS" ? updateSupportReportStatusAction : updateSupportReportNoteAction; // 操作別Actionの関数参照
  const service = kind === "STATUS" ? mocks.status : mocks.note; // 操作別Serviceモックの関数参照

  it( // 試験を登録する関数
    `${kind}は前stateのversion・エラー・成功情報を引き継がない`,
    /**
     * 前stateの値ではなく単一hidden値をServiceへ渡し、古いエラーやメモを返さない。
     */
    async () => { // 前state改ざんの試験コールバック
      const previous = state(); // 初期stateの生成関数
      previous.status = "success";
      previous.values.expectedUpdatedAt = SECRET;
      previous.formError = SECRET;
      previous.fieldErrors.internalNote = [SECRET];
      const result = await action(REPORT_ID, previous, form(kind)); // Action・フォーム生成関数
      expect(service.mock.calls[0][1].expectedUpdatedAt).toBe(VERSION); // 期待値生成・hidden version優先の比較メソッド
      expect(result.status).toBe("success"); // 期待値生成・成功状態の比較メソッド
      expect(JSON.stringify(result)).not.toContain(SECRET); // JSON化・期待値生成・秘密値非包含の検証メソッド
      expect(mocks.getUser).toHaveBeenCalledTimes(1); // モック関数参照 / 毎回の本人確認の検証メソッド
    },
  );

  it.each(["auth", "database"])( // 認可処理の障害箇所別の試験定義メソッド
    `${kind}は%sの通常例外を原文なしの固定エラーにする`,
    /**
     * Authや権限DBの障害では更新を呼ばず、Next制御例外との区別を維持する。
     */
    async (stage) => { // 認可基盤障害の試験コールバック
      const boundary = stage === "auth" ? mocks.getUser : mocks.actor; // 障害を発生させるモック関数参照
      boundary.mockRejectedValue(new Error(SECRET)); // 失敗応答の設定メソッド / Errorコンストラクター
      const result = await action(REPORT_ID, state(), form(kind)); // Action・state・フォーム生成関数
      expect(result.status).toBe("error"); // 期待値生成・エラー状態の比較メソッド
      expect(JSON.stringify(result)).not.toContain(SECRET); // JSON化・期待値生成・秘密値非包含の検証メソッド
      expect(service).not.toHaveBeenCalled(); // モック関数参照 / 更新未呼出しの検証メソッド
      expect(mocks.revalidate).not.toHaveBeenCalled(); // モック関数参照 / 再検証未呼出しの検証メソッド
    },
  );
}
