// app/(public)/contact/page.tsx
// 公開ページのお問い合わせページ

import { ContactForm } from "@/components/form/ContactForm";
import { ThanksModal } from "@/components/form/ThanksModal";
import { PageTitle } from "@/components/public/PageTitle";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

type ContactPageProps = {
  searchParams: Promise<{
    submitted?: string;
  }>;
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const params = await searchParams;
  const isSubmitted = params.submitted === "success";

  const contents = await findPageContentsByPageKey("CONTACT");
  const contentMap = toContentMap(contents);

  const leadBody = getContentText({
    contentMap,
    blockKey: "LEAD_BODY",
    fallback:
      "ARAO U-12 BASKETBALL CLUBへのお問い合わせはこちらからお願いします。\n下記のフォームに必要事項をご記入ください。",
  });

  const thanksMessage = getContentText({
    contentMap,
    blockKey: "THANKS_MESSAGE",
    fallback:
      "送信が完了いたしました。\n内容を確認の上、担当者よりメールにて改めてご連絡いたします。\n今しばらくお待ちいただけますようお願いいたします。",
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