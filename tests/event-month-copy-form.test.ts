// tests/event-month-copy-form.test.ts
// 実Auth・DB・Next実行環境を使わず、複製入力の境界と限定契約を検証する。

import {
  expect,
  it,
} from "vitest";

import {
  isEventMonthCopyTargetMonth, // 前月も表現可能な単一対象月を検証する関数
  parseEventMonthCopyFormData, // 反復選択と単一項目を確認して複製入力を検証する関数
  validateEventMonthCopyInput, // 複製入力の構造検証と正規化を行う関数
} from "@/domain/club/event/event-month-copy-form";
import type {
  EventMonthCopyActionState, // 複製入力・エラー・保存済み結果をまとめるAction state型
  EventMonthCopyInput, // 構造検証・正規化済みの複製入力型
  EventMonthCopyPreview, // preview成功と超過・拒否・取得失敗を分ける結果型
  EventMonthCopyResult, // 保存済み・再送・変更・衝突・失敗を分ける結果型
} from "@/domain/club/event/event-month-copy-types";
import {
  createInitialActionState, // 入力値と新しいrequestIdを持つ初期stateを作る関数
} from "@/domain/shared/action-state";

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const SOURCE_A = "550e8400-e29b-41d4-a716-446655440001";
const SOURCE_B = "550e8400-e29b-41d4-a716-446655440002";
const FINGERPRINT = "a".repeat(64); // 架空の64桁識別値を作る文字列反復メソッド

/**
 * テストごとに独立した正常入力を作る。
 */
function validInput(): EventMonthCopyInput { // 正常入力を生成する関数 / 構造検証済み複製入力型
  return {
    targetMonth: "2026-02",
    selectedEventIds: [SOURCE_A],
    requestId: REQUEST_ID,
    previewFingerprint: FINGERPRINT,
  };
}

/**
 * 正常入力から、実ブラウザーと同じ反復選択項目のFormDataを作る。
 */
function validForm(): FormData { // 正常な送信値を作る関数 / ブラウザー送信値を保持する型
  const input = validInput(); // 正常な複製入力を生成する関数
  const form = new FormData(); // ブラウザー送信値のコンストラクター
  form.set("targetMonth", input.targetMonth); // 単一の対象月を設定するメソッド
  form.set("requestId", input.requestId); // 単一の操作IDを設定するメソッド
  form.set("previewFingerprint", input.previewFingerprint); // 単一のpreview識別値を設定するメソッド
  for (const id of input.selectedEventIds) {
    form.append("selectedEventIds", id); // 選択IDを反復項目として追加するメソッド
  }
  return form;
}

/**
 * 大量選択の境界試験に使う、互いに異なるUUIDを生成する。
 */
function eventIds(count: number): string[] { // 指定件数のUUIDを作る関数 / 件数の数値型 / 文字列配列型
  const identifiers: string[] = []; // 異なるIDを保持する文字列配列型
  for (let index = 0; index < count; index += 1) {
    const firstGroup = index.toString(16).padStart(8, "0"); // 数値の16進変換メソッド / 8桁へ補完するメソッド
    identifiers.push(`${firstGroup}-e29b-41d4-a716-446655440000`); // 異なるUUIDを追加するメソッド
  }
  return identifiers;
}

it.each(["0001-02", "2026-01", "2028-02", "9999-12"])( // 表現可能な月を表形式で検証するテスト関数
  "対象月%sは前月とともに表現できる",
  /**
   * 有効な単一対象月が現在月等へ変換されず受理されることを確認する。
   */
  (month) => { // 有効な対象月を受け取るテストコールバック
    expect(isEventMonthCopyTargetMonth(month)).toBe(true); // 期待値を作る関数 / 月検証関数 / 真偽値の検証メソッド
  },
);

