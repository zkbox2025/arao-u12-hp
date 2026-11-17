// domain/club/line/line-registration-code.test.ts

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CLUB_LINE_REGISTRATION_CODE_PREFIX,
  CLUB_LINE_REGISTRATION_CODE_TTL_MILLISECONDS,
  buildClubLineRegistrationCode,
  buildClubLineRegistrationCodeExpiresAt,
  parseClubLineRegistrationCode,
} from "./line-registration-code";

const RAW_TOKEN =
  "a".repeat(43);

const REGISTRATION_CODE =
  `${CLUB_LINE_REGISTRATION_CODE_PREFIX}${RAW_TOKEN}`;

describe(
  "buildClubLineRegistrationCode",
  () => {
    it(
      "256bit Base64URLトークンへprefixを付ける",
      () => {
        expect(
          buildClubLineRegistrationCode(
            RAW_TOKEN,
          ),
        ).toBe(
          REGISTRATION_CODE,
        );
      },
    );

    it.each([
      "",
      "a".repeat(42),
      "a".repeat(44),
      `${"a".repeat(42)}+`,
      ` ${"a".repeat(42)}`,
    ])(
      "不正なトークンを拒否する: %s",
      (rawToken) => {
        expect(() =>
          buildClubLineRegistrationCode(
            rawToken,
          ),
        ).toThrow(
          "LINE登録コード用トークンの形式が正しくありません。",
        );
      },
    );
  },
);

describe(
  "parseClubLineRegistrationCode",
  () => {
    it(
      "完全一致する登録コードを返す",
      () => {
        expect(
          parseClubLineRegistrationCode(
            REGISTRATION_CODE,
          ),
        ).toBe(
          REGISTRATION_CODE,
        );
      },
    );

    it.each([
      undefined,
      null,
      123,
      "",
      RAW_TOKEN,
      ` ${REGISTRATION_CODE}`,
      `${REGISTRATION_CODE} `,
      `${REGISTRATION_CODE}\n`,
      `登録コード: ${REGISTRATION_CODE}`,
      `${REGISTRATION_CODE} を登録`,
      "CLUB-LINE-short",
    ])(
      "完全一致しない値を拒否する: %p",
      (value) => {
        expect(
          parseClubLineRegistrationCode(
            value,
          ),
        ).toBeNull();
      },
    );
  },
);

describe(
  "buildClubLineRegistrationCodeExpiresAt",
  () => {
    it(
      "発行日時の10分後を返す",
      () => {
        const now =
          new Date(
            "2026-09-30T00:00:00.000Z",
          );

        const expiresAt =
          buildClubLineRegistrationCodeExpiresAt(
            now,
          );

        expect(
          expiresAt.toISOString(),
        ).toBe(
          "2026-09-30T00:10:00.000Z",
        );

        expect(
          expiresAt.getTime() -
            now.getTime(),
        ).toBe(
          CLUB_LINE_REGISTRATION_CODE_TTL_MILLISECONDS,
        );

        expect(expiresAt).not.toBe(
          now,
        );
      },
    );

    it(
      "不正な日時を拒否する",
      () => {
        expect(() =>
          buildClubLineRegistrationCodeExpiresAt(
            new Date(
              Number.NaN,
            ),
          ),
        ).toThrow(
          "登録コードの発行日時が正しくありません。",
        );
      },
    );
  },
);
