// src/infrastructure/security/event-month-copy-fingerprint.ts
// F10のpreviewと実行入力を、用途・版・クラブ・本人に紐づくSHA-256へ変換する。

import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  isEventMonthCopyTargetMonth, // 対象月を検証する関数
  validateEventMonthCopyInput, // 複製入力の検証と正規化を行う関数
} from "@/domain/club/event/event-month-copy-form";
import {
  buildEventMonthCopyKey, // 全コピー列からコピー列を検証・抽出する関数
  type EventMonthCopyCandidate, // 元イベントと日時変換結果をまとめた候補の型
} from "@/domain/club/event/event-month-copy-policy";
import {
  EVENT_MONTH_COPY_MAX_COUNT, // 前月予定の複製候補・選択件数の上限(100)
  type EventMonthCopyInput, // 正規化済み複製入力の型
} from "@/domain/club/event/event-month-copy-types";
import type {
  EventUtcDateTimes, // 開始・終了・集合のUTC日時をまとめる型
} from "@/domain/club/event/event-date-times";

// 比較列や候補照合の意味を変更する場合は版を上げ、既存操作との互換性を確認する。
const FORMAT_VERSION = 1;
const INVALID_DATA_MESSAGE = "複製内容を確認できません。";
const identifierSchema = z.uuid(); // UUID識別子を検証するスキーマの生成関数
const correctedFieldSchema = z.array(z.enum([ // 補正項目の配列検証。許可された項目名の検証スキーマ生成関数
  "startAt",
  "endAt",
  "meetingAt",
]));

/**
 * 最新認可から得たクラブ・所属・Auth本人の識別子。
 * 「別のクラブ」や「別の人」のデータへ不正に流用（使い回し）されるのを防ぐ
 */
export type EventMonthCopyFingerprintScope = { // ハッシュを別クラブ・別本人へ流用させないスコープ型
  clubId: string; // クラブIDの文字列型
  membershipId: string; // 実行Membership IDの文字列型
  userId: string; // Auth本人IDの文字列型
};

/**
 * 元データと日時変換結果の組と、既存イベントとの一致状態を加えた、サーバー内のpreview候補。
 */
export type EventMonthCopyFingerprintCandidate = EventMonthCopyCandidate & { // 元データと日時変換結果の組と
  duplicateEventId: string | null; // 既存完全一致イベントの代表IDまたは未一致の型
};

/**
 * preview全体の照合に必要な現在のscope・対象月・timezone・全preview候補。
 */
export type EventMonthCopyFingerprintInput = EventMonthCopyFingerprintScope & { // 最新認可から得たクラブ・所属・Auth本人の識別子とpreview内容の結合型
  targetMonth: string; // 複製先の対象月の文字列型
  timezone: string; // 現在DBのクラブtimezoneの文字列型
  candidates: readonly EventMonthCopyFingerprintCandidate[]; //元データと日時変換結果の組と、既存イベントとの一致状態を加えた、サーバー内のpreview候補。
};

/**
 * UUID識別子を検証し、小文字に正規化する関数
 */
function identifier(value: string): string { // ハッシュ内のUUIDを正規化する関数
  if (!identifierSchema.safeParse(value).success) { // UUIDを安全に検証しfalseの場合
    throw new Error(INVALID_DATA_MESSAGE); // 不正IDを固定文言だけで伝える例外のコンストラクター
  }
  return value.toLowerCase(); // UUIDを小文字へ揃えるメソッド
}

/**
 * 日時を検証し、イギリス基準の世界標準時（UTC）の文字列に変換する
 */
function dateVersion(value: Date): string { // 日時の決定的な比較表現を作る関数 / Date型 / 戻り値の文字列型
  if (
    !(value instanceof Date) || // Dateの型判定
    !Number.isFinite(value.getTime()) // 有効な数字かを検証する
  ) {
    throw new Error(INVALID_DATA_MESSAGE); // 不正日時を原文なしで伝える例外のコンストラクター
  }
  return new Date(value.getTime()).toISOString(); //イギリス基準の世界標準時（UTC）の文字列に変換する
}

/**
 * 日時を検証し、イギリス基準の世界標準時（UTC）の文字列に変換する
 * 元日時が取得できない場合はnullとして区別する。
 */
function dates(values: EventUtcDateTimes | null) { 
  if (values === null) {
    return null;
  }
  return [
    dateVersion(values.startAt), // 開始日時をISO値へ変える関数
    values.endAt === null ? null : dateVersion(values.endAt), // 終了日時をISO値へ変える関数
    values.meetingAt === null ? null : dateVersion(values.meetingAt), // 集合日時をISO値へ変える関数
  ];
}

/**
 *  最新認可から得たクラブ・所属・Auth本人の識別子を正規化する関数
 */
function scopeValues(scope: EventMonthCopyFingerprintScope): string[] { // 最新認可から得たクラブ・所属・Auth本人の識別子を正規化する関数
  return [
    identifier(scope.clubId), // クラブIDを正規化する関数
    identifier(scope.membershipId), // 実行所属IDを正規化する関数
    identifier(scope.userId), // Auth本人IDを正規化する関数
  ];
}

/**
 * 改ざんやデータの衝突を防ぐためのSHA-256ハッシュ値を生成する（ハッシュ化する）関数
 */
function digest( 
  kind: "PREVIEW" | "INPUT", // preview用と実行入力用の用途を分ける型
  payload: unknown, // サーバー内で明示的に組み立てる素材の型
): string { // SHA-256の小文字16進文字列型
  return createHash("sha256") // SHA-256を生成する関数
    .update(JSON.stringify([ // UTF-8素材を投入するメソッド / 固定順でJSONへ変換するメソッド
      "F10_COPY_PREVIOUS_MONTH",
      FORMAT_VERSION,
      kind,
      payload,
    ]), "utf8")
    .digest("hex"); // ハッシュを小文字16進文字列として得るメソッド
}

