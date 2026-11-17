// tests/mvp/attachment-routes.test.ts
// 4つの実GET・認可・Repositoryを通し、拒否時は署名URLを発行しないことを確認する。

import {
  afterEach, // ケース終了時の後片付けと検証を登録する関数
  beforeEach, // ケースごとの独立した初期状態を登録する関数
  expect, // 期待値を検証する関数
  it, // 試験ケースを登録する関数
  vi, // 外部入出力を監視または置換するAPI
} from "vitest";
import {
  GET as memberEvent, // 会員用イベント添付の実GETを呼ぶ関数
} from "@/app/(club-app)/club/[clubSlug]/attachments/event/[attachmentId]/route";
import {
  GET as adminEvent, // 管理者用イベント添付の実GETを呼ぶ関数
} from "@/app/(club-app)/club/[clubSlug]/admin/attachments/event/[attachmentId]/route";
import {
  GET as memberNotice, // 会員用お知らせ添付の実GETを呼ぶ関数
} from "@/app/(club-app)/club/[clubSlug]/attachments/notice/[attachmentId]/route";
import {
  GET as adminNotice, // 管理者用お知らせ添付の実GETを呼ぶ関数
} from "@/app/(club-app)/club/[clubSlug]/admin/attachments/notice/[attachmentId]/route";

const boundary = vi.hoisted( // importより前に境界の状態を用意する関数
  /**
   * import前にDB・Auth・Next境界の監視状態を用意する。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    auth: vi.fn(), // 呼出しを記録するmockを作る関数
    membership: vi.fn(), // 呼出しを記録するmockを作る関数
    eventAttachment: vi.fn(), // 呼出しを記録するmockを作る関数
    noticeAttachment: vi.fn(), // 呼出しを記録するmockを作る関数
    sign: vi.fn(), // 呼出しを記録するmockを作る関数
    forbidden: vi.fn(), // 呼出しを記録するmockを作る関数
    notFound: new Error("NEXT_NOT_FOUND"), // 例外を作るコンストラクター
    redirect: new Error("NEXT_LOGIN_REDIRECT"), // 例外を作るコンストラクター
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    prisma: {
      clubMembership: {
        findFirst: boundary.membership, // 外部入出力を記録するmock関数を参照する
      },
      clubEventAttachment: {
        findFirst: boundary.eventAttachment, // 外部入出力を記録するmock関数を参照する
      },
      clubNoticeAttachment: {
        findFirst: boundary.noticeAttachment, // 外部入出力を記録するmock関数を参照する
      },
    },
  }),
);
vi.mock("@/src/infrastructure/supabase/server", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    /**
     * 実Auth SDKを初期化せず、認証結果の境界を返す。
     */
    createClient: async () => ({ // 境界の置換またはケース検証のコールバック
      auth: {
        getUser: boundary.auth, // 外部入出力を記録するmock関数を参照する
      },
    }),
  }),
);
vi.mock("@/src/infrastructure/storage/club-content-attachment-storage", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    createClubAttachmentSignedUrl: boundary.sign, // 外部入出力を記録するmock関数を参照する
  }),
);
vi.mock("next/navigation", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    /**
     * NextのnotFoundを固定の制御例外として再現する。
     */
    notFound: () => { // 境界の置換またはケース検証のコールバック
      throw boundary.notFound;
    },
    /**
     * 遷移先を含むNextのredirect制御例外を再現する。
     */
    redirect: () => { // 境界の置換またはケース検証のコールバック
      throw boundary.redirect;
    },
  }),
);
vi.mock("dotenv/config", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => { // 境界の置換またはケース検証のコールバック
    boundary.forbidden(); // 外部入出力の呼出しを記録するmock関数 / 外部入出力を記録するmock関数を参照する
    throw new Error("Unexpected dotenv initialization"); // 例外を作るコンストラクター
  },
);

const CLUB_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ATTACHMENT_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ATTACHMENT_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PRIVATE = "FAKE_B_CONTENT_NEVER_RETURN";
const PATH = `clubs/${CLUB_A}/events/${PRIVATE}/fixture.pdf`;
const SIGNED = `http://127.0.0.1:54321/storage/v1/object/sign/${PRIVATE}?token=FAKE_SIGNATURE`;
const ROUTES = ["member-event", "admin-event", "member-notice", "admin-notice"] as const; // リテラル型を保持するconstアサーション

