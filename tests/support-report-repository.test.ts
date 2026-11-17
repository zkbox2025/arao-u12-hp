// tests/support-report-repository.test.ts
// 実DB・dotenv・メールなしで、受付の本人境界、snapshot、限定再送、通知記録の条件を確認する。

import {
  Prisma,
} from "@prisma/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  SupportReportNotificationResult,
  SupportReportReceipt,
} from "@/domain/club/support/support-report-types";
import {
  createSupportReportForMember,
  recordSupportReportNotification,
  type CreateSupportReportForMemberInput,
  type RecordSupportReportNotificationInput,
} from "@/src/infrastructure/prisma/repositories/support-report-repository";
import type {
  ClubMemberRole,
  ClubMembershipStatus,
  PlanType,
} from "@/types/prisma";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  actor: vi.fn(),
  findReport: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

// 共有clientを評価せず、実接続とdotenv読込を起動しない。
vi.mock("@/src/infrastructure/prisma/client", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

const REPORT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_REPORT_ID = "22222222-2222-4222-8222-222222222222";
const PRIVATE_DETAIL = "private@example.test raw-secret-token db-connection-secret";
const NOW = new Date("2026-10-22T00:00:00.000Z");

type Actor = {
  id: string;
  clubId: string;
  userId: string;
  status: ClubMembershipStatus;
  role: ClubMemberRole;
  club: {
    id: string;
    name: string;
    slug: string;
    planType: PlanType;
  } | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};
type StoredReport = SupportReportReceipt & {
  status: string;
  internalNote: string | null;
  notifiedAt: Date | null;
  notifyError: string | null;
};

let actor: Actor | null;
let reports: Map<string, StoredReport>;
let tail: Promise<unknown>;

// ID・本文・metadataの既定入力を毎回別オブジェクトで用意する。
function input(): CreateSupportReportForMemberInput {
  return {
    clubId: "club-a",
    actorMembershipId: "membership-a",
    userId: "user-a",
    requestId: REPORT_ID,
    category: "BUG",
    message: " 報告本文 ",
    pageUrl: "/club/club-a/account?token=private#secret",
    userAgent: " Chrome\r\n Safari ",
  };
}

// 作成済みの内部行を用意し、内部メモ等がDTOへ漏れないことも確認する。
function report(): StoredReport {
  return {
    id: REPORT_ID,
    clubId: "club-a",
    membershipId: "membership-a",
    clubName: "現在クラブ",
    category: "BUG",
    message: "報告本文",
    pageUrl: "/club/club-a/account",
    userAgent: "Chrome Safari",
    reporterName: "保存時氏名",
    reporterEmail: "snapshot@example.test",
    reporterRole: "MEMBER",
    createdAt: NOW,
    status: "OPEN",
    internalNote: PRIVATE_DETAIL,
    notifiedAt: null,
    notifyError: null,
  };
}

// codeを持つだけの偽物と、Prismaの既知エラーを区別できるようにする。
function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(PRIVATE_DETAIL, {
    code,
    clientVersion: "test",
    meta: {
      detail: PRIVATE_DETAIL,
    },
  });
}

// 通知結果はサーバーが受領した受付IDとクラブへ関連付ける。
function notificationInput(
  notification: SupportReportNotificationResult = { outcome: "ACCEPTED" },
): RecordSupportReportNotificationInput {
  return {
    reportId: REPORT_ID,
    clubId: "club-a",
    notification,
  };
}

