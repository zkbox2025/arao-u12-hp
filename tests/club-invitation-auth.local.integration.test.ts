// tests/club-invitation-auth.local.integration.test.ts

import { randomUUID } from "node:crypto";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  generateClubInvitationAuthLink,
  getClubInvitationAuthUserById,
} from "@/src/infrastructure/supabase/club-invitation-auth";
import {
  createSupabaseAdminClient,
} from "@/src/infrastructure/supabase/admin";

// 【追加：F06粒度5】実Authの戻り形式・AMRとSSR Cookieの確立を確認する。
import {
  getVerifiedClubInvitationSession,
  prepareClubInvitationSession,
} from "@/src/infrastructure/supabase/club-invitation-session";

const describeLocalAuth = process.env.RUN_CLUB_INVITATION_AUTH_TESTS === "1"
  ? describe
  : describe.skip;

// エラー原文・メール・Authリンク・tokenをVitestの失敗表示へ出さない。
async function safeCheck(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    throw new Error("ローカル招待Auth検証に失敗しました。設定とSDKの挙動を確認してください。");
  }
}

// 明示実行時だけローカルAuthを使用し、メール配送・Authユーザー削除は行わない。
describeLocalAuth("ローカルSupabaseの招待Auth契約", () => {
  let admin: SupabaseClient;
  let authUrl: string;
  let anonKey: string;
  let redirectTo: string;

  beforeAll(async () => {
    await safeCheck(async () => {
      const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "invalid");
      const origin = new URL(process.env.APP_BASE_URL ?? "invalid");

      if (
        process.env.NODE_ENV === "production" ||
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        url.protocol !== "http:" ||
        url.port !== "54321" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        !["127.0.0.1", "localhost"].includes(origin.hostname) ||
        origin.protocol !== "http:" ||
        origin.port !== "3000" ||
        origin.username ||
        origin.password ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash ||
        !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        !process.env.SUPABASE_SERVICE_ROLE_KEY
      ) {
        throw new Error("Local Auth configuration required");
      }

      authUrl = url.origin;
      anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const destination = new URL("/welcome", origin.origin);
      destination.search = new URLSearchParams({
        clubSlug: "local-auth-test",
        // 【変更：F06粒度5】現行入口の43文字token契約に合わせる。
        token: "a".repeat(43),
      }).toString();
      redirectTo = destination.toString();
      admin = createSupabaseAdminClient();
    });
  });

  // UUIDを含むテストアカウントだけを新規生成し、既存アカウントを流用しない。
  function email(): string {
    return `f05-auth-${randomUUID()}@example.test`;
  }

  // OTP検証はanonクライアントで行い、管理クライアントのセッションを変えない。
  function verificationClient(): SupabaseClient {
    return createClient(authUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  it("新規リンク・ID照合・既知未確認ユーザーへの再発行が同じIDを保つ", async () => {
    await safeCheck(async () => {
      const target = email();
      const first = await generateClubInvitationAuthLink({
        email: target,
        redirectTo,
      });
      const user = await getClubInvitationAuthUserById({
        authUserId: first.user.id,
        email: target,
      });
      const second = await generateClubInvitationAuthLink({
        email: target,
        redirectTo,
        expectedAuthUserId: first.user.id,
      });
      const link = new URL(second.actionLink);

      expect(user?.id === first.user.id).toBe(true);
      expect(first.user.isEmailConfirmed).toBe(false);
      expect(second.user.id === first.user.id).toBe(true);
      expect(link.origin === authUrl).toBe(true);
      expect(link.searchParams.get("type") === "invite").toBe(true);
      expect(link.searchParams.get("redirect_to") === redirectTo).toBe(true);
      expect(link.searchParams.has("token")).toBe(true);
    });
  });

  it("存在しないIDとメール不一致を安全に拒否する", async () => {
    await safeCheck(async () => {
      expect(await getClubInvitationAuthUserById({
        authUserId: randomUUID(),
        email: email(),
      })).toBeNull();
      const target = email();
      const link = await generateClubInvitationAuthLink({
        email: target,
        redirectTo,
      });

      await expect(getClubInvitationAuthUserById({
        authUserId: link.user.id,
        email: email(),
      })).rejects.toMatchObject({
        code: "EXTERNAL_SERVICE",
      });
    });
  });

  it("確認済みAuthを取得でき、invite再発行は拒否する", async () => {
    await safeCheck(async () => {
      const target = email();
      const { data, error } = await admin.auth.admin.createUser({
        email: target,
        email_confirm: true,
      });

      if (error || !data.user) {
        throw new Error("Confirmed fixture unavailable");
      }

      const user = await getClubInvitationAuthUserById({
        authUserId: data.user.id,
        email: target,
      });
      expect(user?.isEmailConfirmed).toBe(true);
      await expect(generateClubInvitationAuthLink({
        email: target,
        redirectTo,
        expectedAuthUserId: data.user.id,
      })).rejects.toMatchObject({
        code: "EXTERNAL_SERVICE",
      });
    });
  });

  it("invite再発行後の旧token拒否・新token確認・使用済みtoken拒否を検証する", async () => {
    await safeCheck(async () => {
      const target = email();
      const first = await admin.auth.admin.generateLink({
        type: "invite",
        email: target,
        options: {
          redirectTo,
        },
      });
      const second = await admin.auth.admin.generateLink({
        type: "invite",
        email: target,
        options: {
          redirectTo,
        },
      });

      if (first.error || second.error || !first.data.properties || !second.data.properties) {
        throw new Error("Invite fixtures unavailable");
      }

      const old = await verificationClient().auth.verifyOtp({
        token_hash: first.data.properties.hashed_token,
        type: "invite",
      });
      expect(Boolean(old.error)).toBe(true);
      const current = await verificationClient().auth.verifyOtp({
        token_hash: second.data.properties.hashed_token,
        type: "invite",
      });
      expect(Boolean(current.error)).toBe(false);
      expect(current.data.user?.id === second.data.user.id).toBe(true);
      const reused = await verificationClient().auth.verifyOtp({
        token_hash: second.data.properties.hashed_token,
        type: "invite",
      });
      expect(Boolean(reused.error)).toBe(true);
    });
  });

  // 【追加：F06粒度5】メールを送らずverifyを一度だけ開き、実際のLocationを検査する。
  it("実inviteリンクのimplicit fragmentから同一本人のSSR sessionを確立できる", async () => {
    await safeCheck(async () => {
      const invitation = await generateClubInvitationAuthLink({
        email: email(),
        redirectTo,
      });
      const verificationUrl = new URL(invitation.actionLink);

      if (
        verificationUrl.origin !== authUrl ||
        verificationUrl.pathname !== "/auth/v1/verify" ||
        verificationUrl.username ||
        verificationUrl.password
      ) {
        throw new Error("Local invite endpoint required");
      }

      const response = await fetch(verificationUrl, {
        redirect: "manual",
        referrerPolicy: "no-referrer",
      });
      const location = response.headers.get("location");

      if (![302, 303].includes(response.status) || !location) {
        throw new Error("Invite redirect unavailable");
      }

      const destination = new URL(location);
      const fragment = new URLSearchParams(destination.hash.slice(1));
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");

      expect(destination.origin === new URL(redirectTo).origin).toBe(true);
      expect(destination.pathname === "/welcome").toBe(true);
      expect(destination.search === new URL(redirectTo).search).toBe(true);
      expect(destination.searchParams.has("code")).toBe(false);
      expect(fragment.get("type") === "invite").toBe(true);
      expect(fragment.get("token_type") === "bearer").toBe(true);

      if (!accessToken || !refreshToken) {
        throw new Error("Implicit invitation tokens unavailable");
      }

      const prepared = await prepareClubInvitationSession({
        accessToken,
        refreshToken,
        currentCookies: [],
      });

      if (prepared.outcome !== "VERIFIED") {
        throw new Error("Verified invitation session unavailable");
      }

      // 実AMRが異なる環境では公開せず、認証方式の計画を再確認する。
      expect(prepared.session.user.id === invitation.user.id).toBe(true);
      expect(prepared.session.authenticationMethod === "otp").toBe(true);
      expect(prepared.cookies.length > 0).toBe(true);
    });
  });

  // 【追加：F06粒度5】inviteと異なり、パスワードログインはpassword AMRを証明する。
  it("実パスワードログインの検証済みAMRで既存アカウントを識別できる", async () => {
    await safeCheck(async () => {
      const target = email();
      const password = `Test-Aa1-${randomUUID()}`;
      const created = await admin.auth.admin.createUser({
        email: target,
        password,
        email_confirm: true,
      });

      if (created.error || !created.data.user) {
        throw new Error("Password fixture unavailable");
      }

      const client = verificationClient();
      const login = await client.auth.signInWithPassword({
        email: target,
        password,
      });

      if (login.error) {
        throw new Error("Password login unavailable");
      }

      const verified = await getVerifiedClubInvitationSession(client);
      expect(verified?.user.id === created.data.user.id).toBe(true);
      expect(verified?.authenticationMethod === "password").toBe(true);
    });
  });
});
