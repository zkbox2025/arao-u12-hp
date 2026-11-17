// tests/event-practice-batch-form.test.ts
// DB・Auth・Nextへ接続せず、定期練習入力の信頼境界と限定結果型を検証する。

import {
  expect,
  expectTypeOf,
  it,
} from "vitest";

import {
  isEventPracticeBatchTargetMonth, // 前月を必要としない単一の対象月を検証する関数
  parseEventPracticeBatchFormData, // 保存用FormDataの構造と入力値を検証する関数
  parseEventPracticeBatchPreviewFormData, // preview用FormDataから共通入力だけを検証する関数
  validateEventPracticeBatchInput, // 共通入力・選択日・識別子を検証する関数
  validateEventPracticeBatchPreviewInput, // 共通入力を検証・正規化する関数
} from "@/domain/club/event/event-practice-batch-form";
import {
  EVENT_PRACTICE_BATCH_MAX_COUNT, // 候補と選択の最大件数31件
  type EventPracticeBatchActionData, // 保存済みのreceiptと再読込指示の型
  type EventPracticeBatchActionState, // 保存成功・結果不明等を判別するAction state型
  type EventPracticeBatchCommonInput, // 構造検証・正規化した共通入力型
  type EventPracticeBatchField, // 共通入力と実行入力の項目名型
  type EventPracticeBatchInput, // 共通入力・選択日・操作識別子を持つ型
  type EventPracticeBatchPreview, // preview成功と取得失敗等を分ける型
  type EventPracticeBatchPreviewActionState, // preview入力と成功データを分けるAction state型
  type EventPracticeBatchPreviewReady, // 共通入力と限定候補を持つpreview成功データ型
  type EventPracticeBatchResult, // 作成済み・replay・拒否・結果不明を分ける型
  type EventPracticeBatchValidation, // 検証成功と安全なエラーを区別する型
} from "@/domain/club/event/event-practice-batch-types";

const REQUEST = "550e8400-e29b-41d4-a716-446655440000";
const FINGERPRINT = "ab".repeat(32); // 文字列を繰り返すメソッド
const PRIVATE = "PRIVATE_INPUT_SQL_TOKEN";

/**
 * DBやtimezoneを必要としない、独立した正常な共通入力を作る。
 */
function common(): EventPracticeBatchCommonInput { // 共通入力を作る関数 / 構造検証・正規化した共通入力型
  return {
    targetMonth: "2026-01",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    weekdays: [1, 3, 5],
    title: "練習",
    startTime: "18:00",
    endTime: "20:00",
    location: null,
    meetingTime: null,
    meetingLocation: null,
    targetRoles: ["OWNER", "MEMBER"],
  };
}

/**
 * 正常な選択日と操作IDを持つ保存入力を作る。
 */
function input(): EventPracticeBatchInput { // 保存入力を作る関数 / 保存入力型
  return {
    ...common(), // 共通入力を作る関数
    selectedDates: ["2026-01-02"],
    requestId: REQUEST,
    previewFingerprint: FINGERPRINT,
  };
}

/**
 * 単一・反復項目を、実際のブラウザーと同じFormDataへ写す。
 */
function form(execute = true): FormData { // 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数 / 送信フォームの型・コンストラクター
  const data = execute ? input() : common(); // 保存入力を作る関数 / 共通入力を作る関数
  const result = new FormData(); // 送信フォームの型・コンストラクター
  for (const [field, value] of Object.entries(data)) { // キーと値の組を取得するメソッド
    if (Array.isArray(value)) { // 配列かを調べる関数
      for (const item of value) {
        result.append(field, String(item)); // フォームへ値を追加するメソッド / 値を文字列へ変換する関数
      }
    } else if (value !== null) {
      result.set(field, String(value)); // フォームの値を設定するメソッド / 値を文字列へ変換する関数
    }
  }
  return result;
}

