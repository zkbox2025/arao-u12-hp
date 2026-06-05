//app/(public)/summary/page.tsx
//公開ページの活動概要ページ

import { PageTitle } from "@/components/public/PageTitle";

export default function SummaryPage() {
  return (
    <div>
      <PageTitle title="活動概要" />

      <div className="space-y-8">
        <section className="border-b border-neutral-300 pb-6">
          <h2 className="mb-3 border-b border-neutral-300 pb-2 text-lg font-bold">
            活動場所
          </h2>
          <p className="leading-8 text-neutral-700">
            万田小学校体育館、桜山小学校体育館、荒尾市民体育館
          </p>
        </section>

        <section className="border-b border-neutral-300 pb-6">
          <h2 className="mb-3 border-b border-neutral-300 pb-2 text-lg font-bold">
            対象
          </h2>
          <p className="leading-8 text-neutral-700">
            幼児、小学1年生〜小学6年生
          </p>
        </section>
      </div>
    </div>
  );
}