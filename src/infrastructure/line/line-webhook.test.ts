// src/infrastructure/line/line-webhook.test.ts

import {
  createHmac,
} from "node:crypto";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "server-only",
  () => ({}),
);

import {
  LINE_WEBHOOK_MAX_BODY_BYTES,
  parseLineWebhookPayload,
  verifyLineWebhookSignature,
} from "@/src/infrastructure/line/line-webhook";

const OFFICIAL_SAMPLE_RAW_BODY =
  '{"destination":"U8e742f61d673b39c7fff3cecb7536ef0","events":[]}';

const OFFICIAL_SAMPLE_CHANNEL_SECRET =
  "8c570fa6dd201bb328f1c1eac23a96d8";

const OFFICIAL_SAMPLE_SIGNATURE =
  "GhRKmvmHys4Pi8DxkF4+EayaH0OqtJtaZxgTD9fMDLs=";

const DESTINATION =
  `U${"a".repeat(32)}`;

const GROUP_ID =
  `C${"b".repeat(32)}`;

const CHANNEL_SECRET =
  "test-line-channel-secret";

function createSignature(
  rawBody: string,
  channelSecret:
    string = CHANNEL_SECRET,
): string {
  return createHmac(
    "sha256",
    channelSecret,
  )
    .update(
      rawBody,
      "utf8",
    )
    .digest("base64");
}

describe(
  "verifyLineWebhookSignature",
  () => {
    it(
      "LINE公式ドキュメントの署名例を検証できる",
      () => {
        expect(
          verifyLineWebhookSignature({
            rawBody:
              OFFICIAL_SAMPLE_RAW_BODY,
            signature:
              OFFICIAL_SAMPLE_SIGNATURE,
            channelSecret:
              OFFICIAL_SAMPLE_CHANNEL_SECRET,
          }),
        ).toBe(true);
      },
    );

    it(
      "受信後に本文の空白を変更すると署名が一致しない",
      () => {
        const changedBody =
          '{"destination": "U8e742f61d673b39c7fff3cecb7536ef0", "events": []}';

        expect(
          verifyLineWebhookSignature({
            rawBody:
              changedBody,
            signature:
              OFFICIAL_SAMPLE_SIGNATURE,
            channelSecret:
              OFFICIAL_SAMPLE_CHANNEL_SECRET,
          }),
        ).toBe(false);

        expect(
          verifyLineWebhookSignature({
            rawBody:
              changedBody,
            signature:
              createSignature(
                changedBody,
                OFFICIAL_SAMPLE_CHANNEL_SECRET,
              ),
            channelSecret:
              OFFICIAL_SAMPLE_CHANNEL_SECRET,
          }),
        ).toBe(true);
      },
    );

    it(
      "異なるChannel Secretを拒否する",
      () => {
        expect(
          verifyLineWebhookSignature({
            rawBody:
              OFFICIAL_SAMPLE_RAW_BODY,
            signature:
              OFFICIAL_SAMPLE_SIGNATURE,
            channelSecret:
              "wrong-channel-secret",
          }),
        ).toBe(false);
      },
    );

    it.each([
      "",
      "not-base64!",
      `${"A".repeat(43)}-`,
      `${"A".repeat(43)}_`,
      `${"A".repeat(43)}==`,
      `${OFFICIAL_SAMPLE_SIGNATURE}\n`,
      OFFICIAL_SAMPLE_SIGNATURE.slice(
        0,
        -1,
      ),
    ])(
      "不正なBase64署名を拒否する: %p",
      (signature) => {
        expect(
          verifyLineWebhookSignature({
            rawBody:
              OFFICIAL_SAMPLE_RAW_BODY,
            signature,
            channelSecret:
              OFFICIAL_SAMPLE_CHANNEL_SECRET,
          }),
        ).toBe(false);
      },
    );

    it(
      "空のChannel Secretを拒否する",
      () => {
        expect(
          verifyLineWebhookSignature({
            rawBody:
              OFFICIAL_SAMPLE_RAW_BODY,
            signature:
              OFFICIAL_SAMPLE_SIGNATURE,
            channelSecret: "",
          }),
        ).toBe(false);
      },
    );

    it(
      "上限を超える本文は正しい署名でも拒否する",
      () => {
        const oversizedBody =
          "a".repeat(
            LINE_WEBHOOK_MAX_BODY_BYTES +
              1,
          );

        expect(
          verifyLineWebhookSignature({
            rawBody:
              oversizedBody,
            signature:
              createSignature(
                oversizedBody,
              ),
            channelSecret:
              CHANNEL_SECRET,
          }),
        ).toBe(false);
      },
    );
  },
);