/**
 * 固定エラー・未検証dataの非返却・機密情報の非含有を共通で検証する。
 */
function failure( // 安全な検証失敗を確認する関数
  result: EventPracticeBatchValidation<unknown>, // 入力検証の結果型 / 未検証の値を表す型
  field?: EventPracticeBatchField, // 入力項目名型
): void { // 戻り値を持たない型
  expect(result.success).toBe(false); // 値の一致を検証するメソッド / 期待値を検証する関数
  if (!result.success) {
    if (field) {
      expect(result.fieldErrors[field]).toBeDefined(); // 値の存在を検証するメソッド / 期待値を検証する関数
    }
    expect(result).not.toHaveProperty("data"); // プロパティの存在を検証するメソッド / 期待値を検証する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を検証する関数 / 値をJSON文字列へ変換する関数
  }
}

/**
 * 配列やnullも1つの値として表形式テストへ渡す。
 */
function row(value: unknown): [unknown] { // 配列やnullも1つの値として表形式テストへ渡す関数 / 未検証の値を表す型
  return [value];
}

it.each(["0001-01", "0001-02", "2026-01", "9999-12"])( // 表形式の試験を登録する関数
  "%sは前月の制約を持たないF11の対象月として受理する",
  /**
   * F10専用の最小月をF11入力へ持ち込まない。
   */
  (month) => { // 検証や試験に使うコールバック
    expect(isEventPracticeBatchTargetMonth(month)).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数 / F11の対象月を厳密に検証する関数
  },
);

it.each([ // 表形式の試験を登録する関数
  undefined,
  null,
  [],
  ["2026-01"],
  202601,
  "",
  "0000-01",
  "2026-00",
  "2026-13",
  "2026-1",
  "10000-01",
  " 2026-01",
  "2026-01\n",
].map(row))( // 各要素を変換するメソッド / 配列やnullも1つの値として表形式テストへ渡す関数
  "不正な対象月%#はfallbackせず拒否する",
  /**
   * 型・桁数・末尾改行が安全な項目エラーとなることを確認する。
   */
  (targetMonth) => { // 検証や試験に使うコールバック
    expect(isEventPracticeBatchTargetMonth(targetMonth)).toBe(false); // 値の一致を検証するメソッド / 期待値を検証する関数 / F11の対象月を厳密に検証する関数
    failure(validateEventPracticeBatchPreviewInput({ // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      targetMonth,
    }), "targetMonth");
  },
);

it.each([ // 表形式の試験を登録する関数
  ["0001-01", "0001-01-01", "0001-01-31"],
  ["2000-02", "2000-02-29", "2000-02-29"],
  ["2028-02", "2028-02-01", "2028-02-29"],
  ["9999-12", "9999-12-31", "9999-12-31"],
])(
  "実在日の期間%s %s〜%sを受理する",
  /**
   * Gregorian閏年・単日・西暦端点をDateの年特例なしで検証する。
   */
  (targetMonth, periodStart, periodEnd) => { // 検証や試験に使うコールバック
    expect(validateEventPracticeBatchPreviewInput({ // 期待値を検証する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      targetMonth,
      periodStart,
      periodEnd,
    }).success).toBe(true); // 値の一致を検証するメソッド
  },
);

it.each([ // 表形式の試験を登録する関数
  ["2026-02", "2026-02-29", "2026-02-29"],
  ["1900-02", "1900-02-01", "1900-02-29"],
  ["2026-04", "2026-04-01", "2026-04-31"],
  ["2026-01", "2026-01-02", "2026-01-01"],
  ["2026-01", "2025-12-31", "2026-01-31"],
  ["2026-01", "2026-01-01", "2026-02-01"],
  ["2026-01", "2026-01-00", "2026-01-31"],
  ["2026-01", "2026-01-01", "2026-01-32"],
  ["2026-01", "2026-1-01", "2026-01-31"],
  ["2026-01", "2026-01-01\n", "2026-01-31"],
])(
  "不正日・逆転・対象月外の期間%#を拒否する",
  /**
   * 月跨ぎや32日間を、選択を減らす前に拒否する。
   */
  (targetMonth, periodStart, periodEnd) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchPreviewInput({ // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      targetMonth,
      periodStart,
      periodEnd,
    }));
  },
);

