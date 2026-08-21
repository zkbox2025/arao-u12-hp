// domain/club/plan-features.ts
// クラブのプランに応じた機能の有効/無効を判定するユーティリティ

import type { PlanType } from "@/types/prisma";


export type ClubFeature = "WEBSITE" | "CLUB_APP";

export const PLAN_FEATURES = {
  STARTER: ["WEBSITE"],
  STANDARD: ["WEBSITE", "CLUB_APP"],
  PRO: [],
} as const satisfies Record<PlanType, readonly ClubFeature[]>;

// プランに応じて機能が有効かどうかを判定する
export function hasClubFeature(
  planType: PlanType,
  feature: ClubFeature,
): boolean {
  // as constによる過度な型の絞り込みを避ける
  const enabledFeatures: readonly ClubFeature[] =
    PLAN_FEATURES[planType];

  return enabledFeatures.includes(feature);
}

export class ClubFeatureUnavailableError extends Error {
  readonly name = "ClubFeatureUnavailableError";

  constructor(
    readonly planType: PlanType,
    readonly feature: ClubFeature,
  ) {
    super(
      `プラン${planType}では機能${feature}を利用できません。`,
    );
  }
}

type ClubPlanSource = {
  planType: PlanType;
};

//プランに応じて機能が有効かどうかを判定し、無効な場合はエラーを投げる
export function requireClubFeature(
  club: ClubPlanSource,
  feature: ClubFeature,
): void {
  if (!hasClubFeature(club.planType, feature)) {
    throw new ClubFeatureUnavailableError(
      club.planType,
      feature,
    );
  }
}

//選択可能なプラン（スターターとスタンダード）を定義する
export const SELECTABLE_PLAN_TYPES = [
  "STARTER",
  "STANDARD",
] as const satisfies readonly PlanType[];

export type SelectablePlanType =
  (typeof SELECTABLE_PLAN_TYPES)[number];

export function isSelectablePlanType(
  value: unknown,
): value is SelectablePlanType {
  return (
    typeof value === "string" &&
    (SELECTABLE_PLAN_TYPES as readonly string[]).includes(
      value,
    )
  );
}