// app/(public)/explore/page.tsx
// 公開ページのトップページ

import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import {
  findPageContentsByPageKey,
  toContentMap,
} from "@/lib/repositories/page-content";
import { buildTopSummarySections } from "./top-summary-sections";//表示用データに変更する関数

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

// 画像URLの許可ルール関数
function validateImageUrl(value?: string | null) {
  const imageUrl = value?.trim();

  if (!imageUrl) return "";

  if (imageUrl.startsWith("/")) {
    return imageUrl;
  }

  try {
    const url = new URL(imageUrl);

    const allowedHosts = [
      "uibiezgxpdfciznhbsxr.supabase.co",
      "127.0.0.1",
      "localhost",
      "192.168.210.188",
    ];

    if (!allowedHosts.includes(url.hostname)) {
      return "";
    }

    return imageUrl;
  } catch {
    return "";
  }
}

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const contents = await findPageContentsByPageKey("TOP");
  const contentMap = toContentMap(contents);
  const summarySections = buildTopSummarySections(contentMap);

  return (
    <div className="relative">
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
            imageUrl={section.imageUrl}
            imageAlt={section.imageAlt}
          />
        ))}
      </div>

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
  imageUrl?: string | null;
  imageAlt?: string | null;
};

function TopSummarySection({
  id,
  title,
  heading,
  body,
  href,
  imageLabel,
  imageUrl,
  imageAlt,
}: TopSummarySectionProps) {
  const safeImageUrl = validateImageUrl(imageUrl);

  return (
    <section id={id} className="scroll-section py-10 sm:py-14">
      <div className="space-y-5">
        <h2 className="text-left text-2xl font-black tracking-wide text-neutral-900 sm:text-3xl">
          {title}
        </h2>

        {safeImageUrl ? (
          <div className="relative aspect-video w-full overflow-hidden border border-neutral-300 bg-neutral-100">
            <Image
              src={safeImageUrl}
              alt={imageAlt || title}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center border border-neutral-300 bg-neutral-100">
            <span className="text-sm font-bold tracking-[0.3em] text-neutral-400">
              {imageLabel}
            </span>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="whitespace-pre-wrap text-xl font-black leading-relaxed text-neutral-900 sm:text-2xl">
            {heading}
          </h3>

          <p className="whitespace-pre-wrap leading-8 text-neutral-700">
            {body}
          </p>
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