it("表記差を正規化し、元配列を変えず、検証済み値の再検証でも結果が変わらない", // 試験を登録する関数
  /**
   * 表記差を持つ入力を検証し、正規化の安定性と元配列の保持を確認する。
   */
  () => { // 検証や試験に使うコールバック
    const source = {
      ...input(), // 保存入力を作る関数
      weekdays: [5, 1, 1],
      title: " 練習 ",
      location: " 体育館 ",
      meetingTime: "",
      meetingLocation: "  ",
      targetRoles: ["MEMBER", "COACH", "MEMBER"],
      selectedDates: ["2026-01-30", "2026-01-02"],
      requestId: REQUEST.toUpperCase(), // 大文字へ変換するメソッド
      previewFingerprint: FINGERPRINT.toUpperCase(), // 大文字へ変換するメソッド
    };
    const before = structuredClone(source); // 値を複製する関数
    const result = validateEventPracticeBatchInput(source); // 保存入力を検証・正規化する関数
    expect(result.success).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数
    if (result.success) {
      expect(result.data).toEqual({ // 内容の一致を検証するメソッド / 期待値を検証する関数
        ...input(), // 保存入力を作る関数
        weekdays: [1, 5],
        location: "体育館",
        targetRoles: ["OWNER", "COACH", "MEMBER"],
        selectedDates: ["2026-01-02", "2026-01-30"],
      });
      expect(validateEventPracticeBatchInput(result.data)).toEqual(result); // 内容の一致を検証するメソッド / 期待値を検証する関数 / 保存入力を検証・正規化する関数
      expect(result.data.weekdays).not.toBe(source.weekdays); // 値の一致を検証するメソッド / 期待値を検証する関数
      expect(result.data.selectedDates).not.toBe(source.selectedDates); // 値の一致を検証するメソッド / 期待値を検証する関数
    }
    expect(source).toEqual(before); // 内容の一致を検証するメソッド / 期待値を検証する関数
  });

it.each([ // 表形式の試験を登録する関数
  [[], false],
  [[0, 1, 2, 3, 4, 5, 6], true],
  [[0, 1, 2, 3, 4, 5, 6, 0], false],
])(
  "曜日の入力数%#を1〜7に制限する",
  /**
   * 7曜日を受理し、0個・8個は拒否する。
   */
  (weekdays, accepted) => { // 検証や試験に使うコールバック
    expect(validateEventPracticeBatchPreviewInput({ // 期待値を検証する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      weekdays,
    }).success).toBe(accepted); // 値の一致を検証するメソッド
  },
);

it.each([[7], [-1], [1.5], [NaN], [Infinity], ["1"], [null], "1"].map(row))( // 表形式の試験を登録する関数 / 各要素を変換するメソッド / 配列やnullも1つの値として表形式テストへ渡す関数
  "直接入力の不正な曜日%#を拒否する",
  /**
   * 数字文字列の解釈はFormDataだけで行い、検証済み共通入力は数値に限定する。
   */
  (weekdays) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchPreviewInput({ // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      weekdays,
    }), "weekdays");
  },
);

it.each(["", "18:00", "17:59", "00:00", "24:00", "20:60", "20:00\n", " 20:00"])( // 表形式の試験を登録する関数
  "必須終了時刻%sが同日の開始より後でない場合を拒否する",
  /**
   * 翌日への自動送りや入力補正を行わないことを確認する。
   */
  (endTime) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchPreviewInput({ // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      endTime,
    }), "endTime");
  },
);

