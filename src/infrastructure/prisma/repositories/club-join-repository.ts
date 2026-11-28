// src/infrastructure/prisma/repositories/club-join-repository.ts
// 参加リンクと、参加リンクからの申請のDB操作。確認メールのボタンが押されたときの、数字の発行も含む。
// 承認・却下はJ5、期限切れの整理(Cron)はJ6で追加する。
// 設計:docs/implementation/phases/member-join-link-plan.md

import "server-only";

import { randomInt as cryptoRandomInt } from "node:crypto"; // 暗号論的な乱数(整数)を作るNode標準の関数

import { Prisma } from "@prisma/client"; // Prismaのエラー型・トランザクションの型

import {
  CLUB_JOIN_OPEN_REQUEST_LIMIT_PER_LINK, // 1つの参加リンクで受け付ける進行中の申請の上限(300)
  createClubJoinCodeExpiry, // 数字の期限(発行から7日後)を作る関数
  createClubJoinConfirmationExpiry, // メール確認の期限(申請から24時間後)を作る関数
  createClubJoinLinkExpiry, // 参加リンクの有効期限(発行から30日後)を作る関数
  evaluateClubJoinConfirmation, // メール確認のボタンが押されたときの処理を判定する関数
  generateClubJoinVerificationCode, // 乱数から6桁の数字を作る関数
  isClubJoinTokenHash, // トークンのハッシュの形式を検査する関数
  resolveClubJoinRequestStatus, // 時刻を考慮して申請の状態を決める関数
  validateClubJoinApplicant, // 申請者の名前・メールを検証・正規化する関数
  type ClubJoinConfirmationDecision, // メール確認の判定結果の型
} from "@/domain/club/join/join-policy";
import { DomainError } from "@/domain/shared/domain-error"; // 画面表示可能なエラーのクラス
import { prisma } from "@/src/infrastructure/prisma/client"; // PrismaClient(DB接続)
import type {
  ClubJoinRequestStatus, // 申請の状態のenumの型（メール確認待ち、承認待ち、承認済み、却下、期限切れ）
  PlanType, // クラブのプランのenumの型
} from "@/types/prisma";

/** UUID(小文字・ハイフン区切り)の形式。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** 同時実行の衝突(シリアライズ失敗)の、やり直しの上限回数。 */
const SERIALIZATION_RETRY_LIMIT = 3;

/** 数字が他の申請と重なったときの、作り直しの上限回数。 */
const CODE_GENERATION_ATTEMPT_LIMIT = 10;

/** OWNERの操作に共通の入力。 */
type OwnerInput = {
  clubId: string; // 対象クラブのid(サーバーで認可済みの値。クライアントの入力ではない)
  actorMembershipId: string; // 操作するOWNERの所属id
  now?: Date; // 現在日時(試験で固定するための任意の値)
};

/** OWNERの操作が、権限なしで失敗した結果。 */
type ActorFailure = {
  outcome: "ACTOR_NOT_ACTIVE_OWNER"; // 操作者が、そのクラブの、ACTIVEなOWNERではない
};

/** 参加リンクの発行結果。 */
export type CreateClubJoinLinkResult =
  | {
      outcome: "CREATED"; // 発行できた
      link: { id: string; expiresAt: Date }; // 発行したリンクのidと有効期限
    }
  | ActorFailure;

/** 参加リンクの無効化結果。 */
export type RevokeClubJoinLinkResult =
  | {
      outcome: "REVOKED"; // 無効化の処理が完了した
      revokedCount: number; // 無効化したリンクの件数(有効なリンクがなければ0)
    }
  | ActorFailure;

/** 使える参加リンクの検索結果(クラブの情報つき)。 */
export type UsableClubJoinLink = {
  id: string; // リンクのid
  clubId: string; // クラブのid
  clubSlug: string; // クラブのURL識別子
  clubName: string; // クラブ名
  planType: PlanType; // クラブのプラン(アプリを使えるかの判定に使う)
  expiresAt: Date; // リンクの有効期限
};

/** 申請の作成結果。 */
export type CreateClubJoinRequestResult =
  | {
      outcome: "CREATED"; // 作成できた
      request: {
        id: string; // 申請のid
        confirmationExpiresAt: Date; // メール確認の期限
      };
    }
  | { outcome: "LINK_NOT_USABLE" } // リンクが、無効・期限切れ・他のクラブのもの
  | { outcome: "LIMIT_REACHED" } // 進行中の申請が、上限(300件)に達している
  | { outcome: "DUPLICATE_OPEN_REQUEST" }; // 同じ人・同じメールの進行中の申請がある

