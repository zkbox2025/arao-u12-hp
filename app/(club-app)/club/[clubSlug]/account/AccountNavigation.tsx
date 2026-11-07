// app/(club-app)/club/[clubSlug]/account/AccountNavigation.tsx
//ログインしているユーザーの「権限（役割）」や「所属クラブ」の状態に合わせて、マイページのメニュー画面を動的に切り替えて表示するナビゲーションコンポーネント
//オーナーなら「LINE通知グループ管理」「会員管理」、管理者（オーナー、指導者、役員）なら「イベント・お知らせ管理」、複数クラブ所属なら「クラブを切り替える」、開発者なら「Platform管理」、全ての人「外部URLリンク」「ログアウトボタン」

import "server-only";

import Link from "next/link";


import {
  AccountLogoutButton,// マイページにあるログアウトボタン（モーダル付き）
} from "./AccountLogoutButton";
import {
  getAccountExternalLinks,//アカウントページの外部リンク一覧を生成する関数（HPURL,インスタURL,プライバシーポリシーURL,利用規約URL）
} from "@/domain/club/account/account-links";
import type {
  ClubAccountView,// クラブアカウントの表示情報
} from "@/domain/club/account/account-types";
import {
  isClubAdminRole,//管理者(OWNER / COACH / OFFICER)かどうか判定する関数
} from "@/domain/club/club-member-role";

type Props = Pick<ClubAccountView, "club" | "role" | "canSwitchClub" | "isPlatformAdmin">;// クラブアカウントの表示情報から"club" | "role" | "canSwitchClub" | "isPlatformAdmin"をピックアップし引数とする

const LINK_CLASS =
  "block rounded-lg border border-slate-200 px-4 py-3 font-medium text-blue-700 hover:bg-slate-50";

//ログインしているユーザーの「権限（役割）」や「所属クラブ」の状態に合わせて、マイページのメニュー画面を動的に切り替えて表示するナビゲーションコンポーネント
export function AccountNavigation({
  club,
  role,
  canSwitchClub,
  isPlatformAdmin,
}: Props) {
  const basePath = `/club/${encodeURIComponent(club.slug)}`;
  const externalLinks = getAccountExternalLinks(club);//アカウントページの外部リンク一覧を生成する関数（HPURL,インスタURL,プライバシーポリシーURL,利用規約URL）

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">メニュー</h2>
      <nav aria-label="マイページのメニュー" className="space-y-3">
        {role === "OWNER" ? (
          <>
            <Link href={`${basePath}/admin/settings/line`} className={LINK_CLASS}>
              LINE通知グループ管理
            </Link>
            <Link href={`${basePath}/admin/members`} className={LINK_CLASS}>
              会員管理
            </Link>
          </>
        ) : null}
        {isClubAdminRole(role) ? (
          <>
            <Link href={`${basePath}/admin/events`} className={LINK_CLASS}>
              イベント管理
            </Link>
            <Link href={`${basePath}/admin/notice`} className={LINK_CLASS}>
              お知らせ管理
            </Link>
          </>
        ) : null}
        {canSwitchClub ? (
          <Link href="/club/select" className={LINK_CLASS}>
            クラブを切り替える
          </Link>
        ) : null}
        {isPlatformAdmin ? (
          <Link href="/platform/support" prefetch={false} className={LINK_CLASS}>
            Platform管理
          </Link>
        ) : null}
        {externalLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {link.label}
          </a>
        ),)}
      </nav>
      <AccountLogoutButton />
    </section>
  );
}