it.each(["", "24:00", "18:60", "18:00\n", "9:00"])( // 表形式の試験を登録する関数
  "不正な開始時刻%#を拒否する",
  /**
   * 時分の桁と範囲を検証する。
   */
  (startTime) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchPreviewInput({ // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      startTime,
    }), "startTime");
  },
);

it.each(["", null, "17:30", "18:30"])( // 表形式の試験を登録する関数
  "任意の当日集合%#は開始後も入力構造として許可する",
  /**
   * 警告表示・UTC・DSTの検証は後続で行い、構造検証で独自に禁止しない。
   */
  (meetingTime) => { // 検証や試験に使うコールバック
    expect(validateEventPracticeBatchPreviewInput({ // 期待値を検証する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      meetingTime,
    }).success).toBe(true); // 値の一致を検証するメソッド
  },
);

it.each(["24:00", "18:60", " 17:30", "17:30\n"])( // 表形式の試験を登録する関数
  "不正な集合時刻%#を拒否する",
  /**
   * 任意項目でも値があれば厳密な時刻形式を要求する。
   */
  (meetingTime) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchPreviewInput({ // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      meetingTime,
    }), "meetingTime");
  },
);

it.each([ // 表形式の試験を登録する関数
  ["title", "あ".repeat(120), true], // 文字列を繰り返すメソッド
  ["title", "あ".repeat(121), false], // 文字列を繰り返すメソッド
  ["title", "  ", false],
  ["location", "あ".repeat(200), true], // 文字列を繰り返すメソッド
  ["location", "あ".repeat(201), false], // 文字列を繰り返すメソッド
  ["meetingLocation", "あ".repeat(200), true], // 文字列を繰り返すメソッド
  ["meetingLocation", "あ".repeat(201), false], // 文字列を繰り返すメソッド
])(
  "%sの文字数境界%#を切り捨てず確認する",
  /**
   * 共通定数と既存の文字列長規約に合わせて入力境界を検証する。
   */
  (field, value, accepted) => { // 検証や試験に使うコールバック
    expect(validateEventPracticeBatchPreviewInput({ // 期待値を検証する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      [field]: value,
    }).success).toBe(accepted); // 値の一致を検証するメソッド
  },
);

it("公開対象の選択なしでもOWNERを常時含める", // 試験を登録する関数
  /**
   * 任意ロールが空でもOWNERが補われることを確認する。
   */
  () => { // 検証や試験に使うコールバック
    const value = common(); // 共通入力を作る関数
    const result = validateEventPracticeBatchPreviewInput({ // 共通入力を検証・正規化する関数
      ...value,
      targetRoles: [],
    });
    expect(result.success && result.data.targetRoles).toEqual(["OWNER"]); // 内容の一致を検証するメソッド / 期待値を検証する関数
  });

it.each([["ADMIN"], ["member"], [PRIVATE], [null], "MEMBER", Array(5).fill("MEMBER")].map(row))( // 表形式の試験を登録する関数 / 各要素を変換するメソッド / 配列を指定値で埋めるメソッド / 配列を生成する関数 / 配列やnullも1つの値として表形式テストへ渡す関数
  "不正role%#を正規化前に拒否する",
  /**
   * helperで不正roleを黙って消して受理しない。
   */
  (targetRoles) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchPreviewInput({ // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      targetRoles,
    }), "targetRoles");
  },
);

it.each([0, 1, 31, 32])( // 表形式の試験を登録する関数
  "%i件の選択を1〜31件に制限する",
  /**
   * 同月の全日を選べる一方、過大入力を拒否する。
   */
  (count) => { // 検証や試験に使うコールバック
    const selectedDates = Array.from({ length: count }, // 配列を生成する関数
      /**
       * 境界検証に使う選択日文字列を作る。
       */
      (_, index) => `2026-01-${String(index + 1).padStart(2, "0")}`, // 検証や試験に使うコールバック / 文字列の先頭を補うメソッド / 値を文字列へ変換する関数
    );
    expect(validateEventPracticeBatchInput({ // 期待値を検証する関数 / 保存入力を検証・正規化する関数
      ...input(), // 保存入力を作る関数
      selectedDates,
    }).success).toBe(count === 1 || count === 31); // 値の一致を検証するメソッド
  },
);

