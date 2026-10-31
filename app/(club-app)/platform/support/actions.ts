// app/(club-app)/platform/support/actions.ts
//サポート報告のステータスとメモを更新するアクション関数

"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import {
  requirePlatformAdmin, // Auth本人と有効なPlatform管理者を照合して認可contextを返す関数
} from "@/app/(club-app)/platform/require-platform-admin";
import {
  isSupportReportVersion, // 正しい日時であることを判定し、正しければ日時を返す関数
  parseSupportReportNoteFormData, //サポート報告のメモを単一項目かのチェック後にバリデーションする関数
  parseSupportReportStatusFormData, // サポート報告のステータスを単一項目かのチェック後にバリデーションする関数
  type SupportReportManagementField, //サポート報告の管理の項目
} from "@/domain/platform/support/support-report-management-form";
import type {
  ActionState, // 共通Action state型
} from "@/domain/shared/action-state";
import {
  createRequestId, // 新しいrequestIdをUUID v4形式で生成する関数
  isRequestId, // 値がUUID v4形式のrequestIdか検証する関数
} from "@/domain/shared/request-id";
import {
  updatePlatformSupportNote, //プラットフォームのサポート報告のメモを更新する関数。
  updatePlatformSupportStatus, //プラットフォームのサポート報告のステータスを更新する関数
} from "@/src/application/platform/support/update-platform-support";

/**
 * 更新日時と最小成功情報だけのAction state型。
 * status・内部メモはstateへ反射せず、入力欄の保持は後続フォームが担当する。
 */
export type PlatformSupportActionState = ActionState< // 管理操作のstate型 / 共通Action state型
  {
    expectedUpdatedAt: string; // 次の操作に使うversionの文字列型
  },
  SupportReportManagementField, //サポート報告の管理の項目（reportIdは入力バリデーション（チェック）を行うために存在する）
  {
    outcome: "UPDATED" | "UNCHANGED"; // 保存済み・変更なしの分類型
    reportId: string; // 操作した報告IDの文字列型（処理が成功（または完了）した後に、フロントエンド側に対して「この reportId の処理が正常に終わりましたよ」と確実に通知するために存在する）
    updatedAt: string; // 最新versionの文字列型
    reloadRequired: boolean; // 保存後の再検証失敗を表す真偽値型
    message: string; // 固定の成功案内の文字列型
  }
>;

const FAILED_MESSAGE = "更新できませんでした。時間をおいて再度お試しください。";
const EXPIRED_MESSAGE = "フォームの有効期限が切れました。ページを再読み込みしてください。";

/**
 * エラーの場合のエラーステイト型
 * 送信内容や例外を反射せず、許可したversionと固定エラーだけを返す。
 */
function errorState( // 管理操作のエラーstateを作る関数
  requestId: string, // UUID v4のrequestIdの文字列型
  expectedUpdatedAt: string, // 検証済みversionまたは空文字の型
  formError: string | null, // 固定の全体エラーまたはnull型
  fieldErrors: PlatformSupportActionState["fieldErrors"] = {}, // 管理項目別エラーの型
): PlatformSupportActionState { //更新日時と最小成功情報だけのプラットフォームのサポート報告Action state型。
  return {
    status: "error",
    values: {
      expectedUpdatedAt,
    },
    fieldErrors,
    formError,
    requestId,
  };
}

/**
 * サポート報告のステータスかメモを更新する関数
 * 前回のステイトとリクエストIDと更新日時が正しいか検証して、入力値を検証した上でステータスかメモをDBで更新し、成功時にはバリデーションし、結果をステイトで出力する関数
 */
