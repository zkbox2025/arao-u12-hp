// domain/club/event/event-month-copy-form.ts
// 前月イベント複製のフォーム入力値のバリデーションファイル

import { z } from "zod";

import type {
  FieldErrors, // 入力項目ごとのエラーメッセージを保持する型
} from "@/domain/shared/action-state";
import {
  isRequestId, // UUID v4形式のrequestIdを検証する関数
} from "@/domain/shared/request-id";
import {
  EVENT_MONTH_COPY_MAX_COUNT, // 前月予定イベントの複製での最大コピー数（100）
  type EventMonthCopyField, // 複製入力の項目名の型："targetMonth" | "selectedEventIds" | "requestId" | "previewFingerprint"
  type EventMonthCopyInput, //検証・正規化済みの前月予定イベントの複製の入力型
  type EventMonthCopyValidation, //入力値検証の結果
} from "./event-month-copy-types";

const uuidSchema = z.uuid(); // UUID識別子を検証するスキーマ
const inputFields = new Set<string>([ // 入力項目名を判定する定義
  "targetMonth",
  "selectedEventIds",
  "requestId",
  "previewFingerprint",
]);
const INVALID_FORM_MESSAGE = "複製入力を確認してください。";
const INVALID_SELECTION_MESSAGE = "複製対象を1〜100件、重複なしで指定してください。";

/**
 *  複製対象月を検証する関数
 */
export function isEventMonthCopyTargetMonth( // 複製対象月の厳密な構造を検証する関数
  value: unknown, // 検証前の不明値型
): value is string { // 検証成功時に文字列へ絞り込む
  return (
    typeof value === "string" &&
    value.length === 7 &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && // 4桁年と01〜12月の形式を検証するメソッド
    !value.startsWith("0000-") && // 西暦0年の対象月を拒否するメソッド
    value !== "0001-01"//値が "0001-01" という特定の文字列ではないこと
  );
}

/**
 * イベントIDの検証・正規化関数
 * 上限内（100以内）でUUID配列を検証し、小文字・昇順に正規化する。重複は拒否する。
 */
function normalizeSelectedEventIds( // 複製対象IDの検証と正規化を行う関数
  value: unknown, // 検証前の不明値型
): string[] | null { // 正規化済みIDの文字列配列または検証失敗の型
  if (
    !Array.isArray(value) || // 配列でない、もしくは
    value.length === 0 ||//長さが０、もしくは
    value.length > EVENT_MONTH_COPY_MAX_COUNT//前月予定イベントの複製での最大コピー数（100）より長い
  ) {
    return null;
  }
  const normalized: string[] = []; // 検証後のIDを保持する文字列配列型
  const seen = new Set<string>(); // ID重複を検出する集合の生成 / 文字列型
  for (const entry of value as unknown[]) { // 入力要素を不明値の配列型として扱う型アサーション
    if (
      typeof entry !== "string" ||
      !uuidSchema.safeParse(entry).success // UUIDスキーマによる安全な構造検証メソッド
    ) {
      return null;
    }
    const identifier = entry.toLowerCase(); // UUIDの表記を小文字へ揃えるメソッド
    if (seen.has(identifier)) { //もし、seen という記録用シートの中に、この identifier（IDや識別子）がすでに登録されているかを確認する
      return null;
    }
    seen.add(identifier); // 新しく書き加える
    normalized.push(identifier); // 検証済みIDを文字列配列型へ追加するメソッド
  }
  return normalized.sort(); // UUID文字列を昇順に並べる
}

/**
 * 前月複製イベントの入力値を検証する関数
 * 入力オブジェクトの許可項目だけを検証し、安全な項目エラーか正規化済み値を返す。
 */
