// components/public/PracticeScheduleChangeLink.tsx
// 公開ページ用：練習スケジュール変更ページへの共通リンク

import Link from "next/link";

type PracticeScheduleChangeLinkVariant = "text" | "box";

type PracticeScheduleChangeLinkProps = {
  variant?: PracticeScheduleChangeLinkVariant;
  label?: string;
};

const DEFAULT_LABEL =
  "直近の練習時間・場所の変更はこちら";

export function PracticeScheduleChangeLink({
  variant = "text",
  label = DEFAULT_LABEL,
}: PracticeScheduleChangeLinkProps) {
  if (variant === "box") {
    return (
      <Link
        href="/notice#top"
        className="inline-flex w-fit items-center rounded-lg border border-red-300 bg-red-50 px-4 py-3 font-bold leading-7 text-red-700 transition hover:bg-red-100"
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href="/notice#top"
      className="block w-fit text-sm font-bold leading-7 text-red-700 underline underline-offset-4 transition hover:text-red-800"
    >
      {label}
    </Link>
  );
}