//prisma/seed.ts
//データベースにテスト用データを自動で投入する（シード注入する）ためのプログラムファイル
//PUBLISHED（公開済み）２件とDRAFT（下書き）１件の合計３件の練習スケ変更データを投入する
//FAQの公開済み7件・下書き1件の合計8件を投入する
//PageContent初期データ投入

//ローカルDBに流し込む際のコマンド：npm run db:seed:local

import "dotenv/config";
import { prisma } from "@/src/infrastructure/prisma/client";
import { PAGE_CONTENT_DEFINITIONS } from "@/constants/page-content";


async function main() {
  await prisma.notice.upsert({
    where: {
      id: "sample-published-notice-001",
    },
    update: {
      title: "【重要】6月8日(土)の練習場所変更について",
      content: `6月8日(土)の練習場所が変更になります。

通常：万田小学校体育館
変更後：荒尾市民体育館

時間は通常通り、9:00〜12:00です。

お間違えのないようお願いいたします。

荒尾市民体育館：
https://maps.google.com/`,
      status: "PUBLISHED",
      eventDate: new Date("2026-06-08T00:00:00"),
    },
    create: {
      id: "sample-published-notice-001",
      title: "【重要】6月8日(土)の練習場所変更について",
      content: `6月8日(土)の練習場所が変更になります。

通常：万田小学校体育館
変更後：荒尾市民体育館

時間は通常通り、9:00〜12:00です。

お間違えのないようお願いいたします。

荒尾市民体育館：
https://maps.google.com/`,
      status: "PUBLISHED",
      eventDate: new Date("2026-06-08T00:00:00"),
    },
  });

  await prisma.notice.upsert({
    where: {
      id: "sample-published-notice-002",
    },
    update: {
      title: "6月12日(水)の練習時間変更について",
      content: `6月12日(水)の練習時間が変更になります。

変更前：17:30〜19:30
変更後：18:00〜20:00

場所は万田小学校体育館です。

よろしくお願いいたします。`,
      status: "PUBLISHED",
      eventDate: new Date("2026-06-12T00:00:00"),
    },
    create: {
      id: "sample-published-notice-002",
      title: "6月12日(水)の練習時間変更について",
      content: `6月12日(水)の練習時間が変更になります。

変更前：17:30〜19:30
変更後：18:00〜20:00

場所は万田小学校体育館です。

よろしくお願いいたします。`,
      status: "PUBLISHED",
      eventDate: new Date("2026-06-12T00:00:00"),
    },
  });

  await prisma.notice.upsert({
    where: {
      id: "sample-draft-notice-001",
    },
    update: {
      title: "【下書き】このお知らせは公開ページには表示されません",
      content: "status が DRAFT のため、/notice には表示されない確認用データです。",
      status: "DRAFT",
      eventDate: null,
    },
    create: {
      id: "sample-draft-notice-001",
      title: "【下書き】このお知らせは公開ページには表示されません",
      content: "status が DRAFT のため、/notice には表示されない確認用データです。",
      status: "DRAFT",
      eventDate: null,
    },
  });


const faqSamples = [
  {
    id: "sample-faq-target-001",
    category: "TARGET" as const,
    question: "未経験でも大丈夫ですか？",
    answer:
      "はい、未経験のお子様も大歓迎です。基礎から丁寧に指導しますので、安心してご参加ください。",
    status: "PUBLISHED" as const,
    sortOrder: 1,
  },
  {
    id: "sample-faq-target-002",
    category: "TARGET" as const,
    question: "幼児でも参加できますか？",
    answer:
      "はい、幼児のお子様も参加できます。まずは見学や体験から、無理のない範囲でご参加ください。",
    status: "PUBLISHED" as const,
    sortOrder: 2,
  },
  {
    id: "sample-faq-practice-001",
    category: "PRACTICE" as const,
    question: "他の習い事と両立できますか？",
    answer:
      "はい、可能です。ご家庭の予定や体調に合わせながら、無理なく続けられるようご相談ください。",
    status: "PUBLISHED" as const,
    sortOrder: 1,
  },
  {
    id: "sample-faq-activity-001",
    category: "ACTIVITY" as const,
    question: "大会には出場しますか？",
    answer:
      "小学生男子は練習試合や大会出場を予定しています。詳しい活動内容は活動概要ページをご確認ください。",
    status: "PUBLISHED" as const,
    sortOrder: 1,
  },
  {
    id: "sample-faq-parent-001",
    category: "PARENT" as const,
    question: "保護者の当番制はありますか？",
    answer:
      "現時点では、保護者の負担が大きくなりすぎない運営を目指しています。必要な協力事項がある場合は事前にお知らせします。",
    status: "PUBLISHED" as const,
    sortOrder: 1,
  },
  {
    id: "sample-faq-fee-001",
    category: "FEE" as const,
    question: "月謝はいくらですか？",
    answer:
      "学年や参加区分によって異なります。詳しくは活動概要ページの月謝欄をご確認ください。",
    status: "PUBLISHED" as const,
    sortOrder: 1,
  },
  {
    id: "sample-faq-join-001",
    category: "JOIN" as const,
    question: "入会したい場合はどうすればいいですか？",
    answer:
      "まずは体験または見学にお申し込みください。その後、入会をご希望の場合は入会届をご提出いただきます。",
    status: "PUBLISHED" as const,
    sortOrder: 1,
  },
  {
    id: "sample-faq-draft-001",
    category: "TARGET" as const,
    question: "【下書き】このFAQは公開されませんか？",
    answer: "status が DRAFT のため、公開ページには表示されません。",
    status: "DRAFT" as const,
    sortOrder: 99,
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
//PAGE_CONTENT_DEFINITIONSを全て取り出す
  for (const [pageKey, page] of Object.entries(PAGE_CONTENT_DEFINITIONS)) {
    for (const blockKey of Object.keys(page.blocks)) {

      //DBのページコンテントへアップサート（なければ新規作成、あれば何もしない）
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
          content: "",
        },
      });
    }
  }



  console.log("Seed completed.");//シードデータの投入が完了したことをコンソールに表示
}

main()
  .catch((error) => {//エラーが起きた時の処理は以下の通り
    console.error(error);//エラーログを表示して
    process.exit(1);//異常終了させる。
  })
  .finally(async () => {//成功でもエラーでも最終的に行う処理は以下の通り
    await prisma.$disconnect();//DBとの接続を完全に切断して終了する
  });



