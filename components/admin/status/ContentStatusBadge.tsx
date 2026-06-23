// components/admin/status/ContentStatusBadge.tsx
// FAQと練習スケ用の公開/下書きステータスバッジ
import type { ContentStatus } from "@/types/prisma";
import { CONTENT_STATUS_LABELS } from "@/constants/adminLabels";


type ContentStatusBadgeProps = {
  status: ContentStatus;
};

export function ContentStatusBadge({ status }: ContentStatusBadgeProps) {
  const className =
    status === "PUBLISHED"
      ? "inline-flex w-fit max-w-max whitespace-nowrap rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
      : "inline-flex w-fit max-w-max whitespace-nowrap rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700";

  return <span className={className}>{CONTENT_STATUS_LABELS[status]}</span>;
}