/** メール確認と数字の発行の結果。 */
export type ConfirmClubJoinRequestEmailResult =
  | {
      outcome: "ISSUED" | "ALREADY_ISSUED"; // 新しく発行した・発行済み(同じ数字を返す)
      verificationCode: string; // 6桁の数字
      codeExpiresAt: Date; // 数字の期限
    }
  | { outcome: "NOT_FOUND" } // 申請がない、または、確認したAuthユーザーと一致しない
  | {
      outcome: "REJECTED"; // 数字を発行できない
      violation: Extract<
        ClubJoinConfirmationDecision,
        { action: "REJECT" }
      >["violation"]; // 拒否の理由(期限切れなど)
    }
  | { outcome: "CODE_GENERATION_FAILED" }; // 数字が重なり続け、作れなかった

/** 本人の申請の表示用の情報。 */
export type OwnClubJoinRequest = {
  status: ClubJoinRequestStatus; // // 申請の状態のenumの型（メール確認待ち、承認待ち、承認済み、却下、期限切れ）
  createdAt: Date; // 申請の日時
  verificationCode: string | null; // 承認待ちで期限内のときだけ、数字
  codeExpiresAt: Date | null; // 数字の期限
};

/** OWNERの承認待ちの一覧の1行。 */
export type AwaitingClubJoinRequest = {
  id: string; // 申請のid
  name: string; // 保護者の名前
  email: string; // メールアドレス(OWNERだけに表示する)
  verificationCode: string; // 6桁の数字
  codeIssuedAt: Date; // 数字の発行日時
  codeExpiresAt: Date; // 数字の期限
};

/** 承認待ちの一覧の取得結果。 */
export type ListAwaitingClubJoinRequestsResult =
  | { outcome: "LISTED"; requests: AwaitingClubJoinRequest[] } // 一覧を取得できた
  | ActorFailure;

/** OWNER向けに表示する、現在の参加リンクの状態の結果。 */
export type ActiveClubJoinLinkSummaryResult =
  | {
      outcome: "FOUND"; // 取得できた
      link: { createdAt: Date; expiresAt: Date } | null; // 使えるリンク(なければnull)。生トークンは、保存していない
    }
  | ActorFailure;

/**
 * 同時実行の衝突(シリアライズ失敗)のとき、やり直すトランザクション。
 * @param operation トランザクションの中で行う処理。
 * @returns 処理の戻り値。
 */
async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>, // トランザクション内の処理の型
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // 最も厳格な分離レベル
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && // Prismaの既知のエラー型
        error.code === "P2034"; // 同時実行の衝突を表すコード

      if (!retryable || attempt + 1 >= SERIALIZATION_RETRY_LIMIT) {
        throw error;
      }
    }
  }
}

/**
 * 重複して保存しようとした違反(P2002)かを判定する。
 * @param error 捕まえたエラー。
 * @returns 一意制約違反ならtrue。
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && // Prismaの既知のエラー型
    error.code === "P2002" // 重複して保存しようとした違反を表すコード
  );
}

/**
 * 操作者が、そのクラブの、ACTIVEなOWNERかを確認する。
 * @param tx トランザクション。
 * @param input クラブidと操作者の所属id。
 * @returns OWNERならtrue。
 */
async function isActiveOwner(
  tx: Prisma.TransactionClient, // トランザクションのクライアントの型
  input: Pick<OwnerInput, "clubId" | "actorMembershipId">, // OWNERの入力の型
): Promise<boolean> {
  const actor = await tx.clubMembership.findFirst({ // 条件に合う所属を1件探すPrismaのメソッド
    where: {
      id: input.actorMembershipId,
      clubId: input.clubId,
      role: "OWNER",
      status: "ACTIVE",
    },
    select: { id: true }, // 存在確認だけなので、idのみ取得する
  });

  return actor !== null;
}

/**
 * 現在日時を決める(指定がなければ、実際の現在日時)。
 * @param input 現在日時を、任意で指定する入力。
 * @returns 正しい現在日時。
 */
