//src/infrastructure/supabase/server.ts

//ページを表示する直前に、今ログインしているかをDBに確認し、ユーザーに紐づくデータを裏で取得するサーバー用関数
//リクエストに付いてきた cookie を読んで、「この人は誰か」を確認する
//前提：サーバーは、「さっきアクセスしてきた人と、今アクセスしてきた人が同じ人か」をすぐには忘れてしまう性質がある（ステートレス）
//1. ログインボタンを押すとサーバーにリクエストが飛び「PWが合ってるね。この人はAさん本人だ」と判断し、「Aさんには、この合言葉（cookie）を持たせておいて」とページデータを返すついでに合言葉（cookie）をブラウザに渡す
//2. ページ移動などの時にブラウザが「ANON_KEY（アプリとDBを繋ぐ秘密の鍵）」とリクエスト（このページ表示して！などのお願い）に合言葉（cookie）を添えてサーバーに送る
//3. サーバーがANON_KEY（秘密の鍵：どこからアクセスしているかを知らせるためのもの）を確認し、届いたリクエストについている合言葉（SUPABASE_JWT_SECRET：環境変数に設定不要のトークン改竄チェックの合言葉でcreateServerClientとDBのみ知っている）付きcookieを見て、サーバーのルール（RLS：他人の部屋には入らせないなど）に沿った上で「この人はAさんだ！じゃあAさんのページを表示しよう」と判断し、データを送る。
//※厳密に言えばクッキー（封筒）の中にトークン（access_token（ユーザー情報：UUIDなど）とrefresh_token（有効期限が近づいたら更新するための控え） ）が入っており、ログイン/アカウント作成時に発行され、リフレッシュトークンが切れるまでログインしなくいいようになる。
//クッキーの確認はこのクライアント（createServerClient）とDBの二重チェックで行われる


import { createServerClient } from "@supabase/ssr";//サーバー側でSupabaseクライアントを作成するための関数をインポート
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();//ブラウザから届いたクッキーの束を取り出す

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,//接続URLと匿名キーを環境変数から取り出してSupabaseクライアントを作る
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {//クッキーを取得するための関数
          return cookieStore.getAll();//クッキーを全部取り出す
        },
        setAll(cookiesToSet) {//アクセストークンの有効期限が切れそうな場合、新しいクッキーを作成・保存してという指示（DBに送る）
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)//クッキーの名前と値とオプションを指定してクッキーを保存する
            );
          } catch {
            // Server Component では set に失敗することがある
            // あとでmiddleware 側で更新される前提
          }
        },
      },
    }
  );
}