//app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard.ts
//保存せずにページ移動した際に警告ダイアログを出して引き止める仕組み(共通フック)


"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

const DEFAULT_LEAVE_MESSAGE =
  "入力内容が保存されていません。このページから移動しますか？";

export function useUnsavedChangesGuard(
  isPending: boolean,//送信中かどうかの引数
  leaveMessage:
    string =
    DEFAULT_LEAVE_MESSAGE,
) {
  const [isDirty, setIsDirty] =//フォーム内容が初期状態から書き換わってるかを管理する（ユーザーが書いたらtrue）
    useState(false);
  const isSubmittingRef =//保存ボタンを押して送信している最中かを裏側で記録しておく変数
    useRef(false);

  useEffect(() => {
    if (!isPending) {//送信中が終わったら送信中の変数をfalseにする
      isSubmittingRef.current = false;
    }
  }, [isPending]);

  useEffect(() => {//入力なしで移動するのは何もしない（引き留めない）
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (
      event: BeforeUnloadEvent,
    ) => {
      if (isSubmittingRef.current) {//保存ボタンを押して遷移するときはそのまま通す
        return;
      }

      event.preventDefault();//それ以外は、ページを閉じる、リロードするをキャンセルする
      event.returnValue = true;//警告ダイアログを出す
    };

    const handleDocumentClick = (
      event: MouseEvent,
    ) => {
      if (//以下のいずれかに当てはまる場合は引き留め処理をせずそのまま通す
   isSubmittingRef.current || // ① 現在フォームを送信中（保存中）である
  event.defaultPrevented ||  // ② すでに他のプログラムによってクリックイベントがキャンセルされている
  event.button !== 0 ||      // ③ マウスの「左クリック」ではない（右クリックやホイールクリックなど）
  event.metaKey ||           // ④ Commandキー（Mac）を押しながらのクリック（＝別タブで開こうとしている）
  event.ctrlKey ||           // ⑤ Ctrlキーを押しながらのクリック（＝別タブで開こうとしている）
  event.shiftKey ||          // ⑥ Shiftキーを押しながらのクリック（＝新ウィンドウで開こうとしている）
  event.altKey               // ⑦ Alt/Optionキーを押しながらのクリック（＝リンク先をダウンロードしようとしている）
      ) {
        return;
      }

      const target = event.target;//クリックされた対象がHTML要素がない場所ならそのまま通す
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest(//クリックされた要素がURLリンク（href）が設定されているかどうかを検証し、なければそのまま通す
        "a[href]",
      ) as HTMLAnchorElement | null;

      if (
          !anchor ||                        // ⑧ そもそもリンクが見つからなかった
           anchor.target === "_blank" ||     // ⑨ リンクに target="_blank" が付いている（＝別タブで開くリンク）
           anchor.hasAttribute("download")   // ⑩ リンクに download 属性が付いている（＝ファイルのダウンロード）
      ) {
        return;
      }

      const href =
        anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {//リンクが空っぽだったりページ内アンカーだった場合はそのまま通す
        return;
      }

      //クリックされたリンクが、今表示しているページ（window.location.href）と完全に一致するかを検証し、一致するなら通す
      const destination = new URL(
        anchor.href,
        window.location.href,
      );

      if (
        destination.href ===
        window.location.href
      ) {
        return;
      }

//画面から離れようとしたユーザーに対して確認ダイアログ（ポップアップ）を出し、キャンセルされた場合は画面遷移やページの離脱を強制的にストップする処理
    const shouldLeave =
        window.confirm(
          leaveMessage,
        );

      if (!shouldLeave) {
        event.preventDefault();//リンククリックをキャンセルする
        event.stopImmediatePropagation();//クリックイベントが他に伝わる前に完全にその場でブロックする
      }
    };

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload,//「ブラウザのタブ閉じ・リロードをブロックし警告ダイアログを出す。ただし保存ボタンを押した時だけはスルーする」イベントを登録
    );

    document.addEventListener(
      "click",
      handleDocumentClick,//画面内のリンククリックを先回りして監視・ブロックするイベントを登録
      true,
    );

    return () => {//登録した二つの監視イベントを解除する（関係ないページで実行されるのを防ぐ）
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload,
      );

      document.removeEventListener(
        "click",
        handleDocumentClick,
        true,
      );
    };
  }, [
    isDirty,
    leaveMessage,
  ]);

  return {
    /*
     * フォーム内容が変更されたときに呼び出す。
     */
    markDirty: () => {
      setIsDirty(true);
    },

    /*
     * フォームを送信するときに呼び出す。
     */
    markSubmitting: () => {
      isSubmittingRef.current =
        true;
    },
  };
}