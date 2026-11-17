// domain/club/event/event-practice-batch-form.ts
// 定期練習生成のプレビュー準備段階の入力値及び、保存段階の入力値を検証する関数

import { z } from "zod";

import {
  buildContentTargetRoles, //公開対象を正規化する。OWNERは必ず含め、不正な値と重複を除去する。
} from "@/domain/club/content/content-policy";
import {
  EVENT_LOCATION_MAX_LENGTH, // イベント開催場所の最大文字数（200）
  EVENT_TITLE_MAX_LENGTH, // イベントタイトルの最大文字数（120）
} from "@/domain/club/event/event-form";
import type {
  FieldErrors, // 項目ごとの安全なエラーメッセージを保持する型
} from "@/domain/shared/action-state";
import {
  isRequestId, // UUID v4形式の操作IDかを検証する関数。
} from "@/domain/shared/request-id";
import type {
  ClubMemberRole, // Prisma由来のクラブ所属ロール型（"OWNER" | "COACH" | "OFFICER" | "MEMBER"）
} from "@/types/prisma";
import {
  EVENT_PRACTICE_BATCH_MAX_COUNT, // 定期練習生成の最大件数31件
  type EventPracticeBatchCommonInput, //検証・正規化した定期練習の共通入力値の型。
  type EventPracticeBatchField, // 定期練習作成の項目の型
  type EventPracticeBatchInput, // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
  type EventPracticeBatchValidation, //入力値検証後の結果の型
  type EventPracticeBatchWeekday, // クラブ現地の曜日。日曜を0、土曜を6とする。
} from "./event-practice-batch-types";

const INVALID_FORM = "定期練習の入力を確認してください。";
/** 
 * プレビュー準備時も保存時も使う共通項目
 */
const COMMON_FIELDS = new Set([ 
  "targetMonth",
  "periodStart",
  "periodEnd",
  "weekdays",
  "title",
  "startTime",
  "endTime",
  "location",
  "meetingTime",
  "meetingLocation",
  "targetRoles",
]);

/** 
 * 保存段階で使用する項目
 */
const EXECUTION_FIELDS = new Set([ 
  ...COMMON_FIELDS,
  "selectedDates",
  "requestId",
  "previewFingerprint",
]);


/** 
 * 定期練習作成の項目の型をキー、文字列を値とした項目エラーメッセージ
 */
const FIELD_MESSAGES: Record<EventPracticeBatchField, string> = { 
  targetMonth: "対象月を西暦1〜9999年のYYYY-MM形式で指定してください。",
  periodStart: "対象月内の実在する開始日を指定してください。",
  periodEnd: "対象月内で開始日以降の終了日を指定してください。",
  weekdays: "曜日を日曜0〜土曜6で1〜7個指定してください。",
  title: `タイトルを1〜${EVENT_TITLE_MAX_LENGTH}文字で入力してください。`,
  startTime: "開始時刻をHH:mm形式で入力してください。",
  endTime: "同日の開始時刻より後の終了時刻をHH:mm形式で入力してください。",
  location: `場所は${EVENT_LOCATION_MAX_LENGTH}文字以内で入力してください。`,
  meetingTime: "集合時刻はHH:mm形式で入力するか、未設定にしてください。",
  meetingLocation: `集合場所は${EVENT_LOCATION_MAX_LENGTH}文字以内で入力してください。`,
  targetRoles: "公開対象に正しいクラブ所属ロールを指定してください。",
  selectedDates: "期間内の実在する日付を1〜31件、重複なしで選択してください。",
  requestId: "操作の識別値が不正です。再previewしてください。",
  previewFingerprint: "生成予定の識別値が不正です。再previewしてください。",
};

/**
 * 定期練習生成の対象月を検証する関数
 */
export function isEventPracticeBatchTargetMonth( 
  value: unknown, // 未検証の値を表す型
): value is string { // 文字列型への絞り込み
  return (
    typeof value === "string" &&
    value.length === 7 &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && // 正規表現との一致を検証するメソッド
    !value.startsWith("0000-") // 0000という不正な日付から始まっていない
  );
}

/**
 * YYYY-MM-DD（年-月-日）という正しい形式の日付になっているかを検証する関数
 */
