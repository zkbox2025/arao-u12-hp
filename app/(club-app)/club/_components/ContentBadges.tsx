//app/(club-app)/club/_components/ContentBadges.tsx
//ステータス（下書き、公開）バッジ、未読バッジ、PDFバッジ


import type {
  ContentStatus,
} from "@/types/prisma";


//ステータス表示に使うバッジ（下書き、公開中）
export function ContentStatusBadge({
  status,
}: {
  status: ContentStatus;
}) {
  return (
    <span
      className={
        status === "PUBLISHED"
          ? "rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-800"
          : "rounded-full bg-neutral-200 px-2 py-1 text-xs font-bold text-neutral-700"
      }
    >
      {status === "PUBLISHED"
        ? "公開中"
        : "下書き"}
    </span>
  );
}

//未読バッジ
export function UnreadBadge() {
  return (
    <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white">
      未読
    </span>
  );
}

//PDFの有りバッジ
export function AttachmentBadge() {
  return (
    <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">
      PDFあり
    </span>
  );
}

