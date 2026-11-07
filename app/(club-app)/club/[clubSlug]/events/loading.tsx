// app/(club-app)/club/[clubSlug]/events/loading.tsx
// 会員用イベント月別一覧のローディング表示

export default function ClubEventLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="space-y-6"
    >
      <p className="sr-only">
        イベントを読み込んでいます。
      </p>

      <header className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded bg-neutral-200" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-neutral-100" />
      </header>

      <div className="h-10 w-32 animate-pulse rounded-md bg-neutral-200" />

      <div className="h-20 animate-pulse rounded-lg bg-neutral-100" />

      <div className="flex flex-wrap gap-2">
        {Array.from({
          length: 4,
        }).map((_, index) => (
          <div
            key={`event-genre-${index}`}
            className="h-9 w-24 animate-pulse rounded-full bg-neutral-200"
          />
        ))}
      </div>

      <div className="space-y-4">
        {Array.from({
          length: 3,
        }).map((_, index) => (
          <div
            key={`member-event-${index}`}
            className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
          >
            <div className="flex gap-2">
              <div className="h-6 w-20 animate-pulse rounded-full bg-neutral-200" />
              <div className="h-6 w-14 animate-pulse rounded-full bg-neutral-200" />
            </div>

            <div className="h-5 w-3/4 animate-pulse rounded bg-neutral-200" />
            <div className="h-4 w-56 animate-pulse rounded bg-neutral-100" />
            <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    </section>
  );
}