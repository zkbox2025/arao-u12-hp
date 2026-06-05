//src/infrastructure/supabase/client.ts

//ブラウザ側からサインアップ（アカウント作成）やログイン、入力フォームの内容を送信する（ユーザー操作）ために、DBと接続しクエリを実行するブラウザ用関数
//　/login での signUp（新規登録） や signInWithPassword（ログイン） に使う
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}