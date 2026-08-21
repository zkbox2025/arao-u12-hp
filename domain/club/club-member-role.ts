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