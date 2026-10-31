// tests/platform-authorization.test.ts
// Auth・Prismaを置換し、実Repository経由のPlatform認可とクラブ権限の独立を確認する。

import {
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import {
  requireClubOwner, // 対象クラブのACTIVEなOWNER所属を要求する関数
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  requirePlatformAdmin, // 本人の有効なPlatform管理権限を要求する関数
} from "@/app/(club-app)/platform/require-platform-admin";
import {
  DomainError, // 画面表示可能な固定コード・メッセージを持つエラークラス
} from "@/domain/shared/domain-error";

const mocks = vi.hoisted( // import前にモックを用意するメソッド
  /**
   * 本物のAuth・DB・Next遷移を使わず、境界の呼出しを観測するモックを作る。
   */
  () => ({ // モック生成のコールバック関数
    createClient: vi.fn(), // Supabaseクライアント生成のモック作成メソッド
    getUser: vi.fn(), // Auth本人確認のモック作成メソッド
    admin: vi.fn(), // PlatformAdmin読取のモック作成メソッド
    membership: vi.fn(), // クラブ所属読取のモック作成メソッド
    redirect: vi.fn(), // redirect制御例外のモック作成メソッド
    notFound: vi.fn(), // notFound制御例外のモック作成メソッド
  }),
);

vi.mock( // Authモジュールを置換するメソッド
  "@/src/infrastructure/supabase/server",
  /**
   * サーバー用クライアントの生成だけを置換し、実Cookie・Authへ接続しない。
   */
  () => ({ // Supabaseモジュール置換のコールバック関数
    createClient: mocks.createClient, // クライアント生成モック関数の参照
  }),
);

vi.mock( // Prismaモジュールを置換するメソッド
  "@/src/infrastructure/prisma/client",
  /**
   * 両権限の読取モックだけを提供し、AppUserや所属の自動作成を許可しない。
   */
  () => ({ // Prismaモジュール置換のコールバック関数
    prisma: {
      platformAdmin: {
        findFirst: mocks.admin, // PlatformAdmin読取モック関数の参照
      },
      clubMembership: {
        findFirst: mocks.membership, // クラブ所属読取モック関数の参照
      },
    },
  }),
);

vi.mock( // Next遷移モジュールを置換するメソッド
  "next/navigation",
  /**
   * 遷移は試験用例外で再現し、制御例外の再送出はNextの公開APIをそのまま使う。
   */
  async (importOriginal) => { // 元のNextモジュールを読み込む非同期モック生成コールバック
    const navigation = await importOriginal<typeof import("next/navigation")>(); // 元モジュール読込関数 / Next navigationモジュールの型
    return {
      redirect: mocks.redirect, // redirectモック関数の参照
      notFound: mocks.notFound, // notFoundモック関数の参照
      unstable_rethrow: navigation.unstable_rethrow, // Next制御例外の再送出関数の参照
    };
  },
);

const USER_ID = "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6";

/**
 * redirectの処理中断を試験用の固定例外で表す。
 */
function throwRedirect(): never { // redirect再現関数 / 正常終了しないnever型
  throw new Error("NEXT_REDIRECT"); // 固定制御例外を作るErrorコンストラクター
}

/**
 * notFoundの処理中断を試験用の固定例外で表す。
 */
function throwNotFound(): never { // notFound再現関数 / 正常終了しないnever型
  throw new Error("NEXT_NOT_FOUND"); // 固定制御例外を作るErrorコンストラクター
}

beforeEach( // 各試験の前処理を登録する関数
  /**
   * 有効なAuthとPlatform権限、所属なしを初期状態として独立した試験を用意する。
   */
  () => { // 前処理のコールバック関数
    vi.resetAllMocks(); // 前の試験のモック状態を初期化するメソッド
    mocks.createClient.mockResolvedValue({ // サーバークライアントの応答を設定するメソッド
      auth: {
        getUser: mocks.getUser, // Auth本人確認モック関数の参照
      },
    });
    mocks.getUser.mockResolvedValue({ // Auth検証の応答を設定するメソッド
      data: {
        user: {
          id: USER_ID,
        },
      },
      error: null,
    });
    mocks.admin.mockResolvedValue({ // 本人の有効なPlatformAdmin応答を設定するメソッド
      id: USER_ID,
      role: "DEVELOPER",
      isActive: true,
      email: "private@example.test",
    });
    mocks.membership.mockResolvedValue(null); // クラブ所属なしを設定するメソッド
    mocks.redirect.mockImplementation(throwRedirect); // redirectモックの実装設定メソッド / 制御例外生成関数の参照
    mocks.notFound.mockImplementation(throwNotFound); // notFoundモックの実装設定メソッド / 制御例外生成関数の参照
  },
);

it.each(["DEVELOPER", "SUPPORT"] as const)( // 許可ロール別の試験定義メソッド / 読取専用リテラル型
  "%sは所属0件・AppUserなしでも最小contextを取得できる",
  /**
   * Auth本人IDをRepositoryへ渡し、Platform用の最小contextだけを受け取る。
   */
  async (role) => { // ロール別認可を確認する非同期コールバック
    mocks.admin.mockResolvedValue({ // 検証対象ロールのDB応答を設定するメソッド
      id: USER_ID,
      role,
      isActive: true,
      email: "private@example.test",
    });
    await expect(requirePlatformAdmin()).resolves.toEqual({ // Platform認可関数 / 非同期結果の期待値生成・等値比較メソッド
      userId: USER_ID,
      platformAdmin: {
        id: USER_ID,
        role,
      },
    });
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(); // 本人確認モック参照 / 期待値生成・引数なし単一呼出しの比較メソッド
    expect(mocks.admin).toHaveBeenCalledWith( // 管理者読取モック参照 / 期待値生成・引数比較メソッド
      expect.objectContaining({ // 部分一致の期待値を作るメソッド
        where: {
          id: USER_ID,
          isActive: true,
          role: {
            in: ["DEVELOPER", "SUPPORT"],
          },
        },
      }),
    );
    expect(mocks.membership).not.toHaveBeenCalled(); // 所属読取モック参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.redirect).not.toHaveBeenCalled(); // 遷移モック参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.notFound).not.toHaveBeenCalled(); // 404モック参照 / 期待値生成・未呼出し比較メソッド
  },
);

it.each([ // 未認証・Authエラー応答ごとの試験定義メソッド
  {
    data: { user: null },
    error: null,
  },
  {
    data: { user: { id: USER_ID } },
    error: { message: "private-auth-error" },
  },
  {
    data: { user: { id: "" } },
    error: null,
  },
  {
    data: { user: { id: " " } },
    error: null,
  },
])(
  "Auth未確認なら固定ログイン先へ移動し、DBを呼ばない %#",
  /**
   * Cookie等を直接信用せず、本人検証が失敗した時点で処理を中断する。
   */
  async (response) => { // Auth応答別の非同期試験コールバック
    mocks.getUser.mockResolvedValue(response); // Auth応答を設定するメソッド
    await expect(requirePlatformAdmin()).rejects.toThrow("NEXT_REDIRECT"); // 認可関数 / 期待値生成・制御例外の比較メソッド
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/platform-login"); // redirect参照 / 期待値生成・固定遷移先の比較メソッド
    expect(mocks.admin).not.toHaveBeenCalled(); // DB読取参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.notFound).not.toHaveBeenCalled(); // notFound参照 / 期待値生成・未呼出し比較メソッド
  },
);

it.each([ // 不許可Platform権限ごとの試験定義メソッド
  null,
  {
    id: USER_ID,
    isActive: false,
    role: "DEVELOPER",
  },
  {
    id: USER_ID,
    isActive: false,
    role: "SUPPORT",
  },
  {
    id: "foreign-admin",
    isActive: true,
    role: "DEVELOPER",
  },
  {
    id: USER_ID,
    isActive: true,
    role: "OWNER",
  },
  {
    id: USER_ID,
    isActive: true,
    role: "FUTURE_ROLE",
  },
])(
  "一般会員・inactive・他人・未知ロールはcontextを返さない %#",
  /**
   * Auth成功だけで許可せず、最新Platform権限がない場合は404で中断する。
   */
  async (row) => { // 権限なしの試験コールバック
    mocks.admin.mockResolvedValue(row); // 権限なしのDB応答を設定するメソッド
    await expect(requirePlatformAdmin()).rejects.toThrow("NEXT_NOT_FOUND"); // 認可関数 / 期待値生成・404制御例外の比較メソッド
    expect(mocks.notFound).toHaveBeenCalledExactlyOnceWith(); // 404参照 / 期待値生成・単一呼出し比較メソッド
    expect(mocks.redirect).not.toHaveBeenCalled(); // 遷移参照 / 期待値生成・未呼出し比較メソッド
  },
);

it.each(["createClient", "getUser"] as const)( // Auth例外発生箇所ごとの試験定義メソッド / 読取専用リテラル型
  "%sの例外を固定エラーにし、権限確認を進めない",
  /**
   * Auth接続・本人検証の例外原文を保持せず、固定のサービスエラーに変換する。
   */
  async (operation) => { // Auth例外箇所別の非同期コールバック
    mocks[operation].mockRejectedValue(new Error("private-auth-endpoint-token")); // 例外応答設定メソッド / 試験用Errorコンストラクター
    const result = requirePlatformAdmin(); // Platform認可関数
    await expect(result).rejects.toBeInstanceOf(DomainError); // 期待値生成・クラス比較メソッド / ドメインエラークラス参照
    await expect(result).rejects.toMatchObject({ // 期待値生成・固定エラー部分一致メソッド
      code: "EXTERNAL_SERVICE",
      publicMessage: "ログイン状態を確認できませんでした。",
      cause: undefined,
    });
    expect(mocks.admin).not.toHaveBeenCalled(); // DB読取参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.redirect).not.toHaveBeenCalled(); // redirect参照 / 期待値生成・未呼出し比較メソッド
  },
);

it( // 試験名とコールバックを登録する関数
  "DB例外を404やログイン成功へ丸めず、安全な固定エラーにする",
  /**
   * 最新権限の取得障害で認可を成功させず、原文・causeを外へ出さない。
   */
  async () => { // DB障害の非同期試験コールバック
    mocks.admin.mockRejectedValue(new Error("private-db-connection-token")); // DB拒否応答設定メソッド / 試験用Errorコンストラクター
    const result = requirePlatformAdmin(); // Platform認可関数
    await expect(result).rejects.toBeInstanceOf(DomainError); // 期待値生成・クラス比較メソッド / ドメインエラークラス参照
    await expect(result).rejects.toMatchObject({ // 期待値生成・固定エラー部分一致メソッド
      code: "INTERNAL",
      publicMessage: "Platform権限を確認できませんでした。",
      cause: undefined,
    });
    expect(mocks.redirect).not.toHaveBeenCalled(); // redirect参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.notFound).not.toHaveBeenCalled(); // notFound参照 / 期待値生成・未呼出し比較メソッド
  },
);

it( // 試験名とコールバックを登録する関数
  "一度許可されても、同じセッションで管理者が無効化されると拒否する",
  /**
   * helperの呼出しごとにAuthとPlatformAdminの最新状態を再確認する。
   */
  async () => { // 権限失効の非同期試験コールバック
    await expect(requirePlatformAdmin()).resolves.toMatchObject({ // 認可関数 / 期待値生成・成功結果部分一致メソッド
      userId: USER_ID,
    });
    mocks.admin.mockResolvedValue({ // 無効化後の応答を設定するメソッド
      id: USER_ID,
      role: "DEVELOPER",
      isActive: false,
    });
    await expect(requirePlatformAdmin()).rejects.toThrow("NEXT_NOT_FOUND"); // 認可関数 / 期待値生成・404制御例外の比較メソッド
    expect(mocks.getUser).toHaveBeenCalledTimes(2); // Auth参照 / 期待値生成・呼出し回数比較メソッド
    expect(mocks.admin).toHaveBeenCalledTimes(2); // DB読取参照 / 期待値生成・呼出し回数比較メソッド
  },
);

it( // 試験名とコールバックを登録する関数
  "Platform管理者でも所属なしではクラブOWNER権限を取得できない",
  /**
   * Platform認可成功とクラブOWNER認可を別々に実行し、自動昇格しないことを確認する。
   */
  async () => { // 権限分離の非同期試験コールバック
    await expect(requirePlatformAdmin()).resolves.toMatchObject({ // Platform認可関数 / 期待値生成・成功結果部分一致メソッド
      userId: USER_ID,
    });
    await expect(requireClubOwner("club-a")).rejects.toThrow("NEXT_NOT_FOUND"); // クラブOWNER認可関数 / 期待値生成・404制御例外の比較メソッド
    expect(mocks.membership).toHaveBeenCalledExactlyOnceWith( // 所属参照 / 期待値生成・単一呼出し引数比較メソッド
      expect.objectContaining({ // 部分一致の期待値生成メソッド
        where: {
          userId: USER_ID,
          status: "ACTIVE",
          club: {
            is: {
              slug: "club-a",
            },
          },
        },
      }),
    );
  },
);

it.each(["createClient", "getUser"] as const)( // 制御例外の発生箇所別試験メソッド / 読取専用リテラル型
  "%sから来るNext制御例外を一般エラーへ変換しない",
  /**
   * Next公開APIが生成した制御例外を、Auth処理のcatchから同一の値で再送出する。
   */
  async (operation) => { // 制御例外の非同期試験コールバック
    const navigation = await vi.importActual<typeof import("next/navigation")>( // 元モジュール読込メソッド / Next navigationモジュールの型
      "next/navigation",
    );
    let control: unknown; // Next公開APIから受け取る例外の不明値型
    try {
      navigation.redirect("/platform-login"); // 実際のNext redirect制御例外を生成する関数
    } catch (error) {
      control = error;
    }
    expect(control).toBeDefined(); // 期待値生成・制御例外の存在確認メソッド
    mocks[operation].mockRejectedValue(control); // Auth境界から制御例外を返すモック設定メソッド
    await expect(requirePlatformAdmin()).rejects.toBe(control); // 認可関数 / 期待値生成・例外の同一性比較メソッド
    expect(mocks.admin).not.toHaveBeenCalled(); // DB読取参照 / 期待値生成・未呼出し比較メソッド
  },
);
