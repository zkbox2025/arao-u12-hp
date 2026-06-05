// app/(public)/join/page.tsx
// 公開ページの入会のご案内ページ

import { PageTitle } from "@/components/public/PageTitle";
import { Download } from "lucide-react";
import Link from "next/link";

const joinSteps = [
  {
    step: "STEP 1",
    title: "入会届のダウンロード",
    body: "下記のボタンから「入会届（PDF）」をダウンロードして印刷します。",
    buttonLabel: "入会届(PDF)をダウンロードする",
    buttonHref: "/documents/join-application.pdf",
  },
  {
    step: "STEP 2",
    title: "必要事項のご記入",
    body: "用紙に必要事項をご記入ください。※捺印や難しい記入項目はありません。",
  },
  {
    step: "STEP 3",
    title: "体育館でご提出",
    body: "お子様と一緒に体育館へお越しいただき、コーチまたは近くの保護者へご提出ください。",
  },
] as const;

export default function JoinPage() {
  return (
    <div>
      <PageTitle title="入会のご案内" />

      <div className="space-y-8">
        {joinSteps.map((item) => (
          <section key={item.step} className="border-b border-neutral-300 pb-6">
            <p className="font-bold text-green-700">{item.step}</p>

            <h2 className="mt-2 text-xl font-black">{item.title}</h2>

            <p className="mt-4 leading-8 text-neutral-700">{item.body}</p>

            {"buttonHref" in item ? (
              <div className="mt-5">
                <a
                  href={item.buttonHref}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
                >
                  <Download size={18} aria-hidden="true" />
                  {item.buttonLabel}
                </a>
              </div>
            ) : null}
          </section>
        ))}

        <section className="border-b border-neutral-300 pb-6">
          <h2 className="text-xl font-black">
            自宅にプリンターがない方へ
          </h2>

          <p className="mt-4 leading-8 text-neutral-700">
            体験・見学の際に、紙の入会届をその場でお渡しすることも可能です。
            印刷できない場合も、どうぞ安心してお越しください。
          </p>
        </section>

        <div className="mt-5 mb-16">
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



