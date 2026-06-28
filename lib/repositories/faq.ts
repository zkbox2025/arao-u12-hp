// lib/repositories/faq.ts
// FAQのデータをDBから持ってくるリポジトリファイル

import { prisma } from "@/src/infrastructure/prisma/client";
import { FAQ_CATEGORY_ORDER } from "@/constants/faq";
import type { FaqCategory } from "@/types/prisma";

//カテゴリーの番号を計算する関数
function getCategoryOrder(category: FaqCategory) {
  const index = FAQ_CATEGORY_ORDER.indexOf(category);//FAQ_CATEGORY_ORDERの型にキャストして（６つのうちのどれかに当てはまらなくてはならない。そのチェックをする）からindexOfで番号を取得することで、６つの型に変換させる

  return index === -1 ? FAQ_CATEGORY_ORDER.length : index;//もしindexが見つからなければ（-1であれば）、一番大きな数字になる。もしindexがあればindexのまま返す。これでFAQ_CATEGORY_ORDERに定義されていないカテゴリは、常に最後に表示されるようになる。
}

export async function findPublishedFaqs() {
  const faqs = await prisma.faq.findMany({
    where: {
      status: "PUBLISHED",
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  return faqs.sort((a, b) => {
    const categoryDiff =
      getCategoryOrder(a.category) - getCategoryOrder(b.category);

    if (categoryDiff !== 0) {//差があればその差を返す（別カテゴリー）。差がなければ次の条件に行く（同じカテゴリー）。
      return categoryDiff;
    }

    //DBで取得の際に同じカテゴリ内のFAQは番号順かつ最新順に並び替えらえてるけど
    // 並び順を明示的にするためと保検のために以下を書いておく
    if (a.sortOrder !== b.sortOrder) {//小さい順に並べたいので、aからbを引く。sortOrderが同じでなければ、その差を返す（sortOrderの順番）。同じであれば次の条件に行く(sortOrderが同じ)。
      return a.sortOrder - b.sortOrder;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();//作成日が古い順に並べ替える
  });
}