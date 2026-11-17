// app/(club-app)/club/[clubSlug]/admin/notice/loading.tsx
// 管理者用お知らせのローディング表示（処理中であることを伝える表示）

export default function ClubNoticeAdminLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="space-y-6"
    >
      <p className="sr-only">
        お知らせ管理画面を読み込んでいます。
      </p>

      <header className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-blue-100" />
        <div className="h-8 w-48 animate-pulse rounded bg-neutral-200" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-neutral-100" />
      </header>

      <div className="h-10 w-52 animate-pulse rounded bg-blue-100" />

      <div className="h-28 animate-pulse rounded-lg bg-neutral-100" />

      <div className="flex gap-2">
        {Array.from({
          length: 3,
        }).map((_, index) => (
          <div
            key={`status-${index}`}
            className="h-10 w-28 animate-pulse rounded-md bg-neutral-200"
          />
        ))}
      </div>

      <div className="space-y-4">
        {Array.from({
          length: 3,
        }).map((_, index) => (
          <div
            key={`admin-notice-${index}`}
            className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
          >
            <div className="flex gap-2">
              <div className="h-6 w-16 animate-pulse rounded-full bg-neutral-200" />
              <div className="h-6 w-20 animate-pulse rounded-full bg-neutral-200" />
            </div>

            <div className="h-5 w-3/4 animate-pulse rounded bg-neutral-200" />
            <div className="h-4 w-56 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    </section>
  );
}