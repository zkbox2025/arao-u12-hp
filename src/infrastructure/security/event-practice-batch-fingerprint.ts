// src/infrastructure/security/event-practice-batch-fingerprint.ts
// F11のpreviewと送信内容を、用途・版・認可scopeを分けたSHA-256へ変換する。

import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type {
  EventPracticeBatchDateTimeCandidate, // 定期練習の日時作成準備の日時候補もしくは作成できない理由
} from "@/domain/club/event/event-practice-batch-date-times";
import {
  validateEventPracticeBatchInput, // 定期練習生成の保存する段階の入力値を検証・正規化する関数
  validateEventPracticeBatchPreviewInput, // プレビュー準備段階の入力値だけを検証・正規化する関数
} from "@/domain/club/event/event-practice-batch-form";
import {
  buildEventPracticeBatchKey, // 定期練習の入力値とUTC日時(開始時間、終了時間、集合時間)からコピーするイベント1件あたりの型を返し、その値からコピー対象となる項目を検証・抽出した上で、1本の文字列に変換する
} from "@/domain/club/event/event-practice-batch-policy";
import {
  EVENT_PRACTICE_BATCH_MAX_COUNT, // 定期練習作成の最大件数31件
  type EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力値の型
  type EventPracticeBatchExclusionReason, // 特定の日時には練習イベントを作成できないのかの理由のリスト
  type EventPracticeBatchInput, // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力
} from "@/domain/club/event/event-practice-batch-types";
import {
  isValidTimeZone, // タイムゾーンが正しく利用できるかを検証する関数
} from "@/domain/shared/date-time/club-local-date-time";

// 比較列・正規化・照合の意味を変更するときは、保存済み操作との互換性を確認して版を上げる。
const FORMAT_VERSION = 1;
const INVALID_DATA_MESSAGE = "定期練習の照合内容を確認できません。";
const identifierSchema = z.uuid(); // UUID識別子のスキーマを作る関数
const warningsSchema = z.array(z.literal("MEETING_AFTER_START")).max(1); //MEETING_AFTER_STARTが最大一件あるかの確認スキーマ
const exclusionSchema = z.enum([ // エラー一覧のスキーマを作る関数
  "NONEXISTENT_LOCAL_TIME",//現地時間が存在しない
  "AMBIGUOUS_LOCAL_TIME",//現地時間が明確ではない
  "INVALID_INTERVAL",//開始時間が終了時間よりもあと
  "OUT_OF_RANGE",//範囲外
  "INVALID_DATE_TIME",//日時が不正
]);

/**
 * 最新認可から得るクラブ・実行所属・Auth本人の識別情報の型
 */
export type EventPracticeBatchFingerprintScope = { 
  clubId: string; // 文字列型
  membershipId: string; // 文字列型
  userId: string; // 文字列型
};

/**
 * 定期練習の日時候補と重複イベントID
 */
export type EventPracticeBatchFingerprintCandidate = EventPracticeBatchDateTimeCandidate & { // 定期練習の日時作成準備の日時候補もしくは作成できない理由、かつ
  duplicateEventId: string | null; //重複イベントID
};

/**
 * preview照合に必要な識別情報の型と共通入力・現在のtimezone・全候補
 */
export type EventPracticeBatchFingerprintInput = EventPracticeBatchFingerprintScope & { // 最新認可から得るクラブ・実行所属・Auth本人の識別情報の型、かつ
  input: EventPracticeBatchCommonInput; // 検証・正規化した定期練習の共通入力値の型。
  timezone: string; // 文字列型
  candidates: readonly EventPracticeBatchFingerprintCandidate[]; // 定期練習の日時候補と重複イベントID
};

/**
 * 文字列、36文字、UUIDの形式を検証し、小文字に正規化する
 */
function identifier(value: string): string { // UUIDを検証し小文字へ正規化する関数 / 文字列型
  if (
    typeof value !== "string" ||
    value.length !== 36 ||
    !identifierSchema.safeParse(value).success //// UUID識別子ではない
  ) {
    throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
  }
  return value.toLowerCase(); // 小文字へ変換するメソッド
}

