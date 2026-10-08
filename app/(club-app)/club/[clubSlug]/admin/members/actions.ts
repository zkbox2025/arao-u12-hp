// app/(club-app)/club/[clubSlug]/admin/members/actions.ts
// OWNER用メンバーシップ管理の更新Server Action

"use server";

import {
  notFound,
  redirect,
} from "next/navigation";

import {
  requireClubAppOwnerAccess,//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  revalidateClubMemberPaths,//(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
} from "@/app/(club-app)/club/revalidate-club-paths";

import {
  buildClubMemberUpdateFormValues,//フォーム送信後のエラー時に入力値に入れるためのデフォルト値を作成する関数
  validateClubMemberUpdateFormValues,//クラブメンバー更新のフォームの値のバリデーション関数
  type ClubMemberUpdateActionState,//クラブメンバー更新用のアクションステイト
} from "@/domain/club/member/member-update-form";

import {
  isRequestId,//値がUUID v4形式のrequestIdか検証する。
} from "@/domain/shared/request-id";

import {
  convertPrismaError,//PrismaエラーをDomainErrorへ変換する関数
} from "@/src/infrastructure/prisma/prisma-error";

import {
  updateClubMembershipForOwner,//OWNERが同じクラブのMembershipだけを更新する。操作者確認、対象取得、ACTIVE OWNER数確認、更新は Serializable transaction内で一体として行う。
} from "@/src/infrastructure/prisma/repositories/club-membership-repository";

const EXPIRED_FORM_MESSAGE =
  "フォームの有効期限が切れました。もう一度お試しください。";

const INVITED_OWNER_NOT_ALLOWED_MESSAGE =
  "招待中のメンバーをOWNERに変更できません。";

const INVITATION_STATUS_CHANGE_NOT_ALLOWED_MESSAGE =
  "招待中の在籍状態はこの画面から変更できません。";

const LAST_ACTIVE_OWNER_MESSAGE =
  "最後の有効なOWNERは降格・利用停止・退会扱いにできません。先に別のメンバーをOWNERに設定してください。";

/**
 * OWNERが同じクラブのMembershipのrole・statusを更新する。
 * page側の認可とは別に、Action自身でも必ずOWNER認可する。
 */
