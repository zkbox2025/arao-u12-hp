// app/(public)/session-application/page.tsx
// 公開ページの体験/見学申し込みページ

import { SessionApplicationForm } from "@/components/form/SessionApplicationForm";
import { ThanksModal } from "@/components/form/ThanksModal";
import { PageTitle } from "@/components/public/PageTitle";
import { getPageContentFallback } from "@/constants/page-content";
import { definePageContentBlockKeys } from "@/lib/page-content/typed-block-keys";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

const SESSION_APPLICATION_PAGE_KEY = "SESSION_APPLICATION" as const;

const SESSION_APPLICATION_BLOCK_KEYS = definePageContentBlockKeys(
  SESSION_APPLICATION_PAGE_KEY,
  {
    leadBody: "LEAD_BODY",
    beginnerNote: "BEGINNER_NOTE",
    thanksMessage: "THANKS_MESSAGE",
  }
);

type SessionApplicationPageProps = {
  searchParams: Promise<{
    submitted?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SessionApplicationPage({
  searchParams,
}: SessionApplicationPageProps) {
  const params = await searchParams;
  const isSubmitted = params.submitted === "success";

  const contents = await findPageContentsByPageKey(
    SESSION_APPLICATION_PAGE_KEY
  );
  const contentMap = toContentMap(contents);

  const leadBody = getContentText({
    contentMap,
    pageKey:SESSION_APPLICATION_PAGE_KEY,
    blockKey: SESSION_APPLICATION_BLOCK_KEYS.leadBody,
    fallback: getPageContentFallback({
      pageKey: SESSION_APPLICATION_PAGE_KEY,
      blockKey: SESSION_APPLICATION_BLOCK_KEYS.leadBody,
    }),
  });

  const beginnerNote = getContentText({
    contentMap,
    pageKey:SESSION_APPLICATION_PAGE_KEY,
    blockKey: SESSION_APPLICATION_BLOCK_KEYS.beginnerNote,
    fallback: getPageContentFallback({
      pageKey: SESSION_APPLICATION_PAGE_KEY,
      blockKey: SESSION_APPLICATION_BLOCK_KEYS.beginnerNote,
    }),
  });

  const thanksMessage = getContentText({
    contentMap,
    pageKey:SESSION_APPLICATION_PAGE_KEY,
    blockKey: SESSION_APPLICATION_BLOCK_KEYS.thanksMessage,
    fallback: getPageContentFallback({
      pageKey: SESSION_APPLICATION_PAGE_KEY,
      blockKey: SESSION_APPLICATION_BLOCK_KEYS.thanksMessage,
    }),
  });

  return (
    <>
      {isSubmitted ? (
        <ThanksModal
          title="お申し込みありがとうございました。"
          message={thanksMessage}
        />
      ) : null}

      <PageTitle title="体験/見学申し込み" />

      <div className="space-y-3">
        <p className="whitespace-pre-wrap leading-8 text-neutral-700">
          {leadBody}
        </p>

        <p className="font-bold leading-8 text-green-700">{beginnerNote}</p>
      </div>

      <SessionApplicationForm />
    </>
  );
}