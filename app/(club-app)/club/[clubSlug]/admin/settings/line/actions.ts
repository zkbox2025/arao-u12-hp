// app/(club-app)/club/[clubSlug]/admin/settings/line/actions.ts
// OWNER用LINE通知設定のServer Action（ライン通知先更新アクションと登録コード発行保存アクション）

"use server";

import {
  notFound,
  redirect,
} from "next/navigation";

import {
  requireClubAppOwnerAccess,//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  revalidateClubSettingsPaths,//ラインの通知グループを追加編集した時の（オーナー用）ライン通知グループ管理ページのrevalidatePath実行関数
} from "@/app/(club-app)/club/revalidate-club-paths";

import {
  buildClubLineRegistrationCode,//createSecureToken()が返す256bit Base64URLトークンから、LINEへ投稿する登録コードを作る関数
  buildClubLineRegistrationCodeExpiresAt,//発行日時から10分後の有効期限を作る関数
  type ClubLineRegistrationCodeActionState,//ライン通知先アクションステイトの型（入力・エラー・戻り値）
} from "@/domain/club/line/line-registration-code";

import {
  buildClubLineTargetFormValues,//ライン通知先設定のFormDataを、エラー時にそのままフォームへ戻せる値へ変換する関数
  validateClubLineTargetFormValues,//LINE通知先編集フォームをバリデーションする関数
  type ClubLineTargetActionState,//ライン通知先アクションのステイト
} from "@/domain/club/line/line-target-form";

import {
  createRequestId,//リクエストIDを作成する関数
  isRequestId,//値がUUID v4形式のrequestIdか検証する。
} from "@/domain/shared/request-id";

import {
  convertPrismaError,//PrismaエラーをわかりやすいDomainErrorへ変換する。
} from "@/src/infrastructure/prisma/prisma-error";

import {
  findClubLineSettingsForOwner,//OWNERのみ閲覧可能なライン通知先設定画面へ表示するLINE設定一式をDBから取得する。
  replaceClubLineRegistrationToken,//新しい登録コードをハッシュ化したtoken hashをDBに保存する関数
  updateClubLineTargetForOwner,//OWNERが所属クラブのライン通知先を更新する関数
} from "@/src/infrastructure/prisma/repositories/club-line-setting-repository";

import {
  createSecureToken,//256bitの推測困難なトークンを生成する関数
  hashToken,//生トークンをSHA-256でハッシュ化する。
} from "@/src/infrastructure/security/token";

const EXPIRED_FORM_MESSAGE =
  "フォームの有効期限が切れました。もう一度お試しください。";

const LINE_SETTINGS_NOT_READY_MESSAGE =
  "LINE Messaging APIとWebhookの設定完了後に登録コードを発行してください。";


  //OWNERが所属クラブのLINE通知先を更新するアクション関数
