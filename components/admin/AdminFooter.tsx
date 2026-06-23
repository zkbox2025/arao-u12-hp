// components/admin/AdminFooter.tsx
// 管理者ページのフッター

import Image from "next/image";
import Link from "next/link";
import { SITE_NAME } from "@/constants/adminNavigation";

export function AdminFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="text-center">
          <Link
            href="/admin/dashboard#top"
            className="inline-block transition hover:opacity-80"
            aria-label="管理者ダッシュボードへ移動"
          >
            <Image
              src="/images/logo.png"
              alt="ARAO U-12 BASKETBALL CLUB"
              width={100}
              height={40}
              className="mx-auto h-10 w-auto"
            />
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          © {new Date().getFullYear()} {SITE_NAME}
        </p>
      </div>
    </footer>
  );
}