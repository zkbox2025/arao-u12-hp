// lib/line/admin-line-notifications.ts
// 体験申し込みや問い合わせの管理者向けLINE通知文を作って送信する関数

import type { Contact, SessionApplication } from "@/types/prisma";
import { sendLineMessage } from "./send-line-message";
import {
  GRADE_LABELS,
  EXPERIENCE_LABELS,
  SESSION_TYPE_LABELS,
} from "@/constants/adminLabels";
import { truncateText } from "@/lib/utils/text";
import { formatAdminDateOrFallback } from "@/lib/utils/date";

//通知文に入れる管理画面のURLを作成する関数（遷移したい目的地がliffUrlの後ろにつける）
function getAdminUrl(path: string) {
  const liffUrl = process.env.LINE_LIFF_URL;
  const baseUrl = process.env.APP_BASE_URL;

  if (liffUrl) {
    const params = new URLSearchParams();
    params.set("next", path);//pathをnextとしてメモしておき、liffUrlに繋げることで目的地に遷移できる

    return `${liffUrl}?${params.toString()}`;
  }

  if (baseUrl) {
    return `${baseUrl}${path}`;
  }

  return path;
}


//問い合わせの際の通知文を作成しAPIに渡す関数
export async function sendLineContactNotification(contact: Contact) {
  const detailPath = `/admin/contact/${contact.id}`;

  await sendLineMessage(
    `【HP通知】お問い合わせが届きました。

■ お名前
${contact.name}（${contact.nameKana}）

■ お問い合わせ内容
${truncateText(contact.content, 60)}

■ 管理画面
${getAdminUrl(detailPath)}`
  );
}

//体験・見学申し込みの際の通知文を作成しAPIに渡す関数
export async function sendLineSessionApplicationNotification(
  application: SessionApplication
) {
  const detailPath = `/admin/session-application/${application.id}`;

  await sendLineMessage(
    `【HP通知】体験/見学申し込みが届きました。

■ 参加内容
${SESSION_TYPE_LABELS[application.type]}

■ お子様のお名前
${application.childName}（${application.childNameKana}）

■ 学年
${GRADE_LABELS[application.childGrade]}

■ 経験年数
${EXPERIENCE_LABELS[application.experience]}

■ 第一希望日
${formatAdminDateOrFallback(application.preferredDate1)}

■ 管理画面
${getAdminUrl(detailPath)}`
  );
}