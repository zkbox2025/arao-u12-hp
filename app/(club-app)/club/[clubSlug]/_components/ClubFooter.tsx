// app/(club-app)/club/[clubSlug]/_components/ClubFooter.tsx
// クラブアプリ共通フッター

"use client";

import Link from "next/link";

import {
  usePathname,
} from "next/navigation";

/**
 * 【追加】クラブ共通フッターのURLを作るために受け取るクラブslugの型。
 */
type ClubFooterProps = { // 【追加】共通フッターへ渡すクラブslugの型
  clubSlug: string; // 【追加】文字列型
};

/**
 * 【追加】共通フッターで強調するイベント・お知らせ・マイページの識別子型。
 */
type FooterItem = // 【追加】フッターのイベント・お知らせ・マイページの識別子型
  | "events" // 【追加】フッター項目として許可する文字列のリテラル型
  | "notice" // 【追加】フッター項目として許可する文字列のリテラル型
  | "account"; // 【追加】フッター項目として許可する文字列のリテラル型

  //正規化関数(URLの後ろの/を消す)
/**
 * 【追加】パスを受け取り、ルートを保ったまま末尾のスラッシュを除去する。
 */
function normalizePathname( // 【追加】ルート以外のパスから末尾のスラッシュを除く関数
  pathname: string, // 【追加】文字列型
): string { // 【追加】文字列型
  if (
    pathname.length > 1
  ) {
    return pathname.replace( // 【追加】パス末尾のスラッシュを除去するメソッド
      /\/+$/,
      "",
    );
  }

  return pathname;
}

//フッターを隠すページのURLを判定する関数（trueかfalseか）
/**
 * 【追加】現在のパスとクラブの基準パスから、新規・編集・LINE設定でフッターを隠すか判定する。
 */
function shouldHideFooter( // 【追加】新規・編集・LINE設定でフッターを隠すか判定する関数
  pathname: string, // 【追加】文字列型
  basePath: string, // 【追加】文字列型
): boolean { // 【追加】真偽値型
  const eventAdminPath =
    `${basePath}/admin/events`;

  const noticeAdminPath =
    `${basePath}/admin/notice`;

  /*
   * LINE通知設定は複数の編集フォームを含むため、
   * 新規・編集ページと同様に固定フッターを隠す。
   */
  const lineSettingsPath =
    `${basePath}/admin/settings/line`;

  const isEventNew =
    pathname ===
    `${eventAdminPath}/new`;

  const isEventEdit =
    pathname.startsWith( // 【追加】指定パスで始まるかを確認するメソッド
      `${eventAdminPath}/`,
    ) &&
    pathname.endsWith( // 【追加】指定した末尾で終わるかを確認するメソッド
      "/edit",
    );

  const isNoticeNew =
    pathname ===
    `${noticeAdminPath}/new`;

  const isNoticeEdit =
    pathname.startsWith( // 【追加】指定パスで始まるかを確認するメソッド
      `${noticeAdminPath}/`,
    ) &&
    pathname.endsWith( // 【追加】指定した末尾で終わるかを確認するメソッド
      "/edit",
    );

  const isLineSettings =
    pathname ===
    lineSettingsPath;

  return (
    isEventNew ||
    isEventEdit ||
    isNoticeNew ||
    isNoticeEdit ||
    isLineSettings
  );
}

//フッターの現在の選択を光らせるための判定
/**
 * 【追加】現在のパスとクラブの基準パスから、強調する項目を返す。対象外はnullを返す。
 */
