// components/admin/AdminDrawer.tsx
// 管理者ページのドロワーメニュー

"use client";

import Link from "next/link";
import { LogOut, X } from "lucide-react";
import { adminNavigationItems } from "@/constants/adminNavigation";
import { logoutAdmin } from "@/app/admin/(dashboard)/actions";

type AdminDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  pendingContactCount?: number;
  pendingSessionApplicationCount?: number;
};

//ドロワーメニューで選択した遷移先ページの一番上に遷移させる関数
function withTopHash(href: string) {
  const [pathAndQuery] = href.split("#");

  return `${pathAndQuery}#top`;
}

export function AdminDrawer({
  isOpen,
  onClose,
  pendingContactCount = 0,
  pendingSessionApplicationCount = 0,
}: AdminDrawerProps) {
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
              ADMIN MENU
            </p>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="rounded-full p-2 text-neutral-700 transition hover:bg-neutral-100"
              aria-label="管理メニューを閉じる"
            >
              <X size={24} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-5 py-4">
            <ul className="space-y-1">
              {adminNavigationItems.map((item) => {
                const Icon = item.icon;

                const count =
                  item.countKey === "contact"
                    ? pendingContactCount
                    : item.countKey === "sessionApplication"
                      ? pendingSessionApplicationCount
                      : 0;

                return (
                  <li key={item.href}>
                    <Link
                      href={withTopHash(item.href)}
                      onClick={onClose}
                      className="flex items-center justify-between rounded-lg px-3 py-3 text-sm font-bold text-neutral-800 transition hover:bg-green-50 hover:text-green-800"
                    >
                      <span className="flex items-center gap-3">
                        <Icon size={18} aria-hidden="true" />
                        {item.label}
                      </span>

                      {count > 0 ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">
                          {count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 border-t border-neutral-200 pt-4">
              <form action={logoutAdmin}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold text-neutral-800 transition hover:bg-red-50 hover:text-red-700"
                >
                  <LogOut size={18} aria-hidden="true" />
                  ログアウト
                </button>
              </form>
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}