// app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/loading.tsx
// 管理者用お知らせ編集ページのローディング表示

export default function ClubNoticeEditLoading() {
  return (
    <section
      aria-busy="true"
      className="space-y-8"
    >
      <p
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        お知らせ編集画面を読み込んでいます。
      </p>

      <div
        aria-hidden="true"
        className="animate-pulse space-y-8 motion-reduce:animate-none"
      >
        {/* ページヘッダー */}
        <header className="space-y-3">
          <div className="h-4 w-24 rounded bg-neutral-200" />
          <div className="h-8 w-48 rounded bg-neutral-200" />
          <div className="h-4 w-80 max-w-full rounded bg-neutral-200" />
        </header>

        {/* 管理情報 */}
        <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div className="h-5 w-24 rounded bg-neutral-200" />

          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {Array.from({
              length: 6,
            }).map((_, index) => (
              <div
                key={index}
                className="space-y-2"
              >
                <div className="h-4 w-24 rounded bg-neutral-200" />
                <div className="h-4 w-44 max-w-full rounded bg-neutral-200" />
              </div>
            ))}
          </div>
        </section>

        {/* 編集フォーム */}
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
          <div className="space-y-2">
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

          {/* ピン留め・再確認 */}
          <div className="h-16 rounded-lg bg-neutral-200" />

          {/* PDF・LINE準備欄 */}
          <div className="h-32 rounded-lg bg-neutral-200" />
          <div className="h-36 rounded-lg bg-neutral-200" />

          <div className="h-16 rounded-lg bg-neutral-200" />

          {/* 操作ボタン */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <div className="h-12 w-full rounded-lg bg-neutral-200 sm:w-32" />
            <div className="h-12 w-full rounded-lg bg-neutral-300 sm:w-48" />
          </div>
        </div>

        {/* 削除エリア */}
        <section className="rounded-lg border border-red-200 bg-red-50 p-5">
          <div className="h-5 w-36 rounded bg-red-100" />
          <div className="mt-3 h-4 w-4/5 rounded bg-red-100" />
          <div className="mt-4 h-10 w-20 rounded-md bg-red-200" />
        </section>
      </div>
    </section>
  );
}