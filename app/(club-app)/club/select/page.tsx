// app/(club-app)/club/select/page.tsx
//クラブ選択画面(複数のクラブにアクティブで所属している場合にログインページから遷移する)＋ログアウトボタン

import Link from "next/link";
import {
  redirect,
} from "next/navigation";

import {
  getAppEnabledMemberships, // 【追加】クラブ運営アプリが使える会員のみに絞り込む関数
} from "@/domain/club/club-login-destination";//クラブ運営アプリが使える会員のみに絞り込む関数
import {
  findActiveClubMemberships, // 【追加】ユーザーのACTIVEな所属とクラブ情報を取得する関数
} from "@/app/(club-app)/club/find-active-club-memberships";//ユーザーのアクティブなクラブメンバーシップを取得する関数
import {
  createClient, // 【追加】リクエストのCookieを扱うサーバー用Supabase clientを作る関数
} from "@/src/infrastructure/supabase/server";

import {
  logoutAction, // 【追加】現在のブラウザーセッションだけをログアウトするAction
} from "../actions";

/**
 * 認証Cookieを使用するページなので、
 * ユーザー間でキャッシュを共有しない。
 */
export const dynamic = "force-dynamic";//絶対にキャッシュ（事前に保存）せずアクセスした瞬間に毎回最新のデータをサーバーで作り直す

/**
 * 【追加】現在のブラウザーセッションを終了するログアウトフォームを表示する。
 */
function LogoutForm() { // 【追加】現在のブラウザーセッションのログアウトフォームを表示するComponent
  return (
    <form action={logoutAction /* 【追加】現在のブラウザーセッションだけをログアウトするAction */}>
      <button
        type="submit"
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        ログアウト
      </button>
    </form>
  );
}

/**
 * 【追加】見出しと説明文を受け取り、所属なし・利用不可の案内とログアウト入口を表示する。
 */
function ClubSelectMessage({ // 【追加】所属なし・利用不可の案内とログアウトフォームを表示するComponent
  title,
  description,
}: {
  title: string; // 【追加】文字列型
  description: string; // 【追加】文字列型
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

        <LogoutForm /* 【追加】現在のブラウザーセッションのログアウトフォームを表示するComponent */ />
      </div>
    </main>
  );
}

/**
 * 【追加】認証本人とACTIVEな所属を取得し、利用可能なクラブ数に応じて遷移または選択画面を返す。
 */
export default async function ClubSelectPage() { // 【追加】認証本人と所属数に応じて遷移またはクラブ選択画面を返す関数
  // 1. Supabase Authを確認する
  const supabase =
    await createClient(); // 【追加】リクエストのCookieを扱うサーバー用Supabase clientを作る関数

  const {
    data: {
      user,
    },
    error,
  } = await supabase.auth.getUser(); // 【追加】Supabase Authで現在の認証本人を確認するメソッド

  // 2. 未ログインならグローバルログインへ移動する
  if (error || !user) {
    redirect("/club-login"); // 【追加】指定URLへ遷移して現在の処理を終了する関数
  }

  // 3. ACTIVE Membershipを取得する
  const memberships =
    await findActiveClubMemberships( // 【追加】ユーザーのACTIVEな所属とクラブ情報を取得する関数
      user.id,
    );

  // 4. CLUB_APPを利用できるMembershipだけに絞る
  const availableMemberships =
    getAppEnabledMemberships( // 【追加】クラブ運営アプリが使える会員のみに絞り込む関数
      memberships,
    );

  const [onlyMembership] =
    availableMemberships;

  // 5-1. 利用可能クラブが1件なら、そのクラブへ移動する
  if (
    availableMemberships.length === 1 &&
    onlyMembership
  ) {
    redirect( // 【追加】指定URLへ遷移して現在の処理を終了する関数
      `/club/${encodeURIComponent( // 【追加】パスへ埋め込む値をURL用にエンコードする関数
        onlyMembership.club.slug,
      )}/events`,
    );
  }

  // 5-2. ACTIVE Membership自体が0件
  if (memberships.length === 0) {
    return (
      <ClubSelectMessage /* 【追加】所属なし・利用不可の案内とログアウトフォームを表示するComponent */
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
      <ClubSelectMessage /* 【追加】所属なし・利用不可の案内とログアウトフォームを表示するComponent */
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
          {availableMemberships.map( // 【追加】配列の各要素を表示用のデータや要素へ変換するメソッド
            /**
             * 【追加】利用可能な所属を受け取り、クラブ選択用のリンクを返す。
             */
            (membership) => ( // 【追加】所属を選択リンクへ変換するコールバック
              <li
                key={
                  membership.membershipId
                }
              >
                <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
                  prefetch={false /* 【追加】先読み中の遷移で本文が空になる競合を回避する */}
                  href={`/club/${encodeURIComponent( // 【追加】パスへ埋め込む値をURL用にエンコードする関数
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
                  {/* 【追加】Next.jsのページ遷移用リンクComponent */}
                </Link>
              </li>
            ),
          )}
        </ul>

        <div className="border-t border-slate-200 pt-6">
          <LogoutForm /* 【追加】現在のブラウザーセッションのログアウトフォームを表示するComponent */ />
        </div>
      </div>
    </main>
  );
}