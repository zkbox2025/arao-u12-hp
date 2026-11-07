// src/application/club/event/get-event-month-copy.ts
// 事前の前月イベント複製プレビューデータをDBから取得したデータを元に作成し、previewに使う表示用データ（限定DTO）に変換して返す

import "server-only";

import { z } from "zod";

import type {
  ClubAccessContext, // Auth本人とACTIVE所属から作られる認可contextの型
} from "@/app/(club-app)/club/club-membership-authorization";
import type {
  EventUtcDateTimes, // 開始・終了・集合のUTC日時をまとめた型
} from "@/domain/club/event/event-date-times";
import {
  isEventMonthCopyTargetMonth, // 複製対象月を厳密に検証する関数
} from "@/domain/club/event/event-month-copy-form";
import {
  findEventMonthCopyCandidateDuplicates, //コピーしようとしているコピー候補同士の中で、全く同じ内容のものが重複していないか確認し、あれば重複同士のデータを返す
} from "@/domain/club/event/event-month-copy-policy";
import {
  EVENT_MONTH_COPY_MAX_COUNT, // 除外前の複製候補の上限100件
  type EventMonthCopyPreview, // previewに使うデータの取得成功と失敗（上限超過・認可拒否・取得失敗）を分ける結果型
  type EventMonthCopyPreviewDateTimes, //前月イベントコピーのpreviewの日時データ型
  type EventMonthCopyPreviewItem, // 本文を含まない表示項目の型
} from "@/domain/club/event/event-month-copy-types";
import {
  findEventMonthCopyPreviewData, //前月のイベントを翌月に丸ごと複製するための、DBから取得したデータを元に事前プレビューデータ作成（重複チェック付き）関数
} from "@/src/infrastructure/prisma/repositories/event-month-copy-read-repository";
import {
  buildEventMonthCopyFingerprint, // プレビュー画面の状態を完璧に表すハッシュ値を1つ発行する関数 
} from "@/src/infrastructure/security/event-month-copy-fingerprint";


/**
 * context由来の識別子がUUIDかを検証するスキーマ
 */
const scopeSchema = z.object({ 
  clubId: z.uuid(), // クラブUUIDの検証スキーマ生成関数
  membershipId: z.uuid(), // 所属UUIDの検証スキーマ生成関数
  userId: z.uuid(), // Auth本人UUIDの検証スキーマ生成関数
});

/**
 * UTC日時をISO文字列へ変換する関数
 */
function dateTimesDto( // Clientへ返す日時の組を作る関数
  values: EventUtcDateTimes, // UTC日時の組の型
): EventMonthCopyPreviewDateTimes { // 前月イベントコピーのpreviewの日時データ型
  return {
    startAt: values.startAt.toISOString(), // 開始DateをISO文字列へ変えるメソッド
    endAt: values.endAt?.toISOString() ?? null, // 終了DateをISO文字列へ変えるメソッド
    meetingAt: values.meetingAt?.toISOString() ?? null, // 集合DateをISO文字列へ変えるメソッド
  };
}

/**
 * 事前のプレビューデータをDBから取得したデータを元に作成し、previewに使う表示用データ（限定DTO）に変換して返す関数
 * 認証済みサーバーcontextと対象月を受け、限定DTOと陳腐化検出用fingerprintを返す。
 */
