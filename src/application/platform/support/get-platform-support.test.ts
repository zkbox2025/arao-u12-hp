// src/application/platform/support/get-platform-support.test.ts
// 実DB・Authを使わず、context優先・query再検証・限定DTO・部分開示防止を確認する。

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
import type {
  PlatformSupportReport, // 全文・snapshot・管理情報を含む報告表示用の型
} from "@/domain/platform/support/support-report-management-types";
import {
  getPlatformSupport, // 認可contextとqueryから限定一覧を取得するApplication Service関数
} from "./get-platform-support";

const mocks = vi.hoisted( // import前にモックを準備するメソッド
  /**
   * DB・dotenvの評価を避けるため一覧Repositoryを置換するモックを用意する。
   */
  () => ({ // モック生成コールバック
    find: vi.fn(), // 一覧取得モックの生成メソッド
  }),
);
vi.mock( // Repository境界を置換するメソッド
  "@/src/infrastructure/prisma/repositories/platform-support-report-repository",
  /**
   * 実DBの代わりに、一覧取得結果のモックだけを公開する。
   */
  () => ({ // モジュール置換コールバック
    findSupportReportsForPlatform: mocks.find, // 一覧Repositoryモックの関数参照
  }),
);

const USER_ID = "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6";
const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "test-only-private-token@example.test";
const context: PlatformAdminAccessContext = { // サーバー認可contextの型
  userId: USER_ID,
  platformAdmin: {
    id: USER_ID,
    role: "DEVELOPER",
  },
};
const club = {
  id: CLUB_ID,
  name: "クラブ名",
  slug: "club-a",
};

/**
 * 切り捨てず返す本文・メモ、保存時snapshot、nullable列を持つ報告を作る。
 */
function report(): PlatformSupportReport { // 報告fixture生成関数 / 報告表示型
  return {
    id: "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-10-25T10:00:00.000Z",
    updatedAt: "2026-10-25T11:00:00.000Z",
    club,
    category: "BUG",
    status: "OPEN",
    message: "<script>保存済み全文</script>\n本文",
    pageUrl: "/club/club-a/account",
    userAgent: "保存時のブラウザー",
    reporterName: "保存時氏名",
    reporterEmail: "snapshot@example.test",
    reporterRole: "MEMBER",
    handler: {
      id: "handler-id",
      name: "担当者表示名",
    },
    statusChangedAt: null,
    resolvedAt: null,
    internalNote: "内部メモ\n全文を保持",
    notifiedAt: null,
    notificationFailed: true,
  };
}

/**
 * 既存の一覧結果契約に沿った成功応答を用意する。
 */
function found() { // 一覧成功fixtureの生成関数
  return {
    outcome: "FOUND",
    reports: [report()], // 報告fixtureの生成関数
    clubs: [club],
    totalCount: 1,
    page: 1,
    pageSize: 50,
  };
}

beforeEach( // 前処理を登録する関数
  /**
   * 応答と履歴を初期化し、実際の安全化処理を通るログだけを監視する。
   */
  () => { // 前処理コールバック
    vi.resetAllMocks(); // モック履歴・実装の初期化メソッド
    mocks.find.mockResolvedValue(found()); // 成功応答の設定メソッド / fixture生成関数
    vi.spyOn(console, "error").mockImplementation( // ログ監視と代替実装の設定メソッド
      /**
       * テスト中のログ実出力だけを抑制する。
       */
      () => undefined, // ログ抑制コールバック
    );
  },
);
afterEach( // 後処理を登録する関数
  /**
   * ログへ試験用秘密値が含まれないことを確認し、consoleを復元する。
   */
  () => { // 後処理コールバック
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(SECRET); // JSON化・モック取得・期待値生成・非包含検証メソッド
    vi.restoreAllMocks(); // consoleを復元するメソッド
  },
);

it.each(["DEVELOPER", "SUPPORT"] as const)( // ロール別の試験定義メソッド / 読取専用リテラル型
  "%sのcontextを優先し、queryの本人情報・offset偽装を渡さない",
  /**
   * サーバーの本人情報と検証済みAND検索条件だけをRepositoryへ渡す。
   */
  async (role) => { // context優先の試験コールバック
    await getPlatformSupport({ // 一覧取得のApplication Service関数
      ...context,
      platformAdmin: {
        id: USER_ID,
        role,
      },
    }, { // 一覧取得Application Service関数
      clubId: CLUB_ID,
      status: "RESOLVED",
      category: "QUESTION",
      page: "2",
      userId: "other-user",
      platformAdminId: "other-user",
      skip: 0,
      pageSize: 9999,
      token: SECRET,
    });
    expect(mocks.find).toHaveBeenCalledExactlyOnceWith({ // モック関数参照 / 呼出し引数の検証メソッド
      userId: USER_ID,
      platformAdminId: USER_ID,
      query: {
        clubId: CLUB_ID,
        status: "RESOLVED",
        category: "QUESTION",
        page: 2,
        pageSize: 50,
        skip: 50,
      },
    });
  },
);

it( // 試験を登録する関数
  "余分な結果と関係先の秘密列を除き、全文とsnapshotはそのまま返す",
  /**
   * Repository応答を丸ごと返さず、許可したDTOの全項目だけを再構築する。
   */
  async () => { // 限定DTOの試験コールバック
    const row = report(); // 報告fixtureの生成関数
    mocks.find.mockResolvedValue({ // 余分な列を混ぜた応答の設定メソッド
      ...found(), // 一覧成功fixtureの生成関数
      reports: [{
        ...row,
        token: SECRET,
        notifyError: SECRET,
        club: {
          ...club,
          secret: SECRET,
        },
        handler: {
          ...row.handler,
          email: SECRET,
        },
      }],
      clubs: [{
        ...club,
        secret: SECRET,
      }],
      cause: SECRET,
    });
    await expect(getPlatformSupport(context, {})).resolves.toEqual(found()); // 一覧取得・fixture生成関数 / 非同期結果の比較メソッド
  },
);

