// src/infrastructure/prisma/repositories/event-month-copy-read-repository.ts
// 前月のイベントを翌月に丸ごと複製するための、事前プレビューデータ作成（重複チェック付き）

import "server-only";

import { TZDate } from "@date-fns/tz";
import type { Prisma } from "@prisma/client";

import {
  CLUB_MEMBER_ROLE_LABELS, // Prisma由来の全クラブ所属ロールに対応する表示ラベル
  isClubAdminRole, // 管理者(OWNER / COACH / OFFICER)かどうか判定する関数
} from "@/domain/club/club-member-role";
import {
  convertEventMonthCopyDateTimes, // 前月イベントの日時だけを1か月先へ変換する関数
} from "@/domain/club/event/event-month-copy-date-times";
import {
  isEventMonthCopyTargetMonth, // 複製対象月の厳密な構造を検証する関数
} from "@/domain/club/event/event-month-copy-form";
import {
  buildEventMonthCopyKey, //1件のイベントデータからコピー対象となる項目を検証・抽出した上で、1本の文字列に変換する関数 
  EVENT_MONTH_COPY_FIELDS, // 変更できないコピー対象の項目名リスト
  pickEventMonthCopyEvent, // コピー対象の値を検証し、必要な列だけを抽出する関数
} from "@/domain/club/event/event-month-copy-policy";
import {
  EVENT_MONTH_COPY_MAX_COUNT, // 前月予定の複製候補・選択件数の上限100件
  type EventMonthCopyEvent, // コピーするイベント1件あたりの型
} from "@/domain/club/event/event-month-copy-types";
import {
  hasClubFeature, //プランに応じて機能が有効かどうかを判定する
} from "@/domain/club/plan-features";
import {
  prisma, // サーバーDB接続用の共有Prisma Client
} from "@/src/infrastructure/prisma/client";
import type {
  EventMonthCopyFingerprintCandidate, // 元データ・変換結果・既存一致ID（重複したID）をまとめたサーバー用候補型
  EventMonthCopyFingerprintScope, // クラブ・所属・Auth本人の識別子をまとめた型
} from "@/src/infrastructure/security/event-month-copy-fingerprint";
import type {
  ClubMemberRole, // Prisma由来のクラブ所属ロール型： "OWNER" | "COACH" | "OFFICER" | "MEMBER"
} from "@/types/prisma";

/**
 * 最新認可から得たクラブ・所属・Auth本人の識別子と、複製先年月。
 */
export type EventMonthCopyPreviewDataInput = EventMonthCopyFingerprintScope & { // 認可scopeと対象月の結合型
  targetMonth: string; // 複製先YYYY-MMの文字列型
};

/**
 * Client表示へ変換する前のプレビューデータ結果の型。
 */
export type EventMonthCopyPreviewData = // 上限付き読取の成功・失敗を区別する型
  | { // 読取成功の材料をまとめる構造型
      outcome: "READY"; // 準備完了（0件を含む取得成功の型）
      targetMonth: string; // 複製先YYYY-MMの文字列型
      sourceMonth: string; // 複製元YYYY-MMの文字列型
      timezone: string; // 現在のDBから取得したクラブtimezoneの文字列型
      candidates: readonly EventMonthCopyFingerprintCandidate[]; // 本文を含むサーバー専用候補配列型
    }
  | { // 値を公開しない取得失敗の構造型
      outcome: "FORBIDDEN" | "TOO_MANY" | "PREVIEW_FAILED"; // 認可拒否・超過・安全な取得失敗の型
    };

  //コピーするイベント1件あたりの型を項目、値とするオブジェクトをCOPY_SELECTとする
const COPY_SELECT = Object.fromEntries( 
  EVENT_MONTH_COPY_FIELDS.map( // コピー項目名をselect値へ写すメソッド
    /**
     * コピー項目1つを、取得を許可するselectの組へ変換する。
     */
    (field) => [field, true], // 項目名からselectの組を返すコールバック
  ),
) as Record<keyof EventMonthCopyEvent, true>; //コピーするイベント1件あたりの型のキー（項目）とする。
//コピーするイベント1件あたりの型を項目、値とするオブジェクトとidと更新日のオブジェクトをSOURCE_SELECTとする
const SOURCE_SELECT = {
  ...COPY_SELECT,//コピーするイベント1件あたりの型を項目、値とするオブジェクト
  id: true,
  updatedAt: true,
} satisfies Prisma.ClubEventSelect; // コピー列・元ID・更新版だけのPrisma select型
// 全ロール名を項目とする配列をALL_ROLESとする
const ALL_ROLES = Object.keys(CLUB_MEMBER_ROLE_LABELS) as ClubMemberRole[]; 

/**
 * クラブがある地域の現地時間で月の始まり（月初）が、世界標準時（UTC）では一体何時になるのか逆算して作り出す関数
 */
function monthStart( // クラブ現地月初のUTC値を作る関数
  year: number, // 西暦年の数値型
  month: number, // 1〜12月の数値型
  timezone: string, // クラブtimezoneの文字列型
): Date { // 月初UTC日時の型
  const local = new TZDate(0, timezone); // timezone付き日時のコンストラクター
  local.setFullYear(year, month - 1, 1); //指定された年の、指定された月の、1日 午前0時00分00秒000
  local.setHours(0, 0, 0, 0); // 午前0時00分00秒000
  return new Date(local.getTime()); // UTC値を取得する
}

/**
 * 重複データを探し出すための、検索条件（Where条件）を自動で組み立てる関数
 * 余分なロールを持つ行も排除し、公開状態や関連行は条件に含めない。
 */
function duplicateWhere( // 既存イベントの完全一致検索条件を組み立てる関数
  clubId: string, // 認可対象クラブIDの文字列型
  event: EventMonthCopyEvent, // コピーするイベント1件あたりの型。
): Prisma.ClubEventWhereInput { // Prismaイベント検索条件の型
  const { targetRoles, ...columns } = pickEventMonthCopyEvent(event); // コピー列だけを検証・抽出する関数
  const roles = [...new Set(targetRoles)]; // ロールの重複を除く集合の生成
  if (roles.length === 0) {
    return {
      clubId,
      ...columns,
      targetRoles: {
        isEmpty: true,
      },
    };
  }
  const excludedRoles = ALL_ROLES.filter(
    /**
     * 候補のロール集合にないロールだけを残す。
     */
    (role) => !roles.includes(role), // 集合外か判定するコールバック / 配列の包含判定メソッド
  );
  return {
    clubId,
    ...columns,
    targetRoles: {
      hasEvery: roles,
    },
    NOT: {
      targetRoles: {
        hasSome: excludedRoles,//対象外ロールが一つも含まれないこと
      },
    },
  };
}

/**
 * 前月のイベントを翌月に丸ごと複製するための、事前プレビューデータ作成（重複チェック付き）関数
 * 本人認証、先月の年月を作成、重複を検出してClient表示へ変換する前のプレビューデータ結果にまとめる
 */
