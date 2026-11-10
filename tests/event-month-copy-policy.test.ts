// tests/event-month-copy-policy.test.ts
// コピー列の完全一致・不変性・非コピー列の除外と、候補同士の一致情報を検証する。

import { expect, it, vi } from "vitest";

import {
  buildEventMonthCopyKey, // 全コピー列からサーバー内部専用の比較値を作る関数
  findEventMonthCopyCandidateDuplicates, // 候補間の完全一致情報を返す関数
  pickEventMonthCopyEvent, // コピー列だけを検証・抽出する関数
  type EventMonthCopyCandidate, // 元イベントと日時変換結果の組の型
} from "@/domain/club/event/event-month-copy-policy";
import {
  convertEventMonthCopyDateTimes, // クラブ現地時刻で日時を1か月先へ変換する関数
} from "@/domain/club/event/event-month-copy-date-times";
import type {
  EventMonthCopyEvent, // コピーするイベント1件あたりの型
  EventMonthCopySource, // コピー列・複製元ID・更新日時の型
} from "@/domain/club/event/event-month-copy-types";

const SOURCE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SOURCE_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const SOURCE_C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

/**
 * 全コピー列を持つ独立したイベントを作る。
 */
function event(): EventMonthCopyEvent { // 正常イベントを生成する関数 / コピー対象イベントの型
  return {
    title: "練習",
    content: " 本文\n",
    genre: "PRACTICE",
    targetRoles: ["OWNER", "MEMBER"],
    startAt: new Date("2026-01-30T09:00:00.123Z"), // 開始Dateの生成
    endAt: null,
    isAllDay: false,
    location: "グラウンド",
    meetingAt: null,
    meetingLocation: null,
    belongings: "ボール",
    notes: null,
  };
}

/**
 * 固定UTC値から、元データと実際の日時変換結果を作る。
 */
function candidate( // 候補間比較に使うデータを生成する関数
  id = SOURCE_A,
  start = "2026-01-30T09:00:00.123Z",
): EventMonthCopyCandidate { // 元データと変換結果の型
  const source: EventMonthCopySource = { // 複製元イベントの型
    ...event(), // 独立したコピー列を作る関数
    id,
    startAt: new Date(start), // 元の開始Dateを作るコンストラクター
    updatedAt: new Date("2026-01-01T00:00:00.000Z"), // 固定更新日時のDate生成
  };
  return {
    source,
    dateTimes: convertEventMonthCopyDateTimes(source, "UTC"), // 実際の日時変換関数
  };
}

const changes: { // コピー各列の変更ケースを表す内部構造型
  field: keyof EventMonthCopyEvent; // コピー列名の型
  values: Partial<EventMonthCopyEvent>; // コピー列の一部を変更する型
}[] = [
  {
    field: "title",
    values: { title: "大会" },
  },
  {
    field: "content",
    values: { content: "別の本文" },
  },
  {
    field: "genre",
    values: { genre: "OTHER" },
  },
  {
    field: "targetRoles",
    values: { targetRoles: ["OWNER", "COACH"] },
  },
  {
    field: "startAt",
    values: { startAt: new Date("2026-01-30T09:00:00.124Z") }, // 検証用のDateを生成するコンストラクター
  }, // 1ミリ秒異なるDateの生成
  {
    field: "endAt",
    values: { endAt: new Date("2026-01-30T10:00:00.000Z") }, // 検証用のDateを生成するコンストラクター
  }, // 終了Dateの生成
  {
    field: "isAllDay",
    values: { isAllDay: true },
  },
  {
    field: "location",
    values: { location: "別の会場" },
  },
  {
    field: "meetingAt",
    values: { meetingAt: new Date("2026-01-30T08:00:00.000Z") }, // 検証用のDateを生成するコンストラクター
  }, // 集合Dateの生成
  {
    field: "meetingLocation",
    values: { meetingLocation: "集合場所" },
  },
  {
    field: "belongings",
    values: { belongings: "水筒" },
  },
  {
    field: "notes",
    values: { notes: "注意事項" },
  },
];

it.each(changes)( // コピー各列の差を表形式で検証するテスト関数
  "$fieldの差を完全一致として扱わない",
  /**
   * コピー対象の列が1つでも異なれば比較値が変わることを確認する。
   */
  ({ values }) => { // 変更値を受け取るテストコールバック
    const original = event(); // 独立したイベントを作る関数
    expect(buildEventMonthCopyKey({ // 期待値を作る関数 / コピー列の比較値を作る関数
      ...original,
      ...values,
    })).not.toBe(buildEventMonthCopyKey(original)); // 不一致の比較メソッド / 元の比較値を作る関数
  },
);

