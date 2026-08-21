// prisma/seed-app-local.ts
// ローカル環境にクラブアプリの初期データだけを投入する。
// 既存HP用のFAQ・PageContent・Staffは処理しない。
//npm run db:seed:app:localでアプリのローカルDBに反映（本番DB反映はまだ実装していない）
//ClubEmailSetting、ClubLineSettingはまだシードしていない。必要になったら追加する。

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { prisma } from "@/src/infrastructure/prisma/client";
import {
  normalizeEmail,
} from "@/domain/shared/email";


const seedEnvSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),

  SEED_DEV_CLUB_NAME: z.string().trim().min(1),
  SEED_DEV_CLUB_SLUG: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  SEED_DEV_CLUB_PLAN: z.literal("STANDARD"),

  SEED_DEV_OWNER_AUTH_USER_ID: z.string().uuid(),
  SEED_DEV_OWNER_NAME: z.string().trim().min(1),
  SEED_DEV_OWNER_EMAIL: z.string().email(),
});

function assertLocalUrl(rawUrl: string, variableName: string) {
  let hostname: string;

  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    throw new Error(`${variableName}が正しいURLではありません。`);
  }

  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      `${variableName}がローカル環境を指していません。シードを中止しました。`,
    );
  }
}

async function main() {
  const env = seedEnvSchema.parse(process.env);

  // 誤って本番DB・本番Supabaseへ開発用データを入れないための防止処理
  assertLocalUrl(env.DATABASE_URL, "DATABASE_URL");
  assertLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");

const ownerEmail = normalizeEmail(
  env.SEED_DEV_OWNER_EMAIL,
);
  const ownerName = env.SEED_DEV_OWNER_NAME.trim();

  const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  // AppUser.idに使用するローカルAuthユーザーが実在するか確認する。
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(
    env.SEED_DEV_OWNER_AUTH_USER_ID,
  );

  if (error || !data.user) {
    throw new Error(
      "SEED_DEV_OWNER_AUTH_USER_IDに対応するローカルAuthユーザーが存在しません。",
    );
  }

  const authEmail = data.user.email
  ? normalizeEmail(data.user.email)
  : undefined;

  if (authEmail !== ownerEmail) {
    throw new Error(
      `Authユーザーのメールアドレスが${ownerEmail}と一致しません。`,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // 同じメールが別のAuth IDで登録されていないか確認する。
    const existingUserByEmail = await tx.appUser.findUnique({
      where: {
        email: ownerEmail,
      },
    });

    if (
      existingUserByEmail &&
      existingUserByEmail.id !== env.SEED_DEV_OWNER_AUTH_USER_ID
    ) {
      throw new Error(
        "同じメールアドレスのAppUserが、別のAuthユーザーIDで存在します。",
      );
    }

    const existingUserById = await tx.appUser.findUnique({
      where: {
        id: env.SEED_DEV_OWNER_AUTH_USER_ID,
      },
    });

    if (
      existingUserById?.email &&
      normalizeEmail(
  existingUserById.email,
) !== ownerEmail
    ) {
      throw new Error(
        "指定されたAuthユーザーIDのAppUserに、別のメールアドレスが登録されています。",
      );
    }

    // 同じslugのClubがあれば再利用し、重複作成しない。
    const club = await tx.club.upsert({
      where: {
        slug: env.SEED_DEV_CLUB_SLUG,
      },
      update: {},
      create: {
        name: env.SEED_DEV_CLUB_NAME,
        slug: env.SEED_DEV_CLUB_SLUG,
        timezone: "Asia/Tokyo",
        planType: env.SEED_DEV_CLUB_PLAN,
      },
    });

    if (
      club.name !== env.SEED_DEV_CLUB_NAME ||
      club.timezone !== "Asia/Tokyo" ||
      club.planType !== "STANDARD"
    ) {
      throw new Error(
        "既存の開発用Clubが、今回のシード設定と一致しません。",
      );
    }

    // AppUser.idには、確認済みのSupabase Auth user.idを使用する。
    const appUser = await tx.appUser.upsert({
      where: {
        id: env.SEED_DEV_OWNER_AUTH_USER_ID,
      },
      update: {
        email: ownerEmail,
        name: ownerName,
      },
      create: {
        id: env.SEED_DEV_OWNER_AUTH_USER_ID,
        email: ownerEmail,
        name: ownerName,
      },
    });

    const existingMembership = await tx.clubMembership.findUnique({
      where: {
        clubId_userId: {
          clubId: club.id,
          userId: appUser.id,
        },
      },
    });

    if (
      existingMembership &&
      (existingMembership.role !== "OWNER" ||
        existingMembership.status !== "ACTIVE" ||
        existingMembership.canManageWebsite !== true)
    ) {
      throw new Error(
        "既存のClubMembershipがOWNER・ACTIVE・canManageWebsite=trueと一致しません。",
      );
    }

    const membership =
      existingMembership ??
      (await tx.clubMembership.create({
        data: {
          clubId: club.id,
          userId: appUser.id,
          role: "OWNER",
          status: "ACTIVE",
          canManageWebsite: true,
        },
      }));

       // ローカル開発者をプラットフォーム全体の管理者として登録する。
    // ClubMembershipとは別テーブルだが、同じSupabase Auth user.idを使用する。
    const platformAdmin = await tx.platformAdmin.upsert({
      where: {
        id: env.SEED_DEV_OWNER_AUTH_USER_ID,
      },
      update: {
        email: ownerEmail,
        name: ownerName,
        role: "DEVELOPER",
        isActive: true,
      },
      create: {
        id: env.SEED_DEV_OWNER_AUTH_USER_ID,
        email: ownerEmail,
        name: ownerName,
        role: "DEVELOPER",
        isActive: true,
      },
    });

    return {
      clubId: club.id,
      clubSlug: club.slug,
      userId: appUser.id,
      membershipId: membership.id,
      platformAdminId: platformAdmin.id,
      platformAdminRole: platformAdmin.role,
      planType: club.planType,
    };
  });

  console.log("ローカル開発用アプリデータのシードに成功しました。");
  console.log(result);

  
}

main()
  .catch((error) => {
    console.error("ローカル開発用アプリデータのシードに失敗しました。");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });