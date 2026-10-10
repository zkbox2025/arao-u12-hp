//src/infrastructure/prisma/repositories/club-invitation-repository.ts
//オーナーがクラブ招待メールを送った後のDB処理,再送信を送った際のDB処理
// 新規入会予定者が招待メールのURlを踏んだ時の認証、「送信済み」「送信失敗」の時のDB処理、招待キャンセル時のDB処理
// 有効期限切れの招待メールのDBを有効期限切れに書き換える、招待メールの中身を新規入会予定者に見せる際の検証

import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import {
  validateClubMemberInviteFormValues,//招待メール送信フォームの値のバリデーション関数
  type ValidClubMemberInviteInput,  //バリデーション成功時のデータの値
} from "@/domain/club/invitation/invitation-form";
import {
  buildClubInvitationExpiresAt,//招待メールの期限切れ日時を作成する関数
  evaluateClubInvitationCancellation,//招待の取り消しを許可するかの判定関数
  evaluateClubInvitationResend,//招待メールの再送信可能か判定する関数
  isUsableClubInvitation,//招待メールが使用可能か判定関数
  type ClubInvitationOperationViolation,//クラブ招待関数のエラー一覧
} from "@/domain/club/invitation/invitation-policy";
import { normalizeEmail } from "@/domain/shared/email";//メールアドレスを正規化する（整える）関数
import { DomainError } from "@/domain/shared/domain-error";// ドメイン処理で発生する、画面表示可能なエラーを表す。
import { convertPrismaError } from "@/src/infrastructure/prisma/prisma-error";//PrismaエラーをDomainErrorへ変換する。
import { prisma } from "@/src/infrastructure/prisma/client";
import type {
  ClubInvitationStatus,//招待メールのステータス"PREPARING" | "READY_TO_SEND" | "SENT" | "EMAIL_FAILED" | "ACCEPTED" | "CANCELLED" | "EXPIRED"
  ClubMemberRole,// "OWNER" | "COACH" | "OFFICER" | "MEMBER"
  ClubMembershipStatus,//メンバーシップステータス　INVITED" | "ACTIVE" | "SUSPENDED" | "WITHDRAWN"
} from "@/types/prisma";

//招待メールのステータス
const ACTIVE_STATUSES: ClubInvitationStatus[] = [
  "PREPARING",//招待メールの準備中
  "READY_TO_SEND",//送信準備完了
  "SENT",//送信済み
  "EMAIL_FAILED",//送信失敗
];

const LEASE_MILLISECONDS =//サーバーが処理を独占していい時間（リース：サーバーの二重処理を防ぐ）は５分である
  5 * 60 * 1_000;

const MAX_TRANSACTION_RETRIES =//DBの処理（トランザクション）が衝突などで失敗した場合、最大で『3回』まで自動でやり直す（リトライする）」
  3;

  //オーナーの引数
type OwnerInput = {
  clubId: string;
  actorMembershipId: string;//操作者のメンバーシップID（操作者がクラブのオーナーであることを確認するために必要）
  now?: Date;
};
//招待の引数
type InvitationInput =
  OwnerInput & {
    invitationId: string;
  };
//招待の引数（招待の引数＋claimToken）
type ClaimInput =
  InvitationInput & {
    claimToken: string;
  };
//認証済みユーザーの引数
type VerifiedAuthUser = {
  id: string;
  email: string;
};

//なぜ処理が重複してしまったのか(エラーの理由)
type DuplicateReason =
  | "ACTIVE_INVITATION"//アクティブな招待がすでにある
  | "TOKEN_HASH"//トークンハッシュが重複している
  | "CLAIM_TOKEN"//クレームトークンの重複
  | "MEMBERSHIP"//メンバーシップが重複している
  | "APP_USER";//すでにアプリユーザーである

  //ルール違反の理由
type RuleViolation =
  | ClubInvitationOperationViolation//クラブ招待関数のエラー一覧
  | "AUTH_USER_MISMATCH"//認証ユーザーが一致しない
  | "TOKEN_NOT_ROTATED";//トークンが回転してない（古いトークンが使いまわされている）

  //クラブ招待の失敗の理由
export type ClubInvitationFailure =
  | {
      outcome:
        "ACTOR_NOT_ACTIVE_OWNER";//操作者がアクティブなオーナーではない
    }
  | {
      outcome: "NOT_FOUND";//招待が見つからない
    }
  | {
      outcome: "CLAIM_LOST";//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
    }
  | {
      outcome: "RULE_VIOLATION";//ルール違反
      reason: RuleViolation;//ルール違反の理由
    }
  | {
      outcome: "MEMBERSHIP_EXISTS";//メンバーシップがすでに存在する
      membershipStatus:
        ClubMembershipStatus;//メンバーシップステータス　INVITED" | "ACTIVE" | "SUSPENDED" | "WITHDRAWN"
    }
  | {
      outcome: "DUPLICATE";//重複している
      reason: DuplicateReason;//なぜ処理が重複してしまったのか(エラーの理由)
    };


    //クラブ招待の処理中の型
export type ClubInvitationProcessing = {
  id: string;
  clubId: string;
  email: string;
  name: string | null;
  role: ClubMemberRole;
  status: ClubInvitationStatus;
  authUserId: string | null;
  existingUserId: string | null;
  membershipId: string | null;
  claimToken: string;
  leaseExpiresAt: Date;
  expiresAt: Date;
  attemptCount: number;
};

//オーナーのためのクラブ招待の型
export type ClubInvitationForOwner = {
  id: string;
  name: string | null;
  email: string;
  role: ClubMemberRole;
  status: ClubInvitationStatus;
  hasMembership: boolean;
  membershipStatus:
    ClubMembershipStatus | null;
  createdAt: Date;
  expiresAt: Date;
  emailSentAt: Date | null;
  lastAttemptAt: Date | null;
  leaseExpiresAt: Date | null;
  canResend: boolean;
  canCancel: boolean;
  needsPreparationRetry: boolean;
};

//DBから取得したクラブ招待データの型
type StoredInvitation =
  Prisma.ClubInvitationGetPayload<{
    include: {
      membership: {
        select: {
          id: true;
          clubId: true;
          userId: true;
          role: true;
          status: true;
        };
      };
    };
  }>;

  //処理を中止（Abort）した理由（ClubInvitationFailure）を中に詰め込んで、周りのプログラムに知らせるための特製の連絡箱