it("公開状態・ID・作者・公開日時・PDF・配送・既読・メモをコピーにも比較にも含めない", // テストケースを登録する関数
  /**
   * 余分なDB列や関連行を持つオブジェクトから、全コピー列だけが抽出されることを確認する。
   */
  () => { // allowlistと非コピー列を確認するコールバック
    const source = {
      ...event(), // 全コピー列を作る関数
      id: SOURCE_A,
      status: "PUBLISHED",
      createdAt: new Date(0), // コピーしない作成日時のDate生成
      updatedAt: new Date(1), // 比較しない更新日時のDate生成
      createdByMembershipId: SOURCE_B,
      updatedByMembershipId: SOURCE_C,
      firstPublishedAt: new Date(2), // 比較しない公開日時のDate生成
      readRequiredAt: new Date(3), // 比較しない未読基準日時のDate生成
      attachments: [{ id: "fixture-pdf" }],
      lineDeliveries: [{ id: "fixture-line" }],
      reads: [{ id: "fixture-read" }],
      personalMemos: [{ content: "fixture-private-memo" }],
    };
    expect(pickEventMonthCopyEvent(source)).toEqual(event()); // 期待値を作る関数 / コピー列抽出関数 / 構造比較メソッド / 独立イベント生成関数
    expect(buildEventMonthCopyKey(source)).toBe(buildEventMonthCopyKey(event())); // 期待値を作る関数 / コピー列の比較値生成関数 / 一致の比較メソッド / イベント生成関数
    const draft = {
      ...source,
      status: "DRAFT",
    };
    expect(buildEventMonthCopyKey(draft)).toBe( // 期待値を作る関数 / 比較値生成関数 / 公開状態に依存しない比較メソッド
      buildEventMonthCopyKey(source), // 元の比較値を作る関数
    );
  },
);

it("対象ロールを順序・重複に依存しない集合として比較し、OWNERを自動補完しない", // テストケースを登録する関数
  /**
   * 集合としての一致と、元データの欠落を勝手に修復しないことを確認する。
   */
  () => { // ロール集合の意味を確認するコールバック
    const original = event(); // イベントを作る関数
    expect(buildEventMonthCopyKey({ // 期待値を作る関数 / 比較値生成関数
      ...original,
      targetRoles: ["MEMBER", "OWNER", "MEMBER"],
    })).toBe(buildEventMonthCopyKey(original)); // 一致の比較メソッド / 元の比較値生成関数
    const missingOwner = {
      ...original,
      targetRoles: ["MEMBER"] as const, // 読取専用ロール配列の型
    }; // OWNERを欠く読取専用ロール配列の型
    expect(buildEventMonthCopyKey(missingOwner)).not.toBe(buildEventMonthCopyKey(original)); // 期待値を作る関数 / 比較値生成関数 / 欠落を区別する比較メソッド
    expect(pickEventMonthCopyEvent(missingOwner).targetRoles).toEqual(["MEMBER"]); // 期待値を作る関数 / コピー列抽出関数 / 補完しない比較メソッド
  },
);

it.each(["content", "location", "meetingLocation", "belongings", "notes"] as const)( // nullable文字列を検証するテスト関数 / 読取専用タプル型
  "%sのnull・空文字・空白を勝手に同一化しない",
  /**
   * 編集フォームのtrimや空文字null化をコピー比較へ混入させないことを確認する。
   */
  (field) => { // nullableのコピー列を受け取るコールバック
    const original = event(); // イベントを作る関数
    const nullKey = buildEventMonthCopyKey({ // コピー列の比較値を生成する関数
      ...original,
      [field]: null,
    }); // nullを含む比較値生成関数
    expect(buildEventMonthCopyKey({ // 期待値を作る関数 / コピー列の比較値を生成する関数
      ...original,
      [field]: "",
    })).not.toBe(nullKey); // 期待値を作る関数 / 比較値生成関数 / nullとの差の比較メソッド
    expect(buildEventMonthCopyKey({ // 期待値を作る関数 / コピー列の比較値を生成する関数
      ...original,
      [field]: " ",
    })).not.toBe( // 期待値を作る関数 / 比較値生成関数 / 空白との差の比較メソッド
      buildEventMonthCopyKey({ // コピー列の比較値を生成する関数
        ...original,
        [field]: "",
      }), // 空文字を含む比較値生成関数
    );
  },
);

it("区切り文字やUnicode表記を含む本文も、別の列や別の文字列と混同しない", // テストケースを登録する関数
  /**
   * 単純な区切り文字連結や、意図しないUnicode正規化による誤一致を防ぐ。
   */
  () => { // 文字列の完全一致を確認するコールバック
    expect(buildEventMonthCopyKey({ // 期待値を作る関数 / コピー列の比較値を生成する関数
      ...event(), // 検証用のイベントを生成する関数
      title: "a|b",
      content: "c",
    })).not.toBe( // 期待値を作る関数 / 比較値生成関数 / イベント生成関数 / 不一致の比較メソッド
      buildEventMonthCopyKey({ // コピー列の比較値を生成する関数
        ...event(), // 検証用のイベントを生成する関数
        title: "a",
        content: "b|c",
      }), // 比較値生成関数 / イベント生成関数
    );
    expect(buildEventMonthCopyKey({ // 期待値を作る関数 / コピー列の比較値を生成する関数
      ...event(), // 検証用のイベントを生成する関数
      title: "\u00e9",
    })).not.toBe( // 期待値を作る関数 / 比較値生成関数 / イベント生成関数 / 不一致の比較メソッド
      buildEventMonthCopyKey({ // コピー列の比較値を生成する関数
        ...event(), // 検証用のイベントを生成する関数
        title: "e\u0301",
      }), // 比較値生成関数 / イベント生成関数
    );
  },
);

it("抽出したDate・配列や入力独自のtoJSONを、元データと共有しない", // テストケースを登録する関数
  /**
   * 返却値からの入力変更と、独自シリアライズによるallowlist迂回を防ぐ。
   */
  () => { // 元データの非変更を確認するコールバック
    const source = event(); // イベントを作る関数
    const poison = vi.fn( // 呼出しを観測するモック生成メソッド
      /**
       * 呼ばれるべきでない独自JSON処理を検出する。
       */
      () => "fixture-private-value", // 独自JSON処理を模すコールバック
    );
    Object.assign(source.startAt, { toJSON: poison }); // 元Dateへ独自JSON処理を付けるメソッド
    const picked = pickEventMonthCopyEvent(source); // コピー列を抽出する関数
    const before = source.startAt.getTime(); // 元の開始UTC値を取得するメソッド
    picked.startAt.setTime(0); // 返却Dateだけを変更するメソッド
    expect(source.startAt.getTime()).toBe(before); // 期待値を作る関数 / UTC値取得メソッド / 入力保持の比較メソッド
    expect(picked.targetRoles).not.toBe(source.targetRoles); // 期待値を作る関数 / 配列参照の分離を確認するメソッド
    buildEventMonthCopyKey(source); // 独自JSON処理を使わず比較値を作る関数
    expect(poison).not.toHaveBeenCalled(); // 期待値を作る関数 / 独自処理が未呼出しであることの検証メソッド
  },
);

it("不正なコピー値を本文や検証原文なしの固定例外で返す", // テストケースを登録する関数
  /**
   * Zodの詳細例外や入力の内容を公開しないことを確認する。
   */
  () => { // 安全なエラーを確認するコールバック
    const invalid = {
      ...event(), // 検証用のイベントを生成する関数
      genre: "fixture-private-value",
    } as unknown as EventMonthCopyEvent; // イベント生成関数 / 不明値型と検証用イベント型への型アサーション
    expect( // 期待値を作る関数
      /**
       * 不正なイベントの比較を試みる。
       */
      () => buildEventMonthCopyKey(invalid), // 検証対象コールバック / 比較値生成関数
    ).toThrow("複製対象のデータを確認できません。"); // 固定の失敗文を確認するメソッド
  },
);

it("月末補正で候補同士が一致した場合は、元の開始日時順で注意情報だけを返す", // テストケースを登録する関数
  /**
   * 候補の入力順やIDの大小だけではなく、元の開始日時を代表選択の優先順にする。
   */
  () => { // 月末の候補間一致を確認するコールバック
    const earlier = candidate(SOURCE_B, "2026-01-30T09:00:00.123Z"); // 先行候補を作る関数
    const later = candidate(SOURCE_A, "2026-01-31T09:00:00.123Z"); // 後続候補を作る関数
    const candidates = [later, earlier];
    const expected = [{
      sourceEventId: SOURCE_A,
      duplicateSourceEventId: SOURCE_B,
    }];
    expect(findEventMonthCopyCandidateDuplicates(candidates)).toEqual(expected); // 期待値を作る関数 / 候補間一致情報の関数 / 構造比較メソッド
    expect(findEventMonthCopyCandidateDuplicates([earlier, later])).toEqual(expected); // 期待値を作る関数 / 候補間一致情報の関数 / 順序不変の比較メソッド
    expect(candidates[0]).toBe(later); // 期待値を作る関数 / 呼出し元の順序保持の比較メソッド
    expect(later).not.toHaveProperty("initiallySelected"); // 期待値を作る関数 / 選択方針を追加しない検証メソッド
  },
);

