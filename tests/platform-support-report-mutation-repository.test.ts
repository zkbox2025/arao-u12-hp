// tests/platform-support-report-mutation-repository.test.ts
// 実DB・dotenv・Authを使わず、管理更新の認可・条件付き書込・限定列・rollbackを確認する。

import { Prisma } from "@prisma/client";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import {
  updateSupportReportNoteForPlatform, // 本人contextとメモ入力から限定列を保存する関数
  updateSupportReportStatusForPlatform, // 本人contextとstatus入力から実変更時だけ管理列を更新する関数
  type UpdateSupportReportNoteForPlatformInput, // 本人照合情報とメモ保存入力をまとめた型
  type UpdateSupportReportStatusForPlatformInput, // 本人照合情報とstatus変更入力をまとめた型
} from "@/src/infrastructure/prisma/repositories/platform-support-report-mutation-repository";
import type {
  SupportReportStatus, // サポート報告ステータスの型
} from "@/types/prisma";

const mocks = vi.hoisted( // import評価前にモックを準備するメソッド
  /**
   * 実接続を防ぐtransactionと、必要なモデル操作だけを置換するモックを用意する。
   */
  () => ({ // モック生成コールバック
    transaction: vi.fn(), // transaction用モック関数の生成メソッド
    actor: vi.fn(), // 管理者読取モック関数の生成メソッド
    report: vi.fn(), // 報告読取モック関数の生成メソッド
    update: vi.fn(), // 条件付き更新モック関数の生成メソッド
  }),
);

vi.mock( // dotenv読込と実DB接続を防ぐモジュール置換メソッド
  "@/src/infrastructure/prisma/client",
  /**
   * モデルの直接操作を公開せず、transaction内だけで更新を実行できるようにする。
   */
  () => ({ // モジュール置換コールバック
    prisma: {
      $transaction: mocks.transaction, // transaction用モック関数参照
    },
  }),
);

const USER_ID = "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6";
const REPORT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-25T11:00:00.000Z"); // サーバー現在時刻を固定するDateコンストラクター
const INITIAL_VERSION = "2026-10-25T10:00:00.000Z";
const PRIVATE_DETAIL = "test-only-private-db-error";
const statuses = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED"] as const; // 全statusの読取専用リテラル型

/**
 * 許可列以外の不変も確認するため、報告行の保存状態を模した型。
 */
type StoredReport = { // テスト内の保存行の型
  id: string; // 報告IDの文字列型
  updatedAt: Date; // versionを保持するDate型
  status: SupportReportStatus; // 報告ステータスの型
  handledByPlatformAdminId: string | null; // 対応者IDまたは未設定の型
  statusChangedAt: Date | null; // 状態変更日時または未設定の型
  resolvedAt: Date | null; // 解決日時または未設定の型
  internalNote: string | null; // 保存済みメモまたは未設定の型
  message: string; // 本文の文字列型
  clubId: string; // 所属クラブIDの文字列型
  membershipId: string | null; // 報告時所属IDまたは削除済みの型
  reporterName: string | null; // 報告時氏名または未設定の型
  reporterEmail: string | null; // 報告時メールまたは未設定の型
  notifiedAt: Date | null; // 通知受付日時または未受付の型
  notifyError: string | null; // 通知エラーまたは未設定の型
};

let stored: StoredReport | null; // 現在の保存行または削除済みの型
let actor: unknown; // 型を偽装した不正応答も渡せる管理者応答の型
let tail: Promise<unknown>; // モックtransactionを直列化する非同期型

/**
 * DBの報告状態を用意し、更新対象外の本文・snapshot・通知列も保持する。
 */
function report(): StoredReport { // 初期DB行の生成関数 / 保存行の型
  return {
    id: REPORT_ID,
    updatedAt: new Date(INITIAL_VERSION), // 初期versionのDateコンストラクター
    status: "OPEN",
    handledByPlatformAdminId: "previous-handler",
    statusChangedAt: new Date("2026-10-24T09:00:00.000Z"), // 変更前の状態日時のDateコンストラクター
    resolvedAt: null,
    internalNote: "以前の内部メモ",
    message: "本文を変更しない",
    clubId: "club-without-membership",
    membershipId: null,
    reporterName: "保存時氏名",
    reporterEmail: "snapshot@example.test",
    notifiedAt: new Date("2026-10-25T10:30:00.000Z"), // 通知受付日時のDateコンストラクター
    notifyError: null,
  };
}