function isDateOnly( // 西暦1〜9999年の実在日を検証する関数
  value: string, // 文字列型
): boolean { // 真偽値型
  if (
    value.length !== 10 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) // 正規表現との一致を検証するメソッド
  ) {
    return false;
  }
  const year = Number(value.slice(0, 4)); // 値を数値へ変換する関数 
  const month = Number(value.slice(5, 7)); // 値を数値へ変換する関数 
  const day = Number(value.slice(8, 10)); // 値を数値へ変換する関数 
  //閏年かを検証する
  const leap = (
    year % 4 === 0 &&
    (
      year % 100 !== 0 ||
      year % 400 === 0
    )
  );

  /**
 * 年月日を月末が何日かを出して正規化する
 */
  const lastDay = month === 2
    ? (leap ? 29 : 28) //2月なら閏年なら29日
    : [4, 6, 9, 11].includes(month) // 4,6,9,11月なら30日
      ? 30
      : 31;
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= lastDay
  );
}

/**
 * 文字列を小文字へ揃える
 */
function lowercase( // 識別子を小文字へ揃える関数
  value: string, // 文字列型
): string { // 文字列型
  return value.toLowerCase(); // 小文字へ変換するメソッド
}

/**
 * 任意文字列を空白除去した結果、空欄の場合はnullに揃える。
 */
function optionalValue( // 任意文字列と空欄を正規化する関数
  value: string | null, // 文字列型 / 未設定を表すnull型
): string | null { // 文字列型 / 未設定を表すnull型
  return value === null ? null : value.trim() || null; // 前後の空白を除くメソッド
}

/**
 * 検証済みの0〜6の曜日を、重複なしの数値昇順へ並べ替える。
 */
function normalizeWeekdays( // 曜日を重複なしの昇順へ揃える関数
  value: number[], // 数値型
): EventPracticeBatchWeekday[] { // クラブ現地の曜日。日曜を0、土曜を6とする
  return [...new Set(value)].sort( // 配列を並べ替えるメソッド / 重複しない集合を作るコンストラクター
    /**
     * 曜日番号を小さい順に比較する。
     */
    (left, right) => left - right, 
  ) as EventPracticeBatchWeekday[]; // クラブ現地の曜日型
}

const dateSchema = z.string() // 年月日のスキーマ
  .length(10) // 長さを制限するメソッド
  .refine(isDateOnly); //YYYY-MM-DD（年-月-日）という正しい形式の日付になっているかを検証する関数
const timeSchema = z.string() // 時間のスキーマ
  .length(5) // 長さを制限するメソッド
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/); // 24時間表記の正しい時間になっているか
  //任意のテキストの検証
const optionalTextSchema = z.union([ // どちらかの方ならOK（文字かnullか）
  z.string().trim() // 前後の空白を除いて上限200文字以内
    .max(EVENT_LOCATION_MAX_LENGTH), 
  z.null(), //最初からnull
])
  .default(null) // デフォルトはnull
  .transform(optionalValue); // 任意文字列を空白除去した結果、空欄の場合はnullに変換する


  /**
 * プレビュー準備時も保存時も使う共通項目の正規化定義
 */
const commonShape = {
  targetMonth: z.string() // 文字列にする
    .refine(isEventPracticeBatchTargetMonth), // 定期練習生成の対象月を検証する
  periodStart: dateSchema,//年月日のスキーマ
  periodEnd: dateSchema,//年月日のスキーマ
  weekdays: z.array(z.number().int() //整数の配列リストを以下のように正規化する
    .min(0) // 下限を制限するメソッド（数字検証）
    .max(6)) // 上限を制限するメソッド（数字検証）
    .min(1) // 下限を制限するメソッド(合計数)
    .max(7) // 上限を制限するメソッド(合計数)
    .transform(normalizeWeekdays), //検証済みの0〜6の曜日を、重複なしの数値昇順へ並べ替える。
  title: z.string().trim() // タイトルの空白を除去して以下を正規化する
    .min(1) // 下限を制限するメソッド
    .max(EVENT_TITLE_MAX_LENGTH), // 上限を制限するメソッド（120）
  startTime: timeSchema,// 時間のスキーマ
  endTime: timeSchema,// 時間のスキーマ
  location: optionalTextSchema,//任意のテキストの検証（開催場所）
  meetingTime: z.union([ // 複数の入力型を許可する関数
    timeSchema,// 時間のスキーマ
    z.literal(""), // 空っぽの文字列
    z.null(), // 最初からnull
  ])
    .default(null) //デフォルトはnull
    .transform(optionalValue), //任意文字列を空白除去した結果、空欄の場合はnullに変換する。
  meetingLocation: optionalTextSchema,//任意のテキストの検証
  targetRoles: z.array(z.enum([ // 以下のどれかに含まれる
    "OWNER",
    "COACH",
    "OFFICER",
    "MEMBER",
  ] satisfies readonly ClubMemberRole[])) // クラブ所属ロール型
    .max(4) // 上限を制限するメソッド
    .transform(buildContentTargetRoles), //公開対象を正規化する。OWNERは必ず含め、不正な値と重複を除去する。
};