export async function getEventMonthCopyPreview( // preview表示材料を取得するApplication Service
  context: ClubAccessContext, // Auth本人とACTIVE所属から作られる認可contextの型
  targetMonth: unknown, // 対象月の型
): Promise<EventMonthCopyPreview> { //previewに使うデータの取得成功と失敗（上限超過・認可拒否・取得失敗）を分ける結果型
  try {
    if (!isEventMonthCopyTargetMonth(targetMonth)) { // 複製対象月の検証失敗の場合、
      return { outcome: "PREVIEW_FAILED" };
    }
    const parsed = scopeSchema.safeParse({ // context由来の識別子がUUIDかを検証するスキーマ
      clubId: context?.club?.id,
      membershipId: context?.membership?.id,
      userId: context?.userId,
    });
    if (!parsed.success) {
      return { outcome: "FORBIDDEN" };//閲覧禁止
    }
    //UUIDであり小文字の認可context
    const scope = {
      clubId: parsed.data.clubId.toLowerCase(), // クラブUUIDを小文字にする
      membershipId: parsed.data.membershipId.toLowerCase(), // 所属UUIDを小文字にする
      userId: parsed.data.userId.toLowerCase(), // Auth本人UUIDを小文字にする
    };
    const result = await findEventMonthCopyPreviewData({ // 前月のイベントを翌月に丸ごと複製するための、事前プレビューデータをDBから取得したデータを元に作成（重複チェック付き）関数
      ...scope,//UUIDであり小文字の認可context
      targetMonth,
    });
    switch (result.outcome) {
      case "FORBIDDEN":
      case "TOO_MANY":
      case "PREVIEW_FAILED":
        return { outcome: result.outcome };
      case "READY":
        break;//switchを終了する
      default:
        return { outcome: "PREVIEW_FAILED" };
    }
    if (result.candidates.length > EVENT_MONTH_COPY_MAX_COUNT) {//前月予定イベントの複製での最大コピー数(100)より大きい場合、
      return { outcome: "TOO_MANY" };
    }
    const fingerprint = buildEventMonthCopyFingerprint({ // プレビュー画面の状態を完璧に表すハッシュ値を1つ発行する関数
      ...scope,
      targetMonth,
      timezone: result.timezone,
      candidates: result.candidates,
    });
    const duplicates = new Map( // 候補間一致の注意表示用Mapを作るコンストラクター
      findEventMonthCopyCandidateDuplicates(result.candidates).map( //コピーしようとしているコピー候補同士の中で、全く同じ内容のものが重複していないか確認し、あれば重複同士のデータを返す
        /**
         * 重複候補IDから、その代表となる複製元IDを引ける組へ変える。
         */
        (pair) => [pair.sourceEventId, pair.duplicateSourceEventId] as const, // 重複したコピー候補同士をペアにして記録しておくためのオブジェクトに結果を変換する
      ),
    );
    const items = result.candidates.map( // サーバー内部候補を表示用データへ変換する
      (candidate): EventMonthCopyPreviewItem => { //プレビュー画面でイベント1件あたりに表示・管理するためのデータ型を以下の表示用データへ変換する
        const sourceEventId = candidate.source.id.toLowerCase(); // 小文字にする
        const times = candidate.dateTimes;//日時
        //コピー対象からの除外理由
        const exclusionReason = !candidate.source.targetRoles.includes("OWNER") // 既存のOWNER必須規約を確認するメソッド
          ? "INVALID_SOURCE"
          : times.success
            ? null
            : times.exclusionReason;
        const duplicateSourceEventId = duplicates.get(sourceEventId) ?? null; // 重複のオブジェクトの中から重複した「2番目以降に登場したイベントのID」を取得する
        const duplicateEventId = candidate.duplicateEventId?.toLowerCase() ?? null; // 重複のオブジェクトの中の重複した「1番最初（先頭）に登場したイベントのID」を小文字にする
        return {//以下表示用データ
          sourceEventId,
          title: candidate.source.title,
          isAllDay: candidate.source.isAllDay,
          original: dateTimesDto(times.original ?? candidate.source), // 元の日時をISO文字列へ変える関数
          converted: times.success ? dateTimesDto(times.converted) : null, // 変換後の日時をISO文字列へ変える関数
          correctedFields: [...times.correctedFields],
          exclusionReason,
          duplicateEventId,
          duplicateSourceEventId,
          // 候補間一致は元の開始日時・ID順の代表だけを初期選択する。
          initiallySelected://その複製候補のイベントのチェックボックスを、最初の表示時点で自動的にオンにしておくかどうかを判定
            exclusionReason === null &&//除外理由なし
            duplicateEventId === null &&//重複なし
            duplicateSourceEventId === null,//重複なし
        };
      },
    );
    return {
      outcome: "READY",
      targetMonth,
      sourceMonth: result.sourceMonth,
      timezone: result.timezone,
      fingerprint,
      items,//表示用データ（候補からデータへマッピングした後の形）
    };
  } catch {
    return { outcome: "PREVIEW_FAILED" };
  }
}
