// constants/adminNavigation.ts
// 管理者ページの遷移先のURL（ナビゲーション）を定義するファイル

import {
  Bell,
  FileText,
  HelpCircle,
  Home,
  Mail,
  Megaphone,
  Settings,
  UserRoundCheck,
  LayoutTemplate,
  UsersRound,
} from "lucide-react";

export const adminNavigationItems = [
  {
    label: "管理トップ",
    href: "/admin/dashboard",
    icon: Home,
    countKey: null,
  },
  {
    label: "お問い合わせ一覧",
    href: "/admin/contact",
    icon: Mail,
    countKey: "contact",
  },
  {
    label: "体験/見学申し込み",
    href: "/admin/session-application",
    icon: UserRoundCheck,
    countKey: "sessionApplication",
  },
  {
    label: "メール通知設定",
    href: "/admin/mail-notification",
    icon: Bell,
    countKey: null,
  },
  {
    label: "練習スケジュール変更",
    href: "/admin/notice",
    icon: Megaphone,
    countKey: null,
  },
    {
  label: "トップページ設定",
  href: "/admin/top-settings",
  icon: LayoutTemplate,
  countKey: null,
},
{
  label: "スタッフ紹介管理",
  href: "/admin/staff",
  icon: UsersRound,
  countKey: null,
},
  {
    label: "よくある質問",
    href: "/admin/faq",
    icon: HelpCircle,
    countKey: null,
  },
  {
    label: "サイト内文章設定",
    href: "/admin/pagecontent",
    icon: FileText,
    countKey: null,
  },
  {
    label: "パスワード変更",
    href: "/admin/password",
    icon: Settings,
    countKey: null,
  },
] as const;