it.each([ // 表形式の試験を登録する関数
  ["2026-01-02", "2026-01-02"],
  ["2026-02-01"],
  ["2025-12-31"],
  ["2026-01-00"],
  ["2026-01-02\n"],
  ["550e8400-e29b-41d4-a716-446655440000"],
  [null],
  "2026-01-02",
].map(row))( // 各要素を変換するメソッド / 配列やnullも1つの値として表形式テストへ渡す関数
  "不正・重複・期間外の選択%#を拒否する",
  /**
   * 元イベントUUIDではなく実在する選択日を要求する。
   */
  (selectedDates) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchInput({ // 安全な検証失敗を確認する関数 / 保存入力を検証・正規化する関数
      ...input(), // 保存入力を作る関数
      selectedDates,
    }), "selectedDates");
  },
);

it("期間内でも選択曜日に一致するかは、この構造検証だけで保証しない", // 試験を登録する関数
  /**
   * 期間内の曜日不一致は後続の候補照合へ委ねることを確認する。
   */
  () => { // 検証や試験に使うコールバック
    expect(validateEventPracticeBatchInput({ // 期待値を検証する関数 / 保存入力を検証・正規化する関数
      ...input(), // 保存入力を作る関数
      weekdays: [1],
      selectedDates: ["2026-01-02"],
    }).success).toBe(true); // 値の一致を検証するメソッド
  });

it.each([ // 表形式の試験を登録する関数
  ["requestId", "550e8400-e29b-11d4-a716-446655440000"],
  ["requestId", REQUEST + "\n"],
  ["requestId", PRIVATE],
  ["previewFingerprint", "ab".repeat(31)], // 文字列を繰り返すメソッド
  ["previewFingerprint", "ab".repeat(33)], // 文字列を繰り返すメソッド
  ["previewFingerprint", "g".repeat(64)], // 文字列を繰り返すメソッド
  ["previewFingerprint", FINGERPRINT + "\n"],
])(
  "実行識別子%sの不正値%#を拒否する",
  /**
   * UUID v4・64桁16進文字列の構造だけを検証する。
   */
  (field, value) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchInput({ // 安全な検証失敗を確認する関数 / 保存入力を検証・正規化する関数
      ...input(), // 保存入力を作る関数
      [field]: value,
    }), field as EventPracticeBatchField); // 入力項目名型
  },
);

it.each([ // 表形式の試験を登録する関数
  "targetMonth",
  "periodStart",
  "periodEnd",
  "title",
  "startTime",
  "endTime",
  "location",
  "meetingTime",
  "meetingLocation",
  "requestId",
  "previewFingerprint",
])(
  "単一項目%sは同値の重複でも拒否する",
  /**
   * FormDataの先頭値・末尾値だけを使う解釈を防ぐ。
   */
  (field) => { // 検証や試験に使うコールバック
    const data = form(); // 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数
    if (!data.has(field)) { // 要素や項目の有無を調べるメソッド
      data.set(field, ""); // フォームの値を設定するメソッド
    }
    data.append(field, String(data.get(field))); // フォームへ値を追加するメソッド / 値を文字列へ変換する関数 / フォームの値を取得するメソッド
    failure(parseEventPracticeBatchFormData(data)); // 安全な検証失敗を確認する関数 / 保存用FormDataを検証する関数
  },
);

