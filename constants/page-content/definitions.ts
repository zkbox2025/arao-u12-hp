// constants/page-content/definitions.ts
// サイト内文章設定で編集できるページ・公開URL・ブロック定義

export const PAGE_CONTENT_DEFINITIONS = {
  TOP: {
    label: "トップページ",
    publicPath: "/explore",
    blocks: {
      ABOUT_SUMMARY_TITLE: "チーム紹介：要約見出し",
      ABOUT_SUMMARY_BODY: "チーム紹介：要約本文",
      POLICY_SUMMARY_TITLE: "指導方針：要約見出し",
      POLICY_SUMMARY_BODY: "指導方針：要約本文",
      SUMMARY_SUMMARY_TITLE: "活動概要：要約見出し",
      SUMMARY_SUMMARY_BODY: "活動概要：要約本文",
      FLOW_SUMMARY_TITLE: "体験/見学の流れ：要約見出し",
      FLOW_SUMMARY_BODY: "体験/見学の流れ：要約本文",
      FAQ_SUMMARY_TITLE: "よくある質問：要約見出し",
      FAQ_SUMMARY_BODY: "よくある質問：要約本文",
    },
  },

  ABOUT: {
    label: "チーム紹介",
    publicPath: "/about",
    blocks: {
      TEAM_NAME: "チーム名",
      CONCEPT_TITLE: "コンセプト見出し",
      MAIN_BODY: "チーム紹介本文",
    },
  },

  POLICY: {
    label: "指導方針",
    publicPath: "/policy",
    blocks: {
      CONCEPT_HEADING: "理念：見出し",
      CONCEPT_HEADING_ENGLISH: "理念：見出し（英語）",
      CONCEPT_SUB_HEADING: "理念：小見出し",
      CONCEPT_BODY: "理念：本文",
    },
  },

  SUMMARY: {
    label: "活動概要",
    publicPath: "/summary",
    blocks: {
      PLACE_BODY: "活動場所",
      TARGET_BODY: "対象",
      SCHEDULE_BODY: "練習日時",
      MONTHLY_FEE_BODY: "月謝",
      OTHER_COST_BODY: "その他費用",
      ITEMS_BODY: "用意するもの",
    },
  },

  FLOW: {
    label: "体験/見学の流れ",
    publicPath: "/flow",
    blocks: {
      IMPORTANT_NOTICE_BODY: "重要アナウンス文",
      STEP1_HEADING: "STEP1：見出し",
      STEP1_BODY: "STEP1：本文",
      STEP2_HEADING: "STEP2：見出し",
      STEP2_BODY: "STEP2：本文",
      BELONGINGS_BODY: "当日の持ち物",
    },
  },

  SESSION_APPLICATION: {
    label: "体験/見学申し込み",
    publicPath: "/session-application",
    blocks: {
      LEAD_BODY: "申し込みページ案内文",
      BEGINNER_NOTE: "未経験歓迎の補足文",
      THANKS_MESSAGE: "送信完了メッセージ",
      AUTO_REPLY_BODY: "自動返信メール本文",
    },
  },

  JOIN: {
    label: "入会のご案内",
    publicPath: "/join",
    blocks: {
      LEAD_BODY: "導入文",
      STEP1_HEADING: "STEP1：見出し",
      STEP1_BODY: "STEP1：本文",
      STEP2_HEADING: "STEP2：見出し",
      STEP2_BODY: "STEP2：本文",
      STEP3_HEADING: "STEP3：見出し",
      STEP3_BODY: "STEP3：本文",
      NO_PRINTER_HEADING: "自宅にプリンターがない方へ：見出し",
      NO_PRINTER_BODY: "自宅にプリンターがない方へ：本文",
    },
  },

  FAQ: {
    label: "よくある質問",
    publicPath: "/faq",
    blocks: {
      LEAD_BODY: "FAQページ案内文",
    },
  },

  CONTACT: {
    label: "お問い合わせ",
    publicPath: "/contact",
    blocks: {
      LEAD_BODY: "お問い合わせページ案内文",
      THANKS_MESSAGE: "送信完了メッセージ",
      AUTO_REPLY_BODY: "自動返信メール本文",
    },
  },

  TERM: {
    label: "クラブ規約",
    publicPath: "/term",
    blocks: {
      LEAD_BODY: "規約ページ案内文",
      PDF_DOWNLOAD_GUIDE: "PDFダウンロード案内文",
      TERM_BODY: "クラブ規約本文",
    },
  },
} as const;