class TransactionAbort extends Error {
  constructor(
    readonly result:
      ClubInvitationFailure, //クラブ招待の失敗の理由
  ) {
    super(
      "Invitation transaction aborted",//招待処理の中止
    );
  }
}

//有効なオブジェクト（連想配列：キーをつけてバラバラに保管するもの）を抽出し、文字列やnullを除外する関数
function object(
  value: unknown,
): Record<string, unknown> | null {
  return typeof value === "object" &&
    value !== null//nullでもobject判定が出るのであえてnullを除外する
    ? (value as Record<
        string,
        unknown
      >)
    : null;
}


//エラーを受け取り重複理由を返す関数
function duplicateReason(
  error:
    Prisma.PrismaClientKnownRequestError,
): DuplicateReason | null {//"ACTIVE_INVITATION" | "TOKEN_HASH" | "CLAIM_TOKEN" | "MEMBERSHIP" | "APP_USER"
  const meta =
    object(error.meta);//エラーの連想配列を取得する

  const cause =//エラーの原因を取得する
    object(
      object(
        meta?.driverAdapterError,
      )?.cause,
    );

    //どんな制約に引っかかったかを取得する
  const constraint =
    object(cause?.constraint);

    //制約の対象を取得する
  const target =
    meta?.target ??
    constraint?.fields ??//どの項目か
    constraint?.index;

    //キーと重複理由を紐付けるデータの箱
  const names: Record<
    string,
    DuplicateReason//重複理由を文字列として読み取る
  > = {
    ClubInvitation_active_email_key:
      "ACTIVE_INVITATION",//アクティブな招待がすでにある
    ClubInvitation_tokenHash_key:
      "TOKEN_HASH",
    ClubInvitation_claimToken_key:
      "CLAIM_TOKEN",
    ClubInvitation_membershipId_key:
      "MEMBERSHIP",
    ClubMembership_clubId_userId_key:
      "MEMBERSHIP",
    AppUser_email_key:
      "APP_USER",
  };

  if (typeof target === "string")
    return names[target] ?? null;

  //targetが文字列が並んだ綺麗な配列であることを確認する
  if (
    !Array.isArray(target) ||//「target が配列ではない」か、あるいは
    !target.every(// 項目の中に1つでも文字列以外のものが混ざっている
      (field) =>
        typeof field === "string",
    )
  )
    return null;

    //項目の文字の中に " があったら、それを ""（文字数ゼロの空っぽ）に置き換える
  const fields =
    target.map(
      (field: string) =>
        field.replaceAll('"', ""),
    );

    //名前をmodelとする
  const model =
    meta?.modelName;

  if (
    (model === "ClubInvitation" ||//名前がClubInvitation"であるか、あるいは名前が未定義である
      model === undefined) &&
    fields.length === 2 &&//項目が２つある
    fields.includes("clubId") &&//項目に"clubId"が含まれている
    fields.some((field) =>//項目の中に、"email"、"lower(email"、"lower(email)"のいずれかが含まれている
      [
        "email",
        "lower(email",
        "lower(email)",
      ].includes(field),
    )
  ) {
    return "ACTIVE_INVITATION";//アクティブな招待がすでにある
  }

  if (fields.length === 1) {//項目が１つしかない
    if (fields[0] === "tokenHash")//項目が"tokenHash"である
      return "TOKEN_HASH";//トークンハッシュの重複

    if (fields[0] === "claimToken")//項目が"claimToken"である
      return "CLAIM_TOKEN";//クレームトークンの重複

    if (fields[0] === "membershipId")//項目が"membershipId"である
      return "MEMBERSHIP";//メンバーシップの重複

    if (
      fields[0] === "email" &&//項目が"email"である
      (model === "AppUser" ||//名前がAppUserであるか、あるいは名前が未定義である
        model === undefined)
    )
      return "APP_USER";//すでにアプリユーザーである
  }

  if (
    (model === "ClubMembership" ||//名前がClubMembershipであるか、あるいは名前が未定義である
      model === undefined) &&
    fields.length === 2 &&//項目が２つある
    fields.includes("clubId") &&//項目に"clubId"が含まれている
    fields.includes("userId")//項目に"userId"が含まれている
  )
    return "MEMBERSHIP";//メンバーシップの重複

  return null;//全ての条件に当てはまらなかった場合は、nullを返す
}

//現在の日時が正しいか検証する関数
function time(
  input: {
    now?: Date;
  },
): Date {
  const now =
    input.now ?? new Date();

    //有効な数字かを判定する
  if (
    !Number.isFinite(
      now.getTime(),
    )
  )
    throw new DomainError(
      "VALIDATION",
      "処理日時が正しくありません。",
    );

  return now;
}

//トークンハッシュの形式が正しいかを判定する関数
function assertTokenHash(
  tokenHash: string,
): void {
  if (
    !/^[a-f0-9]{64}$/.test(
      tokenHash,
    )
  ) {
    throw new DomainError(
      "VALIDATION",
      "招待トークンの形式が正しくありません。",
    );
  }
}

//操作者がオーナーか認証して、DB招待テーブルにデータ登録など（operation:本処理）を行う関数。その過程で同時アクセスの衝突や重複が起きたときには
// エラーを捕まえて、安全にリトライするか、適切なエラーメッセージを投げる関数
async function ownerTransaction<T>(
  input: OwnerInput,//オーナーの引数
  operation: (
    tx: Prisma.TransactionClient,
    now: Date,
  ) => Promise<T>,
): Promise<
  T | ClubInvitationFailure//クラブ招待の失敗の理由
> {
  for (
    let attempt = 0;
    ;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const now =
            time(input);

          const actor =//操作者のメンバーシップを取得する
            await tx.clubMembership.findFirst(
              {
                where: {
                  id:
                    input.actorMembershipId,
                  clubId:
                    input.clubId,
                  role: "OWNER",
                  status: "ACTIVE",
                },
                select: {
                  id: true,
                },
              },
            );

          if (!actor)
            return {
              outcome:
                "ACTOR_NOT_ACTIVE_OWNER" as const,
            };

          return operation(//本処理を行う（データベースの招待テーブルに、ステータス：準備中（PREPARING）として新しいレコードを安全に保存（確保）することなど）
            tx,
            now,
          );
        },
        {
          isolationLevel://「世界で最も厳格で、絶対にデータが矛盾しない最高レベルの安全モード（Serializable = シリアライザブル）」で実行する
            Prisma
              .TransactionIsolationLevel
              .Serializable,//全ての処理を一つずつ実行した場合、矛盾はないかチェックする
        },
      );
    } catch (error) {
      if (
        error instanceof
        TransactionAbort//処理を中止（Abort）した理由（ClubInvitationFailure）を中に詰め込んで、周りのプログラムに知らせるための特製の連絡箱
      )
        return error.result;

      if (
        error instanceof
        Prisma.PrismaClientKnownRequestError//DB側で、あらかじめ想定されている具体的なルール違反（エラー）が起きたことを、Prismaが検知した
      ) {
        if (
          error.code === "P2034" &&//P2034（同時書き込みが行われているエラー）
          attempt <
            MAX_TRANSACTION_RETRIES//3回以下の場合続ける
        )
          continue;

        if (error.code === "P2002") {//P2002(重複エラー)
          const reason =
            duplicateReason(error);//エラーを受け取り重複理由を返す関数

          if (reason)
            return {
              outcome:
                "DUPLICATE",//重複
              reason,
            };
        }
      }

      const safe =
        convertPrismaError(error);//PrismaエラーをDomainErrorへ変換する。


      throw new DomainError(//エラー表示の箱に入れて投げる
        safe.code,
        safe.publicMessage,
      );
    }
  }
}

//DBからクラブ招待データを一件取得する関数
async function stored(
  tx: Prisma.TransactionClient,
  input: InvitationInput,//招待の引数
): Promise<StoredInvitation | null> {//DBから取得したクラブ招待データの型
  const row =
    await tx.clubInvitation.findFirst(
      {
        where: {
          id: input.invitationId,
          clubId: input.clubId,
        },
        include: {
          membership: {
            select: {
              id: true,
              clubId: true,
              userId: true,
              role: true,
              status: true,
            },
          },
        },
      },
    );

  if (
    row?.membership &&//メンバーシップが存在する場合、かつ
    row.membership.clubId !==//メンバーシップのクラブIDが、招待のクラブIDと一致しない場合
      input.clubId
  ) {
    throw new DomainError(
      "INVALID_REFERENCE",
      "関連するデータの組み合わせを確認できません。",
    );
  }

  return row;
}

//DBからデータを取得するための検索条件を出す関数
function claimWhere(
  input: ClaimInput,//招待の引数（招待の引数＋claimToken）
  now: Date,
  statuses:
    ClubInvitationStatus[],//"PREPARING" | "READY_TO_SEND" | "SENT" | "EMAIL_FAILED" | "ACCEPTED" | "CANCELLED" | "EXPIRED"
): Prisma.ClubInvitationWhereInput {
  return {
    id: input.invitationId,
    clubId: input.clubId,
    claimToken: input.claimToken,
    acceptedAt: null,//未承諾
    status: {
      in: statuses,
    },
    leaseExpiresAt: {//リース期限(招待中が切れる日時)が現在よりも未来にある
      gt: now,
    },
    expiresAt: {//招待状の有効期限が現在よりも未来にある
      gt: now,
    },
  };
}

//サーバーが、招待状データを安全に独占して処理する5分間の『正当な権利（リース）』を保持し続けているかを、1発で判定する関数
function ownsClaim(
  row: StoredInvitation,//DBから取得したクラブ招待データの型
  input: ClaimInput,//招待の引数（招待の引数＋claimToken）
  now: Date,
  statuses:
    ClubInvitationStatus[],//"PREPARING" | "READY_TO_SEND" | "SENT" | "EMAIL_FAILED" | "ACCEPTED" | "CANCELLED" | "EXPIRED"
): boolean {
  return (
    input.claimToken.length > 0 &&//クレームトークンが空ではない
    row.claimToken ===//クレームトークンが一致する
      input.claimToken &&
    row.acceptedAt === null &&//未承諾
    statuses.includes(row.status) &&//招待メールのステータスが、指定されたステータスの中に含まれている
    row.leaseExpiresAt !== null &&//リース期限(招待中が切れる日時)がnullではない
    row.leaseExpiresAt > now &&//リース期限(招待中が切れる日時)が現在よりも未来にある
    row.expiresAt > now &&//招待状の有効期限が現在よりも未来にある
    (!row.membership ||//メンバーシップが存在しない場合、かつ
      row.membership.status ===//ステータスが招待済みである
        "INVITED")
  );
}

//DBから取得した生のデータを処理しやすいようにまとめ直す関数
async function processing(
  tx: Prisma.TransactionClient,
  row: StoredInvitation,//DBから取得したクラブ招待データの型
): Promise<ClubInvitationProcessing> {//クラブ招待の処理中の型
  if (
    !row.claimToken ||
    !row.leaseExpiresAt
  )
    throw new DomainError(
      "INTERNAL",
      "招待の処理権を確認できません。",
    );

    //メンバーシップがデータに存在しない場合、メールアドレスからユーザーを検索する。存在する場合はnullを返す。
  const user =
    row.membership
      ? null
      : await tx.appUser.findUnique(
          {
            where: {
              email: row.email,
            },
            select: {
              id: true,
            },
          },
        );

  return {
    id: row.id,
    clubId: row.clubId,
    email: row.email,
    name: row.name,
    role:
      row.membership?.role ??
      row.role,
    status: row.status,
    authUserId: row.authUserId,
    existingUserId:
      row.membership?.userId ??
      user?.id ??
      null,
    membershipId:
      row.membershipId,
    claimToken: row.claimToken,
    leaseExpiresAt:
      row.leaseExpiresAt,
    expiresAt: row.expiresAt,
    attemptCount:
      row.attemptCount,
  };
}

//有効期限切れのデータを取得して、ステータスをEXPIREDに変更する関数
async function expire(
  tx: Prisma.TransactionClient,
  clubId: string,
  now: Date,
  excludeId?: string,
): Promise<number> {
  const updated =
    await tx.clubInvitation.updateMany(
      {
        where: {
          clubId,
          ...(excludeId
            ? {
                id: {
                  not: excludeId,
                },
              }
            : {}),
          status: {
            in: ACTIVE_STATUSES,//招待メールのステータス
          },
          acceptedAt: null,
          expiresAt: {
            lte: now,//有効期限切れ
          },
        },
        data: {
          status: "EXPIRED",
          claimToken: null,
          leaseExpiresAt: null,
        },
      },
    );

  return updated.count;
}