// 試験ごとにstoreとdelegateを作り直し、SQLの保証とは分けて条件とrollback境界を確認する。
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  actor = {
    id: "membership-a",
    clubId: "club-a",
    userId: "user-a",
    status: "ACTIVE",
    role: "MEMBER",
    club: {
      id: "club-a",
      name: "現在クラブ",
      slug: "club-a",
      planType: "STANDARD",
    },
    user: {
      id: "user-a",
      name: "保存時氏名",
      email: "snapshot@example.test",
    },
  };
  reports = new Map();
  tail = Promise.resolve();
  mocks.actor.mockImplementation(async ({ where }) => {
    expect(where).toEqual({
      id: "membership-a",
      clubId: "club-a",
      userId: "user-a",
      status: "ACTIVE",
    });
    return structuredClone(actor);
  });
  mocks.findReport.mockImplementation(async ({ where }) => {
    const row = reports.get(where.id);
    if (!row || row.clubId !== where.clubId) {
      return null;
    }
    if (where.membershipId !== undefined) {
      if (
        row.membershipId !== where.membershipId ||
        where.membership.is.id !== "membership-a" ||
        where.membership.is.clubId !== "club-a" ||
        where.membership.is.userId !== "user-a"
      ) {
        return null;
      }
    }
    return structuredClone(row);
  });
  mocks.create.mockImplementation(async ({ data }) => {
    if (reports.has(data.id)) {
      throw prismaError("P2002");
    }
    const row: StoredReport = {
      ...report(),
      ...data,
    };
    reports.set(row.id, structuredClone(row));
    return row;
  });
  mocks.update.mockImplementation(async ({ where, data }) => {
    expect(Object.keys(where).sort()).toEqual(["clubId", "id", "notifiedAt"]);
    expect(where.notifiedAt).toBeNull();
    expect(Object.keys(data).sort()).toEqual(["notifiedAt", "notifyError"]);
    const row = reports.get(where.id);
    if (!row || row.clubId !== where.clubId || row.notifiedAt !== null) {
      return { count: 0 };
    }
    Object.assign(row, data);
    return { count: 1 };
  });
  mocks.transaction.mockImplementation((operation, options) => {
    expect(options).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    // 実SQLの代替ではない。callbackを直列化し、throw時のstore復元だけを模す。
    const execute = async () => {
      const before = structuredClone(reports);
      try {
        return await operation({
          clubMembership: {
            findFirst: mocks.actor,
          },
          supportReport: {
            findFirst: mocks.findReport,
            create: mocks.create,
            updateMany: mocks.update,
          },
        });
      } catch (error) {
        reports = before;
        throw error;
      }
    };
    const result = tail.then(execute);
    tail = result.catch(() => undefined);
    return result;
  });
});

