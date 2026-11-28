// tests/club-join-link-actions.test.ts
// 参加リンクの発行・無効化のServer Action(認可・二重送信防止・URL設定・固定メッセージ)の単体テスト。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"; // テストの枠組み(説明・検証・モック)

const mocks = vi.hoisted(() => ({
  requireClubAppOwnerAccess: vi.fn(), // OWNER認可のモック
  revalidateClubMemberPaths: vi.fn(), // 再検証のモック
  createClubJoinLink: vi.fn(), // 発行Repositoryのモック
  revokeClubJoinLink: vi.fn(), // 無効化Repositoryのモック
  clubFindUnique: vi.fn(), // クラブ取得のモック
  notFound: vi.fn(), // 404のモック
})); // モックをまとめて作る関数

vi.mock("@/app/(club-app)/club/club-app-authorization", () => ({
  requireClubAppOwnerAccess: mocks.requireClubAppOwnerAccess,
}));
vi.mock("@/app/(club-app)/club/revalidate-club-paths", () => ({
  revalidateClubMemberPaths: mocks.revalidateClubMemberPaths,
}));
vi.mock("@/src/infrastructure/prisma/repositories/club-join-repository", () => ({
  createClubJoinLink: mocks.createClubJoinLink,
  revokeClubJoinLink: mocks.revokeClubJoinLink,
}));
vi.mock("@/src/infrastructure/prisma/client", () => ({
  prisma: { club: { findUnique: mocks.clubFindUnique } },
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message === "NEXT_NOT_FOUND") {
      throw error; // 画面遷移の例外は、そのまま通す
    }
  },
}));
vi.mock("server-only", () => ({})); // server-onlyを無効にする

import {
  issueClubJoinLinkAction, // 発行のAction
  revokeClubJoinLinkAction, // 無効化のAction
  type ClubJoinLinkActionState, // 結果の型
} from "@/app/(club-app)/club/[clubSlug]/admin/members/join-link-actions";

const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";

/**
 * 直前の状態を作る。
 * @returns 初期状態。
 */
function previousState(): ClubJoinLinkActionState {
  return { status: "idle", values: {}, fieldErrors: {}, formError: null, requestId: REQUEST_ID };
}

/**
 * フォームを作る。
 * @param requestId フォームのrequestId。
 * @returns FormData。
 */
function form(requestId: string = REQUEST_ID): FormData {
  const formData = new FormData(); // フォームの標準の型
  formData.set("requestId", requestId);
  return formData;
}