/**
 * 存在する4つのGETから、ケースが指定するRouteを選ぶ。
 */
function route(name: typeof ROUTES[number]) { // 指定された4つの実GETから対象Routeを選ぶ関数 / 値の宣言から型を取得する型 / 数値型
  switch (name) {
    case "member-event":
      return memberEvent; // 会員用イベント添付の実GET関数
    case "admin-event":
      return adminEvent; // 管理者用イベント添付の実GET関数
    case "member-notice":
      return memberNotice; // 会員用お知らせ添付の実GET関数
    case "admin-notice":
      return adminNotice; // 管理者用お知らせ添付の実GET関数
  }
}

/**
 * hidden値やqueryに関係なく、Promise paramsを受け取る実GETを呼ぶ。
 */
function invoke(name: typeof ROUTES[number], attachmentId = ATTACHMENT_A, clubSlug = "fixture-a") { // Promise paramsと改ざんqueryで実GETを直接呼ぶ関数 / 値の宣言から型を取得する型 / 数値型
  const request = new Request(`http://127.0.0.1:3000/fixture?clubId=forged-b&storagePath=${PRIVATE}`); // HTTP要求を表す組込み型・コンストラクター
  return route(name)(request, { // 指定された4つの実GETから対象Routeを選ぶ関数 / 選択した実GETを呼び出す
    params: Promise.resolve({ // Promise paramsを生成する標準関数
      clubSlug,
      attachmentId,
    }),
  });
}

/**
 * 実認可が読む本人・ACTIVE所属・対象slugの絞込みを検証する。
 */
function checkedIdentity(slug = "fixture-a"): void { // Auth本人とACTIVE所属・clubSlugの再取得を照合する関数 / 戻り値を使わない型
  expect(boundary.auth).toHaveBeenCalledTimes(1); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
  expect(boundary.membership).toHaveBeenCalledWith({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    where: {
      userId: USER_A,
      status: "ACTIVE",
      club: {
        is: {
          slug,
        },
      },
    },
    select: expect.any(Object), // コンストラクターに対応する値を照合するmatcher / 標準オブジェクトのコンストラクター
  });
}

/**
 * 拒否応答には保存先・署名・他クラブ本文を含めず、署名呼出しもないことを確認する。
 */
async function denied(response: Response): Promise<void> { // 404応答が保存先や署名を返さず、署名呼出しもないことを確認する関数 / HTTP応答を表す組込み型 / 非同期結果の型・標準API / 戻り値を使わない型
  expect(response.status).toBe(404); // 値の一致を検証するメソッド / 期待値を検証する関数
  expect(response.headers.get("location")).toBeNull(); // nullかどうかを検証するメソッド / 期待値を検証する関数 / HTTP headerまたはフォームの値を取得するメソッド
  expect(await response.text()).toBe("Not Found"); // 値の一致を検証するメソッド / 期待値を検証する関数 / HTTP応答本文を文字列で取得するメソッド
  expect(boundary.sign).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
}

