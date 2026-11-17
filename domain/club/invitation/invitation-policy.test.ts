// domain/club/invitation/invitation-policy.test.ts
// 【追加：F05粒度1】招待状態・期限・処理権・再送間隔の境界テスト。

import { describe, expect, it } from "vitest";

import type {
  ClubInvitationStatus,
  ClubMembershipStatus,
} from "@/types/prisma";
import {
  CLUB_INVITATION_RESEND_COOLDOWN_MILLISECONDS,
  CLUB_INVITATION_TTL_MILLISECONDS,
  buildClubInvitationExpiresAt,
  evaluateClubInvitationCancellation,
  evaluateClubInvitationResend,
  isUsableClubInvitation,
  type ClubInvitationResendState,
} from "./invitation-policy";

const NOW = new Date("2026-10-09T00:00:00.000Z");
const INVITED = { status: "INVITED" } as const;
const NON_INVITED_STATUSES = [
  "ACTIVE", "SUSPENDED", "WITHDRAWN",
] as const satisfies readonly ClubMembershipStatus[];

function buildInvitation(
  overrides: Partial<ClubInvitationResendState> = {},
): ClubInvitationResendState {
  return {
    status: "SENT",
    acceptedAt: null,
    expiresAt: new Date("2026-10-10T00:00:00.000Z"),
    lastAttemptAt: new Date(NOW.getTime() - 120_000),
    leaseExpiresAt: null,
    ...overrides,
  };
}

describe("buildClubInvitationExpiresAt", () => {
  it("発行日時から24時間後を返し、入力Dateを変更しない", () => {
    const now = new Date("2026-10-31T15:30:00.000Z");
    const original = now.getTime();
    const expiresAt = buildClubInvitationExpiresAt(now);

    expect(expiresAt.toISOString()).toBe("2026-11-01T15:30:00.000Z");
    expect(expiresAt.getTime() - original).toBe(CLUB_INVITATION_TTL_MILLISECONDS);
    expect(CLUB_INVITATION_TTL_MILLISECONDS).toBe(86_400_000);
    expect(now.getTime()).toBe(original);
    expect(expiresAt).not.toBe(now);
  });

  it("不正な発行日時を拒否する", () => {
    expect(() => buildClubInvitationExpiresAt(new Date(Number.NaN))).toThrow(
      "招待の発行日時が正しくありません。",
    );
  });

  it("Dateの最大値を超える期限を返さない", () => {
    expect(() => buildClubInvitationExpiresAt(new Date(8_640_000_000_000_000)))
      .toThrow("招待の有効期限を作成できません。");
  });
});

