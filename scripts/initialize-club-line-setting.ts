// scripts/initialize-club-line-setting.ts
// 既存クラブへLINE Messaging API資格情報を安全に初期登録・更新する。

import {
  randomUUID,
} from "node:crypto";

import {
  parseArgs,
} from "node:util";

import {
  prisma,
} from "../src/infrastructure/prisma/client";

import {
  encryptLineCredential,
} from "../src/infrastructure/security/line-credential-crypto";

const INITIALIZER_ENV_NAMES = {
  lineChannelId:
    "CLUB_LINE_INIT_CHANNEL_ID",

  lineBotUserId:
    "CLUB_LINE_INIT_BOT_USER_ID",

  lineChannelAccessToken:
    "CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN",

  lineChannelSecret:
    "CLUB_LINE_INIT_CHANNEL_SECRET",
} as const;

type ExecutionMode =
  | "dry-run"//検証のみ（データが壊れたりしないよう安全な『テストモード』でLINE設定プログラムを実行する）
  | "apply";//DB反映

type InitializerOptions = {
  clubSlug: string;
  expectedClubId: string;
  mode: ExecutionMode;
};

type InitializerCredentials = {
  lineChannelId: string;
  lineBotUserId: string;
  lineChannelAccessToken: string;
  lineChannelSecret: string;
};

class SafeInitializerError extends Error {
  override readonly name =
    "SafeInitializerError";
}

function parseInitializerOptions(
  args: readonly string[],
): InitializerOptions {
  let values: {
    "club-slug"?: string;
    "club-id"?: string;
    "dry-run"?: boolean;
    apply?: boolean;
  };

  try {
    const parsed =
      parseArgs({
        args: [
          ...args,
        ],

        options: {
          "club-slug": {
            type: "string",
          },

          "club-id": {
            type: "string",
          },

          "dry-run": {
            type: "boolean",
          },

          apply: {
            type: "boolean",
          },
        },

        allowPositionals: false,
        strict: true,
      });

    values = parsed.values;
  } catch {
    throw new SafeInitializerError(
      "コマンド引数の形式が正しくありません。",
    );
  }

  const clubSlug =
    values["club-slug"]
      ?.trim();

  const expectedClubId =
    values["club-id"]
      ?.trim();

  const hasDryRun =
    values["dry-run"] === true;

  const hasApply =
    values.apply === true;

  if (
    !clubSlug ||
    !expectedClubId ||
    hasDryRun === hasApply
  ) {
    throw new SafeInitializerError(
      "--club-slug、--club-id、--dry-runまたは--applyを指定してください。",
    );
  }

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
      clubSlug,
    )
  ) {
    throw new SafeInitializerError(
      "clubSlugの形式が正しくありません。",
    );
  }

  return {
    clubSlug,
    expectedClubId,
    mode: hasApply
      ? "apply"
      : "dry-run",
  };
}

function readRequiredEnvironmentVariable(
  name: string,
): string {
  const value =
    process.env[name];

  if (
    !value ||
    value.trim().length === 0
  ) {
    throw new SafeInitializerError(
      `${name}が設定されていません。`,
    );
  }

  if (
    value !== value.trim() ||
    /[\r\n]/.test(value)
  ) {
    throw new SafeInitializerError(
      `${name}の形式が正しくありません。`,
    );
  }

  return value;
}

function assertSecretValue(
  value: string,
  name: string,
): void {
  if (
    value.length > 4_096 ||
    /\s/.test(value)
  ) {
    throw new SafeInitializerError(
      `${name}の形式が正しくありません。`,
    );
  }
}

function readInitializerCredentials():
  InitializerCredentials {
  const lineChannelId =
    readRequiredEnvironmentVariable(
      INITIALIZER_ENV_NAMES
        .lineChannelId,
    );

  const lineBotUserId =
    readRequiredEnvironmentVariable(
      INITIALIZER_ENV_NAMES
        .lineBotUserId,
    );

  const lineChannelAccessToken =
    readRequiredEnvironmentVariable(
      INITIALIZER_ENV_NAMES
        .lineChannelAccessToken,
    );

  const lineChannelSecret =
    readRequiredEnvironmentVariable(
      INITIALIZER_ENV_NAMES
        .lineChannelSecret,
    );

  if (
    lineChannelId.length > 64 ||
    !/^\d+$/.test(lineChannelId)
  ) {
    throw new SafeInitializerError(
      "LINE Channel IDの形式が正しくありません。",
    );
  }

  if (
    !/^U[0-9a-fA-F]{32}$/.test(
      lineBotUserId,
    )
  ) {
    throw new SafeInitializerError(
      "LINE Bot User IDの形式が正しくありません。",
    );
  }

  assertSecretValue(
    lineChannelAccessToken,
    "LINE Channel Access Token",
  );

  assertSecretValue(
    lineChannelSecret,
    "LINE Channel Secret",
  );

  return {
    lineChannelId,
    lineBotUserId,
    lineChannelAccessToken,
    lineChannelSecret,
  };
}

