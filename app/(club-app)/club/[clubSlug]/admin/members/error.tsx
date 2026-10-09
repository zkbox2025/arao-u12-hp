// app/(club-app)/club/[clubSlug]/admin/members/error.tsx
// OWNER用メンバー管理一覧の予期しないエラー表示

"use client";

import {
  useTransition,
} from "react";

//引数
type Props = {
  error: Error & {
    digest?: string;//エラーID（ランダムな文字列）
  };
  reset: () => void;//リトライするための関数
};

//クラブメンバーシップの予期せぬエラー関数
export default function ClubMembersError({
  reset,//リトライするための関数
}: Props) {
  const [isRetrying, startTransition] =
    useTransition();

  return (
    <section
      role="alert"
      aria-busy={isRetrying}
      className="rounded-lg border border-red-300 bg-red-50 p-6"
    >
      <h1 className="text-xl font-bold text-red-900">
        メンバー管理画面を読み込めませんでした
      </h1>
      <p className="mt-3 text-sm leading-6 text-red-800">
        保存直後にエラーが表示された場合は、再読み込み後に現在の在籍状態を確認してください。
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isRetrying}//再読み込みしている最中は押せない
          onClick={() =>
            startTransition(() => reset())
          }
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
        >
          {isRetrying
            ? "再読み込み中..."
            : "もう一度試す"}
        </button>
      </div>
    </section>
  );
}