//DBから特定クラブのクラブ招待データを全て取得して、処理しやすいようにまとめ直す関数
export async function findClubInvitationsForOwner(
  input: OwnerInput,//オーナーの引数
) {
  return ownerTransaction(//操作者がオーナーか認証して、DB招待テーブルにデータ登録など（operation:本処理）を行う関数
    input,
    async (tx, now) => {
      const rows =//クラブ招待のデータを全て取得する
        await tx.clubInvitation.findMany(
          {
            where: {
              clubId: input.clubId,
            },
            orderBy: [
              {
                createdAt: "asc",
              },
              {
                id: "asc",
              },
            ],
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
              acceptedAt: true,
              createdAt: true,
              expiresAt: true,
              emailSentAt: true,
              lastAttemptAt: true,
              leaseExpiresAt: true,
              membership: {
                select: {
                  clubId: true,
                  role: true,
                  status: true,
                },
              },
            },
          },
        );

        //生のデータを処理しやすいようにまとめ直す関数
      const invitations:
        ClubInvitationForOwner[] =//オーナーのためのクラブ招待の型
        rows.map((row) => {
          if (
            row.membership &&
            row.membership.clubId !==//メンバーシップのクラブIDが、招待のクラブIDと一致しない場合
              input.clubId
          ) {
            throw new DomainError(
              "INVALID_REFERENCE",
              "関連するデータの組み合わせを確認できません。",
            );
          }

          return {
            id: row.id,
            name: row.name,
            email: row.email,
            role:
              row.membership
                ?.role ?? row.role,
            status: row.status,
            hasMembership:
              row.membership !==
              null,
            membershipStatus:
              row.membership
                ?.status ?? null,
            createdAt:
              row.createdAt,
            expiresAt:
              row.expiresAt,
            emailSentAt:
              row.emailSentAt,
            lastAttemptAt:
              row.lastAttemptAt,
            leaseExpiresAt:
              row.leaseExpiresAt,
            canResend:
              evaluateClubInvitationResend(//招待メールの再送信可能か判定する関数
                {
                  invitation: row,
                  membership:
                    row.membership,
                  now,
                },
              ).allowed,
            canCancel:
              evaluateClubInvitationCancellation(//招待の取り消しを許可するかの判定関数
                {
                  invitation: row,
                  membership:
                    row.membership,
                },
              ).allowed,
            needsPreparationRetry://以下の場合は準備の再試行が必要である
              row.status ===
                "PREPARING" &&
              row.acceptedAt ===
                null &&
              (row.leaseExpiresAt ===//有効期限がまだ一度も処理開始されてない
                null ||
                row.leaseExpiresAt <=//有効期限が切れている
                  now),
          };
        });

      return {
        outcome: "FOUND" as const,
        invitations,
      };
    },
  );
}

//クラブのオーナーが新しいメンバーをメールで招待した際に、そのリクエスト（入力値や重複）を厳格にチェックし、
// 問題がなければデータベース内に5分間のロック（予約）をかけた状態で『招待状データ』を新規作成する、招待プロセスの出発点となる関数
export async function reserveClubInvitation(
  input:
    OwnerInput &//オーナーの引数
      ValidClubMemberInviteInput & {//バリデーション成功時のデータの値
        tokenHash: string;
      },
) {
  assertTokenHash(//トークンハッシュの形式が正しいかを判定する関数
    input.tokenHash,
  );

  const validation =
    validateClubMemberInviteFormValues(//招待メール送信フォームの値のバリデーション関数
      input,
    );

  if (!validation.success)
    throw new DomainError(
      "VALIDATION",
      "招待する入力値を確認してください。",
    );

  return ownerTransaction(//操作者がオーナーか認証して、DB招待テーブルにデータ登録など（operation:本処理）を行う関数
    input,
    async (tx, now) => {
      await expire(//有効期限切れのデータを取得して、ステータスをEXPIREDに変更する関数
        tx,
        input.clubId,
        now,
      );

      const user =//DBからメールアドレスに一致するユーザーを１つ取得する。存在しない場合はnullを返す。
        await tx.appUser.findUnique(
          {
            where: {
              email:
                validation.data.email,
            },
            select: {
              id: true,
            },
          },
        );

      const membership =//ユーザーIDがありつつ、クラブIDとユーザーIDが一致するメンバーシップを１つ取得する。
        user &&
        (await tx.clubMembership.findUnique(
          {
            where: {
              clubId_userId: {
                clubId:
                  input.clubId,
                userId: user.id,
              },
            },
            select: {
              status: true,
            },
          },
        ));

      if (membership)
        return {
          outcome:
            "MEMBERSHIP_EXISTS" as const,//メンバーシップがすでに存在する
          membershipStatus:
            membership.status,
        };

      const duplicate =//DBのクラブ招待テーブルからクラブIDとメールアドレスが一致する、かつステータスがACTIVE_STATUSESの招待メールを１件取得する。ある場合はtrue。存在しない場合はnullを返す。
        await tx.clubInvitation.findFirst(
          {
            where: {
              clubId: input.clubId,
              email:
                validation.data.email,
              status: {
                in: ACTIVE_STATUSES,//招待メールのステータス
              },
            },
            select: {
              id: true,
            },
          },
        );

      if (duplicate)//DBのクラブ招待テーブルからクラブIDとメールアドレスが一致する、かつステータスがACTIVE_STATUSESの招待メールを１件できた場合、
        return {
          outcome:
            "DUPLICATE" as const,//重複あり
          reason:
            "ACTIVE_INVITATION" as const,//アクティブな招待がすでにある
        };

      const row =
        await tx.clubInvitation.create(//DBのクラブ招待テーブルに新しい招待データ（ステータスは準備中）を作成する
          {
            data: {
              clubId: input.clubId,
              ...validation.data,
              tokenHash:
                input.tokenHash,
              status: "PREPARING",//招待メールの準備中
              expiresAt:
                buildClubInvitationExpiresAt(//招待メールの期限切れ日時を作成する関数
                  now,
                ),
              invitedByMembershipId:
                input.actorMembershipId,
              attemptCount: 1,
              lastAttemptAt: now,
              claimToken:
                randomUUID(),
              leaseExpiresAt://今の時刻から５分後が有効期限
                new Date(
                  now.getTime() +
                    LEASE_MILLISECONDS,
                ),
            },
            include: {
              membership: {
                select: {
                  id: true,
                  clubId: true,
                  userId: true,
                  role: true,
                  status: true,
                },
              },
            },
          },
        );

      return {
        outcome:
          "RESERVED" as const,//確保として結果を返す
        invitation:
          await processing(//DBから取得した生のデータを処理しやすいようにまとめ直す関数
            tx,
            row,
          ),
      };
    },
  );
}

//すでに過去に一度送信した（または送信エラーなどで眠っている）招待状データに対して、オーナーが再送信ボタンを押した際に、
// すでに存在する招待状データのステータスを準備中に変更する関数
export async function claimClubInvitationResend(
  input:
    InvitationInput & {//招待の引数
      tokenHash: string;
    },
) {
  assertTokenHash(//トークンハッシュの形式が正しいかを判定する関数
    input.tokenHash,
  );

  return ownerTransaction(//操作者がオーナーか認証して、DB招待テーブルにデータ登録など（operation:本処理）を行う関数
    input,
    async (tx, now) => {
      const row =
        await stored(tx, input);//DBからクラブ招待データを一件取得する関数

      if (!row)
        return {
          outcome:
            "NOT_FOUND" as const,
        };

      const evaluation =
        evaluateClubInvitationResend(//招待メールの再送信可能か判定する関数
          {
            invitation: row,
            membership:
              row.membership,
            now,
          },
        );

      if (!evaluation.allowed)
        return {
          outcome:
            "RULE_VIOLATION" as const,//ルール違反
          reason:
            evaluation.violation,//原因
        };

      if (
        row.tokenHash ===
        input.tokenHash
      )
        return {
          outcome:
            "RULE_VIOLATION" as const,//ルール違反
          reason:
            "TOKEN_NOT_ROTATED" as const,//トークンが古いまま使いまわされている
        };

      
      await expire(//有効期限切れのデータを取得して、ステータスをEXPIREDに変更する関数
        tx,
        input.clubId,
        now,
        row.id,
      );

      const duplicate =//DBのクラブ招待テーブルからクラブIDとメールアドレスが一致する、かつステータスがACTIVE_STATUSESの招待メールを１件取得する。ある場合はtrue。存在しない場合はnullを返す。
        await tx.clubInvitation.findFirst(
          {
            where: {
              clubId: input.clubId,
              email: row.email,
              id: {
                not: row.id,
              },
              status: {
                in: ACTIVE_STATUSES,//招待メールのステータス
              },
            },
            select: {
              id: true,
            },
          },
        );

      if (duplicate)
        return {
          outcome:
            "DUPLICATE" as const,//重複あり
          reason:
            "ACTIVE_INVITATION" as const,//アクティブな招待がすでにある
        };

      const updated =//DBのクラブ招待テーブルのステータスをPREPARING（準備中）に変更する
        await tx.clubInvitation.updateMany(
          {
            where: {
              id: row.id,
              clubId: input.clubId,
              acceptedAt: null,
              status: row.status,
              claimToken:
                row.claimToken,
              OR: [
                {
                  leaseExpiresAt:
                    null,
                },
                {
                  leaseExpiresAt: {
                    lte: now,
                  },
                },
              ],
            },
            data: {
              status: "PREPARING",
              tokenHash:
                input.tokenHash,
              expiresAt:
                buildClubInvitationExpiresAt(//招待メールの期限切れ日時を作成する関数
                  now,
                ),
              claimToken:
                randomUUID(),//クレームトークンを作成する
              leaseExpiresAt://今の時刻から５分後が有効期限
                new Date(
                  now.getTime() +
                    LEASE_MILLISECONDS,
                ),
              attemptCount: {
                increment: 1,
              },
              lastAttemptAt: now,
              emailSendError: null,
            },
          },
        );

      if (updated.count !== 1)
        throw new TransactionAbort(//処理を中止（Abort）した理由（ClubInvitationFailure）を中に詰め込んで、周りのプログラムに知らせるための特製の連絡箱
          {
            outcome: "CLAIM_LOST",//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
          },
        );

      const claimed =
        await stored(tx, input);//DBからクラブ招待データを一件取得する関数

      if (!claimed)
        throw new TransactionAbort(//処理を中止（Abort）した理由（ClubInvitationFailure）を中に詰め込んで、周りのプログラムに知らせるための特製の連絡箱
          {
            outcome: "NOT_FOUND",//クラブ招待データが見つからない
          },
        );

      return {
        outcome:
          "CLAIMED" as const,//招待の処理権(クレーム)を確保した
        invitation:
          await processing(//DBから取得した生のデータを処理しやすいようにまとめ直す関数
            tx,
            claimed,
          ),
      };
    },
  );
}

//この招待リンクをクリックしてログインしてきた『画面の前のあなた』は、本当にこの招待状を受け取るべき本物の受取人なのかをDBの情報と照らし合わせて身元確認する関数
//いざリンクが踏まれてユーザーがログイン（OAuthなど）してきたときに、「ログインしてきたアカウント」と「データベースにある招待状データ」が、裏側で綺麗に一本の線で繋がるかを慎重に確かめる
async function matchesAuthUser(
  tx: Prisma.TransactionClient,
  row: StoredInvitation,//DBから取得したクラブ招待データの型
  user: VerifiedAuthUser,//認証済みユーザーの引数
): Promise<boolean> {
  if (
    !user.id ||//認証済みユーザーIDがない
    normalizeEmail(user.email) !==//ユーザーのメアドが招待メールのメアドと一致しない
      row.email ||
    (row.authUserId !== null &&//招待メールの認証済みユーザーIDがnullでない、かつ
      row.authUserId !== user.id) ||//招待メールの認証済みユーザーIDが、認証済みユーザーIDと一致しない
    (row.membership !== null &&//招待メールのメンバーシップがnullでない、かつ
      row.membership.userId !==//招待メールのメンバーシップのユーザーIDが、認証済みユーザーIDと一致しない
        user.id)
  )
    return false;//以上の場合はfalse

  const byEmail =//DBからメアドに一致するユーザーIDを一つ取得する
    await tx.appUser.findUnique(
      {
        where: {
          email: row.email,
        },
        select: {
          id: true,
        },
      },
    );

  const byId =//DBからユーザーIDに一致するメアドを一つ取得する
    await tx.appUser.findUnique(
      {
        where: {
          id: user.id,
        },
        select: {
          email: true,
        },
      },
    );

  return (//以下の場合はtrue
    (!byEmail ||//DBからメアドに一致するユーザーIDがない、または
      byEmail.id === user.id) &&//DBからメアドに一致するユーザーIDが、認証済みユーザーIDと一致する、かつ
    (!byId ||//DBからユーザーIDに一致するメアドがない、または
      byId.email === null ||//DBからユーザーIDに一致するメアドがnull、または
      normalizeEmail(byId.email) ===//DBからユーザーIDに一致するメアドが、招待メールのメアドと一致する
        row.email)
  );
}

