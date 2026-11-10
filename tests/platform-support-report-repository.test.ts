// tests/platform-support-report-repository.test.ts
// 実DB・dotenv・Authを起動せず、Platform一覧の権限境界・取得条件・限定DTOを検証する。

import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  parseSupportReportQuery, // 一覧queryを検証し、検索条件を整形する関数
} from "@/domain/platform/support/support-report-query";
import {
  findSupportReportsForPlatform, // 最新権限を照合してPlatform一覧を取得する関数
  type FindSupportReportsForPlatformInput, // 本人・管理者IDと検索条件の入力型
} from "@/src/infrastructure/prisma/repositories/platform-support-report-repository";

const mocks = vi.hoisted( // モジュール評価前にモックを準備するメソッド
  /**
   * 読取transactionと必要なdelegateだけを用意し、実接続を防ぐ。
   */
  () => ({ // モック生成コールバック
    transaction: vi.fn(), // transaction用モック関数の生成メソッド
    actor: vi.fn(), // 本人管理者読取モックの生成メソッド
    reports: vi.fn(), // 一覧読取モックの生成メソッド
    count: vi.fn(), // 件数読取モックの生成メソッド
    clubs: vi.fn(), // 候補読取モックの生成メソッド
  }),
);

vi.mock( // dotenv読込を含む共有clientを置換するメソッド
  "@/src/infrastructure/prisma/client",
  /**
   * 共有clientから直接モデルを読めないよう、transactionだけを公開する。
   */
  () => ({ // モジュール置換コールバック
    prisma: {
      $transaction: mocks.transaction, // transaction用のモック関数参照
    },
  }),
);

const USER_ID = "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6";
const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const PRIVATE_ERROR = "test-only-private-db-detail";
const club = {
  id: CLUB_ID,
  name: "所属不要のクラブ",
  slug: "club-a",
};
const clubSelection = {
  id: true,
  name: true,
  slug: true,
};

/**
 * 生queryを既存の契約で検証し、認可済み呼出しを想定した入力を作る。
 */
function input(raw: unknown = {}): FindSupportReportsForPlatformInput { // 入力生成関数 / 不明値型 / Repository入力型
  const result = parseSupportReportQuery(raw); // 共通query検証関数
  if (!result.success) {
    throw new Error("試験用queryが不正です。"); // 試験準備の失敗を表すErrorコンストラクター
  }
  return {
    userId: USER_ID,
    platformAdminId: USER_ID,
    query: result.data,
  };
}

/**
 * 型付きのDB行を用意し、本文とsnapshotを現在の所属情報から独立させる。
 */
function row() { // 一覧のDB行を作る試験用関数
  return {
    id: "22222222-2222-4222-8222-222222222222",
    createdAt: new Date("2026-10-25T00:00:00.000Z"), // 作成日時のDateコンストラクター
    updatedAt: new Date("2026-10-25T01:00:00.000Z"), // 更新日時のDateコンストラクター
    club,
    category: "BUG",
    status: "OPEN",
    message: "<script>保存済み本文</script>\n改行も保持",
    pageUrl: "/club/club-a/account",
    userAgent: "保存済みブラウザー情報",
    reporterName: "報告時の氏名",
    reporterEmail: "snapshot@example.test",
    reporterRole: "MEMBER",
    handledByPlatformAdmin: {
      id: "handler-id",
      name: "担当者表示名",
      email: "must-not-return@example.test",
    },
    statusChangedAt: new Date("2026-10-25T00:30:00.000Z"), // 状態変更日時のDateコンストラクター
    resolvedAt: null,
    internalNote: "内部メモ\n全文を保持",
    notifiedAt: null,
    notifyError: PRIVATE_ERROR,
    membershipId: "must-not-return",
  };
}