// 個人情報入り例外もログへ出さず、時刻・spyを他の試験へ持ち越さない。
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("受付の本人・クラブ境界", () => {
  it.each(["OWNER", "COACH", "OFFICER", "MEMBER"] as const)(
    "%sを許可し、最新DBのsnapshotと限定metadataだけを保存する",
    async (role) => {
      actor!.role = role;
      const data = {
        ...input(),
        reporterName: "偽の氏名",
        reporterEmail: PRIVATE_DETAIL,
        reporterRole: "OWNER",
        clubName: "偽のクラブ",
        clubSlug: "foreign-club",
        status: "RESOLVED",
        notifiedAt: NOW,
        notifyError: PRIVATE_DETAIL,
        internalNote: PRIVATE_DETAIL,
      };
      const result = await createSupportReportForMember(data);
      expect(result.outcome).toBe("CREATED");
      expect(mocks.create).toHaveBeenCalledWith({
        data: {
          id: REPORT_ID,
          clubId: "club-a",
          membershipId: "membership-a",
          category: "BUG",
          message: "報告本文",
          status: "OPEN",
          pageUrl: "/club/club-a/account",
          userAgent: "Chrome Safari",
          reporterName: "保存時氏名",
          reporterEmail: "snapshot@example.test",
          reporterRole: role,
          notifiedAt: null,
          notifyError: null,
        },
        select: {
          id: true,
          clubId: true,
          membershipId: true,
          category: true,
          message: true,
          pageUrl: true,
          userAgent: true,
          reporterName: true,
          reporterEmail: true,
          reporterRole: true,
          createdAt: true,
        },
      });
      if (result.outcome === "CREATED") {
        expect(result.report).toEqual({
          id: REPORT_ID,
          clubId: "club-a",
          membershipId: "membership-a",
          clubName: "現在クラブ",
          category: "BUG",
          message: "報告本文",
          pageUrl: "/club/club-a/account",
          userAgent: "Chrome Safari",
          reporterName: "保存時氏名",
          reporterEmail: "snapshot@example.test",
          reporterRole: role,
          createdAt: NOW,
        });
      }
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it("AppUserのnullを保持し、metadataのnullや不正パスも安全に扱う", async () => {
    actor!.user!.name = null;
    actor!.user!.email = null;
    const result = await createSupportReportForMember({
      ...input(),
      pageUrl: "https://remote.test/?token=private",
      userAgent: null,
    });
    expect(result).toMatchObject({
      outcome: "CREATED",
      report: {
        reporterName: null,
        reporterEmail: null,
        pageUrl: null,
        userAgent: null,
      },
    });
  });

  it("サーバーmetadataも既存関数で再制限し、別クラブパスと長すぎるUAを保存しない", async () => {
    const result = await createSupportReportForMember({
      ...input(),
      pageUrl: "/club/foreign-club/account",
      userAgent: "a".repeat(513),
    });
    expect(result).toMatchObject({
      outcome: "CREATED",
      report: {
        pageUrl: null,
        userAgent: "a".repeat(512),
      },
    });
  });

  it.each(["INVITED", "SUSPENDED", "WITHDRAWN"] as const)("最新statusが%sなら拒否する", async (status) => {
    actor!.status = status;
    expect(await createSupportReportForMember(input())).toEqual({ outcome: "FORBIDDEN" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findReport).not.toHaveBeenCalled();
  });

  it.each(["STARTER", "PRO"] as const)("最新プランが%sなら拒否する", async (planType) => {
    actor!.club!.planType = planType;
    expect(await createSupportReportForMember(input())).toEqual({ outcome: "FORBIDDEN" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["id", "clubId", "userId"] as const)("DBから返った%sがscopeと違えば拒否する", async (field) => {
    actor![field] = "foreign";
    expect(await createSupportReportForMember(input())).toEqual({ outcome: "FORBIDDEN" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["clubId", "actorMembershipId", "userId"] as const)(
    "非空の別%sを入力しても元の本人行を流用しない",
    async (field) => {
      mocks.actor.mockResolvedValueOnce(actor);
      const data = {
        ...input(),
        [field]: "foreign"
      };
      expect(await createSupportReportForMember(data)).toEqual({ outcome: "FORBIDDEN" });
      expect(
        mocks.actor.mock.calls[0][0].where[field === "actorMembershipId" ? "id" : field]
      )
        .toBe("foreign");
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );

  it.each(["missing", "user", "user-id", "club", "club-id"])(
    "本人・関連行不整合%sを修復せず拒否する", async (kind) => {
      if (kind === "missing") {
        actor = null;
      }
      if (kind === "user") {
        actor!.user = null;
      }
      if (kind === "user-id") {
        actor!.user!.id = "foreign-user";
      }
      if (kind === "club") {
        actor!.club = null;
      }
      if (kind === "club-id") {
        actor!.club!.id = "foreign-club";
      }
      expect(await createSupportReportForMember(input())).toEqual({ outcome: "FORBIDDEN" });
      expect(mocks.create).not.toHaveBeenCalled();
    });

  it.each(["clubId", "actorMembershipId", "userId"] as const)(
    "入力scopeの%sが空ならDBを呼ばない", async (field) => {
      expect(await createSupportReportForMember({
        ...input(),
        [field]: " "
      }))
        .toEqual({ outcome: "FORBIDDEN" });
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

  it.each([null, undefined, "invalid", []])("非オブジェクトscopeを拒否する %#", async (value) => {
    expect(
      await createSupportReportForMember(value as unknown as CreateSupportReportForMemberInput)
    )
      .toEqual({ outcome: "FORBIDDEN" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    { requestId: "invalid" },
    { message: " " },
    { message: "あ".repeat(2001) },
    { category: "INVALID" },
  ])("不正なID・本文・種別をDBへ渡さない %#", async (patch) => {
    expect(
      await createSupportReportForMember(
        {
          ...input(),
          ...patch
        } as CreateSupportReportForMemberInput
      )
    )
      .toEqual({ outcome: "CREATE_FAILED" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("同一受付とtransaction", () => {
  it("再送は本人・クラブ・元Membership・内容だけを照合し、snapshotと通知状態を変えない", async () => {
    const existing = report();
    existing.notifiedAt = NOW;
    existing.status = "RESOLVED";
    reports.set(REPORT_ID, existing);
    actor!.role = "COACH";
    actor!.user!.name = "後日の氏名";
    const before = structuredClone(reports);
    expect(await createSupportReportForMember(input())).toEqual(
      { outcome: "ALREADY_ACCEPTED" }
    );
    expect(mocks.findReport).toHaveBeenCalledWith({
      where: {
        id: REPORT_ID,
        clubId: "club-a",
        membershipId: "membership-a",
        membership: {
          is: {
            id: "membership-a",
            clubId: "club-a",
            userId: "user-a",
          },
        },
      },
      select: {
        id: true,
        clubId: true,
        membershipId: true,
        category: true,
        message: true,
      },
    });
    expect(reports).toEqual(before);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("同時呼出しの単体モデルでも1件だけ作成する。実SQL競合は後続DB試験で確認する", async () => {
    const results = await Promise.all([
      createSupportReportForMember(input()),
      createSupportReportForMember(input()),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual(
      ["ALREADY_ACCEPTED", "CREATED"]
    );
    expect(reports.size).toBe(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it.each(["category", "message"] as const)("既存受付の%sが違えば成功にしない", async (field) => {
    const existing = report();
    if (field === "category") {
      existing.category = "OTHER";
    }
    if (field === "message") {
      existing.message = "異なる内容";
    }
    reports.set(REPORT_ID, existing);
    expect(await createSupportReportForMember(input())).toEqual({ outcome: "CONFLICT" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["clubId", "membershipId"] as const)(
    "同一IDが別%sへ属するならunique違反後も受付済みにしない", async (field) => {
      const existing = report();
      existing[field] = "foreign";
      reports.set(REPORT_ID, existing);
      const before = structuredClone(reports);
      expect(await createSupportReportForMember(input())).toEqual({ outcome: "CONFLICT" });
      expect(mocks.transaction).toHaveBeenCalledTimes(2);
      expect(mocks.actor).toHaveBeenCalledTimes(2);
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(reports).toEqual(before);
    });

  it("同時INSERTのP2002後は新transactionで再認可し、限定再読取だけを行う", async () => {
    mocks.create.mockRejectedValueOnce(prismaError("P2002"));
    mocks.findReport.mockResolvedValueOnce(null).mockResolvedValueOnce(report());
    expect(await createSupportReportForMember(input())).toEqual(
      { outcome: "ALREADY_ACCEPTED" }
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.actor).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("P2002後でも親所属が失効すれば拒否する", async () => {
    mocks.create.mockImplementationOnce(async () => {
      actor!.status = "WITHDRAWN";
      throw prismaError("P2002");
    });
    expect(await createSupportReportForMember(input())).toEqual({ outcome: "FORBIDDEN" });
    expect(mocks.findReport).toHaveBeenCalledTimes(1);
  });

  it("読取中のP2002をINSERT競合と見なさない", async () => {
    mocks.findReport.mockRejectedValueOnce(prismaError("P2002"));
    expect(await createSupportReportForMember(input())).toEqual(
      { outcome: "CREATE_FAILED" }
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("unique競合後の再読取例外を受付済みへ丸めない", async () => {
    mocks.create.mockRejectedValueOnce(prismaError("P2002"));
    mocks.findReport.mockResolvedValueOnce(null).mockRejectedValueOnce(
      new Error(PRIVATE_DETAIL)
    );
    expect(await createSupportReportForMember(input())).toEqual(
      { outcome: "CREATE_FAILED" }
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("P2034後の再試行でも所属失効を再照合する", async () => {
    mocks.create.mockImplementationOnce(async () => {
      actor!.status = "WITHDRAWN";
      throw prismaError("P2034");
    });
    expect(await createSupportReportForMember(input())).toEqual({ outcome: "FORBIDDEN" });
    expect(mocks.actor).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(reports.size).toBe(0);
  });

  it("作成後のP2034でstoreをrollbackし、最初の認可からやり直す", async () => {
    const create = mocks.create.getMockImplementation()!;
    mocks.create.mockImplementationOnce(async (args) => {
      await create(args);
      throw prismaError("P2034");
    });
    expect((await createSupportReportForMember(input())).outcome).toBe("CREATED");
    expect(reports.size).toBe(1);
    expect(mocks.actor).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("作成後の任意例外ではrollbackし、原文や部分受付を返さない", async () => {
    const create = mocks.create.getMockImplementation()!;
    mocks.create.mockImplementationOnce(async (args) => {
      await create(args);
      throw new Error(PRIVATE_DETAIL);
    });
    expect(await createSupportReportForMember(input())).toEqual(
      { outcome: "CREATE_FAILED" }
    );
    expect(reports.size).toBe(0);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("保存先の不整合はrollbackして失敗とする", async () => {
    const create = mocks.create.getMockImplementation()!;
    mocks.create.mockImplementationOnce(async (args) => {
      const row = await create(args);
      return {
        ...row,
        clubId: "foreign-club"
      };
    });
    expect(await createSupportReportForMember(input())).toEqual(
      { outcome: "CREATE_FAILED" }
    );
    expect(reports.size).toBe(0);
  });

  it("P2034再試行は初回に加えて3回だけ", async () => {
    mocks.transaction.mockRejectedValue(prismaError("P2034"));
    expect(await createSupportReportForMember(input())).toEqual({ outcome: "CONFLICT" });
    expect(mocks.transaction).toHaveBeenCalledTimes(4);
  });

  it.each([new Error(PRIVATE_DETAIL), {
    code: "P2034",
    message: PRIVATE_DETAIL
  }])(
    "任意例外・偽のcodeは再試行や成功へ変換しない %#",
    async (error) => {
      mocks.transaction.mockRejectedValueOnce(error);
      expect(await createSupportReportForMember(input())).toEqual(
        { outcome: "CREATE_FAILED" }
      );
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
    },
  );
});

describe("受付後の通知結果記録", () => {
  beforeEach(() => {
    reports.set(REPORT_ID, report());
  });

  it("成功はnotifiedAtとnotifyErrorだけを書き、本文・snapshot・statusは維持する", async () => {
    const before = structuredClone(reports.get(REPORT_ID)!);
    expect(await recordSupportReportNotification(notificationInput())).toEqual(
      { outcome: "RECORDED" }
    );
    expect(mocks.update).toHaveBeenCalledWith({
      where: {
        id: REPORT_ID,
        clubId: "club-a",
        notifiedAt: null,
      },
      data: {
        notifiedAt: NOW,
        notifyError: null,
      },
    });
    expect(reports.get(REPORT_ID)).toEqual({
      ...before,
      notifiedAt: NOW
    });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      outcome: "FAILED",
      errorCode: "EMAIL_CONFIGURATION_MISSING"
    },
    {
      outcome: "FAILED",
      errorCode: "EMAIL_SEND_FAILED"
    },
    {
      outcome: "UNKNOWN",
      errorCode: "EMAIL_SEND_RESULT_UNKNOWN"
    },
  ] as const)("固定の通知結果を保存する：$errorCode", async (notification) => {
    expect(await recordSupportReportNotification(notificationInput(notification)))
      .toEqual({ outcome: "RECORDED" });
    expect(reports.get(REPORT_ID)).toMatchObject({
      notifiedAt: null,
      notifyError: notification.errorCode,
    });
  });

  it("失敗記録の後に成功した場合は固定エラーを消して受付時刻を記録する", async () => {
    await recordSupportReportNotification(notificationInput({
      outcome: "FAILED",
      errorCode: "EMAIL_SEND_FAILED",
    }));
    expect(await recordSupportReportNotification(notificationInput()))
      .toEqual({ outcome: "RECORDED" });
    expect(reports.get(REPORT_ID)).toMatchObject({
      notifiedAt: NOW,
      notifyError: null,
    });
  });

  it("Membership削除後も受付IDとclubIdで記録できる", async () => {
    reports.get(REPORT_ID)!.membershipId = null;
    actor = null;
    expect(await recordSupportReportNotification(notificationInput())).toEqual(
      { outcome: "RECORDED" }
    );
    expect(reports.get(REPORT_ID)!.membershipId).toBeNull();
    expect(mocks.actor).not.toHaveBeenCalled();
  });

  it.each(["club", "report"])("対象%sが違う場合はNOT_FOUNDで他レコードを変えない", async (kind) => {
    const data = notificationInput();
    if (kind === "club") {
      data.clubId = "foreign-club";
    }
    if (kind === "report") {
      data.reportId = OTHER_REPORT_ID;
    }
    const before = structuredClone(reports);
    expect(await recordSupportReportNotification(data)).toEqual({ outcome: "NOT_FOUND" });
    expect(reports).toEqual(before);
  });

  it("成功記録の後に遅れた失敗を受けてもprovider受付を上書きしない", async () => {
    await recordSupportReportNotification(notificationInput());
    const before = structuredClone(reports);
    expect(await recordSupportReportNotification(notificationInput({
      outcome: "UNKNOWN",
      errorCode: "EMAIL_SEND_RESULT_UNKNOWN",
    }))).toEqual({ outcome: "RECORDED" });
    expect(reports).toEqual(before);
  });

  it.each([
    null,
    {
      outcome: "FAILED",
      errorCode: PRIVATE_DETAIL
    },
    {
      outcome: "UNKNOWN",
      errorCode: "EMAIL_SEND_FAILED"
    },
    {
      outcome: "FAILED",
      errorCode: "EMAIL_SEND_RESULT_UNKNOWN"
    },
    { outcome: "INVALID" },
  ])("不正な通知結果を保存・反射しない %#", async (notification) => {
    const data = notificationInput(notification as SupportReportNotificationResult);
    expect(await recordSupportReportNotification(data)).toEqual(
      { outcome: "UPDATE_FAILED" }
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("結果オブジェクトの余分な情報を更新データへ含めない", async () => {
    const notification = {
      outcome: "ACCEPTED" as const,
      message: PRIVATE_DETAIL,
      reporterEmail: PRIVATE_DETAIL,
      internalNote: PRIVATE_DETAIL,
    };
    expect(await recordSupportReportNotification(notificationInput(notification)))
      .toEqual({ outcome: "RECORDED" });
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      notifiedAt: NOW,
      notifyError: null,
    });
  });

  it.each([null, { reportId: "invalid" }, { clubId: " " }])(
    "不正な通知scopeでDBを呼ばない %#", async (patch) => {
      const data = patch === null ? null : {
        ...notificationInput(),
        ...patch
      };
      expect(
        await recordSupportReportNotification(data as RecordSupportReportNotificationInput)
      )
        .toEqual({ outcome: "UPDATE_FAILED" });
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

  it("更新0件なのに未記録の行が残る場合は成功にしない", async () => {
    mocks.update.mockResolvedValueOnce({ count: 0 });
    expect(await recordSupportReportNotification(notificationInput())).toEqual(
      { outcome: "UPDATE_FAILED" }
    );
  });

  it("更新件数不整合はrollbackし、受付本体を失敗扱いや削除へ変更しない", async () => {
    const before = structuredClone(reports);
    const update = mocks.update.getMockImplementation()!;
    mocks.update.mockImplementationOnce(async (args) => {
      await update(args);
      return { count: 2 };
    });
    expect(await recordSupportReportNotification(notificationInput())).toEqual(
      { outcome: "UPDATE_FAILED" }
    );
    expect(reports).toEqual(before);
  });

  it("通知保存のP2034もrollback後だけ再試行する", async () => {
    const update = mocks.update.getMockImplementation()!;
    mocks.update.mockImplementationOnce(async (args) => {
      await update(args);
      throw prismaError("P2034");
    });
    expect(await recordSupportReportNotification(notificationInput())).toEqual(
      { outcome: "RECORDED" }
    );
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it("通知保存の競合上限と任意失敗はUPDATE_FAILEDに限定し、受付を残す", async () => {
    const before = structuredClone(reports);
    mocks.transaction.mockRejectedValue(prismaError("P2034"));
    expect(await recordSupportReportNotification(notificationInput())).toEqual(
      { outcome: "UPDATE_FAILED" }
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(4);
    expect(reports).toEqual(before);
    mocks.transaction.mockReset().mockRejectedValueOnce(new Error(PRIVATE_DETAIL));
    expect(await recordSupportReportNotification(notificationInput())).toEqual(
      { outcome: "UPDATE_FAILED" }
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(reports).toEqual(before);
  });
});
