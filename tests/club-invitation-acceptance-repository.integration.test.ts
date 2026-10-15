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

// 【追加：F06粒度3】実DBへ接続せず、transactionの境界と再試行を確認する。
describe("招待受取人の承諾Repository（DBなし）", () => {
  const tx = {
    clubInvitation: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    clubMembership: {
      updateMany: vi.fn(),
    },
  };
  const transaction = vi.fn();
  let repository: Repository;

  // 受取人処理がOWNER認可用の別clientを使わないことも確認する。
  beforeAll(async () => {
    repository = await loadRepository({
      $transaction: transaction,
    });
  });

  // 書込は毎回独立したmockに戻す。実DBのrollbackは後続suiteで確認する。
  beforeEach(() => {
    tx.clubInvitation.findFirst.mockReset();
    tx.clubInvitation.findFirst.mockResolvedValue(buildRow());
    tx.clubInvitation.updateMany.mockReset();
    tx.clubInvitation.updateMany.mockResolvedValue({
      count: 1,
    });
    tx.clubMembership.updateMany.mockReset();
    tx.clubMembership.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.mockReset();
    transaction.mockImplementation(async (
      operation: (client: typeof tx) => Promise<unknown>,
    ) => operation(tx));
  });

  // fake clockを実DBのsuiteや他の試験へ持ち越さない。
  afterEach(() => {
    vi.useRealTimers();
  });

  // 共有clientの評価を防ぐmockを解除する。
  afterAll(() => {
    vi.doUnmock("@/src/infrastructure/prisma/client");
    vi.resetModules();
  });

  // 許可済み状態だけを条件付き更新し、claimとleaseを同時に解除する。
  it.each([
    "READY_TO_SEND",
    "SENT",
    "EMAIL_FAILED",
  ] as const)("%sの本人向け承諾をSerializableで行う", async (status) => {
    const row = buildRow();
    row.status = status;
    tx.clubInvitation.findFirst.mockResolvedValueOnce(row);

    expect(await repository.acceptClubInvitationForUser(buildLookup())).toEqual({
      outcome: "ACCEPTED",
      clubSlug: "club-a",
    });
    expect(transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
    expect(tx.clubInvitation.findFirst).toHaveBeenCalledWith(
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
    expect(tx.clubInvitation.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: expect.objectContaining({
        id: "invitation-a",
        clubId: "club-a",
        tokenHash: "a".repeat(64),
        authUserId: "user-a",
        email: "member@example.test",
        membershipId: "membership-a",
        status,
        acceptedAt: null,
        expiresAt: {
          gt: NOW,
        },
        membership: {
          is: {
            id: "membership-a",
            clubId: "club-a",
            userId: "user-a",
            status: "INVITED",
            user: {
              is: {
                email: "member@example.test",
              },
            },
          },
        },
      }),
      data: {
        status: "ACCEPTED",
        acceptedAt: NOW,
        claimToken: null,
        leaseExpiresAt: null,
      },
    });
    expect(tx.clubMembership.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: "membership-a",
        clubId: "club-a",
        userId: "user-a",
        status: "INVITED",
        user: {
          is: {
            email: "member@example.test",
          },
        },
      },
      data: {
        status: "ACTIVE",
      },
    });
  });

  // 一致しない検索結果を期限切れや取消と推測せず、書込もしない。
  it("検索結果なしでは更新しない", async () => {
    tx.clubInvitation.findFirst.mockResolvedValueOnce(null);

    expect(await repository.acceptClubInvitationForUser(buildLookup())).toEqual({
      outcome: "UNAVAILABLE",
      reason: "INVALID_INVITATION",
    });
    expect(tx.clubInvitation.updateMany).not.toHaveBeenCalled();
    expect(tx.clubMembership.updateMany).not.toHaveBeenCalled();
  });

  // 終端状態や準備中の招待を更新対象にしない。
  it.each([
    "PREPARING",
    "CANCELLED",
    "ACCEPTED",
    "EXPIRED",
  ] as const)("%sでは書込しない", async (status) => {
    const row = buildRow();
    row.status = status;
    tx.clubInvitation.findFirst.mockResolvedValueOnce(row);

    expect((await repository.acceptClubInvitationForUser(
      buildLookup(),
    )).outcome).toBe("UNAVAILABLE");
    expect(tx.clubInvitation.updateMany).not.toHaveBeenCalled();
    expect(tx.clubMembership.updateMany).not.toHaveBeenCalled();
  });

  // hashが正しくても本人のIDや現在emailが一致しなければ承諾させない。
  it.each([
    {
      id: "other-user",
      email: "member@example.test",
    },
    {
      id: "user-a",
      email: "changed@example.test",
    },
  ])("本人不一致では更新しない: %j", async (authenticatedUser) => {
    expect((await repository.acceptClubInvitationForUser(buildLookup({
      authenticatedUser,
    }))).outcome).toBe("UNAVAILABLE");
    expect(tx.clubInvitation.updateMany).not.toHaveBeenCalled();
    expect(tx.clubMembership.updateMany).not.toHaveBeenCalled();
  });

  // AppUserの欠損emailや他クラブ所属を黙って修復しない。
  it.each([
    "app-email",
    "membership-club",
    "membership-status",
  ])("不整合な%sでは更新しない", async (target) => {
    const row = buildRow();

    if (target === "app-email") {
      row.membership!.user.email = null;
    } else if (target === "membership-club") {
      row.membership!.clubId = "other-club";
    } else {
      row.membership!.status = "ACTIVE";
    }

    tx.clubInvitation.findFirst.mockResolvedValueOnce(row);

    expect(await repository.acceptClubInvitationForUser(buildLookup())).toEqual({
      outcome: "UNAVAILABLE",
      reason: "MEMBERSHIP_MISMATCH",
    });
    expect(tx.clubInvitation.updateMany).not.toHaveBeenCalled();
    expect(tx.clubMembership.updateMany).not.toHaveBeenCalled();
  });

  // 取得中に期限を迎えた招待では、取得前の時刻で更新しない。
  it("DB取得後に現在時刻を確認する", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
    });
    vi.setSystemTime(NOW);
    tx.clubInvitation.findFirst.mockImplementationOnce(async () => {
      const row = buildRow();
      vi.setSystemTime(new Date(NOW.getTime() + 60_000));
      return row;
    });

    expect(await repository.acceptClubInvitationForUser(buildLookup({
      now: undefined,
    }))).toEqual({
      outcome: "UNAVAILABLE",
      reason: "INVITATION_EXPIRED",
    });
    expect(tx.clubInvitation.updateMany).not.toHaveBeenCalled();
    expect(tx.clubMembership.updateMany).not.toHaveBeenCalled();
  });

  // 件数不成立はcallbackからthrowし、正常commitとして返さない。
  it.each([
    "invitation",
    "membership",
  ])("%sの更新件数0はtransactionを中止する", async (target) => {
    const update = target === "invitation"
      ? tx.clubInvitation.updateMany
      : tx.clubMembership.updateMany;
    update.mockResolvedValueOnce({
      count: 0,
    });

    expect(await repository.acceptClubInvitationForUser(buildLookup())).toEqual({
      outcome: "CONFLICT",
    });
    await expect(transaction.mock.results[0].value).rejects.toThrow(
      "Invitation acceptance conflict",
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  // commit時のP2034後も、前の取得結果と時刻で承諾を続行しない。
  it("P2034では招待と時刻を取得し直す", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
    });
    vi.setSystemTime(NOW);
    transaction.mockImplementationOnce(async (
      operation: (client: typeof tx) => Promise<unknown>,
    ) => {
      await operation(tx);
      vi.setSystemTime(new Date(NOW.getTime() + 60_000));
      throw new Prisma.PrismaClientKnownRequestError("Synthetic conflict", {
        code: "P2034",
        clientVersion: Prisma.prismaVersion.client,
      });
    });

    expect(await repository.acceptClubInvitationForUser(buildLookup({
      now: undefined,
    }))).toEqual({
      outcome: "UNAVAILABLE",
      reason: "INVITATION_EXPIRED",
    });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(tx.clubInvitation.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.clubInvitation.updateMany).toHaveBeenCalledTimes(1);
  });

  // 競合の自動再試行には既存と同じ上限を設ける。
  it("P2034が継続しても初回と再試行3回で止める", async () => {
    transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "Synthetic conflict",
      {
        code: "P2034",
        clientVersion: Prisma.prismaVersion.client,
      },
    ));

    expect(await repository.acceptClubInvitationForUser(buildLookup())).toEqual({
      outcome: "CONFLICT",
    });
    expect(transaction).toHaveBeenCalledTimes(4);
  });

  // DB原文やcauseを公開せず、競合以外のエラーは再試行しない。
  it.each([
    "known",
    "unknown",
  ])("%sのDBエラーを固定例外へ変換する", async (kind) => {
    const error = kind === "known"
      ? new Prisma.PrismaClientKnownRequestError("private-db-detail", {
          code: "P2003",
          clientVersion: Prisma.prismaVersion.client,
        })
      : new Error("private-db-detail");
    tx.clubMembership.updateMany.mockRejectedValueOnce(error);

    await expect(repository.acceptClubInvitationForUser(
      buildLookup(),
    )).rejects.toMatchObject({
      code: kind === "known" ? "INVALID_REFERENCE" : "INTERNAL",
      message: "招待を承諾できませんでした。",
      cause: undefined,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  // 不正な入力をtransactionへ持ち込まない。
  it("不正なhash・時刻・本人欠損ではtransactionを開始しない", async () => {
    await expect(repository.acceptClubInvitationForUser(buildLookup({
      tokenHash: "private-raw-token",
    }))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(repository.acceptClubInvitationForUser(buildLookup({
      now: new Date(Number.NaN),
    }))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect((await repository.acceptClubInvitationForUser(buildLookup({
      authenticatedUser: null,
    }))).outcome).toBe("UNAVAILABLE");
    expect(transaction).not.toHaveBeenCalled();
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

  // 【追加：F06粒度3】実transactionの一部だけに失敗を注入してrollbackを確認する。
  function interceptAcceptance(
    change: (tx: Prisma.TransactionClient) => void,
  ): void {
    const client = database();
    const original = client.$transaction.bind(client);
    const replacement = async (
      operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: {
        isolationLevel?: Prisma.TransactionIsolationLevel;
        maxWait?: number;
        timeout?: number;
      },
    ) => original(
      async (tx) => {
        change(tx);
        return operation(tx);
      },
      options,
    );

    vi.spyOn(client, "$transaction").mockImplementationOnce(
      replacement as typeof client.$transaction,
    );
  }

  // 【追加：F06粒度3】既存F05操作との競合に使う同一クラブOWNER入力を作る。
  function ownerInput(
    value: Awaited<ReturnType<typeof fixture>>,
  ) {
    return {
      clubId: value.clubId,
      actorMembershipId: value.ownerMembershipId,
      invitationId: value.invitationId,
      now: NOW,
    };
  }

  // 【追加：F06粒度3】承諾は既存3状態を対象にし、role・AppUser・他の情報を変えない。
  it.each([
    "READY_TO_SEND",
    "SENT",
    "EMAIL_FAILED",
  ] as const)("%sを一回だけ承諾し、claimとleaseを同時解除する", async (status) => {
    const value = await fixture();
    await database().clubInvitation.update({
      where: {
        id: value.invitationId,
      },
      data: {
        status,
        claimToken: randomUUID(),
        leaseExpiresAt: new Date(NOW.getTime() + 300_000),
      },
    });
    const before = await snapshot(value);

    expect(await repository.acceptClubInvitationForUser(value.lookup)).toEqual({
      outcome: "ACCEPTED",
      clubSlug: value.lookup.clubSlug,
    });

    const after = await snapshot(value);
    expect(after[0]).toEqual({
      ...before[0],
      status: "ACCEPTED",
      acceptedAt: NOW,
      claimToken: null,
      leaseExpiresAt: null,
      updatedAt: expect.any(Date),
    });
    expect(after[1]).toEqual({
      ...before[1],
      status: "ACTIVE",
      updatedAt: expect.any(Date),
    });
    expect(after[2]).toEqual(before[2]);
    expect(await repository.acceptClubInvitationForUser(value.lookup)).toEqual({
      outcome: "UNAVAILABLE",
      reason: "INVITATION_ALREADY_ACCEPTED",
    });
    expect(await snapshot(value)).toEqual(after);
  });

  // 【追加：F06粒度3】同じtokenの2並行でも、成功結果とDBの確定は1件だけ。
  it("同一招待を2並行で承諾しても成功は1回だけ", async () => {
    const value = await fixture();
    const results = await Promise.all([
      repository.acceptClubInvitationForUser(value.lookup),
      repository.acceptClubInvitationForUser(value.lookup),
    ]);
    const accepted = results.filter((result) => result.outcome === "ACCEPTED");

    expect(accepted).toHaveLength(1);
    const [invitation, membership] = await snapshot(value);
    expect(invitation.status).toBe("ACCEPTED");
    expect(invitation.acceptedAt).toEqual(NOW);
    expect(membership?.status).toBe("ACTIVE");
  });

  // 【追加：F06粒度3】片方の件数不成立や例外で、先行した更新もrollbackする。
  it.each([
    "invitation-zero",
    "membership-zero",
    "membership-error",
  ])("%sでも承諾更新を部分保存しない", async (failure) => {
    const value = await fixture();
    const before = await snapshot(value);

    interceptAcceptance((tx) => {
      if (failure === "invitation-zero") {
        vi.spyOn(tx.clubInvitation, "updateMany").mockResolvedValueOnce({
          count: 0,
        });
      } else if (failure === "membership-zero") {
        vi.spyOn(tx.clubMembership, "updateMany").mockResolvedValueOnce({
          count: 0,
        });
      } else {
        vi.spyOn(tx.clubMembership, "updateMany").mockRejectedValueOnce(
          new Error("private-transaction-detail"),
        );
      }
    });

    if (failure === "membership-error") {
      await expect(repository.acceptClubInvitationForUser(
        value.lookup,
      )).rejects.toMatchObject({
        message: "招待を承諾できませんでした。",
        cause: undefined,
      });
    } else {
      expect(await repository.acceptClubInvitationForUser(value.lookup)).toEqual({
        outcome: "CONFLICT",
      });
    }

    expect(await snapshot(value)).toEqual(before);
  });

  // 【追加：F06粒度3】別クラブ・別Auth・現在email違いではDBを更新しない。
  it("本人・クラブ・hashの不一致を拒否して状態を保持する", async () => {
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
      {
        authenticatedUser: {
          id: value.userId,
          email: "changed@example.test",
        },
      },
    ]) {
      expect((await repository.acceptClubInvitationForUser({
        ...value.lookup,
        ...overrides,
      })).outcome).toBe("UNAVAILABLE");
    }

    expect(await snapshot(value)).toEqual(before);
  });

  // 【追加：F06粒度3】有効期限ちょうどではINVITEDをACTIVEにしない。
  it("期限ちょうどの承諾を拒否する", async () => {
    const value = await fixture();
    const before = await snapshot(value);

    expect(await repository.acceptClubInvitationForUser({
      ...value.lookup,
      now: new Date(NOW.getTime() + 60_000),
    })).toEqual({
      outcome: "UNAVAILABLE",
      reason: "INVITATION_EXPIRED",
    });
    expect(await snapshot(value)).toEqual(before);
  });

  // 【追加：F06粒度3】取消と承諾のいずれが先でも、ACTIVEとCANCELLEDを混在させない。
  it("取消との競合で一貫した終端状態だけを残す", async () => {
    const value = await fixture();
    const [acceptance] = await Promise.all([
      repository.acceptClubInvitationForUser(value.lookup),
      repository.cancelClubInvitation(ownerInput(value)),
    ]);
    const [invitation, membership] = await snapshot(value);

    if (invitation.status === "ACCEPTED") {
      expect(acceptance.outcome).toBe("ACCEPTED");
      expect(membership?.status).toBe("ACTIVE");
    } else {
      expect(invitation.status).toBe("CANCELLED");
      expect(acceptance.outcome).not.toBe("ACCEPTED");
      expect(membership).toBeNull();
    }
  });

  // 【追加：F06粒度3】再送が先なら旧hashを拒否し、承諾が先なら再送で巻き戻さない。
  it("再送との競合で旧tokenを再利用できない", async () => {
    const value = await fixture();
    const tokenHash = randomBytes(32).toString("hex");
    const [acceptance] = await Promise.all([
      repository.acceptClubInvitationForUser(value.lookup),
      repository.claimClubInvitationResend({
        ...ownerInput(value),
        tokenHash,
      }),
    ]);
    const [invitation, membership] = await snapshot(value);

    if (invitation.status === "ACCEPTED") {
      expect(acceptance.outcome).toBe("ACCEPTED");
      expect(invitation.tokenHash).toBe(value.lookup.tokenHash);
      expect(membership?.status).toBe("ACTIVE");
    } else {
      expect(invitation.status).toBe("PREPARING");
      expect(invitation.tokenHash).toBe(tokenHash);
      expect(acceptance.outcome).not.toBe("ACCEPTED");
      expect(membership?.status).toBe("INVITED");
    }

    expect((await repository.acceptClubInvitationForUser(
      value.lookup,
    )).outcome).toBe("UNAVAILABLE");
  });

  // 【追加：F06粒度3】期限処理と競合しても、期限切れのままACTIVEにはならない。
  it("期限処理との競合で招待と所属の対応を維持する", async () => {
    const value = await fixture();
    const [acceptance] = await Promise.all([
      repository.acceptClubInvitationForUser(value.lookup),
      repository.expireClubInvitations({
        ...ownerInput(value),
        now: new Date(NOW.getTime() + 60_000),
      }),
    ]);
    const [invitation, membership] = await snapshot(value);

    if (invitation.status === "ACCEPTED") {
      expect(acceptance.outcome).toBe("ACCEPTED");
      expect(membership?.status).toBe("ACTIVE");
    } else {
      expect(invitation.status).toBe("EXPIRED");
      expect(acceptance.outcome).not.toBe("ACCEPTED");
      expect(membership?.status).toBe("INVITED");
    }
  });

  // 【追加：F06粒度3】送信完了の遅延報告でACCEPTEDをSENTへ戻さない。
  it("送信結果記録との競合後も承諾状態とclaim解除を維持する", async () => {
    const value = await fixture();
    const claimToken = randomUUID();
    await database().clubInvitation.update({
      where: {
        id: value.invitationId,
      },
      data: {
        status: "READY_TO_SEND",
        claimToken,
        leaseExpiresAt: new Date(NOW.getTime() + 300_000),
      },
    });
    const claim = {
      ...ownerInput(value),
      claimToken,
    };
    const [acceptance] = await Promise.all([
      repository.acceptClubInvitationForUser(value.lookup),
      repository.markClubInvitationEmailSent(claim),
    ]);

    expect(acceptance.outcome).toBe("ACCEPTED");
    expect(await repository.markClubInvitationEmailSent(claim)).toEqual({
      outcome: "CLAIM_LOST",
    });
    const [invitation, membership] = await snapshot(value);
    expect(invitation.status).toBe("ACCEPTED");
    expect(invitation.claimToken).toBeNull();
    expect(invitation.leaseExpiresAt).toBeNull();
    expect(membership?.status).toBe("ACTIVE");
  });

  // 【追加：F06粒度3】対象クラブのINVITEDだけを更新し、既存の別所属を維持する。
  it("承諾しても他クラブのstatus・roleとAppUserを保持する", async () => {
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
    const user = await database().appUser.findUniqueOrThrow({
      where: {
        id: value.userId,
      },
    });

    expect((await repository.acceptClubInvitationForUser(
      value.lookup,
    )).outcome).toBe("ACCEPTED");
    expect(await database().clubMembership.findUniqueOrThrow({
      where: {
        id: membership.id,
      },
    })).toEqual(membership);
    expect(await database().appUser.findUniqueOrThrow({
      where: {
        id: value.userId,
      },
    })).toEqual(user);
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
