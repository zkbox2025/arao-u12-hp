// tests/club-invitation-existing-auth.integration.test.ts
// Authに登録済み・AppUser未作成の人を、既存のAuth IDに紐づけて招待できることを、ローカルDBで確認する。

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client"; // Prismaのクライアントクラス
import { PrismaPg } from "@prisma/adapter-pg"; // PrismaをPostgreSQLへつなぐアダプター
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"; // テストの定義・検証・モックを行うvitestの関数群

import type {
  ClubInvitationLinkBuilder,
} from "@/src/application/club/invitation/send-club-invitation"; // 招待リンクを組み立てる関数の型

/**
 * 外部サービス(Authの管理API・メール送信)の代わりになるモック関数を、ホイスティングして用意する。
 */
const mocks = vi.hoisted(
  /** モック関数をまとめて返すコールバック。 */
  () => ({
    getAuth: vi.fn(), // 既知のAuth IDをAuthで照合する関数のモック
    generateLink: vi.fn(), // Authの招待リンクを作る関数のモック
    sendEmail: vi.fn(), // 招待メールを送る関数のモック
  }),
);

vi.mock("server-only", /** サーバー専用の目印を空にするコールバック。 */ () => ({}));
vi.mock(
  "@/src/infrastructure/supabase/club-invitation-auth",
  /** Authの管理APIをモックへ差し替えるコールバック。 */
  () => ({
    getClubInvitationAuthUserById: mocks.getAuth,
    generateClubInvitationAuthLink: mocks.generateLink,
  }),
);
vi.mock(
  "@/lib/mail/club-invitation-mail",
  /** メール送信をモックへ差し替えるコールバック。 */
  () => ({
    sendClubInvitationEmail: mocks.sendEmail,
  }),
);

const describeDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1"
  ? describe
  : describe.skip; // 明示flagがあるときだけDB統合試験を行う

/**
 * 招待リンクを、試験専用の固定の形で組み立てる関数。
 * 引数は、origin・クラブ・生トークン。戻り値は、招待URLと認証後の戻り先。
 */
const buildLinks: ClubInvitationLinkBuilder = (input) => ({
  invitationUrl: `${input.origin}/test-accept?token=${input.rawToken}`,
  authRedirectTo: `${input.origin}/test-auth-return?token=${input.rawToken}`,
});