beforeEach( // 各試験の前処理を登録する関数
  /**
   * DB応答と履歴を初期化し、transaction内だけに読取delegateを渡す。
   */
  () => { // 前処理コールバック
    vi.resetAllMocks(); // モック実装と履歴を初期化するメソッド
    mocks.actor.mockResolvedValue({ // 最新管理者の応答を設定するメソッド
      id: USER_ID,
      role: "DEVELOPER",
      isActive: true,
    });
    mocks.reports.mockResolvedValue([row()]); // 一覧応答の設定メソッド / DB行生成関数
    mocks.count.mockResolvedValue(1); // 件数応答を設定するメソッド
    mocks.clubs.mockResolvedValue([club]); // クラブ候補の応答を設定するメソッド
    mocks.transaction.mockImplementation( // transactionの実装を設定するメソッド
      /**
       * 渡されたtransactionコールバックを、読取専用の代替clientで実行する。
       */
      async (callback: (transaction: unknown) => Promise<unknown>) => callback({ // transactionコールバック型 / 非同期型 / 関数呼出し
        platformAdmin: {
          findFirst: mocks.actor, // 管理者読取モックの関数参照
        },
        supportReport: {
          findMany: mocks.reports, // 一覧読取モックの関数参照
          count: mocks.count, // 件数読取モックの関数参照
        },
        club: {
          findMany: mocks.clubs, // クラブ候補読取モックの関数参照
        },
      }),
    );
    vi.spyOn(console, "error").mockImplementation( // ログ監視と代替実装設定メソッド
      /**
       * 試験中のログを抑制し、後処理で未出力を検証する。
       */
      () => undefined, // ログ抑制用コールバック
    );
    vi.spyOn(console, "warn").mockImplementation( // ログ監視と代替実装設定メソッド
      /**
       * 警告ログの代替実装として出力を抑制する。
       */
      () => undefined, // 警告抑制用コールバック
    );
    vi.spyOn(console, "log").mockImplementation( // ログ監視と代替実装設定メソッド
      /**
       * 通常ログの代替実装として出力を抑制する。
       */
      () => undefined, // 通常ログ抑制用コールバック
    );
  },
);

afterEach( // 各試験の後処理を登録する関数
  /**
   * 成功・失敗にかかわらずログ非出力を確認し、consoleを復元する。
   */
  () => { // 後処理コールバック
    expect(console.error).not.toHaveBeenCalled(); // ログ関数参照 / 期待値生成・未呼出し検証メソッド
    expect(console.warn).not.toHaveBeenCalled(); // 警告関数参照 / 期待値生成・未呼出し検証メソッド
    expect(console.log).not.toHaveBeenCalled(); // 通常ログ関数参照 / 期待値生成・未呼出し検証メソッド
    vi.restoreAllMocks(); // 監視対象の実装を復元するメソッド
  },
);

