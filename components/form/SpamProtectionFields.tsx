// components/form/SpamProtectionFields.tsx
// フォームのスパム対策用の隠し項目
//自動で大量送信してくる迷惑なプログラム（bot/ボット）を、罠を仕掛けて見破るための隠しパーツ

"use client";

import { useState } from "react";

export function SpamProtectionFields() {
  const [formStartedAt] = useState(() => Date.now().toString());//ユーザーが最初にフォームを開いた瞬間の時刻を記録してformStartedAtに収める

  return (
    <>
      {/* Honeypot: 人間には見えないが、botが入力しがちな項目：罠 */}
       {/* 人間には見えないはずなのに、文字が入力されて届いた ＝ 100%ボットの仕業」と判定するための罠（ハニーポット） */}
      <input
  type="text"
  name="company"
  tabIndex={-1}
  autoComplete="off"
  aria-hidden="true"
  className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
/>

      {/* フォーム表示開始時刻 */}
      <input type="hidden" name="formStartedAt" value={formStartedAt} />
    </>
  );
}