it.each([ // 表形式の試験を登録する関数
  "targetMonth",
  "periodStart",
  "periodEnd",
  "weekdays",
  "title",
  "startTime",
  "endTime",
  "selectedDates",
  "requestId",
  "previewFingerprint",
])(
  "必須項目%sの欠落を拒否する",
  /**
   * 保存に必要な共通入力と選択・識別子を検証する。
   */
  (field) => { // 検証や試験に使うコールバック
    const data = form(); // 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数
    data.delete(field); // フォームの項目を削除するメソッド
    failure(parseEventPracticeBatchFormData(data), field as EventPracticeBatchField); // 安全な検証失敗を確認する関数 / 保存用FormDataを検証する関数 / 入力項目名型
  },
);

it.each([ // 表形式の試験を登録する関数
  "targetMonth", "periodStart", "periodEnd", "weekdays", "title", "startTime", "endTime",
  "location", "meetingTime", "meetingLocation", "targetRoles", "selectedDates", "requestId",
  "previewFingerprint",
])(
  "%sへFileを混入できない",
  /**
   * ファイル名や内容を検証エラーへ返さない。
   */
  (field) => { // 検証や試験に使うコールバック
    const data = form(); // 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数
    data.set(field, new File([PRIVATE], "private.txt")); // フォームの値を設定するメソッド / ファイル値のコンストラクター
    failure(parseEventPracticeBatchFormData(data)); // 安全な検証失敗を確認する関数 / 保存用FormDataを検証する関数
  },
);

it.each([ // 表形式の試験を登録する関数
  "clubId", "membershipId", "userId", "genre", "status", "isAllDay", "content", "belongings",
  "notes", "startAt", "endAt", "meetingAt", "meetingDate", "returnTo", "createdByMembershipId",
  "updatedByMembershipId",
  "firstPublishedAt",
  "readRequiredAt",
  "shouldNotifyLine",
  "attachmentFiles",
])(
  "未許可field%sをobjectとFormDataの両方で拒否する",
  /**
   * 固定保存列・scope・外部処理の混入を許可しない。
   */
  (field) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchInput({ // 安全な検証失敗を確認する関数 / 保存入力を検証・正規化する関数
      ...input(), // 保存入力を作る関数
      [field]: PRIVATE,
    }));
    const data = form(); // 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数
    data.set(field, PRIVATE); // フォームの値を設定するメソッド
    failure(parseEventPracticeBatchFormData(data)); // 安全な検証失敗を確認する関数 / 保存用FormDataを検証する関数
  },
);

it("previewと保存のFormDataは各validatorと同じ正規化結果になる", // 試験を登録する関数
  /**
   * 共通入力と保存入力を各parserへ渡し、正規化結果を比較する。
   */
  () => { // 検証や試験に使うコールバック
    expect(parseEventPracticeBatchPreviewFormData(form(false))).toEqual({ // 内容の一致を検証するメソッド / 期待値を検証する関数 / preview用FormDataを検証する関数 / 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数
      success: true,
      data: common(), // 共通入力を作る関数
    });
    expect(parseEventPracticeBatchFormData(form())).toEqual({ // 内容の一致を検証するメソッド / 期待値を検証する関数 / 保存用FormDataを検証する関数 / 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数
      success: true,
      data: input(), // 保存入力を作る関数
    });
  });

it.each(["selectedDates", "requestId", "previewFingerprint"])( // 表形式の試験を登録する関数
  "previewに保存専用の%sを混入できない",
  /**
   * previewの入力境界を実行入力から分離する。
   */
  (field) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchPreviewInput({ // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
      ...common(), // 共通入力を作る関数
      [field]: PRIVATE,
    }));
    const data = form(false); // 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数
    data.set(field, PRIVATE); // フォームの値を設定するメソッド
    failure(parseEventPracticeBatchPreviewFormData(data)); // 安全な検証失敗を確認する関数 / preview用FormDataを検証する関数
  },
);

