// scripts/recover-club-invitation.ts
//ターミナルで復旧コマンド（テストでも本番でも）を打った際に「準備中」でリースが切れたクラブ招待を復旧させ送信準備完了にする一連のファイル

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { normalizeEmail } from "../domain/shared/email";//メアド正規化関数
import type {
  recoverClubInvitationPreparation,//障害からの復旧処理(途中でクラッシュするなどして「準備中（PREPARING）」のままロックされてしまった招待データを、安全に元の正常なステータス（準備完了）へ戻す関数
} from "../src/application/club/invitation/recover-club-invitation";
import type {
  recordClubInvitationAuthUser,//DBのクラブ招待テーブルの認証済みユーザーIDを更新する関数
  releaseClubInvitationClaim,//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態で、RESENDへの招待メールの依頼準備完了時とRESENDへの依頼完了時にクレームトークンと有効期限をnullにする関数
} from "../src/infrastructure/prisma/repositories/club-invitation-repository";
import type {
  getClubInvitationAuthUserById,// 既知のAuth IDをAuthで照合し、アカウントの有無と本人確認をする関数。
} from "../src/infrastructure/supabase/club-invitation-auth";

//復旧時にターミナルで打ったコマンドのデータを整理した形の型
export type RecoveryOptions = {
  clubSlug: string;
  clubId: string;
  invitationId: string;
  authUserId: string;
  actorMembershipId: string;
  mode: "dry-run" | "apply";
};

//復旧に使うツールを一つにまとめた型
export type RecoveryDependencies = {
  db: PrismaClient;//プリズマクライアント（DBと接続する道具）
  getAuthUser: typeof getClubInvitationAuthUserById;// 既知のAuth IDをAuthで照合し、アカウントの有無と本人確認をする関数。
  recordAuthUser: typeof recordClubInvitationAuthUser;//DBのクラブ招待テーブルの認証済みユーザーIDを更新する関数
  recoverPreparation: typeof recoverClubInvitationPreparation;//障害からの復旧処理(途中でクラッシュするなどして「準備中（PREPARING）」のままロックされてしまった招待データを、安全に元の正常なステータス（準備完了）へ戻す関数
  releaseClaim: typeof releaseClubInvitationClaim;//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態で、RESENDへの招待メールの依頼準備完了時とRESENDへの依頼完了時にクレームトークンと有効期限をnullにする関数
};

//データが正しいか検証する関数
const optionsSchema = z.object({
  clubSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  clubId: z.uuid(),
  invitationId: z.uuid(),
  authUserId: z.uuid(),
  actorMembershipId: z.uuid(),
  mode: z.enum(["dry-run", "apply"]),
});

//ユーザーがターミナルで打ったコマンドから渡された「データ（設定やID）」をプログラムが読める形に整理（パース）する
export function parseRecoveryOptions(args: readonly string[]): RecoveryOptions {//引数は復旧の際にターミナルで打ったコマンドで戻り値が//復旧時にターミナルで打ったコマンドのデータを整理した形の型
  try {
    const { values } = parseArgs({//バラバラの文字の配列だったコマンドを、整理整頓して values という一つの箱（オブジェクト）にまとめる
      args: [...args],
      allowPositionals: false,
      strict: true,
      options: {
        "club-slug": {
          type: "string",
        },
        "club-id": {
          type: "string",
        },
        "invitation-id": {
          type: "string",
        },
        "auth-user-id": {
          type: "string",
        },
        "actor-membership-id": {
          type: "string",
        },
        "dry-run": {//テスト実行（実際は保存しない）
          type: "boolean",
        },
        apply: {//本番反映(実際に復旧させる)
          type: "boolean",
        },
      },
    });

    if (Boolean(values.apply) === Boolean(values["dry-run"])) {//applyとdry-runが両方とも指定されてるもしくは両方とも指定されてない場合はエラーを投げる
      throw new Error("Invalid execution mode");
    }

    return optionsSchema.parse({//データが正しいか検証する関数
      clubSlug: values["club-slug"],
      clubId: values["club-id"],
      invitationId: values["invitation-id"],
      authUserId: values["auth-user-id"],
      actorMembershipId: values["actor-membership-id"],
      mode: values.apply ? "apply" : "dry-run",
    });
  } catch {
    throw new Error("復旧対象の確認用IDと、--dry-runまたは--applyを指定してください。");
  }
}

