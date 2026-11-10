// app/(club-app)/club/[clubSlug]/admin/events/new/loading.tsx
// イベント新規作成ページのローディング表示

export default function ClubEventCreateLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="mx-auto max-w-3xl space-y-6"
    >
      <p className="sr-only">
        イベント新規作成画面を読み込んでいます。
      </p>

      <header className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-blue-100" />
        <div className="h-8 w-52 animate-pulse rounded bg-neutral-200" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-neutral-100" />
      </header>

      <div className="space-y-6 rounded-lg border border-neutral-200 bg-white p-5">
        <div className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-neutral-200" />
          <div className="h-11 animate-pulse rounded-md bg-neutral-100" />
        </div>

        <div className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-neutral-200" />
          <div className="h-32 animate-pulse rounded-md bg-neutral-100" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-20 animate-pulse rounded-md bg-neutral-100" />
          <div className="h-20 animate-pulse rounded-md bg-neutral-100" />
        </div>

        <div className="h-28 animate-pulse rounded-md bg-neutral-100" />

        <div className="flex gap-3">
          <div className="h-11 w-32 animate-pulse rounded-md bg-blue-100" />
          <div className="h-11 w-28 animate-pulse rounded-md bg-neutral-200" />
        </div>
      </div>
    </section>
  );
}