// app/(club-app)/club/[clubSlug]/notice/not-found.tsx
// 会員用お知らせの404表示

"use client";

import Link from "next/link";

import {
  usePathname,//開いているページのURLのドメイン以降を読み取るもの
} from "next/navigation";


//会員用お知らせ一覧への正しい戻り道（URLの文字列）を出す関数
function getNoticeListPath(
  pathname: string,
): string {
  const marker =
    "/notice";

  const markerIndex =//今いるURL（pathname） の何文字目から/noticeが始まるかを数字で数える
    pathname.indexOf(
      marker,
    );

  if (markerIndex < 0) {//もし/noticeが含まれなかったら０未満を返すため、その場合はクラブ選択画面に遷移する
    return "/club/select";
  }

  return pathname.slice(//ちょうどページURLの/noticeの後ろを切って会員用お知らせ一覧のURLを作る
    0,
    markerIndex +
      marker.length,
  );
}

export default function ClubNoticeNotFound() {
  const pathname =
    usePathname();

  const noticeListPath =//会員用お知らせ一覧ページのURLを作成する
    getNoticeListPath(
      pathname,
    );

  return (
    <section className="rounded-lg border border-neutral-300 bg-white p-8 text-center">
      <h1 className="text-xl font-bold text-neutral-900">
        お知らせが見つかりません
      </h1>

      <p className="mt-3 text-sm leading-6 text-neutral-600">
        削除されたか、公開が終了したか、現在の役割では閲覧できないお知らせです。
      </p>

      <Link
        href={noticeListPath}
        className="mt-5 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        お知らせ一覧へ戻る
      </Link>
    </section>
  );
}