/**
 * 共通入力（プレビュー準備と保存の両方で使用）の期間開始、期間終了、開始時間、終了時間を検証する。
 */
function refineCommon( // 共通入力の期間・同月・同日終了を検証する関数
  input: EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力値の型。
  context: z.RefinementCtx, // 追加検証のエラーを登録する型
): void { // 戻り値を持たない型
  if (input.periodStart.slice(0, 7) !== input.targetMonth) { // 期間開始日が対象月からはみ出している場合、
    context.addIssue({ // 項目エラーを登録するメソッド
      code: "custom",
      path: ["periodStart"],
      message: FIELD_MESSAGES.periodStart,
    });
  }
  if (
    input.periodEnd.slice(0, 7) !== input.targetMonth || // 期間終了日が対象月からはみ出している、もしくは
    input.periodEnd < input.periodStart//期間終了日が期間開始日の前にある場合、
  ) {
    context.addIssue({ // 項目エラーを登録するメソッド
      code: "custom",
      path: ["periodEnd"],
      message: FIELD_MESSAGES.periodEnd,
    });
  }
  if (input.endTime <= input.startTime) {//終了時間が開始時間より前なら、
    context.addIssue({ // 項目エラーを登録するメソッド
      code: "custom",
      path: ["endTime"],
      message: FIELD_MESSAGES.endTime,
    });
  }
}

/**
 * 選択日が重複せず入力期間内にあることを検証する。
 */
function refineSelection( // 選択日が重複せず入力期間内にあることを検証する関数
  input: EventPracticeBatchInput, // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力
  context: z.RefinementCtx, // 追加検証のエラーを登録する型
): void { // 戻り値を持たない型
  const seen = new Set<string>(); // 重複しない集合を作るコンストラクター
  for (const date of input.selectedDates) {//定期練習作成で選択した日時をdateとする
    if (
      seen.has(date) || // すでに登録されている、もしくは
      date < input.periodStart ||//期間開始よりも前、もしくは
      date > input.periodEnd//期間終了よりも後の場合、
    ) {
      context.addIssue({ // 項目エラーを登録するメソッド
        code: "custom",
        path: ["selectedDates"],
        message: FIELD_MESSAGES.selectedDates,
      });
      return;
    }
    seen.add(date); // 集合へ要素を加えるメソッド
  }
}

// プレビュー準備時も保存時も使う共通項目の正規化定義の中身の期間開始、期間終了、開始時間、終了時間を検証するための定義
const previewSchema = z.strictObject(commonShape) 
  .superRefine(refineCommon); 

  //保存段階のデータを検証した上で選択した日時を並べ替えるスキーマ
const executionSchema = z.strictObject({ // 未許可キーを拒否するスキーマを作る関数
  ...commonShape,//プレビュー準備時も保存時も使う共通項目の正規化定義
  selectedDates: z.array(dateSchema) // //年月日の配列のスキーマと選択数のスキーマ
    .min(1) // 下限を制限するメソッド
    .max(EVENT_PRACTICE_BATCH_MAX_COUNT), // 上限を制限するメソッド（31）
  requestId: z.string() // リクエストIDのスキーマ（長さ、UUID形式、小文字に変換する）
    .length(36) // 長さを制限するメソッド
    .refine(isRequestId) // 追加の形式検証を登録するメソッド / UUID v4の形式を検証する関数
    .transform(lowercase), // 正規化を登録するメソッド / 識別子を小文字へ揃える関数
  previewFingerprint: z.string() // 照合値のスキーマ（長さ、正規化、小文字変換）
    .length(64) // 長さを制限するメソッド
    .regex(/^[0-9a-f]{64}$/i) // 正規表現の制約を設定するメソッド
    .transform(lowercase), // 正規化を登録するメソッド / 識別子を小文字へ揃える関数
})
  .superRefine(refineCommon) //共通入力（プレビュー準備と保存の両方で使用）の期間開始、期間終了、開始時間、終了時間を検証する。
  .superRefine(refineSelection) //選択日が重複せず入力期間内にあることを検証する関数
  .transform( 
    /**
     * 呼出し元の選択配列を変更せず、並べ替える
     */
    (value) => ({ 
      ...value,
      selectedDates: [...value.selectedDates].sort(), // 配列を並べ替えるメソッド
    }),
  );

