// app/admin/(dashboard)/mail-notification/page.tsx
// メール通知設定ページ

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ToastMessage } from "@/components/admin/ToastMessage";
import { FORM_NOTIFICATION_SETTINGS } from "@/constants/adminLabels";
import { findFormNotificationSettings } from "@/lib/repositories/form-notification-setting";
import { MailNotificationSettingForm } from "./MailNotificationSettingForm";

type AdminMailNotificationPageProps = {
  searchParams: Promise<{
    saved?: string;
    toastId?: string;
  }>;
};

export default async function AdminMailNotificationPage({
  searchParams,
}: AdminMailNotificationPageProps) {
  const params = await searchParams;
  const settings = await findFormNotificationSettings();

  const toastMessage = params.saved === "1" ? "保存しました。" : "";

  return (
    <div id="top">
      {toastMessage ? (
        <ToastMessage
          key={`${toastMessage}-${params.toastId ?? ""}`}
          message={toastMessage}
        />
      ) : null}

      <AdminPageHeader href="/admin/mail-notification" title="メール通知設定" />

      <div className="mt-6 space-y-6">
        {FORM_NOTIFICATION_SETTINGS.map((item) => {
          const setting = settings.find(
            (setting) => setting.formType === item.formType
          );

          return (
            <MailNotificationSettingForm
              key={item.formType}
              formType={item.formType}
              label={item.label}
              description={item.description}
              defaultEmails={setting?.emails ?? ""}
            />
          );
        })}
      </div>
    </div>
  );
}