// types/prisma.ts
// Prisma由来の型をアプリ内で使いやすく集約する
//必要になったら随時追加すること（アプリは現在PlanType,ClubMemberRole,PlatformAdminRoleのみ追加済み）

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
  PlanType,
  PlatformAdminRole,
} from "@prisma/client";

export type { ApplicationStatus as SessionApplicationStatus } from "@prisma/client";