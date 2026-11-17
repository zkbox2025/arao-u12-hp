// tests/club-line-webhook-route.test.ts
// クラブ別LINE WebhookのHTTP境界・登録処理・秘密情報ログ防止

import {
  createHash,
  createHmac,
} from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      findClubLineSettingForWebhook:
        vi.fn(),
      consumeClubLineRegistrationTokenAndUpsertTarget:
        vi.fn(),
      decryptLineCredential:
        vi.fn(),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
      flushLogs:
        vi.fn(
          async () =>
            undefined,
        ),
    }),
  );

vi.mock(
  "server-only",
  () => ({}),
);

vi.mock(
  "@/src/infrastructure/prisma/repositories/club-line-setting-repository",
  () => ({
    findClubLineSettingForWebhook:
      mocks
        .findClubLineSettingForWebhook,
    consumeClubLineRegistrationTokenAndUpsertTarget:
      mocks
        .consumeClubLineRegistrationTokenAndUpsertTarget,
  }),
);

vi.mock(
  "@/src/infrastructure/security/line-credential-crypto",
  () => ({
    decryptLineCredential:
      mocks
        .decryptLineCredential,
  }),
);

vi.mock(
  "@/lib/axiom/server",
  () => ({
    logInfo: mocks.logInfo,
    logWarn: mocks.logWarn,
    logError:
      mocks.logError,
    flushLogs:
      mocks.flushLogs,
  }),
);

import {
  POST,
} from "@/app/api/line/webhook/[webhookKey]/route";

import {
  LINE_WEBHOOK_MAX_BODY_BYTES,
} from "@/src/infrastructure/line/line-webhook";

const WEBHOOK_KEY =
  "11111111-1111-4111-8111-111111111111";

const CLUB_ID =
  "22222222-2222-4222-8222-222222222222";

const LINE_SETTING_ID =
  "33333333-3333-4333-8333-333333333333";

const DESTINATION =
  `U${"a".repeat(32)}`;

const OTHER_DESTINATION =
  `U${"c".repeat(32)}`;

const LINE_GROUP_ID =
  `C${"b".repeat(32)}`;

const CHANNEL_SECRET =
  "test-channel-secret";

const ENCRYPTED_CHANNEL_SECRET =
  "encrypted-channel-secret";

const REGISTRATION_CODE =
  `CLUB-LINE-${"d".repeat(43)}`;

const setting = {
  id: LINE_SETTING_ID,
  clubId: CLUB_ID,
  lineBotUserId:
    DESTINATION,
  lineChannelSecretEncrypted:
    ENCRYPTED_CHANNEL_SECRET,
};

const registeredTarget = {
  id:
    "44444444-4444-4444-8444-444444444444",
  targetName: null,
  targetRoles: [],
  isEnabled: false,
  createdAt:
    new Date(
      "2026-10-04T00:00:00.000Z",
    ),
  updatedAt:
    new Date(
      "2026-10-04T00:00:00.000Z",
    ),
};

function createSignature(
  rawBody: string,
): string {
  return createHmac(
    "sha256",
    CHANNEL_SECRET,
  )
    .update(rawBody, "utf8")
    .digest("base64");
}

function buildRawBody(
  input?: {
    destination?: string;
    text?: string;
    emptyEvents?: boolean;
  },
): string {
  return JSON.stringify({
    destination:
      input?.destination ??
      DESTINATION,

    events:
      input?.emptyEvents
        ? []
        : [
            {
              type: "message",
              source: {
                type: "group",
                groupId:
                  LINE_GROUP_ID,
              },
              message: {
                type: "text",
                text:
                  input?.text ??
                  REGISTRATION_CODE,
              },
            },
          ],
  });
}

function buildRequest(
  rawBody: string,
  signature:
    string | null =
      createSignature(
        rawBody,
      ),
): Request {
  const headers =
    new Headers({
      "content-type":
        "application/json",
    });

  if (signature !== null) {
    headers.set(
      "x-line-signature",
      signature,
    );
  }

  return new Request(
    `http://localhost/api/line/webhook/${WEBHOOK_KEY}`,
    {
      method: "POST",
      headers,
      body: rawBody,
    },
  );
}

async function callWebhook(
  rawBody: string,
  options?: {
    webhookKey?: string;
    signature?:
      string | null;
  },
) {
  return POST(
    buildRequest(
      rawBody,
      options?.signature ===
        undefined
        ? createSignature(
            rawBody,
          )
        : options.signature,
    ),
    {
      params:
        Promise.resolve({
          webhookKey:
            options
              ?.webhookKey ??
            WEBHOOK_KEY,
        }),
    },
  );
}

beforeEach(
  () => {
    mocks
      .findClubLineSettingForWebhook
      .mockResolvedValue(
        setting,
      );

    mocks
      .decryptLineCredential
      .mockReturnValue(
        CHANNEL_SECRET,
      );

    mocks
      .consumeClubLineRegistrationTokenAndUpsertTarget
      .mockResolvedValue(
        registeredTarget,
      );
  },
);

afterEach(
  () => {
    vi.clearAllMocks();
  },
);

describe(
  "クラブ別LINE Webhook",
  () => {
    it(
      "未登録のwebhookKeyは404になる",
      async () => {
        mocks
          .findClubLineSettingForWebhook
          .mockResolvedValue(
            null,
          );

        const response =
          await callWebhook(
            buildRawBody(),
            {
              webhookKey:
                "not-registered",
            },
          );

        expect(
          response.status,
        ).toBe(404);

        expect(
          mocks
            .decryptLineCredential,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "設定取得の一時障害は503になる",
      async () => {
        mocks
          .findClubLineSettingForWebhook
          .mockRejectedValue(
            new Error(
              "database unavailable",
            ),
          );

        const response =
          await callWebhook(
            buildRawBody(),
          );

        expect(
          response.status,
        ).toBe(503);
      },
    );

    it(
      "設定行があってもSecretが未設定なら503になる",
      async () => {
        mocks
          .findClubLineSettingForWebhook
          .mockResolvedValue({
            ...setting,
            lineChannelSecretEncrypted:
              null,
          });

        const response =
          await callWebhook(
            buildRawBody(),
          );

        expect(
          response.status,
        ).toBe(503);

        expect(
          mocks
            .decryptLineCredential,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "Channel Secretを復号できない場合は503になる",
      async () => {
        mocks
          .decryptLineCredential
          .mockImplementation(
            () => {
              throw new Error(
                "decrypt failed",
              );
            },
          );

        const response =
          await callWebhook(
            buildRawBody(),
          );

        expect(
          response.status,
        ).toBe(503);
      },
    );

    it(
      "署名がなければ401になる",
      async () => {
        const response =
          await callWebhook(
            buildRawBody(),
            {
              signature: null,
            },
          );

        expect(
          response.status,
        ).toBe(401);

        expect(
          mocks
            .decryptLineCredential,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "署名が不正なら401になる",
      async () => {
        const response =
          await callWebhook(
            buildRawBody(),
            {
              signature:
                `${"A".repeat(43)}=`,
            },
          );

        expect(
          response.status,
        ).toBe(401);
      },
    );

    it(
      "署名済みでもJSONが不正なら400になる",
      async () => {
        const rawBody =
          "{invalid-json";

        const response =
          await callWebhook(
            rawBody,
          );

        expect(
          response.status,
        ).toBe(400);
      },
    );

    it(
      "destinationが別Botなら403になる",
      async () => {
        const response =
          await callWebhook(
            buildRawBody({
              destination:
                OTHER_DESTINATION,
            }),
          );

        expect(
          response.status,
        ).toBe(403);

        expect(
          mocks
            .consumeClubLineRegistrationTokenAndUpsertTarget,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "上限を超える本文は413になり復号しない",
      async () => {
        const rawBody =
          "a".repeat(
            LINE_WEBHOOK_MAX_BODY_BYTES +
              1,
          );

        const response =
          await callWebhook(
            rawBody,
            {
              signature:
                `${"A".repeat(43)}=`,
            },
          );

        expect(
          response.status,
        ).toBe(413);

        expect(
          mocks
            .decryptLineCredential,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "LINE疎通確認の空eventsは200になる",
      async () => {
        const response =
          await callWebhook(
            buildRawBody({
              emptyEvents: true,
            }),
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          await response.json(),
        ).toEqual({
          ok: true,
        });

        expect(
          mocks
            .consumeClubLineRegistrationTokenAndUpsertTarget,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "完全一致しない登録コードは200でDBを変更しない",
      async () => {
        const response =
          await callWebhook(
            buildRawBody({
              text:
                `登録コード: ${REGISTRATION_CODE}`,
            }),
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          mocks
            .consumeClubLineRegistrationTokenAndUpsertTarget,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "期限切れまたは使用済みコードは200で登録しない",
      async () => {
        mocks
          .consumeClubLineRegistrationTokenAndUpsertTarget
          .mockResolvedValue(
            null,
          );

        const response =
          await callWebhook(
            buildRawBody(),
          );

        expect(
          response.status,
        ).toBe(200);
      },
    );

    it(
      "有効なコードをhash化して同じクラブ設定のTargetへ登録する",
      async () => {
        const response =
          await callWebhook(
            buildRawBody(),
          );

        const expectedTokenHash =
          createHash("sha256")
            .update(
              REGISTRATION_CODE,
              "utf8",
            )
            .digest("hex");

        expect(
          response.status,
        ).toBe(200);

        expect(
          mocks
            .consumeClubLineRegistrationTokenAndUpsertTarget,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            clubId: CLUB_ID,
            lineSettingId:
              LINE_SETTING_ID,
            tokenHash:
              expectedTokenHash,
            lineGroupId:
              LINE_GROUP_ID,
            now:
              expect.any(Date),
          }),
        );
      },
    );

    it(
      "登録transactionの一時障害は503にして再送可能にする",
      async () => {
        mocks
          .consumeClubLineRegistrationTokenAndUpsertTarget
          .mockRejectedValue(
            new Error(
              "database unavailable",
            ),
          );

        const response =
          await callWebhook(
            buildRawBody(),
          );

        expect(
          response.status,
        ).toBe(503);
      },
    );

    it(
      "同じWebhookが再送されてもtoken消費済みなら200になる",
      async () => {
        mocks
          .consumeClubLineRegistrationTokenAndUpsertTarget
          .mockResolvedValueOnce(
            registeredTarget,
          )
          .mockResolvedValueOnce(
            null,
          );

        const rawBody =
          buildRawBody();

        const first =
          await callWebhook(
            rawBody,
          );

        const second =
          await callWebhook(
            rawBody,
          );

        expect(first.status).toBe(
          200,
        );
        expect(second.status).toBe(
          200,
        );

        expect(
          mocks
            .consumeClubLineRegistrationTokenAndUpsertTarget,
        ).toHaveBeenCalledTimes(
          2,
        );
      },
    );

    it(
      "秘密情報や完全な識別子をログへ出さない",
      async () => {
        const rawBody =
          buildRawBody();

        const signature =
          createSignature(
            rawBody,
          );

        const response =
          await callWebhook(
            rawBody,
            { signature },
          );

        expect(
          response.status,
        ).toBe(200);

        const serializedLogs =
          JSON.stringify([
            mocks.logInfo.mock.calls,
            mocks.logWarn.mock.calls,
            mocks.logError.mock.calls,
          ]);

        const tokenHash =
          createHash("sha256")
            .update(
              REGISTRATION_CODE,
              "utf8",
            )
            .digest("hex");

        for (
          const secretValue of [
            CHANNEL_SECRET,
            ENCRYPTED_CHANNEL_SECRET,
            signature,
            rawBody,
            REGISTRATION_CODE,
            tokenHash,
            LINE_GROUP_ID,
          ]
        ) {
          expect(
            serializedLogs,
          ).not.toContain(
            secretValue,
          );
        }
      },
    );
  },
);