describeDatabase("既存Authの人の招待(実Repository・ローカルDB)", () => {
  let db: PrismaClient; // 試験専用のPrismaクライアント
  let invite: typeof import(
    "@/src/application/club/invitation/send-club-invitation"
  ).inviteClubMember; // 招待を送る公開関数
  const clubs = new Set<string>(); // 後片付け対象のクラブID
  const users = new Set<string>(); // 後片付け対象のAppUser・AuthのID

  beforeAll(
    /** ローカル専用DBであることを確認し、Repositoryを試験用クライアントで読み込むコールバック。 */
    async () => {
      let url: URL; // 接続先のURL

      try {
        url = new URL(process.env.DATABASE_URL ?? "invalid");
      } catch {
        throw new Error("このテストはローカル専用DBで実行してください。");
      }

      if (
        process.env.NODE_ENV === "production" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        !["postgres:", "postgresql:"].includes(url.protocol)
      ) {
        throw new Error("このテストはローカル専用DBで実行してください。");
      }

      db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }), // PostgreSQLのアダプターを作るクラス
        log: [],
      });
      vi.doMock(
        "@/src/infrastructure/prisma/client",
        /** 共有クライアントを試験用クライアントへ差し替えるコールバック。 */
        () => ({ prisma: db }),
      );
      ({ inviteClubMember: invite } = await import(
        "@/src/application/club/invitation/send-club-invitation"
      ));
    },
  );

  afterAll(
    /** 作成した試験データだけを削除し、接続を閉じるコールバック。 */
    async () => {
      if (!db) {
        return;
      }

      try {
        await db.club.deleteMany({ where: { id: { in: [...clubs] } } });
        await db.appUser.deleteMany({ where: { id: { in: [...users] } } });
        await db.$executeRaw`DELETE FROM auth.users WHERE id::text = ANY(${[...users]})`; // 試験で作ったAuthの行だけを削除するSQL
      } finally {
        vi.doUnmock("@/src/infrastructure/prisma/client");
        await db.$disconnect();
      }
    },
  );

  beforeEach(
    /** 環境変数とモックの既定値を設定するコールバック。 */
    () => {
      vi.resetAllMocks();
      vi.stubEnv("RESEND_API_KEY", "test-api-key");
      vi.stubEnv("MAIL_FROM_ADDRESS", "from@example.test");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.example.test");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
      vi.stubEnv("APP_BASE_URL", "https://app.example.test");
      mocks.sendEmail.mockResolvedValue({
        outcome: "ACCEPTED",
        emailId: "provider-email-id",
      });
    },
  );

  afterEach(
    /** 差し替えた環境変数を戻すコールバック。 */
    () => {
      vi.unstubAllEnvs();
    },
  );

  /**
   * 試験用のクラブとOWNERを作る関数。戻り値は、招待の入力に使うクラブ情報とOWNERの所属ID。
   */
  async function ownerFixture() {
    const clubId = randomUUID(); // クラブID
    const ownerId = randomUUID(); // OWNERのAppUserのID
    clubs.add(clubId);
    users.add(ownerId);
    const club = await db.club.create({
      data: {
        id: clubId,
        slug: `existing-auth-${clubId}`,
        name: "既存Auth試験",
        appBaseUrl: "https://club.example.test",
      },
    });
    await db.appUser.create({
      data: { id: ownerId, email: `${ownerId}@example.test` },
    });
    const owner = await db.clubMembership.create({
      data: { clubId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
    });

    return {
      club: {
        id: club.id,
        name: club.name,
        slug: club.slug,
        timezone: club.timezone,
        appBaseUrl: club.appBaseUrl,
      },
      actorMembershipId: owner.id,
    };
  }

  /**
   * AuthにだけいるユーザーをDBへ作る関数(AppUserは作らない)。
   * 引数は、メール確認済みかどうか。戻り値は、AuthのIDとメール。
   */
  async function authOnlyUser(confirmed: boolean) {
    const id = randomUUID(); // AuthのID
    const email = `${id}@example.test`; // AuthのメールとAppUserのメール(小文字)
    users.add(id);
    await db.$executeRaw`INSERT INTO auth.users (id, email, email_confirmed_at)
      VALUES (${id}::uuid, ${email}, ${confirmed ? new Date() : null})`; // Authの行を作るSQL

    return { id, email };
  }

  /**
   * 招待を送る関数。引数は、クラブ・OWNER、招待先のメール。戻り値は、招待の結果。
   */
  function sendInvitation(
    owner: Awaited<ReturnType<typeof ownerFixture>>,
    email: string,
  ) {
    return invite(
      { ...owner, email, name: "招待者", role: "COACH" },
      buildLinks,
    );
  }

  it("確認済みでAuthにいてAppUserがない人は、既存のAuth IDでAppUserが作られ、招待URLだけが送られる", async () => {
    const owner = await ownerFixture();
    const auth = await authOnlyUser(true);

    const result = await sendInvitation(owner, auth.email);

    expect(result.outcome).toBe("SENT");
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.sendEmail.mock.calls[0][0].kind).toBe("EXISTING_USER");
    const appUser = await db.appUser.findUnique({ where: { id: auth.id } });
    expect(appUser?.email).toBe(auth.email);
    const membership = await db.clubMembership.findFirst({
      where: { clubId: owner.club.id, userId: auth.id },
    });
    expect(membership).toMatchObject({ role: "COACH", status: "INVITED" });
    const invitation = await db.clubInvitation.findFirst({
      where: { clubId: owner.club.id, email: auth.email },
    });
    expect(invitation?.authUserId).toBe(auth.id);
  });

  it("メールの大文字・小文字が違っても、同じAuthのユーザーとして扱う", async () => {
    const owner = await ownerFixture();
    const auth = await authOnlyUser(true);

    const result = await sendInvitation(owner, auth.email.toUpperCase());

    expect(result.outcome).toBe("SENT");
    expect(await db.appUser.count({ where: { id: auth.id } })).toBe(1);
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it("未確認でAuthにいてAppUserがない人は、同じAuth IDを指定して認証リンクを再発行する", async () => {
    const owner = await ownerFixture();
    const auth = await authOnlyUser(false);
    mocks.generateLink.mockResolvedValue({
      user: { id: auth.id, email: auth.email, isEmailConfirmed: false },
      actionLink: "https://auth.example.test/verify?token=test",
    });

    const result = await sendInvitation(owner, auth.email);

    expect(result.outcome).toBe("SENT");
    expect(mocks.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ expectedAuthUserId: auth.id }),
    );
    expect((await db.appUser.findUnique({ where: { id: auth.id } }))?.id).toBe(auth.id);
  });

  it("同じ招待を再実行しても、AppUser・所属は重複しない", async () => {
    const owner = await ownerFixture();
    const auth = await authOnlyUser(true);

    await sendInvitation(owner, auth.email);
    const second = await sendInvitation(owner, auth.email);

    expect(second.outcome).not.toBe("SENT");
    expect(await db.appUser.count({ where: { id: auth.id } })).toBe(1);
    expect(
      await db.clubMembership.count({
        where: { clubId: owner.club.id, userId: auth.id },
      }),
    ).toBe(1);
  });

  it("すでに ACTIVE の会員(HP管理権限あり)は、招待できず、所属・AppUserは変わらない", async () => {
    const owner = await ownerFixture();
    const memberId = randomUUID(); // 既存会員のID
    users.add(memberId);
    const email = `${memberId}@example.test`;
    await db.$executeRaw`INSERT INTO auth.users (id, email, email_confirmed_at)
      VALUES (${memberId}::uuid, ${email}, now())`; // 既存会員のAuthの行を作るSQL
    const appUser = await db.appUser.create({
      data: { id: memberId, email, name: "既存の名前" },
    });
    const membership = await db.clubMembership.create({
      data: {
        clubId: owner.club.id,
        userId: memberId,
        role: "COACH",
        status: "ACTIVE",
        canManageWebsite: true,
      },
    });
    mocks.getAuth.mockResolvedValue({ id: memberId, email, isEmailConfirmed: true });

    const result = await sendInvitation(owner, email);

    expect(result.outcome).not.toBe("SENT");
    expect(await db.appUser.findUnique({ where: { id: memberId } })).toEqual(appUser);
    expect(
      await db.clubMembership.findUnique({ where: { id: membership.id } }),
    ).toEqual(membership);
  });

  it("Authのユーザーがメールの大文字小文字を除いて同じ人が複数件あるときは、何も作らずに止める", async () => {
    const owner = await ownerFixture();
    const first = await authOnlyUser(true);
    const secondId = randomUUID(); // 同じメールを持つ、もう1件のAuthのID
    users.add(secondId);
    await db.$executeRaw`INSERT INTO auth.users (id, email, email_confirmed_at)
      VALUES (${secondId}::uuid, ${first.email.toUpperCase()}, now())`; // 大文字小文字だけが違う、重複したAuthの行を作るSQL(完全一致の一意制約は通る)

    const result = await sendInvitation(owner, first.email);

    expect(result).toMatchObject({ outcome: "PREPARATION_FAILED", recovery: "MANUAL" });
    expect(await db.appUser.count({ where: { id: { in: [first.id, secondId] } } })).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("Authにいない人は、従来どおり、IDを指定せずに認証リンクを作る", async () => {
    const owner = await ownerFixture();
    const newId = randomUUID(); // 新規に作られるAuthのID
    users.add(newId);
    const email = `${newId}@example.test`;
    mocks.generateLink.mockResolvedValue({
      user: { id: newId, email, isEmailConfirmed: false },
      actionLink: "https://auth.example.test/verify?token=test",
    });

    const result = await sendInvitation(owner, email);

    expect(result.outcome).toBe("SENT");
    expect(mocks.generateLink.mock.calls[0][0]).not.toHaveProperty("expectedAuthUserId");
  });
});
