// app/(public)/session-application/page.tsx
// 公開ページの体験/見学申し込みページ

import { SessionApplicationForm } from "@/components/form/SessionApplicationForm";
import { ThanksModal } from "@/components/form/ThanksModal";
import { PageTitle } from "@/components/public/PageTitle";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

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

  const contents = await findPageContentsByPageKey("SESSION_APPLICATION");
  const contentMap = toContentMap(contents);

  const leadBody = getContentText({
    contentMap,
    blockKey: "LEAD_BODY",
    fallback:
      "無料体験/見学のお申し込みはこちらからお願いします。下記のフォームに必要事項をご記入ください。",
  });

  const beginnerNote = getContentText({
    contentMap,
    blockKey: "BEGINNER_NOTE",
    fallback: "未経験のお子様も大歓迎です！",
  });

  const thanksMessage = getContentText({
    contentMap,
    blockKey: "THANKS_MESSAGE",
    fallback:
      "体験/見学の申し込みが完了しました。\n\n【当日お越しいただく際のご案内】\n体験をお申し込みの方は、体育館シューズ、飲み物、運動着上下、タオルをご持参ください。\n\n見学をお申し込みの方は、特にお持ちいただくものはございません。\n\nどうぞお気軽にお越しください。",
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