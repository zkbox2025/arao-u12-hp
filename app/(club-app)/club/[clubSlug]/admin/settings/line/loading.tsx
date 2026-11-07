// app/(club-app)/club/[clubSlug]/admin/settings/line/loading.tsx
// OWNER用LINE通知設定ページのスケルトンローディング表示

export default function ClubLineSettingsLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="space-y-8"
    >
      <p className="sr-only">
        LINE通知グループ管理画面を読み込んでいます。
      </p>

      <header className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-blue-100" />
        <div className="h-8 w-64 max-w-full animate-pulse rounded bg-neutral-200" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-neutral-100" />
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({
          length: 2,
        }).map((_, index) => (
          <div
            key={`connection-${index}`}
            className="h-24 animate-pulse rounded-lg bg-neutral-100"
          />
        ))}
      </div>

      <div className="h-64 animate-pulse rounded-xl bg-blue-100" />

      <div className="space-y-5">
        {Array.from({
          length: 2,
        }).map((_, index) => (
          <div
            key={`line-target-${index}`}
            className="h-80 animate-pulse rounded-xl bg-neutral-100"
          />
        ))}
      </div>
    </section>
  );
}
