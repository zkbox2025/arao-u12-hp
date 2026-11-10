// domain/club/member/member-update-policy.test.ts

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateClubMembershipUpdate,
  isActiveClubOwner,
} from "./member-update-policy";

describe(
  "isActiveClubOwner",
  () => {
    it(
      "roleがOWNERかつstatusがACTIVEの場合だけtrueを返す",
      () => {
        expect(
          isActiveClubOwner({
            role: "OWNER",
            status: "ACTIVE",
          }),
        ).toBe(true);
      },
    );

    it.each([
      {
        role: "MEMBER",
        status: "ACTIVE",
      },
      {
        role: "OWNER",
        status: "SUSPENDED",
      },
      {
        role: "OWNER",
        status: "WITHDRAWN",
      },
      {
        role: "OWNER",
        status: "INVITED",
      },
    ] as const)(
      "$roleかつ$statusではfalseを返す",
      (membership) => {
        expect(
          isActiveClubOwner(
            membership,
          ),
        ).toBe(false);
      },
    );
  },
);

describe(
  "evaluateClubMembershipUpdate",
  () => {
    it(
      "通常のrole・status変更を許可する",
      () => {
        expect(
          evaluateClubMembershipUpdate({
            current: {
              role: "MEMBER",
              status: "ACTIVE",
            },
            next: {
              role: "COACH",
              status: "SUSPENDED",
            },
            activeOwnerCount: 1,
          }),
        ).toEqual({
          allowed: true,
        });
      },
    );

    it(
      "INVITEDのroleをOWNER以外へ変更できる",
      () => {
        expect(
          evaluateClubMembershipUpdate({
            current: {
              role: "MEMBER",
              status: "INVITED",
            },
            next: {
              role: "COACH",
              status: "INVITED",
            },
            activeOwnerCount: 1,
          }),
        ).toEqual({
          allowed: true,
        });
      },
    );

    it(
      "INVITEDメンバーのOWNER昇格を拒否する",
      () => {
        expect(
          evaluateClubMembershipUpdate({
            current: {
              role: "MEMBER",
              status: "INVITED",
            },
            next: {
              role: "OWNER",
              status: "INVITED",
            },
            activeOwnerCount: 1,
          }),
        ).toEqual({
          allowed: false,
          violation:
            "INVITED_OWNER_NOT_ALLOWED",
        });
      },
    );

    it(
      "INVITEDからACTIVEへの変更を拒否する",
      () => {
        expect(
          evaluateClubMembershipUpdate({
            current: {
              role: "MEMBER",
              status: "INVITED",
            },
            next: {
              role: "MEMBER",
              status: "ACTIVE",
            },
            activeOwnerCount: 1,
          }),
        ).toEqual({
          allowed: false,
          violation:
            "INVITATION_STATUS_CHANGE_NOT_ALLOWED",
        });
      },
    );

    it.each([
      "ACTIVE",
      "SUSPENDED",
      "WITHDRAWN",
    ] as const)(
      "%sからINVITEDへの変更を拒否する",
      (currentStatus) => {
        expect(
          evaluateClubMembershipUpdate({
            current: {
              role: "MEMBER",
              status:
                currentStatus,
            },
            next: {
              role: "MEMBER",
              status: "INVITED",
            },
            activeOwnerCount: 1,
          }),
        ).toEqual({
          allowed: false,
          violation:
            "INVITATION_STATUS_CHANGE_NOT_ALLOWED",
        });
      },
    );

    it(
      "最後のACTIVE OWNERの降格を拒否する",
      () => {
        expect(
          evaluateClubMembershipUpdate({
            current: {
              role: "OWNER",
              status: "ACTIVE",
            },
            next: {
              role: "COACH",
              status: "ACTIVE",
            },
            activeOwnerCount: 1,
          }),
        ).toEqual({
          allowed: false,
          violation:
            "LAST_ACTIVE_OWNER",
        });
      },
    );

    it(
      "最後のACTIVE OWNERでもACTIVE OWNERのままなら許可する",
      () => {
        expect(
          evaluateClubMembershipUpdate({
            current: {
              role: "OWNER",
              status: "ACTIVE",
            },
            next: {
              role: "OWNER",
              status: "ACTIVE",
            },
            activeOwnerCount: 1,
          }),
        ).toEqual({
          allowed: true,
        });
      },
    );

    it.each([
      "SUSPENDED",
      "WITHDRAWN",
    ] as const)(
      "最後のACTIVE OWNERを%sへ変更できない",
      (status) => {
        expect(
          evaluateClubMembershipUpdate({
            current: {
              role: "OWNER",
              status: "ACTIVE",
            },
            next: {
              role: "OWNER",
              status,
            },
            activeOwnerCount: 1,
          }),
        ).toEqual({
          allowed: false,
          violation:
            "LAST_ACTIVE_OWNER",
        });
      },
    );

    it(
      "ACTIVE OWNERが2人いれば1人の降格を許可する",
      () => {
        expect(
          evaluateClubMembershipUpdate({
            current: {
              role: "OWNER",
              status: "ACTIVE",
            },
            next: {
              role: "MEMBER",
              status: "ACTIVE",
            },
            activeOwnerCount: 2,
          }),
        ).toEqual({
          allowed: true,
        });
      },
    );

    it(
      "ACTIVEメンバーのOWNER昇格を許可する",
      () => {
        expect(
          evaluateClubMembershipUpdate({
            current: {
              role: "MEMBER",
              status: "ACTIVE",
            },
            next: {
              role: "OWNER",
              status: "ACTIVE",
            },
            activeOwnerCount: 1,
          }),
        ).toEqual({
          allowed: true,
        });
      },
    );

    it.each([
      -1,
      1.5,
      Number.NaN,
    ])(
      "不正なACTIVE OWNER数を拒否する: %p",
      (activeOwnerCount) => {
        expect(() =>
          evaluateClubMembershipUpdate({
            current: {
              role: "MEMBER",
              status: "ACTIVE",
            },
            next: {
              role: "MEMBER",
              status: "ACTIVE",
            },
            activeOwnerCount,
          }),
        ).toThrow(
          "ACTIVE OWNER数が正しくありません。",
        );
      },
    );
  },
);