it.each(["DEVELOPER", "SUPPORT"])( // 許可ロール別の試験定義メソッド
  "%sはMembership・AppUser・プランなしで横断読取できる",
  /**
   * 認可を最初に行い、同一transactionの一覧・件数・候補だけを使うことを確認する。
   */
  async (role) => { // 許可ロールの試験コールバック
    mocks.actor.mockResolvedValue({ // 最新管理者の応答を設定するメソッド
      id: USER_ID,
      role,
      isActive: true,
    });
    const result = await findSupportReportsForPlatform(input()); // 一覧取得関数 / 入力生成関数
    expect(result.outcome).toBe("FOUND"); // 結果の期待値生成・比較メソッド
    expect(mocks.actor).toHaveBeenCalledExactlyOnceWith({ // モック関数参照 / 呼出し引数検証メソッド
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
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ // 期待値生成・transaction設定の比較メソッド
      isolationLevel: "RepeatableRead",
    });
    expect(mocks.actor.mock.invocationCallOrder[0]) // 呼出し順序の期待値生成関数
      .toBeLessThan(mocks.reports.mock.invocationCallOrder[0]); // 認可が一覧取得に先行することを比較するメソッド
    expect(mocks.reports.mock.calls[0][0]).toMatchObject({ // 期待値生成・一覧取得条件の比較メソッド
      where: {},
      take: 50,
      skip: 0,
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });
    expect(mocks.count).toHaveBeenCalledExactlyOnceWith({ where: {} }); // モック関数参照 / 件数条件の検証メソッド
    expect(mocks.clubs).toHaveBeenCalledExactlyOnceWith({ // モック関数参照 / クラブ候補条件の検証メソッド
      where: {
        supportReports: {
          some: {},
        },
      },
      select: clubSelection,
      orderBy: [
        { name: "asc" },
        { id: "asc" },
      ],
    });
  },
);

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
])(
  "一般会員・inactive・異なる本人・未知ロールから一覧と候補を隠す %#",
  /**
   * DBの最新応答が不許可なら、報告・件数・クラブ候補を一切読まない。
   */
  async (actor) => { // 不許可応答を検証するコールバック
    mocks.actor.mockResolvedValue(actor); // 不許可応答を設定するメソッド
    await expect(findSupportReportsForPlatform(input())).resolves.toEqual({ // 一覧取得・入力生成関数 / 非同期結果の検証メソッド
      outcome: "FORBIDDEN",
    });
    expect(mocks.reports).not.toHaveBeenCalled(); // モック関数参照 / 未呼出しの検証メソッド
    expect(mocks.count).not.toHaveBeenCalled(); // モック関数参照 / 未呼出しの検証メソッド
    expect(mocks.clubs).not.toHaveBeenCalled(); // モック関数参照 / 未呼出しの検証メソッド
  },
);

it( // 試験を登録する関数
  "保存された認可contextが古くても次回の権限失効を反映する",
  /**
   * 同じ入力を再利用しても、以前の成功やroleを権限根拠にしない。
   */
  async () => { // 古いcontextを検証するコールバック
    const context = input(); // 入力生成関数
    await findSupportReportsForPlatform(context); // 初回の一覧取得関数
    mocks.actor.mockResolvedValue(null); // 権限失効後の応答を設定するメソッド
    await expect(findSupportReportsForPlatform(context)).resolves.toEqual({ // 一覧取得関数 / 非同期結果の比較メソッド
      outcome: "FORBIDDEN",
    });
    expect(mocks.reports).toHaveBeenCalledTimes(1); // モック関数参照 / 呼出し回数の検証メソッド
  },
);

it.each(["", " ", null, undefined, 1])( // 入力値別の試験を定義するメソッド
  "不正な本人IDはtransaction前に拒否する %#",
  /**
   * 型を偽装した本人IDでもDBへ渡さない。
   */
  async (userId) => { // 不正な本人IDの試験コールバック
    const value = { // 型偽装用の入力
      ...input(), // 入力生成関数
      userId,
      platformAdminId: userId,
    } as unknown as FindSupportReportsForPlatformInput; // 不明値型を経由する入力型へのアサーション
    await expect(findSupportReportsForPlatform(value)).resolves.toEqual({ // 一覧取得関数 / 非同期結果の比較メソッド
      outcome: "FORBIDDEN",
    });
    expect(mocks.transaction).not.toHaveBeenCalled(); // モック関数参照 / 未呼出しの検証メソッド
  },
);

it( // 試験を登録する関数
  "本人IDと管理者IDが異なるcontextをDBへ渡さない",
  /**
   * 他人のPlatformAdmin情報と組み合わせたcontextを拒否する。
   */
  async () => { // 他人の管理者IDを検証するコールバック
    await expect(findSupportReportsForPlatform({ // 一覧取得関数 / 非同期結果の比較メソッド
      ...input(), // 入力生成関数
      platformAdminId: "other-user",
    })).resolves.toEqual({ outcome: "FORBIDDEN" }); // 非同期結果の等値比較メソッド
    expect(mocks.transaction).not.toHaveBeenCalled(); // モック関数参照 / 未呼出しの検証メソッド
  },
);