function getActiveFooterItem( // 【追加】会員用・管理用パスから現在のフッター項目を返す関数
  pathname: string, // 【追加】文字列型
  basePath: string, // 【追加】文字列型
): FooterItem | null { // 【追加】フッターのイベント・お知らせ・マイページの識別子型 / 対象がないことを表すnull型
  const memberEventsPath =
    `${basePath}/events`;

  const adminEventsPath =
    `${basePath}/admin/events`;

  const memberNoticePath =
    `${basePath}/notice`;

  const adminNoticePath =
    `${basePath}/admin/notice`;

  const accountPath =
    `${basePath}/account`;

  if (
    pathname ===
      memberEventsPath ||
    pathname.startsWith( // 【追加】指定パスで始まるかを確認するメソッド
      `${memberEventsPath}/`,
    ) ||
    pathname ===
      adminEventsPath ||
    pathname.startsWith( // 【追加】指定パスで始まるかを確認するメソッド
      `${adminEventsPath}/`,
    )
  ) {
    return "events";
  }

  if (
    pathname ===
      memberNoticePath ||
    pathname.startsWith( // 【追加】指定パスで始まるかを確認するメソッド
      `${memberNoticePath}/`,
    ) ||
    pathname ===
      adminNoticePath ||
    pathname.startsWith( // 【追加】指定パスで始まるかを確認するメソッド
      `${adminNoticePath}/`,
    )
  ) {
    return "notice";
  }

  if (
    pathname ===
      accountPath ||
    pathname.startsWith( // 【追加】指定パスで始まるかを確認するメソッド
      `${accountPath}/`,
    )
  ) {
    return "account";
  }

  return null;
}


/**
 * 【追加】クラブslugと現在のパスを使い、表示対象のページで会員用または管理用の共通フッターを返す。
 */
export function ClubFooter({ // 【追加】現在のクラブとパスに対応する共通ナビゲーションを表示するComponent
  clubSlug,
}: ClubFooterProps) { // 【追加】共通フッターへ渡すクラブslugの型
  const rawPathname =//現在のページのURLをそのまま抜き出す
    usePathname(); // 【追加】現在のパス名を取得するhook

  const pathname =
    normalizePathname(//正規化する（後ろの/を消す） / 【追加】ルート以外のパスから末尾のスラッシュを除く関数
      rawPathname,
    );

  const basePath =
    `/club/${encodeURIComponent( // 【追加】パスへ埋め込む値をURL用にエンコードする関数
      clubSlug,
    )}`;

  if (
    shouldHideFooter(//フッターを隠すページのURLかを判定しtrueならnullを返す / 【追加】新規・編集・LINE設定でフッターを隠すか判定する関数
      pathname,
      basePath,
    )
  ) {
    return null;
  }

  const activeItem =
    getActiveFooterItem(//フッターの現在の選択を光らせるための判定 / 【追加】会員用・管理用パスから現在のフッター項目を返す関数
      pathname,
      basePath,
    );


      /*
   * 現在表示しているページが
   * 管理画面配下かどうかを判定する。
   */
  const isAdminPage =
    pathname ===
      `${basePath}/admin` ||
    pathname.startsWith(//URLが、/admin/ という文字から始まっているか / 【追加】指定パスで始まるかを確認するメソッド
      `${basePath}/admin/`,
    );

  const items:
    readonly { // 【追加】要素を変更しない読取専用の配列型
      id: FooterItem; // 【追加】フッターのイベント・お知らせ・マイページの識別子型
      label: string; // 【追加】文字列型
      href: string; // 【追加】文字列型
    }[] = [
      {
        id: "events",
        label: "イベント",
        href: isAdminPage
          ? `${basePath}/admin/events`
          : `${basePath}/events`,
      },
      {
        id: "notice",
        label: "お知らせ",
        href: isAdminPage
          ? `${basePath}/admin/notice`
          : `${basePath}/notice`,
      },
      {
        id: "account",
        label: "マイページ",
        href:
          `${basePath}/account`,
      },
    ];

  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur">
      <nav
        aria-label="クラブアプリ"
        className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-2"
      >
        {items.map( // 【追加】配列の各要素を表示用のデータや要素へ変換するメソッド
          /**
           * 【追加】フッター項目を受け取り、現在位置の強調表示を付けたナビゲーションリンクを返す。
           */
          (item) => { // 【追加】ナビゲーション項目を表示へ変換するコールバック
            const selected =//今作っているボタン（id）が光らせるべきメニュー（activeItem）と一致しているか判定する
              item.id ===
              activeItem;

            return (
              <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
                prefetch={false /* 【追加】先読み中の遷移で本文が空になる競合を回避する */}
                key={item.id}
                href={item.href}
                aria-current={
                  selected
                    ? "page"
                    : undefined
                }
                className={
                  selected
                    ? "rounded-full bg-blue-600 px-3 py-2 text-center text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    : "rounded-full border border-neutral-300 bg-white px-3 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                }
              >
                {item.label}
                {/* 【追加】Next.jsのページ遷移用リンクComponent */}
              </Link>
            );
          },
        )}
      </nav>
    </footer>
  );
}