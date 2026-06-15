// app/(public)/policy/page.tsx
// 公開ページの指導方針ページ

import { PageTitle } from "@/components/public/PageTitle";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

export default async function PolicyPage() {
  const contents = await findPageContentsByPageKey("POLICY");
  const contentMap = toContentMap(contents);

  const conceptHeading = getContentText({
    contentMap,
    blockKey: "CONCEPT_HEADING",
    fallback: "理念",
  });

  const conceptHeadingEnglish = getContentText({
  contentMap,
  blockKey: "CONCEPT_HEADING_ENGLISH",
  fallback: "-concept-",
});


  const conceptSubHeading = getContentText({
    contentMap,
    blockKey: "CONCEPT_SUB_HEADING",
    fallback: "真剣勝負の中で生涯の財産となる\n諦めない心を育てる",
  });

  const conceptBody = getContentText({
    contentMap,
    blockKey: "CONCEPT_BODY",
    fallback:
      "ここは、ただバスケットボールを楽しむだけの場所\nではありません。\n一歩踏み込んだ「勝負の世界」を経験する場所です。\n\n「勝つために仲間と努力すること」\n「ライバルと切磋琢磨すること」\n\n真剣勝負の競争の中でしか得られない「悔しさ」や「達成感」こそが、これからの時代を生き抜く子どもたちの諦めない心を育てます。",
  });

  return (
    <div>
      <PageTitle title="指導方針" />

      <section className="space-y-6">
        <div className="text-center">
          <p className="text-sm text-neutral-500">{conceptHeadingEnglish}</p>
          <h2 className="mx-auto mt-2 inline-block border-b border-neutral-800 px-6 pb-2 text-xl font-bold">
            {conceptHeading}
          </h2>
        </div>

        <div className="space-y-4">
          <h3 className="whitespace-pre-wrap text-xl font-black text-center">
  {conceptSubHeading}
</h3>


          <p className="whitespace-pre-wrap text-center leading-8 text-neutral-700">
  {conceptBody}
</p>

        </div>
      </section>
    </div>
  );
}