/**
 * 最新認可の識別子を検証・正規化する
 */
function scopeValues(scope: EventPracticeBatchFingerprintScope): readonly string[] { // 最新認可から得るクラブ・実行所属・Auth本人の識別情報の型
  return [
    identifier(scope.clubId), // 文字列、36文字、UUIDの形式を検証し、小文字に正規化する
    identifier(scope.membershipId), // 文字列、36文字、UUIDの形式を検証し、小文字に正規化する
    identifier(scope.userId), // 文字列、36文字、UUIDの形式を検証し、小文字に正規化する
  ];
}

/**
 * 検証・正規化した定期練習の共通入力値を値のみにするマッパー関数
 */
function commonValues(input: EventPracticeBatchCommonInput): readonly unknown[] { //検証・正規化した定期練習の共通入力値の型
  return [
    input.targetMonth,
    input.periodStart,
    input.periodEnd,
    [...input.weekdays],
    input.title,
    input.startTime,
    input.endTime,
    input.location,
    input.meetingTime,
    input.meetingLocation,
    [...input.targetRoles],
  ];
}

/**
 * 指定された日付（value）が、定期練習のスケジュールとして正しい日付かを検証する関数
 */
function candidateDate( // 候補の現地日付・期間・曜日を検証する関数
  value: string, // 文字列型
  input: EventPracticeBatchCommonInput, // 正規化した定期練習の共通入力型
): string { // 文字列型
  if (
    typeof value !== "string" ||
    value.length !== 10 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) || // 正規表現との一致を検証するメソッド
    value.slice(0, 7) !== input.targetMonth || // 文字列や配列の指定範囲を得るメソッド
    value < input.periodStart ||
    value > input.periodEnd
  ) {
    throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
  }
  const calendar = new Date(`${value}T00:00:00.000Z`); // 日時を生成するコンストラクター
  if (
    !Number.isFinite(calendar.getTime()) || // 有限の数値かを確認する関数
    calendar.toISOString().slice(0, 10) !== value || 
    !input.weekdays.some( // 入力値の対象曜日をカレンダーと一致するかを一つずつ確認する
      /**
       * 保存用UTC日付ではなく、現地カレンダーの曜日番号と比較する。
       */
      (weekday) => weekday === calendar.getUTCDay(), //対象曜日とカレンダーから取得した曜日を比較する
    )
  ) {
    throw new Error(INVALID_DATA_MESSAGE); 
  }
  return value;
}

/**
 * 改ざんやデータの衝突を防ぐためのSHA-256ハッシュ値を生成する（ハッシュ化する）関数
 */
function digest( // 用途・版を含む素材からSHA-256を計算する関数
  kind: "PREVIEW" | "INPUT", 
  payload: readonly unknown[], // 型未確定の内部素材を表す型
): string { // 文字列型
  return createHash("sha256") // SHA-256の計算器を作る関数
    .update(JSON.stringify([ // UTF-8素材をhashへ加えるメソッド / 値を固定順のJSON文字列へ変換する関数
      "F11_CREATE_PRACTICE_BATCH",
      FORMAT_VERSION,
      kind,
      payload,
    ]), "utf8")
    .digest("hex"); // SHA-256を16進文字列で得るメソッド
}

/**
 * 定期練習生成のプレビュー段階の入力値が正しいか検証し、現在のpreview内容の照合値（フィンガープリント）を返す関数。
 */
