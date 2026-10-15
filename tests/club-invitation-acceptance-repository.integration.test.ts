// tests/club-invitation-acceptance-repository.integration.test.ts
// 通常はDBなしで読取境界を確認し、明示flag時だけローカルDBの統合試験を行う。

import {
  randomBytes,
  randomUUID,
} from "node:crypto";

import {
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ClubInvitationAcceptanceInvitation,
  ClubInvitationAcceptanceMembership,
} from "@/domain/club/invitation/acceptance-policy";

type Repository = typeof import(
  "@/src/infrastructure/prisma/repositories/club-invitation-repository"
);
type LookupInput = Parameters<
  Repository["findClubInvitationAcceptanceForUser"]
>[0];
type LookupRow = ClubInvitationAcceptanceInvitation & {
  id: string;
  club: {
    name: string;
    slug: string;
  };
  membership: (
    ClubInvitationAcceptanceMembership & {
      user: {
        email: string | null;
      };
    }
  ) | null;
};

const NOW = new Date("2026-10-15T00:00:00.000Z");
const describeDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1"
  ? describe
  : describe.skip;

// dotenvを使う共有clientを評価せず、試験専用のclientだけをRepositoryへ渡す。
async function loadRepository(
  client: unknown,
): Promise<Repository> {
  vi.resetModules();
  vi.doMock("@/src/infrastructure/prisma/client", () => ({
    prisma: client,
  }));

  return import(
    "@/src/infrastructure/prisma/repositories/club-invitation-repository"
  );
}

// 正しいクラブ・本人・所属に対応する読取結果を作る。
function buildRow(): LookupRow {
  return {
    id: "invitation-a",
    clubId: "club-a",
    tokenHash: "a".repeat(64),
    authUserId: "user-a",
    email: "member@example.test",
    membershipId: "membership-a",
    status: "SENT",
    acceptedAt: null,
    expiresAt: new Date(NOW.getTime() + 60_000),
    club: {
      name: "招待先クラブ",
      slug: "club-a",
    },
    membership: {
      id: "membership-a",
      clubId: "club-a",
      userId: "user-a",
      status: "INVITED",
      user: {
        email: "member@example.test",
      },
    },
  };
}

// クライアントの自己申告ではなく、検証済み本人を想定した入力を作る。
function buildLookup(
  overrides: Partial<LookupInput> = {},
): LookupInput {
  return {
    clubSlug: "club-a",
    tokenHash: "a".repeat(64),
    authenticatedUser: {
      id: "user-a",
      email: "member@example.test",
    },
    now: NOW,
    ...overrides,
  };
}

