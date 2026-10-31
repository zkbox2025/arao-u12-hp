// lib/mail/support-report-mail.ts
// サポート報告を開発者へメールで送るための依頼をRESENDへして結果を受け取るファイル

import "server-only";

import type { CreateEmailOptions } from "resend";//メール送信時に必要な設定項目のルール
import { z } from "zod";

import type {
  SupportReportNotificationResult,//サポート報告が届いた際の開発者への通知結果
  SupportReportReceipt,//サポート報告の受付完了データの型
} from "@/domain/club/support/support-report-types";
import { isRequestId } from "@/domain/shared/request-id";//値がUUID v4形式のrequestIdか検証する。


/** 
 * 正しいメールアドレスの形式かつ「最大254文字以内であるか」を同時にチェックするスキーマ
 */
const emailSchema = z.email().max(254);

// メアドを正しい形式か検証する関数
function validEmail(value: string | null | undefined): string | undefined {
  if (
    typeof value !== "string" ||
    /[\r\n]/u.test(value)
  ) {
    return undefined;
  }

  const parsed = emailSchema.safeParse(value.trim());//正しいメールアドレスの形式かつ「最大254文字以内であるか」を同時にチェックするスキーマ
  return parsed.success ? parsed.data : undefined;
}

//受付完了後にサポート報告のテキストを作成する関数
function buildReportText(report: SupportReportReceipt): string {//サポート報告の受付完了データの型
  return [
    "サポート報告を受け付けました。",
    "",
    `報告ID：${report.id}`,
    `受付日時（UTC）：${report.createdAt.toISOString()}`,
    `クラブ：${report.clubName}`,
    `クラブID：${report.clubId}`,
    `会員ID：${report.membershipId ?? "未設定"}`,
    `カテゴリ：${report.category}`,
    `報告者氏名：${report.reporterName ?? "未設定"}`,
    `報告者メール：${report.reporterEmail ?? "未設定"}`,
    `報告時の権限：${report.reporterRole ?? "未設定"}`,
    `ページ：${report.pageUrl ?? "未設定"}`,
    `ユーザーエージェント：${report.userAgent ?? "未設定"}`,
    "",
    "報告本文：",
    report.message,
  ].join("\n");
}

/** 
 * サポート報告を開発者へメールで送るための依頼をRESENDへして結果を受け取る関数
 */
export async function sendSupportReportEmail(
  report: SupportReportReceipt,//サポート報告の受付完了データの型
): Promise<SupportReportNotificationResult> {//サポート報告が届いた際の開発者への通知結果
  let mail: typeof import("./resend");

  try {
    mail = await import("./resend");
  } catch {
    // 共通モジュールの設定検証・SDK初期化失敗を安全な固定結果へ変換する。
    return {
      outcome: "FAILED",
      errorCode: "EMAIL_CONFIGURATION_MISSING",//メールの設定ミス
    };
  }

  const to = validEmail(mail.adminEmail);// メアドを正しい形式か検証する関数

  if (!to) {
    return {
      outcome: "FAILED",
      errorCode: "EMAIL_CONFIGURATION_MISSING",//メールの設定ミス
    };
  }

  let payload: CreateEmailOptions;//メール送信時に必要な設定項目のルール

  try {
    if (!isRequestId(report.id)) {//値がUUID v4形式のrequestIdか検証する。
      return {
        outcome: "FAILED",
        errorCode: "EMAIL_SEND_FAILED",
      };
    }

    const replyTo = validEmail(report.reporterEmail);// メアドを正しい形式か検証する関数
    payload = {//メール送信時に必要な設定項目は以下
      from: mail.buildMailFrom(report.clubName),
      to,
      subject: "【クラブ運営アプリ】サポート報告を受け付けました",
      text: buildReportText(report),//受付完了後にサポート報告のテキストを作成する関数
      ...(replyTo ? { replyTo } : {}),
    };
  } catch {
    // 送信前の本文生成失敗も、本文や個人情報を含まない結果にする。
    return {
      outcome: "FAILED",
      errorCode: "EMAIL_SEND_FAILED",//RESENDへの依頼失敗
    };
  }

  try {//RESENDへデータを送る
    const response = await mail.resend.emails.send(
      payload,//メール送信時に必要な設定項目
      {
        idempotencyKey: `support-report/${report.id}`,//二重送信防止用のユニークな合言葉（キー）
      },
    );

    if (
      !response.error &&
      typeof response.data?.id === "string" &&
      response.data.id.trim().length > 0
    ) {
      return {
        outcome: "ACCEPTED",//RESENDが承諾
      };
    }

    const statusCode = response.error?.statusCode;

    if (
      typeof statusCode === "number" &&
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 408 &&
      statusCode !== 409 &&
      response.error?.name !== "application_error"
    ) {
      return {
        outcome: "FAILED",
        errorCode: "EMAIL_SEND_FAILED",//RESENDへの依頼失敗
      };
    }
  } catch {
    // timeoutや通信切断後も受付済みの可能性があり、自動再送せず結果不明にする。
  }

  return {
    outcome: "UNKNOWN",
    errorCode: "EMAIL_SEND_RESULT_UNKNOWN",//RESENDへの依頼結果が不明
  };
}