it.each([ // 不正な月と非文字列を表形式で検証するテスト関数
  undefined,
  null,
  202602,
  [],
  ["2026-02"],
  {},
  "",
  "0000-02",
  "0001-01",
  "2026-00",
  "2026-13",
  "2026-2",
  "2026-02-01",
  "10000-02",
  " 2026-02",
  "2026-02\n",
])(
  "不正な月のケース%#を現在月へfallbackせず拒否する",
  /**
   * 月の構造不正が固定の項目エラーになり、データを返さないことを確認する。
   */
  (targetMonth) => { // 不正な対象月を受け取るテストコールバック
    const result = validateEventMonthCopyInput({ // 複製入力の構造検証を行う関数
      ...validInput(), // 独立した正常入力を作る関数
      targetMonth,
    });
    expect(result.success).toBe(false); // 期待値を作る関数 / 検証失敗を確認するメソッド
    if (!result.success) {
      expect(result.fieldErrors.targetMonth).toBeDefined(); // 期待値を作る関数 / 月の項目エラーを確認するメソッド
      expect(result).not.toHaveProperty("data"); // 期待値を作る関数 / 未検証データの非返却を確認するメソッド
    }
  },
);

it("UUIDとfingerprintの大小文字・選択順を正規化し、元の入力を変更しない", // テストケースを登録する関数
  /**
   * 同じ操作の表記揺れを揃え、並べ替えによって呼出し元の配列を変更しないことを確認する。
   */
  () => { // 正規化と非破壊性を検証するコールバック
    const input = {
      ...validInput(), // 正常入力を作る関数
      selectedEventIds: [SOURCE_B.toUpperCase(), SOURCE_A], // UUIDを大文字に変換するメソッド
      requestId: REQUEST_ID.toUpperCase(), // 操作IDを大文字に変換するメソッド
      previewFingerprint: FINGERPRINT.toUpperCase(), // 識別値を大文字に変換するメソッド
    };
    expect(validateEventMonthCopyInput(input)).toEqual({ // 期待値を作る関数 / 入力検証関数 / 構造一致の検証メソッド
      success: true,
      data: {
        ...validInput(), // 正常入力を作る関数
        selectedEventIds: [SOURCE_A, SOURCE_B],
      },
    });
    expect(input.selectedEventIds[0]).toBe(SOURCE_B.toUpperCase()); // 期待値を作る関数 / 元の順序の検証 / 大文字変換メソッド
  },
);

it.each([0, 1, 100, 101, 10000])( // 選択件数の境界を表形式で検証するテスト関数
  "%i件の選択を1〜100件に制限する",
  /**
   * 上限前後と大きな配列を検証し、過大入力を受理しないことを確認する。
   */
  (count) => { // 選択件数を受け取るテストコールバック
    const result = validateEventMonthCopyInput({ // 入力検証関数
      ...validInput(), // 正常入力を作る関数
      selectedEventIds: eventIds(count), // 指定件数の異なるUUIDを作る関数
    });
    expect(result.success).toBe(count >= 1 && count <= 100); // 期待値を作る関数 / 件数境界を検証するメソッド
  },
);

it.each([ // 不正な選択値を表形式で検証するテスト関数
  undefined,
  null,
  SOURCE_A,
  ["invalid"],
  [null],
  [123],
  [SOURCE_A, SOURCE_A],
  [SOURCE_A, SOURCE_A.toUpperCase()], // 同一UUIDの表記揺れを作るメソッド
])(
  "不正または重複した選択のケース%#を拒否する",
  /**
   * 配列外入力・不正UUID・正規化後の重複を拒否する。
   */
  (selectedEventIds) => { // 不正選択を受け取るテストコールバック
    expect(validateEventMonthCopyInput({ // 期待値を作る関数 / 入力検証関数
      ...validInput(), // 正常入力を作る関数
      selectedEventIds,
    }).success).toBe(false); // 検証失敗を確認するメソッド
  },
);

it("イベントIDのUUID形式と、requestIdのUUID v4制約を区別する", // テストケースを登録する関数
  /**
   * 通常のUUIDイベントIDを許容しても、操作IDの版を緩めないことを確認する。
   */
  () => { // UUIDの用途別制約を検証するコールバック
    const uuidV1 = "550e8400-e29b-11d4-a716-446655440000";
    expect(validateEventMonthCopyInput({ // 期待値を作る関数 / 入力検証関数
      ...validInput(), // 正常入力を作る関数
      selectedEventIds: [uuidV1],
    }).success).toBe(true); // イベントIDの許容を確認するメソッド
    expect(validateEventMonthCopyInput({ // 期待値を作る関数 / 入力検証関数
      ...validInput(), // 正常入力を作る関数
      requestId: uuidV1,
    }).success).toBe(false); // 操作IDの拒否を確認するメソッド
  },
);

