import { ChevronDown } from "lucide-react";//下矢印アイコン
import { PageTitle } from "@/components/public/PageTitle";
import {
  FAQ_CATEGORY_LABELS,
  FAQ_CATEGORY_NAV_LABELS,
  FAQ_CATEGORY_ORDER,
} from "@/constants/faq";
import { findPublishedFaqs } from "@/lib/repositories/faq";

// 【追加】FAQデータの正しい構造を型として定義（anyを排除）
type FaqItem = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const faqs = await findPublishedFaqs();

  // バラバラのFAQデータをカテゴリごとに分けて表示しやすい形に作り変える関数
  const faqsByCategory = FAQ_CATEGORY_ORDER.map((category) => {
    // 【修正ポイント】anyを使わず、上で作った FaqItem 型を割り当てる
    const items = faqs.filter((faq: FaqItem) => faq.category === category);

    return {
      category,
      label: FAQ_CATEGORY_LABELS[category],
      navLabel: FAQ_CATEGORY_NAV_LABELS[category],
      items,
    };
  });

  return (
    <div>
      <PageTitle title="よくある質問" />

      <nav aria-label="FAQカテゴリメニュー" className="mb-10 pt-6">
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {faqsByCategory.map((category) => (
            <li key={category.category}>
              <a
                href={`#faq-${category.category.toLowerCase()}`}
                className="flex min-h-24 flex-col items-center justify-center border border-neutral-800 bg-white px-2 py-4 text-center text-xs font-bold text-neutral-900 transition hover:bg-green-50 hover:text-green-800 sm:text-sm"
              >
                <span>{category.navLabel[0]}</span>
                <span>{category.navLabel[1]}</span>
                <span className="mt-3 h-px w-10 bg-neutral-800" />
                <ChevronDown className="mt-2 h-5 w-5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12 pb-12">
        {faqsByCategory.map((category) => (
          <section
            key={category.category}
            id={`faq-${category.category.toLowerCase()}`}
            className="scroll-mt-24"
          >
            <div className="border-y-2 border-neutral-800 py-4">
              <h2 className="text-xl font-black text-neutral-900">
                {category.label}
              </h2>
            </div>

            {category.items.length === 0 ? (
              <p className="py-6 text-neutral-500">
                現在、このカテゴリのFAQはありません。
              </p>
            ) : (
              <div className="divide-y divide-dashed divide-neutral-300">
                {category.items.map((faq) => (
                  <article key={faq.id} className="py-6">
                    <h3 className="font-bold leading-8 text-neutral-900">
                      <span className="mr-1 font-black text-green-700">
                        Q.
                      </span>
                      {faq.question}
                    </h3>

                    <p className="mt-3 leading-8 text-neutral-700">
                      <span className="mr-1 font-black text-red-600">A.</span>
                      {faq.answer}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ))}

        <a
          href="#top"
          className="fixed bottom-5 right-4 z-20 rounded-full border border-green-800 bg-white/95 px-4 py-2 text-xs font-bold text-green-800 shadow-lg transition hover:bg-green-50 sm:bottom-8 sm:right-8 sm:text-sm"
        >
          ▲ページ上部へ
        </a>
      </div>
    </div>
  );
}
