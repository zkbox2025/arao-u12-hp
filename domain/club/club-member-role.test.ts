// domain/club/club-member-role.test.ts
//テストコマンド「npm test -- club-member-role.test.ts」

import { describe, expect, it } from "vitest";

import {
  isClubAdminRole,
} from "./club-member-role";

describe("isClubAdminRole", () => {
  it.each([
    ["OWNER", true],
    ["COACH", true],
    ["OFFICER", true],
    ["MEMBER", false],
  ] as const)(
    "%sの管理権限は%s",
    (role, expected) => {
      expect(isClubAdminRole(role)).toBe(expected);
    },
  );
});