// app/(public)/join/page.tsx
// 公開ページの入会のご案内ページ

import { PageTitle } from "@/components/public/PageTitle";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

export default async function JoinPage() {
  const contents = await findPageContentsByPageKey("JOIN");
  const contentMap = toContentMap(contents);

  const leadBody = getContentText({
    contentMap,
    blockKey: "LEAD_BODY",
    fallback: "入会をご希望の方は、以下の流れに沿ってお手続きください。",
  });

  const joinSteps = [
    {
      step: "STEP 1",
      title: getContentText({
        contentMap,
        blockKey: "STEP1_HEADING",
        fallback: "入会届のダウンロード",
      }),
      body: getContentText({
        contentMap,
        blockKey: "STEP1_BODY",
        fallback:
          "下記のボタンから「入会届（PDF）」を印刷します。",
      }),
      buttonLabel: "入会届（PDF）",
      buttonHref: "/documents/join-application.pdf",
    },
    {
      step: "STEP 2",
      title: getContentText({
        contentMap,
        blockKey: "STEP2_HEADING",
        fallback: "必要事項のご記入",
      }),
      body: getContentText({
        contentMap,
        blockKey: "STEP2_BODY",
        fallback: "用紙に必要事項をご記入ください。\n※難しい記入項目はありません。",
      }),
    },
    {
      step: "STEP 3",
      title: getContentText({
        contentMap,
        blockKey: "STEP3_HEADING",
        fallback: "体育館でご提出",
      }),
      body: getContentText({
        contentMap,
        blockKey: "STEP3_BODY",
        fallback:
          "お子様と一緒に体育館へお越しいただき、コーチまたは近くの保護者へご提出ください。",
      }),
    },
  ];

  const noPrinterHeading = getContentText({
    contentMap,
    blockKey: "NO_PRINTER_HEADING",
    fallback: "自宅にプリンターがない方へ",
  });

  const noPrinterBody = getContentText({
    contentMap,
    blockKey: "NO_PRINTER_BODY",
    fallback:
      "体験・見学の際に、紙の入会届をその場でお渡しすることも可能です。印刷できない場合も、どうぞ安心してお越しください。",
  });

  return (
    <div>
      <PageTitle title="入会のご案内" />

      <p className="mb-8 whitespace-pre-wrap leading-8 text-neutral-700">
        {leadBody}
      </p>

      <div className="space-y-8">
        {joinSteps.map((item) => (
          <section key={item.step} className="border-b border-neutral-300 pb-6">
            <p className="font-bold text-green-700">{item.step}</p>

            <h2 className="mt-2 whitespace-pre-wrap text-xl font-black">
              {item.title}
            </h2>

            <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
              {item.body}
            </p>

            {"buttonHref" in item ? (
              <div className="mt-5">
                <a
  href={item.buttonHref}
  target="_blank"
  rel="noreferrer"
  className="inline-flex items-center justify-center gap-2 rounded-md bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
>
  <ExternalLink size={18} aria-hidden="true" />
  {item.buttonLabel}
</a>
              </div>
            ) : null}
          </section>
        ))}

       <section className="rounded-2xl border border-green-100 bg-green-50 p-5">
  <p className="text-sm font-bold text-green-700">補足</p>

  <h2 className="mt-2 whitespace-pre-wrap text-lg font-black text-neutral-900">
    {noPrinterHeading}
  </h2>

  <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
    {noPrinterBody}
  </p>
</section>

        <div className="mb-16 mt-5">
          <Link
            href="/session-application"
            className="inline-flex items-center justify-center rounded-md bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            体験/見学申し込みはこちら
          </Link>
        </div>
      </div>
    </div>
  );
}