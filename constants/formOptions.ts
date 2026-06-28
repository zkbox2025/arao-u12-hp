// constants/formOptions.ts
// 体験/見学申し込みフォームで使う選択肢とバリデーション値を定義する

import type { ExperienceYears, Grade, SessionType } from "@/types/prisma";
import {
  EXPERIENCE_LABELS,
  GRADE_LABELS,
} from "@/constants/adminLabels";

// 管理画面では「体験」「見学」
// 公開フォームでは説明つきにする：「体験：練習に参加する」「見学：練習の様子を見る」
export const SESSION_TYPE_OPTIONS = [
  {
    value: "TRIAL",
    label: "体験：練習に参加する",
  },
  {
    value: "OBSERVATION",
    label: "見学：練習の様子を見る",
  },
] as const satisfies readonly {
  value: SessionType;
  label: string;
}[];

export const GRADE_OPTIONS = [
  {
    value: "YOUJI",
    label: GRADE_LABELS.YOUJI,
  },
  {
    value: "ELEMENTARY_1",
    label: GRADE_LABELS.ELEMENTARY_1,
  },
  {
    value: "ELEMENTARY_2",
    label: GRADE_LABELS.ELEMENTARY_2,
  },
  {
    value: "ELEMENTARY_3",
    label: GRADE_LABELS.ELEMENTARY_3,
  },
  {
    value: "ELEMENTARY_4",
    label: GRADE_LABELS.ELEMENTARY_4,
  },
  {
    value: "ELEMENTARY_5",
    label: GRADE_LABELS.ELEMENTARY_5,
  },
  {
    value: "ELEMENTARY_6",
    label: GRADE_LABELS.ELEMENTARY_6,
  },
] as const satisfies readonly {
  value: Grade;
  label: string;
}[];

export const EXPERIENCE_OPTIONS = [
  {
    value: "NONE",
    label: EXPERIENCE_LABELS.NONE,
  },
  {
    value: "LESS_THAN_1YEAR",
    label: EXPERIENCE_LABELS.LESS_THAN_1YEAR,
  },
  {
    value: "YEARS_1_OR_MORE",
    label: EXPERIENCE_LABELS.YEARS_1_OR_MORE,
  },
] as const satisfies readonly {
  value: ExperienceYears;
  label: string;
}[];

// 体験/見学フォームのバリデーションに使う値
// OPTIONSを正として、valueだけを取り出す
export const SESSION_TYPE_VALUES = SESSION_TYPE_OPTIONS.map(
  (option) => option.value
) as [
  (typeof SESSION_TYPE_OPTIONS)[number]["value"],
  ...Array<(typeof SESSION_TYPE_OPTIONS)[number]["value"]>,
];

export const GRADE_VALUES = GRADE_OPTIONS.map((option) => option.value) as [
  (typeof GRADE_OPTIONS)[number]["value"],
  ...Array<(typeof GRADE_OPTIONS)[number]["value"]>,
];

export const EXPERIENCE_VALUES = EXPERIENCE_OPTIONS.map(
  (option) => option.value
) as [
  (typeof EXPERIENCE_OPTIONS)[number]["value"],
  ...Array<(typeof EXPERIENCE_OPTIONS)[number]["value"]>,
];