// tests/platform-admin-repository.test.ts
// 実DB・dotenvを使わず、Platform本人照合・許可条件・最小DTO・例外の境界を確認する。

import {
  beforeEach,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import {
  DomainError, // 画面表示可能な固定コード・メッセージを持つエラークラス
} from "@/domain/shared/domain-error";
import {
  findActivePlatformAdminByUserId, // 本人の有効なDEVELOPERまたはSUPPORTを取得する関数
  type ActivePlatformAdmin, // 本人照合と有効状態・許可ロールの確認済み最小データ型
} from "@/src/infrastructure/prisma/repositories/platform-admin-repository";

const mocks = vi.hoisted( // importより前にモックを準備するメソッド
  /**
   * Platform管理者の読取だけを置換するモックを生成する。
   */
  () => ({ // モック生成のコールバック関数
    findFirst: vi.fn(), // 最新管理者を返すテスト用モック関数の生成メソッド
  }),
);

vi.mock( // 共有Prisma clientの評価を防ぐモジュール置換メソッド
  "@/src/infrastructure/prisma/client",
  /**
   * PlatformAdminの読取だけを公開し、他モデルの利用を成功させない。
   */
  () => ({ // client置換用のコールバック関数
    prisma: {
      platformAdmin: {
        findFirst: mocks.findFirst, // 管理者読取のモック関数参照
      },
    },
  }),
);

const USER_ID = "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6";

beforeEach( // 各試験の前処理を登録する関数
  /**
   * 前の試験の呼出し履歴・応答をリセットする。
   */
  () => { // 前処理のコールバック関数
    vi.resetAllMocks(); // モックの呼出し履歴と実装を初期化するメソッド
  },
);

it.each(["DEVELOPER", "SUPPORT"] as const)( // 許可ロール別の試験定義メソッド / 読取専用リテラル型
  "%s本人を所属・AppUserなしで取得し、最小DTOだけを返す",
  /**
   * 両ロールの許可条件・限定select・余分な列の除去を検証する。
   */
  async (role) => { // ロール別の非同期試験コールバック
    mocks.findFirst.mockResolvedValue({ // DB応答を設定するメソッド
      id: USER_ID,
      role,
      isActive: true,
      email: "private@example.test",
      name: "非公開の氏名",
    });
    await expect(findActivePlatformAdminByUserId(USER_ID)).resolves.toEqual({ // 本人権限の取得関数 / 非同期結果の期待値生成・等値比較メソッド
      id: USER_ID,
      role,
    });
    expect(mocks.findFirst).toHaveBeenCalledExactlyOnceWith({ // 読取モック関数参照 / 期待値生成・単一呼出しと引数の比較メソッド
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
  },
);

it.each([ // 不許可DB応答ごとの試験定義メソッド
  null,
  {
    id: "foreign-user",
    role: "DEVELOPER",
    isActive: true,
  },
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
    id: USER_ID,
    role: "DEVELOPER",
    isActive: "true",
  },
  {
    id: USER_ID,
    isActive: true,
  },
])(
  "他人・inactive・未知ロール・欠落値を許可しない %#",
  /**
   * DB条件だけに頼らず、取得行の本人ID・有効状態・ロールを再照合する。
   */
  async (row) => { // 不許可応答を検証する非同期コールバック
    mocks.findFirst.mockResolvedValue(row); // 不許可のDB応答を設定するメソッド
    await expect(findActivePlatformAdminByUserId(USER_ID)).resolves.toBeNull(); // 権限取得関数 / 非同期結果の期待値生成・null比較メソッド
  },
);

it.each(["", " ", null, undefined, 1, []])( // 不正値ごとの試験を定義するメソッド
  "空・型不正の本人IDではDBを呼ばない %#", // 不正IDごとの試験定義メソッドの説明
  /**
   * 型付きAPIを直接呼ぶ場合でも、不正な本人IDで検索しないことを確認する。
   */
  async (value) => { // 不正IDを検証する非同期コールバック
    await expect(findActivePlatformAdminByUserId( // 権限取得関数 / 非同期結果の期待値生成関数
      value as unknown as string, // 不正入力を再現する不明値型と文字列型へのアサーション
    )).resolves.toBeNull(); // 非同期結果がnullであることを比較するメソッド
    expect(mocks.findFirst).not.toHaveBeenCalled(); // モック参照 / 期待値生成・未呼出しの比較メソッド
  },
);

it( // 試験名とコールバックを登録する関数
  "同一ユーザーでも毎回最新状態を読み、権限失効を反映する",
  /**
   * 先の成功を共有cacheに残さず、次の読取でinactiveを拒否する。
   */
  async () => { // 最新権限を検証する非同期試験コールバック
    mocks.findFirst.mockResolvedValueOnce({ // 初回のDB応答を設定するメソッド
      id: USER_ID,
      role: "DEVELOPER",
      isActive: true,
    }).mockResolvedValueOnce({ // 次回のDB応答を設定するメソッド
      id: USER_ID,
      role: "DEVELOPER",
      isActive: false,
    });
    await expect(findActivePlatformAdminByUserId(USER_ID)).resolves.not.toBeNull(); // 取得関数 / 非同期結果の期待値生成・非null比較メソッド
    await expect(findActivePlatformAdminByUserId(USER_ID)).resolves.toBeNull(); // 取得関数 / 非同期結果の期待値生成・null比較メソッド
    expect(mocks.findFirst).toHaveBeenCalledTimes(2); // モック参照 / 期待値生成・呼出し回数比較メソッド
  },
);

it( // 試験名とコールバックを登録する関数
  "DB障害を権限なしへ丸めず、例外原文を含まない固定エラーにする",
  /**
   * 取得失敗を成功へ変換せず、公開メッセージとcauseの非開示を確認する。
   */
  async () => { // DB例外を検証する非同期試験コールバック
    mocks.findFirst.mockRejectedValue(new Error("private-db-connection-token")); // 拒否応答設定メソッド / 試験用Errorコンストラクター
    const result = findActivePlatformAdminByUserId(USER_ID); // 権限取得関数
    await expect(result).rejects.toBeInstanceOf(DomainError); // 期待値生成・例外クラス比較メソッド / ドメインエラークラス参照
    await expect(result).rejects.toMatchObject({ // 期待値生成・固定エラーの部分一致比較メソッド
      code: "INTERNAL",
      publicMessage: "Platform権限を確認できませんでした。",
      cause: undefined,
    });
  },
);

it( // 試験名とコールバックを登録する関数
  "公開DTOの型を本人IDとロールだけに制限する",
  /**
   * Repositoryの戻り値にisActive・個人情報・所属を追加しない契約を確認する。
   */
  () => { // 戻り値型を検証する試験コールバック
    expectTypeOf<keyof ActivePlatformAdmin>() // 管理者DTOのキー型を検査する関数
      .toEqualTypeOf<"id" | "role">(); // 許可するキーのリテラル型との一致検証メソッド
    expectTypeOf<Awaited<ReturnType<typeof findActivePlatformAdminByUserId>>>() // 非同期関数の戻り値を展開する型と型検査関数
      .toEqualTypeOf<ActivePlatformAdmin | null>(); // 管理者DTOまたはnullの型との一致検証メソッド
  },
);
