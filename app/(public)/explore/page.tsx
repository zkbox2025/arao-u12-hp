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
import { findLatestPublishedMonthlyPracticePlan } from "@/lib/repositories/monthly-practice-plan";//最新の月別練習計画PDFを取得する関数
import { findStaffPageSetting } from "@/lib/repositories/staff";
import type { StaffPageSetting } from "@/types/prisma";
import {
  STAFF_TOP_SUMMARY_BODY_FALLBACK,
  STAFF_TOP_SUMMARY_TITLE_FALLBACK,
} from "@/constants/staff/fallbacks";

const topNavItems = [
  {
    label: "チーム紹介",
    href: "#about-summary",
  },
  {
    label: "スタッフ紹介",
    href: "#staff-summary",
  },
  {
    label: "指導方針",
    href: "#policy-summary",
  },
  {
    label: "活動内容・費用",
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

  const allowedSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!allowedSupabaseUrl) {
    return "";
  }

  try {
    const url = new URL(imageUrl);
    const allowedUrl = new URL(allowedSupabaseUrl);

    if (url.hostname !== allowedUrl.hostname) {
      return "";
    }

    return imageUrl;
  } catch {
    return "";
  }
}

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
const [contents, monthlyPracticePlan, staffPageSetting] =
  await Promise.all([
    findPageContentsByPageKey("TOP"),
    findLatestPublishedMonthlyPracticePlan(),
    findStaffPageSetting(),
  ]);

const contentMap = toContentMap(contents);
const summarySections = buildTopSummarySections(contentMap);

const topDisplaySections = summarySections.flatMap((section) => {
  if (section.id !== "about-summary") {
    return [{ type: "summary" as const, section }];
  }

  return [
    { type: "summary" as const, section },
    { type: "staff" as const },
  ];
});

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
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6 sm:gap-4">
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
      {monthlyPracticePlan ? (
  <MonthlyPracticePlanSection
    title={monthlyPracticePlan.title}
    href={monthlyPracticePlan.pdfUrl}
  />
) : null}

<div className="divide-y divide-neutral-300">
  {topDisplaySections.map((item) => {
    if (item.type === "staff") {
      return (
        <StaffSummarySection
          key="staff-summary"
          staffPageSetting={staffPageSetting}
        />
      );
    }

    return (
      <TopSummarySection
        key={item.section.id}
        id={item.section.id}
        title={item.section.title}
        heading={item.section.heading}
        body={item.section.body}
        href={item.section.href}
        imageLabel={item.section.imageLabel}
        imageUrl={item.section.imageUrl}
        imageAlt={item.section.imageAlt}
      />
    );
  })}
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

function MonthlyPracticePlanSection({
  title,
  href,
}: {
  title: string;
  href: string;
}) {
  return (
    <section
      aria-labelledby="monthly-practice-plan-title"
      className="border-b border-neutral-300 py-6"
    >
      <div className="rounded-2xl border border-green-100 bg-green-50 p-5">
        <p className="text-sm font-bold text-green-700">
          新着・重要なお知らせ
        </p>

        <h2
          id="monthly-practice-plan-title"
          className="mt-2 text-xl font-black text-neutral-900"
        >
          月別練習計画
        </h2>

        <p className="mt-2 text-sm leading-7 text-neutral-600">
          最新の練習計画をPDFで確認できます。
        </p>

        <div className="mt-4">
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-md bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            📅 {title}をダウンロード
          </a>
        </div>
      </div>
    </section>
  );
}

function StaffSummarySection({
  staffPageSetting,
}: {
  staffPageSetting: StaffPageSetting | null;
}) {
  const safeImageUrl = validateImageUrl(staffPageSetting?.topImageUrl);

  const heading =
    staffPageSetting?.topSummaryTitle || STAFF_TOP_SUMMARY_TITLE_FALLBACK;

  const body =
    staffPageSetting?.topSummaryBody || STAFF_TOP_SUMMARY_BODY_FALLBACK;

  return (
    <section
      id="staff-summary"
      aria-labelledby="staff-summary-title"
      className="scroll-section py-10 sm:py-14"
    >
      <div className="space-y-5">
        <h2 className="text-left text-2xl font-black tracking-wide text-neutral-900 sm:text-3xl">
          スタッフ紹介
        </h2>

        {safeImageUrl ? (
          <div className="relative aspect-video w-full overflow-hidden border border-neutral-300 bg-neutral-100">
            <Image
              src={safeImageUrl}
              alt={staffPageSetting?.topImageAlt || "スタッフ紹介"}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center border border-neutral-300 bg-neutral-100">
            <span className="text-sm font-bold tracking-[0.3em] text-neutral-400">
              STAFF
            </span>
          </div>
        )}

        <div className="space-y-4">
          <h3
            id="staff-summary-title"
            className="whitespace-pre-wrap text-xl font-black leading-relaxed text-neutral-900 sm:text-2xl"
          >
            {heading}
          </h3>

          <p className="whitespace-pre-wrap leading-8 text-neutral-700">
            {body}
          </p>
        </div>

        <div className="flex justify-end">
          <Link
            href="/staff#top"
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