/**
 * 入力値検証後フォーム全体の失敗結果
 */
function invalid( // フォーム全体の安全な失敗結果を作る関数
): EventPracticeBatchValidation<never> { // 入力検証の結果型 / 成功データを許可しない型
  return {
    success: false,
    fieldErrors: {},
    formError: INVALID_FORM,
  };
}

/**
 * 入力値検証後の項目エラー
 */
function invalidField( // 安全な項目エラーを作る関数
  field: EventPracticeBatchField, // 入力項目名型
): EventPracticeBatchValidation<never> { // 入力検証の結果型 / 値を許可しない型
  return {
    success: false,
    fieldErrors: {
      [field]: [FIELD_MESSAGES[field]],
    },
    formError: null,
  };
}

/**
 * 入力値の検証関数
 */
function validate<T>( // 入力を安全に検証する関数 / 検証成功時のデータ型
  schema: z.ZodType<T>, // 検証結果を指定するZodの型
  fields: ReadonlySet<string>, //項目
  input: unknown, // 未検証の値を表す型
): EventPracticeBatchValidation<T> { // 入力検証の結果型 
  try {
    if (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input) // 配列かを調べる関数
    ) {
      return invalid(); // 安全なフォームエラーを作る関数
    }
    //オブジェクトにあるプロトタイプ（親）となる遺伝子のような情報を検証し不正なオブジェクトではないことを証明している
    const prototype = Object.getPrototypeOf(input); // オブジェクトのprototypeを取得する関数
    if (
      prototype !== Object.prototype &&
      prototype !== null
    ) {
      return invalid(); // 安全なフォームエラーを作る関数
    }
    for (const key of Reflect.ownKeys(input)) { // 所有するキーを取得する関数
      if (
        typeof key !== "string" ||
        !fields.has(key) // 要素や項目の有無を調べるメソッド
      ) {
        return invalid(); // 安全なフォームエラーを作る関数
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key); // プロパティの定義を取得する関数
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return invalid(); // 安全なフォームエラーを作る関数
      }
    }
    const result = schema.safeParse(input); // 検証成功と検証エラーを結果で返すメソッド
    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }
    const fieldErrors: FieldErrors<EventPracticeBatchField> = {}; // 項目別エラーの型
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (
        typeof field !== "string" ||
        !fields.has(field) // 要素や項目の有無を調べるメソッド
      ) {
        return invalid(); // 安全なフォームエラーを作る関数
      }
      const knownField = field as EventPracticeBatchField; // 定期練習作成の項目の型にある項目
      fieldErrors[knownField] = [FIELD_MESSAGES[knownField]];//項目エラーの型にエラー項目を入れる
    }
    return {
      success: false,
      fieldErrors,
      formError: null,
    };
  } catch {
    return invalid(); // 安全なフォームエラーを作る関数
  }
}

/**
 * プレビュー準備段階の入力値だけを検証・正規化する関数
 */
export function validateEventPracticeBatchPreviewInput( // 共通入力を検証・正規化する関数
  input: unknown, // 未検証の値を表す型
): EventPracticeBatchValidation<EventPracticeBatchCommonInput> { // 入力検証の結果型 / 構造検証・正規化した共通入力型
  return validate(previewSchema, COMMON_FIELDS, input); // 入力値の検証関数：プレビュー準備時も保存時も使う共通項目の正規化定義の中身の期間開始、期間終了、開始時間、終了時間を検証するための定義とプレビュー準備時も保存時も使う共通項目と入力値を入れる
}

/**
 * 定期練習生成の保存する段階の入力値を検証・正規化する関数
 */
export function validateEventPracticeBatchInput( // 保存入力を検証・正規化する関数
  input: unknown, // 未検証の値を表す型
): EventPracticeBatchValidation<EventPracticeBatchInput> { // 入力検証の結果型 / 保存入力型
  return validate(executionSchema, EXECUTION_FIELDS, input); // 入力値の検証関数：保存段階のデータを検証した上で選択した日時を並べ替えるスキーマと保存段階で使用する項目と入力値を入れる
}

