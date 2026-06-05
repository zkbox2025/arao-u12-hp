//app/(public)/explore/page.tsx
//公開ページのトップページ(仮)

// app/(public)/explore/page.tsx
// 公開ページのトップページ

import Link from "next/link";
import { ChevronDown } from "lucide-react";


const topNavItems = [
  {
    label: "チーム紹介",
    href: "#about-summary",
  },
  {
    label: "指導方針",
    href: "#policy-summary",
  },
  {
    label: "活動概要",
    href: "#summary-summary",
  },
  {
    label: "体験/見学の流れ",
    href: "#flow-summary",
  },
  {
    label: "よくある質問",
    href: "#faq-summary",
  },
] as const;

const summarySections = [
  {
    id: "about-summary",
    title: "チーム紹介",
    heading:
      "荒尾から、次のステージへ。個性を伸ばし、可能性を広げるミニバスチーム",
    body: "荒尾市を拠点に活動する、ミニバスケットボールチームです。全国大会・九州大会へと子どもたちを導いた経験のあるコーチが在籍しています。",
    href: "/about#top",
    imageLabel: "ABOUT",
  },
  {
    id: "policy-summary",
    title: "指導方針",
    heading: "本気で挑み、一生の強さを掴む。全国を知る指導が、ここにある",
    body: "ただ楽しむだけでなく、一歩踏み込んだ「勝負の世界」を経験します。勝つために努力し、仲間と切磋琢磨する中で、困難に立ち向かう強い心を育成します。",
    href: "/policy#top",
    imageLabel: "POLICY",
  },
  {
    id: "summary-summary",
    title: "活動概要",
    heading: "幼児から小6まで、男女問わず大歓迎！",
    body: "活動場所は荒尾市内の体育館。対象は幼児、小1〜小6の男女です。火曜・水曜・木曜・金曜の夕方、および土日のいずれかに活動しています。",
    href: "/summary#top",
    imageLabel: "SUMMARY",
  },
  {
    id: "flow-summary",
    title: "体験/見学の流れ",
    heading: "体験・見学はすべて無料！2ステップで簡単にご参加いただけます。",
    body: "フォームからご希望の日程を選んで簡単お申し込み。当日は動きやすい服装とシューズを持って直接体育館へお越しください。見学の方は手ぶらでOKです。",
    href: "/flow#top",
    imageLabel: "FLOW",
  },
  {
    id: "faq-summary",
    title: "よくある質問",
    heading: "入会前の不安や疑問を、わかりやすくまとめています。",
    body: "対象学年、練習日、費用、保護者の関わり方など、入会前によくいただく質問をまとめています。気になる点がある方は、まずはこちらをご覧ください。",
    href: "/faq#top",
    imageLabel: "FAQ",
  },
] as const;

export default function ExplorePage() {
  return (
    <div className="relative">
        {/* ページ内リンクメニュー */}
        <section
          aria-labelledby="top-menu-title"
          className="border-b border-neutral-300 pb-8 pt-6 sm:pb-10 sm:pt-8"
        >
          <h1 id="top-menu-title" className="sr-only">
            ARAO U-12 BASKETBALL CLUB トップページ
          </h1>

          <nav aria-label="トップページ内メニュー">
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-4">
              {topNavItems.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="flex min-h-24 flex-col items-center justify-center border border-neutral-800 bg-white px-2 py-4 text-center text-sm font-bold text-neutral-900 transition hover:bg-green-50 hover:text-green-800 sm:min-h-28 sm:text-base"
                  >
                    <span>{item.label}</span>
                    <span className="mt-3 h-px w-10 bg-neutral-800" />
                    <ChevronDown className="mt-2 h-5 w-5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </section>

        {/* サマリーセクション */}
        <div className="divide-y divide-neutral-300">
          {summarySections.map((section) => (
            <TopSummarySection
              key={section.id}
              id={section.id}
              title={section.title}
              heading={section.heading}
              body={section.body}
              href={section.href}
              imageLabel={section.imageLabel}
            />
          ))}
        </div>
      

      {/* ページ上部へ戻る固定ボタン */}
      <a
        href="#top"
        className="fixed bottom-5 right-4 z-20 rounded-full border border-green-800 bg-white/95 px-4 py-2 text-xs font-bold text-green-800 shadow-lg transition hover:bg-green-50 sm:bottom-8 sm:right-8 sm:text-sm"
      >
        ▲ページ上部へ
      </a>
    </div>
  );
}

type TopSummarySectionProps = {
  id: string;
  title: string;
  heading: string;
  body: string;
  href: string;
  imageLabel: string;
};

function TopSummarySection({
  id,
  title,
  heading,
  body,
  href,
  imageLabel,
}: TopSummarySectionProps) {
  return (
    <section id={id} className="scroll-section py-10 sm:py-14">
      <div className="space-y-5">
        <h2 className="text-left text-2xl font-black tracking-wide text-neutral-900 sm:text-3xl">
          {title}
        </h2>

        {/* 仮画像エリア：あとでImageに差し替える */}
        <div className="flex aspect-video w-full items-center justify-center border border-neutral-300 bg-neutral-100">
          <span className="text-sm font-bold tracking-[0.3em] text-neutral-400">
            {imageLabel}
          </span>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-black leading-relaxed text-neutral-900 sm:text-2xl">
            {heading}
          </h3>

          <p className="leading-8 text-neutral-700">{body}</p>
        </div>

        <div className="flex justify-end">
          <Link
            href={href}
            className="inline-flex items-center justify-center border border-neutral-900 px-5 py-3 text-sm font-bold text-neutral-900 transition hover:bg-neutral-900 hover:text-white"
          >
            詳しくみる
            <span className="ml-2" aria-hidden="true">
              ⇀
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}