export async function updateClubMembershipAction(
  clubSlug: string,
  targetMembershipId: string,
  previousState:
    ClubMemberUpdateActionState,
  formData: FormData,
): Promise<ClubMemberUpdateActionState> {

  const access =
    await requireClubAppOwnerAccess(//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数
      clubSlug,
    );

  const values =
    buildClubMemberUpdateFormValues(//フォーム送信後のエラー時に入力値に入れるためのデフォルト値を作成する関数
      formData,
    );

  const requestId =
    formData.get("requestId");

    //※処理が「成功（success）」または「エラー（error）」で終わり、次の画面の状態（State）が決まったときに次回のリクエストIDが発行されてstateに含まれる
    //それがフォームデータ内のリクエストIDと同じかを検証する（同じである必要がある。同じでなかったら二重送信の可能性あり）
  if (
    !isRequestId(requestId) ||//値がUUID v4形式のrequestIdではない
    requestId !==
      previousState.requestId//リクエストIDが異なる
  ) {
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError:
        EXPIRED_FORM_MESSAGE,//"フォームの有効期限が切れました。もう一度お試しください。"
      requestId:
        previousState.requestId,
    };
  }

  const validation =
    validateClubMemberUpdateFormValues(//クラブメンバー更新のフォームの値のバリデーション関数
      values,
    );

  if (!validation.success) {
    return {
      status: "error",
      values,
      fieldErrors:
        validation.fieldErrors,
      formError: null,
      requestId:
        previousState.requestId,
    };
  }

  let updateResult://OWNERが同じクラブのMembershipだけを更新する関数の戻り値を「updateResult」とする
    Awaited<
      ReturnType<
        typeof updateClubMembershipForOwner//OWNERが同じクラブのMembershipだけを更新する。操作者確認、対象取得、ACTIVE OWNER数確認、更新は Serializable transaction内で一体として行う。
      >
    >;

  try {
    updateResult =
      await updateClubMembershipForOwner({//OWNERが同じクラブのMembershipだけを更新する。操作者確認、対象取得、ACTIVE OWNER数確認、更新は Serializable transaction内で一体として行う。
        /*
         * 【追加・重要】
         * clubIdとactorMembershipIdはクライアントから受け取らず、
         * OWNER認可結果だけを使用する。
         */
        clubId:
          access.club.id,
        actorMembershipId:
          access.membership.id,
        targetMembershipId,
        role:
          validation.data.role,
        status:
          validation.data.status,
      });
  } catch (error) {
    const domainError =
      convertPrismaError(error);//PrismaエラーをDomainErrorへ変換する。

    /*
     * 氏名・メールアドレス・フォーム入力値はログへ出さない。
     */
    console.error(
      "updateClubMembershipAction failed",
      {
        clubId:
          access.club.id,
        targetMembershipId,
        actorMembershipId:
          access.membership.id,
        requestId,
        code:
          domainError.code,
      },
    );

    return {
      status: "error",
      values,
      fieldErrors: {},
      formError:
        domainError.publicMessage,
      requestId:
        previousState.requestId,
    };
  }

  /*
   * 【追加】
   * 対象や操作者の存在・権限の差を外部へ漏らさず404に統一する。
   * notFound()は内部例外を使うため、DB用try/catchの外で呼ぶ。
   */
  if (
    updateResult.outcome ===
      "NOT_FOUND" ||
    updateResult.outcome ===
      "ACTOR_NOT_ACTIVE_OWNER"
  ) {
    notFound();
  }

  if (
    updateResult.outcome ===
    "RULE_VIOLATION"
  ) {
    const violationReason =
      updateResult.reason;

    switch (violationReason) {
      case "INVITED_OWNER_NOT_ALLOWED"://招待中のメンバーをOWNERに変更できません
        return {
          status: "error",
          values,
          fieldErrors: {
            role: [
              INVITED_OWNER_NOT_ALLOWED_MESSAGE,//招待中のメンバーをOWNERに変更できません
            ],
          },
          formError: null,
          requestId:
            previousState.requestId,
        };

      case "INVITATION_STATUS_CHANGE_NOT_ALLOWED"://招待中にステータスの変更はできません
        return {
          status: "error",
          values,
          fieldErrors: {
            status: [
              INVITATION_STATUS_CHANGE_NOT_ALLOWED_MESSAGE,//招待中にステータスの変更はできません
            ],
          },
          formError: null,
          requestId:
            previousState.requestId,
        };

      case "LAST_ACTIVE_OWNER"://最後のオーナーのステータス変更はできません
        return {
          status: "error",
          values,
          fieldErrors: {},
          formError:
            LAST_ACTIVE_OWNER_MESSAGE,//最後のオーナーのステータス変更はできません
          requestId:
            previousState.requestId,
        };

      default: {
        /*
         * Domainへ違反種別が追加された際に、
         * Action側の変換漏れを型エラーで検出する。
         */
        const exhaustiveReason:
          never =
            violationReason;

        return exhaustiveReason;
      }
    }
  }

  revalidateClubMemberPaths(
    access.club.slug,
  );

  //自身の役割やステータスを変更した場合はtrue
  const updatedSelf =
    updateResult.membership.id ===
    access.membership.id;

    //自身がオーナーから異なる役職になった場合、クラブメンバーシップ管理ページは閲覧不可なので、
    //その判定に使う
  const selfIsNoLongerActiveOwner =
    updatedSelf &&
    (
      updateResult.membership.role !==
        "OWNER" ||
      updateResult.membership.status !==
        "ACTIVE"
    );

  /*
   * 自分自身がACTIVE OWNERではなくなった場合、
   * 以後利用できない管理ページへ戻さずクラブ選択へ移動する。
   */
  if (selfIsNoLongerActiveOwner) {
    redirect("/club/select");
  }

  const query =
    new URLSearchParams({
      toast: "member-updated",
      toastId: requestId,
    });

  redirect(
    `/club/${encodeURIComponent(
      access.club.slug,
    )}/admin/members?${query.toString()}`,
  );
}
