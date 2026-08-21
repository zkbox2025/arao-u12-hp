//docs/data-model2.md
//今後実装予定のものをメモする

⭐️hasWebsiteAdminAccess() をDB判定へ変更する
◯HPマルチテナント完了後、以下をシードで登録する
1.ARAO U-12のClub
2.現在のSupabase Auth管理者に対応するAppUser
3.HP管理権限を持つClubMembership
例）
const adminUserId = process.env.WEBSITE_ADMIN_SEED_USER_ID;
const adminEmail = process.env.WEBSITE_ADMIN_SEED_EMAIL;

if (!adminUserId || !adminEmail) {
  throw new Error(
    "HP管理者初期登録用の環境変数が設定されていません。"
  );
}

const club = await prisma.club.upsert({
  where: {
    slug: "arao-u12",
  },
  update: {
    name: "ARAO U-12 BASKETBALL CLUB",
  },
  create: {
    name: "ARAO U-12 BASKETBALL CLUB",
    slug: "arao-u12",
    planType: "STARTER",
    timezone: "Asia/Tokyo",
  },
});

const appUser = await prisma.appUser.upsert({
  where: {
    id: adminUserId,
  },
  update: {
    email: adminEmail.toLowerCase(),
  },
  create: {
    id: adminUserId,
    email: adminEmail.toLowerCase(),
  },
});

await prisma.clubMembership.upsert({
  where: {
    clubId_userId: {
      clubId: club.id,
      userId: appUser.id,
    },
  },
  update: {
    role: "OWNER",
    status: "ACTIVE",
    canManageWebsite: true,
  },
  create: {
    clubId: club.id,
    userId: appUser.id,
    role: "OWNER",
    status: "ACTIVE",
    canManageWebsite: true,
  },
});


◯DB判定関数へ変更の前の最終チェック
1.Club.slug = arao-u12 が1件ある
2.AppUser.id がSupabase Auth管理者UUIDと一致する
3.ClubMembership.userId がそのAppUserを指している
4.status = ACTIVE
5.canManageWebsite = true
6.role = OWNER
7.planType = STARTER

◯hasWebsiteAdminAccess() をDB判定へ変更する（cludid+アクティブ＋canManageWebsite=true。WEBSITE＿ADMIN_USER＿IDSは削除）
例）
// lib/auth/admin.ts

import "server-only";

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/src/infrastructure/prisma/client";
import { createClient } from "@/src/infrastructure/supabase/server";

const WEBSITE_CLUB_SLUG = "arao-u12";

export async function hasWebsiteAdminAccess(
  userId: string
): Promise<boolean> {
  const membership = await prisma.clubMembership.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      canManageWebsite: true,
      club: {
        is: {
          slug: WEBSITE_CLUB_SLUG,

          // PROは内容未確定なので許可しない
          planType: {
            in: ["STARTER", "STANDARD"],
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  return membership !== null;
}

export async function requireWebsiteAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/admin/login");
  }

  if (!(await hasWebsiteAdminAccess(user.id))) {
    notFound();
  }

  return user;
}

◯（重要！今スターターだから！）アプリを導入するタイミングでARAOU-12はplanType = STANDARDに変更

◯切り替え後の確認

次のパターンを確認します。

正しいHP管理者：入れる
canManageWebsite = false：入れない
MEMBERでも canManageWebsite = false：入れない
OWNERでも canManageWebsite = false：入れない
status = SUSPENDED：入れない
status = WITHDRAWN：入れない
planType = PRO：入れない
パスワード変更Actionを直接実行しても非管理者は拒否される

◯DB方式のデプロイが安定した後に、WEBSITE_ADMIN_USER_IDS をVercelから削除

以上！

ホームページマルチテナント化の際には、ClubEmailSetting、ClubLineSettingをDBに入れる

・月間の訪問者数を見れるようにする：グーグルアナリティクス用DBテーブルを作成し、レイアウトを実装。初期設定時にグーグルアナリティクスの登録を追加する。

・PDFの上限がHPのストレージは５mbでアプリイベントお知らせ（src/infrastructure/storage/pdf-file-validation.ts）は３mb。next.config.tsは４mb。ここは適切なのか調べて随時修正する。

・アプリ開発後は、Proxyへ移行する。現在中身は事前に揃えている。
アプリをブランチ上で完成させてPRマージした後に以下を実行しブランチにプッシュしてメインにマージする
「npx @next/codemod@canary middleware-to-proxy .」

・Resendは開発者のアカウントひとつにしてクラブの個別アカウントは作らない。故にマルチテナント化したらARAO U-12のアカウントは消して、開発者のアカウントにARAO U-12のアカウントを作成すること！