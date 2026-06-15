// app/(public)/summary/page.tsx
// 公開ページの活動概要ページ

import Link from "next/link";
import { PageTitle } from "@/components/public/PageTitle";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

const summaryItems = [
  {
    title: "活動場所",
    blockKey: "PLACE_BODY",
    fallback: "万田小学校体育館\n桜山小学校体育館\n荒尾市民体育館",
  },
  {
    title: "対象",
    blockKey: "TARGET_BODY",
    fallback: "クラブ生：小１〜小６（男子）\nクラブ教室生：幼児・小１〜小６（女子）",
  },
  {
    title: "練習日時",
    blockKey: "SCHEDULE_BODY",
    fallback: "火曜日：１８：００〜２０：００（万田小体育館）\n水曜日：１７：３０〜１９：３０（万田小体育館または荒尾市民体育館）\n木曜日：１８：００〜２０：００（桜山小体育館）\n金曜日：１８：００〜２０：００（桜山小体育館）\n土・日のどちらか１日：９：００〜１２：００（桜山小体育館または万田小体育館）",
  },
  {
    title: "月謝",
    blockKey: "MONTHLY_FEE_BODY",
    fallback: "【クラブ生：小１〜小６（男子）】\n小１〜小３（３,０００円）\n小４〜小６（４,０００円）\n【クラブ教室生：幼児・小１〜小６（女子）】\n１回：５００円（ただし３,０００円を上限とする）",
  },
  {
    title: "その他費用",
    blockKey: "OTHER_COST_BODY",
    fallback: "入会費：入会時にのみ納入する（内訳：スポーツ安全保険料等）\n【クラブ生：小１〜小６（男子）】\n小１〜小３（５,０００円）\n小４〜小６（６,０００円）\n【クラブ教室生：幼児・小１〜小６（女子）】\n一律１,０００円",
  },
  {
    title: "用意するもの",
    blockKey: "ITEMS_BODY",
    fallback: "体育館シューズ、飲み物、運動着、タオルをご用意ください。",
  },
] as const;

export default async function SummaryPage() {
  const contents = await findPageContentsByPageKey("SUMMARY");
  const contentMap = toContentMap(contents);

  return (
    <div>
      <PageTitle title="活動概要" />

      <div className="space-y-8">
        {summaryItems.map((item) => (
          <section
            key={item.blockKey}
            className="border-b border-neutral-300 pb-6"
          >
            <h2 className="mb-3 border-b border-neutral-300 pb-2 text-lg font-bold">
              {item.title}
            </h2>

            <p className="whitespace-pre-wrap leading-8 text-neutral-700">
              {getContentText({
                contentMap,
                blockKey: item.blockKey,
                fallback: item.fallback,
              })}
            </p>

            {item.blockKey === "SCHEDULE_BODY" ? (
              <div className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4">
                <p className="font-bold leading-8 text-red-700">
                  練習日時が変更になる場合がありますので、こちらでご確認ください。
                </p>

                <div className="mt-4">
                  <Link
                    href="/notice#top"
                    className="inline-flex items-center justify-center rounded-md bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700"
                  >
                    練習スケジュール変更一覧を見る
                  </Link>
                </div>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}