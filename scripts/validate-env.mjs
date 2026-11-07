//scripts/validate-env.mjs

//◯ローカルでの開発を検証するコマンド「npm run verify:local」とターミナルでコマンドを打つと
//環境変数の設定ミスがないか をチェックする。

//なお、package.jsonに"verify": "npm run env:validate && npm run prisma:validate && npm run lint && npm run typecheck && npm run test && npm run build"
//と書いているため以下もあわせてチェックする

//データベースの設計に矛盾がないか 
//コードに壊れている部分（型エラーなど）がないか 
//自動テスト（Vitest）がsample.test.ts などのテストコードを読み込んですべてクリアしているか確認
//Vercelでビルドエラーが起きないか 

// scripts/validate-env.mjs
// 起動・ビルド前の環境変数検証

import {
  Buffer,
} from "node:buffer";

import pkg from "@next/env";

import {
  z,
} from "zod";

const {
  loadEnvConfig,
} = pkg;

loadEnvConfig(
  process.cwd(),
);

function emptyToUndefined(
  value,
) {
  if (
    typeof value === "string" &&
    value.trim() === ""
  ) {
    return undefined;
  }

  return value;
}

const optionalText =
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(1)
      .optional(),
  );

const optionalUrl =
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .url()
      .optional(),
  );

const optionalEmail =
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .email()
      .optional(),
  );

const optionalUuid =
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .uuid()
      .optional(),
  );

function isHttpOrigin(
  value,
) {
  try {
    const url =
      new URL(value);

    return (
      (
        url.protocol ===
          "http:" ||
        url.protocol ===
          "https:"
      ) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/"
    );
  } catch {
    return false;
  }
}

function isCanonicalEncryptionKey(
  value,
) {
  try {
    const key =
      Buffer.from(
        value,
        "base64",
      );

    return (
      key.length === 32 &&
      key.toString(
        "base64",
      ) === value
    );
  } catch {
    return false;
  }
}

const uuidSchema =
  z.string().uuid();

const websiteAdminUserIdsSchema =
  z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => {
        const ids =
          value
            .split(",")
            .map(
              (id) =>
                id.trim(),
            )
            .filter(Boolean);

        return (
          ids.length > 0 &&
          ids.every(
            (id) =>
              uuidSchema
                .safeParse(id)
                .success,
          ) &&
          new Set(ids).size ===
            ids.length
        );
      },
      {
        message:
          "カンマ区切りの重複しないUUIDを設定してください。",
      },
    );