//DBのクラブ招待テーブルの認証済みユーザーIDを更新する関数
export async function recordClubInvitationAuthUser(
  input:
    ClaimInput & {//招待の引数（招待の引数＋claimToken）
      verifiedAuthUser:
        VerifiedAuthUser;//認証済みユーザーの引数
    },
) {
  return ownerTransaction(//操作者がオーナーか認証して、DB招待テーブルにデータ登録など（operation:本処理）を行う関数
    input,
    async (tx, now) => {
      const row =
        await stored(tx, input);//DBからクラブ招待データを一件取得する関数

      if (!row)
        return {
          outcome:
            "NOT_FOUND" as const,
        };

      if (
        !ownsClaim(//サーバーが、招待状データを安全に独占して処理する5分間の『正当な権利（リース）』を保持し続けているかを、1発で判定する関数
          row,
          input,
          now,
          ["PREPARING"],
        )
      )
        return {
          outcome:
            "CLAIM_LOST" as const,//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
        };

      if (
        !(await matchesAuthUser(//この招待リンクをクリックしてログインしてきた『画面の前のあなた』は、本当にこの招待状を受け取るべき本物の受取人なのかをDBの情報と照らし合わせて身元確認する関数
          tx,
          row,
          input.verifiedAuthUser,
        ))
      ) {
        return {
          outcome:
            "RULE_VIOLATION" as const,//ルール違反
          reason:
            "AUTH_USER_MISMATCH" as const,//認証ユーザーの不一致
        };
      }

      const updated =
        await tx.clubInvitation.updateMany(//DBのクラブ招待テーブルの認証済みユーザーIDを更新する
          {
            where: {
              ...claimWhere(//DBからデータを取得するための検索条件を出す関数
                input,
                now,
                ["PREPARING"],
              ),
              authUserId:
                row.authUserId,
            },
            data: {
              authUserId:
                input
                  .verifiedAuthUser.id,
            },
          },
        );

      return updated.count === 1
        ? {
            outcome:
              "UPDATED" as const,//更新完了
          }
        : {
            outcome:
              "CLAIM_LOST" as const,//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
          };
    },
  );
}


//オーナーがクラブ招待の処理権(クレーム)を保持している状態で、招待メール送信の準備を完了させる関数
//この関数は、招待メール送信の準備が整ったことをDBに記録するためのものであり、実際のメール送信は別の処理で行われる。
export async function completeClubInvitationPreparation(
  input:
    ClaimInput & {//招待の引数（招待の引数＋claimToken）
      verifiedAuthUser:
        VerifiedAuthUser;//認証済みユーザーの引数
    },
) {
  return ownerTransaction(//操作者がオーナーか認証して、DB招待テーブルにデータ登録など（operation:本処理）を行う関数
    input,
    async (tx, now) => {
      const row =
        await stored(tx, input);//DBからクラブ招待データを一件取得する関数

      if (!row)
        return {
          outcome:
            "NOT_FOUND" as const,
        };

      if (
        !ownsClaim(//サーバーが、招待状データを安全に独占して処理する5分間の『正当な権利（リース）』を保持し続けているかを、1発で判定する関数
          row,
          input,
          now,
          ["PREPARING"],
        )
      )
        return {
          outcome:
            "CLAIM_LOST" as const,//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
        };

      if (
        row.authUserId !==//招待メールの認証済みユーザーIDが、認証済みユーザーIDと一致しない、または
          input.verifiedAuthUser.id ||
        !(await matchesAuthUser(//この招待リンクをクリックしてログインしてきた『画面の前のあなた』は、本当にこの招待状を受け取るべき本物の受取人なのかをDBの情報と照らし合わせて身元確認する関数
          tx,
          row,
          input.verifiedAuthUser,
        ))
      ) {
        return {
          outcome:
            "RULE_VIOLATION" as const,
          reason:
            "AUTH_USER_MISMATCH" as const,//認証ユーザーの不一致
        };
      }

      const existing =//DBからクラブIDとユーザーIDが一致するメンバーシップを１つ取得する。
        await tx.clubMembership.findUnique(
          {
            where: {
              clubId_userId: {
                clubId:
                  input.clubId,
                userId:
                  row.authUserId,
              },
            },
            select: {
              id: true,
              status: true,
            },
          },
        );

      if (
        existing &&//メンバーシップが存在し、かつ
        (existing.id !==//メンバーシップが一致しない、または
          row.membershipId ||
          existing.status !==//メンバーシップのステータスが招待済みでない
            "INVITED")
      ) {
        return {
          outcome:
            "MEMBERSHIP_EXISTS" as const,//メンバーシップがすでに存在する
          membershipStatus:
            existing.status,
        };
      }

      if (
        row.membershipId !== null &&//招待メールのメンバーシップIDがnullではない、かつ
        (!existing ||//メンバーシップが存在しない、または
          existing.id !==//メンバーシップが一致しない
            row.membershipId)
      ) {
        throw new TransactionAbort(//処理を中止（Abort）した理由（ClubInvitationFailure）を中に詰め込んで、周りのプログラムに知らせるための特製の連絡箱
          {
            outcome: "CLAIM_LOST",//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
          },
        );
      }

      const user =//DBから認証済みユーザーIDに一致するユーザーを１つ取得する。存在しない場合はnullを返す。
        await tx.appUser.findUnique(
          {
            where: {
              id: row.authUserId,
            },
            select: {
              id: true,
            },
          },
        );

      if (!user)//DBから認証済みユーザーIDに一致するユーザーが存在しない場合、DBに新しいユーザーを作成する
        await tx.appUser.create({
          data: {
            id: row.authUserId,
            email: row.email,
            name: row.name,
          },
          select: {
            id: true,
          },
        });

      const membership =
        existing ??//メンバーシップが存在する場合はそれを使い、存在しない場合は新しくメンバーシップを作成する
        (await tx.clubMembership.create(
          {
            data: {
              clubId: input.clubId,
              userId: row.authUserId,
              role: row.role,
              status: "INVITED",
            },
            select: {
              id: true,
              status: true,
            },
          },
        ));

      const updated =
        await tx.clubInvitation.updateMany(//DBのクラブ招待テーブルのステータスをREADY_TO_SEND（送信準備完了）に変更する
          {
            where: {
              ...claimWhere(//DBからデータを取得するための検索条件を出す関数
                input,
                now,
                ["PREPARING"],
              ),
              authUserId:
                row.authUserId,
              membershipId:
                row.membershipId,
            },
            data: {
              membershipId:
                membership.id,
              status:
                "READY_TO_SEND",
              emailSendError: null,
            },
          },
        );

      if (updated.count !== 1)
        throw new TransactionAbort(//処理を中止（Abort）した理由（ClubInvitationFailure）を中に詰め込んで、周りのプログラムに知らせるための特製の連絡箱
          {
            outcome: "CLAIM_LOST",//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
          },
        );

      const prepared =
        await stored(tx, input);//DBからクラブ招待データを一件取得する関数

      if (!prepared)
        throw new TransactionAbort(//処理を中止（Abort）した理由（ClubInvitationFailure）を中に詰め込んで、周りのプログラムに知らせるための特製の連絡箱
          {
            outcome: "NOT_FOUND",
          },
        );

      return {
        outcome:
          "PREPARED" as const,//招待メール送信の準備が完了した
        invitation:
          await processing(//DBから取得した生のデータを処理しやすいようにまとめ直す関数
            tx,
            prepared,
          ),
      };
    },
  );
}

