// components/admin/status/SessionApplicationStatusBadge.tsx
// 体験/見学申し込みの対応ステータスバッジ
import type { SessionApplicationStatus } from "@/types/prisma";
import { APPLICATION_STATUS_LABELS } from "@/constants/adminLabels";


type SessionApplicationStatusBadgeProps = {
  status: SessionApplicationStatus;
};

export function SessionApplicationStatusBadge({
  status,
}: SessionApplicationStatusBadgeProps) {
  const className =
    status === "PENDING"
      ? "inline-flex w-fit max-w-max whitespace-nowrap rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700"
      : status === "ATTENDED"
        ? "inline-flex w-fit max-w-max whitespace-nowrap rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
        : "inline-flex w-fit max-w-max whitespace-nowrap rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700";

  return (
    <span className={className}>{APPLICATION_STATUS_LABELS[status]}</span>
  );
}