function resolveNow(input: { now?: Date }): Date {
  const now = input.now ?? new Date(); // 現在日時を作る標準のDateコンストラクタ

  if (!Number.isFinite(now.getTime())) {
    throw new DomainError("VALIDATION", "日時を確認してください。"); // 画面表示可能なエラー
  }

  return now;
}

/**
 * トークンのハッシュの形式を検査し、不正なら例外にする。
 * @param tokenHash 参加リンクのトークンのSHA-256(小文字16進)。
 */
function assertTokenHash(tokenHash: string): void {
  if (!isClubJoinTokenHash(tokenHash)) {
    throw new DomainError("VALIDATION", "参加リンクの形式が正しくありません。"); // 画面表示可能なエラー
  }
}

/**
 * UUIDの形式を検査し、不正なら例外にする。
 * @param value 検査する値。
 */
function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new DomainError("VALIDATION", "値の形式が正しくありません。"); // 画面表示可能なエラー
  }
}

/**
 * 参加リンクをDBに作成する。既存のクラブの有効なリンクは、同じトランザクションで、無効化する(1クラブに1つ)。
 * 生のトークンは受け取らず、ハッシュだけを保存する。
 * @param input クラブid・OWNERの所属id・トークンのハッシュ(・現在日時)。
 * @returns 発行したリンクのidと有効期限。OWNERでなければ ACTOR_NOT_ACTIVE_OWNER。
 */
export async function createClubJoinLink(
  input: OwnerInput & { tokenHash: string }, // OWNERの入力にトークンのハッシュを足した型
): Promise<CreateClubJoinLinkResult> {
  assertTokenHash(input.tokenHash); // ハッシュの形式を検査する関数
  const now = resolveNow(input); // 現在日時を決める関数

  return serializableTransaction(async (tx) => { // 同時実行の衝突をやり直すトランザクション
    if (!(await isActiveOwner(tx, input))) { // OWNERかを確認する関数
      return { outcome: "ACTOR_NOT_ACTIVE_OWNER" as const };
    }

    await tx.clubJoinLink.updateMany({ // 条件に合う行を、まとめて更新するPrismaのメソッド
      where: { clubId: input.clubId, revokedAt: null },
      data: { revokedAt: now }, // 有効なリンクを、すべて無効化する
    });

    const link = await tx.clubJoinLink.create({ // 参加リンクを1件DBに作るPrismaのメソッド
      data: {
        clubId: input.clubId,
        tokenHash: input.tokenHash,
        expiresAt: createClubJoinLinkExpiry(now), // 有効期限を作る関数
        createdByMembershipId: input.actorMembershipId,
      },
      select: { id: true, expiresAt: true }, // 返すのは、idと有効期限だけ
    });

    return { outcome: "CREATED" as const, link };
  });
}

/**
 * DB内のクラブの有効な参加リンクを、無効化する。
 * @param input クラブid・OWNERの所属id(・現在日時)。
 * @returns 無効化した件数(有効なリンクがなければ0)。OWNERでなければ ACTOR_NOT_ACTIVE_OWNER。
 */
export async function revokeClubJoinLink(
  input: OwnerInput, // OWNERの入力の型
): Promise<RevokeClubJoinLinkResult> {
  const now = resolveNow(input); // 現在日時を決める関数

  return serializableTransaction(async (tx) => { // 同時実行の衝突をやり直すトランザクション
    if (!(await isActiveOwner(tx, input))) { // OWNERかを確認する関数
      return { outcome: "ACTOR_NOT_ACTIVE_OWNER" as const };
    }

    const result = await tx.clubJoinLink.updateMany({ // 条件に合う行を、まとめて更新するPrismaのメソッド
      where: { clubId: input.clubId, revokedAt: null },
      data: { revokedAt: now },
    });

    return { outcome: "REVOKED" as const, revokedCount: result.count };
  });
}

/**
 * トークンのハッシュから、いま、使える参加リンクを探す。読取りのみ。
 * 無効化・期限切れのリンクは、見つからない(nullを返す)。
 * @param input トークンのハッシュ(・現在日時)。
 * @returns リンクとクラブの情報。使えなければnull。
 */
