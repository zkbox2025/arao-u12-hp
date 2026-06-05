//app/(public)/about/page.tsx
//公開ページのチーム紹介ページ

import { PageTitle } from "@/components/public/PageTitle";

export default function AboutPage() {
  return (
    <>
      <PageTitle title="チーム紹介" />

      <section className="space-y-6 pb-8 pt-0">
        <h2 className="text-3xl font-black leading-tight tracking-wide text-neutral-900">
          ARAO U-12
          <br />
          BASKETBALL CLUB
        </h2>

        <div className="border border-neutral-800 px-4 py-3">
          <p className="font-bold text-neutral-900">ARAO U-12とは-</p>
        </div>

        <p className="leading-8 text-neutral-700">
          私たちは、熊本県荒尾市を拠点として活動しているミニバスケットボールチームです。
        </p>
      </section>
    </>
  );
}