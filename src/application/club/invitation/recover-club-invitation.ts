// src/application/club/invitation/recover-club-invitation.ts
//障害からの復旧処理(途中でクラッシュするなどして「準備中（PREPARING）」のままロックされてしまった招待データを、安全に元の正常なステータスへ戻す)

import "server-only";

import { normalizeEmail } from "@/domain/shared/email";//メアド正規化関数
import {
  completeClubInvitationPreparation,//オーナーがクラブ招待の処理権(クレーム)を保持している状態で、招待メール送信の準備を完了させる関数
  findClubInvitationsForOwner,//DBから特定クラブのクラブ招待データを全て取得して、処理しやすいようにまとめ直す関数
  releaseClubInvitationClaim,//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態で、RESENDへの招待メールの依頼準備完了時とRESENDへの依頼完了時にクレームトークンと有効期限をnullにする関数
  type ClubInvitationFailure,// 招待処理の権限・存在・処理権・業務ルールに関する失敗
  type ClubInvitationProcessing,//クラブ招待の処理中の型
} from "@/src/infrastructure/prisma/repositories/club-invitation-repository";
import {
  getClubInvitationAuthUserById,// 既知のAuth IDをAuthで照合し、アカウントの有無と本人確認をする関数。
} from "@/src/infrastructure/supabase/club-invitation-auth";

//クラブ招待準備の復旧結果の型
export type RecoverClubInvitationPreparationResult =
  | ClubInvitationFailure// 招待処理の権限・存在・処理権・業務ルールに関する失敗
  | {
      outcome: "RECOVERED";//復旧成功
      invitationId: string;
    }
  | {
      outcome: "MANUAL_RECOVERY_REQUIRED";//手動での復旧が必要
    }
  | {
      outcome: "RECOVERY_FAILED";//復旧失敗
    };

//障害からの復旧処理(途中でクラッシュするなどして「準備中（PREPARING）」のままロックされてしまった招待データを、安全に元の正常なステータスへ戻す関数
export async function recoverClubInvitationPreparation(
  input: {
    clubId: string;
    actorMembershipId: string;//操作者のメンバーシップID
    invitation: ClubInvitationProcessing;//クラブ招待の処理中の型
  },
): Promise<RecoverClubInvitationPreparationResult> {//クラブ招待準備の復旧結果の型
  const owner = {
    clubId: input.clubId,
    actorMembershipId: input.actorMembershipId,//操作者のメンバーシップID
  };
  const invitation = input.invitation;
  const claim = {
    ...owner,
    invitationId: invitation.id,
    claimToken: invitation.claimToken,
  };
  let ownsPreparation = false;//準備中の所有権を持っていない

  try {
    // Auth管理APIより前に現在のOWNER資格と招待状態を確認する。
    const result = await findClubInvitationsForOwner(owner);//DBから特定クラブのクラブ招待データを全て取得して、処理しやすいようにまとめ直す関数

    if (result.outcome !== "FOUND") {
      return result;
    }

    //すでに保存されている招待データ（result.invitations）の中から、今処理しようとしている招待（invitation）と同じIDを持つ行を検索し、
    // 見つかったデータを stored という変数に代入する
    const stored = result.invitations.find((row) => row.id === invitation.id);
    const now = Date.now();

    if (
      !stored ||
      invitation.clubId !== owner.clubId ||
      invitation.status !== "PREPARING" ||
      stored.status !== "PREPARING" ||
      normalizeEmail(stored.email) !== normalizeEmail(invitation.email) ||//メアド正規化関数
      !invitation.claimToken ||
      !(invitation.leaseExpiresAt.getTime() > now) ||
      !(invitation.expiresAt.getTime() > now) ||
      stored.leaseExpiresAt?.getTime() !== invitation.leaseExpiresAt.getTime() ||
      stored.expiresAt.getTime() !== invitation.expiresAt.getTime() ||
      (
        stored.membershipStatus !== null &&
        stored.membershipStatus !== "INVITED"
      )
    ) {
      return {
        outcome: "CLAIM_LOST",//クレームが失われている
      };
    }

    ownsPreparation = true;//準備中の所有権を持っている

    if (!invitation.authUserId) {
      // Auth ID未記録は粒度9の運営者手順へ委ね、新規Authで穴埋めしない。
      return {
        outcome: "MANUAL_RECOVERY_REQUIRED",//手動での復旧が必要
      };
    }

    if (
      invitation.existingUserId &&
      invitation.existingUserId !== invitation.authUserId
    ) {
      return {
        outcome: "RULE_VIOLATION",//ルール違反
        reason: "AUTH_USER_MISMATCH",//認証のユーザーIDが一致しない
      };
    }

    const user = await getClubInvitationAuthUserById({// 既知のAuth IDをAuthで照合し、アカウントの有無と本人確認をする関数。
      authUserId: invitation.authUserId,
      email: stored.email,
    });

    if (!user) {
      return {
        outcome: "MANUAL_RECOVERY_REQUIRED",//手動での復旧が必要
      };
    }

    if (
      user.id !== invitation.authUserId ||
      normalizeEmail(user.email) !== normalizeEmail(stored.email)//メアド正規化関数
    ) {
      return {
        outcome: "RULE_VIOLATION",//ルール違反
        reason: "AUTH_USER_MISMATCH",//認証のユーザーIDが一致しない
      };
    }

    // transaction内で記録済みID・email・clubId・状態・claimを再照合する。
    const prepared = await completeClubInvitationPreparation({//オーナーがクラブ招待の処理権(クレーム)を保持している状態で、招待メール送信の準備を完了させる関数
      ...claim,
      verifiedAuthUser: user,
    });

    if (prepared.outcome !== "PREPARED") {//もし準備完了でないなら準備完了後のデータを返す
      return prepared;
    }

    return {//それ以外は以下
      outcome: "RECOVERED",//復旧成功
      invitationId: invitation.id,
    };
  } catch {//エラーが出た場合は以下でキャッチする
    return {
      outcome: "RECOVERY_FAILED",//復旧失敗
    };
  } finally {
    if (ownsPreparation) {//準備中の所有権を持っている
      try {
        // 配送は行わないためclaimを解除する。失敗時はlease期限後に再試行する。
        await releaseClubInvitationClaim(claim);//クレームトークンと有効期限をnullにする関数(復旧時も他のサーバーから触れられないようにクレームトークンと有効期限を設けるため復旧処理が終わり次第、消費する)
      } catch {
        // 保存済みAuth IDと復旧地点を保持し、解除障害の原文を残さない。
      }
    }
  }
}