it("開始日時が同じ候補では小文字IDの辞書順で代表と注意情報を固定する", // テストケースを登録する関数
  /**
   * 3件以上の一致とUUID表記差でも、代表を一貫して返す。
   */
  () => { // 同時刻の安定順を確認するコールバック
    const first = candidate(SOURCE_A.toUpperCase()); // 候補生成関数 / UUIDの大文字変換メソッド
    expect(findEventMonthCopyCandidateDuplicates([ // 期待値を作る関数 / 候補間一致情報の関数
      candidate(SOURCE_C), // 候補を作る関数
      candidate(SOURCE_B), // 候補を作る関数
      first,
    ])).toEqual([ // 注意情報の順序と代表を比較するメソッド
      {
        sourceEventId: SOURCE_B,
        duplicateSourceEventId: SOURCE_A,
      },
      {
        sourceEventId: SOURCE_C,
        duplicateSourceEventId: SOURCE_A,
      },
    ]);
  },
);

it("変換不能な候補を重複として扱わず、コピー内容が異なる候補も除外しない", // テストケースを登録する関数
  /**
   * 日時変換の失敗を注意表示上の完全一致に混ぜないことを確認する。
   */
  () => { // 非一致と変換不能を確認するコールバック
    const different = candidate(SOURCE_B); // 候補を作る関数
    different.source.content = "異なる内容";
    const gap = candidate(SOURCE_C, "2026-02-08T07:30:00.000Z"); // DST gapへ移る候補を作る関数
    gap.dateTimes = convertEventMonthCopyDateTimes(gap.source, "America/New_York"); // 実際の日時変換関数
    expect(gap.dateTimes.success).toBe(false); // 期待値を作る関数 / 不存在時刻の確認メソッド
    expect(findEventMonthCopyCandidateDuplicates([candidate(), different, gap])).toEqual([]); // 期待値を作る関数 / 候補間一致情報の関数 / 候補生成関数 / 非一致の検証メソッド
  },
);

it("0件・100件を扱い、101件と正規化後に同じ候補IDを拒否する", // テストケースを登録する関数
  /**
   * 上限と候補識別子の曖昧性を、この関数でも受け付けないことを確認する。
   */
  () => { // 件数とID重複を確認するコールバック
    expect(findEventMonthCopyCandidateDuplicates([])).toEqual([]); // 期待値を作る関数 / 候補間一致情報の関数 / 空結果の比較メソッド
    const rows: EventMonthCopyCandidate[] = []; // 候補配列の型
    for (let index = 0; index < 101; index += 1) {
      const prefix = index.toString(16).padStart(8, "0"); // 16進表記の生成 / 8桁への補完メソッド
      rows.push(candidate(`${prefix}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`)); // 候補配列への追加メソッド / 候補生成関数
    }
    expect(findEventMonthCopyCandidateDuplicates(rows.slice(0, 100))).toHaveLength(99); // 期待値を作る関数 / 候補間一致情報の関数 / 配列の切出し / 結果件数の検証メソッド
    expect( // 期待値を作る関数
      /**
       * 上限を超えた候補を渡す。
       */
      () => findEventMonthCopyCandidateDuplicates(rows), // 拒否確認コールバック / 候補間一致情報の関数
    ).toThrow("複製対象のデータを確認できません。"); // 固定エラーの検証メソッド
    expect( // 期待値を作る関数
      /**
       * 大小文字だけが違う同一IDの候補を渡す。
       */
      () => findEventMonthCopyCandidateDuplicates([candidate(), candidate(SOURCE_A.toUpperCase())]), // 拒否確認コールバック / 候補間一致情報の関数 / 候補生成関数 / 大文字変換メソッド
    ).toThrow("複製対象のデータを確認できません。"); // 固定エラーの検証メソッド
  },
);

it("比較用DomainはNode cryptoを読み込まずに利用できる", // テストケースを登録する関数
  /**
   * cryptoを利用不能にしても、純粋な比較モジュールだけは動作することを確認する。
   */
  async () => { // モジュール境界を検証する非同期コールバック
    vi.resetModules(); // モジュールの評価状態をリセットするメソッド
    vi.doMock("node:crypto", // Node cryptoを置換するメソッド
      /**
       * Domainから到達してはいけないNode依存を検出する。
       */
      () => { // Node依存を拒否するモックコールバック
        throw new Error("fixture-node-import"); // Node依存を検出する固定例外の生成
      },
    );
    try {
      const policy = await import("@/domain/club/event/event-month-copy-policy"); // Domainモジュールだけを読み込む関数
      expect(policy.buildEventMonthCopyKey(event())).toBe(buildEventMonthCopyKey(event())); // 期待値を作る関数 / 新規評価と既存の比較値生成関数 / イベント生成関数 / 一致の比較メソッド
    } finally {
      vi.doUnmock("node:crypto"); // Node cryptoのモックを解除するメソッド
      vi.resetModules(); // 他の試験へ評価状態を残さないリセットメソッド
    }
  },
);