/**
 * statusと識別値に、サーバー由来の本人情報を加えた入力を作る。
 */
function statusInput( // status試験入力の生成関数
  status: SupportReportStatus = "RESOLVED", // 更新先ステータスの型
): UpdateSupportReportStatusForPlatformInput { // status更新Repositoryの入力型
  return {
    userId: USER_ID,
    platformAdminId: USER_ID,
    reportId: REPORT_ID,
    expectedUpdatedAt: INITIAL_VERSION,
    requestId: REQUEST_ID,
    status,
  };
}

/**
 * 識別値と本人情報を保ち、内部メモの保存入力を作る。
 */
function noteInput( // メモ試験入力の生成関数
  internalNote: string | null = " 新しい内部メモ ", // 保存する文字列またはnull型
): UpdateSupportReportNoteForPlatformInput { // メモ更新Repositoryの入力型
  return {
    userId: USER_ID,
    platformAdminId: USER_ID,
    reportId: REPORT_ID,
    expectedUpdatedAt: INITIAL_VERSION,
    requestId: REQUEST_ID,
    internalNote,
  };
}

/**
 * 本物のPrisma既知エラーを作り、codeだけを持つ任意の例外と区別する。
 */
function prismaError(code: string) { // 既知エラーの生成関数 / コードの文字列型
  return new Prisma.PrismaClientKnownRequestError(PRIVATE_DETAIL, { // Prisma既知エラーのコンストラクター
    code,
    clientVersion: "test",
  });
}

beforeEach( // 試験ごとの準備を登録する関数
  /**
   * DBなしの保存状態を初期化し、SQLの代替ではなくCAS条件とrollback境界だけを模す。
   */
  () => { // 前処理コールバック
    vi.resetAllMocks(); // モック実装と履歴を初期化するメソッド
    vi.useFakeTimers(); // 時刻を固定できるタイマーへ切り替えるメソッド
    vi.setSystemTime(NOW); // サーバー時刻を設定するメソッド
    stored = report(); // 初期DB行の生成関数
    actor = {
      id: USER_ID,
      role: "DEVELOPER",
      isActive: true,
    };
    tail = Promise.resolve(); // transaction直列化の初期Promiseを作るメソッド
    mocks.actor.mockImplementation( // 管理者読取のモック実装を設定するメソッド
      /**
       * 呼出し時点の最新管理者応答を参照共有せず返す。
       */
      async () => structuredClone(actor), // 非同期コールバック / 応答を複製する関数
    );
    mocks.report.mockImplementation( // 報告読取のモック実装を設定するメソッド
      /**
       * 指定されたIDの保存行だけを返し、存在しない場合はnullにする。
       */
      async ({ where }: { // 報告読取コールバック / 条件オブジェクトの型
        where: { id: string }; // 報告IDを持つ条件型
      }) => stored?.id === where.id ? structuredClone(stored) : null, // 保存行を複製する関数
    );
    mocks.update.mockImplementation( // 条件付き更新のモック実装を設定するメソッド
      /**
       * IDとversionが一致する場合だけ渡された列を変更し、更新件数を返す。
       */
      async ({ where, data }: { // 更新コールバック / 更新条件と値の型
        where: { // 条件付き更新の検索型
          id: string; // 対象IDの文字列型
          updatedAt: Date; // 期待versionのDate型
        };
        data: Partial<StoredReport>; // 保存行の一部だけを変更する型
      }) => {
        if (
          !stored ||
          stored.id !== where.id ||
          stored.updatedAt.getTime() !== where.updatedAt.getTime() // versionをミリ秒で比較するメソッド
        ) {
          return { count: 0 };
        }
        Object.assign(stored, structuredClone(data)); // 限定更新列を保存行へ反映するメソッド / 複製関数
        return { count: 1 };
      },
    );
    mocks.transaction.mockImplementation( // transaction実行のモックを設定するメソッド
      /**
       * コールバックを直列化し、例外時だけ保存状態を戻して原子性の境界を検証する。
       */
      ( // transaction実行のコールバック
        operation: (transaction: unknown) => Promise<unknown>, // transaction実行関数型 / 非同期型
        options: unknown, // transaction設定の不明値型
      ) => {
        expect(options).toEqual({ // 期待値生成・分離レベルの比較メソッド
          isolationLevel: "Serializable",
        });
        /**
         * transaction前の状態を保存し、モデル操作の例外時に復元する。
         */
        async function execute() { // transaction本体を実行する関数
          const before = structuredClone(stored); // 保存状態を複製する関数
          try {
            return await operation({ // Repositoryのtransactionコールバックを呼ぶ関数
              platformAdmin: {
                findFirst: mocks.actor, // 管理者読取のモック関数参照
              },
              supportReport: {
                findFirst: mocks.report, // 報告読取のモック関数参照
                updateMany: mocks.update, // 条件付き更新のモック関数参照
              },
            });
          } catch (error) {
            stored = before;
            throw error;
          }
        }
        const result = tail.then(execute); // transactionを直列実行するメソッド / 実行関数参照
        tail = result.catch( // 次のtransactionを実行できるよう拒否を消費するメソッド
          /**
           * 前transactionの失敗を直列化用の待機列へ残さない。
           */
          () => undefined, // 失敗を消費するコールバック
        );
        return result;
      },
    );
    for (const method of ["error", "warn", "log"] as const) { // consoleメソッド名の読取専用リテラル型
      vi.spyOn(console, method).mockImplementation( // ログ出力の監視・代替実装設定メソッド
        /**
         * 非出力を後で検証するためにconsoleの実出力を抑制する。
         */
        () => undefined, // ログを抑制するコールバック
      );
    }
  },
);

