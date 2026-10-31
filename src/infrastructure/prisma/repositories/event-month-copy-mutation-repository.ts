// src/infrastructure/prisma/repositories/event-month-copy-mutation-repository.ts
// 前月のイベントを翌月に一括コピーして、その『完了記録』をDBに安全に保存する
//プレビューを見ている間に誰もDB情報をいじってないかを確かめる機能付き
import "server-only";

import { Prisma } from "@prisma/client";

import {
  isClubAdminRole, // OWNER・COACH・OFFICERか判定する関数
} from "@/domain/club/club-member-role";
import {
  validateEventMonthCopyInput, // 複製入力の構造検証と正規化を行う関数
} from "@/domain/club/event/event-month-copy-form";
import {
  findEventMonthCopyCandidateDuplicates, //コピーしようとしているコピー候補同士の中で、全く同じ内容のものが重複していないか確認し、あれば重複同士のデータを返す
} from "@/domain/club/event/event-month-copy-policy";
import {
  EVENT_MONTH_COPY_MAX_COUNT, // 複製候補・選択件数の上限100件
  type EventMonthCopyInput, // 検証・正規化済みの前月予定イベントの複製の入力型
  type EventMonthCopyResult, //前月イベント複製処理がすべて終わってカレンダーとDBに新しくデータが作成された結果
} from "@/domain/club/event/event-month-copy-types";
import {
  hasClubFeature, // 現在のプランで機能を利用できるか判定する関数
} from "@/domain/club/plan-features";
import {
  prisma, // サーバーDB接続用の共有Prisma Client
} from "@/src/infrastructure/prisma/client";
import {
  buildEventMonthCopyFingerprint, // プレビュー画面の状態を完璧に表すハッシュ値を1つ発行する関数
  buildEventMonthCopyInputHash, // リクエストハッシュを作成する関数（連打でダブったり途中で改ざんされたりしていないかを防衛する）
  type EventMonthCopyFingerprintCandidate, // 元データ・変換結果・既存一致IDを持つ候補型
  type EventMonthCopyFingerprintScope, // 認証済みクラブ・所属・Auth本人の識別子型
} from "@/src/infrastructure/security/event-month-copy-fingerprint";
import {
  findEventMonthCopyPreviewData, //事前プレビューデータ作成（重複チェック付き）関数 
} from "./event-month-copy-read-repository";

const OPERATION = "COPY_PREVIOUS_MONTH";//前月のコピー処理
const MAX_TRANSACTION_RETRIES = 3;//トランザクション処理の最大試行数（3回）
const TRANSACTION_OPTIONS = {//トランザクションの実行の際の追加設定（書き込みエラーや同時操作バグを防ぐ）
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable, //1人ずつ順番に、完全に並んで処理する
  maxWait: 5000,//トランザクション処理が開始する最大待ち時間（5秒）
  timeout: 30000,//トランザクション処理の制限時間（30秒）
};

/**
 * callback内の検証で全件rollback（エラーなどで処理を始める前の綺麗な状態に戻す）を要求するときだけ使う
 */
class BatchRollbackError extends Error {} // rollback完了後の固定失敗へ変換する例外型 / 組込みError型

/**
 * DB更新前・再送照合前に、DBから現在の所属・本人・クラブ情報を取得し、管理者ロール・利用可能プランを検証する。
 */