/**
 * フォームデータ内の対象曜日、対象役割、選択した日時を検証する関数
 */
function parse( // FormDataの項目を解析する関数
  formData: FormData, // 送信フォームの型・コンストラクター
  execute: boolean, // 保存段階かどうかの真偽値型
): EventPracticeBatchValidation<Record<string, unknown>> { // 入力検証の結果型
  try {
    if (!(formData instanceof FormData)) { // フォームデータが正しい型ではない場合、
      return invalid(); // 安全なフォームエラーを作る関数
    }
    const fields = execute ? EXECUTION_FIELDS : COMMON_FIELDS;//trueなら保存段階で使用する項目、falseならプレビューの準備段階で使用する項目
    const weekdays: number[] = []; //対象曜日
    const targetRoles: string[] = []; 
    const selectedDates: string[] = []; //選択した日時
    const record: Record<string, unknown> = {//以下をレコードに詰める
      weekdays,//対象曜日
      targetRoles,//対象の役割
    };
    if (execute) {//保存段階なら選択した日時をレコードに詰める
      record.selectedDates = selectedDates;
    }
    //フォームデータ内の項目と値の検証
    for (const [field, value] of formData.entries()) { // キーと値の組を取得するメソッド
      if (field.startsWith("$ACTION_")) { // 接頭辞を判定するメソッド
        continue;
      }
      if (
        !fields.has(field) || // 要素や項目の有無を調べるメソッド
        typeof value !== "string"
      ) {
        return invalid(); // 安全なフォームエラーを作る関数
      }
      if (field === "weekdays") {//もし項目に対象曜日があるなら、
        if (
          weekdays.length >= 7 ||
          value.length !== 1 ||
          !/^[0-6]$/.test(value) // 正規表現との一致しない場合、
        ) {
          return invalidField("weekdays"); // 安全な項目エラーを作る関数
        }
        weekdays.push(Number(value)); // 値を数値へ変換して対象曜日に入れる
      } else if (field === "targetRoles") {
        if (targetRoles.length >= 4) {
          return invalidField("targetRoles"); // 安全な項目エラーを作る関数
        }
        targetRoles.push(value); // 配列へ要素を追加するメソッド
      } else if (field === "selectedDates") {
        if (selectedDates.length >= EVENT_PRACTICE_BATCH_MAX_COUNT) {
          return invalidField("selectedDates"); // 安全な項目エラーを作る関数
        }
        selectedDates.push(value); // 配列へ要素を追加するメソッド
      } else {
        if (Object.hasOwn(record, field)) { //record という箱の中に、上記以外のfield（titleやlocationなど）という名前のプロパティがすでに直接入っているか
          return invalid(); // 入っているならデータの重複として安全なフォームエラーを作る関数
        }
        record[field] = value;//箱（record）の中に新しく上記以外の項目名（titleやlocationなど）とその中身（value）を安全に詰め込む
      }
    }
    return {
      success: true,
      data: record,
    };
  } catch {
    return invalid(); // 安全なフォームエラーを作る関数
  }
}

/**
 * プレビューの準備段階の入力値を検証する関数
 */
export function parseEventPracticeBatchPreviewFormData( // preview用FormDataを検証する関数
  formData: FormData,
): EventPracticeBatchValidation<EventPracticeBatchCommonInput> { // 検証・正規化した定期練習の共通入力値の型を入力値検証後の結果の型に入れる
  const result = parse(formData, false); // フォームデータ内の対象曜日、対象役割、（保存段階なら選択した日時も）を検証する関数
  return result.success
    ? validateEventPracticeBatchPreviewInput(result.data) //プレビュー準備段階の入力値だけを検証・正規化する関数
    : result;
}

/**
 * 保存段階の入力値を検証する関数
 */
export function parseEventPracticeBatchFormData( // 保存用FormDataを検証する関数
  formData: FormData, 
): EventPracticeBatchValidation<EventPracticeBatchInput> { //定期練習の共通入力値に選択日と操作識別子を加えた実行入力を入力値検証後の結果の型に入れる
  const result = parse(formData, true); // フォームデータ内の対象曜日、対象役割、（保存段階なら選択した日時も）を検証する関数
  if (!result.success) {
    return result;
  }
  return validateEventPracticeBatchInput(result.data); //定期練習生成の保存する段階の入力値を検証・正規化する関数
}
