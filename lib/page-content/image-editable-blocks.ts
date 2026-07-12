// lib/page-content/image-editable-blocks.ts
// トップページで画像編集を許可するブロックを定義する

import { TOP_SUMMARY_IMAGE_ITEMS } from "@/constants/top-summary-images";

const TOP_IMAGE_EDITABLE_BLOCK_KEYS: string[] = TOP_SUMMARY_IMAGE_ITEMS.map(
  (item) => item.blockKey
);

export function canEditPageContentImage({
  pageKey,
  blockKey,
}: {
  pageKey: string;
  blockKey: string;
}) {
  return pageKey === "TOP" && TOP_IMAGE_EDITABLE_BLOCK_KEYS.includes(blockKey);
}