afterEach( // 試験の後処理を登録する関数
  /**
   * 全経路で機密ログの非出力を確認し、タイマーとconsoleを復元する。
   */
  () => { // 後処理コールバック
    expect(console.error).not.toHaveBeenCalled(); // ログ関数参照 / 期待値生成・未呼出し検証メソッド
    expect(console.warn).not.toHaveBeenCalled(); // 警告関数参照 / 期待値生成・未呼出し検証メソッド
    expect(console.log).not.toHaveBeenCalled(); // 通常ログ関数参照 / 期待値生成・未呼出し検証メソッド
    vi.useRealTimers(); // 実タイマーへ戻すメソッド
    vi.restoreAllMocks(); // consoleの実装を復元するメソッド
  },
);

for (const current of statuses) {
  it.each(statuses)( // 遷移先ごとの試験定義メソッド
    `${current}から%sへの遷移で許可された列だけを更新する`,
    /**
     * 全16通りの遷移について、非更新・担当者・状態日時・解決日時を検証する。
     */
    async (next) => { // status遷移の試験コールバック
      stored!.status = current;
      stored!.resolvedAt = current === "RESOLVED"
        ? new Date("2026-10-24T09:00:00.000Z") // 既存解決日時のDateコンストラクター
        : null;
      const before = structuredClone(stored!); // 更新前の保存行を複製する関数
      const result = await updateSupportReportStatusForPlatform(statusInput(next)); // status更新関数 / 入力生成関数
      if (current === next) {
        expect(result).toEqual({ // 期待値生成・非更新結果の比較メソッド
          outcome: "UNCHANGED",
          reportId: REPORT_ID,
          updatedAt: INITIAL_VERSION,
        });
        expect(stored).toEqual(before); // 期待値生成・全列不変の比較メソッド
        expect(mocks.update).not.toHaveBeenCalled(); // モック関数参照 / 更新未呼出しの検証メソッド
        return;
      }
      expect(result).toEqual({ // 期待値生成・成功結果の比較メソッド
        outcome: "UPDATED",
        reportId: REPORT_ID,
        updatedAt: NOW.toISOString(), // サーバー日時をUTC ISO化するメソッド
      });
      expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ // モック関数参照 / 更新条件・列の検証メソッド
        where: {
          id: REPORT_ID,
          updatedAt: new Date(INITIAL_VERSION), // 期待versionのDateコンストラクター
        },
        data: {
          status: next,
          handledByPlatformAdminId: USER_ID,
          statusChangedAt: NOW,
          resolvedAt: next === "RESOLVED" ? NOW : null,
          updatedAt: NOW,
        },
      });
      expect(stored).toEqual({ // 期待値生成・対象外の列も含む保存状態の比較メソッド
        ...before,
        status: next,
        handledByPlatformAdminId: USER_ID,
        statusChangedAt: NOW,
        resolvedAt: next === "RESOLVED" ? NOW : null,
        updatedAt: NOW,
      });
    },
  );
}