it.each([ // 入力値別の試験を定義するメソッド
  {},
  { clubId: CLUB_ID },
  { status: "OPEN" },
  { status: "IN_PROGRESS" },
  { status: "ON_HOLD" },
  { status: "RESOLVED" },
  { category: "BUG" },
  { category: "QUESTION" },
  { category: "REQUEST" },
  { category: "OTHER" },
  {
    clubId: CLUB_ID,
    status: "RESOLVED",
    category: "QUESTION",
  },
])(
  "各filterと組合せを一覧と件数に同じAND条件で渡す %#",
  /**
   * 省略した条件だけを外し、候補には選択中のfilterを適用しない。
   */
  async (raw) => { // 検索条件を検証するコールバック
    await findSupportReportsForPlatform(input(raw)); // 一覧取得・入力生成関数
    expect(mocks.reports.mock.calls[0][0].where).toEqual(raw); // 期待値生成・一覧条件の比較メソッド
    expect(mocks.count).toHaveBeenCalledExactlyOnceWith({ where: raw }); // モック関数参照 / 件数条件の検証メソッド
    expect(mocks.clubs.mock.calls[0][0].where).toEqual({ // 期待値生成・候補条件の比較メソッド
      supportReports: {
        some: {},
      },
    });
  },
);

it.each([ // 入力値別の試験を定義するメソッド
  { page: 0 },
  { page: 10001 },
  { page: 1.5 },
  { page: "1" },
  { pageSize: 100 },
  { skip: -1 },
  { skip: 500000 },
  { status: "INVALID" },
  { status: ["OPEN"] },
  { category: "INVALID" },
  { clubId: "invalid" },
])(
  "型付きqueryの不正値・offset偽装は全件取得へ丸めない %#",
  /**
   * 正規化済み入力でも検索条件を再検証し、不正ならDBを呼ばない。
   */
  async (override) => { // 不正な検索条件の試験コールバック
    const value = input(); // 入力生成関数
    value.query = {
      ...value.query,
      ...override,
    } as typeof value.query; // 正規化済み検索条件型への偽装
    await expect(findSupportReportsForPlatform(value)).resolves.toEqual({ // 一覧取得関数 / 非同期結果の比較メソッド
      outcome: "INVALID_QUERY",
    });
    expect(mocks.transaction).not.toHaveBeenCalled(); // モック関数参照 / 未呼出しの検証メソッド
  },
);

it.each([null, undefined, [], 1])( // 入力値別の試験を定義するメソッド
  "検索条件オブジェクトの欠落・型不正を拒否する %#",
  /**
   * query本体の型を偽装しても安全な固定分類だけを返す。
   */
  async (query) => { // 不正なquery本体の試験コールバック
    const value = input(); // 入力生成関数
    value.query = query as unknown as typeof value.query; // 不明値型を経由する検索条件型への偽装
    await expect(findSupportReportsForPlatform(value)).resolves.toEqual({ // 一覧取得関数 / 非同期結果の比較メソッド
      outcome: "INVALID_QUERY",
    });
  },
);

