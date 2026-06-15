// components/admin/AdminHeader.tsx
// 管理者ページのヘッダー

"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useState } from "react";
import { AdminDrawer } from "./AdminDrawer";

type AdminHeaderProps = {
  pendingContactCount?: number;
  pendingSessionApplicationCount?: number;
};

export function AdminHeader({
  pendingContactCount = 0,
  pendingSessionApplicationCount = 0,
}: AdminHeaderProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-9000 border-b border-green-900/20 bg-green-700 text-white">
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-center px-4">
          <Link
            href="/admin/dashboard"
            className="text-center text-sm font-black leading-tight tracking-widest transition hover:opacity-80"
            aria-label="管理者ダッシュボードへ移動"
          >
            <Image
              src="/images/logo.png"
              alt="ARAO U-12 BASKETBALL CLUB"
              width={120}
              height={48}
              priority
              className="h-12 w-auto"
            />
          </Link>

          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="absolute right-3 top-1/2 z-9999 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full p-2 transition hover:bg-white/10"
            aria-label="管理メニューを開く"
            aria-expanded={isDrawerOpen}
          >
            <Menu size={28} />
          </button>
        </div>
      </header>

      <AdminDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        pendingContactCount={pendingContactCount}
        pendingSessionApplicationCount={pendingSessionApplicationCount}
      />
    </>
  );
}