async function updateSupportReport( // 管理Actionの共通実行関数
  reportId: string, // サーバーでbindした対象報告IDの文字列型
  previousState: PlatformSupportActionState, // //更新日時と最小成功情報だけのプラットフォームのサポート報告Action state型。
  formData: FormData, // 単一値を検証するFormData型
  kind: "STATUS" | "NOTE", // 操作種別を選ぶリテラル型
): Promise<PlatformSupportActionState> { ////更新日時と最小成功情報だけのプラットフォームのサポート報告Action state型。
  let requestId = createRequestId(); // エラー返却にも使えるUUID v4の生成関数
  let expectedUpdatedAt = "";
  try {
    const access = await requirePlatformAdmin(); // 毎回Auth本人と最新Platform権限を確認する関数
    const previousId = (
      typeof previousState === "object" &&
      previousState !== null &&
      !Array.isArray(previousState) // 前stateが配列か判定するメソッド
    ) ? previousState.requestId : undefined;
    if (isRequestId(previousId)) { // 前stateの識別子がUUID v4か検証する関数
      requestId = previousId;
    }
    const submittedIds = formData instanceof FormData ? formData.getAll("requestId") : []; // FormData型の確認 / requestId全項目の取得メソッド
    const versions = formData instanceof FormData ? formData.getAll("expectedUpdatedAt") : []; // FormData型の確認 / version全項目の取得メソッド
    if (
      versions.length === 1 &&
      isSupportReportVersion(versions[0]) //正しい日時であることを判定し、正しければ日時を返す関数
    ) {
      expectedUpdatedAt = versions[0];
    }
    if (
      submittedIds.length !== 1 ||
      !isRequestId(submittedIds[0]) || // hidden識別子がUUID v4か検証する関数
      submittedIds[0] !== previousId
    ) {
      return errorState(requestId, expectedUpdatedAt, EXPIRED_MESSAGE); // 固定エラーstateを作る関数
    }
    const validation = kind === "STATUS"
      ? parseSupportReportStatusFormData(formData) // サポート報告のステータスを単一項目かのチェック後にバリデーションする関数
      : parseSupportReportNoteFormData(formData); //サポート報告のメモを単一項目かのチェック後にバリデーションする関数
    if (!validation.success) {
      return errorState(requestId, expectedUpdatedAt, null, validation.fieldErrors); // 検証済み項目エラーのstateを作る関数
    }
    const value = validation.data;
    if (value.reportId !== reportId) {
      return errorState(requestId, expectedUpdatedAt, "報告の指定が不正です。"); // ID不一致の固定エラーstate生成関数
    }
    // 保存後に識別子生成が失敗して成功を取り消さないよう、次回用IDを先に準備する。
    const nextRequestId = createRequestId(); // 次の独立操作に使うUUID v4の生成関数
    const result = "status" in value
      ? await updatePlatformSupportStatus(access, value) //プラットフォームのサポート報告のステータスを更新する関数。
      : await updatePlatformSupportNote(access, value); //プラットフォームのサポート報告のメモを更新する関数。
    switch (result.outcome) {
      case "UPDATED":
      case "UNCHANGED": {
        if (
          result.reportId !== reportId ||
          !isSupportReportVersion(result.updatedAt) //正しい日時であることを判定し、正しければ日時を返す関数
        ) {
          return errorState(requestId, expectedUpdatedAt, FAILED_MESSAGE); // 不正成功結果を固定エラーへ限定する関数
        }
        let reloadRequired = false;//リロードができなかったので手動でするように要請する可否
        if (result.outcome === "UPDATED") {
          try {
            revalidatePath("/platform/support"); // 管理一覧の固定パスだけを再検証する関数
          } catch (error) {
            unstable_rethrow(error); // Next制御例外だけを再送出する関数
            reloadRequired = true;//リロードができなかったので手動でするように要請する
          }
        }
        return {
          status: "success",
          values: {
            expectedUpdatedAt: result.updatedAt,
          },
          fieldErrors: {},
          formError: null,
          requestId: nextRequestId,
          data: {
            outcome: result.outcome,
            reportId: result.reportId,
            updatedAt: result.updatedAt,
            reloadRequired,
            message: reloadRequired
              ? "保存済みです。表示を更新できなかったため、未保存の内容を控えて再読み込みしてください。"
              : result.outcome === "UNCHANGED"
                ? "変更はありません。"
                : "保存しました。",
          },
        };
      }
      case "FORBIDDEN":
        return errorState(requestId, expectedUpdatedAt, "この操作を行う権限がありません。"); // 権限エラーstateの生成関数
      case "NOT_FOUND":
        return errorState(requestId, expectedUpdatedAt, "報告が見つかりません。再読み込みしてください。"); // 対象消失のエラーstate生成関数
      case "CONFLICT":
        return errorState( // 競合時の再読込案内を返すエラーstate生成関数
          requestId,
          expectedUpdatedAt,
          "他の操作で更新されています。未保存の内容を控えて再読み込みしてください。",
        );
      case "INVALID_INPUT":
        return errorState(requestId, expectedUpdatedAt, "入力内容を確認してください。"); // 入力エラーstateの生成関数
      default:
        return errorState(requestId, expectedUpdatedAt, FAILED_MESSAGE); // 固定の失敗state生成関数
    }
  } catch (error) {
    unstable_rethrow(error); // Auth・Service等のNext制御例外を再送出する関数
    return errorState(requestId, expectedUpdatedAt, FAILED_MESSAGE); // 例外原文を含まない固定エラーstate生成関数
  }
}

/**
 * サポート報告のステータスを更新する関数
 */
export async function updateSupportReportStatusAction( // status更新のServer Action関数
  reportId: string, // bindした対象報告IDの文字列型
  previousState: PlatformSupportActionState, //更新日時と最小成功情報だけのプラットフォームのサポート報告Action state型。
  formData: FormData, // ブラウザーが送信したFormData型
): Promise<PlatformSupportActionState> { //更新日時と最小成功情報だけのプラットフォームのサポート報告Action state型。
  return updateSupportReport(reportId, previousState, formData, "STATUS"); //サポート報告のステータスを更新する関数
}

/**
 * //サポート報告のメモを更新する関数
 */
export async function updateSupportReportNoteAction( // メモ保存のServer Action関数
  reportId: string, // bindした対象報告IDの文字列型
  previousState: PlatformSupportActionState, //更新日時と最小成功情報だけのプラットフォームのサポート報告Action state型。
  formData: FormData, // ブラウザーが送信したFormData型
): Promise<PlatformSupportActionState> { //更新日時と最小成功情報だけのプラットフォームのサポート報告Action state型。
  return updateSupportReport(reportId, previousState, formData, "NOTE"); //サポート報告のメモを更新する関数
}
