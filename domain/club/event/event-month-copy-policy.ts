// domain/club/event/event-month-copy-policy.ts
// コピー列の必要なデータの抽出やコピー先同士の重複を検証する関数

import { z } from "zod";

import {
  CLUB_MEMBER_ROLE_LABELS, // Prisma由来の全クラブ所属ロールに対応する表示ラベル
} from "@/domain/club/club-member-role";
import type {
  ClubEventGenre, // Prisma由来のイベントジャンルの型:"PRACTICE" | "PRACTICE_GAME" | "TOURNAMENT" | "CAMP" | "HOLIDAY" | "OTHER"
  ClubMemberRole, // Prisma由来のクラブ所属ロールの型:"OWNER" | "COACH" | "OFFICER" | "MEMBER"
} from "@/types/prisma";
import {
  EVENT_GENRE_LABELS, // Prisma由来の全イベントジャンルに対応する表示ラベル
} from "./event-labels";
import type {
  EventMonthCopyDateTimeResult, // コピー元日時から新しい日時へ変換した結果型
} from "./event-month-copy-date-times";
import {
  EVENT_MONTH_COPY_MAX_COUNT, // 前月予定の複製候補・選択件数の上限(100)
  type EventMonthCopyEvent, // コピーするイベント1件あたりの型
  type EventMonthCopySource, // コピー列に複製元IDと更新日時を加えた型
} from "./event-month-copy-types";

const INVALID_DATA_MESSAGE = "複製対象のデータを確認できません。";
const identifierSchema = z.uuid(); // UUID識別子を検証するスキーマの生成関数
const genres = Object.keys(EVENT_GENRE_LABELS) as ClubEventGenre[]; // ジャンルラベルのキーの定義
const roles = Object.keys(CLUB_MEMBER_ROLE_LABELS) as ClubMemberRole[]; // ロールラベルのキーの定義


/**
 * 1件あたりのイベントの型の検証関数
 */
const eventSchema = z.object({ // コピー列だけを抽出・検証するオブジェクトスキーマ生成関数
  title: z.string(), // タイトル文字列の検証スキーマ生成関数
  content: z.string().nullable(), // 本文文字列の検証 / nullを許すスキーマ生成メソッド
  genre: z.enum(genres), // 既存の全ジャンルを検証するスキーマ生成関数
  targetRoles: z.array(z.enum(roles)), //  既存の全ロールを検証するスキーマ生成関数
  startAt: z.date(), // 開始Dateを検証するスキーマ生成関数
  endAt: z.date().nullable(), // 終了Dateの検証 / nullを許すスキーマ生成メソッド
  isAllDay: z.boolean(), // 終日区分の真偽値を検証するスキーマ生成関数
  location: z.string().nullable(), // 開催場所文字列の検証 / nullを許すスキーマ生成メソッド
  meetingAt: z.date().nullable(), // 集合Dateの検証 / nullを許すスキーマ生成メソッド
  meetingLocation: z.string().nullable(), // 集合場所文字列の検証 / nullを許すスキーマ生成メソッド
  belongings: z.string().nullable(), // 持ち物文字列の検証 / nullを許すスキーマ生成メソッド
  notes: z.string().nullable(), // 注意事項文字列の検証 / nullを許すスキーマ生成メソッド
}) satisfies z.ZodType<EventMonthCopyEvent>; //コピーするイベント1件あたりの型の全必須列を満たす型の確認

/**
 * 変更しないように凍結されたコピーするイベント1件あたりの型の項目名リスト
 */
export const EVENT_MONTH_COPY_FIELDS = Object.freeze( // 配列の実行時変更を防ぐメソッド
  Object.keys(eventSchema.shape) as (keyof EventMonthCopyEvent)[], //1件のイベントの型検証のキーを変えないように定義したもの
);

/**
 * 元データと日時変換結果の型
 */
export type EventMonthCopyCandidate = { 
  source: EventMonthCopySource; // 複製元のコピー列・ID・更新日時の型
  dateTimes: EventMonthCopyDateTimeResult; // 日時変換の成功・失敗結果の型
};

/**
 * 重複したコピー候補同士をペアにして記録しておくためのデータ
 * これからコピーしようとしている先月のイベント（コピー候補）同士の中で、全く同じ内容のものがダブって見つかった場合に使われる
 */
export type EventMonthCopyCandidateDuplicate = { 
  sourceEventId: string; //重複した「2番目以降に登場したイベントのID」
  duplicateSourceEventId: string; //重複した「1番最初（先頭）に登場したイベントのID」
};

/**
 * コピーするイベント1件あたりの型から必要なコピー列だけを返す関数
 */
