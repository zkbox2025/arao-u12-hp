// constants/top-summary-images.ts
// トップページ要約写真として編集できるブロック定義

import type { PageContentBlockKey } from "@/constants/page-content";

export const TOP_SUMMARY_IMAGE_ITEMS = [
  {
    id: "about-summary-image",
    label: "チーム紹介",
    blockKey: "ABOUT_SUMMARY_BODY",
    imageLabel: "ABOUT",
  },
  {
    id: "policy-summary-image",
    label: "指導方針",
    blockKey: "POLICY_SUMMARY_BODY",
    imageLabel: "POLICY",
  },
  {
    id: "summary-summary-image",
    label: "活動内容・費用",
    blockKey: "SUMMARY_SUMMARY_BODY",
    imageLabel: "SUMMARY",
  },
  {
    id: "flow-summary-image",
    label: "体験/見学の流れ",
    blockKey: "FLOW_SUMMARY_BODY",
    imageLabel: "FLOW",
  },
  {
    id: "faq-summary-image",
    label: "よくある質問",
    blockKey: "FAQ_SUMMARY_BODY",
    imageLabel: "FAQ",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  blockKey: PageContentBlockKey<"TOP">;
  imageLabel: string;
}[];