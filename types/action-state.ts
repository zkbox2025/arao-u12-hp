//types/action-state.ts
//フォーム送信後の状態を表す関数

import type {
  ContactStatus,
  SessionApplicationStatus,
} from "@/types/prisma";

export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  values?: Record<string, string>;// エラーの際にフォームの入力値を保持するためのオプションのフィールド
};

//練習スケ変更ページのステイト
export type NoticeActionState = {
  error?: string;
  values?: {
    title?: string;
    content?: string;
    status?: string;
  };
};

//FAQ変更のステイト
export type FaqActionState = {
  error?: string;
  values?: {
    category?: string;
    question?: string;
    answer?: string;
    status?: string;
  };
};

//サイト内文章設定のステイト
export type PageContentActionState = {
  error?: string;
  values?: {
    pageKey?: string;
    blockKey?: string;
    content?: string;
    imageUrl?: string;
    imageAlt?: string;
  };
};

// お問い合わせ管理ページのメモステイト
export type ContactMemoActionState = {
  error?: string;
  values?: {
    adminMemo?: string;
  };
};

//お問い合わせ管理ページのステータスステイト
export type ContactStatusActionState = {
  error?: string;
  values?: {
    status?: ContactStatus;
  };
};

// 体験/見学申し込み管理ページのメモステイト
export type SessionApplicationMemoActionState = {
  error?: string;
  values?: {
    adminMemo?: string;
  };
};

// 体験/見学申し込み管理ページのステータスステイト
export type SessionApplicationStatusActionState = {
  error?: string;
  values?: {
    status?: SessionApplicationStatus;
  };
};


//メール通知先変更ページのステイト
export type MailNotificationActionState = {
  error?: string;
  values?: {
    emails?: string;
  };
};
