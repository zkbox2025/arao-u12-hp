// lib/validations/contact.ts
// お問い合わせフォームのバリデーションスキーマ

import { z } from "zod";

export const contactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "お名前を入力してください")
      .max(50, "お名前は50文字以内で入力してください"),

    nameKana: z
      .string()
      .trim()
      .min(1, "フリガナを入力してください")
      .max(50, "フリガナは50文字以内で入力してください"),

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

    content: z
      .string()
      .trim()
      .min(1, "お問い合わせ内容を入力してください")
      .max(2000, "お問い合わせ内容は2000文字以内で入力してください"),

    agreed: z.unknown().refine((value) => value === "on", {
      message: "プライバシーポリシーに同意してください",
    }),
  })
  .refine((data) => data.email === data.emailConfirm, {
    path: ["emailConfirm"],
    message: "メールアドレスが一致しません",
  });

export type ContactInput = z.infer<typeof contactSchema>;