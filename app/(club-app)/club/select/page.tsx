// app/(club-app)/club/select/page.tsx
//クラブ選択画面(複数のクラブにアクティブで所属している場合にログインページから遷移する)＋ログアウトボタン

import Link from "next/link";
import {
  redirect,
} from "next/navigation";

import {
  getAppEnabledMemberships,
} from "@/domain/club/club-login-destination";//クラブ運営アプリが使える会員のみに絞り込む関数
import {
  findActiveClubMemberships,
} from "@/app/(club-app)/club/find-active-club-memberships";//ユーザーのアクティブなクラブメンバーシップを取得する関数
import {
  createClient,
} from "@/src/infrastructure/supabase/server";

import {
  logoutAction,
} from "../actions";

/**
 * 認証Cookieを使用するページなので、
 * ユーザー間でキャッシュを共有しない。
 */
export const dynamic = "force-dynamic";//絶対にキャッシュ（事前に保存）せずアクセスした瞬間に毎回最新のデータをサーバーで作り直す

function LogoutForm() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        ログアウト
      </button>
    </form>
  );
}

function ClubSelectMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
      <div className="w-full space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <header className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900">
            {title}
          </h1>

          <p className="text-sm leading-6 text-slate-600">
            {description}
          </p>
        </header>

        <LogoutForm />
      </div>
    </main>
  );
}

export default async function ClubSelectPage() {
  // 1. Supabase Authを確認する
  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error,
  } = await supabase.auth.getUser();

  // 2. 未ログインならグローバルログインへ移動する
  if (error || !user) {
    redirect("/club-login");
  }

  // 3. ACTIVE Membershipを取得する
  const memberships =
    await findActiveClubMemberships(
      user.id,
    );

  // 4. CLUB_APPを利用できるMembershipだけに絞る
  const availableMemberships =
    getAppEnabledMemberships(
      memberships,
    );

  const [onlyMembership] =
    availableMemberships;

  // 5-1. 利用可能クラブが1件なら、そのクラブへ移動する
  if (
    availableMemberships.length === 1 &&
    onlyMembership
  ) {
    redirect(
      `/club/${encodeURIComponent(
        onlyMembership.club.slug,
      )}/events`,
    );
  }

  // 5-2. ACTIVE Membership自体が0件
  if (memberships.length === 0) {
    return (
      <ClubSelectMessage
        title="所属クラブがありません"
        description="クラブ管理者からの招待を確認してください。"
      />
    );
  }

  // 5-3. 所属はあるがCLUB_APPを利用できるクラブが0件
  if (
    availableMemberships.length === 0
  ) {
    return (
      <ClubSelectMessage
        title="アプリを利用できるクラブがありません"
        description="所属クラブのプランまたは利用状態を確認してください。"
      />
    );
  }

  // 5-4. CLUB_APPを利用できるクラブが複数件
  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-12">
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">
            クラブを選択
          </h1>

          <p className="text-sm text-slate-600">
            利用するクラブを選択してください。
          </p>
        </header>

        <ul className="space-y-3">
          {availableMemberships.map(
            (membership) => (
              <li
                key={
                  membership.membershipId
                }
              >
                <Link
                  href={`/club/${encodeURIComponent(
                    membership.club.slug,
                  )}/events`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:bg-blue-50"
                >
                  <span className="font-medium text-slate-900">
                    {
                      membership.club
                        .name
                    }
                  </span>

                  <span
                    aria-hidden="true"
                    className="text-slate-400"
                  >
                    →
                  </span>
                </Link>
              </li>
            ),
          )}
        </ul>

        <div className="border-t border-slate-200 pt-6">
          <LogoutForm />
        </div>
      </div>
    </main>
  );
}