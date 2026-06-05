//app/(public)/term/page.tsx
//公開ページのクラブ規約ページ

import { PageTitle } from "@/components/public/PageTitle";

export default function TermPage() {
  return (
    <div>
      <PageTitle title="クラブ規約" />

      <p className="leading-8 text-neutral-700">
        当クラブでは、子どもたちが安全に、そして楽しくバスケットボールに打ち込める環境をつくるため、クラブ規約を設けています。
      </p>
    </div>
  );
}