// app/(public)/about/page.tsx
// 公開ページのチーム紹介ページ

import { PageTitle } from "@/components/public/PageTitle";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

export default async function AboutPage() {
  const contents = await findPageContentsByPageKey("ABOUT");
  const contentMap = toContentMap(contents);

  const teamName = getContentText({
    contentMap,
    blockKey: "TEAM_NAME",
    fallback: "ARAO U-12\nBASKETBALL CLUB",
  });

  const conceptTitle = getContentText({
    contentMap,
    blockKey: "CONCEPT_TITLE",
    fallback: "ARAO U-12とは-",
  });

  const mainBody = getContentText({
    contentMap,
    blockKey: "MAIN_BODY",
    fallback:
      "私たちは、熊本県荒尾市を拠点に活動しているミニバスケットボールチームです。\n全国大会や九州大会への出場へと子どもたちを導いた実績のあるコーチ陣が在籍しており、日々練習を行っています。\nバスケの楽しさを存分に味わいながら、技術の向上はもちろん、一人ひとりの成長に合わせた丁寧な指導を行っています。",
  });

  return (
    <>
      <PageTitle title="チーム紹介" />

      <section className="space-y-6 pb-8 pt-0">
        <h2 className="whitespace-pre-wrap text-3xl font-black leading-tight tracking-wide text-neutral-900">
          {teamName}
        </h2>

        <div className="border border-neutral-800 px-4 py-3">
          <p className="font-bold text-neutral-900">{conceptTitle}</p>
        </div>

        <p className="whitespace-pre-wrap leading-8 text-neutral-700">
          {mainBody}
        </p>
      </section>
    </>
  );
}