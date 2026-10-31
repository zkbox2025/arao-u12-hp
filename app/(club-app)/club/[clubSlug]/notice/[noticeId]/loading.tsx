// app/(club-app)/club/[clubSlug]/notice/[noticeId]/loading.tsx
// 会員用お知らせ詳細ページのローディング表示

export default function ClubNoticeDetailLoading() {
  return (
    <section
      aria-busy="true"
      className="space-y-6"
    >
      <p
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        お知らせを読み込んでいます。
      </p>

      <div
        aria-hidden="true"
        className="animate-pulse space-y-6 motion-reduce:animate-none"
      >
        {/* 一覧へ戻るリンク */}
        <div className="h-5 w-40 rounded bg-neutral-200" />

        <article className="space-y-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <header className="space-y-4">
            {/* 重要・ジャンルバッジ */}
            <div className="flex gap-2">
              <div className="h-6 w-14 rounded-full bg-neutral-200" />
              <div className="h-6 w-20 rounded-full bg-neutral-200" />
            </div>

            {/* タイトル */}
            <div className="space-y-2">
              <div className="h-7 w-4/5 rounded bg-neutral-200" />
              <div className="h-7 w-2/5 rounded bg-neutral-200" />
            </div>

            {/* 公開日時・更新日時 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="h-4 w-20 rounded bg-neutral-200" />
                <div className="h-4 w-48 rounded bg-neutral-200" />
              </div>

              <div className="space-y-2">
                <div className="h-4 w-20 rounded bg-neutral-200" />
                <div className="h-4 w-48 rounded bg-neutral-200" />
              </div>
            </div>
          </header>

          {/* 本文 */}
          <section className="space-y-3 border-t border-neutral-200 pt-5">
            <div className="h-6 w-32 rounded bg-neutral-200" />

            <div className="space-y-3">
              <div className="h-4 w-full rounded bg-neutral-200" />
              <div className="h-4 w-full rounded bg-neutral-200" />
              <div className="h-4 w-11/12 rounded bg-neutral-200" />
              <div className="h-4 w-3/4 rounded bg-neutral-200" />
            </div>
          </section>

          {/* PDF欄 */}
          <section className="space-y-3 border-t border-neutral-200 pt-5">
            <div className="h-6 w-24 rounded bg-neutral-200" />

            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <div className="h-4 w-2/3 rounded bg-neutral-200" />
              <div className="mt-2 h-3 w-20 rounded bg-neutral-200" />
            </div>
          </section>
        </article>
      </div>
    </section>
  );
}