export async function findUsableClubJoinLinkByTokenHash(input: {
  tokenHash: string; // 参加リンクのトークンのSHA-256(小文字16進)
  now?: Date; // 現在日時(試験で固定するための任意の値)
}): Promise<UsableClubJoinLink | null> {
  assertTokenHash(input.tokenHash); // ハッシュの形式を検査する関数
  const now = resolveNow(input); // 現在日時を決める関数

  const link = await prisma.clubJoinLink.findFirst({ // 条件に合うリンクを1件探すPrismaのメソッド
    where: {
      tokenHash: input.tokenHash,
      revokedAt: null,
      expiresAt: { gt: now }, // 期限内のものだけ
    },
    select: {
      id: true,
      clubId: true,
      expiresAt: true,
      club: { select: { slug: true, name: true, planType: true } }, // クラブの情報
    },
  });

  if (!link) {
    return null;
  }

  return {
    id: link.id,
    clubId: link.clubId,
    clubSlug: link.club.slug,
    clubName: link.club.name,
    planType: link.club.planType,
    expiresAt: link.expiresAt,
  };
}

/**
 * 参加リンクからの申請を作る(メール確認待ち)。
 * 同じ人・同じメールで、時刻だけ期限が過ぎた進行中の申請は、先に、EXPIREDにする(整理の前でも、再申請できる)。
 * @param input リンクid・クラブid・確認前のAuthユーザーid・メール・名前(・現在日時)。
 * @returns 作成した申請のidとメール確認の期限。条件に合わなければ、理由つきの失敗。
 */