//「準備中」でリースが切れたクラブ招待を復旧させ送信準備完了にする関数
export async function recoverClubInvitation(
  input: RecoveryOptions,//復旧時にターミナルで打ったコマンドのデータを整理した形の型
  dependencies: RecoveryDependencies,//復旧に使うツールを一つにまとめた型
): Promise<string> {
  let claim: {
    clubId: string;
    actorMembershipId: string;
    invitationId: string;
    claimToken: string;
  } | undefined;

  try {
    const validation = optionsSchema.safeParse(input);//データが正しいか検証する関数

    if (!validation.success) {
      return "INVALID_OPTIONS";
    }

    const options = validation.data;
    const { db } = dependencies;//db:プリズマクライアント（DBと接続する道具）
    const club = await db.club.findUnique({
      where: {
        slug: options.clubSlug,
      },
      select: {
        id: true,
      },
    });

    if (!club || club.id !== options.clubId) {
      return "CLUB_MISMATCH";
    }

    const owner = await db.clubMembership.findFirst({
      where: {
        id: options.actorMembershipId,
        clubId: club.id,
        role: "OWNER",
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (!owner) {
      return "ACTOR_NOT_ACTIVE_OWNER";
    }

    const invitation = await db.clubInvitation.findFirst({
      where: {
        id: options.invitationId,
        clubId: club.id,
      },
      select: {
        id: true,
        clubId: true,
        name: true,
        email: true,
        role: true,
        status: true,
        acceptedAt: true,
        authUserId: true,
        membershipId: true,
        claimToken: true,
        leaseExpiresAt: true,
        expiresAt: true,
        updatedAt: true,
        attemptCount: true,
        membership: {
          select: {
            clubId: true,
            userId: true,
            status: true,
          },
        },
      },
    });
    const now = new Date();

    if (!invitation) {
      return "NOT_FOUND";
    }

    if (
      invitation.status !== "PREPARING" ||//準備中以外は復旧対象外
      invitation.acceptedAt !== null ||//承諾者がいる場合は復旧対象外
      invitation.expiresAt <= now ||//有効期限切れは復旧対象外
      (
        invitation.leaseExpiresAt !== null &&
        invitation.leaseExpiresAt > now//リース（招待処理中である）がまだあるのは対象外
      )
    ) {
      return "INVITATION_NOT_RECOVERABLE";///招待が復旧できない
    }

    if (
      (
        invitation.authUserId !== null &&
        invitation.authUserId !== options.authUserId
      ) ||
      (
        invitation.membership !== null &&
        (
          invitation.membership.clubId !== club.id ||
          invitation.membership.userId !== options.authUserId ||
          invitation.membership.status !== "INVITED"
        )
      )
    ) {
      return "AUTH_USER_MISMATCH";//認証ユーザーがミスマッチ
    }

 
    const user = await dependencies.getAuthUser({//既知のAuth IDをAuthで照合し、アカウントの有無と本人確認をする関数にかける
      authUserId: options.authUserId,
      email: invitation.email,
    });

    if (
      !user ||//アカウントなしもしくは本人確認不可、もしくは
      user.id !== options.authUserId ||
      normalizeEmail(user.email) !== invitation.email//メアド正規化関数で正規化したメアドと招待データ内のメアドが一致しない
    ) {
      return "AUTH_USER_MISMATCH";//認証ユーザーが一致しない
    }

    const byEmail = await db.appUser.findUnique({//db:プリズマクライアント
      where: {
        email: invitation.email,
      },
      select: {
        id: true,
      },
    });
    const byId = await db.appUser.findUnique({//db:プリズマクライアント
      where: {
        id: user.id,
      },
      select: {
        email: true,
      },
    });
    const membership = await db.clubMembership.findUnique({//db:プリズマクライアント
      where: {
        clubId_userId: {
          clubId: club.id,
          userId: user.id,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (
      (byEmail && byEmail.id !== user.id) ||
      (byId?.email && normalizeEmail(byId.email) !== invitation.email) ||//メアド正規化関数にかけたメアドと招待データ内のメアドが一致しない
      (
        membership &&
        (
          membership.id !== invitation.membershipId ||
          membership.status !== "INVITED"
        )
      )
    ) {
      return "APP_USER_OR_MEMBERSHIP_MISMATCH";//アプリユーザーまたはメンバーシップが一致しない
    }

    if (options.mode === "dry-run") {//もし入力値を検証した値の中のモードがテスト実行(保存されない)であるなら
      return "DRY_RUN_READY";//テスト実行の準備完了を返す
    }

    const claimedAt = new Date();
    const claimToken = randomUUID();//クレームトークンを作成する
    const leaseExpiresAt = new Date(claimedAt.getTime() + 5 * 60 * 1_000);//リース(招待処理中)の有効期限を今から５分後に設定する

    //招待テーブルにある準備中のデータのクレームトークンとリース（招待処理中）の有効期限を最新にアップデートする
    const updated = await db.clubInvitation.updateMany({//db:プリズマクライアント
      where: {
        id: invitation.id,
        clubId: club.id,
        updatedAt: invitation.updatedAt,
        status: "PREPARING",
        acceptedAt: null,
        authUserId: invitation.authUserId,
        membershipId: invitation.membershipId,
        expiresAt: {
          gt: claimedAt,
        },
        OR: [
          {
            leaseExpiresAt: null,
          },
          {
            leaseExpiresAt: {
              lte: claimedAt,
            },
          },
        ],
        club: {
          is: {
            slug: options.clubSlug,
            memberships: {
              some: {
                id: owner.id,
                role: "OWNER",
                status: "ACTIVE",
              },
            },
          },
        },
      },
      data: {
        claimToken,
        leaseExpiresAt,
      },
    });

    if (updated.count !== 1) {
      return "CLAIM_LOST";
    }

    claim = {
      clubId: club.id,
      actorMembershipId: owner.id,
      invitationId: invitation.id,
      claimToken,
    };
    const recorded = await dependencies.recordAuthUser({//DBのクラブ招待テーブルの認証済みユーザーIDを更新する関数
      ...claim,
      verifiedAuthUser: user,
    });

    if (recorded.outcome !== "UPDATED") {
      return recorded.outcome;
    }

    const result = await dependencies.recoverPreparation({//障害からの復旧処理(途中でクラッシュするなどして「準備中（PREPARING）」のままロックされてしまった招待データを、安全に元の正常なステータス（準備完了）へ戻す関数
      clubId: club.id,
      actorMembershipId: owner.id,
      invitation: {
        id: invitation.id,
        clubId: club.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        status: "PREPARING",
        authUserId: user.id,
        existingUserId: invitation.membership?.userId ?? byEmail?.id ?? null,
        membershipId: invitation.membershipId,
        claimToken,
        leaseExpiresAt,
        expiresAt: invitation.expiresAt,
        attemptCount: invitation.attemptCount,
      },
    });

    return result.outcome;
  } catch {
    return "RECOVERY_FAILED";
  } finally {//成功しようが失敗しようが以下を実行する
    if (claim) {
      try {
        await dependencies.releaseClaim(claim);//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態で、RESENDへの招待メールの依頼準備完了時とRESENDへの依頼完了時にクレームトークンと有効期限をnullにする関数
      } catch {
        // 解除失敗時はlease期限後に確認し直す。例外原文は表示しない。
      }
    }
  }
}

//復旧システム（有効期限切れの準備中から準備完了へ）の「全体を統括するメインの処理（エントリーポイント）
async function main(): Promise<void> {
  let db: PrismaClient | undefined;

  try {
    const options = parseRecoveryOptions(process.argv.slice(2));//ユーザーがターミナルで打ったコマンドから渡された「データ（設定やID）」をプログラムが読める形に整理（パース）する
    const database = await import("../src/infrastructure/prisma/client");
    db = database.prisma;
    const repository = await import(
      "../src/infrastructure/prisma/repositories/club-invitation-repository"
    );
    const auth = await import("../src/infrastructure/supabase/club-invitation-auth");
    const service = await import("../src/application/club/invitation/recover-club-invitation");
    const outcome = await recoverClubInvitation(options, {//「準備中」でリースが切れたクラブ招待を復旧させ送信準備完了にする関数
      db,
      getAuthUser: auth.getClubInvitationAuthUserById,// 既知のAuth IDをAuthで照合し、アカウントの有無と本人確認をする関数。
      recordAuthUser: repository.recordClubInvitationAuthUser,//DBのクラブ招待テーブルの認証済みユーザーIDを更新する関数
      recoverPreparation: service.recoverClubInvitationPreparation,//障害からの復旧処理(途中でクラッシュするなどして「準備中（PREPARING）」のままロックされてしまった招待データを、安全に元の正常なステータス（準備完了）へ戻す関数
      releaseClaim: repository.releaseClubInvitationClaim,//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態で、RESENDへの招待メールの依頼準備完了時とRESENDへの依頼完了時にクレームトークンと有効期限をnullにする関数
    });

    console.log(JSON.stringify({//コマンドを打った結果をターミナルに出す
      clubSlug: options.clubSlug,
      clubId: options.clubId,
      invitationId: options.invitationId,
      actorMembershipId: options.actorMembershipId,
      mode: options.mode,
      outcome,
    }));

    if (outcome !== "DRY_RUN_READY" && outcome !== "RECOVERED") {
      process.exitCode = 1;
    }
  } catch {
    console.error("復旧に失敗しました。実行環境・確認用ID・実行モードを確認してください。");
    process.exitCode = 1;
  } finally {//成功しても失敗しても以下を実行する
    try {
      await db?.$disconnect();//DBとの接続を切断する
    } catch {
      process.exitCode = 1;//切断失敗したなら終了ステータスにエラーを記録する
    }
  }
}

//ターミナルから直接復旧のテスト/本番実行されたのかどうかを判定し、
// 直接実行された場合だけメイン処理（main()）をスタートさせるためのスイッチ
const directlyExecuted = typeof require !== "undefined"
  ? require.main === module//require で一番最初に呼び出されたメインのファイル」と「このファイル」が同一人物かどうかをチェック(CommonJSの場合)
  : Boolean(
      process.argv[1] &&
      import.meta.url === pathToFileURL(process.argv[1]).href,//「このファイルの場所（URL）」と「ターミナルから実行されたプログラムのパス」を比較(ES Modulesの場合)
    );

if (directlyExecuted) {
  void main();
}
