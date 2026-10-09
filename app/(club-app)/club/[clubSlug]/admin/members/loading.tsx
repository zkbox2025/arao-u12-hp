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
    </section>
  );
}