//送信完了もしくは送信失敗した際にクラブ招待テーブルのステータスをSENT（送信済み）またはEMAIL_FAILED（送信失敗）に変更する関数
async function markEmail(
  input: ClaimInput,//招待の引数（招待の引数＋claimToken）
  status:
    | "SENT"
    | "EMAIL_FAILED",
) {
  return ownerTransaction(//操作者がオーナーか認証して、DB招待テーブルにデータ登録など（operation:本処理）を行う関数
    input,
    async (tx, now) => {
      const row =
        await stored(tx, input);//DBからクラブ招待データを一件取得する関数

      if (!row)
        return {
          outcome:
            "NOT_FOUND" as const,
        };

      if (
        !ownsClaim(//サーバーが、招待状データを安全に独占して処理する5分間の『正当な権利（リース）』を保持し続けているかを、1発で判定する関数
          row,
          input,
          now,
          ["READY_TO_SEND"],
        ) ||//もしくは
        !row.membership//招待メールのメンバーシップがない
      )
        return {
          outcome:
            "CLAIM_LOST" as const,//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
        };

      const updated =
        await tx.clubInvitation.updateMany(//クラブ招待テーブルのステータスをSENT（送信済み）またはEMAIL_FAILED（送信失敗）に変更する
          {
            where: {
              ...claimWhere(//DBからデータを取得するための検索条件を出す関数
                input,
                now,
                ["READY_TO_SEND"],
              ),
              membership: {
                is: {
                  clubId:
                    input.clubId,
                  status:
                    "INVITED",
                },
              },
            },
            data: {
              status,
              ...(status === "SENT"
                ? {
                    emailSentAt: now,
                  }
                : {}),
              emailSendError:
                status ===
                "EMAIL_FAILED"
                  ? "EMAIL_SEND_FAILED"
                  : null,
              claimToken: null,
              leaseExpiresAt: null,
            },
          },
        );

      return updated.count === 1
        ? {
            outcome:
              "UPDATED" as const,
          }
        : {
            outcome:
              "CLAIM_LOST" as const,//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
          };
    },
  );
}

//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態から、招待メール送信の完了をDBに記録する関数
export async function markClubInvitationEmailSent(
  input: ClaimInput,//招待の引数（招待の引数＋claimToken）
) {
  return markEmail(//送信済みもしくは送信失敗した際にクラブ招待テーブルのステータスをSENT（送信済み）またはEMAIL_FAILED（送信失敗）に変更する関数
    input,
    "SENT",
  );
}

//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態から、招待メール送信の失敗をDBに記録する関数
export async function markClubInvitationEmailFailed(
  input: ClaimInput,//招待の引数（招待の引数＋claimToken）
) {
  return markEmail(//送信済みもしくは送信失敗した際にクラブ招待テーブルのステータスをSENT（送信済み）またはEMAIL_FAILED（送信失敗）に変更する関数
    input,
    "EMAIL_FAILED",
  );
}


//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態で、招待メール送信の完了または失敗後に、
// クラブ招待テーブルのクレームトークンと有効期限をnullにすることで、招待の処理権(クレーム)をなくす関数
export async function releaseClubInvitationClaim(
  input: ClaimInput,//招待の引数（招待の引数＋claimToken）
) {
  return ownerTransaction(//操作者がオーナーか認証して、DB招待テーブルにデータ登録など（operation:本処理）を行う関数
    input,
    async (tx, now) => {
      const row =
        await stored(tx, input);//DBからクラブ招待データを一件取得する関数

      if (!row)
        return {
          outcome:
            "NOT_FOUND" as const,
        };

      if (
        !ownsClaim(//サーバーが、招待状データを安全に独占して処理する5分間の『正当な権利（リース）』を保持し続けているかを、1発で判定する関数
          row,
          input,
          now,
          [
            "PREPARING",
            "READY_TO_SEND",
          ],
        )
      )
        return {
          outcome:
            "CLAIM_LOST" as const,//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
        };

      const updated =//送信成功時や送信エラー時にクラブ招待テーブルのクレームトークンと有効期限をnullにすることで、招待の処理権(クレーム)をなくす
        await tx.clubInvitation.updateMany(
          {
            where: claimWhere(//DBからデータを取得するための検索条件を出す関数
              input,
              now,
              [
                "PREPARING",//招待メールの準備中
                "READY_TO_SEND",//招待メールの送信準備完了
              ],
            ),
            data: {
              claimToken: null,
              leaseExpiresAt: null,
            },
          },
        );

      return updated.count === 1
        ? {
            outcome:
              "UPDATED" as const,
          }
        : {
            outcome:
              "CLAIM_LOST" as const,//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
          };
    },
  );
}