it.each([ // 入力値別の試験を定義するメソッド
  {
    page: "1",
    skip: 0,
    count: 0,
    returned: 0,
  },
  {
    page: "1",
    skip: 0,
    count: 51,
    returned: 50,
  },
  {
    page: "2",
    skip: 50,
    count: 51,
    returned: 1,
  },
  {
    page: "3",
    skip: 100,
    count: 51,
    returned: 0,
  },
  {
    page: "10000",
    skip: 499950,
    count: 500001,
    returned: 50,
  },
])(
  "0件・50件境界・2ページ・範囲外・最大ページの取得契約 %#",
  /**
   * SQLへの固定件数・offset・同時刻時の順序指定と、DBの総件数の返却を確認する。
   */
  async ({ page, skip, count, returned }) => { // ページ境界の試験コールバック
    mocks.reports.mockResolvedValue(Array.from( // 一覧応答設定メソッド / 配列生成メソッド
      { length: returned },
      /**
       * 同じ作成日時の行を、DBが返すID降順として用意する。
       */
      (_, index) => ({ // 連番付き行の生成コールバック
        ...row(), // 試験用DB行生成関数
        id: String(100 - index), // 降順のID文字列を生成する関数
      }),
    ));
    mocks.count.mockResolvedValue(count); // 総件数の応答を設定するメソッド
    if (count === 0) {
      mocks.clubs.mockResolvedValue([]); // 報告を持つクラブがない場合の応答設定メソッド
    }
    const result = await findSupportReportsForPlatform(input({ page })); // 一覧取得・入力生成関数
    expect(mocks.reports.mock.calls[0][0]).toMatchObject({ // 期待値生成・取得条件の比較メソッド
      take: 50,
      skip,
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });
    expect(result).toMatchObject({ // 期待値生成・ページ情報の比較メソッド
      outcome: "FOUND",
      totalCount: count,
      page: Number(page), // ページ文字列を数値へ変換する関数
      pageSize: 50,
    });
    if (result.outcome === "FOUND") {
      expect(result.reports).toHaveLength(returned); // 期待値生成・返却件数の比較メソッド
      if (count === 0) {
        expect(result.clubs).toEqual([]); // 期待値生成・候補なしの比較メソッド
      }
      if (returned > 0) {
        expect(result.reports[0].id).toBe("100"); // 期待値生成・DB順序維持の比較メソッド
      }
    }
  },
);

it( // 試験を登録する関数
  "全文・snapshot・管理情報を保持し、限定列だけをDTOへ返す",
  /**
   * 日時のISO化と余分な列の除去、notifyErrorの真偽値化を検証する。
   */
  async () => { // 限定DTOの試験コールバック
    mocks.clubs.mockResolvedValue([{ // 候補応答の設定メソッド
      ...club,
      email: "must-not-return@example.test",
      planType: "STARTER",
    }]);
    const result = await findSupportReportsForPlatform(input()); // 一覧取得・入力生成関数
    expect(result).toEqual({ // 期待値生成・DTO全体の比較メソッド
      outcome: "FOUND",
      reports: [{
        id: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-10-25T00:00:00.000Z",
        updatedAt: "2026-10-25T01:00:00.000Z",
        club,
        category: "BUG",
        status: "OPEN",
        message: row().message, // 試験用DB行生成関数
        pageUrl: "/club/club-a/account",
        userAgent: "保存済みブラウザー情報",
        reporterName: "報告時の氏名",
        reporterEmail: "snapshot@example.test",
        reporterRole: "MEMBER",
        handler: {
          id: "handler-id",
          name: "担当者表示名",
        },
        statusChangedAt: "2026-10-25T00:30:00.000Z",
        resolvedAt: null,
        internalNote: "内部メモ\n全文を保持",
        notifiedAt: null,
        notificationFailed: true,
      }],
      clubs: [club],
      totalCount: 1,
      page: 1,
      pageSize: 50,
    });
    const select: Prisma.SupportReportSelect = mocks.reports.mock.calls[0][0].select; // Prismaの報告取得列型
    expect(select).toEqual({ // 期待値生成・取得列の厳密比較メソッド
      id: true,
      createdAt: true,
      updatedAt: true,
      club: { select: clubSelection },
      category: true,
      status: true,
      message: true,
      pageUrl: true,
      userAgent: true,
      reporterName: true,
      reporterEmail: true,
      reporterRole: true,
      handledByPlatformAdmin: {
        select: {
          id: true,
          name: true,
        },
      },
      statusChangedAt: true,
      resolvedAt: true,
      internalNote: true,
      notifiedAt: true,
      notifyError: true,
    });
    expect(JSON.stringify(result)).not.toContain(PRIVATE_ERROR); // JSON文字列化メソッド / 期待値生成・非包含検証メソッド
  },
);

