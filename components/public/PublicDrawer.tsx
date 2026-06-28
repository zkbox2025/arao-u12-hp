// components/public/PublicDrawer.tsx
// 公開ページのドロワーメニュー

"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { FaInstagram } from "react-icons/fa";
import {
  INSTAGRAM_URL,
  publicNavigationItems,
} from "@/constants/publicNavigation";
import { useCloseOnEscape } from "@/components/ui/useCloseOnEscape";

type PublicDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function PublicDrawer({ isOpen, onClose }: PublicDrawerProps) {
  useCloseOnEscape({ isOpen, onClose });

  return (
    <>
      <div
        className={[
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ease-out",
          isOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={[
          "fixed right-0 top-16 z-50 h-[calc(100dvh-4rem)] w-[82%] max-w-sm bg-white shadow-2xl",
          "transition-transform duration-300 ease-out",
          isOpen
            ? "pointer-events-auto translate-x-0"
            : "pointer-events-none translate-x-full",
        ].join(" ")}
        aria-hidden={!isOpen}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
            <p className="text-sm font-bold tracking-wide text-green-800">
              MENU
            </p>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="rounded-full p-2 text-neutral-700 transition hover:bg-neutral-100"
              aria-label="メニューを閉じる"
            >
              <X size={24} aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-5 py-4">
            <ul className="space-y-1">
              {publicNavigationItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={`${item.href}#top`}
                    onClick={onClose}
                    className="block rounded-lg px-3 py-3 text-base font-medium text-neutral-800 transition hover:bg-green-50 hover:text-green-800"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-6 border-t border-neutral-200 pt-4">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg px-3 py-3 text-base font-medium text-neutral-800 transition hover:bg-green-50 hover:text-green-800"
              >
                <FaInstagram size={20} aria-hidden="true" />
                公式Instagram
              </a>
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}