//domain/club/club-login-destination.test.ts
//クラブログインの際の分岐関数のテスト
//複数のクラブ（アプリ可）所属及びアプリ可のクラブがない場合はクラブ選択画面へ遷移。
//一件のクラブ（アプリ可）所属の場合は、トップページにログイン


import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getClubLoginDestination,
  type ClubLoginMembership,
} from "@/domain/club/club-login-destination";

function createMembership(input: {
  suffix: string;
  planType: ClubLoginMembership["club"]["planType"];
}): ClubLoginMembership {
  return {
    membershipId:
      `membership-${input.suffix}`,
    role: "OWNER",
    club: {
      id: `club-${input.suffix}`,
      name: `テストクラブ${input.suffix}`,
      slug: `test-club-${input.suffix}`,
      planType: input.planType,
    },
  };
}

describe(
  "getClubLoginDestination",
  () => {
    it("利用可能なクラブが0件なら選択画面", () => {
      expect(
        getClubLoginDestination([]),
      ).toBe("/club/select");
    });

    it("STANDARDが1件ならそのクラブへ移動", () => {
      const memberships = [
        createMembership({
          suffix: "standard-1",
          planType: "STANDARD",
        }),
      ];

      expect(
        getClubLoginDestination(
          memberships,
        ),
      ).toBe(
        "/club/test-club-standard-1",
      );
    });

    it("STANDARDが複数件なら選択画面", () => {
      const memberships = [
        createMembership({
          suffix: "standard-1",
          planType: "STANDARD",
        }),
        createMembership({
          suffix: "standard-2",
          planType: "STANDARD",
        }),
      ];

      expect(
        getClubLoginDestination(
          memberships,
        ),
      ).toBe("/club/select");
    });

    it("STARTERはアプリ利用件数に含めない", () => {
      const memberships = [
        createMembership({
          suffix: "starter-1",
          planType: "STARTER",
        }),
      ];

      expect(
        getClubLoginDestination(
          memberships,
        ),
      ).toBe("/club/select");
    });

    it("PROも現時点では含めない", () => {
      const memberships = [
        createMembership({
          suffix: "pro-1",
          planType: "PRO",
        }),
      ];

      expect(
        getClubLoginDestination(
          memberships,
        ),
      ).toBe("/club/select");
    });

    it("STANDARDが1件ならSTARTERとPROがあってもSTANDARDへ移動", () => {
      const memberships = [
        createMembership({
          suffix: "starter-1",
          planType: "STARTER",
        }),
        createMembership({
          suffix: "standard-1",
          planType: "STANDARD",
        }),
        createMembership({
          suffix: "pro-1",
          planType: "PRO",
        }),
      ];

      expect(
        getClubLoginDestination(
          memberships,
        ),
      ).toBe(
        "/club/test-club-standard-1",
      );
    });
  },
);