it( // 試験を登録する関数
  "削除済み担当者とnullable項目、通知成功と解決日時を扱う",
  /**
   * nullを保ったまま関係先の欠落を許容し、存在する日時だけISO化する。
   */
  async () => { // nullable項目の試験コールバック
    mocks.reports.mockResolvedValue([{ // DB応答を設定するメソッド
      ...row(), // 試験用DB行生成関数
      handledByPlatformAdmin: null,
      pageUrl: null,
      userAgent: null,
      reporterName: null,
      reporterEmail: null,
      reporterRole: null,
      statusChangedAt: null,
      internalNote: null,
      resolvedAt: new Date("2026-10-25T02:00:00.000Z"), // 解決日時のDateコンストラクター
      notifiedAt: new Date("2026-10-25T01:30:00.000Z"), // 通知受付日時のDateコンストラクター
      notifyError: null,
    }]);
    const result = await findSupportReportsForPlatform(input()); // 一覧取得・入力生成関数
    expect(result.outcome).toBe("FOUND"); // 期待値生成・結果分類の比較メソッド
    if (result.outcome === "FOUND") {
      expect(result.reports[0]).toMatchObject({ // 期待値生成・nullable項目の比較メソッド
        handler: null,
        pageUrl: null,
        userAgent: null,
        reporterName: null,
        reporterEmail: null,
        reporterRole: null,
        statusChangedAt: null,
        internalNote: null,
        resolvedAt: "2026-10-25T02:00:00.000Z",
        notifiedAt: "2026-10-25T01:30:00.000Z",
        notificationFailed: false,
      });
    }
  },
);

it.each(["transaction", "actor", "reports", "count", "clubs"] as const)( // 失敗箇所別の試験定義メソッド / リテラル型
  "%sの例外原文を固定失敗分類へ変換し、部分的な結果を返さない",
  /**
   * どの読取段階で失敗しても例外原文や個人情報を返さず、ログへも出さない。
   */
  async (stage) => { // 例外の安全化を検証するコールバック
    mocks[stage].mockRejectedValue(new Error(PRIVATE_ERROR)); // エラー応答設定メソッド / Errorコンストラクター
    await expect(findSupportReportsForPlatform(input())).resolves.toEqual({ // 一覧取得・入力生成関数 / 非同期結果の比較メソッド
      outcome: "READ_FAILED",
    });
  },
);

it( // 試験を登録する関数
  "複数クラブの報告と候補をプランで除外しない",
  /**
   * 異なるクラブの行をそのままDTO化し、フィルター選択肢にも含める。
   */
  async () => { // 横断読取の試験コールバック
    const otherClub = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "別クラブ",
      slug: "club-b",
    };
    mocks.reports.mockResolvedValue([ // 複数クラブの一覧応答を設定するメソッド
      {
        ...row(), // 試験用DB行生成関数
        club: {
          ...club,
          planType: "STARTER",
        },
      },
      {
        ...row(), // 試験用DB行生成関数
        id: "other-report",
        club: {
          ...otherClub,
          planType: "PRO",
        },
      },
    ]);
    mocks.clubs.mockResolvedValue([club, otherClub]); // 全候補の応答を設定するメソッド
    mocks.count.mockResolvedValue(2); // 総件数の応答を設定するメソッド
    const result = await findSupportReportsForPlatform(input()); // 一覧取得・入力生成関数
    expect(result.outcome).toBe("FOUND"); // 期待値生成・成功分類の比較メソッド
    if (result.outcome === "FOUND") {
      expect(result.reports[0].club).toEqual(club); // 期待値生成・最初のクラブ情報の比較メソッド
      expect(result.reports[1].club).toEqual(otherClub); // 期待値生成・別クラブ情報の比較メソッド
      expect(result.clubs).toEqual([club, otherClub]); // 期待値生成・候補全体の比較メソッド
      expect(result.totalCount).toBe(2); // 期待値生成・総件数の比較メソッド
    }
  },
);
