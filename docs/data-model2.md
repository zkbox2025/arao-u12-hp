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

・マーブルジムのHPようにHPのトップに画面いっぱい（画面の下が少しはみ出るくらい）に写真を設けてやや少し引きになる
動作にする（写真は３〜４枚くらい）。それに加えて、トップ見出しはしたからスッと上がってくる感じ、トップ写真は左右からフェードインするような動きを加えること

・イベント作成時のトーストがないのでお知らせのように作成する

・requestReconfirmationからshouldMarkAsUnreadへ変更

・以下、イベントの新規作成・編集ページとそのアクション関数、そのフォームがないので作成する
app/(club-app)/club/[clubSlug]/admin/events/new/page.tsx
app/(club-app)/club/[clubSlug]/admin/events/new/actions.ts

app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/page.tsx
app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/actions.ts

app/(club-app)/club/[clubSlug]/admin/events/new/EventCreateForm.ts
app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/EventEditForm.ts

◯練習変更なら練習変更を押すとテンプレが本文に入力される仕様にする


◯Next.js 16.3以降ではretryへ変更する

16.3になった瞬間、必ず現在のコードが壊れるとは限りません。ただし、unstable_retryは試験的APIなので、16.3以降へ更新した際は正式版のretryへ変更するのが適切です。

Next.js公式ドキュメントでは、16.3.0からretryが正式化されています。

変更は名前の置き換えだけです。

現在の16.2.6：

type ClubNoticeErrorProps = {
  error: Error & {
    digest?: string;
  };

  reset: () => void;
  unstable_retry: () => void;
};

16.3以降：

type ClubNoticeErrorProps = {
  error: Error & {
    digest?: string;
  };

  reset: () => void;
  retry: () => void;
};

引数も変更します。

export default function ClubNoticeError({
  error,
  retry,
}: ClubNoticeErrorProps) {

再試行処理も変更します。

function handleRetry(): void {
  startRetryTransition(() => {
    retry();
  });
}

管理者用も同じ変更です。それ以外のコードは変更不要です。

◯未読お知らせ０件の場合は表示しないようにする

◯お知らせ・イベント新規作成ページのPDF添付欄：このPDFを削除するにチェックを入れて保存ボタンを押しても画面遷移しない（新たなPDFを追加しないと削除されない）。新しいPDFを追加ボタンが一つずつしか追加できない。新しいPDFを追加するボタンにカーソルを乗せるまたはクリックすると表示が変わるようにする（クリックされたことがわかりにくいため）

⭐️マルチテナント化した場合、本番のsupabase cronのSupabase Vaultに登録されてあるclub_app_production_base_urlの値が、現在、ARAO CLUBのドメイン（https://本番の独自ドメイン）
になってるから、新しく取得した本丸のドメイン（HP＆アプリの自社サービスのドメイン）に書き換えること
ちなみにローカルはhttp://192.168.210.198:3000


⭐️ラインのwebhookの窓口の変更について
LINE Developersの新しいWebhook URLは、/api/line/webhook/[webhookKey]になるので
以下のURLを設定する。
https://本番ドメイン/api/line/webhook/クラブ固有のwebhookKey


⭐️本番デプロイ時のwebhook関連の設定について
安全な本番切替順序
第1段階：旧・新Webhookを併存させてデプロイ

次の両方が存在する状態で本番へデプロイします。

旧：
/api/line/webhook

新：
/api/line/webhook/[webhookKey]

この時点では、旧LINE_CHANNEL_SECRETも残します。

第2段階：本番のクラブ別LINE設定を初期化

本番DBへ以下を登録します。

lineChannelId
lineBotUserId
lineChannelAccessTokenEncrypted
lineChannelSecretEncrypted
webhookKey

本番初期化時のLINE_CREDENTIAL_ENCRYPTION_KEYは、Vercel本番に設定したものと一致させます。

第3段階：LINE DevelopersのWebhook URLを変更

旧URLから、

https://本番ドメイン/api/line/webhook

新URLへ変更します。

https://本番ドメイン/api/line/webhook/<本番DBのwebhookKey>
第4段階：本番で新Webhookを確認

最低限、次の3点を確認します。

LINE Developersの「検証」が成功する
登録コードをグループへ投稿して通知先を登録できる
通知先を有効化し、イベント・お知らせの投稿でLINE通知が届く

Vercelログでは、新Webhookの検証時に次のような結果を確認します。

club_line_webhook_processed {
  outcome: 'VERIFICATION_SUCCEEDED',
  status: 200
}

ここまで成功すれば、新Webhookへ切り替わったと判断できます。

第5段階：粒度7をまとめて実行

本番確認後、次の3か所を同じコミットで削除します。

1. 旧Webhookファイル全体
git rm 'app/api/line/webhook/route.ts'
2. .env.exampleの旧変数
# 【削除】
# 既存の単一クラブ用Webhook（移行期間中のみ）
# クラブ運営アプリの新WebhookはDBの暗号化済みSecretを使用する
LINE_CHANNEL_SECRET=

以下はHP送信用なので残します。

LINE_CHANNEL_ACCESS_TOKEN=
LINE_ADMIN_GROUP_ID=
3. scripts/validate-env.mjs
// 【削除】
LINE_CHANNEL_SECRET:
  optionalText,

以下は残します。

LINE_CHANNEL_ACCESS_TOKEN:
  optionalText,

LINE_ADMIN_GROUP_ID:
  optionalText,
requireTogether(
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_ADMIN_GROUP_ID",
);
第6段階：粒度7を本番へデプロイ

検証します。

npm run verify:local

問題がなければ粒度7をコミットします。

git add -A

git diff --cached

git commit -m "chore: remove legacy line webhook"

その後、本番へデプロイします。

第7段階：Vercelの旧環境変数を削除

粒度7のデプロイ成功後に、Vercelから次だけを削除します。

LINE_CHANNEL_SECRET

以下は削除しません。

LINE_CHANNEL_ACCESS_TOKEN
LINE_ADMIN_GROUP_ID
LINE_CREDENTIAL_ENCRYPTION_KEY