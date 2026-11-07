//tests/cron-routes.test.ts


import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  GET as getStorageDeletions,
} from "@/app/api/cron/storage-deletions/route";

const mocks =
  vi.hoisted(
    () => ({
      sendClaimableLineDeliveries:
        vi.fn(
          async () =>
            undefined,
        ),

      deleteOldSecurityLogs:
        vi.fn(
          async () => ({
            formSubmissionLogs: {
              deletedCount: 0,
              cutoffDate:
                new Date(0),
              retentionDays: 30,
            },

            loginSubmissionLogs: {
              deletedCount: 0,
              cutoffDate:
                new Date(0),
              retentionDays: 30,
            },
          }),
        ),
    runClaimableStorageDeletionJobs:
        vi.fn(
          async () => ({
            claimedCount: 0,
            completedCount: 0,
            failedCount: 0,
          }),
        ),
    }),
  );

vi.mock(
  "@/src/application/club/storage/run-storage-deletion-worker",
  () => ({
    runClaimableStorageDeletionJobs:
      mocks
        .runClaimableStorageDeletionJobs,
  }),
);

vi.mock(
  "@/src/application/club/line/send-pending-line-deliveries",
  () => ({
    sendClaimableLineDeliveries:
      mocks
        .sendClaimableLineDeliveries,
  }),
);

vi.mock(
  "@/lib/security/submission-log-cleanup",
  () => ({
    deleteOldSecurityLogs:
      mocks
        .deleteOldSecurityLogs,
  }),
);

import {
  GET as getLineDeliveries,
} from "@/app/api/cron/club-line-deliveries/route";

import {
  GET as getDeleteOldSecurityLogs,
} from "@/app/api/cron/delete-old-security-logs/route";

const CRON_SECRET =
  "test-cron-secret-32-characters-minimum";

const routes = [
  [
    "LINE配信",
    getLineDeliveries,
  ],
  [
    "セキュリティログ削除",
    getDeleteOldSecurityLogs,
  ],
  [
    "Storage削除",
    getStorageDeletions,
  ],
] as const;

afterEach(
  () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  },
);

describe(
  "Cron Route認証",
  () => {
    it.each(
      routes,
    )(
      "%sは認証ヘッダーなしで401になる",
      async (
        _name,
        handler,
      ) => {
        vi.stubEnv(
          "CRON_SECRET",
          CRON_SECRET,
        );

        const response =
          await handler(
            new Request(
              "http://localhost/api/cron/test",
            ),
          );

        expect(
          response.status,
        ).toBe(401);
      },
    );

    it.each(
      routes,
    )(
      "%sは不正な秘密鍵で401になる",
      async (
        _name,
        handler,
      ) => {
        vi.stubEnv(
          "CRON_SECRET",
          CRON_SECRET,
        );

        const response =
          await handler(
            new Request(
              "http://localhost/api/cron/test",
              {
                headers: {
                  authorization:
                    "Bearer wrong-secret",
                },
              },
            ),
          );

        expect(
          response.status,
        ).toBe(401);
      },
    );

    it.each(
      routes,
    )(
      "%sはCRON_SECRET未設定で401になる",
      async (
        _name,
        handler,
      ) => {
        vi.stubEnv(
          "CRON_SECRET",
          "",
        );

        const response =
          await handler(
            new Request(
              "http://localhost/api/cron/test",
            ),
          );

        expect(
          response.status,
        ).toBe(401);
      },
    );

    it(
      "正しい秘密鍵なら処理を実行する",
      async () => {
        vi.stubEnv(
          "CRON_SECRET",
          CRON_SECRET,
        );

        const request =
          () =>
            new Request(
              "http://localhost/api/cron/test",
              {
                headers: {
                  authorization:
                    `Bearer ${CRON_SECRET}`,
                },
              },
            );

        const lineResponse =
          await getLineDeliveries(
            request(),
          );

        const cleanupResponse =
          await getDeleteOldSecurityLogs(
            request(),
          );

        expect(
          lineResponse.status,
        ).toBe(200);

        expect(
          cleanupResponse.status,
        ).toBe(200);

        expect(
          mocks
            .sendClaimableLineDeliveries,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks
            .deleteOldSecurityLogs,
        ).toHaveBeenCalledTimes(
          1,
        );
const storageResponse =
  await getStorageDeletions(
    request(),
  );

expect(
  storageResponse.status,
).toBe(200);

expect(
  mocks
    .runClaimableStorageDeletionJobs,
).toHaveBeenCalledTimes(1);

      },
    );
  },
);