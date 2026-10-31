// src/application/platform/support/update-platform-support.test.ts
// 実DB・Authを使わず、操作値の再検証・context優先・最小結果・安全なログを確認する。

import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import type {
  PlatformAdminAccessContext, // Auth本人とPlatform管理者をまとめた認可context型
} from "@/app/(club-app)/platform/require-platform-admin";
import {
  updatePlatformSupportNote, // contextとメモ入力から最小の更新結果を返すApplication Service関数
  updatePlatformSupportStatus, // contextとstatus入力から最小の更新結果を返すApplication Service関数
} from "./update-platform-support";

const mocks = vi.hoisted( // import評価前にモックを準備するメソッド
  /**
   * DB・dotenvを起動しないよう、2種類の更新Repositoryを置換する。
   */
  () => ({ // モック生成コールバック
    status: vi.fn(), // status更新モックの生成メソッド
    note: vi.fn(), // メモ更新モックの生成メソッド
  }),
);
vi.mock( // 更新Repositoryの境界を置換するメソッド
  "@/src/infrastructure/prisma/repositories/platform-support-report-mutation-repository",
  /**
   * 更新結果のモックだけを公開し、実DBや通知処理を起動しない。
   */
  () => ({ // モジュール置換コールバック
    updateSupportReportStatusForPlatform: mocks.status, // status更新モックの関数参照
    updateSupportReportNoteForPlatform: mocks.note, // メモ更新モックの関数参照
  }),
);

const USER_ID = "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6";
const REPORT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const VERSION = "2026-10-25T10:00:00.000Z";
const NEXT_VERSION = "2026-10-25T11:00:00.000Z";
const SECRET = "test-only-private-token@example.test";
const context: PlatformAdminAccessContext = { // サーバー認可contextの型
  userId: USER_ID,
  platformAdmin: {
    id: USER_ID,
    role: "DEVELOPER",
  },
};
const identity = {
  reportId: REPORT_ID,
  requestId: REQUEST_ID,
  expectedUpdatedAt: VERSION,
};

beforeEach( // 前処理を登録する関数
  /**
   * モック応答を初期化し、成功結果とログ監視を用意する。
   */
  () => { // 前処理コールバック
    vi.resetAllMocks(); // モック履歴・実装の初期化メソッド
    for (const repository of [mocks.status, mocks.note]) { // 更新Repositoryモックの関数参照
      repository.mockResolvedValue({ // 成功応答の設定メソッド
        outcome: "UPDATED",
        reportId: REPORT_ID,
        updatedAt: NEXT_VERSION,
      });
    }
    vi.spyOn(console, "error").mockImplementation( // ログ監視と代替実装の設定メソッド
      /**
       * ログ内容を検査するため、実出力だけを抑制する。
       */
      () => undefined, // ログ抑制のコールバック
    );
  },
);
afterEach( // 後処理を登録する関数
  /**
   * すべてのログで試験用秘密値の非出力を確認し、consoleを復元する。
   */
  () => { // 後処理コールバック
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(SECRET); // JSON化・モック取得・期待値生成・非包含検証メソッド
    vi.restoreAllMocks(); // consoleを復元するメソッド
  },
);

