// prisma/seed.ts
// データベースに初期データを投入するためのシードファイル
// FAQの仮質問・仮回答を投入する
// PageContent初期データを投入する
//
// ローカルDBに流し込む際のコマンド：npm run db:seed:local
// 本番DBに流し込む際のコマンド：npm run db:seed:prod
// 本番DBに流し込む際は、接続先DATABASE_URLを必ず確認してから実行する

import "dotenv/config";
import { prisma } from "@/src/infrastructure/prisma/client";
import {
  PAGE_CONTENT_DEFINITIONS,
  PAGE_CONTENT_FALLBACKS,
  type PageContentPageKey,
} from "@/constants/page-content";


async function main() {
  const faqSamples = [
    // 入会対象について
    {
      id: "sample-faq-target-001",
      category: "TARGET" as const,
      question: "未経験で身長が低いのですが大丈夫ですか？",
      answer:
        "大丈夫です。ARAO U-12では、身長や経験の有無に関係なく、一人ひとりの成長に合わせて指導しています。最初はボールに慣れることや、体を動かす楽しさを感じるところから始めていきますので、未経験のお子さまも安心してご参加ください。",
      status: "PUBLISHED" as const,
      sortOrder: 1,
    },
    {
      id: "sample-faq-target-002",
      category: "TARGET" as const,
      question: "高学年から始めても試合に出るチャンスはありますか？",
      answer:
        "あります。試合への出場は、学年だけで決まるものではなく、練習への取り組み方や成長の様子を見ながら判断しています。高学年から始めたお子さまでも、前向きに練習を続けることで試合に出るチャンスは十分にあります。",
      status: "PUBLISHED" as const,
      sortOrder: 2,
    },
    {
      id: "sample-faq-target-003",
      category: "TARGET" as const,
      question: "荒尾市外の学校に通っていますが馴染めますか？",
      answer:
        "はい、大丈夫です。荒尾市外の学校に通っているお子さまでも参加できます。最初は緊張するかもしれませんが、練習やチーム活動を通して自然と仲間との関わりが増えていきますので、安心してお越しください。",
      status: "PUBLISHED" as const,
      sortOrder: 3,
    },

    // 練習について
    {
      id: "sample-faq-practice-001",
      category: "PRACTICE" as const,
      question: "他の習い事との両立はできますか？",
      answer:
        "可能です。ご家庭の予定や他の習い事とのバランスを取りながら参加しているお子さまもいます。無理なく続けられることも大切にしていますので、事前にご相談ください。",
      status: "PUBLISHED" as const,
      sortOrder: 1,
    },
    {
      id: "sample-faq-practice-002",
      category: "PRACTICE" as const,
      question: "見学はできますか？",
      answer:
        "はい、見学できます。練習の雰囲気や子どもたちの様子を実際に見ていただくことで、入会後のイメージがしやすくなります。見学をご希望の方は、体験/見学申し込みフォームよりお気軽にお申し込みください。",
      status: "PUBLISHED" as const,
      sortOrder: 2,
    },
    {
      id: "sample-faq-practice-003",
      category: "PRACTICE" as const,
      question:
        "祝日や、夏休み・冬休みなどの長期休みの練習について教えてください。",
      answer:
        "祝日や長期休み期間中の練習は、体育館の使用状況や大会予定などにより変更になる場合があります。通常と異なる練習日程になる場合は、事前にお知らせします。",
      status: "PUBLISHED" as const,
      sortOrder: 3,
    },
    {
      id: "sample-faq-practice-004",
      category: "PRACTICE" as const,
      question:
        "体調不良や学校行事、家族の用事で練習を休む場合はどうすればいいですか？",
      answer:
        "体調不良や学校行事、ご家庭の都合でお休みする場合は、チームの連絡方法に沿ってご連絡をお願いします。体調を優先しながら、無理のない形で参加していただければ大丈夫です。",
      status: "PUBLISHED" as const,
      sortOrder: 4,
    },

    // 活動内容について
    {
      id: "sample-faq-activity-001",
      category: "ACTIVITY" as const,
      question: "どれくらいの頻度で大会に出場しますか？",
      answer:
        "大会や試合への参加頻度は、年度やチーム状況、大会日程によって異なります。公式戦や練習試合など、子どもたちの成長につながる機会には積極的に参加しています。詳しい予定は、入会後に随時お知らせします。",
      status: "PUBLISHED" as const,
      sortOrder: 1,
    },
    {
      id: "sample-faq-activity-002",
      category: "ACTIVITY" as const,
      question: "合宿などはありますか？",
      answer:
        "年度やチーム状況によって実施する場合があります。合宿や遠征などを行う際は、目的や日程、費用、参加方法などを事前に保護者の皆さまへお知らせします。",
      status: "PUBLISHED" as const,
      sortOrder: 2,
    },

    // 保護者向け
    {
      id: "sample-faq-parent-001",
      category: "PARENT" as const,
      question: "保護者の当番制はありますか？",
      answer:
        "保護者の方の当番制は一切ありません。練習や大会の様子は、ご都合の良い時にいつでも自由にご見学いただけます。",
      status: "PUBLISHED" as const,
      sortOrder: 1,
    },
    {
      id: "sample-faq-parent-002",
      category: "PARENT" as const,
      question: "子どもの送迎は必須ですか？",
      answer:
        "お子様の送迎については、各ご家庭の方針にお任せしております。安全のため、行き帰りのルートや方法については、事前にご家庭内でよく話し合って決めていただくようお願いいたします。",
      status: "PUBLISHED" as const,
      sortOrder: 2,
    },
    {
      id: "sample-faq-parent-003",
      category: "PARENT" as const,
      question:
        "下の子を連れて練習の見学や応援に行っても大丈夫ですか？",
      answer:
        "大丈夫です。小さな弟さん・妹さんを連れて見学や応援に来ていただいても構いません。ただし、体育館内ではボールが飛んでくることもありますので、安全には十分ご注意ください。",
      status: "PUBLISHED" as const,
      sortOrder: 3,
    },
    {
      id: "sample-faq-parent-004",
      category: "PARENT" as const,
      question:
        "練習中や試合中にケガをした場合、どのような補償がありますか？",
      answer:
        "入会時にスポーツ安全保険へ加入します。練習中や試合中のケガについては、加入している保険の範囲内で補償されます。",
      status: "PUBLISHED" as const,
      sortOrder: 4,
    },

    // 費用・月謝について
    {
      id: "sample-faq-fee-001",
      category: "FEE" as const,
      question: "月謝以外に年間どれくらいの費用がかかりますか？",
      answer:
        "月謝以外に、入会時の保険料等を含む入会費や、大会参加費、遠征費などが必要になる場合があります。金額は年度や活動内容によって変わるため、必要な費用が発生する際は事前にお知らせします。",
      status: "PUBLISHED" as const,
      sortOrder: 1,
    },
    {
      id: "sample-faq-fee-002",
      category: "FEE" as const,
      question: "体験期間はありますか？",
      answer:
        "はい、常識の範囲内で体験期間を設けております。まずは、体験・見学申込フォームより申込いただき、練習の雰囲気を見たり、実際に体験したりしてから入会をご検討ください。",
      status: "PUBLISHED" as const,
      sortOrder: 2,
    },
    {
      id: "sample-faq-fee-003",
      category: "FEE" as const,
      question: "入会は月途中からでも可能ですか？",
      answer:
        "可能です。月途中からの入会については、参加開始時期を確認したうえでご案内します。入会をご希望の際にご相談ください。",
      status: "PUBLISHED" as const,
      sortOrder: 3,
    },

    // 入会について
    {
      id: "sample-faq-join-001",
      category: "JOIN" as const,
      question: "入会したい場合の手続きを教えてください。",
      answer:
        "入会をご希望の場合は、まず体験・見学にご参加いただき、その後、入会届をご提出ください。入会に必要な書類については、当HPの「入会のご案内」でご確認いただけます。さらに、体験・見学時または入会時に再度ご案内しますので、ご安心ください。",
      status: "PUBLISHED" as const,
      sortOrder: 1,
    },
    {
      id: "sample-faq-join-002",
      category: "JOIN" as const,
      question: "入会したら揃えるものはありますか？",
      answer:
        "体育館シューズ、飲み物、運動しやすい服装、タオルをご準備ください。必要に応じて、チーム用品や試合で使用するものをご案内する場合があります。最初からすべてを揃える必要はありませんので、入会時に確認しながら準備していただければ大丈夫です。",
      status: "PUBLISHED" as const,
      sortOrder: 2,
    },
  ];

  for (const faq of faqSamples) {
    await prisma.faq.upsert({
      where: {
        id: faq.id,
      },
      update: {
        category: faq.category,
        question: faq.question,
        answer: faq.answer,
        status: faq.status,
        sortOrder: faq.sortOrder,
      },
      create: faq,
    });
  }

  // PageContent初期データ投入
  // PAGE_CONTENT_DEFINITIONSに定義されている全ページ・全ブロックを作成する
  // 既に存在するデータは上書きしない
  for (const [pageKey, page] of Object.entries(PAGE_CONTENT_DEFINITIONS) as [
    PageContentPageKey,
    (typeof PAGE_CONTENT_DEFINITIONS)[PageContentPageKey],
  ][]) {
    for (const blockKey of Object.keys(page.blocks)) {
      const fallbackContent =
        PAGE_CONTENT_FALLBACKS[pageKey]?.[
          blockKey as keyof (typeof PAGE_CONTENT_FALLBACKS)[typeof pageKey]
        ] ?? "";

      await prisma.pageContent.upsert({
        where: {
          pageKey_blockKey: {
            pageKey,
            blockKey,
          },
        },
        update: {},
        create: {
          pageKey,
          blockKey,
          content: fallbackContent,
        },
      });
    }
  }

    // StaffPageSetting初期データ投入
  await prisma.staffPageSetting.upsert({
    where: {
      id: "staff-page-setting",
    },
    update: {},
    create: {
      id: "staff-page-setting",
      topSummaryTitle: "スタッフ紹介",
      topSummaryBody:
        "子どもたち一人ひとりに寄り添い、バスケットボールを通して心と技術の成長を支えるスタッフを紹介します。",
      leadBody:
        "私たちは、ARAO U-12 BASKETBALL CLUBのスタッフです。\n子どもたち一人ひとりの成長に寄り添いながら、バスケットボールの楽しさ、努力することの大切さ、仲間と挑戦する喜びを伝えていきます。",
    },
  });

    // Staff初期データ投入
  const staffSamples = [
    {
      id: "sample-staff-director-001",
      role: "総監督",
      name: "田中 太郎",
      profile:
        "田中太郎（たなか たろう）\n1965年12月27日生まれ\n熊本県荒尾市出身",
      license:
        "JBA公認コーチライセンス\nスポーツ少年団認定員",
      achievement:
        "2024年：全国大会出場\n2025年：九州大会出場\n2026年：熊本県大会上位進出",
      imageUrl: null,
      imagePath: null,
      imageAlt: "総監督 田中太郎",
      sortOrder: 1,
      status: "PUBLISHED" as const,
    },
    {
      id: "sample-staff-coach-001",
      role: "コーチ",
      name: "佐藤 一郎",
      profile:
        "佐藤一郎（さとう いちろう）\n1989年2月2日生まれ\n熊本県荒尾市出身",
      license:
        "JBA公認コーチライセンス",
      achievement: null,
      imageUrl: null,
      imagePath: null,
      imageAlt: "コーチ 佐藤一郎",
      sortOrder: 2,
      status: "PUBLISHED" as const,
    },
    {
      id: "sample-staff-coach-002",
      role: "コーチ",
      name: "山田 健太",
      profile:
        "山田健太（やまだ けんた）\n1976年1月2日生まれ\n熊本県玉名市出身",
      license:
        "JBA公認コーチライセンス",
      achievement: null,
      imageUrl: null,
      imagePath: null,
      imageAlt: "コーチ 山田健太",
      sortOrder: 3,
      status: "PUBLISHED" as const,
    },
  ];

  for (const staff of staffSamples) {
    await prisma.staff.upsert({
      where: {
        id: staff.id,
      },
      update: {},
      create: staff,
    });
  }



  console.log(`Seed completed.`);
  console.log(`FAQ: ${faqSamples.length}件`);
  console.log(`PageContent: 初期データ投入完了`);
  console.log(`StaffPageSetting: 初期データ投入完了`);
  console.log(`Staff: ${staffSamples.length}件`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });