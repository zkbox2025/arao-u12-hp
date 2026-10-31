// src/infrastructure/prisma/repositories/event-practice-batch-mutation-repository.ts
// 最新認可・完了記録の先行照合・再preview・下書き全件保存を同一transactionで行う。

import "server-only";

import { Prisma } from "@prisma/client";

import {
  isClubAdminRole, // 管理者(OWNER / COACH / OFFICER)かどうか判定する関数
} from "@/domain/club/club-member-role";
import {
  validateEventPracticeBatchInput, // 定期練習生成の保存する段階の入力値を検証・正規化する関数
} from "@/domain/club/event/event-practice-batch-form";
import {
  buildEventPracticeBatchEvent, // 定期練習の入力値とUTC日時(開始時間、終了時間、集合時間)からコピーするイベント1件あたりの型を返す
} from "@/domain/club/event/event-practice-batch-policy";
import {
  EVENT_PRACTICE_BATCH_MAX_COUNT, // 定期練習作成の最大件数31件
  type EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力値の型。
  type EventPracticeBatchInput, // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
  type EventPracticeBatchResult, // 定期練習の保存結果の型
} from "@/domain/club/event/event-practice-batch-types";
import {
  hasClubFeature, // 現在のプランで機能を利用できるか判定する関数
} from "@/domain/club/plan-features";
import {
  prisma, // サーバーDB接続用の共有Prisma Client
} from "@/src/infrastructure/prisma/client";
import {
  buildEventPracticeBatchFingerprint, // 定期練習生成のプレビュー段階の入力値が正しいか検証し、現在のpreview内容の照合値（フィンガープリント）を返す関数。
  buildEventPracticeBatchInputHash, // リクエストハッシュを作成する関数 
  type EventPracticeBatchFingerprintCandidate, // 定期練習の日時候補と重複イベントID
  type EventPracticeBatchFingerprintScope, // クラブ・実行所属・Auth本人の識別情報型
} from "@/src/infrastructure/security/event-practice-batch-fingerprint";
import {
  findEventPracticeBatchPreviewData, //定期練習生成のプレビュー前の入力値を検証し、日時候補を生成し、プレビュー表示情報の生成結果を返す関数
} from "./event-practice-batch-read-repository";

const OPERATION = "CREATE_PRACTICE_BATCH";//定期練習作成
const MAX_TRANSACTION_RETRIES = 3; // トランザクションの最大再試行回数（3回）
const TRANSACTION_OPTIONS = {//トランザクションの実行の際の追加設定（書き込みエラーや同時操作バグを防ぐ）
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable, //1人ずつ順番に、完全に並んで処理する
  maxWait: 5000,//トランザクション処理が開始する最大待ち時間（5秒）
  timeout: 30000,//トランザクション処理の制限時間（30秒）
};

/**
 * callback内の検証で全件rollback（エラーなどで処理を始める前の綺麗な状態に戻す）を要求するときだけ使う
 */
class BatchRollbackError extends Error {} 

/**
 * DB更新前・再送照合前に、DBから現在の所属・本人・クラブ情報を取得し、管理者ロール・利用可能プランを検証する。
 */
async function isCurrentActor( // 現在の管理者権限をDBで再確認する関数
  transaction: Prisma.TransactionClient, // 保存または照合に使用するtransaction client型
  scope: EventPracticeBatchFingerprintScope, //最新認可から得たクラブ・所属・Auth本人の識別子
): Promise<boolean> { // 認可結果を返す非同期の真偽値型
  const actor = await transaction.clubMembership.findFirst({ // 操作者のアクティブな最新所属を1件取得するメソッド
    where: {
      id: scope.membershipId,
      clubId: scope.clubId,
      userId: scope.userId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      clubId: true,
      userId: true,
      status: true,
      role: true,
      club: {
        select: {
          id: true,
          planType: true,
        },
      },
    },
  });
  return (
    actor !== null &&
    actor.id === scope.membershipId &&
    actor.clubId === scope.clubId &&
    actor.userId === scope.userId &&
    actor.status === "ACTIVE" &&
    actor.club.id === scope.clubId &&
    isClubAdminRole(actor.role) && // 現在のロールが管理者か判定する関数
    hasClubFeature(actor.club.planType, "CLUB_APP") // 現在のプランでアプリを利用できるか判定する関数
  );
}

/**
 * DBにこれから書き加える定期練習作成のデータがすでにあるかを確認する関数
 * 二重送信防止のため
 */
async function existingResult( // 完了済み操作を先行照合する関数
  transaction: Prisma.TransactionClient, // 再認可済みのtransaction client型
  scope: EventPracticeBatchFingerprintScope, // 最新認可から得たクラブ・所属・Auth本人の識別子。
  input: EventPracticeBatchInput, // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
  inputHash: string, // サーバー計算した入力SHA-256の文字列型
): Promise<EventPracticeBatchResult | null> { // 定期練習の保存結果型
  const existing = await transaction.clubEventBatchOperation.findUnique({ // DBの定期練習作成記録テーブルから1件のデータを取得する
    where: {
      clubId_requestId: {
        clubId: scope.clubId,
        requestId: input.requestId,
      },
    },
    select: {
      clubId: true,
      requestId: true,
      executedByMembershipId: true,
      operation: true,
      inputHash: true,
      targetMonth: true,
      createdCount: true,
      completedAt: true,
    },
  });
  if (existing === null) {// 未保存の場合だけ新規保存処理へ進む
    return null;
  }
  if (
    existing.clubId !== scope.clubId ||
    existing.requestId !== input.requestId ||
    existing.executedByMembershipId !== scope.membershipId ||
    existing.operation !== OPERATION ||//定期練習一括作成ではない
    existing.inputHash !== inputHash ||
    existing.targetMonth !== input.targetMonth ||
    !Number.isInteger(existing.createdCount) || // 保存済み件数が整数か検証するメソッド
    existing.createdCount < 1 ||
    existing.createdCount > EVENT_PRACTICE_BATCH_MAX_COUNT ||
    existing.createdCount !== input.selectedDates.length ||
    !(existing.completedAt instanceof Date) || // 保存済み完了日時のDate型判定
    !Number.isFinite(existing.completedAt.getTime()) // 完了日時の有限値検証・UTC値取得メソッド
  ) {
    return { outcome: "CONFLICT" };//衝突
  }
  return {
    outcome: "ALREADY_COMPLETED",//すでに同じDB処理が完了している
    receipt: {
      targetMonth: existing.targetMonth,
      createdCount: existing.createdCount,
    },
  };
}

/**
 * 画面で選択されたコピー候補（入力値や定期練習の日時候補、選択日）を、新しくDBへ保存する用にイベント作成データ一覧へと一括変換する関数（下書きで作成）
 */
function eventData( // 選択日を固定列の一括作成データへ変換する関数
  scope: EventPracticeBatchFingerprintScope, // 認可済みクラブ・実行所属・Auth本人の識別情報型
  input: EventPracticeBatchCommonInput, // 正規化済みの定期練習共通入力型
  selectedDates: readonly string[], // 検証済み選択日の文字列配列型
  candidates: readonly EventPracticeBatchFingerprintCandidate[], // 再取得した全候補の配列型
): Prisma.ClubEventCreateManyInput[] | null { // 作成列配列または選択不正を表すnull型
  const byDate = new Map( // 候補日付と全候補のオブジェクトを作成する
    candidates.map( // 日付と候補の組へ変換するメソッド
      /**
       * 現在の候補日とサーバー生成値を対応付ける。
       */
      (candidate) => [candidate.date, candidate] as const, 
    ),
  );
  const data: Prisma.ClubEventCreateManyInput[] = []; // 戻り値の箱を作成する（複数いれれる）
  for (const date of selectedDates) {
    const candidate = byDate.get(date); // 選択日から現在の候補を出す
    if (
      !candidate ||
      candidate.dates === null ||
      candidate.exclusionReason !== null
    ) {
      return null;
    }
    const event = buildEventPracticeBatchEvent(input, candidate.dates); // 定期練習の入力値とUTC日時(開始時間、終了時間、集合時間)からコピーするイベント1件あたりの型を返す
    data.push({ // 下書き作成列を戻り値の箱に追加するメソッド
      clubId: scope.clubId,
      title: event.title,
      content: null,
      genre: "PRACTICE",
      targetRoles: [...event.targetRoles],
      startAt: event.startAt,
      endAt: event.endAt,
      isAllDay: false,
      location: event.location,
      meetingAt: event.meetingAt,
      meetingLocation: event.meetingLocation,
      belongings: null,
      notes: null,
      status: "DRAFT",
      firstPublishedAt: null,
      readRequiredAt: null,
      createdByMembershipId: scope.membershipId,
      updatedByMembershipId: scope.membershipId,
    });
  }
  return data;
}

/**
 * 定期練習を一括作成して、その『完了記録』をDBに安全に保存する関数（作成イベントは下書きとしてDBに保存）
 * P2034は初回後最大3回だけ再試行し、P2002後は再認可と記録照合だけを行う。
 */
export async function createEventPracticeBatch( 
  scope: EventPracticeBatchFingerprintScope, // 認可済みクラブ・実行所属・Auth本人の識別情報型
  input: EventPracticeBatchInput, //定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
): Promise<EventPracticeBatchResult> { // 固定の保存結果を返す非同期型
  const validation = validateEventPracticeBatchInput(input); //定期練習生成の保存する段階の入力値を検証・正規化する関数
  if (!validation.success) {
    return { outcome: "VALIDATION_FAILED" };
  }
  const normalized = validation.data;
  const {
    selectedDates,
    requestId,
    previewFingerprint,
    ...commonInput
  } = normalized;
  let actorScope: EventPracticeBatchFingerprintScope; // 最新認可から得るクラブ・実行所属・Auth本人の識別情報の型
  let inputHash: string; // 入力照合値の文字列型
  try {
    actorScope = {
      clubId: scope.clubId.toLowerCase(), // クラブIDを小文字へ揃えるメソッド
      membershipId: scope.membershipId.toLowerCase(), // 所属IDを小文字へ揃えるメソッド
      userId: scope.userId.toLowerCase(), // Auth本人IDを小文字へ揃えるメソッド
    };
    inputHash = buildEventPracticeBatchInputHash(actorScope, normalized); // リクエストハッシュを作成する関数
  } catch {
    return { outcome: "FORBIDDEN" };
  }
  let retries = 0;//トランザクションの試行回数
  let existingOnly = false; //全て（下書きを含む）を対象とする場合はfalse、既存の公開イベントのみを対象とする場合はtrue
  while (true) {//ループ処理
    let attemptedWrite = false;//DBに書き込んだかを記録するフラグ
    try {
      return await prisma.$transaction( 

        async (transaction): Promise<EventPracticeBatchResult> => { //定期練習の保存結果の型
          if (!await isCurrentActor(transaction, actorScope)) { // 最新所属・本人・クラブ・管理権限・プランを検証する関数
            return { outcome: "FORBIDDEN" };
          }
          const existing = await existingResult( //DBにこれから書き加える定期練習作成のデータがすでにあるかを確認する関数
            transaction,
            actorScope,
            normalized,
            inputHash,
          );
          if (existing !== null) {
            return existing;
          }
          if (existingOnly) {//既存の公開イベントのみを対象とする場合は、衝突とする
            return { outcome: "CONFLICT" };
          }
          const preview = await findEventPracticeBatchPreviewData({ // 【保存段階で再度実行する！データ更新されてないかの照合のため】定期練習生成のプレビュー前の入力値を検証し、日時候補を生成し、プレビュー表示情報の生成結果を返す関数
            ...actorScope,
            input: commonInput,
          }, transaction);
          if (preview.outcome !== "READY") {
            if (preview.outcome === "FORBIDDEN") {
              return { outcome: "FORBIDDEN" };
            }
            return {
              outcome: preview.outcome === "TOO_MANY" ? "PREVIEW_CHANGED" : "CREATE_FAILED",
            };
          }
          const fingerprint = buildEventPracticeBatchFingerprint({ //【保存段階で再度実行する！データ更新されてないかの照合のため】定期練習生成のプレビュー段階の入力値が正しいか検証し、現在のpreview内容の照合値（フィンガープリント）を返す関数。
            ...actorScope,
            input: commonInput,
            timezone: preview.timezone,
            candidates: preview.candidates,
          });
          if (fingerprint !== previewFingerprint) {//プレビューを見ている間に他者が「複製しようとしている全く同じ練習イベント」をDBに追加（入力値との重複に当てはまる）してないかを確かめる
            return { outcome: "PREVIEW_CHANGED" };
          }
          const data = eventData( // 画面で選択されたコピー候補（入力値や定期練習の日時候補、選択日）を、新しくDBへ保存する用にイベント作成データ一覧へと一括変換する関数（下書きで作成）
            actorScope,
            commonInput,
            selectedDates,
            preview.candidates,
          );
          if (
            data === null ||
            data.length === 0 ||
            data.length > EVENT_PRACTICE_BATCH_MAX_COUNT
          ) {
            return { outcome: "VALIDATION_FAILED" };
          }
          attemptedWrite = true;
          const inserted = await transaction.clubEvent.createMany({ // 選択した下書き群を一括保存するメソッド
            data,
            skipDuplicates: false,
          });
          if (inserted.count !== data.length) {
            throw new BatchRollbackError(); // callback内の検証で全件rollback（エラーなどで処理を始める前の綺麗な状態に戻す）を要求するときだけ使う
          }
          await transaction.clubEventBatchOperation.create({ // 同一transaction内で下書きデータをclubEventBatchOperationテーブルに新規作成完了とする
            data: {
              clubId: actorScope.clubId,
              requestId,
              operation: OPERATION,
              targetMonth: normalized.targetMonth,
              inputHash,
              executedByMembershipId: actorScope.membershipId,
              createdCount: inserted.count,
              completedAt: new Date(), // 完了日時を生成するコンストラクター
            },
            select: {
              id: true,
            },
          });
          return {
            outcome: "CREATED",
            receipt: {
              targetMonth: normalized.targetMonth,
              createdCount: inserted.count,
            },
          };
        },
        TRANSACTION_OPTIONS,//トランザクションの実行の際の追加設定（書き込みエラーや同時操作バグを防ぐ）
      );
    } catch (error) {
      if (error instanceof BatchRollbackError) { //callback内の検証で全件rollback（エラーなどで処理を始める前の綺麗な状態に戻す）を要求するときだけ使う
        return { outcome: "CREATE_FAILED" };
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) { // Prisma既知エラー型の判定
        if (error.code === "P2034") {
          if (retries < MAX_TRANSACTION_RETRIES) {// トランザクションの最大再試行回数（3回）より少ない場合は以下
            retries += 1;
            continue;
          }
          return { outcome: "RESULT_UNKNOWN" };//多い場合はこれ
        }
        if (
          error.code === "P2002" &&
          attemptedWrite &&//DBに書き込んだかを記録するフラグ
          !existingOnly//全てのイベント（下書きを含む）を対象とする
        ) {
          existingOnly = true;//既存の公開イベントのみを対象とする
          continue;
        }
      }
      return {
        outcome: attemptedWrite || existingOnly ? "RESULT_UNKNOWN" : "CREATE_FAILED",
      };
    }
  }
}