export function buildEventPracticeBatchFingerprint( // 全preview候補の照合hashを計算する関数
  input: EventPracticeBatchFingerprintInput, // preview照合に必要な識別情報の型と共通入力・現在のtimezone・全候補
): string { // 文字列型
  try {
    const common = input.input;
    const timezone = input.timezone;
    const candidates = input.candidates;
    const validated = validateEventPracticeBatchPreviewInput(common); // プレビュー準備段階の入力値だけを検証・正規化する関数
    if (
      !validated.success ||
      !isValidTimeZone(timezone) || // タイムゾーン（"Asia/Tokyo"）が正しく利用できるかを検証する関数
      !Array.isArray(candidates) || // 配列かを確認する関数
      candidates.length > EVENT_PRACTICE_BATCH_MAX_COUNT
    ) {
      throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
    }
    const values = validated.data;
    const seen = new Set<string>(); //重複なしの文字列の箱を作成
    const rows: {//日付と値の配列
      date: string; // 文字列型
      value: readonly unknown[]; 
    }[] = [];
    for (const candidate of candidates) {
      const date = candidateDate(candidate.date, values); //指定された日付（value）が、定期練習のスケジュールとして正しい日付かを検証する関数
      if (seen.has(date)) { // 集合内の有無を確認するメソッド
        throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
      }
      seen.add(date); // 集合へ値を記録するメソッド
      const warnings = warningsSchema.safeParse(candidate.warnings); //MEETING_AFTER_STARTが最大一件あるかの確認スキーマ
      if (!warnings.success) {
        throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
      }
      const dates = candidate.dates;
      const reason = candidate.exclusionReason;
      const duplicateEventId = candidate.duplicateEventId;
      let eventKey: string | null = null; 
      let exclusionReason: EventPracticeBatchExclusionReason | null = null; // 特定の日時には練習イベントを作成できないのかの理由のリスト
      if (dates === null) {//候補日時がnullの場合、以下
        const exclusion = exclusionSchema.safeParse(reason); //エラー一覧のスキーマを作る関数
        if (
          !exclusion.success ||
          duplicateEventId !== null
        ) {
          throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
        }
        exclusionReason = exclusion.data;
      } else {
        if (reason !== null) {
          throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
        }
        eventKey = buildEventPracticeBatchKey(values, dates); // 定期練習の入力値とUTC日時(開始時間、終了時間、集合時間)からコピーするイベント1件あたりの型を返し、その値からコピー対象となる項目を検証・抽出した上で、1本の文字列に変換する
      }
      rows.push({ // 配列へ値を加えるメソッド
        date,
        value: [
          date,
          eventKey,
          exclusionReason,
          warnings.data,
          duplicateEventId === null ? null : identifier(duplicateEventId), // UUIDを検証し小文字へ正規化する関数
        ],
      });
    }
    rows.sort( // 日付順に並べ替える
      /**
       * 候補の取得順による差をなくし、現地日付の昇順へ揃える。
       */
      (left, right) => { // 候補を現地日付順で比較するコールバック
        if (left.date === right.date) {
          return 0;
        }
        return left.date < right.date ? -1 : 1;
      },
    );
    return digest("PREVIEW", [ //改ざんやデータの衝突を防ぐためのSHA-256ハッシュ値を生成する（ハッシュ化する）関数
      scopeValues(input), // 最新認可の識別子を検証・正規化する
      commonValues(values), // 検証・正規化した定期練習の共通入力値を値のみにするマッパー関数
      timezone,
      rows.map( 
        /**
         * サーバー内部の必要な値だけをhashへ渡す。
         */
        (row) => row.value, 
      ),
    ]);
  } catch {
    throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
  }
}

/**
 * リクエストハッシュを作成する関数
 * 「実行リクエスト（選択内容）」が、連打でダブったり途中で改ざんされたりしていないかを防衛する
 */
export function buildEventPracticeBatchInputHash( // 送信済み入力の照合hashを計算する関数
  scope: EventPracticeBatchFingerprintScope, // 最新認可から得るクラブ・実行所属・Auth本人の識別情報の型
  input: EventPracticeBatchInput, // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
): string { // 文字列型
  try {
    const validated = validateEventPracticeBatchInput(input); // 定期練習生成の保存する段階の入力値を検証・正規化する関数
    if (!validated.success) {
      throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
    }
    return digest("INPUT", [ // 改ざんやデータの衝突を防ぐためのSHA-256ハッシュ値を生成する（ハッシュ化する）関数
      scopeValues(scope), // 最新認可の識別子を検証・正規化する
      commonValues(validated.data), // 検証・正規化した定期練習の共通入力値を値のみにするマッパー関数
      validated.data.selectedDates,
      validated.data.previewFingerprint,
    ]);
  } catch {
    throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
  }
}
