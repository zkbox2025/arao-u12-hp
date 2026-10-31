// app/(club-app)/club/[clubSlug]/events/not-found.tsx
// 会員用イベント月別一覧以下の404表示

import {
  ClubContentListLink,
} from "@/app/(club-app)/club/_components/ClubContentListLink";

export default function ClubEventNotFound() {
  return (
    <section className="rounded-lg border border-neutral-300 bg-white p-8 text-center">
      <h1 className="text-xl font-bold text-neutral-900">
        イベントが見つかりません
      </h1>

      <p className="mt-3 text-sm leading-6 text-neutral-600">
        削除されたか、公開が終了したか、現在の役割では閲覧できないイベントです。
      </p>

      <ClubContentListLink content="events">
        イベント一覧へ戻る
      </ClubContentListLink>
    </section>
  );
}