// components/admin/status/ContactStatusBadge.tsx
// お問い合わせの対応ステータスバッジ
import type { ContactStatus } from "@/types/prisma";
import { CONTACT_STATUS_LABELS } from "@/constants/adminLabels";



type ContactStatusBadgeProps = {
  status: ContactStatus;
};

export function ContactStatusBadge({ status }: ContactStatusBadgeProps) {
  const className =
    status === "PENDING"
      ? "inline-flex w-fit max-w-max whitespace-nowrap rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700"
      : "inline-flex w-fit max-w-max whitespace-nowrap rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700";

  return <span className={className}>{CONTACT_STATUS_LABELS[status]}</span>;
}