it.each([undefined, null, "", "x", "a".repeat(63), "g".repeat(64), "a".repeat(65)])( // 識別値の境界試験を登録する関数 / 架空文字列の反復メソッド
  "不正なpreview識別値のケース%#を拒否する",
  /**
   * SHA-256形式に合わない識別値を拒否する。識別値の真正性はこの試験の対象外。
   */
  (previewFingerprint) => { // 不正なpreview識別値を受け取るコールバック
    expect(validateEventMonthCopyInput({ // 期待値を作る関数 / 入力検証関数
      ...validInput(), // 正常入力を作る関数
      previewFingerprint,
    }).success).toBe(false); // 検証失敗を確認するメソッド
  },
);

it.each([undefined, null, "bad", REQUEST_ID + "\n", [REQUEST_ID]])( // 不正な操作IDを表形式で検証する関数
  "不正なrequestIdのケース%#を拒否する",
  /**
   * 単一UUID v4以外の操作IDを拒否する。
   */
  (requestId) => { // 不正な操作IDを受け取るコールバック
    expect(validateEventMonthCopyInput({ // 期待値を作る関数 / 入力検証関数
      ...validInput(), // 正常入力を作る関数
      requestId,
    }).success).toBe(false); // 検証失敗を確認するメソッド
  },
);

it.each(["targetMonth", "requestId", "previewFingerprint"])( // 単一項目の重複を表形式で検証する関数
  "FormDataの%s複数指定を、値が同じでも拒否する",
  /**
   * 同名の単一項目について先勝ち・後勝ちの解釈をしないことを確認する。
   */
  (field) => { // 単一項目名を受け取るテストコールバック
    const form = validForm(); // 正常なFormDataを作る関数
    form.append(field, String(form.get(field))); // 項目追加メソッド / 文字列化関数 / 先頭値の取得メソッド
    expect(parseEventMonthCopyFormData(form).success).toBe(false); // 期待値を作る関数 / FormData検証関数 / 失敗の検証メソッド
  },
);

it.each(["targetMonth", "requestId", "previewFingerprint", "selectedEventIds"])( // 各項目の欠落を表形式で検証する関数
  "必須項目%sの欠落を拒否する",
  /**
   * FormDataで必須項目が欠けた場合に受理しないことを確認する。
   */
  (field) => { // 欠落させる項目を受け取るコールバック
    const form = validForm(); // 正常なFormDataを作る関数
    form.delete(field); // 対象項目を削除するメソッド
    expect(parseEventMonthCopyFormData(form).success).toBe(false); // 期待値を作る関数 / FormData検証関数 / 失敗の検証メソッド
  },
);

it.each(["targetMonth", "requestId", "previewFingerprint", "selectedEventIds"])( // 各項目のFile値を表形式で検証する関数
  "項目%sのFile値を拒否する",
  /**
   * 文字列が必要な項目をFileとして送信できないことを確認する。
   */
  (field) => { // Fileへ置き換える項目を受け取るコールバック
    const form = validForm(); // 正常なFormDataを作る関数
    form.set(field, new File(["fake"], "fixture.txt")); // 項目設定メソッド / 架空ファイルのコンストラクター
    expect(parseEventMonthCopyFormData(form).success).toBe(false); // 期待値を作る関数 / FormData検証関数 / 失敗の検証メソッド
  },
);

it.each([100, 101])( // FormData経路の件数境界を表形式で検証する関数
  "FormDataの反復選択%i件でも同じ上限を守る",
  /**
   * 反復項目を受け付けつつ、上限を超えた送信を拒否する。
   */
  (count) => { // 反復選択数を受け取るコールバック
    const form = validForm(); // 正常なFormDataを作る関数
    form.delete("selectedEventIds"); // 既存の選択IDを削除するメソッド
    for (const id of eventIds(count)) { // 指定件数の異なるUUIDを作る関数
      form.append("selectedEventIds", id); // 反復項目として選択IDを追加するメソッド
    }
    expect(parseEventMonthCopyFormData(form).success).toBe(count === 100); // 期待値を作る関数 / FormData検証関数 / 件数の検証メソッド
  },
);

