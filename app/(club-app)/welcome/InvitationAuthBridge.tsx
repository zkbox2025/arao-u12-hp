// app/(club-app)/welcome/InvitationAuthBridge.tsx
//招待メールのリンクをクリックした後のページ：招待認証が成功すると新規PW設定ページへ遷移。エラーならメッセージ表示

"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";


const STATUS_MESSAGES = {
  "invalid-invitation": "招待の認証を確認できませんでした。招待リンクを開き直してください。",
  "switch-account":
    "別のアカウントでログイン中です。ログアウトしてから招待リンクを開いてください。",
  "login-required": "続けるには、既存のアカウントでパスワードログインしてください。",
};

//招待メールのリンクをクリックした後のページ：招待認証が成功すると新規PW設定ページへ遷移でエラーならメッセージ表示
type BridgeStatus = keyof typeof STATUS_MESSAGES | null;

//招待認証をする直前ページ
export function InvitationAuthBridge({
  contextId,//背景データのID（リンクを押してから登録の間の15分間の手続きで用いるため一時的なIDであることからDBのカラムとしては設けていない）
}: {
  contextId: string;
}) {
  const started = useRef(false);
  const [status, setStatus] = useState<BridgeStatus>(null);

  useEffect(() => {//画面処理を優先し裏でこっそり処理する
    if (started.current) {
      return;
    }

    started.current = true;
    const fragment = window.location.hash;//現在開いているURLの末尾にある #以降の文字列を取得するコード

    if (!fragment) {
      return;
    }

    //ブラウザのページを切り替えることなく、URLの末尾についている #以降の文字列だけを画面から綺麗に消し去るコード
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );

    //URLの末尾にある #以降の文字列を取得するコードからアクセストークンとリフレッシュトークンを取得して検証し、POST関数に送って結果を受け取りトライキャッチで返す
    async function confirmInvitation(): Promise<void> {
      try {
        if (fragment.length > 16_384) {//#以降の長さが制限を超えている
          setStatus("invalid-invitation");//招待の不正
          return;
        }

        const params = new URLSearchParams(fragment.slice(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (
          params.getAll("access_token").length !== 1 ||
          params.getAll("refresh_token").length !== 1 ||
          params.getAll("type").length !== 1 ||
          params.get("type") !== "invite" ||
          params.getAll("token_type").length !== 1 ||
          params.get("token_type") !== "bearer" ||
          params.has("error") ||
          params.has("error_description") ||
          params.has("error_code") ||
          !accessToken ||
          !refreshToken
        ) {
          setStatus("invalid-invitation");//招待の不正
          return;
        }

        //URLの # から抜き取ったトークンをPOST関数に送信して結果を受け取る
        const response = await fetch("/auth/confirm", {//fetch:画面をリロードすることなく、裏側でこっそりサーバーと通信してデータをやり取りする関数
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          referrerPolicy: "no-referrer",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contextId,
            accessToken,
            refreshToken,
          }),
        });
        const result: unknown = await response.json();

        if (
          typeof result === "object" &&//結果がオブジェクト、かつ
          result !== null &&//結果がnullではない、かつ
          "status" in result//結果にステータスが含まれている場合、以下
        ) {
          if (response.ok && result.status === "confirmed") {//レスポンスがOKで結果のステータスが手続き成功であるなら
            window.location.replace("/welcome");//新規PW設定ページへ遷移
            return;
          }

          if (//POST関数からの結果が。アカウントの切り替えが必要、もしくは、ログインが必要であるならその結果を返す
            result.status === "switch-account" ||
            result.status === "login-required"
          ) {
            setStatus(result.status);
            return;
          }
        }

        setStatus("invalid-invitation");//それ以外は招待の不正として返す
      } catch {
        setStatus("invalid-invitation");//それ以外のエラーの場合は招待の不正として処理する
      }
    }

    void confirmInvitation();
  }, [contextId]);

  if (status === null) {
    return null;
  }

  return (
    <p role="alert">
      {STATUS_MESSAGES[status]}
    </p>
  );
}
