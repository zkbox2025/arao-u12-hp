// app/(public)/layout.tsx
// 公開ページのレイアウト

import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";

type PublicLayoutProps = {
  children: React.ReactNode;
};

export default function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicHeader />

      <main id="top" className="flex-1 scroll-mt-20 pb-12 sm:pb-16">
        <div className="mx-auto w-full max-w-5xl px-5 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}