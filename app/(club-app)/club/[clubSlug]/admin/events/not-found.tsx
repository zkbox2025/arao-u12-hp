// app/(club-app)/club/[clubSlug]/admin/events/not-found.tsx
// 管理者用月別イベント一覧以下（app/(club-app)/club/[clubSlug]/admin/events以下）の階層の404表示

import {
  ClubContentListLink,// not-found画面から管理者用クラブ内の一覧へ戻るリンク
} from "@/app/(club-app)/club/_components/ClubContentListLink";

export default function ClubEventAdminNotFound() {
  return (
    <section className="rounded-lg border border-neutral-300 bg-white p-8 text-center">
      <h1 className="text-xl font-bold text-neutral-900">
        イベントが見つかりません
      </h1>

      <p className="mt-3 text-sm leading-6 text-neutral-600">
        すでに削除されたか、現在のクラブに存在しないイベントです。
      </p>

      <ClubContentListLink
        content="events"
        admin
      >
        イベント管理へ戻る
      </ClubContentListLink>
    </section>
  );
}