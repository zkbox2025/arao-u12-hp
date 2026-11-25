// app/admin/(dashboard)/mail-notification/page.tsx
// メール通知設定ページ

import { AdminPageHeader } from "@/components/admin/AdminPageHeader"; // 【追加】管理画面のアイコン付きページ見出しComponent
import { ToastMessage } from "@/components/admin/ToastMessage"; // 【追加】完了・エラーの通知(トースト)を表示するComponent
import { FORM_NOTIFICATION_SETTINGS } from "@/constants/adminLabels"; // 【追加】通知設定の種別・ラベル・説明の一覧(定数)
import { findFormNotificationSettings } from "@/lib/repositories/form-notification-setting"; // 【追加】メール通知設定をすべて取得するRepository関数
import { MailNotificationSettingForm } from "./MailNotificationSettingForm"; // 【追加】メール通知先の設定フォームComponent
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】メール通知設定ページが受け取るPropsの型。
 * searchParamsは、保存完了の表示(saved)と、トースト再生成用ID(toastId)を持つ。
 */
type AdminMailNotificationPageProps = {
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
    saved?: string;
    toastId?: string;
  }>;
};

/**
 * 【追加】メール通知設定ページを表示するページ関数。
 * 引数は、URLのクエリを持つPropsで、戻り値は画面のJSX。
 * 通知先メールを取得する前に、ページ単体でHP管理者かを確認する。
 */
export default async function AdminMailNotificationPage({
  searchParams,
}: AdminMailNotificationPageProps) {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const params = await searchParams; // 【追加】Promise型のクエリを解決して取り出す
  const settings = await findFormNotificationSettings(); // 【追加】メール通知設定をすべて取得する関数

  const toastMessage = params.saved === "1" ? "保存しました。" : "";

  return (
    <div id="top">
      {toastMessage ? (
        <ToastMessage /* 【追加】トースト表示Component */
          key={`${toastMessage}-${params.toastId ?? ""}`}
          message={toastMessage}
        />
      ) : null}

      <AdminPageHeader href="/admin/mail-notification" title="メール通知設定" /* 【追加】ページ見出しComponent */ />

      <div className="mt-6 space-y-6">
        {FORM_NOTIFICATION_SETTINGS.map(/** 【追加】通知設定の種別1件を受け取り、そのフォームを返すコールバック */ (item) => { // 【追加】種別ごとにフォームを作る配列メソッド
          const setting = settings.find( // 【追加】該当する種別の設定を探す配列メソッド
            /** 【追加】設定1件を受け取り、種別が一致するかを返すコールバック */ (setting) => setting.formType === item.formType
          );

          return (
            <MailNotificationSettingForm /* 【追加】メール通知先の設定フォームComponent */
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
