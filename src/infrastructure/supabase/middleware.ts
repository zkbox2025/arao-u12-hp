//src/infrastructure/supabase/middleware.ts
//ユーザーがログインしている状態（ログインの有効期限＝セッション）を、アクセスがあるたびに自動で安全に更新（維持）するためのプログラム
//【注意】ページが切り替わる直前に１度だけ行われる


import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

//ユーザーが操作している間に、ログインの有効期限（セッション）が切れて勝手にログアウトしてしまわないよう、
// 裏側でリクエストやレスポンスのクッキーを常に最新に自動更新するための関数
//※なお、最初にログインした際のクッキーの発行は自動で行われる。

export async function updateSession(request: NextRequest) {//ミドルウェアのメイン関数。
  let response = NextResponse.next({//リクエストヘッダーを次の処理に渡すための設定。これにより、ミドルウェアでユーザーのログイン状態を確認した後も、次の処理でユーザー情報を取ることができるようになる
    request,
  });

  //環境変数のチェック
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  //万が一書いてなくても落ちないようにする
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  //
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();//サーバーへのリクエストについてきたクッキーを取得しログイン状況を確認する
      },
      setAll(cookiesToSet) {//アクセストークンの有効期限が切れそうな場合、新しいクッキーを作成・保存してという指示（DBに送る）。これにより、ユーザーがログインしたままページを見続けることができるようになる
        cookiesToSet.forEach(({ name, value }) => {//これから先は、新しいクッキーをサーバーアクションやページに渡す
          request.cookies.set(name, value);//リクエスト（サーバー用）のクッキー（名前と値）を新しくする
        });

        response = NextResponse.next({//新しい発行仕立てのクッキー（リクエスト：サーバー用）を使ってレスポンス（ブラウザ用）を上書きして作り直す
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {//レスポンス（ブラウザ用）に対してoptions（有効期限など）を含めてクッキーを刻み込んでからブラウザに渡している
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();//「このクッキー（会員証）は本当に有効か？期限切れが近くないか？」を裏側で実際に最終検証し、必要であれば上の setAll を発動させてクッキーを最新に更新する。

  return response;//クッキー更新処理後の許可証をNext.jsに投げ返す
}