it.each(["DEVELOPER", "SUPPORT"])( // 両許可ロールの試験定義メソッド
  "%s本人だけを照合し、所属なしでメモ更新できる",
  /**
   * 認可条件・限定select・処理順を確認し、MembershipやAppUserを利用しない。
   */
  async (role) => { // 管理者本人の試験コールバック
    actor = {
      id: USER_ID,
      role,
      isActive: true,
    };
    await expect(updateSupportReportNoteForPlatform(noteInput())).resolves.toEqual({ // メモ更新・入力生成関数 / 非同期結果の比較メソッド
      outcome: "UPDATED",
      reportId: REPORT_ID,
      updatedAt: NOW.toISOString(), // 更新日時をUTC ISO化するメソッド
    });
    expect(mocks.actor).toHaveBeenCalledExactlyOnceWith({ // モック関数参照 / 本人権限の条件検証メソッド
      where: {
        id: USER_ID,
        isActive: true,
        role: {
          in: ["DEVELOPER", "SUPPORT"],
        },
      },
      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith({ // モック関数参照 / 報告の限定select検証メソッド
      where: {
        id: REPORT_ID,
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });
    expect(mocks.actor.mock.invocationCallOrder[0]) // 呼出し順序の期待値生成関数
      .toBeLessThan(mocks.report.mock.invocationCallOrder[0]); // 権限確認の先行を比較するメソッド
    expect(stored).toEqual({ // 期待値生成・メモ限定更新の比較メソッド
      ...report(), // 初期DB行の生成関数
      internalNote: "新しい内部メモ",
      handledByPlatformAdminId: USER_ID,
      updatedAt: NOW,
    });
  },
);

it.each([" メモ\n本文 ", "", "　 \t\n", null, "あ".repeat(5000), "😀".repeat(2500)])( // メモ境界別の試験定義メソッド / 文字列反復メソッド
  "メモの空・null・上限を正規化し、状態日時を維持する %#",
  /**
   * 解決済みのメモでも状態日時を変更せず、対応者は本人へ更新する。
   */
  async (note) => { // メモ境界の試験コールバック
    stored!.status = "RESOLVED";
    stored!.resolvedAt = new Date("2026-10-24T09:00:00.000Z"); // 既存解決日時のDateコンストラクター
    const before = structuredClone(stored!); // 保存前の全列を複製する関数
    await expect(updateSupportReportNoteForPlatform(noteInput(note))).resolves.toMatchObject({ // メモ更新・入力生成関数 / 非同期結果の比較メソッド
      outcome: "UPDATED",
    });
    const internalNote = note?.trim() || null; // メモ前後の空白を除くメソッド
    expect(mocks.update.mock.calls[0][0].data).toEqual({ // 期待値生成・限定更新列の比較メソッド
      internalNote,
      handledByPlatformAdminId: USER_ID,
      updatedAt: NOW,
    });
    expect(stored).toEqual({ // 期待値生成・対象外の列も含む比較メソッド
      ...before,
      internalNote,
      handledByPlatformAdminId: USER_ID,
      updatedAt: NOW,
    });
  },
);

for (const mutation of [updateSupportReportStatusForPlatform, updateSupportReportNoteForPlatform]) { // status・メモ更新関数の参照
  const base = mutation === updateSupportReportStatusForPlatform ? statusInput() : noteInput(); // 更新関数参照 / 操作別の入力生成関数

  it.each([ // 入力値別の試験を定義するメソッド
    null,
    {
      id: USER_ID,
      role: "DEVELOPER",
      isActive: false,
    },
    {
      id: USER_ID,
      role: "SUPPORT",
      isActive: false,
    },
    {
      id: USER_ID,
      role: "OWNER",
      isActive: true,
    },
    {
      id: USER_ID,
      role: "FUTURE_ROLE",
      isActive: true,
    },
    {
      id: "other-user",
      role: "DEVELOPER",
      isActive: true,
    },
  ])( // 管理者応答別の試験定義メソッド
    `${mutation.name}は最新権限がない場合に対象を読まず拒否する %#`,
    /**
     * 無効化・削除・他人・一般会員・未知ロールが、対象の存在や内容を取得できない。
     */
    async (value) => { // 不許可管理者の試験コールバック
      actor = value;
      const before = structuredClone(stored); // 保存行を複製する関数
      await expect(mutation({ // 操作別更新関数 / 非同期結果の比較メソッド
        ...base,
        status: "RESOLVED",
        internalNote: "メモ",
      })).resolves.toEqual({ outcome: "FORBIDDEN" }); // 非同期結果の等値比較メソッド
      expect(mocks.report).not.toHaveBeenCalled(); // モック関数参照 / 対象未読取の検証メソッド
      expect(mocks.update).not.toHaveBeenCalled(); // モック関数参照 / 更新未呼出しの検証メソッド
      expect(stored).toEqual(before); // 期待値生成・全列不変の比較メソッド
    },
  );

  it( // 試験を登録する関数
    `${mutation.name}はversion不一致を同statusでも拒否する`,
    /**
     * 通知結果保存によるversion変化も含め、上書きせず再取得を要求する。
     */
    async () => { // version競合の試験コールバック
      stored!.updatedAt = new Date("2026-10-25T10:30:00.000Z"); // 通知保存後を模したversionのDateコンストラクター
      await expect(mutation({ // 操作別更新関数 / 非同期結果の比較メソッド
        ...base,
        status: "OPEN",
        internalNote: "メモ",
      })).resolves.toEqual({ outcome: "CONFLICT" }); // 非同期結果の等値比較メソッド
      expect(mocks.update).not.toHaveBeenCalled(); // モック関数参照 / 更新未呼出しの検証メソッド
    },
  );

  it( // 試験を登録する関数
    `${mutation.name}は削除済み報告をNOT_FOUNDにする`,
    /**
     * 初回の対象確認で存在しない場合は書き込みを行わない。
     */
    async () => { // 対象削除の試験コールバック
      stored = null;
      await expect(mutation({ // 操作別更新関数 / 非同期結果の比較メソッド
        ...base,
        status: "RESOLVED",
        internalNote: "メモ",
      })).resolves.toEqual({ outcome: "NOT_FOUND" }); // 非同期結果の等値比較メソッド
      expect(mocks.update).not.toHaveBeenCalled(); // モック関数参照 / 更新未呼出しの検証メソッド
    },
  );
}

it.each([null, undefined, "input", {}, { // 不正な本人情報別の試験定義メソッド
  ...statusInput(), // status入力の生成関数
  userId: " ",
  platformAdminId: " ",
}, {
  ...statusInput(), // status入力の生成関数
  platformAdminId: "other-user",
}])(
  "本人情報の欠落・他人との組合せはDBを呼ばず拒否する %#",
  /**
   * 型付きAPIへ不正なcontextを直接渡しても例外原文や対象情報を返さない。
   */
  async (value) => { // 不正contextの試験コールバック
    await expect(updateSupportReportStatusForPlatform( // status更新関数 / 非同期結果の期待値生成関数
      value as UpdateSupportReportStatusForPlatformInput, // 意図的に型を偽装する入力型アサーション
    )).resolves.toEqual({ outcome: "FORBIDDEN" }); // 非同期結果の等値比較メソッド
    expect(mocks.transaction).not.toHaveBeenCalled(); // モック関数参照 / DB未呼出し検証メソッド
  },
);

it.each([ // 入力値別の試験を定義するメソッド
  { reportId: "invalid" },
  { requestId: "invalid" },
  { expectedUpdatedAt: "invalid" },
  { expectedUpdatedAt: "2026-10-25T10:00:00Z" },
  { status: "UNKNOWN" },
  { status: ["RESOLVED"] },
])(
  "status識別値と操作値を再検証してDB前で拒否する %#",
  /**
   * 識別値・version・statusの改ざんを固定分類へ変換する。
   */
  async (override) => { // 不正status入力の試験コールバック
    const value = { // 改ざんした入力
      ...statusInput(), // status入力の生成関数
      ...override,
    } as UpdateSupportReportStatusForPlatformInput; // 不正値を再現する入力型アサーション
    await expect(updateSupportReportStatusForPlatform(value)).resolves.toEqual({ // status更新関数 / 非同期結果の比較メソッド
      outcome: "INVALID_INPUT",
    });
    expect(mocks.transaction).not.toHaveBeenCalled(); // モック関数参照 / DB未呼出し検証メソッド
  },
);

it.each([undefined, 1, {}, [], "あ".repeat(5001), "😀".repeat(2501)])( // 不正メモ別の試験定義メソッド / 文字列反復メソッド
  "非文字列・上限超過のメモを切り捨てず拒否する %#",
  /**
   * 型付きメモAPIの直接呼出しでも、超過・型不正はDBへ渡さない。
   */
  async (internalNote) => { // 不正メモ入力の試験コールバック
    await expect(updateSupportReportNoteForPlatform({ // メモ更新関数 / 非同期結果の期待値生成関数
      ...noteInput(), // メモ入力の生成関数
      internalNote: internalNote as string, // 不正値を再現する文字列型へのアサーション
    })).resolves.toEqual({ outcome: "INVALID_INPUT" }); // 非同期結果の等値比較メソッド
    expect(mocks.transaction).not.toHaveBeenCalled(); // モック関数参照 / DB未呼出し検証メソッド
  },
);

it( // 試験を登録する関数
  "入力へ混入した担当者・日時・本文・通知・クラブ列を保存しない",
  /**
   * 正規化した操作値とサーバー由来の管理列以外がupdateManyへ渡らないことを確認する。
   */
  async () => { // 更新列の偽装を検証するコールバック
    const before = structuredClone(stored); // 初期の保存行を複製する関数
    const value = {
      ...noteInput(), // メモ入力の生成関数
      status: "RESOLVED",
      handledByPlatformAdminId: "other-user",
      updatedAt: new Date("2099-01-01T00:00:00.000Z"), // 偽装したversionのDateコンストラクター
      statusChangedAt: NOW,
      resolvedAt: NOW,
      message: "偽装本文",
      reporterName: "偽装氏名",
      clubId: "other-club",
      membershipId: "other-member",
      notifyError: "偽装通知エラー",
      notifiedAt: null,
    };
    await updateSupportReportNoteForPlatform(value); // メモ保存関数
    expect(stored).toEqual({ // 期待値生成・許可列以外の不変を比較するメソッド
      ...before,
      internalNote: "新しい内部メモ",
      handledByPlatformAdminId: USER_ID,
      updatedAt: NOW,
    });
    expect(mocks.update.mock.calls[0][0].data).toEqual({ // 期待値生成・書込列の厳密比較メソッド
      internalNote: "新しい内部メモ",
      handledByPlatformAdminId: USER_ID,
      updatedAt: NOW,
    });
  },
);

it.each([true, false])( // 入力値別の試験を定義するメソッド
  "条件付き更新0件は対象の存在=%sでCONFLICT・NOT_FOUNDに分ける",
  /**
   * 先の読取後に競合や削除が起きても、0件を成功や無条件更新に変えない。
   */
  async (exists) => { // 更新0件の試験コールバック
    mocks.update.mockResolvedValueOnce({ count: 0 }); // 更新0件の応答を設定するメソッド
    mocks.report.mockResolvedValueOnce(report()).mockResolvedValueOnce( // 初回と再確認の応答設定メソッド / 初期行生成関数
      exists ? { id: REPORT_ID } : null,
    );
    const before = structuredClone(stored); // 初期の保存行を複製する関数
    await expect(updateSupportReportStatusForPlatform(statusInput())).resolves.toEqual({ // status更新・入力生成関数 / 非同期結果の比較メソッド
      outcome: exists ? "CONFLICT" : "NOT_FOUND",
    });
    expect(mocks.report.mock.calls[1][0]).toEqual({ // 期待値生成・存在再確認の比較メソッド
      where: {
        id: REPORT_ID,
      },
      select: {
        id: true,
      },
    });
    expect(mocks.update).toHaveBeenCalledTimes(1); // モック関数参照 / 書込再試行なしの検証メソッド
    expect(stored).toEqual(before); // 期待値生成・全列不変の比較メソッド
  },
);

it( // 試験を登録する関数
  "更新件数不整合は書込後でもthrowによりrollbackする",
  /**
   * 不正な更新件数を固定失敗へ変換し、transaction内の変更が残らないことを確認する。
   */
  async () => { // rollback境界の試験コールバック
    const before = structuredClone(stored); // 更新前の状態を複製する関数
    const update = mocks.update.getMockImplementation()!; // 更新モックの実装を取得するメソッド
    mocks.update.mockImplementationOnce( // 次の更新だけを置換するメソッド
      /**
       * 一旦状態を変更したうえで、不正な複数件更新の応答を返す。
       */
      async (args) => { // 不正な件数の試験用コールバック
        await update(args); // 元の条件付き更新モック関数
        return { count: 2 };
      },
    );
    await expect(updateSupportReportStatusForPlatform(statusInput())).resolves.toEqual({ // status更新・入力生成関数 / 非同期結果の比較メソッド
      outcome: "UPDATE_FAILED",
    });
    expect(stored).toEqual(before); // 期待値生成・rollback後の比較メソッド
  },
);

it.each(["actor", "report", "update", "transaction"] as const)( // 失敗箇所別の試験定義メソッド / リテラル型
  "%sの例外を原文や個人情報を含まない固定分類へ変換する",
  /**
   * 読取・更新・transaction失敗でも原文を結果へ含めず、成功や無条件再試行に変えない。
   */
  async (stage) => { // DB例外の試験コールバック
    mocks[stage].mockRejectedValue(new Error(PRIVATE_DETAIL)); // 失敗応答の設定メソッド / Errorコンストラクター
    await expect(updateSupportReportStatusForPlatform(statusInput())).resolves.toEqual({ // status更新・入力生成関数 / 非同期結果の比較メソッド
      outcome: "UPDATE_FAILED",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1); // モック関数参照 / 再試行なしの検証メソッド
  },
);

it.each(["P2034", "P2003"])( // Prisma競合・FK失敗別の試験定義メソッド
  "%sはrollbackして固定分類にし、自動上書き再試行しない",
  /**
   * 直列化失敗はCONFLICT、担当者削除等のFK失敗は原因を断定せずUPDATE_FAILEDとする。
   */
  async (code) => { // 競合・FK失敗の試験コールバック
    const before = structuredClone(stored); // 更新前の状態を複製する関数
    const update = mocks.update.getMockImplementation()!; // 更新モック実装の取得メソッド
    mocks.update.mockImplementationOnce( // 次の更新でDB例外を模す設定メソッド
      /**
       * 書込後の失敗を再現し、transaction全体が戻ることを確認する。
       */
      async (args) => { // 書込後の例外用コールバック
        await update(args); // 元の条件付き更新モック関数
        throw prismaError(code); // 本物のPrisma既知エラーの生成関数
      },
    );
    await expect(updateSupportReportStatusForPlatform(statusInput())).resolves.toEqual({ // status更新・入力生成関数 / 非同期結果の比較メソッド
      outcome: code === "P2034" ? "CONFLICT" : "UPDATE_FAILED",
    });
    expect(stored).toEqual(before); // 期待値生成・rollback後の状態比較メソッド
    expect(mocks.transaction).toHaveBeenCalledTimes(1); // モック関数参照 / 再試行なしの検証メソッド
  },
);

it( // 試験を登録する関数
  "codeだけを持つ偽のPrisma競合エラーを採用しない",
  /**
   * 任意のDB例外に付いたcodeを信頼せず、一般失敗へ限定する。
   */
  async () => { // 偽の既知エラーを検証するコールバック
    mocks.transaction.mockRejectedValue({ // 任意の例外応答を設定するメソッド
      code: "P2034",
      message: PRIVATE_DETAIL,
    }); // 任意の例外応答の設定メソッド
    await expect(updateSupportReportNoteForPlatform(noteInput())).resolves.toEqual({ // メモ更新・入力生成関数 / 非同期結果の比較メソッド
      outcome: "UPDATE_FAILED",
    });
  },
);

it( // 試験を登録する関数
  "同一versionのstatusとメモが競合しても片方だけ成功する",
  /**
   * モックの直列化でCAS条件を確認する。実DBの同時実行制御の証明は後続統合試験で行う。
   */
  async () => { // 同時送信を検証するコールバック
    const [status, note] = await Promise.all([ // 両更新の結果を待つメソッド
      updateSupportReportStatusForPlatform(statusInput()), // status更新・入力生成関数
      updateSupportReportNoteForPlatform(noteInput()), // メモ更新・入力生成関数
    ]);
    expect(status.outcome).toBe("UPDATED"); // 期待値生成・先行成功の比較メソッド
    expect(note.outcome).toBe("CONFLICT"); // 期待値生成・後行競合の比較メソッド
    expect(stored!.internalNote).toBe("以前の内部メモ"); // 期待値生成・競合でのメモ不変の比較メソッド
    expect(mocks.update).toHaveBeenCalledTimes(1); // モック関数参照 / 書込回数の検証メソッド
  },
);

it( // 試験を登録する関数
  "同じミリ秒の更新でもversionを進め、古いversionを再利用させない",
  /**
   * 初回のversionと現在時刻が等しくても1ミリ秒進め、再送の上書きを防ぐ。
   */
  async () => { // ミリ秒境界の試験コールバック
    stored!.updatedAt = new Date(NOW); // 現在時刻と同じversionを作るDateコンストラクター
    const value = {
      ...noteInput(), // メモ入力の生成関数
      expectedUpdatedAt: NOW.toISOString(), // 期待versionのUTC ISO化メソッド
    };
    await expect(updateSupportReportNoteForPlatform(value)).resolves.toEqual({ // メモ更新関数 / 非同期結果の比較メソッド
      outcome: "UPDATED",
      reportId: REPORT_ID,
      updatedAt: "2026-10-25T11:00:00.001Z",
    });
    await expect(updateSupportReportNoteForPlatform(value)).resolves.toEqual({ // メモ更新関数 / 非同期結果の比較メソッド
      outcome: "CONFLICT",
    });
    expect(mocks.update).toHaveBeenCalledTimes(1); // モック関数参照 / 追加書込なしの検証メソッド
  },
);

it( // 試験を登録する関数
  "同じcontextでも次回の権限失効を反映する",
  /**
   * 前回の成功や受け取ったcontextを、現在の管理者権限の代用にしない。
   */
  async () => { // 権限失効を検証するコールバック
    const value = statusInput("OPEN"); // 同statusの入力を生成する関数
    await expect(updateSupportReportStatusForPlatform(value)).resolves.toMatchObject({ // status更新関数 / 非同期結果の比較メソッド
      outcome: "UNCHANGED",
    });
    actor = null;
    await expect(updateSupportReportStatusForPlatform(value)).resolves.toEqual({ // status更新関数 / 非同期結果の比較メソッド
      outcome: "FORBIDDEN",
    });
    expect(mocks.report).toHaveBeenCalledTimes(1); // モック関数参照 / 失効後の対象未読取の検証メソッド
    expect(mocks.update).not.toHaveBeenCalled(); // モック関数参照 / 全経路での未更新検証メソッド
  },
);
