// app/admin/_utils/form-helpers.ts
//エラー時に返すバリューの値に整形する関数

import type {
  FaqActionState,
  NoticeActionState,
  PageContentActionState,
  ContactMemoActionState,
  ContactStatusActionState,
  SessionApplicationMemoActionState,
  SessionApplicationStatusActionState,
  MailNotificationActionState,
} from "@/types/action-state";

//フォーム送信データから安全に文字列を取り出す関数（取得できなかった場合はバックアップを適用する）
function getStringValue(
  value: FormDataEntryValue | null,
  fallback: string
) {
  return typeof value === "string" ? value : fallback;
}

// FAQのフォーム値を構築
export function buildFaqActionValues(
  formData: FormData,
  initialValues?: FaqActionState["values"]
): FaqActionState["values"] {
  return {
    category: getStringValue(formData.get("category"), initialValues?.category ?? "TARGET"),
    question: getStringValue(formData.get("question"), initialValues?.question ?? ""),
    answer: getStringValue(formData.get("answer"), initialValues?.answer ?? ""),
    status: getStringValue(formData.get("status"), initialValues?.status ?? "DRAFT"),
  };
}

// お知らせ（Notice）のフォーム値を構築
export function buildNoticeActionValues(
  formData: FormData,
  initialValues?: NoticeActionState["values"]
): NoticeActionState["values"] {
  return {
    title: getStringValue(formData.get("title"), initialValues?.title ?? ""),
    content: getStringValue(formData.get("content"), initialValues?.content ?? ""),
    status: getStringValue(formData.get("status"), initialValues?.status ?? "DRAFT"),
  };
}

// PageContent: FormDataからフォーム値を構築
export function buildPageContentActionValuesFromFormData(
  formData: FormData,
  initialValues?: PageContentActionState["values"]
): PageContentActionState["values"] {
  return {
    pageKey: getStringValue(formData.get("pageKey"), initialValues?.pageKey ?? ""),
    blockKey: getStringValue(formData.get("blockKey"), initialValues?.blockKey ?? ""),
    content: getStringValue(formData.get("content"), initialValues?.content ?? ""),
    imageUrl: initialValues?.imageUrl,
    imageAlt: getStringValue(formData.get("imageAlt"), initialValues?.imageAlt ?? ""),
  };
}

// PageContent: parse済みdataからフォーム値を構築
export function buildPageContentActionValuesFromData(data: {
  pageKey: string;
  blockKey: string;
  content: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
}): PageContentActionState["values"] {
  return {
    pageKey: data.pageKey,
    blockKey: data.blockKey,
    content: data.content,
    imageUrl: data.imageUrl ?? undefined,
    imageAlt: data.imageAlt ?? undefined,
  };
}


// お問い合わせメモのフォーム値を構築
export function buildContactMemoActionValues(
  formData: FormData,
  initialValues?: ContactMemoActionState["values"]
): ContactMemoActionState["values"] {
  return {
    adminMemo: getStringValue(
      formData.get("adminMemo"),
      initialValues?.adminMemo ?? ""
    ),
  };
}

// お問い合わせステータスのフォーム値を構築
export function buildContactStatusActionValues(
  formData: FormData,
  initialValues?: ContactStatusActionState["values"]
): ContactStatusActionState["values"] {
  const status = getStringValue(
    formData.get("status"),
    initialValues?.status ?? "PENDING"
  );

  return {
    status: status === "REPLIED" ? "REPLIED" : "PENDING",
  };
}



// 体験/見学申し込みメモのフォーム値を構築
export function buildSessionApplicationMemoActionValues(
  formData: FormData,
  initialValues?: SessionApplicationMemoActionState["values"]
): SessionApplicationMemoActionState["values"] {
  return {
    adminMemo: getStringValue(
      formData.get("adminMemo"),
      initialValues?.adminMemo ?? ""
    ),
  };
}

// 体験/見学申し込みステータスのフォーム値を構築
export function buildSessionApplicationStatusActionValues(
  formData: FormData,
  initialValues?: SessionApplicationStatusActionState["values"]
): SessionApplicationStatusActionState["values"] {
  const status = getStringValue(
    formData.get("status"),
    initialValues?.status ?? "PENDING"
  );

  return {
    status:
      status === "ATTENDED" || status === "CANCELED"
        ? status
        : "PENDING",
  };
}



// メール通知設定のフォーム値を構築
export function buildMailNotificationActionValues(
  formData: FormData,
  initialValues?: MailNotificationActionState["values"]
): MailNotificationActionState["values"] {
  return {
    emails: getStringValue(
      formData.get("emails"),
      initialValues?.emails ?? ""
    ),
  };
}