// このsuiteは実DB・dotenv・Auth・メールを使わずに実行する。
describe("招待受取人の読取Repository（DBなし）", () => {
  const findFirst = vi.fn();
  let repository: Repository;

  // 共有clientのimportより前に、読取だけを持つmockへ差し替える。
  beforeAll(async () => {
    repository = await loadRepository({
      clubInvitation: {
        findFirst,
      },
    });
  });

  // 他の試験の返却値を引き継がない。
  beforeEach(() => {
    findFirst.mockReset();
    findFirst.mockResolvedValue(buildRow());
  });

  // 次のsuiteへmockやmodule cacheを持ち越さない。
  afterAll(() => {
    vi.doUnmock("@/src/infrastructure/prisma/client");
    vi.resetModules();
  });

  // 内部IDと画面用DTOを分け、有効な既存3状態を扱う。
  it.each([
    "READY_TO_SEND",
    "SENT",
    "EMAIL_FAILED",
  ] as const)("%sの本人向けDTOに秘密を含めない", async (status) => {
    const row = buildRow();
    row.status = status;
    findFirst.mockResolvedValueOnce(row);

    expect(await repository.findClubInvitationAcceptanceForUser(
      buildLookup(),
    )).toEqual({
      outcome: "AVAILABLE",
      invitation: {
        id: "invitation-a",
        clubId: "club-a",
        membershipId: "membership-a",
      },
      view: {
        status: "available",
        clubName: "招待先クラブ",
        clubSlug: "club-a",
        expiresAt: "2026-10-15T00:01:00.000Z",
      },
    });
  });

  // 検索条件自体でクラブ・hash・本人を限定する。
  it("slug・hash・Auth IDを同じ検索条件へ入れる", async () => {
    await repository.findClubInvitationAcceptanceForUser(buildLookup());

    expect(findFirst).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        where: {
          tokenHash: "a".repeat(64),
          authUserId: "user-a",
          club: {
            is: {
              slug: "club-a",
            },
          },
        },
      }),
    );
  });

  // 条件に一致しない相手には存在や終端状態を知らせない。
  it("検索結果がない場合は理由を推測しない", async () => {
    findFirst.mockResolvedValueOnce(null);

    expect(await repository.findClubInvitationAcceptanceForUser(
      buildLookup(),
    )).toEqual({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason: "INVALID_INVITATION",
      },
    });
  });

  // DB結果の本人が異なる場合もDomainの再照合で詳細を隠す。
  it("別人の取消状態を返さない", async () => {
    const row = buildRow();
    row.status = "CANCELLED";
    row.authUserId = "other-user";
    row.membership = null;
    findFirst.mockResolvedValueOnce(row);

    expect(await repository.findClubInvitationAcceptanceForUser(
      buildLookup(),
    )).toEqual({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason: "RECIPIENT_MISMATCH",
      },
    });
  });

  // 現在emailの欠損・変更では状態の詳細まで開示しない。
  it.each([
    null,
    "",
    "   ",
    "changed@example.test",
  ])("Auth email不一致を区別する: %s", async (email) => {
    const row = buildRow();
    row.status = "ACCEPTED";
    findFirst.mockResolvedValueOnce(row);

    expect(await repository.findClubInvitationAcceptanceForUser(
      buildLookup({
        authenticatedUser: {
          id: "user-a",
          email,
        },
      }),
    )).toEqual({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason: "INVITATION_EMAIL_MISMATCH",
      },
    });
  });

  // 既存のメール正規化規則をAuth・Invitation・AppUserに適用する。
  it("正規化で一致するemailを受理する", async () => {
    const row = buildRow();
    row.email = " MEMBER@EXAMPLE.TEST ";
    row.membership!.user.email = "Member@Example.Test";
    findFirst.mockResolvedValueOnce(row);

    const result = await repository.findClubInvitationAcceptanceForUser(
      buildLookup({
        authenticatedUser: {
          id: "user-a",
          email: "ｍｅｍｂｅｒ＠ｅｘａｍｐｌｅ．ｔｅｓｔ",
        },
      }),
    );

    expect(result.outcome).toBe("AVAILABLE");
  });

  // AppUser不整合を隠して成功にしたり修復したりしない。
  it.each([
    null,
    "",
    "other@example.test",
  ])("AppUser email不整合を拒否する: %s", async (email) => {
    const row = buildRow();
    row.membership!.user.email = email;
    findFirst.mockResolvedValueOnce(row);

    expect(await repository.findClubInvitationAcceptanceForUser(
      buildLookup(),
    )).toEqual({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason: "MEMBERSHIP_MISMATCH",
      },
    });
    expect(row.membership!.user.email).toBe(email);
  });

  // 同一クラブ制約に加え、読取側も所属の対応を検査する。
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
  ] as const)("不整合な所属をDTOへ採用しない: %j", async (overrides) => {
    const row = buildRow();
    Object.assign(row.membership!, overrides);
    findFirst.mockResolvedValueOnce(row);

    expect(await repository.findClubInvitationAcceptanceForUser(
      buildLookup(),
    )).toEqual({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason: "MEMBERSHIP_MISMATCH",
      },
    });
  });

  // 取消による所属削除と通常の所属欠損を区別する。
  it.each([
    {
      status: "CANCELLED",
      reason: "INVITATION_CANCELLED",
    },
    {
      status: "ACCEPTED",
      reason: "INVITATION_ALREADY_ACCEPTED",
    },
    {
      status: "EXPIRED",
      reason: "INVITATION_EXPIRED",
    },
    {
      status: "SENT",
      reason: "MEMBERSHIP_MISMATCH",
    },
  ] as const)("所属欠損でも本人の$statusを区別する", async ({
    status,
    reason,
  }) => {
    const row = buildRow();
    row.status = status;
    row.membershipId = null;
    row.membership = null;
    findFirst.mockResolvedValueOnce(row);

    expect(await repository.findClubInvitationAcceptanceForUser(
      buildLookup(),
    )).toEqual({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason,
      },
    });
  });

  // 不正なhashや時刻は検索する前に固定メッセージで拒否する。
  it("不正なhash・時刻でDB検索しない", async () => {
    await expect(repository.findClubInvitationAcceptanceForUser(
      buildLookup({
        tokenHash: "private-raw-token",
      }),
    )).rejects.toMatchObject({
      code: "VALIDATION",
      message: "招待トークンの形式が正しくありません。",
    });
    await expect(repository.findClubInvitationAcceptanceForUser(
      buildLookup({
        now: new Date(Number.NaN),
      }),
    )).rejects.toMatchObject({
      code: "VALIDATION",
      message: "処理日時が正しくありません。",
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  // 未認証や空のslugで招待情報を読まない。
  it("本人情報なし・空slugではDB検索しない", async () => {
    expect(await repository.findClubInvitationAcceptanceForUser(
      buildLookup({
        authenticatedUser: null,
      }),
    )).toMatchObject({
      outcome: "UNAVAILABLE",
    });
    expect(await repository.findClubInvitationAcceptanceForUser(
      buildLookup({
        clubSlug: "",
      }),
    )).toMatchObject({
      outcome: "UNAVAILABLE",
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  // DBの生エラーから固定文言と安全なコードだけを引き継ぐ。
  it("DBエラーの原文・meta・causeを返さない", async () => {
    const privateDetail = "private@example.test raw-token connection-secret";
    findFirst.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(privateDetail, {
        code: "P2003",
        clientVersion: Prisma.prismaVersion.client,
        meta: {
          privateDetail,
        },
      }),
    );

    await expect(repository.findClubInvitationAcceptanceForUser(
      buildLookup(),
    )).rejects.toMatchObject({
      code: "INVALID_REFERENCE",
      message: "招待情報を確認できませんでした。",
      publicMessage: "招待情報を確認できませんでした。",
      cause: undefined,
    });
  });

  // 任意のDomainErrorメッセージも、そのまま公開文言にしない。
  it("既存DomainErrorの任意メッセージも反射しない", async () => {
    const { DomainError } = await import("@/domain/shared/domain-error");
    findFirst.mockRejectedValueOnce(new DomainError(
      "INTERNAL",
      "private-domain-detail",
      {
        cause: new Error("private-cause"),
      },
    ));

    await expect(repository.findClubInvitationAcceptanceForUser(
      buildLookup(),
    )).rejects.toMatchObject({
      code: "INTERNAL",
      message: "招待情報を確認できませんでした。",
      cause: undefined,
    });
  });
});

// このsuiteは明示flagとloopbackの専用DBがある場合だけ実行する。
describeDatabase("招待受取人の読取Repository（ローカルDB）", () => {
  let db: PrismaClient | undefined;
  let repository: Repository;
  const clubs = new Set<string>();
  const users = new Set<string>();

  // 本番接続・外部接続を拒否し、環境ファイルは読み込まない。
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    let url: URL;

    try {
      url = new URL(databaseUrl ?? "invalid");
    } catch {
      throw new Error("ローカル専用DBの接続設定が必要です。");
    }

    if (
      process.env.NODE_ENV === "production" ||
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      throw new Error("DB試験はloopbackの専用環境だけで実行できます。");
    }

    db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
        max: 3,
      }),
      log: [],
    });
    repository = await loadRepository(db);
  });

  // 実DB試験でも、試験間のspyを保持しない。
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 作成したUUIDのfixtureだけを削除し、既存データへ触れない。
  afterAll(async () => {
    if (!db) {
      return;
    }

    try {
      await db.club.deleteMany({
        where: {
          id: {
            in: [...clubs],
          },
        },
      });
      await db.appUser.deleteMany({
        where: {
          id: {
            in: [...users],
          },
        },
      });
    } finally {
      vi.doUnmock("@/src/infrastructure/prisma/client");
      vi.resetModules();
      await db.$disconnect();
    }
  });

  // flagなしでは呼ばれず、共有clientのdotenvも読み込まない。
  function database(): PrismaClient {
    if (!db) {
      throw new Error("DB試験の接続が準備されていません。");
    }

    return db;
  }

  // 実際の制約を維持したまま、OWNERと招待受取人を別ユーザーとして作る。
  async function fixture() {
    const clubId = randomUUID();
    const ownerId = randomUUID();
    const userId = randomUUID();
    const ownerMembershipId = randomUUID();
    const membershipId = randomUUID();
    const invitationId = randomUUID();
    const clubSlug = `f06-reader-${clubId}`;
    const email = `${userId}@example.test`;
    const tokenHash = randomBytes(32).toString("hex");
    clubs.add(clubId);
    users.add(ownerId);
    users.add(userId);

    await database().$transaction(async (tx) => {
      await tx.appUser.createMany({
        data: [
          {
            id: ownerId,
            email: `${ownerId}@example.test`,
          },
          {
            id: userId,
            email,
          },
        ],
      });
      await tx.club.create({
        data: {
          id: clubId,
          name: "F06読取テストクラブ",
          slug: clubSlug,
        },
      });
      await tx.clubMembership.createMany({
        data: [
          {
            id: ownerMembershipId,
            clubId,
            userId: ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            id: membershipId,
            clubId,
            userId,
            role: "MEMBER",
            status: "INVITED",
          },
        ],
      });
      await tx.clubInvitation.create({
        data: {
          id: invitationId,
          clubId,
          email,
          role: "MEMBER",
          status: "SENT",
          tokenHash,
          authUserId: userId,
          membershipId,
          invitedByMembershipId: ownerMembershipId,
          expiresAt: new Date(NOW.getTime() + 60_000),
        },
      });
    });

    return {
      clubId,
      invitationId,
      membershipId,
      ownerMembershipId,
      userId,
      lookup: {
        clubSlug,
        tokenHash,
        authenticatedUser: {
          id: userId,
          email,
        },
        now: NOW,
      },
    };
  }

  // 更新時刻を含む対象行を比較し、読取による期限処理や修復がないことを確認する。
  async function snapshot(
    value: Awaited<ReturnType<typeof fixture>>,
  ) {
    return Promise.all([
      database().clubInvitation.findUniqueOrThrow({
        where: {
          id: value.invitationId,
        },
      }),
      database().clubMembership.findUnique({
        where: {
          id: value.membershipId,
        },
      }),
      database().appUser.findUniqueOrThrow({
        where: {
          id: value.userId,
        },
      }),
    ]);
  }

  // MEMBER受取人が各有効状態を取得でき、いずれも行を書き換えない。
  it.each([
    "READY_TO_SEND",
    "SENT",
    "EMAIL_FAILED",
  ] as const)("%sのDTOを実DBから読取り、更新しない", async (status) => {
    const value = await fixture();
    await database().clubInvitation.update({
      where: {
        id: value.invitationId,
      },
      data: {
        status,
      },
    });
    const before = await snapshot(value);

    expect(await repository.findClubInvitationAcceptanceForUser(
      value.lookup,
    )).toEqual({
      outcome: "AVAILABLE",
      invitation: {
        id: value.invitationId,
        clubId: value.clubId,
        membershipId: value.membershipId,
      },
      view: {
        status: "available",
        clubName: "F06読取テストクラブ",
        clubSlug: value.lookup.clubSlug,
        expiresAt: "2026-10-15T00:01:00.000Z",
      },
    });
    expect(await snapshot(value)).toEqual(before);
  });

  // 終端状態の診断のために、利用可能状態だけへ検索を絞らない。
  it.each([
    "CANCELLED",
    "ACCEPTED",
  ] as const)("本人の%sを区別し、再更新しない", async (status) => {
    const value = await fixture();
    await database().clubInvitation.update({
      where: {
        id: value.invitationId,
      },
      data: {
        status,
        acceptedAt: status === "ACCEPTED" ? NOW : null,
      },
    });

    if (status === "CANCELLED") {
      await database().clubMembership.delete({
        where: {
          id: value.membershipId,
        },
      });
    } else {
      await database().clubMembership.update({
        where: {
          id: value.membershipId,
        },
        data: {
          status: "ACTIVE",
        },
      });
    }

    const before = await snapshot(value);

    expect(await repository.findClubInvitationAcceptanceForUser(
      value.lookup,
    )).toEqual({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason: status === "CANCELLED"
          ? "INVITATION_CANCELLED"
          : "INVITATION_ALREADY_ACCEPTED",
      },
    });
    expect(await snapshot(value)).toEqual(before);
  });

  // 読取はPREPARINGを承諾可能にせず、期限到達をEXPIREDへ書き換えもしない。
  it("PREPARINGと期限ちょうどを拒否して状態を保存し直さない", async () => {
    const value = await fixture();
    await database().clubInvitation.update({
      where: {
        id: value.invitationId,
      },
      data: {
        status: "PREPARING",
      },
    });

    expect(await repository.findClubInvitationAcceptanceForUser(
      value.lookup,
    )).toMatchObject({
      outcome: "UNAVAILABLE",
      view: {
        reason: "INVALID_INVITATION_STATE",
      },
    });

    await database().clubInvitation.update({
      where: {
        id: value.invitationId,
      },
      data: {
        status: "SENT",
        expiresAt: NOW,
      },
    });
    const before = await snapshot(value);

    expect(await repository.findClubInvitationAcceptanceForUser(
      value.lookup,
    )).toMatchObject({
      outcome: "UNAVAILABLE",
      view: {
        reason: "INVITATION_EXPIRED",
      },
    });
    expect(await snapshot(value)).toEqual(before);
  });

  // 正しいtokenでも、別クラブや別Authのデータを取得できない。
  it("slug・hash・Auth IDの不一致で詳細を返さない", async () => {
    const value = await fixture();
    const other = await fixture();
    const before = await snapshot(value);

    for (const overrides of [
      {
        clubSlug: other.lookup.clubSlug,
      },
      {
        tokenHash: randomBytes(32).toString("hex"),
      },
      {
        authenticatedUser: {
          id: other.userId,
          email: value.lookup.authenticatedUser.email,
        },
      },
    ]) {
      expect(await repository.findClubInvitationAcceptanceForUser({
        ...value.lookup,
        ...overrides,
      })).toEqual({
        outcome: "UNAVAILABLE",
        view: {
          status: "unavailable",
          reason: "INVALID_INVITATION",
        },
      });
    }

    expect(await snapshot(value)).toEqual(before);
  });

  // 同じAuth IDでも、現在emailが変わっていれば承諾可能にしない。
  it.each([
    null,
    "",
    "changed@example.test",
  ])("現在Auth emailの欠損・不一致を拒否する: %s", async (email) => {
    const value = await fixture();

    expect(await repository.findClubInvitationAcceptanceForUser({
      ...value.lookup,
      authenticatedUser: {
        id: value.userId,
        email,
      },
    })).toMatchObject({
      outcome: "UNAVAILABLE",
      view: {
        reason: "INVITATION_EMAIL_MISMATCH",
      },
    });
  });

  // AppUserのemailを勝手に補完・同期しない。
  it.each([
    "missing",
    "different",
  ] as const)("AppUser emailの%sを修復せず拒否する", async (mode) => {
    const value = await fixture();
    await database().appUser.update({
      where: {
        id: value.userId,
      },
      data: {
        email: mode === "missing"
          ? null
          : `changed-${value.userId}@example.test`,
      },
    });
    const before = await snapshot(value);

    expect(await repository.findClubInvitationAcceptanceForUser(
      value.lookup,
    )).toMatchObject({
      outcome: "UNAVAILABLE",
      view: {
        reason: "MEMBERSHIP_MISMATCH",
      },
    });
    expect(await snapshot(value)).toEqual(before);
  });

  // INVITED以外へ変更された所属を読取時に復帰させない。
  it.each([
    "ACTIVE",
    "SUSPENDED",
    "WITHDRAWN",
  ] as const)("所属%sを拒否して状態を変更しない", async (status) => {
    const value = await fixture();
    await database().clubMembership.update({
      where: {
        id: value.membershipId,
      },
      data: {
        status,
      },
    });
    const before = await snapshot(value);

    expect(await repository.findClubInvitationAcceptanceForUser(
      value.lookup,
    )).toMatchObject({
      outcome: "UNAVAILABLE",
      view: {
        reason: "MEMBERSHIP_MISMATCH",
      },
    });
    expect(await snapshot(value)).toEqual(before);
  });

  // 同一クラブの所属でも、別userへ紐付いた場合は拒否する。
  it("別userへの所属参照を拒否する", async () => {
    const value = await fixture();
    await database().clubInvitation.update({
      where: {
        id: value.invitationId,
      },
      data: {
        membershipId: value.ownerMembershipId,
      },
    });
    const before = await snapshot(value);

    expect(await repository.findClubInvitationAcceptanceForUser(
      value.lookup,
    )).toMatchObject({
      outcome: "UNAVAILABLE",
      view: {
        reason: "MEMBERSHIP_MISMATCH",
      },
    });
    expect(await snapshot(value)).toEqual(before);
  });

  // 所属の削除後も、SENTを自動修復せず不整合として返す。
  it("所属欠損を補完しない", async () => {
    const value = await fixture();
    await database().clubMembership.delete({
      where: {
        id: value.membershipId,
      },
    });
    const before = await snapshot(value);

    expect(await repository.findClubInvitationAcceptanceForUser(
      value.lookup,
    )).toMatchObject({
      outcome: "UNAVAILABLE",
      view: {
        reason: "MEMBERSHIP_MISMATCH",
      },
    });
    expect(await snapshot(value)).toEqual(before);
  });

  // 既存の他クラブ所属には一切の更新を行わない。
  it("別クラブの既存ACTIVE所属を保持する", async () => {
    const value = await fixture();
    const other = await fixture();
    const membership = await database().clubMembership.create({
      data: {
        clubId: other.clubId,
        userId: value.userId,
        role: "COACH",
        status: "ACTIVE",
      },
    });
    const before = await snapshot(value);

    expect((await repository.findClubInvitationAcceptanceForUser(
      value.lookup,
    )).outcome).toBe("AVAILABLE");
    expect(await database().clubMembership.findUniqueOrThrow({
      where: {
        id: membership.id,
      },
    })).toEqual(membership);
    expect(await snapshot(value)).toEqual(before);
  });
});