async function isCurrentActor( // 現在の管理者権限をDBで再確認する関数
  transaction: Prisma.TransactionClient, // 保存または照合に使用するtransaction client型
  scope: EventMonthCopyFingerprintScope, //最新認可から得たクラブ・所属・Auth本人の識別子
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
 * DBにこれから書き加える前月イベント複製処理のデータがすでにあるかを確認する関数
 * 二重送信防止のため
 */
async function existingResult( // 完了済み操作を先行照合する関数
  transaction: Prisma.TransactionClient, // 再認可済みのtransaction client型
  scope: EventMonthCopyFingerprintScope, // 最新認可から得たクラブ・所属・Auth本人の識別子。 
  input: EventMonthCopyInput, // 検証・正規化済みの前月イベントの複製の入力型
  inputHash: string, // サーバー計算した入力SHA-256の文字列型
): Promise<EventMonthCopyResult | null> { // 前月イベント複製処理がすべて終わってカレンダーとDBに新しくデータが作成された結果
  const existing = await transaction.clubEventBatchOperation.findUnique({ // DBの前月イベント複製記録テーブルから1件のデータを取得する
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
  if (existing === null) {//存在する場合はnull。そのまま新規保存処理へ
    return null;
  }
  if (
    existing.clubId !== scope.clubId ||
    existing.requestId !== input.requestId ||
    existing.executedByMembershipId !== scope.membershipId ||
    existing.operation !== OPERATION ||//前月のコピー処理ではない
    existing.inputHash !== inputHash ||
    existing.targetMonth !== input.targetMonth ||
    !Number.isInteger(existing.createdCount) || // 保存済み件数が整数か検証するメソッド
    existing.createdCount < 1 ||
    existing.createdCount > EVENT_MONTH_COPY_MAX_COUNT ||
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
 * 画面で選択されたコピー候補（元データと日時変換結果）を、新しくDBへ保存する用にイベント作成データ一覧へと一括変換する関数（下書きで作成）
 */
function eventData( 
  scope: EventMonthCopyFingerprintScope, //最新認可から得たクラブ・所属・Auth本人の識別子
  selected: readonly EventMonthCopyFingerprintCandidate[], // 元データと日時変換結果の組と、既存イベントとの一致状態を加えた、サーバー内のpreview候補。
): Prisma.ClubEventCreateManyInput[] | null { // 明示した作成列の配列または検証失敗の型
  // 既存一致は明示選択を許可するが、選択した候補同士の完全一致は拒否する確定方針。
  if (findEventMonthCopyCandidateDuplicates(selected).length > 0) { //コピーしようとしているコピー候補同士の中で、全く同じ内容のものが重複していないか確認し、あれば重複同士のデータを返す
    return null;
  }
  const data: Prisma.ClubEventCreateManyInput[] = []; // サーバー計算値だけを保持する作成列配列型
  for (const candidate of selected) {
    if (
      !candidate.dateTimes.success ||
      !candidate.source.targetRoles.includes("OWNER") 
    ) {
      return null;
    }
    const source = candidate.source;
    const converted = candidate.dateTimes.converted;
    data.push({ // 関連行を含めず、コピー列と固定のサーバー値だけを追加するメソッド
      clubId: scope.clubId,
      title: source.title,
      content: source.content,
      genre: source.genre,
      targetRoles: [...source.targetRoles],
      startAt: converted.startAt,
      endAt: converted.endAt,
      isAllDay: source.isAllDay,
      location: source.location,
      meetingAt: converted.meetingAt,
      meetingLocation: source.meetingLocation,
      belongings: source.belongings,
      notes: source.notes,
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
 * 前月のイベントを翌月に一括コピーして、その『完了記録』をDBに安全に保存する関数（作成イベントは下書きとしてDBに保存）
 * P2034だけ初回後最大3回再試行し、P2002後は別transactionで再認可して記録だけ照合する。
 */
export async function createEventMonthCopyBatch( // 冪等な前月イベント複製の公開関数
  scope: EventMonthCopyFingerprintScope, // 最新認可から得たクラブ・所属・Auth本人の識別子
  input: EventMonthCopyInput, //検証・正規化済みの前月予定イベントの複製の入力型
): Promise<EventMonthCopyResult> { //前月イベント複製処理がすべて終わってカレンダーとDBに新しくデータが作成された結果
  const validation = validateEventMonthCopyInput(input); //前月複製イベントの入力値を検証する関数
  if (!validation.success) {
    return { outcome: "VALIDATION_FAILED" };
  }
  const normalized = validation.data;
  let actorScope: EventMonthCopyFingerprintScope; // 最新認可から得たクラブ・所属・Auth本人の識別子
  let inputHash: string; // サーバー計算した実行入力ハッシュの文字列型
  try {
    actorScope = {// 以下、最新認可から得たクラブ・所属・Auth本人の識別子を全て小文字にする
      clubId: scope.clubId.toLowerCase(), 
      membershipId: scope.membershipId.toLowerCase(), 
      userId: scope.userId.toLowerCase(), 
    };
    inputHash = buildEventMonthCopyInputHash(actorScope, normalized); //リクエストハッシュを作成する関数
  } catch {
    return { outcome: "FORBIDDEN" };
  }
  let retries = 0;//トランザクション処理の試行数
  let existingOnly = false;//全て（下書きを含む）を対象とする場合はfalse、既存の公開イベントのみを対象とする場合はtrue
  while (true) {//ループ処理
    let attemptedWrite = false;//DBに書き込んだかを記録するフラグ
    try {
      return await prisma.$transaction( // 完了記録とイベント群を一体で扱うtransactionメソッド
        /**
         * 最新権限・完了記録を先行照合し、新規操作だけpreviewを再取得して一体保存する。
         */
        async (transaction): Promise<EventMonthCopyResult> => { //前月イベント複製処理がすべて終わってカレンダーとDBに新しくデータが作成された結果を戻り値とする
          if (!await isCurrentActor(transaction, actorScope)) { // DB更新前・再送照合前に、DBから現在の所属・本人・クラブ情報を取得し、管理者ロール・利用可能プランを検証する。
            return { outcome: "FORBIDDEN" };
          }
          const existing = await existingResult( //DBにこれから書き加える前月イベント複製処理のデータがすでにあるかを確認する関数
            transaction,
            actorScope,
            normalized,
            inputHash,
          );
          if (existing !== null) {//すでにデータがDBに存在するなら存在するデータを返す
            return existing;
          }
          if (existingOnly) {//既存の公開イベントのみを対象とする場合は、衝突とする
            return { outcome: "CONFLICT" };
          }
          const preview = await findEventMonthCopyPreviewData({ //【保存段階で再度実行する！データ更新されてないかの照合のため】事前プレビューデータ作成（重複チェック付き）関数
            ...actorScope,
            targetMonth: normalized.targetMonth,
          }, transaction);
          if (preview.outcome !== "READY") {//結果が準備完了ではないなら
            if (preview.outcome === "FORBIDDEN") {
              return { outcome: "FORBIDDEN" };
            }
            return {
              outcome: preview.outcome === "TOO_MANY" ? "PREVIEW_CHANGED" : "CREATE_FAILED",
            };
          }
          const fingerprint = buildEventMonthCopyFingerprint({ // 【保存段階で再度実行する！データ更新されてないかの照合のため】プレビュー画面の状態を完璧に表すハッシュ値を1つ発行する関数
            ...actorScope,
            targetMonth: preview.targetMonth,
            timezone: preview.timezone,
            candidates: preview.candidates,
          });
          if (fingerprint !== normalized.previewFingerprint) {///プレビューを見ている間に他者が「複製しようとしている全く同じイベント」をDBに追加（入力値との重複に当てはまる）してないかを確かめる
            return { outcome: "PREVIEW_CHANGED" };
          }
          const byId = new Map( // 現在の前月候補をIDで引くMapを生成する
            preview.candidates.map( // 候補からIDとデータの組へ変換するメソッド
              /**
               * DB由来の元IDを小文字に揃えて、現在候補の検索用の組を作る。
               */
              (candidate) => [candidate.source.id.toLowerCase(), candidate] as const, // コピー候補をキー（id）と値のオブジェクトに変換する（キーは小文字化する)
            ),
          );
          const selected: EventMonthCopyFingerprintCandidate[] = []; //元データと日時変換結果の組と、既存イベントとの一致状態を加えた、サーバー内のpreview候補。
          for (const id of normalized.selectedEventIds) {
            const candidate = byId.get(id); // 入力値のIDからコピー候補を取得する
            if (!candidate) {
              return { outcome: "VALIDATION_FAILED" };
            }
            selected.push(candidate); // 現在の候補だけを選択配列へ追加する
          }
          const data = eventData(actorScope, selected); //画面で選択されたコピー候補（元データと日時変換結果）を、新しくDBへ保存する用にイベント作成データ一覧へと一括変換する関数（下書きで作成）
          if (
            data === null ||
            data.length === 0 ||
            data.length > EVENT_MONTH_COPY_MAX_COUNT
          ) {
            return { outcome: "VALIDATION_FAILED" };
          }
          attemptedWrite = true;//DBに書き込んだかを記録するフラグ
          const inserted = await transaction.clubEvent.createMany({ // eventDataで作成した下書きデータをDBのクラブイベントテーブルに新規作成する
            data,
            skipDuplicates: false,//すでに同じデータがある場合はエラーせずにスキップする
          });
          if (inserted.count !== data.length) {//保存件数が同じかどうか
            throw new BatchRollbackError(); //全件rollback（エラーなどで処理を始める前の綺麗な状態に戻す）を要求するときだけ使う
          }
          await transaction.clubEventBatchOperation.create({ // 同一transaction内で下書きデータをclubEventBatchOperationテーブルに新規作成完了とする
            data: {
              clubId: actorScope.clubId,
              requestId: normalized.requestId,
              operation: OPERATION,//前月のコピー処理
              targetMonth: normalized.targetMonth,
              inputHash,
              executedByMembershipId: actorScope.membershipId,
              createdCount: inserted.count,
              completedAt: new Date(), // 保存完了時刻のDate生成
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
      if (error instanceof BatchRollbackError) { //全件rollback（エラーなどで処理を始める前の綺麗な状態に戻す）を要求するときだけ使う
        return { outcome: "CREATE_FAILED" };
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) { // Prisma既知エラーの型判定
        if (error.code === "P2034") {
          if (retries < MAX_TRANSACTION_RETRIES) {//トランザクション処理の最大試行数（3回）
            retries += 1;
            continue;
          }
          return { outcome: "RESULT_UNKNOWN" };
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
