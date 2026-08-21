//scripts/validate-env.mjs

//◯ローカルでの開発を検証するコマンド「npm run verify:local」とターミナルでコマンドを打つと
//環境変数の設定ミスがないか をチェックする。

//なお、package.jsonに"verify": "npm run env:validate && npm run prisma:validate && npm run lint && npm run typecheck && npm run test && npm run build"
//と書いているため以下もあわせてチェックする

//データベースの設計に矛盾がないか 
//コードに壊れている部分（型エラーなど）がないか 
//自動テスト（Vitest）がsample.test.ts などのテストコードを読み込んですべてクリアしているか確認
//Vercelでビルドエラーが起きないか 

import { z } from "zod";
import pkg from "@next/env"; // デフォルトインポートにする
const { loadEnvConfig } = pkg;

loadEnvConfig(process.cwd());

const envSchema = z
  .object({
    DATABASE_URL: z.string().trim().min(1),
    DIRECT_URL: z.string().trim().min(1).optional(),

    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),

    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1).optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
      .string()
      .trim()
      .min(1)
      .optional(),

    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),

    WEBSITE_ADMIN_USER_IDS: z.string().trim().min(1),
  })
  .refine(
    (env) =>
      Boolean(
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      ),
    {
      message:
        "NEXT_PUBLIC_SUPABASE_ANON_KEY または NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY が必要です",
      path: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    },
  );

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("環境変数に不足または不正な値があります。");

  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  }

  process.exit(1);
}

console.log("環境変数の検証に成功しました。");