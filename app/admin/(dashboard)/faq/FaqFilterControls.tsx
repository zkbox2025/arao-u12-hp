// app/admin/(dashboard)/faq/FaqFilterControls.tsx
// FAQ管理ページのカテゴリータブおよびステータスタブの実装と、変更の際のURL（クエリパラメータ付き）を作成する関数
//新規作成モーダル（ボタン付き）もインポートしている

"use client";

import { useRouter } from "next/navigation";
import {
  FAQ_CATEGORIES,
  FAQ_STATUS_FILTERS,
  type FaqCategoryValue,
  type FaqStatusFilterValue,
} from "@/constants/faq";
import { FaqCreateModal } from "./FaqCreateModal";

type FaqFilterControlsProps = {
  selectedCategory: FaqCategoryValue;
  selectedStatus: FaqStatusFilterValue;
};

//カテゴリータブおよびステータスタブが変更された際に新しいクエリパラメータ付きURLを作成更新する関数
export function FaqFilterControls({
  selectedCategory,
  selectedStatus,
}: FaqFilterControlsProps) {
  const router = useRouter();

  function updateSearchParams({
    category,
    status,
  }: {
    category: string;
    status: string;
  }) {
    const params = new URLSearchParams();

    params.set("category", category);
    params.set("status", status);

    router.push(`/admin/faq?${params.toString()}#top`);
  }

  return (
    <div className="mt-6 space-y-4">
      <FaqCreateModal />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="category"
            className="block text-sm font-bold text-neutral-900"
          >
            カテゴリー
          </label>
          <select
            id="category"
            value={selectedCategory}
            onChange={(event) =>
              updateSearchParams({
                category: event.target.value,
                status: selectedStatus,
              })
            }
            className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3"
          >
            {FAQ_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="status"
            className="block text-sm font-bold text-neutral-900"
          >
            ステータス
          </label>
          <select
            id="status"
            value={selectedStatus}
            onChange={(event) =>
              updateSearchParams({
                category: selectedCategory,
                status: event.target.value,
              })
            }
            className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3"
          >
            {FAQ_STATUS_FILTERS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}