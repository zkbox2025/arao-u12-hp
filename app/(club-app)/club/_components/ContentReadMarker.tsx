//app/(club-app)/club/_components/ContentReadMarker.tsx
//ページが開かれた瞬間に、ユーザーに気づかれないよう裏側で自動的に『既読（読了）』の記録をサーバーに送信する関数


"use client";

import {
  useEffect,
  useRef,
} from "react";

type ContentReadMarkerProps = {
  action: () => Promise<unknown>;
};

//裏で既読の記録をサーバーに送信する関数
export function ContentReadMarker({
  action,
}: ContentReadMarkerProps) {
  const executed = useRef(false);//2回送信されるのを防ぐ

  useEffect(() => {
    if (executed.current) {//実行されれば強制終了する
      return;
    }

    executed.current = true;//実行済みスタンプを押す

    void action().catch(() => {
      /*
       * 既読更新に失敗しても
       * イベント・お知らせの閲覧は継続する。
       *
       * 詳細なエラーはServer Action側で
       * 個人情報を除外して記録する。
       */
    });
  }, [
    action,
  ]);

  return null;
}

