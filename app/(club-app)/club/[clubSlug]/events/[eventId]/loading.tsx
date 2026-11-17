// app/(club-app)/club/[clubSlug]/events/[eventId]/loading.tsx
// 会員用イベント詳細ページのローディング表示

export default function ClubEventDetailLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="space-y-6"
    >
      <p className="sr-only">
        イベント詳細を読み込んでいます。
      </p>

      <div className="h-9 w-36 animate-pulse rounded bg-neutral-100" />

      <article className="space-y-6 rounded-lg border border-neutral-200 bg-white p-5">
        <header className="space-y-3">
          <div className="flex gap-2">
            <div className="h-6 w-20 animate-pulse rounded-full bg-neutral-200" />
            <div className="h-6 w-14 animate-pulse rounded-full bg-neutral-200" />
          </div>

          <div className="h-8 w-3/4 animate-pulse rounded bg-neutral-200" />
          <div className="h-5 w-56 animate-pulse rounded bg-neutral-100" />
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-16 animate-pulse rounded bg-neutral-100" />
          <div className="h-16 animate-pulse rounded bg-neutral-100" />
        </div>

        <div className="space-y-3 border-t border-neutral-200 pt-5">
          <div className="h-6 w-20 animate-pulse rounded bg-neutral-200" />
          <div className="h-4 animate-pulse rounded bg-neutral-100" />
          <div className="h-4 animate-pulse rounded bg-neutral-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-100" />
        </div>

        <div className="space-y-3 border-t border-neutral-200 pt-5">
          <div className="h-6 w-24 animate-pulse rounded bg-neutral-200" />
          <div className="h-32 animate-pulse rounded bg-neutral-100" />
          <div className="h-11 w-32 animate-pulse rounded bg-blue-100" />
        </div>
      </article>
    </section>
  );
}