it( // 試験を登録する関数
  "担当者未設定と0件でも一覧を成功として返す",
  /**
   * nullable担当者と空配列をそれぞれ保持する。
   */
  async () => { // nullableと0件の試験コールバック
    const row = report(); // 報告fixtureの生成関数
    row.handler = null;
    mocks.find.mockResolvedValue({ // nullable担当者の応答設定メソッド
      ...found(), // 一覧成功fixtureの生成関数
      reports: [row],
    });
    await expect(getPlatformSupport(context, {})).resolves.toMatchObject({ // 一覧取得関数 / 非同期結果の部分一致比較メソッド
      reports: [row],
    });
    mocks.find.mockResolvedValue({ // 空一覧の応答を設定するメソッド
      ...found(), // 一覧成功fixtureの生成関数
      reports: [],
      clubs: [],
      totalCount: 0,
    });
    await expect(getPlatformSupport(context, {})).resolves.toMatchObject({ // 一覧取得関数 / 非同期結果の部分一致比較メソッド
      outcome: "FOUND",
      reports: [],
      clubs: [],
      totalCount: 0,
    });
  },
);

it.each(["FORBIDDEN", "INVALID_QUERY", "READ_FAILED"])( // 固定失敗分類別の試験定義メソッド
  "%sでは部分的な一覧も返さない",
  /**
   * Repositoryが失敗に添えた本文・メモ・例外原文をすべて除去する。
   */
  async (outcome) => { // 固定失敗の試験コールバック
    mocks.find.mockResolvedValue({ // 部分DTOを含む失敗応答の設定メソッド
      ...found(), // 一覧成功fixtureの生成関数
      outcome,
      message: SECRET,
    });
    await expect(getPlatformSupport(context, {})).resolves.toEqual({ outcome }); // 一覧取得関数 / 非同期結果の比較メソッド
  },
);

it.each([null, undefined, [], "query", { page: "0" }, { page: ["1"] }, { status: SECRET }])( // 入力値別の試験を定義するメソッド
  "不正queryを全件取得に丸めずDB前で拒否する %#",
  /**
   * 入力不正ではRepositoryへ進まず、固定分類だけを返す。
   */
  async (query) => { // 不正queryの試験コールバック
    await expect(getPlatformSupport(context, query)).resolves.toEqual({ // 一覧取得関数 / 非同期結果の比較メソッド
      outcome: "INVALID_QUERY",
    });
    expect(mocks.find).not.toHaveBeenCalled(); // モック関数参照 / 未呼出しの検証メソッド
  },
);

it.each([null, {}, { // 入力値別の試験を定義するメソッド
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
  "不正な認可contextでは一覧Repositoryを呼ばない %#",
  /**
   * 一般会員や他人のPlatformAdminを組み合わせたcontextを拒否する。
   */
  async (value) => { // 不正contextの試験コールバック
    await expect(getPlatformSupport( // 一覧取得関数 / 非同期結果の期待値生成関数
      value as PlatformAdminAccessContext, // 不正contextを再現する型アサーション
      {},
    )).resolves.toEqual({ outcome: "FORBIDDEN" }); // 非同期結果の比較メソッド
    expect(mocks.find).not.toHaveBeenCalled(); // モック関数参照 / 未呼出しの検証メソッド
  },
);

it.each([null, { outcome: SECRET }, { // 入力値別の試験を定義するメソッド
  ...found(), // 一覧成功fixtureの生成関数
  reports: [report(), null], // 報告fixtureの生成関数
}])(
  "契約外の応答や途中のDTO変換失敗を部分開示しない %#",
  /**
   * 変換に失敗した一覧は全体をREAD_FAILEDにし、途中までの報告を返さない。
   */
  async (value) => { // 契約外結果の試験コールバック
    mocks.find.mockResolvedValue(value); // 不正応答を設定するメソッド
    await expect(getPlatformSupport(context, {})).resolves.toEqual({ // 一覧取得関数 / 非同期結果の比較メソッド
      outcome: "READ_FAILED",
    });
  },
);

it( // 試験を登録する関数
  "例外原文とログ障害を外へ出さず、読取を再試行しない",
  /**
   * Repository例外とconsole例外が重なっても固定結果だけを返す。
   */
  async () => { // 例外の安全化を検証するコールバック
    mocks.find.mockRejectedValue(new Error(SECRET)); // エラー応答の設定メソッド / Errorコンストラクター
    vi.mocked(console.error).mockImplementation( // ログ監視対象の実装を置換するメソッド
      /**
       * ログ基盤の障害を試験用例外で再現する。
       */
      () => { // ログ障害のコールバック
        throw new Error(SECRET); // 試験用Errorコンストラクター
      },
    );
    await expect(getPlatformSupport(context, {})).resolves.toEqual({ // 一覧取得関数 / 非同期結果の比較メソッド
      outcome: "READ_FAILED",
    });
    expect(mocks.find).toHaveBeenCalledTimes(1); // モック関数参照 / 再試行なしの検証メソッド
    expect(vi.mocked(console.error).mock.calls[0]).toEqual([ // モック取得・期待値生成・固定ログの比較メソッド
      "platform_support_operation_failed",
      {
        operation: "platformSupport.read",
        result: "READ_FAILED",
        errorCode: "INTERNAL",
      },
    ]);
  },
);
