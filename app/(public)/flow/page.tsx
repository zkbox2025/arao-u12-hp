//app/(public)/flow/page.tsx
//公開ページの体験/見学の流れページ

import { PageTitle } from "@/components/public/PageTitle";
import Link from "next/link";

export default function FlowPage() {
  return (
    <div>
      <PageTitle title="体験/見学の流れ" />

      <div className="space-y-8">
<Link
  href="/notice"
  className="block rounded-lg border border-red-300 bg-red-50 p-4 font-bold text-red-700"
>
  【重要】体験/見学にお越しいただく方へ：直近の練習時間・場所の変更はこちらをご覧ください
</Link>

        <section className="border-b border-neutral-300 pb-6">
          <p className="font-bold text-green-700">STEP 1</p>
          <h2 className="mt-2 text-xl font-black">体験/見学のお申し込み</h2>
          <p className="mt-4 leading-8 text-neutral-700">
            お申し込みフォームからご希望の日程を選択し、必要事項を入力して予約を完了させてください。
          </p>
<div className="mt-5">
  <Link
    href="/session-application"
    className="inline-flex items-center justify-center rounded-md bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
  >
    体験/見学申し込みはこちら
  </Link>
</div>
        </section>

        <section className="border-b border-neutral-300 pb-6">
          <p className="font-bold text-green-700">STEP 2</p>
          <h2 className="mt-2 text-xl font-black">体験/見学当日のご参加</h2>
          <p className="mt-4 leading-8 text-neutral-700">
            当日は直接、練習場所へお越しください。
          </p>
        </section>
      </div>
    </div>
  );
}