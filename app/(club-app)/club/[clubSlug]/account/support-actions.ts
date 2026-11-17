// app/(club-app)/club/[clubSlug]/account/support-actions.ts
//サポート報告を作成する本丸のアクション関数

"use server";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import {
  requireActiveClubMembership, // ログイン情報からACTIVEなクラブ所属とクラブ情報を取得する関数
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  requireClubFeature, // プランに応じた機能が無効な場合はエラーを投げる関数
} from "@/domain/club/plan-features";
import {
  buildSupportReportFormValues, // サポート報告の表示用フォーム値を生成する関数
  parseSupportReportFormData, // フォームのcategory・messageを検証する関数
  SUPPORT_REPORT_FAILED_MESSAGE, // サポート報告の送信失敗メッセージ
  SUPPORT_REPORT_INITIAL_VALUES, // サポート報告フォームの初期値
  type SupportReportActionState, // サポート報告のアクションステイトの型
  type SupportReportFormValues, // サポート報告フォームの値の型
} from "@/domain/club/support/support-report-form";
import {
  sanitizeSupportPageUrl, // 値（URL）が特定のクラブの正しいアカウントページのURLかを検証する関数
  sanitizeSupportUserAgent, // 値を不正な文字の削除や長さのトリミング、空白除去する関数
} from "@/domain/club/support/support-report-metadata";
import {
  createRequestId, // 新しいrequestIdをUUID v4形式で生成する関数
  isRequestId, // 値がUUID v4形式のrequestIdか検証する関数
} from "@/domain/shared/request-id";
import {
  createSupportReport, // サポート報告のフォーム値を受け取り、DBに保存し、RESENDへメール送信依頼を行い、サポート報告の開発者への通知結果（通知時間と通知エラーコード）をDBに保存するサポート報告の一連の関数
} from "@/src/application/club/support/create-support-report";

//有効期限切れのメッセージ
const EXPIRED_FORM_MESSAGE =
  "フォームの有効期限が切れました。ページを開き直してください。";

// サポート報告のアクションステイトのエラーとして出力するラッパー関数
function errorState(
  values: SupportReportFormValues,// サポート報告フォームの値の型
  requestId: string,
  formError: string | null,
  fieldErrors: SupportReportActionState["fieldErrors"] = {},// サポート報告のアクションステイトの中のエラー項目
): SupportReportActionState {// サポート報告のアクションステイトの型
  return {
    status: "error",
    values,
    fieldErrors,
    formError,
    requestId,
  };
}

//クラブスラッグから特定のクラブの正しいアカウントページのURLを生成する関数
function accountPageUrl(clubSlug: string): string | null {
  try {
    return sanitizeSupportPageUrl(// 値（URL）が特定のクラブの正しいアカウントページのURLかを検証する関数
      `/club/${encodeURIComponent(clubSlug)}/account`,
      clubSlug,
    );
  } catch {
    return null;
  }
}

/** 
 * サポート報告を作成する本丸のアクション関数
 */
export async function createSupportReportAction(
  clubSlug: string,
  previousState: SupportReportActionState,// サポート報告のアクションステイトの型
  formData: FormData,
): Promise<SupportReportActionState> {// サポート報告のアクションステイトの型
  const access = await requireActiveClubMembership(clubSlug);// ログイン情報からACTIVEなクラブ所属とクラブ情報を取得する関数
  requireClubFeature(access.club, "CLUB_APP");// プランに応じた機能が無効な場合はエラーを投げる関数

  const values = buildSupportReportFormValues(formData);// サポート報告の表示用フォーム値を生成する関数
  const previousId = (
    typeof previousState === "object" &&//以前のステイトがオブジェクトで、かつ
    previousState !== null &&//nullではなく、かつ
    !Array.isArray(previousState)//配列ではない場合は以前のステイトのリクエストIDを使う。違うならundefined
  ) ? previousState.requestId : undefined;
  const requestId = isRequestId(previousId) ? previousId : createRequestId();//previousIdがUUID v4形式であればそれをリクエストIDとし、違うなら新しいrequestIdをUUID v4形式で生成する
  const submittedIds = formData instanceof FormData ? formData.getAll("requestId") : [];

  if (
    submittedIds.length !== 1 ||
    !isRequestId(submittedIds[0]) ||// 値がUUID v4形式のrequestIdか検証し違う場合
    submittedIds[0] !== previousId
  ) {
    return errorState(values, requestId, EXPIRED_FORM_MESSAGE);//有効期限切れのメッセージをサポート報告のアクションステイトのエラーとして出力するラッパー関数に入れる
  }

  const validation = parseSupportReportFormData(formData);// フォームのcategory・messageを検証する関数

  if (!validation.success) {
    return errorState(values, requestId, null, validation.fieldErrors);// validation.fieldErrorなどをサポート報告のアクションステイトのエラーとして出力するラッパー関数に入れる
  }

  try {
    const headersList = await headers();//いまブラウザから届いているリクエストのヘッダー情報（HTTP Headers）をすべてまとめて取得する処理
    const result = await createSupportReport(//サポート報告のフォーム値を受け取り、DBに保存し、RESENDへメール送信依頼を行い、サポート報告の開発者への通知結果（通知時間と通知エラーコード）をDBに保存するサポート報告の一連の関数
      access,
      requestId,
      validation.data,
      {
        pageUrl: accountPageUrl(access.club.slug),//クラブスラッグから特定のクラブの正しいアカウントページのURLを生成する関数
        userAgent: sanitizeSupportUserAgent(headersList.get("user-agent")),// 値を不正な文字の削除や長さのトリミング、空白除去する関数
      },
    );

    if (result.outcome !== "ACCEPTED") {
      return errorState(values, requestId, SUPPORT_REPORT_FAILED_MESSAGE);//サポート報告の送信失敗メッセージなどをサポート報告のアクションステイトのエラーとして出力するラッパー関数に入れる
    }
  } catch (error) {
    unstable_rethrow(error);//Next.jsが画面の表示やページ遷移（リダイレクト）を制御するために内部でわざと発生させている特殊なエラーを、横取りせずにそのままNext.jsにパスして（投げ直して）正常に処理させるための関数
    return errorState(values, requestId, SUPPORT_REPORT_FAILED_MESSAGE);// サポート報告の送信失敗メッセージなどをサポート報告のアクションステイトのエラーとして出力するラッパー関数に入れる
  }

  return {
    status: "success",
    values: {
      ...SUPPORT_REPORT_INITIAL_VALUES,// サポート報告フォームの初期値
    },
    fieldErrors: {},
    formError: null,
    requestId: createRequestId(),// 新しいrequestIdをUUID v4形式で生成する関数
  };
}