function readAppBaseUrl(): string {
  const rawValue =
    readRequiredEnvironmentVariable(
      "APP_BASE_URL",
    );

  let url: URL;

  try {
    url = new URL(rawValue);
  } catch {
    throw new SafeInitializerError(
      "APP_BASE_URLの形式が正しくありません。",
    );
  }

  if (
    ![
      "http:",
      "https:",
    ].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== "/" &&
      url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new SafeInitializerError(
      "APP_BASE_URLにはhttp(s)のoriginだけを指定してください。",
    );
  }

  return url.origin;
}

function encryptCredentials(
  clubId: string,
  credentials:
    InitializerCredentials,
) {
  try {
    return {
      lineChannelAccessTokenEncrypted:
        encryptLineCredential({
          clubId,
          credentialType:
            "CHANNEL_ACCESS_TOKEN",
          value:
            credentials
              .lineChannelAccessToken,
        }),

      lineChannelSecretEncrypted:
        encryptLineCredential({
          clubId,
          credentialType:
            "CHANNEL_SECRET",
          value:
            credentials
              .lineChannelSecret,
        }),
    };
  } catch {
    throw new SafeInitializerError(
      "LINE資格情報を暗号化できません。暗号鍵を確認してください。",
    );
  }
}

function buildWebhookUrl(
  appBaseUrl: string,
  webhookKey: string,
): string {
  return new URL(
    `/api/line/webhook/${encodeURIComponent(
      webhookKey,
    )}`,
    `${appBaseUrl}/`,
  ).toString();
}

function printResult(
  input: {
    clubName: string;
    clubSlug: string;
    result: string;
    webhookUrl?: string;
  },
): void {
  console.log(
    `クラブ名: ${input.clubName}`,
  );

  console.log(
    `clubSlug: ${input.clubSlug}`,
  );

  console.log(
    `結果: ${input.result}`,
  );

  if (input.webhookUrl) {
    console.log(
      `設定すべきWebhook URL: ${input.webhookUrl}`,
    );
  }
}

async function main(): Promise<void> {
  const options =
    parseInitializerOptions(
      process.argv.slice(2),
    );

  const credentials =
    readInitializerCredentials();

  const appBaseUrl =
    readAppBaseUrl();

  const club =
    await prisma.club.findUnique({
      where: {
        slug: options.clubSlug,
      },

      select: {
        id: true,
        name: true,
        slug: true,

        lineSetting: {
          select: {
            webhookKey: true,
          },
        },
      },
    });

  if (!club) {
    throw new SafeInitializerError(
      "指定したクラブが見つかりません。",
    );
  }

  if (
    club.id !==
    options.expectedClubId
  ) {
    throw new SafeInitializerError(
      "clubSlugと確認用clubIdが同じクラブを示していません。",
    );
  }

  const encryptedCredentials =
    encryptCredentials(
      club.id,
      credentials,
    );

  const existingSetting =
    club.lineSetting;

  if (
    options.mode === "dry-run"
  ) {
    printResult({
      clubName: club.name,
      clubSlug: club.slug,
      result: existingSetting
        ? "DRY-RUN（既存設定を更新予定・DB変更なし）"
        : "DRY-RUN（設定を新規作成予定・DB変更なし）",

      ...(existingSetting
        ? {
            webhookUrl:
              buildWebhookUrl(
                appBaseUrl,
                existingSetting
                  .webhookKey,
              ),
          }
        : {}),
    });

    return;
  }

  const webhookKey =
    existingSetting
      ?.webhookKey ??
    randomUUID();

  const setting =
    await prisma
      .clubLineSetting
      .upsert({
        where: {
          clubId: club.id,
        },

        create: {
          clubId: club.id,

          lineChannelId:
            credentials.lineChannelId,

          lineBotUserId:
            credentials.lineBotUserId,

          ...encryptedCredentials,

          webhookKey,
        },

        update: {
          lineChannelId:
            credentials.lineChannelId,

          lineBotUserId:
            credentials.lineBotUserId,

          ...encryptedCredentials,

          // 既存のWebhook URLを壊さないため、
          // updateではwebhookKeyを変更しない。
        },

        select: {
          webhookKey: true,
        },
      });

  printResult({
    clubName: club.name,
    clubSlug: club.slug,
    result: existingSetting
      ? "更新しました。"
      : "作成しました。",
    webhookUrl:
      buildWebhookUrl(
        appBaseUrl,
        setting.webhookKey,
      ),
  });
}

main()
  .catch((error: unknown) => {
    if (
      error instanceof
      SafeInitializerError
    ) {
      console.error(
        `エラー: ${error.message}`,
      );
    } else {
      /*
       * Prismaの生エラーには接続先や入力値が含まれる可能性がある。
       * 資格情報を含むerrorオブジェクトは出力しない。
       */
      console.error(
        "エラー: LINE設定の初期化に失敗しました。DB接続と入力値を確認してください。",
      );
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      process.exitCode = 1;
    }
  });
