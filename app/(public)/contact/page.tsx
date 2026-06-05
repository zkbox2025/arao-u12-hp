//app/(public)/contact/page.tsx
//公開ページのお問い合わせページ

import { ContactForm } from "@/components/form/ContactForm";
import { ThanksModal } from "@/components/form/ThanksModal";
import { PageTitle } from "@/components/public/PageTitle";

type ContactPageProps = {
  searchParams: Promise<{
    submitted?: string;
  }>;
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const params = await searchParams;
  const isSubmitted = params.submitted === "success";

  return (
    <>
      {isSubmitted ? (
        <ThanksModal
          title="お問い合わせありがとうございました。"
          message={`送信が完了いたしました。

内容を確認の上、担当者よりメールにて改めてご連絡いたします。
今しばらくお待ちいただけますようお願いいたします。`}
        />
      ) : null}

      <PageTitle title="お問い合わせ" />

      <p className="leading-8 text-neutral-700">
        ARAO U-12 BASKETBALL CLUBへのお問い合わせはこちらからお願いします。
        <br />
        下記のフォームに必要事項をご記入ください。
      </p>

      <ContactForm />
    </>
  );
}