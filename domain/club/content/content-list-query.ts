//domain/club/content/content-list-query.ts
//イベントとおしらせ共通のステータスの正規化関数とステータス別の数

import type {
  ContentStatus,//下書きか公開か
} from "@/types/prisma";

export type ContentAdminStatus =
  | "ALL"
  | ContentStatus;

export type ContentAdminCounts =
  Record<ContentAdminStatus, number>;


  //入力値をステータスの型に変換する正規化関数
export function parseContentAdminStatus(
  value:
    | string
    | string[]
    | undefined,
): ContentAdminStatus {
  if (
    value === "DRAFT" ||
    value === "PUBLISHED"
  ) {
    return value;
  }

  return "ALL";
}