describe(
  "parseLineWebhookPayload",
  () => {
    it(
      "eventsが空の疎通確認payloadを正常に解析する",
      () => {
        expect(
          parseLineWebhookPayload(
            OFFICIAL_SAMPLE_RAW_BODY,
          ),
        ).toEqual({
          success: true,
          data: {
            destination:
              "U8e742f61d673b39c7fff3cecb7536ef0",
            eventCount: 0,
            groupTextMessages: [],
          },
        });
      },
    );

    it(
      "group由来のtext messageからgroupIdと本文を取得する",
      () => {
        const messageText =
          "  CLUB-LINE-code-with-spaces  \n";

        const rawBody =
          JSON.stringify({
            destination:
              DESTINATION,
            events: [
              {
                type: "message",
                source: {
                  type: "group",
                  groupId:
                    GROUP_ID,
                  userId:
                    `U${"c".repeat(32)}`,
                },
                message: {
                  id: "message-id",
                  type: "text",
                  text:
                    messageText,
                },
              },
            ],
          });

        expect(
          parseLineWebhookPayload(
            rawBody,
          ),
        ).toEqual({
          success: true,
          data: {
            destination:
              DESTINATION,
            eventCount: 1,
            groupTextMessages: [
              {
                groupId:
                  GROUP_ID,
                text:
                  messageText,
              },
            ],
          },
        });
      },
    );

    it(
      "groupのtext message以外は登録候補へ含めない",
      () => {
        const rawBody =
          JSON.stringify({
            destination:
              DESTINATION,
            events: [
              {
                type: "message",
                source: {
                  type: "group",
                  groupId:
                    GROUP_ID,
                },
                message: {
                  type: "text",
                  text:
                    "CLUB-LINE-valid",
                },
              },
              {
                type: "message",
                source: {
                  type: "user",
                  userId:
                    `U${"d".repeat(32)}`,
                },
                message: {
                  type: "text",
                  text:
                    "user-message",
                },
              },
              {
                type: "message",
                source: {
                  type: "room",
                  roomId:
                    `R${"e".repeat(32)}`,
                },
                message: {
                  type: "text",
                  text:
                    "room-message",
                },
              },
              {
                type: "message",
                source: {
                  type: "group",
                  groupId:
                    GROUP_ID,
                },
                message: {
                  type: "image",
                  id: "image-id",
                },
              },
              {
                type: "join",
                source: {
                  type: "group",
                  groupId:
                    GROUP_ID,
                },
              },
              {
                type: "message",
                source: {
                  type: "group",
                  groupId:
                    "invalid-group-id",
                },
                message: {
                  type: "text",
                  text:
                    "invalid-group",
                },
              },
            ],
          });

        expect(
          parseLineWebhookPayload(
            rawBody,
          ),
        ).toEqual({
          success: true,
          data: {
            destination:
              DESTINATION,
            eventCount: 6,
            groupTextMessages: [
              {
                groupId:
                  GROUP_ID,
                text:
                  "CLUB-LINE-valid",
              },
            ],
          },
        });
      },
    );

    it(
      "未知のイベントオブジェクトを安全に無視する",
      () => {
        const rawBody =
          JSON.stringify({
            destination:
              DESTINATION,
            events: [
              {
                type:
                  "future-event",
                futureProperty: {
                  value: true,
                },
              },
            ],
          });

        expect(
          parseLineWebhookPayload(
            rawBody,
          ),
        ).toEqual({
          success: true,
          data: {
            destination:
              DESTINATION,
            eventCount: 1,
            groupTextMessages: [],
          },
        });
      },
    );

    it(
      "壊れたJSONを拒否する",
      () => {
        expect(
          parseLineWebhookPayload(
            "{not-json}",
          ),
        ).toEqual({
          success: false,
          error: "INVALID_JSON",
        });
      },
    );

    it.each([
      "null",
      "[]",
      JSON.stringify({
        events: [],
      }),
      JSON.stringify({
        destination:
          "invalid-destination",
        events: [],
      }),
      JSON.stringify({
        destination:
          DESTINATION,
      }),
      JSON.stringify({
        destination:
          DESTINATION,
        events: {},
      }),
      JSON.stringify({
        destination:
          DESTINATION,
        events: [null],
      }),
    ])(
      "不正なpayload構造を拒否する: %s",
      (rawBody) => {
        expect(
          parseLineWebhookPayload(
            rawBody,
          ),
        ).toEqual({
          success: false,
          error:
            "INVALID_PAYLOAD",
        });
      },
    );

    it(
      "本文上限をUTF-8のbyte数で判定する",
      () => {
        const oversizedBody =
          JSON.stringify({
            destination:
              DESTINATION,
            events: [],
            padding:
              "あ".repeat(
                700_000,
              ),
          });

        expect(
          oversizedBody.length,
        ).toBeLessThan(
          LINE_WEBHOOK_MAX_BODY_BYTES,
        );

        expect(
          Buffer.byteLength(
            oversizedBody,
            "utf8",
          ),
        ).toBeGreaterThan(
          LINE_WEBHOOK_MAX_BODY_BYTES,
        );

        expect(
          parseLineWebhookPayload(
            oversizedBody,
          ),
        ).toEqual({
          success: false,
          error:
            "PAYLOAD_TOO_LARGE",
        });
      },
    );
  },
);
