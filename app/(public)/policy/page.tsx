//app/(public)/policy/page.tsx
//公開ページの指導方針ページ

import { PageTitle } from "@/components/public/PageTitle";

export default function PolicyPage() {
  return (
    <div>
      <PageTitle title="指導方針" />

      <section className="space-y-6">
        <div className="text-center">
          <p className="text-sm text-neutral-500">-concept-</p>
          <h2 className="mx-auto mt-2 inline-block border-b border-neutral-800 px-6 pb-2 text-xl font-bold">
            理念
          </h2>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-black">
            【全国・九州大会へ導いた、本気の指導がここにある】
          </h3>
          <p className="leading-8 text-neutral-700">
            私たちのチームは、ただ楽しくバスケットボールをプレイするだけの場所ではありません。
          </p>
        </div>
      </section>
    </div>
  );
}