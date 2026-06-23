// lib/repositories/form-notification-setting.ts
// フォーム通知先メール設定の取得処理

import type { FormType } from "@/types/prisma";
import { prisma } from "@/src/infrastructure/prisma/client";

//DBからメール通知設定されたデータをすべて取得する関数
export async function findFormNotificationSettings() {
  return prisma.formNotificationSetting.findMany({
    orderBy: {
      formType: "asc",
    },
  });
}


//formType（問い合わせor体験見学申し込み）別のメール通知データを持ってくる関数
export async function findFormNotificationSettingByType(formType: FormType) {
  return prisma.formNotificationSetting.findUnique({
    where: {
      formType,
    },
  });
}

