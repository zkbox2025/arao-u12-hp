// constants/adminLabels.ts
// 管理画面の表示ラベル

import type {
  ContactStatus,
  SessionApplicationStatus,
  ContentStatus,
  Grade,
  ExperienceYears,
  FormType,
  SessionType,
} from "@/types/prisma";

export const CONTACT_STATUS_LABELS = {
  PENDING: "未回答",
  REPLIED: "回答済み",
} as const satisfies Record<ContactStatus, string>;

export const APPLICATION_STATUS_LABELS = {
  PENDING: "参加待ち",
  ATTENDED: "参加済み",
  CANCELED: "キャンセル",
} as const satisfies Record<SessionApplicationStatus, string>;

export const SESSION_TYPE_LABELS = {
  TRIAL: "体験",
  OBSERVATION: "見学",
} as const satisfies Record<SessionType, string>;

export const GRADE_LABELS = {
  YOUJI: "幼児",
  ELEMENTARY_1: "小学1年生",
  ELEMENTARY_2: "小学2年生",
  ELEMENTARY_3: "小学3年生",
  ELEMENTARY_4: "小学4年生",
  ELEMENTARY_5: "小学5年生",
  ELEMENTARY_6: "小学6年生",
} as const satisfies Record<Grade, string>;

export const EXPERIENCE_LABELS = {
  NONE: "未経験",
  LESS_THAN_1YEAR: "1年未満",
  YEARS_1_OR_MORE: "1年以上",
} as const satisfies Record<ExperienceYears, string>;

export const CONTENT_STATUS_LABELS = {
  DRAFT: "下書き",
  PUBLISHED: "公開中",
} as const satisfies Record<ContentStatus, string>;

export const FORM_NOTIFICATION_SETTINGS = [
  {
    formType: "CONTACT",
    label: "お問い合わせ通知先",
    description: "お問い合わせフォーム送信時に、以下のメールアドレスへ通知します。",
  },
  {
    formType: "SESSION_APPLICATION",
    label: "体験/見学申し込み通知先",
    description:
      "体験/見学申し込みフォーム送信時に、以下のメールアドレスへ通知します。",
  },
] as const satisfies readonly {
  formType: FormType;
  label: string;
  description: string;
}[];

export type FormNotificationType =
  (typeof FORM_NOTIFICATION_SETTINGS)[number]["formType"];

