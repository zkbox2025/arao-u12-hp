// app/(public)/contact/page.tsx
// 公開ページのお問い合わせページ

import { ContactForm } from "@/components/form/ContactForm";
import { ThanksModal } from "@/components/form/ThanksModal";
import { PageTitle } from "@/components/public/PageTitle";
import { getPageContentFallback } from "@/constants/page-content";
import { definePageContentBlockKeys } from "@/lib/page-content/typed-block-keys";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

const CONTACT_PAGE_KEY = "CONTACT" as const;

const CONTACT_BLOCK_KEYS = definePageContentBlockKeys(CONTACT_PAGE_KEY, {
  leadBody: "LEAD_BODY",
  thanksMessage: "THANKS_MESSAGE",
});

type ContactPageProps = {
  searchParams: Promise<{
    submitted?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const params = await searchParams;
  const isSubmitted = params.submitted === "success";

  const contents = await findPageContentsByPageKey(CONTACT_PAGE_KEY);
  const contentMap = toContentMap(contents);

  const leadBody = getContentText({
    contentMap,
    pageKey: CONTACT_PAGE_KEY,
    blockKey: CONTACT_BLOCK_KEYS.leadBody,
    fallback: getPageContentFallback({
      pageKey: CONTACT_PAGE_KEY,
      blockKey: CONTACT_BLOCK_KEYS.leadBody,
    }),
  });

  const thanksMessage = getContentText({
    contentMap,
    pageKey: CONTACT_PAGE_KEY,
    blockKey: CONTACT_BLOCK_KEYS.thanksMessage,
    fallback: getPageContentFallback({
      pageKey: CONTACT_PAGE_KEY,
      blockKey: CONTACT_BLOCK_KEYS.thanksMessage,
    }),
  });

  return (
    <>
      {isSubmitted ? (
        <ThanksModal
          title="お問い合わせありがとうございました。"
          message={thanksMessage}
        />
      ) : null}

      <PageTitle title="お問い合わせ" />

      <p className="whitespace-pre-wrap leading-8 text-neutral-700">
        {leadBody}
      </p>

      <ContactForm />
    </>
  );
}