it.each(["clubId", "membershipId", "status", "content", "startAt", "createdByMembershipId"])( // 信頼禁止項目を表形式で検証する関数
  "追加された信頼禁止項目%sを両入力経路で拒否し、原文を返さない",
  /**
   * 改変された保存列を採用せず、安全な固定エラーのみを返すことを確認する。
   */
  (field) => { // 信頼してはいけない項目名を受け取るコールバック
    const privateValue = "fixture-private-value";
    const objectResult = validateEventMonthCopyInput({ // オブジェクト入力の検証関数
      ...validInput(), // 正常入力を作る関数
      [field]: privateValue,
    });
    const form = validForm(); // 正常なFormDataを作る関数
    form.set(field, privateValue); // 信頼禁止項目を追加するメソッド
    const formResult = parseEventMonthCopyFormData(form); // FormData入力の検証関数
    expect(objectResult.success).toBe(false); // 期待値を作る関数 / 拒否の検証メソッド
    expect(formResult.success).toBe(false); // 期待値を作る関数 / 拒否の検証メソッド
    expect(JSON.stringify([objectResult, formResult])).not.toContain(privateValue); // 期待値を作る関数 / JSON文字列化メソッド / 原文の非露出の検証メソッド
  },
);

it("Nextの輸送用項目を業務入力へ含めず、正常なFormDataだけを検証する", // テストケースを登録する関数
  /**
   * Nextの追加項目を無視しても、成功データの項目が増えないことを確認する。
   */
  () => { // 輸送用項目と業務入力の分離を確認するコールバック
    const form = validForm(); // 正常なFormDataを作る関数
    form.set("$ACTION_ID_fixture", "transport-only"); // 架空のNext輸送用項目を追加するメソッド
    expect(parseEventMonthCopyFormData(form)).toEqual({ // 期待値を作る関数 / FormData検証関数 / 構造一致の検証メソッド
      success: true,
      data: validInput(), // 正常な複製入力を作る関数
    });
  },
);

it.each([undefined, null, [], "input", 1, new Date(0), new Map()])( // 入力オブジェクトの境界試験を登録する関数 / 日時コンストラクター / Mapコンストラクター
  "入力オブジェクトでないケース%#を拒否する",
  /**
   * plain object以外の入力を例外原文なしに拒否する。
   */
  (value) => { // オブジェクト以外の入力を受け取るコールバック
    expect(validateEventMonthCopyInput(value).success).toBe(false); // 期待値を作る関数 / 入力検証関数 / 失敗の検証メソッド
  },
);

it("空のpreview・既存結果・保存済み再読込を、共通stateで表現できる", // テストケースを登録する関数
  /**
   * 本文やDBモデルをClient結果に要求せず、成功後の再読込を表現できることを確認する。
   */
  () => { // 型契約と共通stateの接続を確認するコールバック
    const preview: EventMonthCopyPreview = { // 限定preview結果型
      outcome: "READY",
      targetMonth: "2026-02",
      sourceMonth: "2026-01",
      timezone: "Asia/Tokyo",
      fingerprint: FINGERPRINT,
      items: [],
    };
    const result: EventMonthCopyResult = { // 保存処理の判別結果型
      outcome: "ALREADY_COMPLETED",
      receipt: {
        targetMonth: "2026-02",
        createdCount: 1,
      },
    };
    const state: EventMonthCopyActionState = { // 複製のAction state型
      ...createInitialActionState(validInput()), // 入力値とrequestIdを持つ初期stateを作る関数 / 正常入力を作る関数
      status: "success",
      data: {
        ...result.receipt,
        needsReload: true,
      },
    };
    expect(preview.items).toHaveLength(0); // 期待値を作る関数 / 候補0件の表現を確認するメソッド
    expect(state.data).toEqual({ // 期待値を作る関数 / 保存済み結果と再読込案内の構造検証メソッド
      targetMonth: "2026-02",
      createdCount: 1,
      needsReload: true,
    });
  },
);