export async function updateClubLineTargetAction(
  clubSlug: string,
  targetId: string,
  previousState:
    ClubLineTargetActionState,
  formData: FormData,
): Promise<ClubLineTargetActionState> {
  const access =
    await requireClubAppOwnerAccess(//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数
      clubSlug,
    );

  const values =
    buildClubLineTargetFormValues(//ライン通知先設定のFormDataを、エラー時にそのままフォームへ戻せる値へ変換する関数
      formData,
    );

  const requestId =
    formData.get("requestId");

  if (
    !isRequestId(requestId) ||//値がUUID v4形式のrequestIdか検証する
    requestId !==
      previousState.requestId
  ) {
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError:
        EXPIRED_FORM_MESSAGE,
      requestId:
        previousState.requestId,
    };
  }

  const validation =
    validateClubLineTargetFormValues(//LINE通知先編集フォームをバリデーションする関数
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

  let updated: boolean;//updatedという箱を作成する

  try {
    updated =
      await updateClubLineTargetForOwner({//OWNERが所属クラブのライン通知先を更新する関数
        clubId:
          access.club.id,
        targetId,
        targetName:
          validation.data.targetName,
        targetRoles:
          validation.data.targetRoles,
        isEnabled:
          validation.data.isEnabled,
      });
  } catch (error) {
    const domainError =
      convertPrismaError(error);//PrismaエラーをわかりやすいDomainErrorへ変換する。

    /*
     * 通知先名・role・LINE識別子は
     * ログへ出さない。
     */
    console.error(
      "updateClubLineTargetAction failed",
      {
        clubId:
          access.club.id,
        targetId,
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

  if (!updated) {
    notFound();
  }

  revalidateClubSettingsPaths(//ラインの通知グループを追加編集した時の（オーナー用）ライン通知グループ管理ページのrevalidatePath実行関数
    access.club.slug,
  );

  const query =//URLを不正な文字をなくして安全に作成する
    new URLSearchParams({
      toast:
        "line-settings-saved",//トースト表示のためのもの
      toastId: requestId,//同じ通知が何度も何度も画面に出てしまう重複バグを防ぐためのもの
    });

  redirect(
    `/club/${encodeURIComponent(
      access.club.slug,
    )}/admin/settings/line?${query.toString()}`,
  );
}

/**
 * LINEグループへ投稿する登録コードを発行しハッシュ化したものをDBに保存するアクション関数
 * 生コードはDBへ保存せず、成功したActionStateで一度だけ返す。
 */
export async function createClubLineRegistrationCodeAction(
  clubSlug: string,
  previousState:
    ClubLineRegistrationCodeActionState,//ライン通知先アクションステイトの型（入力・エラー・戻り値）
  formData: FormData,
): Promise<ClubLineRegistrationCodeActionState> {//ライン通知先アクションステイトの型（入力・エラー・戻り値）
  const access =
    await requireClubAppOwnerAccess(//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数
      clubSlug,
    );

  const requestId =
    formData.get("requestId");

  if (
    !isRequestId(requestId) ||//値がUUID v4形式のrequestIdか検証する
    requestId !==
      previousState.requestId
  ) {
    return {
      status: "error",
      values: {},
      fieldErrors: {},
      formError:
        EXPIRED_FORM_MESSAGE,
      requestId:
        previousState.requestId,
    };
  }

  const now =
    new Date();

  let settings:
    Awaited<//非同期処理の包み紙を破いて中身のデータの型だけを取り出す
      ReturnType<
        typeof findClubLineSettingsForOwner//OWNERのみ閲覧可能なライン通知先設定画面へ表示するLINE設定一式をDBから取得する関数の戻り値をsettingsの箱に入れる
      >
    >;

  try {
    settings =
      await findClubLineSettingsForOwner({//OWNERのみ閲覧可能なライン通知先設定画面へ表示するLINE設定一式をDBから取得する関数
        clubId:
          access.club.id,
        now,
      });
  } catch (error) {
    const domainError =
      convertPrismaError(error);//PrismaエラーをわかりやすいDomainErrorへ変換する。

    console.error(
      "createClubLineRegistrationCodeAction find failed",
      {
        clubId:
          access.club.id,
        requestId,
        code:
          domainError.code,
      },
    );

    return {
      status: "error",
      values: {},
      fieldErrors: {},
      formError:
        domainError.publicMessage,
      requestId:
        previousState.requestId,
    };
  }

  if (!settings?.isConnected) {
    return {
      status: "error",
      values: {},
      fieldErrors: {},
      formError:
        LINE_SETTINGS_NOT_READY_MESSAGE,
      requestId:
        previousState.requestId,
    };
  }

  const rawToken =
    createSecureToken();//256bitの推測困難なトークンを生成する。

  const registrationCode =
    buildClubLineRegistrationCode(//createSecureToken()が返す256bit Base64URLトークンから、LINEへ投稿する登録コードを作る関数
      rawToken,
    );

  const tokenHash =
    hashToken(//生トークン(登録コード全体)をSHA-256でハッシュ化する。
      registrationCode,
    );

  const expiresAt =
    buildClubLineRegistrationCodeExpiresAt(//発行日時から10分後の有効期限を作る
      now,
    );

  let created:
    Awaited<
      ReturnType<
        typeof replaceClubLineRegistrationToken//新しい登録コードをハッシュ化したtoken hashをDBに保存する関数の戻り値をcreatedの箱に入れる
      >
    >;

  try {
    created =
      await replaceClubLineRegistrationToken({//新しい登録コードをハッシュ化したtoken hashをDBに保存する関数
        clubId:
          access.club.id,
        createdByMembershipId:
          access.membership.id,
        tokenHash,
        expiresAt,
        now,
      });
  } catch (error) {
    const domainError =
      convertPrismaError(error);//PrismaエラーをDomainErrorへ変換する。

    /*
     * 生コード・token hash・暗号文は
     * ログへ出さない。
     */
    console.error(
      "createClubLineRegistrationCodeAction create failed",
      {
        clubId:
          access.club.id,
        requestId,
        code:
          domainError.code,
      },
    );

    return {
      status: "error",
      values: {},
      fieldErrors: {},
      formError:
        domainError.publicMessage,
      requestId:
        previousState.requestId,
    };
  }

  if (!created) {
    return {
      status: "error",
      values: {},
      fieldErrors: {},
      formError:
        LINE_SETTINGS_NOT_READY_MESSAGE,
      requestId:
        previousState.requestId,
    };
  }

  revalidateClubSettingsPaths(//ラインの通知グループを追加編集した時の（オーナー用）ライン通知グループ管理ページのrevalidatePath実行関数
    access.club.slug,
  );

  return {
    status: "success",
    values: {},
    fieldErrors: {},
    formError: null,
    data: {
      registrationCode,
      expiresAt:
        created.expiresAt.toISOString(),
    },

    /*
     * redirectしないActionなので、成功後は
     * 次回送信用requestIdへ更新する。
     */
    requestId:
      createRequestId(),//リクエストIDを作成する関数
  };
}
