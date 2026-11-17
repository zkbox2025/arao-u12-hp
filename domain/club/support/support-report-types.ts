// domain/club/support/support-report-types.ts
//サポート報告が届いた際の開発者への通知結果やサポート報告の作成結果など

import type {
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  SupportReportCategory,//"BUG" | "QUESTION" | "REQUEST" | "OTHER"
} from "@/types/prisma";

//サポート報告で使うメタデータ（データに付随するデータ）の型
export type SupportReportMetadata = {
  pageUrl: string | null;
  userAgent: string | null;//見ているブラウザやOSのデータ
};

//サポート報告の受付完了データの型
export type SupportReportReceipt = SupportReportMetadata & {//サポート報告で使うメタデータ（ページURLとユーザーエージェント）の型と以下のデータ
  id: string;
  clubId: string;
  membershipId: string | null;
  clubName: string;
  category: SupportReportCategory;//"BUG" | "QUESTION" | "REQUEST" | "OTHER"
  message: string;
  reporterName: string | null;
  reporterEmail: string | null;
  reporterRole: ClubMemberRole | null;//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  createdAt: Date;
};

//サポート報告の作成結果の型
export type SupportReportCreationResult =
  | {
      outcome: "CREATED";
      report: SupportReportReceipt;//サポート報告の受付完了データ
    }
  | {
      outcome: "ALREADY_ACCEPTED";//既に承諾済み
    }
  | {
      outcome: "FORBIDDEN" | "CONFLICT" | "CREATE_FAILED";//閲覧禁止、衝突、作成失敗
    };

//サポート報告が届いたことを開発者に通知しようとした際のエラーコード
export type SupportReportNotificationErrorCode =
  | "EMAIL_CONFIGURATION_MISSING"//メアドの設定ミス
  | "EMAIL_SEND_FAILED"//メールの送信失敗
  | "EMAIL_SEND_RESULT_UNKNOWN";//メールの送信結果が不明

//サポート報告が届いた際の開発者への通知結果
export type SupportReportNotificationResult =
  | {
      outcome: "ACCEPTED";//承諾済み
    }
  | {
      outcome: "FAILED";//失敗
      errorCode: Exclude<
        SupportReportNotificationErrorCode,//サポート報告が届いたことを開発者に通知しようとした際のエラーコードの中の"EMAIL_SEND_RESULT_UNKNOWN"を除いた値
        "EMAIL_SEND_RESULT_UNKNOWN"
      >;
    }
  | {
      outcome: "UNKNOWN";//不明
      errorCode: "EMAIL_SEND_RESULT_UNKNOWN";//メールの送信結果が不明
    };

//サポート報告が届いた際の開発者への通知の記録結果
export type SupportReportNotificationRecordResult = {
  outcome: "RECORDED" | "NOT_FOUND" | "UPDATE_FAILED";//記録済み、見つからない、更新失敗
};

//サポート報告の承諾結果
export type SupportReportAcceptanceResult = {
  outcome: "ACCEPTED" | "FORBIDDEN" | "CONFLICT" | "CREATE_FAILED";//承諾、閲覧禁止、衝突、作成失敗
};
