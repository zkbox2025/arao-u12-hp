// tests/club-event-exact-duplicate-repository.test.ts
// 実DBを使わず、完全一致の列・ロール集合・クラブ境界と限定selectを検証する。

import {
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import type { Prisma } from "@prisma/client";

import {
  EVENT_MONTH_COPY_FIELDS, // コピー対象12項目のリスト
} from "@/domain/club/event/event-month-copy-policy";
import type {
  EventMonthCopyEvent, // コピーするイベント1件あたりの型
} from "@/domain/club/event/event-month-copy-types";
import {
  findClubEventExactDuplicateId, // 同一クラブの完全一致する代表イベントIDを取得する関数
} from "@/src/infrastructure/prisma/repositories/club-event-exact-duplicate-repository";

const CLUB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const match = vi.fn(); // 読取モックを生成する関数
const database = {
  clubEvent: {
    findFirst: match, // 読取モック関数の参照
  },
} as unknown as Prisma.TransactionClient; // 未知の値の型 / 通常Clientまたはtransaction client型

/**
 * null・空文字・秒とミリ秒を含む、比較対象12項目の値を生成する。
 */
function event(): EventMonthCopyEvent { // 比較用イベントを生成する関数 / コピー対象12項目のイベント型
  return {
    title: "練習",
    content: "",
    genre: "PRACTICE",
    targetRoles: ["MEMBER", "OWNER", "MEMBER"],
    startAt: new Date("2026-01-01T09:00:00.123Z"), // 日時のコンストラクター
    endAt: new Date("2026-01-01T11:00:00.123Z"), // 日時のコンストラクター
    isAllDay: false,
    location: null,
    meetingAt: null,
    meetingLocation: " ",
    belongings: "水筒",
    notes: null,
  };
}

beforeEach( // 各試験の初期化を登録する関数
  /**
   * 読取履歴を初期化し、既定では未一致を返す。
   */
  () => { // 試験処理を実行するコールバック
    match.mockReset().mockResolvedValue(null); // モックの成功結果を設定するメソッド / モックの実装と履歴を初期化するメソッド
  },
);

it("12項目と過不足のないロール集合で検索し、最小IDだけを取得する", // 試験を登録する関数
  /**
   * 全比較列を保持し、公開状態・本文取得・関連行を検索へ混ぜないことを確認する。
   */
  async () => { // 試験処理を実行するコールバック
    match.mockResolvedValue({ id: OTHER }); // モックの成功結果を設定するメソッド
    expect(await findClubEventExactDuplicateId(CLUB, event(), database)).toBe(OTHER); // 値の一致を検証するメソッド / 期待値を生成する関数 / 同一クラブの完全一致IDを読む関数 / 比較用イベントを生成する関数
    const { targetRoles: omittedRoles, ...columns } = event(); // 比較用イベントを生成する関数
    expect(omittedRoles).toHaveLength(3); // 件数を検証するメソッド / 期待値を生成する関数
    expect(match).toHaveBeenCalledExactlyOnceWith({ // 1回の呼出しと引数を検証するメソッド / 期待値を生成する関数
      where: {
        clubId: CLUB,
        ...columns,
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
    const query = match.mock.calls[0][0];
    for (const field of EVENT_MONTH_COPY_FIELDS) {
      expect(query.where).toHaveProperty(field); // 項目の有無と値を検証するメソッド / 期待値を生成する関数
    }
    expect(query.where).not.toHaveProperty("status"); // 項目の有無と値を検証するメソッド / 期待値を生成する関数
    expect(query).not.toHaveProperty("include"); // 項目の有無と値を検証するメソッド / 期待値を生成する関数
  },
);

it.each([ // 条件別の試験を登録する関数
  [[]],
  [["OWNER"]],
  [["OWNER", "MEMBER"]],
  [["MEMBER", "OWNER", "MEMBER"]],
  [["OWNER", "COACH", "OFFICER", "MEMBER"]],
] as const)("ロール集合%jは順序・重複を無視し、余分・不足を許さない", // 読取専用リテラル型
  /**
   * 生成されたhasEvery・hasSome・isEmptyを評価し、集合の完全一致を検証する。
   */
  async (roles) => { // 引数を受け取って試験・判定を行うコールバック
    const value = event(); // 比較用イベントを生成する関数
    value.targetRoles = [...roles];
    await findClubEventExactDuplicateId(CLUB, value, database); // 同一クラブの完全一致IDを読む関数
    const where = match.mock.calls[0][0].where;
    const allRoles = ["OWNER", "COACH", "OFFICER", "MEMBER"];
    for (let bits = 0; bits < 16; bits += 1) {
      const stored = allRoles.filter( // 条件に合う要素を抽出するメソッド
        /**
         * ビットに対応するロールだけを残し、保存済みの集合を作る。
         */
        (_, index) => (bits & (1 << index)) !== 0, // 対応するビットから保存ロールを選ぶコールバック
      );
      const expected = new Set<string>(roles); // 重複を除く集合のコンストラクター / 文字列型
      let actual: boolean; // 検索条件の評価結果を保持する真偽値型
      if (where.targetRoles.isEmpty === true) {
        actual = stored.length === 0;
      } else {
        const hasAll = where.targetRoles.hasEvery.every( // 必須ロールがすべてあるか検証するメソッド
          /**
           * 必須ロールが保存集合へ含まれるか判定する。
           */
          (role: string) => stored.includes(role), // 包含判定のコールバック / 文字列型 / 配列の包含判定
        );
        const hasExtra = where.NOT.targetRoles.hasSome.some( // 余分なロールの有無を検証するメソッド
          /**
           * 候補にないロールが保存集合へ含まれるか判定する。
           */
          (role: string) => stored.includes(role), // 包含判定のコールバック / 文字列型 / 配列の包含判定
        );
        actual = hasAll && !hasExtra;
      }
      const sameRoles = stored.every( // 保存集合の全要素を検証するメソッド
        /**
         * 保存ロールが期待する集合に含まれるか判定する。
         */
        (role) => expected.has(role), // 集合包含を判定するコールバック / 集合の包含判定メソッド
      );
      expect(actual).toBe( // 期待値を生成する関数 / 条件評価の一致を検証するメソッド
        stored.length === expected.size &&
        sameRoles,
      );
    }
  },
);

it.each(["DRAFT", "PUBLISHED"])("既存側が%sでも公開状態を検索条件にしない", // 条件別の試験を登録する関数
  /**
   * 既存行の状態に関係なく、IDを持つ一致結果をそのまま返す。
   */
  async (status) => { // 引数を受け取って試験・判定を行うコールバック
    match.mockResolvedValue({ // モックの成功結果を設定するメソッド
      id: OTHER,
      status,
    });
    expect(await findClubEventExactDuplicateId(CLUB, event(), database)).toBe(OTHER); // 値の一致を検証するメソッド / 期待値を生成する関数 / 同一クラブの完全一致IDを読む関数 / 比較用イベントを生成する関数
    expect(match.mock.calls[0][0].where).not.toHaveProperty("status"); // 項目の有無と値を検証するメソッド / 期待値を生成する関数
  },
);

it("他クラブを検索せず、null・空文字・空白・ミリ秒を保持する", // 試験を登録する関数
  /**
   * クラブIDを必須条件にし、比較値へフォーム用の正規化を加えない。
   */
  async () => { // 試験処理を実行するコールバック
    expect(await findClubEventExactDuplicateId(OTHER, event(), database)).toBeNull(); // 未一致のnullを検証するメソッド / 期待値を生成する関数 / 同一クラブの完全一致IDを読む関数 / 比較用イベントを生成する関数
    expect(match.mock.calls[0][0].where).toMatchObject({ // 一部の構造を検証するメソッド / 期待値を生成する関数
      clubId: OTHER,
      content: "",
      location: null,
      meetingLocation: " ",
      startAt: new Date("2026-01-01T09:00:00.123Z"), // 日時のコンストラクター
    });
  },
);

it("検証エラーでは検索せず、DBエラーは呼出し元へ伝播する", // 試験を登録する関数
  /**
   * 不正比較値を未一致として扱わず、DB失敗も安全に処理する責務を呼出し元へ残す。
   */
  async () => { // 試験処理を実行するコールバック
    const value = event(); // 比較用イベントを生成する関数
    value.startAt = new Date(NaN); // 日時のコンストラクター
    await expect(findClubEventExactDuplicateId(CLUB, value, database)).rejects.toThrow(); // 例外を検証するメソッド / 期待値を生成する関数 / 同一クラブの完全一致IDを読む関数
    expect(match).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    const error = new Error("private-database-error"); // 例外のコンストラクター
    match.mockRejectedValue(error); // モックの失敗を設定するメソッド
    await expect(findClubEventExactDuplicateId(CLUB, event(), database)).rejects.toBe(error); // 値の一致を検証するメソッド / 期待値を生成する関数 / 同一クラブの完全一致IDを読む関数 / 比較用イベントを生成する関数
  },
);
