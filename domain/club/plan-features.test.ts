// domain/club/plan-features.test.ts
// クラブのプランに応じた機能の有効/無効を判定するユーティリティのテストコード
//テストコマンド「npm test -- plan-features.test.ts」



import { describe, expect, it } from "vitest";

import {
  ClubFeatureUnavailableError,
  hasClubFeature,
  requireClubFeature,
  type ClubFeature,
} from "./plan-features";

import type { PlanType } from "@/types/prisma";


const featureCases = [
  ["STARTER", "WEBSITE", true],
  ["STARTER", "CLUB_APP", false],

  ["STANDARD", "WEBSITE", true],
  ["STANDARD", "CLUB_APP", true],

  ["PRO", "WEBSITE", false],
  ["PRO", "CLUB_APP", false],
] as const satisfies readonly (
  readonly [PlanType, ClubFeature, boolean]
)[];

describe("hasClubFeature", () => {
  it.each(featureCases)(
    "%sプランの%sは%sになる",
    (planType, feature, expected) => {
      expect(
        hasClubFeature(planType, feature),
      ).toBe(expected);
    },
  );
});

describe("requireClubFeature", () => {
  it("STANDARDではCLUB_APPを利用できる", () => {
    expect(() => {
      requireClubFeature(
        { planType: "STANDARD" },
        "CLUB_APP",
      );
    }).not.toThrow();
  });

  it("STARTERではCLUB_APPを利用できない", () => {
    expect(() => {
      requireClubFeature(
        { planType: "STARTER" },
        "CLUB_APP",
      );
    }).toThrow(ClubFeatureUnavailableError);
  });

  it("PROではWEBSITEも利用できない", () => {
    expect(() => {
      requireClubFeature(
        { planType: "PRO" },
        "WEBSITE",
      );
    }).toThrow(ClubFeatureUnavailableError);
  });
});