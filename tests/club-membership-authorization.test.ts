// tests/club-membership-authorization.test.ts
// DB上の最新Membership状態を使った認可を確認する

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      createClient:
        vi.fn(),
      getUser:
        vi.fn(),
      findFirstMembership:
        vi.fn(),
      redirect:
        vi.fn(),
      notFound:
        vi.fn(),
    }),
  );

vi.mock(
  "server-only",
  () => ({}),
);

vi.mock(
  "@/src/infrastructure/supabase/server",
  () => ({
    createClient:
      mocks.createClient,
  }),
);

vi.mock(
  "@/src/infrastructure/prisma/client",
  () => ({
    prisma: {
      clubMembership: {
        findFirst:
          mocks
            .findFirstMembership,
      },
    },
  }),
);

vi.mock(
  "next/navigation",
  () => ({
    redirect:
      mocks.redirect,
    notFound:
      mocks.notFound,
  }),
);

import {
  requireActiveClubMembership,
  requireClubOwner,
} from "@/app/(club-app)/club/club-membership-authorization";

import type {
  ClubMemberRole,
  ClubMembershipStatus,
} from "@/types/prisma";

const CLUB_SLUG =
  "club-a";

const USER_ID =
  "user-a";

const MEMBERSHIP_ID =
  "22222222-2222-4222-8222-222222222222";

type StoredMembership = {
  role: ClubMemberRole;
  status: ClubMembershipStatus;
};

/**
 * DBにあるstatusと、認可クエリのwhere.statusが一致した場合だけ
 * Membershipを返す簡易DBモック。
 */
function mockStoredMembership(
  stored:
    StoredMembership,
): void {
  mocks
    .findFirstMembership
    .mockImplementation(
      async (input: unknown) => {
        const where =
          (
            input as {
              where: {
                userId: string;
                status:
                  ClubMembershipStatus;
                club: {
                  is: {
                    slug: string;
                  };
                };
              };
            }
          ).where;

        if (
          where.userId !== USER_ID ||
          where.status !==
            stored.status ||
          where.club.is.slug !==
            CLUB_SLUG
        ) {
          return null;
        }

        return {
          id: MEMBERSHIP_ID,
          role: stored.role,
          club: {
            id:
              "11111111-1111-4111-8111-111111111111",
            name: "Club A",
            slug: CLUB_SLUG,
            timezone:
              "Asia/Tokyo",
            planType:
              "STANDARD",
          },
        };
      },
    );
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks
    .createClient
    .mockResolvedValue({
      auth: {
        getUser:
          mocks.getUser,
      },
    });

  /*
   * Supabaseの既存セッション自体は、全テストで有効なままにする。
   * 許可・拒否はDB上のMembership状態だけで変わる。
   */
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: USER_ID,
      },
    },
    error: null,
  });

  mocks.redirect.mockImplementation(
    () => {
      throw new Error(
        "NEXT_REDIRECT",
      );
    },
  );

  mocks.notFound.mockImplementation(
    () => {
      throw new Error(
        "NEXT_NOT_FOUND",
      );
    },
  );
});

describe(
  "requireActiveClubMembership",
  () => {
    it(
      "DB上でACTIVEなら既存セッションを認可する",
      async () => {
        mockStoredMembership({
          role: "MEMBER",
          status: "ACTIVE",
        });

        await expect(
          requireActiveClubMembership(
            CLUB_SLUG,
          ),
        ).resolves.toEqual({
          userId: USER_ID,
          club: {
            id:
              "11111111-1111-4111-8111-111111111111",
            name: "Club A",
            slug: CLUB_SLUG,
            timezone:
              "Asia/Tokyo",
            planType:
              "STANDARD",
          },
          membership: {
            id: MEMBERSHIP_ID,
            role: "MEMBER",
          },
        });

        expect(
          mocks
            .findFirstMembership,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              userId: USER_ID,
              status: "ACTIVE",
              club: {
                is: {
                  slug: CLUB_SLUG,
                },
              },
            },
          }),
        );
      },
    );

    it.each([
      "SUSPENDED",
      "WITHDRAWN",
    ] as const)(
      "既存セッションがあってもDB上で%sなら拒否する",
      async (status) => {
        mockStoredMembership({
          role: "OWNER",
          status,
        });

        await expect(
          requireActiveClubMembership(
            CLUB_SLUG,
          ),
        ).rejects.toThrow(
          "NEXT_NOT_FOUND",
        );

        expect(
          mocks.getUser,
        ).toHaveBeenCalledTimes(1);
        expect(
          mocks
            .findFirstMembership,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where:
              expect.objectContaining({
                status: "ACTIVE",
              }),
          }),
        );
        expect(
          mocks.notFound,
        ).toHaveBeenCalledTimes(1);
      },
    );
  },
);

describe(
  "requireClubOwner",
  () => {
    it(
      "DB上でACTIVE OWNERなら認可する",
      async () => {
        mockStoredMembership({
          role: "OWNER",
          status: "ACTIVE",
        });

        await expect(
          requireClubOwner(
            CLUB_SLUG,
          ),
        ).resolves.toEqual(
          expect.objectContaining({
            membership: {
              id: MEMBERSHIP_ID,
              role: "OWNER",
            },
          }),
        );
      },
    );

    it(
      "DB上でACTIVEでもMEMBERならOWNERページを拒否する",
      async () => {
        mockStoredMembership({
          role: "MEMBER",
          status: "ACTIVE",
        });

        await expect(
          requireClubOwner(
            CLUB_SLUG,
          ),
        ).rejects.toThrow(
          "NEXT_NOT_FOUND",
        );

        expect(
          mocks.notFound,
        ).toHaveBeenCalledTimes(1);
      },
    );
  },
);