export function pickEventMonthCopyEvent( // コピー列だけを検証・抽出する関数
  event: EventMonthCopyEvent, // コピー列を持つイベントの型
): EventMonthCopyEvent { // コピー列だけのイベント型
  try {
    const parsed = eventSchema.safeParse(event); // コピー列を安全に検証する
    if (!parsed.success) {
      throw new Error(INVALID_DATA_MESSAGE); // 入力原文を含まない固定例外のコンストラクター
    }
    return {
      ...parsed.data,
      targetRoles: [...parsed.data.targetRoles],
      startAt: new Date(parsed.data.startAt.getTime()), // 独立したDateの生成 / 開始UTC値を取得するメソッド
      endAt: parsed.data.endAt === null
        ? null
        : new Date(parsed.data.endAt.getTime()), // 独立したDateの生成 / 終了UTC値を取得するメソッド
      meetingAt: parsed.data.meetingAt === null
        ? null
        : new Date(parsed.data.meetingAt.getTime()), // 独立したDateの生成 / 集合UTC値を取得するメソッド
    };
  } catch {
    throw new Error(INVALID_DATA_MESSAGE); // 生の検証例外やcauseを返さない固定例外のコンストラクター
  }
}

/**
 * 1件のイベントデータからコピー対象となる項目を検証・抽出した上で、1本の文字列に変換する関数
 * ２つの予定を比較して一致ことを確認するための比較値を作成する
 */
export function buildEventMonthCopyKey( // コピー列の決定的な比較値を作る関数
  event: EventMonthCopyEvent, // コピー列を持つイベントの型
): string { // サーバー内部比較専用の文字列型
  const picked = pickEventMonthCopyEvent(event); // コピー列を検証・抽出する関数
  const targetRoles = [...new Set(picked.targetRoles)].sort(); // ロールの重複を除ぎ並べ替える
  return JSON.stringify({ //1本の文字列にする（ハッシュ化しやすいように）
    ...picked,
    targetRoles,
  });
}

/**
 * コピーしようとしているコピー候補同士の中で、全く同じ内容のものが重複していないか確認し、あれば重複同士のデータを返す
 */
export function findEventMonthCopyCandidateDuplicates( // 候補間の完全一致情報を返す関数
  candidates: readonly EventMonthCopyCandidate[], //元データと日時変換結果の型
): readonly EventMonthCopyCandidateDuplicate[] { //重複したコピー候補同士をペアにして記録しておくためのデータ
  try {
    if (candidates.length > EVENT_MONTH_COPY_MAX_COUNT) {
      throw new Error(INVALID_DATA_MESSAGE); // 上限超過を原文なしで伝える固定例外のコンストラクター
    }
    const seenIds = new Set<string>(); // 候補IDの重複検出用集合の生成
    const rows: { // 比較前に必要値だけを取り出す内部構造型
      id: string; // 小文字UUIDの文字列型
      time: number; // 元の開始UTC値の数値型
      key: string; // コピー列の比較値の文字列型
    }[] = [];
    for (const candidate of candidates) {
      const id = candidate.source.id.toLowerCase(); // UUID表記を小文字へ揃えるメソッド
      if (
        !identifierSchema.safeParse(id).success || // UUIDを安全に検証するメソッド
        seenIds.has(id) // 候補IDの重複を検出するメソッド
      ) {
        throw new Error(INVALID_DATA_MESSAGE); // 不正または重複した候補IDの固定例外のコンストラクター
      }
      seenIds.add(id); // 候補IDを記録するメソッド
      if (!candidate.dateTimes.success) {
        continue;
      }
      const source = pickEventMonthCopyEvent(candidate.source); // コピー元の列を検証・抽出する関数
      rows.push({ // 比較する候補を記録するメソッド
        id,
        time: source.startAt.getTime(), // 元の開始UTC値を取得するメソッド
        key: buildEventMonthCopyKey({ // 1件のイベントデータからコピー対象となる項目を検証・抽出した上で、1本の文字列に変換する関数
          ...source,
          ...candidate.dateTimes.converted,
        }),
      });
    }
    rows.sort( // 入力順に依存しない候補順へ並べるメソッド
      /**
       * 元の開始UTC値、同値なら小文字UUIDの辞書順で比較する。
       */
      (left, right) => { // 安定した候補順を作る比較コールバック
        if (left.time !== right.time) {
          return left.time - right.time;
        }
        if (left.id === right.id) {
          return 0;
        }
        return left.id < right.id ? -1 : 1;
      },
    );
    const firstByKey = new Map<string, string>(); // 比較値から代表IDを引くMapの生成 
    const duplicates: EventMonthCopyCandidateDuplicate[] = []; //重複したコピー候補同士をペアにして記録しておくためのデータ
    for (const row of rows) {
      const first = firstByKey.get(row.key); // 重複する候補のIDを取得する（buildEventMonthCopyKeyのrow.keyを使って比較する）
      if (first === undefined) {
        firstByKey.set(row.key, row.id); // 比較値に対応する代表IDを登録するメソッド
      } else {
        duplicates.push({ // 注意表示用の候補間一致情報を追加するメソッド
          sourceEventId: row.id,
          duplicateSourceEventId: first,
        });
      }
    }
    return duplicates;
  } catch {
    throw new Error(INVALID_DATA_MESSAGE); // 本文や比較値を含めない固定例外のコンストラクター
  }
}
