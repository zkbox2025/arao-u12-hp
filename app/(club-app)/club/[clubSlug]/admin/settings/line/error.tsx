// app/(club-app)/club/[clubSlug]/admin/settings/line/error.tsx
// OWNER用LINE通知設定ページの予期しないエラー表示

"use client";

import Link from "next/link";

import {
  type MouseEvent,
  useEffect,
  useTransition,
} from "react";

type ClubLineSettingsErrorProps = {
  error: Error & {//エラー文とエラーID
    digest?: string;
  };

  reset: () => void;//エラーしたページ全体のリロードボタンを設定するための引数

  unstable_retry: () => void;//エラーの原因になったサーバー側の処理（通信）だけを、もう一度やり直す（再試行する）」ための特別な関数（引数）
};

//リンク（<a>タグ）をクリックしたときに、Next.jsなどの標準のスムーズなページ移動（裏での通信）を使わず、ブラウザの更新ボタンを押したときのように、
// ページを丸ごと最初から読み込み直して（フルリロードして）移動させる関数
function navigateWithFullReload(
  event: MouseEvent<HTMLAnchorElement>, // 1. リンク（<a>タグ）がクリックされた時のイベント情報
  href: string,                        // 2. 移動先のURL（例: "/club/select"）
): void {
  event.preventDefault();              // 3. リンク本来の「普通のページ移動」を一旦ストップする

  window.location.assign(href);        // 4. ブラウザに「このURLへ強制的に画面を丸ごと読み込み直して移動して！」と命令する
}

//ライン通知先設定ページの予期しないエラー関数
export default function ClubLineSettingsError({
  error,
  unstable_retry,
}: ClubLineSettingsErrorProps) {
  const fallbackPath =
    "/club/select";

  //通信のやり直し（リトライ）の処理が、いま実行中（ローディング中）かどうかをプログラムに監視させるための機能
  //いま裏でリトライ中（通信中）ですよ」という状態を画面に伝えクリックできないようにする
  const [
    isRetrying,
    startRetryTransition,
  ] = useTransition();

  useEffect(() => {//画面表示を優先して裏でこっそりログを出力する
    /*
     * エラー本文、暗号文、token、
     * LINE識別子はログへ出さない。
     */
    console.error(
      "club_line_settings_page_failed",
      {
        errorName:
          error.name,
        digest:
          error.digest,
      },
    );
  }, [
    error,//エラーが書き換わった時だけ実行する
  ]);

  //エラーの原因になったサーバー側の処理（通信）だけを、もう一度やり直すボタン
  function handleRetry(): void {
    startRetryTransition(() => {//ボタンが押された瞬間、自動的に isRetrying という状態が true（通信中） に切り替わってボタンを押せなくする
      unstable_retry();////エラーの原因になったサーバー側の処理（通信）だけを、もう一度やり直す
    });
  }

  return (
    <section
      role="alert"
      aria-busy={isRetrying}
      className="rounded-lg border border-red-300 bg-red-50 p-6"
    >
      <h1 className="text-xl font-bold text-red-900">
        LINE通知設定を読み込めませんでした
      </h1>

      <p className="mt-3 text-sm leading-6 text-red-800">
        一時的な問題が発生しました。保存や登録コード発行の直後だった場合は、再読み込み後に現在の状態を確認してください。
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isRetrying}
          onClick={handleRetry}
          className="cursor-pointer rounded-md bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60"
        >
          {isRetrying
            ? "再読み込み中..."
            : "もう一度試す"}
        </button>

        <Link
          href={fallbackPath}
          onClick={(event) => {
            navigateWithFullReload(
              event,
              fallbackPath,
            );
          }}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          クラブ選択へ
        </Link>
      </div>
    </section>
  );
}