it.each(["1\n", " 1", "01", "1.0", "+1", "7", PRIVATE])( // 表形式の試験を登録する関数
  "FormDataの曜日%#を数字へ勝手に補正しない",
  /**
   * Numberだけで変換せず単一桁の0〜6を要求する。
   */
  (weekday) => { // 検証や試験に使うコールバック
    const data = form(false); // 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数
    data.set("weekdays", weekday); // フォームの値を設定するメソッド
    failure(parseEventPracticeBatchPreviewFormData(data), "weekdays"); // 安全な検証失敗を確認する関数 / preview用FormDataを検証する関数
  },
);

it.each([ // 表形式の試験を登録する関数
  ["weekdays", 7, 8, "1"],
  ["targetRoles", 4, 5, "MEMBER"],
  ["selectedDates", 31, 32, "2026-01-01"],
] as const)( // リテラル値を保持するconst型アサーション
  "%sの反復項目が上限を超えたら即座に拒否する",
  /**
   * 反復選択の上限を配列の正規化より前にも守る。
   */
  (field, limit, count, value) => { // 検証や試験に使うコールバック
    const data = form(); // 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数
    data.delete(field); // フォームの項目を削除するメソッド
    for (let index = 0;index < count;index += 1) {
      data.append(field, value); // フォームへ値を追加するメソッド
    }
    expect(count).toBe(limit + 1); // 値の一致を検証するメソッド / 期待値を検証する関数
    failure(parseEventPracticeBatchFormData(data), field); // 安全な検証失敗を確認する関数 / 保存用FormDataを検証する関数
  },
);

it("Nextの輸送項目を業務値にせず、任意項目は未設定へ揃える", // 試験を登録する関数
  /**
   * 輸送項目を除外し、空欄と任意ロール未指定の正規化を確認する。
   */
  () => { // 検証や試験に使うコールバック
    const data = form(false); // 単一・反復項目を、実際のブラウザーと同じFormDataへ写す関数
    data.set("$ACTION_ID_transport", PRIVATE); // フォームの値を設定するメソッド
    data.set("location", "  "); // フォームの値を設定するメソッド
    data.set("meetingTime", ""); // フォームの値を設定するメソッド
    data.delete("targetRoles"); // フォームの項目を削除するメソッド
    const result = parseEventPracticeBatchPreviewFormData(data); // preview用FormDataを検証する関数
    expect(result.success).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数
    if (result.success) {
      expect(result.data).toEqual({ // 内容の一致を検証するメソッド / 期待値を検証する関数
        ...common(), // 共通入力を作る関数
        targetRoles: ["OWNER"],
      });
      expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を検証する関数 / 値をJSON文字列へ変換する関数
    }
  });

it.each([ // 表形式の試験を登録する関数
  null,
  undefined,
  [],
  PRIVATE,
  new Date(0), // 日時値のコンストラクター
  Object.create({ inherited: true }), // prototypeを指定してオブジェクトを作る関数
].map(row))( // 各要素を変換するメソッド / 配列やnullも1つの値として表形式テストへ渡す関数
  "非plain入力%#から安全なエラーを返す",
  /**
   * 辞書以外を通常の業務入力として扱わない。
   */
  (value) => { // 検証や試験に使うコールバック
    failure(validateEventPracticeBatchPreviewInput(value)); // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
    failure(validateEventPracticeBatchInput(value)); // 安全な検証失敗を確認する関数 / 保存入力を検証・正規化する関数
  },
);