/**
 * プレビュー画面の状態を完璧に表すハッシュ値を1つ発行する関数
 * コピー候補（プレビュー）を画面に表示するときに発行し、ユーザーが「コピー実行」ボタンを押したときに実行リクエストと一緒にサーバーに返す。
 * DBからの情報でbuildEventMonthCopyFingerprintで再度計算しなおしたハッシュ値を照合する（プレビューを見ている間に誰も情報をいじってないかを確かめるため）
 */
export function buildEventMonthCopyFingerprint( // previewの陳腐化検出用ハッシュを計算する関数
  input: EventMonthCopyFingerprintInput, // scope・月・timezone・全preview候補の型
): string { // preview識別値の文字列型
  try {
    if (
      !isEventMonthCopyTargetMonth(input.targetMonth) || // 対象月を厳密に検証する関数
      !Array.isArray(input.candidates) || // 候補が配列であることを検証するメソッド
      input.candidates.length > EVENT_MONTH_COPY_MAX_COUNT ||
      typeof input.timezone !== "string" ||
      input.timezone.length === 0
    ) {
      throw new Error(INVALID_DATA_MESSAGE); // 不正なpreview指定を固定文言で伝える例外のコンストラクター
    }
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(0); //指定されたタイムゾーン名が正しい文字列かのチェック
    const seen = new Set<string>(); // 候補IDの重複を検出する集合を生成 
    const snapshots = input.candidates.map( 
      /**
       * 候補のコピー列・更新日時・変換結果・重複状態だけを値へ写す。
       */
      (candidate) => { // サーバー内の候補を正規化するコールバック
        const id = identifier(candidate.source.id); // 複製元IDを正規化する関数
        if (seen.has(id)) { // 候補IDの重複を検出するメソッド
          throw new Error(INVALID_DATA_MESSAGE); // 重複した候補IDを固定文言で伝える例外のコンストラクター
        }
        seen.add(id); // 正規化済み候補IDを記録するメソッド
        const result = candidate.dateTimes;
        const corrections = correctedFieldSchema.safeParse(result.correctedFields); // 補正項目を安全に検証するメソッド
        if (!corrections.success) {
          throw new Error(INVALID_DATA_MESSAGE); // 不正な補正項目を固定文言で伝える例外のコンストラクター
        }
        return {
          id,
          value: [
            id,
            dateVersion(candidate.source.updatedAt), // 日時を検証し、イギリス基準の世界標準時（UTC）の文字列に変換する
            buildEventMonthCopyKey(candidate.source), //全コピー列からコピー列を検証・抽出する関数
            result.success,
            dates(result.original), // 日時を検証し、イギリス基準の世界標準時（UTC）の文字列に変換する
            result.success ? dates(result.converted) : null, // 日時を検証し、イギリス基準の世界標準時（UTC）の文字列に変換する
            [...new Set(corrections.data)].sort(), // 補正項目の重複を除く集合の生成 / 順序を揃えるメソッド
            result.success ? null : [result.exclusionReason, result.issue, result.field],
            candidate.duplicateEventId === null ? null : identifier(candidate.duplicateEventId), // 既存一致IDを正規化する関数
          ],
        };
      },
    );
    snapshots.sort( // 候補の取得順によるハッシュ差を除くために並び順を整える処理
      /**
       * 正規化済みの複製元IDを辞書順で比較する。
       */
      (left, right) => { // 候補順を固定する比較コールバック
        if (left.id === right.id) {
          return 0;
        }
        return left.id < right.id ? -1 : 1;
      },
    );
    return digest("PREVIEW", [ //改ざんやデータの衝突を防ぐためのSHA-256ハッシュ値を生成する（ハッシュ化する）関数
      scopeValues(input), //最新認可から得たクラブ・所属・Auth本人の識別子を正規化する関数
      input.targetMonth,
      input.timezone,
      snapshots.map( // ID順に並べた比較素材だけを取り出すメソッド
        /**
         * コピー本文を含む内部素材を、返却せずハッシュ計算だけへ渡す。
         */
        (snapshot) => snapshot.value, // 限定した比較素材を取得するコールバック
      ),
    ]);
  } catch {
    throw new Error(INVALID_DATA_MESSAGE); // 生の例外・入力・causeを含めない固定例外のコンストラクター
  }
}

/**
 * リクエストハッシュを作成する関数
 * 「実行リクエスト（選択内容）」が、連打でダブったり途中で改ざんされたりしていないかを防衛する
 */
export function buildEventMonthCopyInputHash( // 実行内容の一致を確認するハッシュを計算する関数
  scope: EventMonthCopyFingerprintScope, // 最新認可から得たクラブ・所属・Auth本人の識別子
  input: EventMonthCopyInput, // 複製入力の型
): string { // 実行入力のSHA-256文字列型
  try {
    const validation = validateEventMonthCopyInput(input); // 前月複製イベントの入力値を検証する関数
    if (!validation.success) {
      throw new Error(INVALID_DATA_MESSAGE); // 不正入力を固定文言で伝える例外のコンストラクター
    }
    return digest("INPUT", [ //改ざんやデータの衝突を防ぐためのSHA-256ハッシュ値を生成する（ハッシュ化する）関数
      scopeValues(scope), // 最新認可から得たクラブ・所属・Auth本人の識別子を正規化する関数
      validation.data.targetMonth,
      validation.data.selectedEventIds,
      validation.data.previewFingerprint,
    ]);
  } catch {
    throw new Error(INVALID_DATA_MESSAGE); // 本文や生の検証例外を含めない固定例外のコンストラクター
  }
}
