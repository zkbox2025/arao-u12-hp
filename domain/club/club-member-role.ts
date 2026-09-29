// domain/club/club-member-role.ts
// クラブのメンバーシップの役割（OWNER / COACH / OFFICER / MEMBER）に関するユーティリティ

import type { ClubMemberRole } from "@/types/prisma";

const CLUB_ADMIN_ROLES = new Set<ClubMemberRole>([
  "OWNER",
  "COACH",
  "OFFICER",
]);


//管理者(OWNER / COACH / OFFICER)かどうか判定する関数
export function isClubAdminRole(
  role: ClubMemberRole,
): boolean {
  return CLUB_ADMIN_ROLES.has(role);
}

export const CLUB_MEMBER_ROLE_LABELS = {
  OWNER: "代表者",
  COACH: "指導者",
  OFFICER: "役員・運営担当",
  MEMBER: "会員",
} as const satisfies Record<
  ClubMemberRole,
  string
>;


export const TARGET_ROLE_OPTIONS = [
  {
    value: "COACH",
    label:
      CLUB_MEMBER_ROLE_LABELS.COACH,
  },
  {
    value: "OFFICER",
    label:
      CLUB_MEMBER_ROLE_LABELS.OFFICER,
  },
  {
    value: "MEMBER",
    label:
      CLUB_MEMBER_ROLE_LABELS.MEMBER,
  },
] as const satisfies ReadonlyArray<{
  value: Exclude<
    ClubMemberRole,
    "OWNER"
  >;
  label: string;
}>;

// 引数に "OWNER" を渡すと、対応する "代表者" が返ってくる関数
export function getClubMemberRoleLabel(
  role: ClubMemberRole,
): string {
  return CLUB_MEMBER_ROLE_LABELS[
    role
  ];
}