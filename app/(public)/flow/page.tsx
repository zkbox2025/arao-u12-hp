// app/(public)/flow/page.tsx
// 公開ページの体験/見学の流れページ

import { PageTitle } from "@/components/public/PageTitle";
import Link from "next/link";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

export default async function FlowPage() {
  const contents = await findPageContentsByPageKey("FLOW");
  const contentMap = toContentMap(contents);

  const importantNoticeBody = getContentText({
    contentMap,
    blockKey: "IMPORTANT_NOTICE_BODY",
    fallback:
      "【重要】体験/見学にお越しいただく方へ：直近の練習時間・場所の変更はこちらをご覧ください",
  });

  const step1Heading = getContentText({
    contentMap,
    blockKey: "STEP1_HEADING",
    fallback: "体験/見学のお申し込み",
  });

  const step1Body = getContentText({
    contentMap,
    blockKey: "STEP1_BODY",
    fallback:
      "お申し込みフォームからご希望の日程を選択し、必要事項を入力して予約を完了させてください",
  });

  const step2Heading = getContentText({
    contentMap,
    blockKey: "STEP2_HEADING",
    fallback: "体験/見学当日のご参加",
  });

  const step2Body = getContentText({
    contentMap,
    blockKey: "STEP2_BODY",
    fallback: "当日は直接、練習場所へお越しください",
  });

  const belongingsBody = getContentText({
    contentMap,
    blockKey: "BELONGINGS_BODY",
    fallback:
      "体験の方は体育館シューズ、飲み物、運動着、タオルをご持参ください。\n見学の方は手ぶらでお越しいただけます。",
  });

  return (
    <div>
      <PageTitle title="体験/見学の流れ" />

      <div className="space-y-8">
        <Link
          href="/notice"
          className="block rounded-lg border border-red-300 bg-red-50 p-4 font-bold leading-8 text-red-700"
        >
          {importantNoticeBody}
        </Link>

        <section className="border-b border-neutral-300 pb-6">
          <p className="font-bold text-green-700">STEP 1</p>

          <h2 className="mt-2 whitespace-pre-wrap text-xl font-black">
            {step1Heading}
          </h2>

          <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
            {step1Body}
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

          <h2 className="mt-2 whitespace-pre-wrap text-xl font-black">
            {step2Heading}
          </h2>

          <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
            {step2Body}
          </p>
          <div className="mt-5">
   <Link
          href="/summary#top"
          className="inline-flex w-fit items-center justify-center rounded-full bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
        >
          通常の練習スケジュールはこちら
        </Link>
  </div>
        </section>

        <section className="border-b border-neutral-300 pb-6">
          <h2 className="text-xl font-black">当日の持ち物</h2>

          <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
            {belongingsBody}
          </p>
        </section>
      </div>
    </div>
  );
}