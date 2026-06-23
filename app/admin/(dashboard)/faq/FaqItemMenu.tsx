// app/admin/(dashboard)/faq/FaqItemMenu.tsx
// FAQカード操作メニュー（操作ボタン (∨ シェブロン):「編集」と「削除」が選択できる）

"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type {
  FaqCategoryValue,
  FaqStatusFilterValue,
} from "@/constants/faq";
import { FaqEditModal } from "./FaqEditModal";
import { FaqDeleteButton } from "./FaqDeleteButton";
import type { ContentStatus } from "@/types/prisma";

type FaqItemMenuProps = {
  faqId: string;
  category: FaqCategoryValue;
  question: string;
  answer: string;
  status: ContentStatus;
  statusFilter: FaqStatusFilterValue;
};

export function FaqItemMenu({
  faqId,
  category,
  question,
  answer,
  status,
  statusFilter,
}: FaqItemMenuProps) {
  const [isOpen, setIsOpen] = useState(false);//メニュー（編集/削除ボタン）の開閉の状態管理をする
  const menuRef = useRef<HTMLDivElement>(null);//メニュー（編集/削除ボタン）の位置を固定する

  useEffect(() => {
    //もし開かれていなければそのまま返して終了
    if (!isOpen) return;

    //クリックされた位置を把握する関数
    function handleClickOutside(event: MouseEvent) {
      //メニュー（編集/削除ボタン）が存在しているかチェックしてなければそのまま返す（エラー防止）
      if (!menuRef.current) return;

      //クリックされた位置がメニュー（編集/削除ボタン）の中に含まれていれば閉じる
      if (!menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    //画面全体に対してボタンクリックがされたら（mousedown）、handleClickOutsideを実行する
    document.addEventListener("mousedown", handleClickOutside);

    //メニューが閉じたらhandleClickOutsideを解除する
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);//isOpenが変わった時だけuseEffectを実行する

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="rounded-full p-2 transition hover:bg-neutral-100"
        aria-label={isOpen ? "FAQ操作メニューを閉じる" : "FAQ操作メニューを開く"}
        aria-expanded={isOpen}
      >
        <ChevronDown size={22} />
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-20 mt-2 w-32 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          <FaqEditModal
            faqId={faqId}
            category={category}
            question={question}
            answer={answer}
            status={status}
          />

          <FaqDeleteButton
            faqId={faqId}
            category={category}
            statusFilter={statusFilter}
          />
        </div>
      ) : null}
    </div>
  );
}