export async function findEventMonthCopyPreviewData( 
  input: EventMonthCopyPreviewDataInput, // 最新認可から得たクラブ・所属・Auth本人の識別子と、複製先年月。
  database: Prisma.TransactionClient = prisma, // 通常Clientまたは呼出し元transaction clientの型
): Promise<EventMonthCopyPreviewData> { //Client表示へ変換する前のプレビューデータ結果の型
  try {
    if (!isEventMonthCopyTargetMonth(input.targetMonth)) { // 対象月を厳密に検証する関数
      return { outcome: "PREVIEW_FAILED" };
    }
    const actor = await database.clubMembership.findFirst({ // 最新の本人所属を取得するメソッド
      where: {
        id: input.membershipId,
        clubId: input.clubId,
        userId: input.userId,
        status: "ACTIVE",
      },
      select: {
        role: true,
        club: {
          select: {
            timezone: true,
            planType: true,
          },
        },
      },
    });
    if (
      !actor ||
      !isClubAdminRole(actor.role) || // 現在のロールが管理者か判定する関数
      !hasClubFeature(actor.club.planType, "CLUB_APP") // 現在のプランでアプリを使えるか判定する関数
    ) {
      return { outcome: "FORBIDDEN" };
    }
    const timezone = actor.club.timezone;
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0); // timezoneを検証する書式の生成 / 固定日時の書式化メソッド
    const year = Number(input.targetMonth.slice(0, 4)); // 年を取り出すメソッド（"2026-11"の最初の４つを抜き出す）
    const month = Number(input.targetMonth.slice(5, 7)); // 月を取り出すメソッド（"2026-11"の月の部分を抜き出す）
    const sourceYear = month === 1 ? year - 1 : year;
    const sourceMonthNumber = month === 1 ? 12 : month - 1;
    const sourceMonth =//元データの年月を"2026-09" という綺麗な「ハイフン区切りの文字列（テキスト）」に変換する
      `${String(sourceYear).padStart(4, "0")}-${String(sourceMonthNumber).padStart(2, "0")}`; // 年月の文字列化関数 / 桁を揃えるメソッド
    // 元DRAFTも取得対象にする確定方針に従い、status条件は設けない。
    const rows = await database.clubEvent.findMany({ // 先月（前月）のイベントデータをすべて取得
      where: {
        clubId: input.clubId,
        startAt: {
          gte: monthStart(sourceYear, sourceMonthNumber, timezone), // 前月の現地月初をUTCへ変換する関数
          lt: monthStart(year, month, timezone), // 対象月の現地月初をUTCへ変換する関数
        },
      },
      select: SOURCE_SELECT,//コピーするイベント1件あたりの型を項目、値とするオブジェクトとidと更新日の型
      orderBy: [
        { startAt: "asc" },
        { id: "asc" },
      ],
      take: EVENT_MONTH_COPY_MAX_COUNT + 1,
    });
    if (rows.length > EVENT_MONTH_COPY_MAX_COUNT) {
      return { outcome: "TOO_MANY" };
    }
    const candidates: EventMonthCopyFingerprintCandidate[] = []; //元データと日時変換結果の組と、既存イベントとの一致状態を加えた、サーバー内のpreview候補。
    const duplicateIds = new Map<string, string | null>(); // 重複検知用の箱を作成する
    for (const row of rows) {
      const source = {
        ...pickEventMonthCopyEvent(row), // コピー列だけを検証・抽出する関数
        id: row.id,
        updatedAt: new Date(row.updatedAt.getTime()), // 更新版Dateの生成 / UTC値を取得するメソッド
      };
      const dateTimes = convertEventMonthCopyDateTimes(source, timezone); // 前月イベントの日時だけを1か月先へ変換する関数
      let duplicateEventId: string | null = null; // 既存一致IDまたは未一致の型（デフォルトはnull）
      if (dateTimes.success) {
        const converted = {
          ...source,
          ...dateTimes.converted,
        };
        const key = buildEventMonthCopyKey(converted); //1件のイベントデータからコピー対象となる項目を検証・抽出した上で、1本の文字列に変換する関数
        //
        const cached = duplicateIds.get(key); //コピー対象の全データの一本の文字列を照合して重複を探す
        if (cached !== undefined) {//重複がある場合は以下、
          duplicateEventId = cached;
        } else {//その他は以下、
          const duplicate = await database.clubEvent.findFirst({ // 一致行を最大1件だけ取得する
            where: duplicateWhere(input.clubId, converted), // 重複データを探し出すための、検索条件（Where条件）を自動で組み立てる関数
            select: {
              id: true,
            },
            orderBy: {
              id: "asc",
            },
          });
          duplicateEventId = duplicate?.id ?? null;
          duplicateIds.set(key, duplicateEventId); //重複の検索結果をduplicateIdsに記録し、重複による2回目の登場でconst cached = duplicateIds.get(key);で検出されるようにする
        }
      }
      candidates.push({ // 元データ・変換結果・既存一致IDを追加するメソッド
        source,
        dateTimes,
        duplicateEventId,
      });
    }
    return {
      outcome: "READY",//準備完了
      targetMonth: input.targetMonth,
      sourceMonth,
      timezone,
      candidates,
    };
  } catch {
    return { outcome: "PREVIEW_FAILED" };
  }
}
