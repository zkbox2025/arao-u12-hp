//app/(public)/session-application/page.tsx
//公開ページの体験/見学申し込みページ


import { SessionApplicationForm } from "@/components/form/SessionApplicationForm";
import { ThanksModal } from "@/components/form/ThanksModal";
import { PageTitle } from "@/components/public/PageTitle";

type SessionApplicationPageProps = {
  searchParams: Promise<{
    submitted?: string;
  }>;
};

export default async function SessionApplicationPage({
  searchParams,
}: SessionApplicationPageProps) {
  const params = await searchParams;
  const isSubmitted = params.submitted === "success";

  return (
    <>
      {isSubmitted ? (
        <ThanksModal
          title="お申し込みありがとうございました。"
          message={`体験/見学の申し込みが完了しました。

【当日お越しいただく際のご案内】
体験をお申し込みの方は、体育館シューズ、飲み物、運動着上下、タオルをご持参ください。

見学をお申し込みの方は、特にお持ちいただくものはございません。
どうぞお気軽にお越しください。`}
        />
      ) : null}

      <PageTitle title="体験/見学申し込み" />

      <p className="leading-8 text-neutral-700">
        無料体験/見学のお申し込みはこちらからお願いします。
        <br />
        下記のフォームに必要事項をご記入ください。未経験のお子様も大歓迎です！
      </p>

      <SessionApplicationForm />
    </>
  );
}