beforeEach( // ケースごとの独立した初期状態を登録する関数
  /**
   * 他ケースの状態を引き継がず、このケースの入力と監視を用意する。
   */
  () => { // 境界の置換またはケース検証のコールバック
    vi.resetAllMocks(); // 前ケースのmock状態を初期化する関数
    boundary.auth.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      data: {
        user: {
          id: USER_A,
        },
      },
      error: null,
    });
    boundary.membership.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      id: MEMBER_A,
      role: "OWNER",
      club: {
        id: CLUB_A,
        name: "架空のAクラブ",
        slug: "fixture-a",
        timezone: "Asia/Tokyo",
        planType: "STANDARD",
      },
    });
    boundary.eventAttachment.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      storagePath: PATH,
    });
    boundary.noticeAttachment.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      storagePath: PATH,
    });
    boundary.sign.mockResolvedValue(SIGNED); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    vi.spyOn(globalThis, "fetch").mockImplementation( // 境界の動作を置き換えるメソッド / 外部出力の呼出しを監視する関数
      /**
       * 外部入出力を試験用に置き換え、実通信や実出力を行わない。
       */
      async () => { // 境界の置換またはケース検証のコールバック
        throw new Error("Unexpected network request"); // 例外を作るコンストラクター
      },
    );
    for (const method of ["log", "warn", "error"] as const) { // リテラル型を保持するconstアサーション
      vi.spyOn(console, method).mockImplementation( // 境界の動作を置き換えるメソッド / 外部出力の呼出しを監視する関数
        /**
         * 外部入出力を試験用に置き換え、実通信や実出力を行わない。
         */
        () => undefined, // 境界の置換またはケース検証のコールバック
      );
    }
  },
);
afterEach( // ケース終了時の後片付けと検証を登録する関数
  /**
   * ケース所有の資源と外部出力の状態を確認する。
   */
  () => { // 境界の置換またはケース検証のコールバック
    try {
      expect(boundary.forbidden).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
      expect(globalThis.fetch).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / HTTP通信関数の参照
      expect(console.log).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / ログ出力関数の参照
      expect(console.warn).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / ログ出力関数の参照
      expect(console.error).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / ログ出力関数の参照
    } finally {
      vi.restoreAllMocks(); // consoleとfetchの監視を元に戻す関数
    }
  },
);

it.each(ROUTES)("%sの許可GETはA scopeを再取得し、保存先を本文へ出さず署名先へ遷移する", // 入力別にケースを登録するメソッド
  /**
   * このケースの境界処理または検証処理を実行する。
   */
  async (name) => { // 境界の置換またはケース検証のコールバック
    const response = await invoke(name); // Promise paramsと改ざんqueryで実GETを直接呼ぶ関数
    checkedIdentity(); // Auth本人とACTIVE所属・clubSlugの再取得を照合する関数
    const query = name.endsWith("event") ? boundary.eventAttachment : boundary.noticeAttachment; // Routeがイベント側か確認するメソッド / 外部入出力を記録するmock関数を参照する
    const parent = name.endsWith("event") ? "event" : "notice"; // Routeがイベント側か確認するメソッド
    expect(query).toHaveBeenCalledWith({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数
      where: {
        id: ATTACHMENT_A,
        clubId: CLUB_A,
        ...(name.startsWith("member") ? { // 名前または所有prefixの一致を検証するメソッド
          [parent]: {
            clubId: CLUB_A,
            status: "PUBLISHED",
            firstPublishedAt: {
              not: null,
            },
            targetRoles: {
              has: "OWNER",
            },
          },
        } : {}),
      },
      select: {
        storagePath: true,
      },
    });
    expect(boundary.sign).toHaveBeenCalledExactlyOnceWith(PATH); // 呼出し1回と引数の完全一致を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(boundary.sign.mock.invocationCallOrder[0]); // 添付取得が署名より先であることを検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(response.status).toBe(307); // 値の一致を検証するメソッド / 期待値を検証する関数
    expect(response.headers.get("location")).toBe(SIGNED); // 値の一致を検証するメソッド / 期待値を検証する関数 / HTTP headerまたはフォームの値を取得するメソッド
    expect(await response.text()).toBe(""); // 値の一致を検証するメソッド / 期待値を検証する関数 / HTTP応答本文を文字列で取得するメソッド
  },
);

it.each(ROUTES)("%sで他クラブattachmentIdが取得できなければ404で署名しない", // 入力別にケースを登録するメソッド
  /**
   * このケースの境界処理または検証処理を実行する。
   */
  async (name) => { // 境界の置換またはケース検証のコールバック
    boundary.eventAttachment.mockResolvedValue(null); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    boundary.noticeAttachment.mockResolvedValue(null); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    await denied(await invoke(name, ATTACHMENT_B)); // 404応答が保存先や署名を返さず、署名呼出しもないことを確認する関数 / Promise paramsと改ざんqueryで実GETを直接呼ぶ関数
    checkedIdentity(); // Auth本人とACTIVE所属・clubSlugの再取得を照合する関数
    const query = name.endsWith("event") ? boundary.eventAttachment : boundary.noticeAttachment; // Routeがイベント側か確認するメソッド / 外部入出力を記録するmock関数を参照する
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 指定した安全条件を含むか照合するmatcher
      where: expect.objectContaining({ // 指定した安全条件を含むか照合するmatcher
        id: ATTACHMENT_B,
        clubId: CLUB_A,
      }),
    }));
  },
);

