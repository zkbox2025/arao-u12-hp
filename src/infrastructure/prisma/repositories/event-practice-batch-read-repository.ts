// src/infrastructure/prisma/repositories/event-practice-batch-read-repository.ts
// 定期練習生成のプレビュー前の入力値を検証し、日時候補を生成し、プレビュー表示情報の生成結果を返す

import "server-only";

import type { Prisma } from "@prisma/client";

import {
  isClubAdminRole, // 管理者ロールか判定する関数
} from "@/domain/club/club-member-role";
import {
  generateEventPracticeBatchDateTimes, // 入力値とクラブtimezoneから最大31日の日時候補を生成する関数
} from "@/domain/club/event/event-practice-batch-date-times";
import {
  validateEventPracticeBatchPreviewInput, // プレビュー準備段階の入力値だけを検証・正規化する関数
} from "@/domain/club/event/event-practice-batch-form";
import {
  buildEventPracticeBatchEvent, // 定期練習の入力値とUTC日時(開始時間、終了時間、集合時間)からコピーするイベント1件あたりの型を返す
} from "@/domain/club/event/event-practice-batch-policy";
import {
  EVENT_PRACTICE_BATCH_MAX_COUNT, // 定期練習作成の最大件数31件
  type EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力型
} from "@/domain/club/event/event-practice-batch-types";
import {
  hasClubFeature, // プランに応じて機能が有効か判定する関数
} from "@/domain/club/plan-features";
import {
  prisma, // サーバーDB接続用の共有Prisma Client
} from "@/src/infrastructure/prisma/client";
import type {
  EventPracticeBatchFingerprintCandidate, // 定期練習の日時候補と重複イベントID
  EventPracticeBatchFingerprintScope, // クラブ・実行所属・Auth本人の識別情報型
} from "@/src/infrastructure/security/event-practice-batch-fingerprint";
import {
  findClubEventExactDuplicateId, // クラブ内のコピー対象列・ロール集合が完全一致する代表IDを取得する関数
} from "./club-event-exact-duplicate-repository";

/**
 * 認可済みscopeと、previewで生成する定期練習の共通入力をまとめた型。
 */
export type EventPracticeBatchPreviewDataInput = EventPracticeBatchFingerprintScope & { // 認可scopeと入力値を結合する型
  input: EventPracticeBatchCommonInput; // 正規化対象の定期練習共通入力型
};

/**
 * プレビュー表示前の、表示情報の取得結果
 */
export type EventPracticeBatchPreviewData = 
  | {
      outcome: "READY"; // 読取成功を表すリテラル型
      input: EventPracticeBatchCommonInput; // 検証・正規化済み共通入力型
      timezone: string; // 現在のクラブtimezoneの文字列型
      candidates: readonly EventPracticeBatchFingerprintCandidate[]; // 定期練習の日時候補と重複イベントID
      candidateCount: number; // 除外前の候補件数の数値型
      selectableCount: number; // 日時を生成できる候補件数の数値型
    }
  | {
      outcome: "FORBIDDEN" | "TOO_MANY" | "PREVIEW_FAILED"; // 認可拒否・件数超過・取得失敗の型
    };

/**
 * 定期練習生成のプレビュー前の入力値を検証し、日時候補を生成し、プレビュー表示情報の生成結果を返す関数
 * 重複チェックをすることでDBに追加予定のイベントが先に追加されてないかを確認する
 */
export async function findEventPracticeBatchPreviewData( // 認可と上限付きpreview読取を行う関数
  input: EventPracticeBatchPreviewDataInput, // 認可scopeと定期練習共通入力の型
  database: Prisma.TransactionClient = prisma, // 通常Clientまたは呼出し元transaction client型
): Promise<EventPracticeBatchPreviewData> { // プレビュー表示前の、表示情報の取得結果
  try {
    const validated = validateEventPracticeBatchPreviewInput(input.input); // プレビュー準備段階の入力値だけを検証・正規化する関数
    if (!validated.success) {
      return { outcome: "PREVIEW_FAILED" };
    }
    const actor = await database.clubMembership.findFirst({ // 唯一のアクティブユーザーのデータから役割とクラブ情報（タイムゾーンとプラン）を取得する
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
    const generated = generateEventPracticeBatchDateTimes(validated.data, timezone); // 入力値とクラブtimezoneで日時候補を生成する関数
    if (generated.outcome !== "READY") {
      return {
        outcome: generated.outcome === "TOO_MANY" ? "TOO_MANY" : "PREVIEW_FAILED",
      };
    }
    if (generated.items.length > EVENT_PRACTICE_BATCH_MAX_COUNT) {//取得件数が31日以上であれば以下
      return { outcome: "TOO_MANY" };
    }
    const candidates: EventPracticeBatchFingerprintCandidate[] = []; //定期練習の日時候補と重複イベントIDの箱をcandidatesとする
    for (const item of generated.items) {
      let duplicateEventId: string | null = null; // 重複IDの箱を作成する
      if (item.dates !== null) {
        const event = buildEventPracticeBatchEvent(validated.data, item.dates); //定期練習の入力値とUTC日時(開始時間、終了時間、集合時間)からコピーするイベント1件あたりの型を返す
        duplicateEventId = await findClubEventExactDuplicateId( // 渡されたClientで完全一致する代表イベントのIDだけを取得する。
          input.clubId,
          event,
          database,
        );
      }
      candidates.push({ // candidates（定期練習の日時候補と重複イベントIDの箱）にプッシュする
        
        ...item,
        duplicateEventId,
      });
    }
    return {
      outcome: "READY",
      input: validated.data,
      timezone,
      candidates,
      candidateCount: generated.candidateCount,
      selectableCount: generated.selectableCount,
    };
  } catch {
    return { outcome: "PREVIEW_FAILED" };
  }
}
