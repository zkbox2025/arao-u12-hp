// types/prisma.ts
// Prisma由来の型をアプリ内で使いやすく集約する

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
} from "@prisma/client";

export type { ApplicationStatus as SessionApplicationStatus } from "@prisma/client";