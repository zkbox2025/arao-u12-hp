// types/prisma.ts
// Prisma由来の型をアプリ内で使いやすく集約する
//必要になったら随時追加すること（アプリは現在PlanType,ClubMemberRole,PlatformAdminRole,ClubEventGenre,LineDeliveryStatusのみ追加済み）

//DBのテーブル
export type {
  SessionApplication,
  Contact,
  PageContent,
  Notice,
  Faq,
  FormSubmissionLog,
  FormNotificationSetting,
  LoginSubmissionLog,
  MonthlyPracticePlan,
  Staff,
  StaffPageSetting,
  AppUser,
  Club,
  ClubMembership,
  Child,
  ChildClubMembership,
  ClubInvitation,
  ClubEvent,
  ClubEventAttachment,
  ClubEventMemo,
  ClubEventRead,
  ClubNotice,
  ClubNoticeAttachment,
  ClubNoticeRead,
  ClubLineSetting,
  ClubLineTarget,
  ClubLineRegistrationToken,
  ClubLineDelivery,
  ClubEmailSetting,
  SupportReport,
  PlatformAdmin,
  StorageDeletionJob,
} from "@prisma/client";


//DBのenum
export type {
  ContactStatus,
  ApplicationStatus,
  ContentStatus,
  FaqCategory,
  Grade,
  ExperienceYears,
  FormType,
  LoginSubmissionResult,
  FormSubmissionResult,
  Type as SessionType,
  ClubMemberRole,
  ClubMembershipStatus,
  PlanType,
  ClubEventGenre,
  ClubNoticeGenre,
  PlatformAdminRole,
  LineDeliveryStatus,
  LineDeliveryContentType,
  ClubInvitationStatus,
  SupportReportCategory,
  SupportReportStatus,
  StorageDeletionSourceType,
  StorageDeletionStatus,
} from "@prisma/client";

export type { ApplicationStatus as SessionApplicationStatus } from "@prisma/client";