const envSchema =
  z
    .object({
      NODE_ENV:
        z
          .enum([
            "development",
            "test",
            "production",
          ])
          .default(
            "development",
          ),

      // DB
      DATABASE_URL:
        z
          .string()
          .trim()
          .min(1),

      DIRECT_URL:
        optionalText,

      // Supabase
      NEXT_PUBLIC_SUPABASE_URL:
        z
          .string()
          .trim()
          .url(),

      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        z
          .string()
          .trim()
          .min(1),

      SUPABASE_SERVICE_ROLE_KEY:
        z
          .string()
          .trim()
          .min(1),

      // アプリURL
      APP_BASE_URL:
        z
          .string()
          .trim()
          .url()
          .refine(
            isHttpOrigin,
            {
              message:
                "httpまたはhttpsのオリジンだけを設定してください。",
            },
          ),

      // HP管理者認可
      WEBSITE_ADMIN_USER_IDS:
        websiteAdminUserIdsSchema,

      // セキュリティ
      FORM_LOG_HASH_SALT:
        z
          .string()
          .trim()
          .min(
            32,
            "32文字以上で設定してください。",
          ),

      LINE_CREDENTIAL_ENCRYPTION_KEY:
        z
          .string()
          .trim()
          .refine(
            isCanonicalEncryptionKey,
            {
              message:
                "32バイトのBase64文字列で設定してください。",
            },
          ),

      // 本番必須
      CRON_SECRET:
        z.preprocess(
          emptyToUndefined,
          z
            .string()
            .trim()
            .min(
              32,
              "32文字以上で設定してください。",
            )
            .optional(),
        ),

      RESEND_API_KEY:
        optionalText,

      MAIL_FROM_ADDRESS:
        optionalEmail,

      // 任意
      ADMIN_EMAIL:
        optionalEmail,

      LINE_CHANNEL_ACCESS_TOKEN:
        optionalText,

      LINE_ADMIN_GROUP_ID:
        optionalText,

      LINE_CHANNEL_SECRET:
        optionalText,

      NEXT_PUBLIC_LIFF_ID:
        optionalText,

      LINE_LIFF_URL:
        optionalUrl,

      NEXT_PUBLIC_LIFF_DEBUG:
        z.preprocess(
          emptyToUndefined,
          z
            .enum([
              "true",
              "false",
            ])
            .optional(),
        ),

      AXIOM_TOKEN:
        optionalText,

      AXIOM_DATASET:
        optionalText,

      // 開発専用
      SEED_DEV_CLUB_NAME:
        optionalText,

      SEED_DEV_CLUB_SLUG:
        optionalText,

      SEED_DEV_CLUB_PLAN:
        z.preprocess(
          emptyToUndefined,
          z
            .literal(
              "STANDARD",
            )
            .optional(),
        ),

      SEED_DEV_OWNER_AUTH_USER_ID:
        optionalUuid,

      SEED_DEV_OWNER_NAME:
        optionalText,

      SEED_DEV_OWNER_EMAIL:
        optionalEmail,

      WEBSITE_ADMIN_SEED_USER_ID:
        optionalUuid,

      WEBSITE_ADMIN_SEED_EMAIL:
        optionalEmail,
    })
    .superRefine(
      (
        env,
        context,
      ) => {
        function requireTogether(
          leftName,
          rightName,
        ) {
          const left =
            env[leftName];

          const right =
            env[rightName];

          if (
            Boolean(left) ===
            Boolean(right)
          ) {
            return;
          }

          context.addIssue({
            code: "custom",
            path: [
              left
                ? rightName
                : leftName,
            ],
            message:
              `${leftName}と${rightName}は両方設定してください。`,
          });
        }

        requireTogether(
          "LINE_CHANNEL_ACCESS_TOKEN",
          "LINE_ADMIN_GROUP_ID",
        );

        requireTogether(
          "NEXT_PUBLIC_LIFF_ID",
          "LINE_LIFF_URL",
        );

        requireTogether(
          "AXIOM_TOKEN",
          "AXIOM_DATASET",
        );

        requireTogether(
          "WEBSITE_ADMIN_SEED_USER_ID",
          "WEBSITE_ADMIN_SEED_EMAIL",
        );

        const seedKeys = [
          "SEED_DEV_CLUB_NAME",
          "SEED_DEV_CLUB_SLUG",
          "SEED_DEV_CLUB_PLAN",
          "SEED_DEV_OWNER_AUTH_USER_ID",
          "SEED_DEV_OWNER_NAME",
          "SEED_DEV_OWNER_EMAIL",
        ];

        const providedSeedKeys =
          seedKeys.filter(
            (key) =>
              Boolean(
                env[key],
              ),
          );

        if (
          providedSeedKeys.length >
            0 &&
          providedSeedKeys.length <
            seedKeys.length
        ) {
          for (
            const key of
            seedKeys
          ) {
            if (!env[key]) {
              context.addIssue({
                code: "custom",
                path: [key],
                message:
                  "ローカルシード変数はすべてまとめて設定してください。",
              });
            }
          }
        }

        if (
          env.NODE_ENV ===
          "production"
        ) {
          const productionRequired = [
            [
              "CRON_SECRET",
              env.CRON_SECRET,
            ],
            [
              "RESEND_API_KEY",
              env.RESEND_API_KEY,
            ],
            [
              "MAIL_FROM_ADDRESS",
              env.MAIL_FROM_ADDRESS,
            ],
          ];

          for (
            const [
              name,
              value,
            ] of
            productionRequired
          ) {
            if (!value) {
              context.addIssue({
                code: "custom",
                path: [name],
                message:
                  "本番環境では必須です。",
              });
            }
          }

          if (
            new URL(
              env.APP_BASE_URL,
            ).protocol !==
            "https:"
          ) {
            context.addIssue({
              code: "custom",
              path: [
                "APP_BASE_URL",
              ],
              message:
                "本番環境ではhttpsを使用してください。",
            });
          }

          if (
            env
              .NEXT_PUBLIC_LIFF_DEBUG ===
            "true"
          ) {
            context.addIssue({
              code: "custom",
              path: [
                "NEXT_PUBLIC_LIFF_DEBUG",
              ],
              message:
                "本番環境ではfalseにしてください。",
            });
          }

          const developmentOnlyKeys = [
            ...seedKeys,
            "WEBSITE_ADMIN_SEED_USER_ID",
            "WEBSITE_ADMIN_SEED_EMAIL",
          ];

          const developmentOnlyKey =
            developmentOnlyKeys.find(
              (key) =>
                Boolean(
                  env[key],
                ),
            );

          if (
            developmentOnlyKey
          ) {
            context.addIssue({
              code: "custom",
              path: [
                developmentOnlyKey,
              ],
              message:
                "本番環境には開発専用変数を設定しないでください。",
            });
          }
        }
      },
    );

const result =
  envSchema.safeParse(
    process.env,
  );

if (!result.success) {
  console.error(
    "環境変数に不足または不正な値があります。",
  );

  for (
    const issue of
    result.error.issues
  ) {
    console.error(
      `- ${issue.path.join(".")}: ${issue.message}`,
    );
  }

  process.exit(1);
}

console.log(
  `環境変数の検証に成功しました（${result.data.NODE_ENV}）。`,
);