for (const kind of ["STATUS", "NOTE"] as const) { // 操作名を固定する読取専用リテラル型
  const service = kind === "STATUS" ? updatePlatformSupportStatus : updatePlatformSupportNote; // 操作別Serviceの関数参照
  const repository = kind === "STATUS" ? mocks.status : mocks.note; // 操作別Repositoryモックの関数参照
  const otherRepository = kind === "STATUS" ? mocks.note : mocks.status; // 別操作のモック関数参照
  const input = {
    ...identity,
    status: "RESOLVED",
    internalNote: " メモ\n本文 ",
  };

  it.each(["DEVELOPER", "SUPPORT"] as const)( // ロール別の試験定義メソッド / 読取専用リテラル型
    `${kind}は%sのcontextと許可操作値だけをRepositoryへ渡す`,
    /**
     * 入力内の本人・対応者・クラブ・日時・通知列を無視し、選択した操作だけを呼ぶ。
     */
    async (role) => { // context優先の試験コールバック
      await service({ // 操作別Application Service関数
        ...context,
        platformAdmin: {
          id: USER_ID,
          role,
        },
      }, {
        ...input,
        userId: "other-user",
        platformAdminId: "other-user",
        handledByPlatformAdminId: "other-user",
        clubId: "other-club",
        membershipId: "other-member",
        message: SECRET,
        reporterEmail: SECRET,
        statusChangedAt: SECRET,
        resolvedAt: SECRET,
        notifyError: SECRET,
        updatedAt: SECRET,
      });
      const operationValue = kind === "STATUS" ? {
        status: "RESOLVED",
      } : {
        internalNote: "メモ\n本文",
      };
      expect(repository).toHaveBeenCalledExactlyOnceWith({ // モック関数参照 / 呼出し引数の検証メソッド
        userId: USER_ID,
        platformAdminId: USER_ID,
        ...identity,
        ...operationValue,
      });
      expect(otherRepository).not.toHaveBeenCalled(); // モック関数参照 / 別操作の未呼出し検証メソッド
      expect(console.error).not.toHaveBeenCalled(); // ログ関数参照 / 成功時の非出力検証メソッド
    },
  );

  it.each(["UPDATED", "UNCHANGED"])( // 成功分類別の試験定義メソッド
    `${kind}の%sでは報告IDとversionだけを返す`,
    /**
     * Repositoryが成功応答へ添えた本文・内部メモ・例外情報を除く。
     */
    async (outcome) => { // 最小成功結果の試験コールバック
      repository.mockResolvedValue({ // 余分な項目を持つ成功応答の設定メソッド
        outcome,
        reportId: REPORT_ID,
        updatedAt: outcome === "UNCHANGED" ? VERSION : NEXT_VERSION,
        internalNote: SECRET,
        report: { message: SECRET },
        cause: SECRET,
      });
      await expect(service(context, input)).resolves.toEqual({ // 操作別Service関数 / 非同期結果の比較メソッド
        outcome,
        reportId: REPORT_ID,
        updatedAt: outcome === "UNCHANGED" ? VERSION : NEXT_VERSION,
      });
    },
  );

  it.each(["FORBIDDEN", "NOT_FOUND", "CONFLICT", "INVALID_INPUT", "UPDATE_FAILED"])( // 固定失敗分類別の試験定義メソッド
    `${kind}の%sでは部分結果も返さない`,
    /**
     * 失敗応答は分類だけへ限定し、本文・メモ・versionを含めない。
     */
    async (outcome) => { // 固定失敗結果の試験コールバック
      repository.mockResolvedValue({ // 部分結果を持つ失敗応答の設定メソッド
        outcome,
        reportId: REPORT_ID,
        updatedAt: NEXT_VERSION,
        message: SECRET,
        internalNote: SECRET,
      });
      await expect(service(context, input)).resolves.toEqual({ outcome }); // 操作別Service関数 / 非同期結果の比較メソッド
      expect(repository).toHaveBeenCalledTimes(1); // モック関数参照 / 自動再試行なしの検証メソッド
    },
  );

  it.each([null, {}, { // 入力値別の試験を定義するメソッド
    ...context,
    userId: " ",
  }, {
    ...context,
    platformAdmin: {
      id: "other-user",
      role: "DEVELOPER",
    },
  }, {
    ...context,
    platformAdmin: {
      id: USER_ID,
      role: "OWNER",
    },
  }])(
    `${kind}は不正contextで更新しない %#`,
    /**
     * 認可contextの欠落・不一致・一般会員はDB前で拒否する。
     */
    async (value) => { // 不正contextの試験コールバック
      await expect(service( // 操作別Service関数 / 非同期結果の期待値生成関数
        value as PlatformAdminAccessContext, // 不正contextを再現する型アサーション
        input,
      )).resolves.toEqual({ outcome: "FORBIDDEN" }); // 非同期結果の比較メソッド
      expect(repository).not.toHaveBeenCalled(); // モック関数参照 / DB未呼出しの検証メソッド
    },
  );

  it.each([null, [], SECRET, {}, { // 入力値別の試験を定義するメソッド
    ...input,
    requestId: SECRET,
  }, {
    ...input,
    reportId: SECRET,
  }, {
    ...input,
    expectedUpdatedAt: SECRET,
  }])(
    `${kind}は識別値の不正を再検証し、DB・ログへ渡さない %#`,
    /**
     * 不正なrequestIdやversionを、固定ログの識別値としても利用しない。
     */
    async (value) => { // 不正識別値の試験コールバック
      await expect(service(context, value)).resolves.toEqual({ // 操作別Service関数 / 非同期結果の比較メソッド
        outcome: "INVALID_INPUT",
      });
      expect(repository).not.toHaveBeenCalled(); // モック関数参照 / DB未呼出しの検証メソッド
      expect(console.error).not.toHaveBeenCalled(); // ログ関数参照 / 不正入力の非出力検証メソッド
    },
  );

  it.each([null, { outcome: SECRET }, { // 入力値別の試験を定義するメソッド
    outcome: "UPDATED",
    reportId: "other-report",
    updatedAt: NEXT_VERSION,
  }, {
    outcome: "UPDATED",
    reportId: REPORT_ID,
    updatedAt: SECRET,
  }])(
    `${kind}は契約外の返却値をUPDATE_FAILEDへ限定する %#`,
    /**
     * 未知分類・他の報告ID・不正versionを成功として公開しない。
     */
    async (value) => { // 契約外結果の試験コールバック
      repository.mockResolvedValue(value); // 不正な結果の応答設定メソッド
      await expect(service(context, input)).resolves.toEqual({ // 操作別Service関数 / 非同期結果の比較メソッド
        outcome: "UPDATE_FAILED",
      });
    },
  );

  it( // 試験を登録する関数
    `${kind}は秘密値入り例外とログ障害でも固定分類を維持する`,
    /**
     * 例外原文をsanitizeへ渡さず、検証済みrequestIdと固定値だけを記録する。
     */
    async () => { // 例外安全化の試験コールバック
      repository.mockRejectedValue(new Error(SECRET)); // 失敗応答の設定メソッド / Errorコンストラクター
      vi.mocked(console.error).mockImplementation( // ログ監視対象を置換するメソッド
        /**
         * ログ基盤自体の障害を試験用例外で再現する。
         */
        () => { // ログ障害のコールバック
          throw new Error(SECRET); // 試験用Errorコンストラクター
        },
      );
      await expect(service(context, input)).resolves.toEqual({ // 操作別Service関数 / 非同期結果の比較メソッド
        outcome: "UPDATE_FAILED",
      });
      expect(repository).toHaveBeenCalledTimes(1); // モック関数参照 / 再試行なしの検証メソッド
      expect(vi.mocked(console.error).mock.calls[0]).toEqual([ // モック取得・期待値生成・固定ログの比較メソッド
        "platform_support_operation_failed",
        {
          requestId: REQUEST_ID,
          operation: kind === "STATUS" ? "platformSupport.status" : "platformSupport.note",
          result: "UPDATE_FAILED",
          errorCode: "INTERNAL",
        },
      ]);
    },
  );
}