//オーナーが、クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態のクラブ招待テーブルのステータスをCANCELLED（キャンセル済み）にし、
//招待中のメンバーシップを削除する関数
export async function cancelClubInvitation(
  input: InvitationInput,
) {
  return ownerTransaction(//操作者がオーナーか認証して、DB招待テーブルにデータ登録など（operation:本処理）を行う関数
    input,
    async (tx) => {
      const row =
        await stored(tx, input);//DBからクラブ招待データを一件取得する関数

      if (!row)
        return {
          outcome:
            "NOT_FOUND" as const,
        };

      const evaluation =
        evaluateClubInvitationCancellation(//招待の取り消しを許可するかの判定関数
          {
            invitation: row,
            membership:
              row.membership,
          },
        );

      if (!evaluation.allowed)
        return {
          outcome:
            "RULE_VIOLATION" as const,//ルール違反
          reason:
            evaluation.violation,
        };

      if (!row.membershipId)//メンバーシップが見つからない場合
        throw new TransactionAbort(//処理を中止（Abort）した理由（ClubInvitationFailure）を中に詰め込んで、周りのプログラムに知らせるための特製の連絡箱
          {
            outcome: "NOT_FOUND",
          },
        );

      const updated =//DBのクラブ招待テーブルのステータスをCANCELLED（キャンセル済み）に変更する
        await tx.clubInvitation.updateMany(
          {
            where: {
              id: row.id,
              clubId: input.clubId,
              status: row.status,
              acceptedAt: null,
              membershipId:
                row.membershipId,
            },
            data: {
              status: "CANCELLED",
              claimToken: null,
              leaseExpiresAt: null,
            },
          },
        );

      if (updated.count !== 1)
        throw new TransactionAbort(//処理を中止（Abort）した理由（ClubInvitationFailure）を中に詰め込んで、周りのプログラムに知らせるための特製の連絡箱
          {
            outcome: "CLAIM_LOST",//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
          },
        );

      const deleted =//DBのクラブメンバーシップテーブルから、クラブIDとメンバーシップIDが一致する、かつステータスがINVITEDのメンバーシップを削除する
        await tx.clubMembership.deleteMany(
          {
            where: {
              id: row.membershipId,
              clubId: input.clubId,
              status: "INVITED",
            },
          },
        );

      if (deleted.count !== 1)
        throw new TransactionAbort(//処理を中止（Abort）した理由（ClubInvitationFailure）を中に詰め込んで、周りのプログラムに知らせるための特製の連絡箱
          {
            outcome: "CLAIM_LOST",//招待の処理権(クレーム)を失った（他のサーバーが処理してしまった）
          },
        );

      return {
        outcome:
          "CANCELLED" as const,//キャンセル完了
      };
    },
  );
}

//有効期限切れのデータを取得してクラブ招待テーブルのステータスをEXPIRED（期限切れ）にする関数
export async function expireClubInvitations(
  input: OwnerInput,
) {
  return ownerTransaction(//操作者がオーナーか認証して、DB招待テーブルにデータ登録など（operation:本処理）を行う関数
    input,
    async (tx, now) => ({
      outcome: "EXPIRED" as const,
      count: await expire(//有効期限切れのデータを取得して、ステータスをEXPIREDに変更する関数
        tx,
        input.clubId,
        now,
      ),
    }),
  );
}

//クラブ招待のトークンハッシュを使って、招待メールの使用が可能かどうかを判定し、使用可能な場合は招待メールの情報を返す関数
//招待リンクを踏んでやってきたユーザーのために、「あなたが今から使える有効な招待メールの情報はこれですよ」 と、
// 次に進むためのデータを渡してあげる
export async function findUsableClubInvitationByTokenHash(
  input: {
    clubId: string;
    tokenHash: string;
    authenticatedUserId: string;//認証済みのユーザーID
    now?: Date;
  },
) {
  assertTokenHash(//トークンハッシュの形式が正しいかを判定する関数
    input.tokenHash,
  );

  const now =
    time(input);

  if (!input.authenticatedUserId)//認証済みのユーザーIDがない
    return null;

  try {
    const row =//DBのクラブ招待テーブルから、クラブIDとトークンハッシュが一致する、かつステータスがREADY_TO_SEND、SENT、EMAIL_FAILEDの招待メールを１件取得する。ある場合はtrue。存在しない場合はnullを返す。
      await prisma.clubInvitation.findFirst(
        {
          where: {
            clubId: input.clubId,
            tokenHash:
              input.tokenHash,
            authUserId:
              input.authenticatedUserId,//認証済みのユーザーID

//READY_TO_SENDが入ってる理由：外部システム（メール送信）の完了報告に数秒のタイムラグがあっても、受取人を待たせずにその場でスムーズに加入させるため。
//EMAIL_FAILEDが入ってる理由：メールサーバーの不調で送信に失敗した場合でも、オーナーがLINE等で招待URLを手渡しすれば加入できる救済ルートを残すため。
            status: {
              in: [
                "READY_TO_SEND",//招待メールの送信準備完了
                "SENT",//招待メールの送信済み
                "EMAIL_FAILED",//招待メールの送信失敗
              ],
            },
            acceptedAt: null,//未承諾
            expiresAt: {//有効期限が未来
              gt: now,
            },
            membership: {
              is: {
                clubId:
                  input.clubId,
                userId:
                  input.authenticatedUserId,//認証済みのユーザーID
                status: "INVITED",
              },
            },
          },
          select: {
            id: true,
            clubId: true,
            status: true,
            acceptedAt: true,
            expiresAt: true,
            membership: {
              select: {
                id: true,
                role: true,
                status: true,
              },
            },
          },
        },
      );

    if (
      !row?.membership ||//メンバーシップがない、または
      !isUsableClubInvitation({//招待メールが使用可能か判定関数(false)
        invitation: row,
        membership:
          row.membership,
        now,
      })
    )
      return null;

    return {
      id: row.id,
      clubId: row.clubId,
      membershipId:
        row.membership.id,
      role: row.membership.role,
      expiresAt: row.expiresAt,
    };
  } catch (error) {
    const safe =
      convertPrismaError(error);//PrismaエラーをDomainErrorへ変換する。

    throw new DomainError(//ドメイン処理で発生する、画面表示可能なエラーを表す。
      safe.code,
      safe.publicMessage,
    );
  }
}
