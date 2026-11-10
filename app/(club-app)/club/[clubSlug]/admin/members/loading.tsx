// app/(club-app)/club/[clubSlug]/admin/members/loading.tsx
// OWNER用メンバーシップ管理一覧のローディング表示（何も入ってないスケルトンの箱が表示される）

export default function ClubMembersLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="space-y-6"
    >
      <p className="sr-only">
        メンバー管理画面を読み込んでいます。
      </p>

      <header className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-blue-100" />
        <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-36 animate-pulse rounded bg-slate-100" />
      </header>

      <div
        aria-hidden="true"
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="space-y-2"
            >
              <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
              <div className="h-12 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="h-12 w-48 animate-pulse rounded bg-blue-100" />
      </div>

      <ul className="grid gap-4">
        {Array.from({ length: 3 }).map(
          (_, index) => (
            <li
              key={index}
              className="h-52 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ),
        )}
      </ul>

      <div
        aria-hidden="true"
        className="space-y-4"
      >
        <div className="h-7 w-32 animate-pulse rounded bg-slate-200" />
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    </section>
  );
}
