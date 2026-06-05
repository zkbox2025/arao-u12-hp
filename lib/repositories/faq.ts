// lib/repositories/faq.ts
// FAQのデータをDBから持ってくるリポジトリファイル

import "dotenv/config";
import { prisma } from "@/src/infrastructure/prisma/client";
import { FAQ_CATEGORY_ORDER } from "@/constants/faq";

function getCategoryOrder(category: string) {
  const index = FAQ_CATEGORY_ORDER.indexOf(
    category as (typeof FAQ_CATEGORY_ORDER)[number]//FAQ_CATEGORY_ORDERの型にキャストして（６つのうちのどれかに当てはまらなくてはならない。そのチェックをする）からindexOfで番号を取得することで、６つの型に変換させる
  );

  return index === -1 ? FAQ_CATEGORY_ORDER.length : index;//もしindexが見つからなければ（-1であれば）、一番大きな数字になる。もしindexがあればindexのまま返す。これでFAQ_CATEGORY_ORDERに定義されていないカテゴリは、常に最後に表示されるようになる。
}

export async function findPublishedFaqs() {
  const faqs = await prisma.faq.findMany({
    where: {
      status: "PUBLISHED",
    },
  });

  return faqs.sort((a, b) => {
    const categoryDiff =
      getCategoryOrder(a.category) - getCategoryOrder(b.category);

    if (categoryDiff !== 0) {//差があればその差を返す（別カテゴリー）。差がなければ次の条件に行く（同じカテゴリー）。
      return categoryDiff;
    }

    if (a.sortOrder !== b.sortOrder) {//小さい順に並べたいので、aからbを引く。sortOrderが同じでなければ、その差を返す（sortOrderの順番）。同じであれば次の条件に行く(sortOrderが同じ)。
      return a.sortOrder - b.sortOrder;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();//作成日が古い順に並べ替える
  });
}