describe("evaluateClubInvitationResend", () => {
  it.each([
    "PREPARING", "READY_TO_SEND", "SENT", "EMAIL_FAILED", "EXPIRED",
  ] as const satisfies readonly ClubInvitationStatus[])(
    "%sの未承諾INVITEDを再送できる",
    (status) => {
      expect(evaluateClubInvitationResend({
        invitation: buildInvitation({ status }),
        membership: INVITED,
        now: NOW,
      })).toEqual({ allowed: true });
    },
  );

  it("status更新前でも、期限到達済みINVITEDを再発行できる", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation({ expiresAt: new Date(NOW) }),
      membership: INVITED,
      now: NOW,
    })).toEqual({ allowed: true });
  });

  it("Membership未作成のPREPARINGを再試行できる", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation({ status: "PREPARING", lastAttemptAt: null }),
      membership: null,
      now: NOW,
    })).toEqual({ allowed: true });
  });

  it("PREPARING以外でMembershipがない場合は拒否する", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation(), membership: null, now: NOW,
    })).toEqual({ allowed: false, violation: "MEMBERSHIP_NOT_FOUND" });
  });

  it.each(NON_INVITED_STATUSES)("Membership=%sを拒否する", (status) => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation(), membership: { status }, now: NOW,
    })).toEqual({ allowed: false, violation: "MEMBERSHIP_NOT_INVITED" });
  });

  it("ACCEPTEDを拒否する", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation({ status: "ACCEPTED" }),
      membership: INVITED,
      now: NOW,
    })).toEqual({ allowed: false, violation: "INVITATION_ALREADY_ACCEPTED" });
  });

  it("statusに関係なくacceptedAt設定済みなら拒否する", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation({ acceptedAt: new Date(NOW) }),
      membership: INVITED,
      now: NOW,
    })).toEqual({ allowed: false, violation: "INVITATION_ALREADY_ACCEPTED" });
  });

  it("CANCELLEDを拒否する", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation({ status: "CANCELLED" }),
      membership: INVITED,
      now: NOW,
    })).toEqual({ allowed: false, violation: "INVITATION_CANCELLED" });
  });

  it("有効なleaseの処理中は再送できない", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation({
        leaseExpiresAt: new Date(NOW.getTime() + 1),
      }),
      membership: INVITED,
      now: NOW,
    })).toEqual({ allowed: false, violation: "INVITATION_PROCESSING" });
  });

  it.each([0, -1])("lease期限がnowから%dmsなら再取得可能", (offset) => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation({
        leaseExpiresAt: new Date(NOW.getTime() + offset),
      }),
      membership: INVITED,
      now: NOW,
    })).toEqual({ allowed: true });
  });

  it("再送間隔の1ms前は拒否する", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation({
        lastAttemptAt: new Date(
          NOW.getTime() - CLUB_INVITATION_RESEND_COOLDOWN_MILLISECONDS + 1,
        ),
      }),
      membership: INVITED,
      now: NOW,
    })).toEqual({ allowed: false, violation: "RESEND_COOLDOWN" });
  });

  it("再送間隔ちょうどの時刻から許可する", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation({
        lastAttemptAt: new Date(
          NOW.getTime() - CLUB_INVITATION_RESEND_COOLDOWN_MILLISECONDS,
        ),
      }),
      membership: INVITED,
      now: NOW,
    })).toEqual({ allowed: true });
  });

  it("最終試行が未来なら間隔チェックを迂回させない", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation({ lastAttemptAt: new Date(NOW.getTime() + 1) }),
      membership: INVITED,
      now: NOW,
    })).toEqual({ allowed: false, violation: "RESEND_COOLDOWN" });
  });

  it.each(["expiresAt", "lastAttemptAt", "leaseExpiresAt"] as const)(
    "不正な%sを許可しない",
    (field) => {
      expect(evaluateClubInvitationResend({
        invitation: buildInvitation({ [field]: new Date(Number.NaN) }),
        membership: INVITED,
        now: NOW,
      })).toEqual({ allowed: false, violation: "INVALID_INVITATION_STATE" });
    },
  );

  it("不正な現在日時を許可しない", () => {
    expect(evaluateClubInvitationResend({
      invitation: buildInvitation(), membership: INVITED, now: new Date(Number.NaN),
    })).toEqual({ allowed: false, violation: "INVALID_INVITATION_STATE" });
  });

  it("入力の日時・状態を変更しない", () => {
    const invitation = buildInvitation({ status: "EMAIL_FAILED" });
    const before = JSON.stringify(invitation);
    evaluateClubInvitationResend({ invitation, membership: INVITED, now: NOW });
    expect(JSON.stringify(invitation)).toBe(before);
  });
});

