//components/public/PublicFooter.tsx
//公開ページのフッター


import Link from "next/link";
import { FaInstagram } from "react-icons/fa";//インスタグラムのアイコンをインポート
import { INSTAGRAM_URL, SITE_NAME } from "@/constants/publicNavigation";
import Image from "next/image";

export function PublicFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="text-center">
          <Link
            href="/explore"
            className="inline-block text-xs font-black tracking-widest text-green-800 transition hover:opacity-80"
            aria-label="トップページへ移動"
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

        <div className="mx-auto mt-6 max-w-sm space-y-3 text-sm">
        

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-neutral-700 underline-offset-4 hover:text-green-800 hover:underline"
          >
            <FaInstagram size={18} />
            公式Instagram
          </a>
            <Link
              href="/term"
              className="text-neutral-700 underline-offset-4 hover:text-green-800 hover:underline"
            >
              クラブ規約
            </Link>

            <Link
              href="/admin/login"
              className="text-neutral-700 underline-offset-4 hover:text-green-800 hover:underline"
            >
              管理者ログイン
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-neutral-500">
          © {new Date().getFullYear()} {SITE_NAME}
        </p>
      </div>
    </footer>
  );
}