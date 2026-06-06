// lib/validations/session-application.ts
// 体験/見学申し込みフォームのバリデーションスキーマ

import { z } from "zod";//バリデーションするための道具

const participationTypes = ["TRIAL", "OBSERVATION"] as const;

const childGrades = [
  "YOUJI",
  "ELEMENTARY_1",
  "ELEMENTARY_2",
  "ELEMENTARY_3",
  "ELEMENTARY_4",
  "ELEMENTARY_5",
  "ELEMENTARY_6",
] as const;

const experienceYears = [
  "NONE",
  "LESS_THAN_1YEAR",
  "YEARS_1_OR_MORE",
] as const;

function isPastDate(dateText: string) {
  const inputDate = new Date(`${dateText}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return inputDate < today;
}

export const sessionApplicationSchema = z
  .object({
    type: z.enum(participationTypes, {
      error: "参加内容を選択してください",
    }),

    childName: z
      .string()
      .trim()
      .min(1, "子どもの名前を入力してください")
      .max(50, "子どもの名前は50文字以内で入力してください"),

    childNameKana: z
      .string()
      .trim()
      .min(1, "フリガナを入力してください")
      .max(50, "フリガナは50文字以内で入力してください"),

    childGrade: z.enum(childGrades, {
      error: "学年を選択してください",
    }),

    experience: z.enum(experienceYears, {
      error: "経験年数を選択してください",
    }),

    preferredDate1: z
      .string()
      .min(1, "第一希望日を入力してください")
      .refine((value) => !isPastDate(value), {
        message: "第一希望日は今日以降の日付を入力してください",
      }),

    preferredDate2: z.string().optional(),

    email: z
      .string()
      .trim()
      .max(255, "メールアドレスは255文字以内で入力してください")
      .pipe(z.email({ error: "メールアドレスの形式が正しくありません" })),

    emailConfirm: z
      .string()
      .trim()
      .max(255, "確認用メールアドレスは255文字以内で入力してください")
      .pipe(
        z.email({
          error: "確認用メールアドレスの形式が正しくありません",
        })
      ),

    phone: z
      .string()
      .trim()
      .max(20, "電話番号は20文字以内で入力してください")
      .optional()
      .refine(
        (value) => !value || /^[0-9+\-\s()]+$/.test(value),
        "電話番号の形式が正しくありません"
      ),

    agreed: z.unknown().refine((value) => value === "on", {
      message: "プライバシーポリシーに同意してください",
    }),
  })
  .refine((data) => data.email === data.emailConfirm, {
    path: ["emailConfirm"],
    message: "メールアドレスが一致しません",
  })
  .refine(
    (data) =>
      !data.preferredDate2 || data.preferredDate1 !== data.preferredDate2,
    {
      path: ["preferredDate2"],
      message: "第一希望日と第二希望日は別の日付を入力してください",
    }
  )
  .refine((data) => !data.preferredDate2 || !isPastDate(data.preferredDate2), {
    path: ["preferredDate2"],
    message: "第二希望日は今日以降の日付を入力してください",
  });

export type SessionApplicationInput = z.infer<
  typeof sessionApplicationSchema
>;