describe("evaluateClubInvitationCancellation", () => {
  it.each([
    "PREPARING", "READY_TO_SEND", "SENT", "EMAIL_FAILED", "EXPIRED",
  ] as const satisfies readonly ClubInvitationStatus[])(
    "%sの未承諾INVITEDを取消できる",
    (status) => {
      expect(evaluateClubInvitationCancellation({
        invitation: buildInvitation({ status }), membership: INVITED,
      })).toEqual({ allowed: true });
    },
  );

  it("Membership未作成のPREPARINGは通常の取消対象にしない", () => {
    expect(evaluateClubInvitationCancellation({
      invitation: buildInvitation({ status: "PREPARING" }), membership: null,
    })).toEqual({ allowed: false, violation: "MEMBERSHIP_NOT_FOUND" });
  });

  it.each(NON_INVITED_STATUSES)("Membership=%sを取消できない", (status) => {
    expect(evaluateClubInvitationCancellation({
      invitation: buildInvitation(), membership: { status },
    })).toEqual({ allowed: false, violation: "MEMBERSHIP_NOT_INVITED" });
  });

  it("ACCEPTEDを取消できない", () => {
    expect(evaluateClubInvitationCancellation({
      invitation: buildInvitation({ status: "ACCEPTED" }), membership: INVITED,
    })).toEqual({ allowed: false, violation: "INVITATION_ALREADY_ACCEPTED" });
  });

  it("acceptedAt設定済みならstatusがSENTでも取消できない", () => {
    expect(evaluateClubInvitationCancellation({
      invitation: buildInvitation({ acceptedAt: new Date(NOW) }), membership: INVITED,
    })).toEqual({ allowed: false, violation: "INVITATION_ALREADY_ACCEPTED" });
  });

  it("取消済みを再度取消できない", () => {
    expect(evaluateClubInvitationCancellation({
      invitation: buildInvitation({ status: "CANCELLED" }), membership: INVITED,
    })).toEqual({ allowed: false, violation: "INVITATION_CANCELLED" });
  });

  it("処理中でも未承諾INVITEDの取消を妨げない", () => {
    expect(evaluateClubInvitationCancellation({
      invitation: buildInvitation({
        status: "READY_TO_SEND",
        leaseExpiresAt: new Date(NOW.getTime() + 300_000),
      }),
      membership: INVITED,
    })).toEqual({ allowed: true });
  });
});

describe("isUsableClubInvitation", () => {
  it.each(["READY_TO_SEND", "SENT", "EMAIL_FAILED"] as const)(
    "%sでも有効な未承諾INVITEDなら利用可能",
    (status) => {
      expect(isUsableClubInvitation({
        invitation: buildInvitation({ status }), membership: INVITED, now: NOW,
      })).toBe(true);
    },
  );

  it.each(["PREPARING", "ACCEPTED", "CANCELLED", "EXPIRED"] as const)(
    "%sは期限内でも利用不可",
    (status) => {
      expect(isUsableClubInvitation({
        invitation: buildInvitation({ status }), membership: INVITED, now: NOW,
      })).toBe(false);
    },
  );

  it.each([0, -1])("有効期限がnowから%dmsなら利用不可", (offset) => {
    expect(isUsableClubInvitation({
      invitation: buildInvitation({ expiresAt: new Date(NOW.getTime() + offset) }),
      membership: INVITED,
      now: NOW,
    })).toBe(false);
  });

  it("期限の1ms前までは利用可能", () => {
    expect(isUsableClubInvitation({
      invitation: buildInvitation({ expiresAt: new Date(NOW.getTime() + 1) }),
      membership: INVITED,
      now: NOW,
    })).toBe(true);
  });

  it("acceptedAt設定済みなら利用不可", () => {
    expect(isUsableClubInvitation({
      invitation: buildInvitation({ acceptedAt: new Date(NOW) }),
      membership: INVITED,
      now: NOW,
    })).toBe(false);
  });

  it("Membershipがない招待は利用不可", () => {
    expect(isUsableClubInvitation({
      invitation: buildInvitation(), membership: null, now: NOW,
    })).toBe(false);
  });

  it.each(NON_INVITED_STATUSES)("Membership=%sなら利用不可", (status) => {
    expect(isUsableClubInvitation({
      invitation: buildInvitation(), membership: { status }, now: NOW,
    })).toBe(false);
  });

  it("不正な有効期限は利用不可", () => {
    expect(isUsableClubInvitation({
      invitation: buildInvitation({ expiresAt: new Date(Number.NaN) }),
      membership: INVITED,
      now: NOW,
    })).toBe(false);
  });

  it("不正な現在日時は利用不可", () => {
    expect(isUsableClubInvitation({
      invitation: buildInvitation(), membership: INVITED, now: new Date(Number.NaN),
    })).toBe(false);
  });
});