it.each(["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED"])( // 許可status別の試験定義メソッド
  "%sを再検証し、メモ保存を呼ばない",
  /**
   * status値は変更せず渡し、状態日時の決定をRepositoryへ委ねる。
   */
  async (status) => { // 許可statusの試験コールバック
    await updatePlatformSupportStatus(context, { // status更新のApplication Service関数
      ...identity,
      status,
    });
    expect(mocks.status.mock.calls[0][0].status).toBe(status); // 期待値生成・statusの比較メソッド
    expect(mocks.note).not.toHaveBeenCalled(); // モック関数参照 / メモ更新未呼出しの検証メソッド
  },
);

it.each([" メモ ", "", "　 \n", null, "あ".repeat(5000)])( // メモ境界別の試験定義メソッド / 文字列反復メソッド
  "メモをtrim・空欄nullへ正規化して渡す %#",
  /**
   * 上限以内のメモだけを渡し、対応者と状態日時の決定をRepositoryへ委ねる。
   */
  async (internalNote) => { // メモ正規化の試験コールバック
    await updatePlatformSupportNote(context, { // メモ保存のApplication Service関数
      ...identity,
      internalNote,
    });
    expect(mocks.note.mock.calls[0][0].internalNote).toBe(internalNote?.trim() || null); // 空白除去・期待値生成・メモ比較メソッド
    expect(mocks.status).not.toHaveBeenCalled(); // モック関数参照 / status更新未呼出しの検証メソッド
  },
);

it.each(["UNKNOWN", null, ["OPEN"]])( // 入力値別の試験を定義するメソッド
  "不正なstatus値は更新しない %#",
  /**
   * statusの型・許可値を共通契約で再検証する。
   */
  async (status) => { // 不正statusの試験コールバック
    await expect(updatePlatformSupportStatus(context, { // status更新関数 / 非同期結果の期待値生成関数
      ...identity,
      status,
    })).resolves.toEqual({ outcome: "INVALID_INPUT" }); // 非同期結果の比較メソッド
    expect(mocks.status).not.toHaveBeenCalled(); // モック関数参照 / 未呼出しの検証メソッド
  },
);

it.each([undefined, 1, {}, "あ".repeat(5001)])( // 不正メモ別の試験定義メソッド / 文字列反復メソッド
  "不正・上限超過のメモは切り捨てず拒否する %#",
  /**
   * メモを不正なままRepositoryへ渡さず、固定分類だけを返す。
   */
  async (internalNote) => { // 不正メモの試験コールバック
    await expect(updatePlatformSupportNote(context, { // メモ更新関数 / 非同期結果の期待値生成関数
      ...identity,
      internalNote,
    })).resolves.toEqual({ outcome: "INVALID_INPUT" }); // 非同期結果の比較メソッド
    expect(mocks.note).not.toHaveBeenCalled(); // モック関数参照 / 未呼出しの検証メソッド
  },
);