describe("参加リンクのServer Action", () => { // 発行・無効化
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "");
    mocks.requireClubAppOwnerAccess.mockResolvedValue({
      club: { id: CLUB_ID, slug: "club-a", timezone: "Asia/Tokyo" },
      membership: { id: MEMBERSHIP_ID },
    });
    mocks.clubFindUnique.mockResolvedValue({
      appBaseUrl: "https://app.example.test",
      timezone: "Asia/Tokyo",
    });
    mocks.createClubJoinLink.mockResolvedValue({
      outcome: "CREATED",
      link: { id: "x", expiresAt: new Date("2026-12-31T00:00:00.000Z") },
    });
    mocks.revokeClubJoinLink.mockResolvedValue({ outcome: "REVOKED", revokedCount: 1 });
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("発行:認可済みのクラブ・所属で、ハッシュだけを保存し、URLとQRを返す", async () => {
    const state = await issueClubJoinLinkAction("club-a", previousState(), form());

    expect(mocks.requireClubAppOwnerAccess).toHaveBeenCalledWith("club-a");
    const input = mocks.createClubJoinLink.mock.calls[0]?.[0];
    expect(input).toMatchObject({ clubId: CLUB_ID, actorMembershipId: MEMBERSHIP_ID });
    expect(input.tokenHash).toMatch(/^[0-9a-f]{64}$/u);

    expect(state.status).toBe("success");
    const url = new URL(state.data?.url ?? "");
    expect(url.origin).toBe("https://app.example.test");
    expect(url.pathname).toBe("/club-join");
    expect(url.searchParams.get("clubSlug")).toBe("club-a");
    const token = url.searchParams.get("token") ?? "";
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(input.tokenHash).not.toContain(token); // 生トークンを保存しない
    expect(state.data?.qr.path.length).toBeGreaterThan(0);
    expect(state.requestId).not.toBe(REQUEST_ID); // 次の操作のために更新
    expect(mocks.revalidateClubMemberPaths).toHaveBeenCalledWith("club-a");
  });

  it("発行:クライアントのclubSlugではなく、認可済みのクラブのslugでURLを作る", async () => {
    mocks.requireClubAppOwnerAccess.mockResolvedValue({
      club: { id: CLUB_ID, slug: "canonical", timezone: "Asia/Tokyo" },
      membership: { id: MEMBERSHIP_ID },
    });
    const state = await issueClubJoinLinkAction("requested", previousState(), form());
    expect(new URL(state.data?.url ?? "").searchParams.get("clubSlug")).toBe("canonical");
  });

  it("発行:requestIdが一致しなければ、何も作らない", async () => {
    const state = await issueClubJoinLinkAction(
      "club-a",
      previousState(),
      form("55555555-5555-4555-8555-555555555555"),
    );
    expect(state.status).toBe("error");
    expect(mocks.createClubJoinLink).not.toHaveBeenCalled();
  });

  it("発行:URLの設定が不正なら、リンクを作らない", async () => {
    mocks.clubFindUnique.mockResolvedValue({ appBaseUrl: "http://insecure.example.test", timezone: "Asia/Tokyo" });
    const state = await issueClubJoinLinkAction("club-a", previousState(), form());
    expect(state.status).toBe("error");
    expect(state.formError).toContain("URLの設定");
    expect(mocks.createClubJoinLink).not.toHaveBeenCalled();
  });

  it("発行:OWNERでなくなっていたら、404にする", async () => {
    mocks.createClubJoinLink.mockResolvedValue({ outcome: "ACTOR_NOT_ACTIVE_OWNER" });
    await expect(issueClubJoinLinkAction("club-a", previousState(), form())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("発行:予期しない失敗は、固定メッセージにし、内容を出さない", async () => {
    mocks.createClubJoinLink.mockRejectedValue(new Error("secret-detail postgres://user:pw@host"));
    const state = await issueClubJoinLinkAction("club-a", previousState(), form());
    expect(state.status).toBe("error");
    expect(JSON.stringify(state)).not.toContain("secret-detail");
    expect(JSON.stringify(state)).not.toContain("postgres://");
  });

  it("無効化:認可済みのクラブ・所属で、無効化する", async () => {
    const state = await revokeClubJoinLinkAction("club-a", previousState(), form());
    expect(mocks.createClubJoinLink).not.toHaveBeenCalled();
    expect(mocks.revokeClubJoinLink).toHaveBeenCalledWith({ clubId: CLUB_ID, actorMembershipId: MEMBERSHIP_ID });
    expect(state.status).toBe("success");
    expect(mocks.revalidateClubMemberPaths).toHaveBeenCalledWith("club-a");
  });

  it("無効化:requestIdが一致しなければ、何もしない", async () => {
    const state = await revokeClubJoinLinkAction(
      "club-a",
      previousState(),
      form("55555555-5555-4555-8555-555555555555"),
    );
    expect(state.status).toBe("error");
    expect(mocks.revokeClubJoinLink).not.toHaveBeenCalled();
  });

  it("無効化:OWNERでなくなっていたら、404にする。失敗は、固定メッセージにする", async () => {
    mocks.revokeClubJoinLink.mockResolvedValueOnce({ outcome: "ACTOR_NOT_ACTIVE_OWNER" });
    await expect(revokeClubJoinLinkAction("club-a", previousState(), form())).rejects.toThrow("NEXT_NOT_FOUND");

    mocks.revokeClubJoinLink.mockRejectedValueOnce(new Error("raw-db-error"));
    const state = await revokeClubJoinLinkAction("club-a", previousState(), form());
    expect(state.status).toBe("error");
    expect(JSON.stringify(state)).not.toContain("raw-db-error");
  });

  it("認可に失敗したら、Repositoryを呼ばない", async () => {
    mocks.requireClubAppOwnerAccess.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(issueClubJoinLinkAction("club-a", previousState(), form())).rejects.toThrow();
    await expect(revokeClubJoinLinkAction("club-a", previousState(), form())).rejects.toThrow();
    expect(mocks.createClubJoinLink).not.toHaveBeenCalled();
    expect(mocks.revokeClubJoinLink).not.toHaveBeenCalled();
  });
});