export function validateEventMonthCopyInput( // 複製入力の構造検証と正規化を行う関数
  input: unknown, // 外部から受け取る不明値型
): EventMonthCopyValidation<EventMonthCopyInput> { //入力値検証の結果に入力型を入れる
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) 
  ) {
    return {
      success: false,
      fieldErrors: {},
      formError: INVALID_FORM_MESSAGE,
    };
  }
  const prototype = Object.getPrototypeOf(input); // 入力値のprototype（作成された設計図）を取得するメソッド
  if (
    prototype !== Object.prototype && // 標準Objectコンストラクターのprototypeとの比較
    prototype !== null
  ) {
    return {
      success: false,
      fieldErrors: {},
      formError: INVALID_FORM_MESSAGE,
    };
  }
  const record = input as Record<string, unknown>; // 文字列キーと不明値の辞書型への型アサーション
  if (Object.keys(record).some( // 自身の項目名を取り出すメソッド / 未許可項目の有無を判定するメソッド
    /**
     * 許可項目に含まれない入力キーかを調べる。
     */
    (field) => !inputFields.has(field), //正しい入力項目名に含まれていない場合、
  )) {
    return {
      success: false,
      fieldErrors: {},
      formError: INVALID_FORM_MESSAGE,
    };
  }
  const targetMonth = isEventMonthCopyTargetMonth(record.targetMonth) //複製対象月を検証する関数
    ? record.targetMonth
    : null;
  const selectedEventIds = normalizeSelectedEventIds(record.selectedEventIds); //イベントIDの検証・正規化関数
  const requestId = isRequestId(record.requestId) // UUID v4のrequestIdを検証する関数
    ? record.requestId.toLowerCase() // UUID表記を小文字に揃えるメソッド
    : null;

    //「previewFingerprint」は、画面を開いてから、実際にコピーボタンを押すまでの間に、他の人が元のイベントを書き換えていないか（データの衝突）」をチェックするために使われる
  const previewFingerprint = (
    typeof record.previewFingerprint === "string" &&
    record.previewFingerprint.length === 64 &&
    /^[0-9a-f]{64}$/i.test(record.previewFingerprint) // SHA-256識別値の16進文字列形式を検証するメソッド
  ) ? record.previewFingerprint.toLowerCase() : null; // 識別値の16進表記を小文字に揃えるメソッド
  const fieldErrors: FieldErrors<EventMonthCopyField> = {}; // 複製項目名をキーにするエラー辞書型
  if (targetMonth === null) {
    fieldErrors.targetMonth = ["前月も指定可能な対象月をYYYY-MM形式で指定してください。"];
  }
  if (selectedEventIds === null) {
    fieldErrors.selectedEventIds = [INVALID_SELECTION_MESSAGE];
  }
  if (requestId === null) {
    fieldErrors.requestId = ["操作の識別値が不正です。再読込してください。"];
  }
  if (previewFingerprint === null) {
    fieldErrors.previewFingerprint = ["複製予定の識別値が不正です。再読込してください。"];
  }
  if (
    targetMonth === null ||
    selectedEventIds === null ||
    requestId === null ||
    previewFingerprint === null
  ) {
    return {
      success: false,
      fieldErrors,
      formError: null,
    };
  }
  return {
    success: true,
    data: {
      targetMonth,
      selectedEventIds,
      requestId,
      previewFingerprint,
    },
  };
}

/**
 * フォームデータから項目と値が正しいか検証して、入力検証関数に渡す関数
 * FormDataの単一項目・反復選択・件数を確認して、共通の入力検証へ渡す。
 */
export function parseEventMonthCopyFormData( // フォーム送信値を複製入力へ検証する関数
  formData: FormData, // ブラウザー送信値を保持するFormData型
): EventMonthCopyValidation<EventMonthCopyInput> { //入力値検証の結果に入力型を入れる
  const selectedEventIds: string[] = []; // 上限内の選択IDを保持する文字列配列型
  const record: Record<string, unknown> = { // 単一項目と選択IDを保持する不明値の辞書型
    selectedEventIds,
  };
  if (!(formData instanceof FormData)) { // 実際のFormDataであることを確認する型判定
    return {
      success: false,
      fieldErrors: {},
      formError: INVALID_FORM_MESSAGE,
    };
  }
  for (const [field, value] of formData.entries()) { // 送信された各項目を順番に取得するメソッド
    if (field.startsWith("$ACTION_")) { // Nextの輸送用項目を判定するメソッド
      continue;
    }
    if (
      !inputFields.has(field) || //正しい入力項目名に含まれていない場合、もしくは、
      typeof value !== "string" ||//値が文字列ではない場合、もしくは
      (
        field !== "selectedEventIds" &&//項目にselectedEventIdsがない場合、かつ
        Object.hasOwn(record, field) // オブジェクト（record）のなかに項目が存在する場合
      )
    ) {
      return {
        success: false,
        fieldErrors: {},
        formError: INVALID_FORM_MESSAGE,
      };
    }
    if (field === "selectedEventIds") {
      if (selectedEventIds.length >= EVENT_MONTH_COPY_MAX_COUNT) {
        return {
          success: false,
          fieldErrors: {
            selectedEventIds: [INVALID_SELECTION_MESSAGE],
          },
          formError: null,
        };
      }
      selectedEventIds.push(value); // コピーするイベントIDをselectedEventIdsという配列に入れていく
    } else {
      record[field] = value;//recordに項目と値をセットで書き込む
    }
  }
  return validateEventMonthCopyInput(record); //前月複製イベントの入力値を検証する関数
}
