// app/(club-app)/club/[clubSlug]/admin/notice/new/loading.tsx
// 管理者用お知らせ新規作成ページのローディング表示

export default function ClubNoticeCreateLoading() {
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
        お知らせ新規作成画面を読み込んでいます。
      </p>

      <div
        aria-hidden="true"
        className="animate-pulse space-y-6 motion-reduce:animate-none"
      >
        {/* ページヘッダー */}
        <header className="space-y-3">
          <div className="h-4 w-24 rounded bg-neutral-200" />
          <div className="h-8 w-56 rounded bg-neutral-200" />
          <div className="h-4 w-80 max-w-full rounded bg-neutral-200" />
        </header>

        {/* 作成フォーム */}
        <div className="mx-auto max-w-3xl space-y-6">
          {/* タイトル */}
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-neutral-200" />
            <div className="h-11 w-full rounded-lg bg-neutral-200" />
          </div>

          {/* 本文 */}
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-neutral-200" />
            <div className="h-48 w-full rounded-lg bg-neutral-200" />
          </div>

          {/* 公開状態 */}
          <div className="space-y-3">
            <div className="h-4 w-20 rounded bg-neutral-200" />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-14 rounded-lg bg-neutral-200" />
              <div className="h-14 rounded-lg bg-neutral-200" />
            </div>
          </div>

          {/* ジャンル */}
          <div className="space-y-3">
            <div className="h-4 w-20 rounded bg-neutral-200" />
            <div className="h-11 w-full rounded-lg bg-neutral-200" />
          </div>

          {/* 公開対象 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="h-4 w-20 rounded bg-neutral-200" />
              <div className="h-10 w-28 rounded-md bg-neutral-200" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({
                length: 4,
              }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 rounded-lg bg-neutral-200"
                />
              ))}
            </div>
          </div>

          {/* ピン留め */}
          <div className="h-16 rounded-lg bg-neutral-200" />

          {/* PDF・LINE準備欄 */}
          <div className="h-28 rounded-lg bg-neutral-200" />
          <div className="h-28 rounded-lg bg-neutral-200" />

          {/* 操作ボタン */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <div className="h-12 w-full rounded-lg bg-neutral-200 sm:w-32" />
            <div className="h-12 w-full rounded-lg bg-neutral-300 sm:w-40" />
          </div>
        </div>
      </div>
    </section>
  );
}