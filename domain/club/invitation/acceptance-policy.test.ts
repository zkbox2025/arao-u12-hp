// domain/club/invitation/acceptance-policy.test.ts
// 招待・本人・所属の照合と、本人以外への失効理由の非開示を確認する。

import {
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import {
  evaluateClubInvitationAcceptance,
  type ClubInvitationAcceptanceInput,
  type ClubInvitationAcceptanceView,
} from "./acceptance-policy";

const NOW = new Date("2026-10-15T00:00:00.000Z");

// 呼出し元が取得したDB情報と認証済み本人の組合せを作る。
function buildInput(
  overrides: Partial<ClubInvitationAcceptanceInput> = {},
): ClubInvitationAcceptanceInput {
  return {
    invitation: {
      clubId: "club-a",
      tokenHash: "a".repeat(64),
      authUserId: "user-a",
      email: "member@example.test",
      membershipId: "membership-a",
      status: "SENT",
      acceptedAt: null,
      expiresAt: new Date(NOW.getTime() + 1_000),
    },
    membership: {
      id: "membership-a",
      clubId: "club-a",
      userId: "user-a",
      status: "INVITED",
    },
    authenticatedUser: {
      id: "user-a",
      email: "member@example.test",
    },
    clubId: "club-a",
    tokenHash: "a".repeat(64),
    now: NOW,
    ...overrides,
  };
}

// Domain判定にはDB更新やsession検証の副作用を含めない。
describe("evaluateClubInvitationAcceptance", () => {
  // F05で利用可能な各状態を本人照合後も受理する。
  it.each([
    "READY_TO_SEND",
    "SENT",
    "EMAIL_FAILED",
  ] as const)("本人に紐付く%sの招待を許可する", (status) => {
    const input = buildInput();
    input.invitation!.status = status;

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: true,
    });
  });

  // 両方のメールを既存の正規化規則で照合する。
  it("Authと招待のemailを正規化して照合する", () => {
    const input = buildInput();
    input.invitation!.email = "  MEMBER@EXAMPLE.TEST ";
    input.authenticatedUser!.email = "ｍｅｍｂｅｒ＠ｅｘａｍｐｌｅ．ｔｅｓｔ";

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: true,
    });
  });

  // tokenを持つ別人には終端状態を開示しない。
  it.each([
    "SENT",
    "CANCELLED",
    "ACCEPTED",
    "EXPIRED",
  ] as const)("別Authユーザーに%sの詳細を返さない", (status) => {
    const input = buildInput();
    input.invitation!.status = status;
    input.authenticatedUser!.id = "other-user";

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "RECIPIENT_MISMATCH",
    });
  });

  // emailだけが一致してもAuth IDが対応しなければ拒否する。
  it("Auth IDが記録されていない招待を拒否する", () => {
    const input = buildInput();
    input.invitation!.authUserId = null;

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "RECIPIENT_MISMATCH",
    });
  });

  // session未確認の入力を本人扱いにしない。
  it("認証済み本人の入力がない場合は詳細を返さない", () => {
    expect(evaluateClubInvitationAcceptance(buildInput({
      authenticatedUser: null,
    }))).toEqual({
      allowed: false,
      violation: "RECIPIENT_MISMATCH",
    });
  });

  // 現在emailの欠損・変更を見逃さない。
  it.each([
    null,
    "",
    "   ",
    "other@example.test",
    "member+other@example.test",
  ])("現在のAuth emailが一致しなければ拒否する: %s", (email) => {
    const input = buildInput();
    input.authenticatedUser!.email = email;
    input.invitation!.status = "CANCELLED";

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "INVITATION_EMAIL_MISMATCH",
    });
  });

  // 両方空のemailが等しい場合も本人確認成功にしない。
  it("空の招待emailとAuth emailを拒否する", () => {
    const input = buildInput();
    input.invitation!.email = " ";
    input.authenticatedUser!.email = "";

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "INVITATION_EMAIL_MISMATCH",
    });
  });

  // queryに由来するクラブとhashが行の内容に対応する必要がある。
  it.each([
    {
      clubId: "other-club",
    },
    {
      clubId: "",
    },
    {
      tokenHash: "b".repeat(64),
    },
    {
      tokenHash: "",
    },
    {
      invitation: null,
    },
  ])("クラブ・hash・招待の不一致を拒否する: %j", (overrides) => {
    expect(evaluateClubInvitationAcceptance(buildInput(overrides))).toEqual({
      allowed: false,
      violation: "INVALID_INVITATION",
    });
  });

  // 取消による所属削除を所属不整合として扱わない。
  it("本人には所属削除後も取消済みと返す", () => {
    const input = buildInput({
      membership: null,
    });
    input.invitation!.status = "CANCELLED";
    input.invitation!.membershipId = null;

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "INVITATION_CANCELLED",
    });
  });

  // ACTIVE化済みでも本人の再操作を承諾済みとして区別する。
  it("本人にはACTIVE化後も承諾済みと返す", () => {
    const input = buildInput();
    input.invitation!.status = "ACCEPTED";
    input.membership!.status = "ACTIVE";

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "INVITATION_ALREADY_ACCEPTED",
    });
  });

  // statusの記録が不整合でも使用済み日時があれば再利用させない。
  it("acceptedAtがある招待を再利用させない", () => {
    const input = buildInput();
    input.invitation!.acceptedAt = new Date(NOW);

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "INVITATION_ALREADY_ACCEPTED",
    });
  });

  // 期限到達は所属検査より前に本人向けの失効理由へ変換する。
  it("期限ちょうどの本人向け結果を期限切れとする", () => {
    const input = buildInput({
      membership: null,
    });
    input.invitation!.expiresAt = new Date(NOW);

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "INVITATION_EXPIRED",
    });
  });

  // 明示的に失効済みの招待を日時だけで復活させない。
  it("EXPIREDは未来の期限が残っていても拒否する", () => {
    const input = buildInput();
    input.invitation!.status = "EXPIRED";

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "INVITATION_EXPIRED",
    });
  });

  // 不正な日時を期限内として扱わない。
  it.each([
    "now",
    "expiresAt",
  ] as const)("不正な%sでは許可しない", (field) => {
    const input = buildInput();

    if (field === "now") {
      input.now = new Date(Number.NaN);
    } else {
      input.invitation!.expiresAt = new Date(Number.NaN);
    }

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "INVALID_INVITATION_STATE",
    });
  });

  // 同じクラブに別の所属があるだけでは招待の所属として採用しない。
  it.each([
    {
      id: "other-membership",
    },
    {
      clubId: "other-club",
    },
    {
      userId: "other-user",
    },
    {
      status: "ACTIVE",
    },
    {
      status: "SUSPENDED",
    },
    {
      status: "WITHDRAWN",
    },
  ] as const)("不整合な所属を拒否する: %j", (overrides) => {
    const input = buildInput();
    Object.assign(input.membership!, overrides);

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "MEMBERSHIP_MISMATCH",
    });
  });

  // DBの所属行や招待側の参照が欠損していれば承諾できない。
  it("招待のmembershipId欠損と所属欠損を拒否する", () => {
    const input = buildInput();
    input.invitation!.membershipId = null;

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "MEMBERSHIP_MISMATCH",
    });
    expect(evaluateClubInvitationAcceptance(buildInput({
      membership: null,
    }))).toEqual({
      allowed: false,
      violation: "MEMBERSHIP_MISMATCH",
    });
  });

  // 基本の利用可否はF05の既存関数に委ね、準備中を受理しない。
  it("PREPARINGを本人・所属一致でも許可しない", () => {
    const input = buildInput();
    input.invitation!.status = "PREPARING";

    expect(evaluateClubInvitationAcceptance(input)).toEqual({
      allowed: false,
      violation: "INVALID_INVITATION_STATE",
    });
  });

  // 表示用DTOへ内部識別子や本人情報を追加しない契約を確認する。
  it("表示用DTOは安全な値と処理失敗の区別を持つ", () => {
    type AvailableView = Extract<
      ClubInvitationAcceptanceView,
      {
        status: "available";
      }
    >;

    expectTypeOf<keyof AvailableView>().toEqualTypeOf<
      | "status"
      | "clubName"
      | "clubSlug"
      | "expiresAt"
    >();
    expectTypeOf<Extract<
      ClubInvitationAcceptanceView,
      {
        status: "error";
      }
    >["reason"]>().toEqualTypeOf<"PROCESSING_FAILED">();
  });
});