it.each(["member-event", "member-notice"] as const)("%sでDRAFT・対象外role・初回公開前は公開条件で拒否する", // 入力別にケースを登録するメソッド / リテラル型を保持するconstアサーション
  /**
   * このケースの境界処理または検証処理を実行する。
   */
  async (name) => { // 境界の置換またはケース検証のコールバック
    boundary.eventAttachment.mockResolvedValue(null); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    boundary.noticeAttachment.mockResolvedValue(null); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    await denied(await invoke(name)); // 404応答が保存先や署名を返さず、署名呼出しもないことを確認する関数 / Promise paramsと改ざんqueryで実GETを直接呼ぶ関数
    const query = name === "member-event" ? boundary.eventAttachment : boundary.noticeAttachment; // 外部入出力を記録するmock関数を参照する
    const parent = name === "member-event" ? "event" : "notice";
    expect(query).toHaveBeenCalledWith({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数
      where: {
        id: ATTACHMENT_A,
        clubId: CLUB_A,
        [parent]: {
          clubId: CLUB_A,
          status: "PUBLISHED",
          firstPublishedAt: {
            not: null,
          },
          targetRoles: {
            has: "OWNER",
          },
        },
      },
      select: {
        storagePath: true,
      },
    });
  },
);

it.each(["admin-event", "admin-notice"] as const)("MEMBERが%sを直接呼ぶと添付取得と署名より先に実認可が拒否する", // 入力別にケースを登録するメソッド / リテラル型を保持するconstアサーション
  /**
   * このケースの境界処理または検証処理を実行する。
   */
  async (name) => { // 境界の置換またはケース検証のコールバック
    boundary.membership.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      id: MEMBER_A,
      role: "MEMBER",
      club: {
        id: CLUB_A,
        slug: "fixture-a",
        planType: "STANDARD",
      },
    });
    await expect(invoke(name)).rejects.toBe(boundary.notFound); // 値の一致を検証するメソッド / 期待値を検証する関数 / Promise paramsと改ざんqueryで実GETを直接呼ぶ関数
    checkedIdentity(); // Auth本人とACTIVE所属・clubSlugの再取得を照合する関数
    expect(boundary.eventAttachment).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(boundary.noticeAttachment).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(boundary.sign).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
  },
);

it.each(ROUTES)("%sのclubSlugを未所属Bへ差し替えても添付取得・署名を行わない", // 入力別にケースを登録するメソッド
  /**
   * このケースの境界処理または検証処理を実行する。
   */
  async (name) => { // 境界の置換またはケース検証のコールバック
    boundary.membership.mockResolvedValue(null); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    await expect(invoke(name, ATTACHMENT_B, "fixture-b")).rejects.toBe(boundary.notFound); // 値の一致を検証するメソッド / 期待値を検証する関数 / Promise paramsと改ざんqueryで実GETを直接呼ぶ関数
    checkedIdentity("fixture-b"); // Auth本人とACTIVE所属・clubSlugの再取得を照合する関数
    expect(boundary.eventAttachment).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(boundary.noticeAttachment).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(boundary.sign).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
  },
);

it.each(ROUTES)("未認証の%sは添付取得・署名前にログインへ移動する", // 入力別にケースを登録するメソッド
  /**
   * このケースの境界処理または検証処理を実行する。
   */
  async (name) => { // 境界の置換またはケース検証のコールバック
    boundary.auth.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      data: {
        user: null,
      },
      error: null,
    });
    await expect(invoke(name)).rejects.toBe(boundary.redirect); // 値の一致を検証するメソッド / 期待値を検証する関数 / Promise paramsと改ざんqueryで実GETを直接呼ぶ関数
    expect(boundary.membership).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(boundary.eventAttachment).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(boundary.noticeAttachment).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(boundary.sign).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
  },
);