it("null prototypeの値は受理し、accessor・例外・Symbolを安全に拒否する", // 試験を登録する関数
  /**
   * 通常辞書の受理と特殊オブジェクトからの安全な失敗を確認する。
   */
  () => { // 検証や試験に使うコールバック
    expect( // 期待値を検証する関数
      validateEventPracticeBatchPreviewInput( // 共通入力を検証・正規化する関数
        Object.assign( // プロパティを写す関数
          Object.create(null), // prototypeを指定してオブジェクトを作る関数
          common(), // 共通入力を作る関数
        ),
      ).success,
    ).toBe(true); // 値の一致を検証するメソッド
    let getterCalled = false;
    const accessor = Object.defineProperty({ ...common() }, "title", { // プロパティを定義する関数 / 共通入力を作る関数
      enumerable: true,
      /**
       * 検証中に実行されてはいけないgetterを作る。
       */
      get() { // 実行時に例外を投げる試験用getter
        getterCalled = true;
        throw new Error(PRIVATE); // 例外を生成するコンストラクター
      },
    });
    failure(validateEventPracticeBatchPreviewInput(accessor)); // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
    expect(getterCalled).toBe(false); // 期待値を検証する関数 / 値の一致を検証するメソッド
    const throwing = new Proxy({}, { // 操作を置き換えるコンストラクター
      /**
       * prototype検査中の想定外例外を再現する。
       */
      getPrototypeOf() { // prototype検査で例外を投げる試験用メソッド
        throw new Error(PRIVATE); // 例外を生成するコンストラクター
      },
    });
    failure(validateEventPracticeBatchPreviewInput(throwing)); // 安全な検証失敗を確認する関数 / 共通入力を検証・正規化する関数
    failure(validateEventPracticeBatchInput({ // 安全な検証失敗を確認する関数 / 保存入力を検証・正規化する関数
      ...input(), // 保存入力を作る関数
      [Symbol(PRIVATE)]: PRIVATE, // 固有のキーを生成する関数
    }));
    failure(parseEventPracticeBatchFormData({} as FormData)); // 安全な検証失敗を確認する関数 / 保存用FormDataを検証する関数 / 送信フォームの型・コンストラクター
  });

it("結果契約は0件preview・保存済み・結果不明・再読込を区別する", // 試験を登録する関数
  /**
   * 限定結果の値と、成功時だけ必須になるデータの型を確認する。
   */
  () => { // 検証や試験に使うコールバック
    const preview: EventPracticeBatchPreview = { // preview結果型
      outcome: "READY",
      input: common(), // 共通入力を作る関数
      timezone: "Asia/Tokyo",
      fingerprint: FINGERPRINT,
      items: [],
      candidateCount: 0,
      selectableCount: 0,
    };
    const unknown: EventPracticeBatchResult = { // 一括保存結果型
      outcome: "RESULT_UNKNOWN",
    };
    const saved: EventPracticeBatchActionState = { // 保存Actionの入力・状態型
      status: "success",
      outcome: "ALREADY_COMPLETED",
      values: input(), // 保存入力を作る関数
      fieldErrors: {},
      formError: null,
      requestId: REQUEST,
      data: {
        targetMonth: "2026-01",
        createdCount: 1,
        needsReload: true,
      },
    };
    expect(preview.items).toHaveLength(0); // 件数を検証するメソッド / 期待値を検証する関数
    expect(unknown).not.toHaveProperty("receipt"); // プロパティの存在を検証するメソッド / 期待値を検証する関数
    expect(saved.data.needsReload).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数
    expect(EVENT_PRACTICE_BATCH_MAX_COUNT).toBe(31); // 値の一致を検証するメソッド / 期待値を検証する関数
    expectTypeOf<Extract<EventPracticeBatchActionState, { status: "success" }>["data"]>() // 型の期待値を検証する関数 / 条件に合う型を取り出す型 / 保存Actionの入力・状態型 / 値を限定するリテラル型
      .toEqualTypeOf<EventPracticeBatchActionData>(); // 型の一致を検証するメソッド / 保存後の成功データ型
    expectTypeOf<Extract<EventPracticeBatchPreviewActionState, { status: "success" }>["data"]>() // 型の期待値を検証する関数 / 条件に合う型を取り出す型 / preview Actionの入力・状態型 / 値を限定するリテラル型
      .toEqualTypeOf<EventPracticeBatchPreviewReady>(); // 型の一致を検証するメソッド / preview成功データ型
  });