export async function createClubJoinRequest(input: {
  linkId: string; // 使った参加リンクのid
  clubId: string; // リンクのクラブのid(リンクと一致しなければ、使えない)
  authUserId: string; // 作成した確認前のAuthユーザーのid
  email: string; // メールアドレス(正規化前でもよい)
  name: string; // 保護者の名前
  now?: Date; // 現在日時(試験で固定するための任意の値)
}): Promise<CreateClubJoinRequestResult> {
  assertUuid(input.authUserId); // UUIDの形式を検査する関数
  const applicant = validateClubJoinApplicant(input); // 名前・メールを検証・正規化する関数

  if (!applicant.success) {
    throw new DomainError("VALIDATION", "入力値を確認してください。"); // 画面表示可能なエラー
  }

  const now = resolveNow(input); // 現在日時を決める関数

  try {
    return await serializableTransaction(async (tx) => { // 同時実行の衝突をやり直すトランザクション
      const link = await tx.clubJoinLink.findFirst({ // 条件に合うリンクを1件探すPrismaのメソッド
        where: {
          id: input.linkId,
          clubId: input.clubId, // 他のクラブのリンクを、結べない
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });

      if (!link) {
        return { outcome: "LINK_NOT_USABLE" as const };
      }

      await tx.clubJoinRequest.updateMany({ // 期限切れを見つけて期限切れに更新する
        where: {
          clubId: input.clubId,
          OR: [
            { email: applicant.data.email },
            { authUserId: input.authUserId },
          ],
          AND: [
            {
              OR: [
                {
                  status: "AWAITING_EMAIL_CONFIRMATION",//確認待ち
                  confirmationExpiresAt: { lte: now },//期限切れ
                },
                {
                  status: "AWAITING_APPROVAL",//承認まち
                  codeExpiresAt: { lte: now },//期限切れ
                },
              ],
            },
          ],
        },
        data: { status: "EXPIRED" }, // 期限が過ぎた進行中の申請を、期限切れにする
      });

      const openCount = await tx.clubJoinRequest.count({ // 条件に合う行の数を数えるPrismaのメソッド
        where: {
          linkId: link.id,
          OR: [
            {
              status: "AWAITING_EMAIL_CONFIRMATION",//確認待ち
              confirmationExpiresAt: { gt: now },
            },
            {
              status: "AWAITING_APPROVAL",//承認まち
              codeExpiresAt: { gt: now },
            },
          ],
        },
      });

      if (openCount >= CLUB_JOIN_OPEN_REQUEST_LIMIT_PER_LINK) {
        return { outcome: "LIMIT_REACHED" as const };
      }

      const request = await tx.clubJoinRequest.create({ // 申請を1件作るPrismaのメソッド
        data: {
          clubId: input.clubId,
          linkId: link.id,
          authUserId: input.authUserId,
          email: applicant.data.email,
          name: applicant.data.name,
          confirmationExpiresAt: createClubJoinConfirmationExpiry(now), // 確認の期限を作る関数
        },
        select: { id: true, confirmationExpiresAt: true },
      });

      return { outcome: "CREATED" as const, request };
    });
  } catch (error) {
    if (isUniqueViolation(error)) { // 重複して保存しようとした違反かを判定する関数
      return { outcome: "DUPLICATE_OPEN_REQUEST" };
    }

    throw error;
  }
}

/**
 * メール確認のボタンが押されたとき、数字を発行する(発行済みなら、同じ数字を返す)。
 * 呼び出し側は、先に、Authで、メールの確認を完了し、そのユーザーidを渡す。
 * @param input 申請id・確認したAuthユーザーid(・現在日時・乱数の関数)。
 * @returns 数字と期限。申請がない・確認前のユーザーと一致しなければ NOT_FOUND。
 */
export async function confirmClubJoinRequestEmail(input: {
  requestId: string; // 申請のid
  authUserId: string; // メールの確認を完了したAuthユーザーのid
  now?: Date; // 現在日時(試験で固定するための任意の値)
  randomInt?: (min: number, max: number) => number; // 乱数の関数(試験で差し替える任意の値)
}): Promise<ConfirmClubJoinRequestEmailResult> {
  assertUuid(input.requestId); // UUIDの形式を検査する関数
  assertUuid(input.authUserId); // UUIDの形式を検査する関数
  const now = resolveNow(input); // 現在日時を決める関数
  const randomInt = input.randomInt ?? cryptoRandomInt; // 乱数の関数(既定は暗号論的な乱数)

  for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPT_LIMIT; attempt += 1) {
    try {
      return await serializableTransaction(async (tx) => { // 同時実行の衝突をやり直すトランザクション
        const request = await tx.clubJoinRequest.findFirst({ // 条件に合う申請を1件探すPrismaのメソッド
          where: { id: input.requestId, authUserId: input.authUserId },
          select: {
            clubId: true,
            status: true,
            confirmationExpiresAt: true,
            verificationCode: true,
            codeExpiresAt: true,
          },
        });

        if (!request) {
          return { outcome: "NOT_FOUND" as const };
        }

        const decision = evaluateClubJoinConfirmation(request, now); // メール確認のボタンが押されたときに、過去に確認されてるかどうかのステータスを見て、「有効期限が切れていなければ」数字を発行するか発行済みの数字を出すかを判定する関数

        if (decision.action === "REJECT") {
          return { outcome: "REJECTED" as const, violation: decision.violation };
        }

        if (decision.action === "REUSE") {
          return {
            outcome: "ALREADY_ISSUED" as const,
            verificationCode: request.verificationCode as string, // 承認待ちなら、必ず数字がある(SQL CHECK)
            codeExpiresAt: request.codeExpiresAt as Date, // 承認待ちなら、必ず期限がある(SQL CHECK)
          };
        }

        const verificationCode = generateClubJoinVerificationCode(randomInt); // 6桁の数字を作る関数
        const codeExpiresAt = createClubJoinCodeExpiry(now); // 数字の期限を作る関数

        const updated = await tx.clubJoinRequest.updateMany({ // 確認待ちを承認待ちに更新するPrismaのメソッド
          where: { id: input.requestId, status: "AWAITING_EMAIL_CONFIRMATION" },
          data: {
            status: "AWAITING_APPROVAL",
            emailConfirmedAt: now,
            verificationCode,
            codeIssuedAt: now,
            codeExpiresAt,
          },
        });

        if (updated.count !== 1) {
          return {
            outcome: "REJECTED" as const,
            violation: "NOT_AWAITING_CONFIRMATION" as const,
          };
        }

        return { outcome: "ISSUED" as const, verificationCode, codeExpiresAt };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) { // 重複して保存しようとした違反かを判定する関数
        throw error;
      }
    }
  }

  return { outcome: "CODE_GENERATION_FAILED" };
}

/**
 * 招待された人に表示するための申請の状態と数字を取得する(確認後の画面で、数字を再表示するため)。読取りのみ。
 * 期限が過ぎたものは、整理の前でも、EXPIREDとして返す。数字は、承認待ちで期限内のときだけ返す。
 * @param input クラブのURL識別子・ログイン中のAuthユーザーid(・現在日時)。
 * @returns 最新の申請。なければnull。
 */
export async function findClubJoinRequestForAuthUser(input: {
  clubSlug: string; // クラブのURL識別子
  authUserId: string; // ログイン中のAuthユーザーのid
  now?: Date; // 現在日時(試験で固定するための任意の値)
}): Promise<OwnClubJoinRequest | null> {
  assertUuid(input.authUserId); // UUIDの形式を検査する関数
  const now = resolveNow(input); // 現在日時を決める関数

  const request = await prisma.clubJoinRequest.findFirst({ // 条件に合う申請を1件探すPrismaのメソッド
    where: { authUserId: input.authUserId, club: { slug: input.clubSlug } },
    orderBy: { createdAt: "desc" }, // 最新の申請
    select: {
      status: true,
      createdAt: true,
      confirmationExpiresAt: true,
      verificationCode: true,
      codeExpiresAt: true,
    },
  });

  if (!request) {
    return null;
  }

  const status = resolveClubJoinRequestStatus(request, now); // 時刻を考慮した状態を決める関数
  const showCode = status === "AWAITING_APPROVAL"; // 数字を見せるのは、承認待ちで期限内のときだけ

  return {
    status,
    createdAt: request.createdAt,
    verificationCode: showCode ? request.verificationCode : null,
    codeExpiresAt: showCode ? request.codeExpiresAt : null,
  };
}

/**
 * OWNER向けに、承認待ち(数字が期限内)の申請の一覧を取得する。読取りのみ。
 * @param input クラブid・OWNERの所属id(・現在日時)。
 * @returns 数字の発行が古い順の一覧。OWNERでなければ ACTOR_NOT_ACTIVE_OWNER。
 */
export async function listAwaitingClubJoinRequests(
  input: OwnerInput, // OWNERの入力の型
): Promise<ListAwaitingClubJoinRequestsResult> {
  const now = resolveNow(input); // 現在日時を決める関数

  return prisma.$transaction(async (tx) => { // 読取りを、同じ時点で行うトランザクション
    if (!(await isActiveOwner(tx, input))) { // OWNERかを確認する関数
      return { outcome: "ACTOR_NOT_ACTIVE_OWNER" as const };
    }

    const rows = await tx.clubJoinRequest.findMany({ // 条件に合う申請を、複数取得するPrismaのメソッド
      where: {
        clubId: input.clubId, // 認可済みのクラブだけに絞る
        status: "AWAITING_APPROVAL",//承認待ち
        codeExpiresAt: { gt: now },
      },
      orderBy: { codeIssuedAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        verificationCode: true,
        codeIssuedAt: true,
        codeExpiresAt: true,
      },
    });

    return {
      outcome: "LISTED" as const,
      requests: rows.map((row) => ({ // 配列を変換する標準のメソッド
        id: row.id,
        name: row.name,
        email: row.email,
        verificationCode: row.verificationCode as string, // 承認待ちなら、必ず数字がある(SQL CHECK)
        codeIssuedAt: row.codeIssuedAt as Date, // 承認待ちなら、必ず発行日時がある(SQL CHECK)
        codeExpiresAt: row.codeExpiresAt as Date, // 承認待ちなら、必ず期限がある(SQL CHECK)
      })),
    };
  });
}

/**
 * OWNER向けに、いま使える参加リンクの有無と期限を取得する。読取りのみ。
 * 生トークンは保存していないため、URLは返さない(再表示はできない)。
 * @param input クラブid・OWNERの所属id(・現在日時)。
 * @returns 使えるリンクの発行日時と期限(なければnull)。OWNERでなければ ACTOR_NOT_ACTIVE_OWNER。
 */
export async function findActiveClubJoinLinkForOwner(
  input: OwnerInput, // OWNERの入力の型
): Promise<ActiveClubJoinLinkSummaryResult> {
  const now = resolveNow(input); // 現在日時を決める関数

  return prisma.$transaction(async (tx) => { // 読取りを、同じ時点で行うトランザクション
    if (!(await isActiveOwner(tx, input))) { // OWNERかを確認する関数
      return { outcome: "ACTOR_NOT_ACTIVE_OWNER" as const };
    }

    const link = await tx.clubJoinLink.findFirst({ // 条件に合うリンクを1件探すPrismaのメソッド
      where: {
        clubId: input.clubId, // 認可済みのクラブだけに絞る
        revokedAt: null,//失効がnull
        expiresAt: { gt: now }, // 期限内のものだけ
      },
      select: { createdAt: true, expiresAt: true }, // 返すのは、日時だけ
    });

    return { outcome: "FOUND" as const, link };
  });
}
