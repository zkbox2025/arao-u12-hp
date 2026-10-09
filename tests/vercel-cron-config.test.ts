//tests/vercel-cron-config.test.ts


import {
  access,
  readFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

type VercelConfig = {
  crons?: Array<{
    path: string;
    schedule: string;
  }>;
};

describe(
  "vercel.json Cron設定",
  () => {
    it(
      "すべてのCronパスにRoute Handlerが存在する",
      async () => {
        const rawConfig =
          await readFile(
            join(
              process.cwd(),
              "vercel.json",
            ),
            "utf8",
          );

        const config =
          JSON.parse(
            rawConfig,
          ) as VercelConfig;

        expect(
          config.crons?.length,
        ).toBeGreaterThan(0);

        for (
          const cron of
          config.crons ?? []
        ) {
          const segments =
            cron.path
              .split("/")
              .filter(Boolean);

          const routePath =
            join(
              process.cwd(),
              "app",
              ...segments,
              "route.ts",
            );

          await expect(
            access(routePath),
          ).resolves.toBeUndefined();
        }
      },
    );
  },
);