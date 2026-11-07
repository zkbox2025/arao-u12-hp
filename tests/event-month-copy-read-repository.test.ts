// tests/event-month-copy-read-repository.test.ts
// 実DB・Auth・dotenvを評価せず、前月開始・最新権限・有限件数・限定selectを確認する。

import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import type { Prisma } from "@prisma/client";

import {
  EVENT_MONTH_COPY_FIELDS, // 変更できないコピー対象の項目名リスト
} from "@/domain/club/event/event-month-copy-policy";
import type {
  EventMonthCopySource, // コピー列に複製元IDと更新日時を加えた型
} from "@/domain/club/event/event-month-copy-types";
import {
  findEventMonthCopyPreviewData, // 現在の認可条件で上限付きpreview材料を取得する関数
  type EventMonthCopyPreviewDataInput, // 認証済みscopeと対象月の入力型
} from "@/src/infrastructure/prisma/repositories/event-month-copy-read-repository";
import type {
  ClubMemberRole, // Prisma由来の所属ロール型
  ClubMembershipStatus, // Prisma由来の所属状態型
  ContentStatus, // Prisma由来の公開・下書き状態型
  PlanType, // Prisma由来のクラブプラン型
} from "@/types/prisma";

const mocks = vi.hoisted( // import前にDBモックを作るメソッド
  /**
   * 本物のPrisma Clientの初期化を防ぐ3つの読取delegateを作る。
   */
  () => ({ // DB読取モックを返すコールバック
    actor: vi.fn(), // 所属読取のモック生成メソッド
    events: vi.fn(), // 候補読取のモック生成メソッド
    match: vi.fn(), // 既存完全一致読取のモック生成メソッド
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // dotenvを含む共有Clientの読込を置換するメソッド
  /**
   * 実接続を持たず、書込メソッドも提供しないClientを返す。
   */
  () => ({ // 読取専用Clientを返すモックコールバック
    prisma: {
      clubMembership: {
        findFirst: mocks.actor, // 最新所属を読むモック関数の参照
      },
      clubEvent: {
        findMany: mocks.events, // 前月候補を読むモック関数の参照
        findFirst: mocks.match, // 既存一致を読むモック関数の参照
      },
    },
  }),
);

const CLUB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SOURCE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const INPUT: EventMonthCopyPreviewDataInput = { // 認証済みの呼出し元を模す入力型
  clubId: CLUB,
  membershipId: MEMBER,
  userId: USER,
  targetMonth: "2026-02",
};

/**
 * DBが保持している所属のfixture。queryの本人・クラブ・ACTIVE条件で照合する。
 */
type Actor = { // 保存済み所属の試験用型
  id: string; // 所属IDの文字列型
  clubId: string; // クラブIDの文字列型
  userId: string; // Auth本人IDの文字列型
  role: ClubMemberRole; // 保存済みロール型
  status: ClubMembershipStatus; // 保存済み所属状態型
  club: { // 保存済みクラブ設定の構造型
    timezone: string; // 保存済みtimezoneの文字列型
    planType: PlanType; // 保存済みプラン型
  };
};

/**
 * select漏れの検出用に非コピー列も含めたDBイベントfixture。
 */
type StoredEvent = EventMonthCopySource & { // コピー元にDBの余分な列を加えた試験用型
  clubId: string; // 保存先クラブIDの文字列型
  status: ContentStatus; // 公開・下書き状態型
  attachments: { id: string }[]; // 取得してはいけない添付行の型
};
let actor: Actor | null; // 所属がない場合も扱うfixture型
let events: StoredEvent[]; // DB内イベントを模した配列型

/**
 * 独立したコピー元を作る。公開・下書きや日時などは試験ごとに上書きできる。
 */
function event( // コピー元fixtureを生成する関数
  changes: Partial<StoredEvent> = {}, // fixtureの一部だけを上書きする型
): StoredEvent { // 非コピー列も持つコピー元型
  return {
    id: SOURCE,
    clubId: CLUB,
    status: "PUBLISHED",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"), // 更新版Dateの生成
    title: "練習",
    content: "fixture-private-body",
    genre: "PRACTICE",
    targetRoles: ["OWNER", "MEMBER"],
    startAt: new Date("2026-01-15T09:00:00.123Z"), // 開始Dateの生成
    endAt: null,
    isAllDay: false,
    location: null,
    meetingAt: null,
    meetingLocation: "集合場所",
    belongings: "水筒",
    notes: "注意事項",
    attachments: [{ id: "fixture-private-pdf" }],
    ...changes,
  };
}

/**
 * ログが出たかをspyで観測し、試験中のconsole出力だけを抑える空処理。
 */
function silence() { // console出力を抑える試験用関数
  return undefined;
}

beforeEach( // 各試験前の初期化を登録する関数
  /**
   * 初期のACTIVE管理者と、DB条件に応じてfixtureを絞る最小限の読取モックを設定する。
   */
  () => { // 初期fixtureを設定するコールバック
    vi.resetAllMocks(); // モックの履歴・実装をリセットするメソッド
    vi.spyOn(console, "error").mockImplementation(silence); // console監視メソッド / 出力置換メソッド / 空処理の関数参照
    vi.spyOn(console, "warn").mockImplementation(silence); // console監視メソッド / 出力置換メソッド / 空処理の関数参照
    vi.spyOn(console, "log").mockImplementation(silence); // console監視メソッド / 出力置換メソッド / 空処理の関数参照
    actor = {
      id: MEMBER,
      clubId: CLUB,
      userId: USER,
      role: "OWNER",
      status: "ACTIVE",
      club: {
        timezone: "UTC",
        planType: "STANDARD",
      },
    };
    events = [event()]; // 元イベントを生成する関数
    mocks.actor.mockImplementation( // 所属読取の実装を差し替えるメソッド
      /**
       * 呼出し時点の保存済み所属を、queryが指定した識別子・状態で照合する。
       */
      async ({ where }: Prisma.ClubMembershipFindFirstArgs) => { // 所属読取の非同期コールバック / Prisma引数型
        if (
          actor === null ||
          actor.id !== where?.id ||
          actor.clubId !== where.clubId ||
          actor.userId !== where.userId ||
          actor.status !== where.status
        ) {
          return null;
        }
        return actor;
      },
    );
    mocks.events.mockImplementation( // 候補読取の実装を差し替えるメソッド
      /**
       * 開始日時とクラブだけでfixtureを絞る。query形状とselectは各試験で別途検証する。
       */
      async (args: Prisma.ClubEventFindManyArgs) => { // 候補読取の非同期コールバック / Prisma引数型
        const where = args.where as { // この試験で必要な検索条件へ限定する型アサーション
          clubId: string; // 必須クラブIDの文字列型
          startAt: { // 開始日時の半開区間を指定する構造型
            gte: Date; // 前月開始境界のDate型
            lt: Date; // 対象月開始境界のDate型
          };
        };
        return events.filter( // 保存済みfixtureを絞り込むメソッド
          /**
           * 指定クラブ内で、開始が前月範囲に入る予定だけを残す。
           */
          (row) => ( // 予定の所属・開始範囲を確認するコールバック
            row.clubId === where.clubId &&
            row.startAt >= where.startAt.gte &&
            row.startAt < where.startAt.lt
          ),
        ).slice(0, args.take ?? undefined); // 要求された取得上限で切り出すメソッド
      },
    );
    mocks.match.mockResolvedValue(null); // 初期状態を既存一致なしにするメソッド
  },
);
afterEach( // 各試験後の処理を登録する関数
  /**
   * 実装が本文・比較値・例外原文等をconsoleへ出していないことを確認して監視を解除する。
   */
  () => { // ログ非出力と監視解除を確認するコールバック
    expect(console.error).not.toHaveBeenCalled(); // 期待値生成関数 / ログ関数参照 / 未呼出し検証メソッド
    expect(console.warn).not.toHaveBeenCalled(); // 期待値生成関数 / ログ関数参照 / 未呼出し検証メソッド
    expect(console.log).not.toHaveBeenCalled(); // 期待値生成関数 / ログ関数参照 / 未呼出し検証メソッド
    vi.restoreAllMocks(); // consoleの元の動作を戻すメソッド
  },
);

it("本人・クラブ・ACTIVEを再確認し、コピー列とID・更新版だけを要求する", // 試験を登録する関数
  /**
   * staleな画面contextを信用せず、現在のDB所属と限定selectを使用することを確認する。
   */
  async () => { // 最小selectとscopeを確認する非同期コールバック
    const result = await findEventMonthCopyPreviewData(INPUT); // 上限付きpreview材料を取得する関数
    expect(result.outcome).toBe("READY"); // 期待値生成関数 / 結果の比較メソッド
    expect(mocks.actor).toHaveBeenCalledWith({ // 期待値生成関数 / 所属モック参照 / query検証メソッド
      where: {
        id: MEMBER,
        clubId: CLUB,
        userId: USER,
        status: "ACTIVE",
      },
      select: {
        role: true,
        club: {
          select: {
            timezone: true,
            planType: true,
          },
        },
      },
    });
    const query = mocks.events.mock.calls[0][0];
    const expected = Object.fromEntries( // 許可されたselectを作るメソッド
      [...EVENT_MONTH_COPY_FIELDS, "id", "updatedAt"].map( // 許可列をselectの組へ写すメソッド
        /**
         * 取得を許す列を明示する。
         */
        (field) => [field, true], // selectの組を作るコールバック
      ),
    );
    expect(query.select).toEqual(expected); // 期待値生成関数 / select全体の比較メソッド
    expect(query.take).toBe(101); // 期待値生成関数 / 超過検出用上限の検証メソッド
    expect(query.orderBy).toEqual([ // 期待値生成関数 / 安定した順序の比較メソッド
      { startAt: "asc" },
      { id: "asc" },
    ]);
    expect(query.where).not.toHaveProperty("status"); // 期待値生成関数 / 元DRAFTも対象にする検証メソッド
    if (result.outcome !== "READY") {
      throw new Error("fixture-not-ready"); // fixture失敗用の固定例外の生成
    }
    expect(Object.keys(result.candidates[0].source).sort()).toEqual( // 期待値生成関数 / キー取得・整列メソッド / 構造比較メソッド
      Object.keys(expected).sort(), // 許可列名の取得・整列メソッド
    );
    expect(result.candidates[0].source.startAt).not.toBe(events[0].startAt); // 期待値生成関数 / Date参照分離の検証メソッド
    expect(mocks.match).toHaveBeenCalledTimes(1); // 期待値生成関数 / 一致読取モック参照 / Prisma読取呼出し数の検証メソッド
  },
);

it.each(["OWNER", "COACH", "OFFICER"] as const)( // 管理者ロール別試験関数 / 読取専用タプル型
  "現在のロールが%sなら利用できる",
  /**
   * 既存の管理者ロール規約をそのまま利用することを確認する。
   */
  async (role) => { // 管理者ロールを受け取る非同期コールバック
    actor!.role = role;
    expect((await findEventMonthCopyPreviewData(INPUT)).outcome).toBe("READY"); // 期待値生成関数 / 読取関数 / 比較メソッド
  },
);

it.each(["INVITED", "SUSPENDED", "WITHDRAWN"] as const)( // 非ACTIVE状態別試験関数 / 読取専用タプル型
  "保存済み所属が%sなら候補を取得しない",
  /**
   * 古い認可contextが残っていても、現在の所属失効を検出する。
   */
  async (status) => { // 所属状態を受け取る非同期コールバック
    actor!.status = status;
    expect(await findEventMonthCopyPreviewData(INPUT)).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 読取関数 / 固定結果比較メソッド
    expect(mocks.events).not.toHaveBeenCalled(); // 期待値生成関数 / 候補モック参照 / 未呼出し検証メソッド
    expect(mocks.match).not.toHaveBeenCalled(); // 期待値生成関数 / 一致モック参照 / 未呼出し検証メソッド
  },
);

it.each(["id", "clubId", "userId"] as const)( // 所属・クラブ・本人の照合試験関数 / 読取専用タプル型
  "保存済み所属の%sが違えば取得しない",
  /**
   * 別所属・別クラブ・別Auth本人の識別子を流用できないことを確認する。
   */
  async (field) => { // 改変項目を受け取る非同期コールバック
    actor![field] = OTHER;
    expect(await findEventMonthCopyPreviewData(INPUT)).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 読取関数 / 固定結果比較メソッド
    expect(mocks.events).not.toHaveBeenCalled(); // 期待値生成関数 / 候補モック参照 / 未呼出し検証メソッド
  },
);

it.each(["STARTER", "PRO"] as const)( // 利用不可プラン別試験関数 / 読取専用タプル型
  "現在のプランが%sなら取得しない",
  /**
   * セッション時点のプランではなく、現在のプランで拒否する。
   */
  async (plan) => { // プランを受け取る非同期コールバック
    actor!.club.planType = plan;
    expect(await findEventMonthCopyPreviewData(INPUT)).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 読取関数 / 固定結果比較メソッド
    expect(mocks.events).not.toHaveBeenCalled(); // 期待値生成関数 / 候補モック参照 / 未呼出し検証メソッド
  },
);

it("現在のロールがMEMBERまたは所属なしなら拒否する", // 試験を登録する関数
  /**
   * ACTIVEだけでは管理者向け複製材料を取得できないことを確認する。
   */
  async () => { // 権限不足と所属なしを確認する非同期コールバック
    actor!.role = "MEMBER";
    expect(await findEventMonthCopyPreviewData(INPUT)).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 読取関数 / 固定結果比較メソッド
    actor = null;
    expect(await findEventMonthCopyPreviewData(INPUT)).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 読取関数 / 固定結果比較メソッド
    expect(mocks.events).not.toHaveBeenCalled(); // 期待値生成関数 / 候補モック参照 / 未呼出し検証メソッド
  },
);

it("前月のgte/ltだけを使い、継続予定・対象月開始・他クラブを除きDRAFTも含める", // 試験を登録する関数
  /**
   * 期間の重なり検索を流用せず、前月に開始した公開・下書きの両方を返すことを確認する。
   */
  async () => { // 境界と公開状態を確認する非同期コールバック
    events = [
      event({ startAt: new Date("2026-01-01T00:00:00Z") }), // 前月月初のイベント・Dateを生成する関数
      event({ // 下書きの元イベントを作る関数
        id: OTHER,
        status: "DRAFT",
      }), // 下書きの元イベントを生成する関数
      event({ // 前々月から継続する元イベントを生成する関数
        startAt: new Date("2025-12-31T23:59:59.999Z"), // 前々月末Dateの生成
        endAt: new Date("2026-01-03T00:00:00Z"), // 前月まで続く終了Dateの生成
      }),
      event({ startAt: new Date("2026-02-01T00:00:00Z") }), // 対象月初のイベント・Dateを生成する関数
      event({ clubId: OTHER }), // 他クラブのイベントを生成する関数
    ];
    const result = await findEventMonthCopyPreviewData(INPUT); // 前月候補を取得する関数
    expect(mocks.events.mock.calls[0][0].where).toEqual({ // 期待値生成関数 / 前月条件の構造比較メソッド
      clubId: CLUB,
      startAt: {
        gte: new Date("2026-01-01T00:00:00Z"), // 前月月初UTC Dateの生成
        lt: new Date("2026-02-01T00:00:00Z"), // 対象月月初UTC Dateの生成
      },
    });
    if (result.outcome !== "READY") {
      throw new Error("fixture-not-ready"); // fixture失敗用の固定例外の生成
    }
    expect(result.candidates).toHaveLength(2); // 期待値生成関数 / 前月開始の2件だけを確認するメソッド
    expect(result.candidates[1].source.id).toBe(OTHER); // 期待値生成関数 / 元DRAFTを含める比較メソッド
  },
);

it.each([ // 条件別の試験を登録する関数
  ["2026-04", "America/New_York", "2026-03-01T05:00:00Z", "2026-04-01T04:00:00Z"],
  ["2026-02", "Asia/Tokyo", "2025-12-31T15:00:00Z", "2026-01-31T15:00:00Z"],
  ["2027-01", "UTC", "2026-12-01T00:00:00Z", "2027-01-01T00:00:00Z"],
  ["0001-02", "UTC", "0001-01-01T00:00:00Z", "0001-02-01T00:00:00Z"],
  ["0100-01", "UTC", "0099-12-01T00:00:00Z", "0100-01-01T00:00:00Z"],
  ["2020-12", "America/Havana", "2020-11-01T04:00:00Z", "2020-12-01T05:00:00Z"],
  ["2012-05", "America/Havana", "2012-04-01T05:00:00Z", "2012-05-01T04:00:00Z"],
] as const)( // 月境界のtable試験関数 / 読取専用タプル型
  "%sの前月範囲は%sの現地月初から求める",
  /**
   * 現在DBのtimezone、DSTによる月のUTC長の差、年越し、年1〜99を確認する。
   */
  async (targetMonth, timezone, start, end) => { // 月・timezone・期待するUTC境界を受け取る非同期コールバック
    actor!.club.timezone = timezone;
    await findEventMonthCopyPreviewData({ // 新しい対象月で読取を行う関数
      ...INPUT,
      targetMonth,
    });
    expect(mocks.events.mock.calls[0][0].where.startAt).toEqual({ // 期待値生成関数 / UTC境界の構造比較メソッド
      gte: new Date(start), // 期待する前月月初Dateの生成
      lt: new Date(end), // 期待する対象月月初Dateの生成
    });
  },
);

it.each([0, 100, 101])("候補数%s件を除外前に判定してPrisma読取呼出し数を制限する", // 件数別の試験を登録する関数
  /**
   * 101件は変換・除外・重複検索より先に拒否し、100件までは有限回数だけ照合する。
   */
  async (count) => { // 候補数を受け取る非同期コールバック
    events = Array.from({ length: count }, // 指定件数のfixture配列を作るメソッド
      /**
       * 異なる内容の候補を作り、キャッシュが効かない最大Prisma読取呼出し数を確認する。
       */
      (_, index) => event({ // 要素を作るコールバック / イベントfixture生成関数
        id: `${index.toString(16).padStart(8, "0")}-eeee-4eee-8eee-eeeeeeeeeeee`, // ID用の16進文字列生成・桁補完メソッド
        title: `練習${index}`,
        endAt: count > 100 ? new Date(0) : null, // 101件では除外前に拒否する確認用Dateの生成
      }),
    );
    const result = await findEventMonthCopyPreviewData(INPUT); // 上限付き読取関数
    expect(result.outcome).toBe(count > 100 ? "TOO_MANY" : "READY"); // 期待値生成関数 / 上限判定の比較メソッド
    expect(mocks.actor).toHaveBeenCalledTimes(1); // 期待値生成関数 / 所属モック参照 / Prisma読取呼出し数検証メソッド
    expect(mocks.events).toHaveBeenCalledTimes(1); // 期待値生成関数 / 候補モック参照 / Prisma読取呼出し数検証メソッド
    expect(mocks.match).toHaveBeenCalledTimes(count > 100 ? 0 : count); // 期待値生成関数 / 一致モック参照 / 最大Prisma読取呼出し数検証メソッド
    if (count > 100) {
      expect(result).toEqual({ outcome: "TOO_MANY" }); // 期待値生成関数 / 本文を含まない結果の比較メソッド
    }
  },
);

it.each(["DRAFT", "PUBLISHED"] as const)( // 既存側の公開状態別試験関数 / 読取専用タプル型
  "既存側が%sでも、全コピー列とロール集合で一致IDを検索する",
  /**
   * 既存側のstatusをqueryへ含めず、順序に依存する配列equalsも使わないことを確認する。
   */
  async (status) => { // 既存行の状態を受け取る非同期コールバック
    const existing = event({ // 既存イベントfixtureを作る関数
      id: OTHER,
      status,
    }); // 既存イベントfixtureを作る関数
    mocks.match.mockResolvedValue({ id: existing.id }); // 一致する既存IDを返すモック設定メソッド
    events[0].targetRoles = ["MEMBER", "OWNER", "MEMBER"];
    const result = await findEventMonthCopyPreviewData(INPUT); // 既存一致を含む材料を取得する関数
    expect(mocks.match).toHaveBeenCalledWith({ // 期待値生成関数 / 一致モック参照 / query形状の検証メソッド
      where: {
        clubId: CLUB,
        title: "練習",
        content: "fixture-private-body",
        genre: "PRACTICE",
        startAt: new Date("2026-02-15T09:00:00.123Z"), // 秒・ミリ秒を保持した変換後Dateの生成
        endAt: null,
        isAllDay: false,
        location: null,
        meetingAt: null,
        meetingLocation: "集合場所",
        belongings: "水筒",
        notes: "注意事項",
        targetRoles: {
          hasEvery: ["MEMBER", "OWNER"],
        },
        NOT: {
          targetRoles: {
            hasSome: ["COACH", "OFFICER"],
          },
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        id: "asc",
      },
    });
    if (result.outcome !== "READY") {
      throw new Error("fixture-not-ready"); // fixture失敗用の固定例外の生成
    }
    expect(result.candidates[0].duplicateEventId).toBe(OTHER); // 期待値生成関数 / 代表一致IDの比較メソッド
    expect(result.candidates[0]).not.toHaveProperty("initiallySelected"); // 期待値生成関数 / 初期選択を決めない検証メソッド
  },
);

it("空ロール集合・null・空文字・空白を黙って変更しない", // 試験を登録する関数
  /**
   * コピー元の値をそのまま検索条件へ使い、フォーム用の正規化を混ぜないことを確認する。
   */
  async () => { // コピー値の保持を確認する非同期コールバック
    events[0].targetRoles = [];
    events[0].content = "";
    events[0].meetingLocation = " ";
    await findEventMonthCopyPreviewData(INPUT); // コピー値を保持して取得する関数
    expect(mocks.match.mock.calls[0][0].where).toMatchObject({ // 期待値生成関数 / 値を変更しない構造比較メソッド
      targetRoles: {
        isEmpty: true,
      },
      content: "",
      location: null,
      meetingLocation: " ",
    });
  },
);

it("月末補正で同じ変換値になる候補は検索を共有し、候補自体は両方返す", // 試験を登録する関数
  /**
   * 同じ変換値の一致検索を繰り返さず、初期選択や候補の除外は後続へ残す。
   */
  async () => { // 検索結果の共有を確認する非同期コールバック
    events = [
      event({ startAt: new Date("2026-01-30T09:00:00Z") }), // 月末候補のイベント・Date生成関数
      event({ // 別IDの月末候補を生成する関数
        id: OTHER,
        startAt: new Date("2026-01-31T09:00:00Z"), // 同じ補正後日時へ移るDateの生成
      }),
    ];
    const result = await findEventMonthCopyPreviewData(INPUT); // 月末候補を取得する関数
    expect(mocks.match).toHaveBeenCalledTimes(1); // 期待値生成関数 / 一致モック参照 / Prisma読取呼出し数検証メソッド
    if (result.outcome !== "READY") {
      throw new Error("fixture-not-ready"); // fixture失敗用の固定例外の生成
    }
    expect(result.candidates).toHaveLength(2); // 期待値生成関数 / 両候補を保持する検証メソッド
  },
);

it("変換失敗を理由付きで保持し、既存一致検索は行わない", // 試験を登録する関数
  /**
   * DST gapやfold、期間逆転は取得失敗や件数ゼロとは区別して返す。
   */
  async () => { // 日時変換による除外材料を確認する非同期コールバック
    actor!.club.timezone = "America/New_York";
    events = [event({ startAt: new Date("2026-02-08T07:30:00Z") })]; // DST gapへ移るイベント・Date生成関数
    const result = await findEventMonthCopyPreviewData({ // 対象月を変更して取得する関数
      ...INPUT,
      targetMonth: "2026-03",
    });
    if (result.outcome !== "READY") {
      throw new Error("fixture-not-ready"); // fixture失敗用の固定例外の生成
    }
    expect(result.candidates[0].dateTimes).toMatchObject({ // 期待値生成関数 / 変換失敗材料の比較メソッド
      success: false,
      exclusionReason: "INVALID_DATE_TIME",
      issue: "NONEXISTENT_LOCAL_TIME",
    });
    expect(result.candidates[0].duplicateEventId).toBeNull(); // 期待値生成関数 / 未照合の確認メソッド
    expect(mocks.match).not.toHaveBeenCalled(); // 期待値生成関数 / 一致モック参照 / 未呼出し検証メソッド
  },
);

it.each(["actor", "events", "match"] as const)( // DB失敗箇所ごとの試験関数 / 読取専用タプル型
  "%sの失敗で原文・本文を返さず、ログにも出さない",
  /**
   * Prismaの生例外を公開結果へ混入させず、固定結果で取得失敗を返す。
   */
  async (phase) => { // 失敗させる読取箇所を受け取る非同期コールバック
    mocks[phase].mockRejectedValue(new Error("fixture-private-body database-secret")); // 失敗モック設定メソッド / 原文を含む試験用例外の生成
    expect(await findEventMonthCopyPreviewData(INPUT)).toEqual({ outcome: "PREVIEW_FAILED" }); // 期待値生成関数 / 読取関数 / 安全な結果の比較メソッド
  },
);

it.each(["2026-13", "0001-01", " 2026-02", "2026-02\n"])( // 不正対象月の試験関数
  "不正な対象月%jをDB読取前に拒否する",
  /**
   * 現在月へのfallbackや、無効な前月範囲の生成を行わない。
   */
  async (targetMonth) => { // 不正な対象月を受け取る非同期コールバック
    expect(await findEventMonthCopyPreviewData({ // 期待値生成関数 / 対象月を検証する読取関数
      ...INPUT,
      targetMonth,
    })).toEqual({ outcome: "PREVIEW_FAILED" }); // 固定失敗結果を比較するメソッド
    expect(mocks.actor).not.toHaveBeenCalled(); // 期待値生成関数 / 所属モック参照 / 未呼出し検証メソッド
  },
);

it("DBのtimezoneが不正なら元値を出さず固定失敗にする", // 試験を登録する関数
  /**
   * 現在の設定不正を黙ってUTCへ置き換えない。
   */
  async () => { // 不正timezoneを確認する非同期コールバック
    actor!.club.timezone = "fixture-invalid-timezone";
    expect(await findEventMonthCopyPreviewData(INPUT)).toEqual({ outcome: "PREVIEW_FAILED" }); // 期待値生成関数 / 読取関数 / 安全な結果の比較メソッド
    expect(mocks.events).not.toHaveBeenCalled(); // 期待値生成関数 / 候補モック参照 / 未呼出し検証メソッド
  },
);

it("指定transaction clientだけを使い、通常Clientへ戻らない", // 試験を登録する関数
  /**
   * 後続commit処理が渡すtransaction内でも、同じ認可と読取を実行できることを確認する。
   */
  async () => { // transaction client再利用を確認する非同期コールバック
    const transactionActor = vi.fn().mockResolvedValue(actor); // transaction内所属モックの生成・返却設定メソッド
    const transactionEvents = vi.fn().mockResolvedValue([]); // transaction内候補モックの生成・返却設定メソッド
    const transactionMatch = vi.fn(); // transaction内一致モックの生成メソッド
    const transaction = {
      clubMembership: {
        findFirst: transactionActor, // transaction内所属関数の参照
      },
      clubEvent: {
        findMany: transactionEvents, // transaction内候補関数の参照
        findFirst: transactionMatch, // transaction内一致関数の参照
      },
    } as unknown as Prisma.TransactionClient; // 試験用delegateをtransaction client型へ変換する型アサーション
    expect((await findEventMonthCopyPreviewData(INPUT, transaction)).outcome).toBe("READY"); // 期待値生成関数 / 指定Clientでの読取関数 / 結果比較メソッド
    expect(transactionActor).toHaveBeenCalledTimes(1); // 期待値生成関数 / 所属関数参照 / Prisma読取呼出し数検証メソッド
    expect(transactionEvents).toHaveBeenCalledTimes(1); // 期待値生成関数 / 候補関数参照 / Prisma読取呼出し数検証メソッド
    expect(mocks.actor).not.toHaveBeenCalled(); // 期待値生成関数 / 通常Client所属関数参照 / 未使用の検証メソッド
    expect(mocks.events).not.toHaveBeenCalled(); // 期待値生成関数 / 通常Client候補関数参照 / 未使用の検証メソッド
    expect(mocks.match).not.toHaveBeenCalled(); // 期待値生成関数 / 通常Client一致関数参照 / 未使用の検証メソッド
  },
);


it("終日予定は排他的な終了境界と集合日時も変換して一致検索する", // 試験を登録する関数
  /**
   * 月跨ぎの終日予定でも、既存一致の検索を対象月内の終了日時へ切り詰めない。
   */
  async () => { // 終日予定の検索材料を確認する非同期コールバック
    events = [event({ // 終日予定fixtureを作る関数
      isAllDay: true,
      startAt: new Date("2026-01-31T00:00:00Z"), // 月末の開始Dateの生成
      endAt: new Date("2026-02-01T00:00:00Z"), // 排他的な終了Dateの生成
      meetingAt: new Date("2026-01-31T08:00:00Z"), // 集合Dateの生成
    })];
    await findEventMonthCopyPreviewData(INPUT); // 終日の候補を取得する関数
    expect(mocks.match.mock.calls[0][0].where).toMatchObject({ // 期待値生成関数 / 変換後全日時の比較メソッド
      isAllDay: true,
      startAt: new Date("2026-02-28T00:00:00Z"), // 補正後の開始Dateの生成
      endAt: new Date("2026-03-01T00:00:00Z"), // 補正後の排他的な終了Dateの生成
      meetingAt: new Date("2026-02-28T08:00:00Z"), // 補正後の集合Dateの生成
    });
  },
);

it.each([ // 条件別の試験を登録する関数
  ["2026-10-01T05:30:00Z", null, "2026-11", "AMBIGUOUS_LOCAL_TIME"],
  ["2026-01-15T09:00:00Z", "2026-01-15T08:00:00Z", "2026-02", "INVALID_INTERVAL"],
] as const)( // foldと期間不正の試験関数 / 読取専用タプル型
  "変換できない予定%jも理由を残して返す",
  /**
   * foldの時刻選択や期間修正を行わず、後続が除外表示に使える変換結果を保持する。
   */
  async (start, end, targetMonth, issue) => { // 不正候補の日時・月・理由を受け取る非同期コールバック
    actor!.club.timezone = "America/New_York";
    events = [event({ // 変換できない予定fixtureを作る関数
      startAt: new Date(start), // 元の開始Dateの生成
      endAt: end === null ? null : new Date(end), // 元の終了Dateの生成
    })];
    const result = await findEventMonthCopyPreviewData({ // 変換失敗を含む材料を取得する関数
      ...INPUT,
      targetMonth,
    });
    if (result.outcome !== "READY") {
      throw new Error("fixture-not-ready"); // fixture失敗用の固定例外の生成
    }
    expect(result.candidates[0].dateTimes).toMatchObject({ // 期待値生成関数 / 失敗理由の比較メソッド
      success: false,
      issue,
    });
    expect(mocks.match).not.toHaveBeenCalled(); // 期待値生成関数 / 一致モック参照 / 未検索の検証メソッド
  },
);
