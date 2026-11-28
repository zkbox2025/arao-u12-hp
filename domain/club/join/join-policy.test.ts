// domain/club/join/join-policy.test.ts
// 参加リンク・申請の期限、数字、状態の判定(純粋関数)の単体テスト。

import { describe, expect, it } from "vitest"; // テストの枠組み(説明・検証)

import {
  CLUB_JOIN_CODE_TTL_MILLISECONDS, // 数字の有効期間(7日)の定数
  CLUB_JOIN_CONFIRMATION_TTL_MILLISECONDS, // メール確認の期限(24時間)の定数
  CLUB_JOIN_LINK_TTL_MILLISECONDS, // 参加リンクの有効期間(30日)の定数
  CLUB_JOIN_NAME_MAX_LENGTH, // 名前の文字数の上限の定数
  CLUB_JOIN_OPEN_REQUEST_LIMIT_PER_LINK, // 進行中の申請の上限(300)の定数
  createClubJoinCodeExpiry, // 数字の期限を作る関数
  createClubJoinConfirmationExpiry, // メール確認の期限を作る関数
  createClubJoinLinkExpiry, // 参加リンクの有効期限を作る関数
  evaluateClubJoinConfirmation, // メール確認のボタンの判定をする関数
  generateClubJoinVerificationCode, // 6桁の数字を作る関数
  isClubJoinLinkUsable, // 参加リンクが使えるかを判定する関数
  isClubJoinTokenHash, // トークンのハッシュの形式を検査する関数
  isClubJoinVerificationCode, // 数字の形式を検査する関数
  resolveClubJoinRequestStatus, // 時刻を考慮した申請の状態を決める関数
  validateClubJoinApplicant, // 申請者の入力を検証・正規化する関数
  type ClubJoinRequestState, // 申請の状態の型
} from "./join-policy";

const now = new Date("2026-12-01T03:00:00.000Z"); // 試験の基準の日時

/**
 * 基準の日時から、指定のミリ秒だけ後の日時を作る。
 * @param milliseconds ずらすミリ秒(負なら前)。
 * @returns ずらした日時。
 */
function later(milliseconds: number): Date {
  return new Date(now.getTime() + milliseconds); // 日時を作る標準のDateコンストラクタ
}

/**
 * 申請の状態の試験データを作る。
 * @param overrides 上書きする項目。
 * @returns 申請の状態。
 */
function request(overrides: Partial<ClubJoinRequestState>): ClubJoinRequestState {
  return {
    status: "AWAITING_EMAIL_CONFIRMATION",
    confirmationExpiresAt: later(60_000),
    codeExpiresAt: null,
    ...overrides,
  };
}

describe("参加リンクの定数と期限", () => { // 決定した値(7日・30日・24時間・300件)の確認
  it("決定した値を持つ", () => {
    expect(CLUB_JOIN_LINK_TTL_MILLISECONDS).toBe(30 * 24 * 60 * 60 * 1_000);
    expect(CLUB_JOIN_CONFIRMATION_TTL_MILLISECONDS).toBe(24 * 60 * 60 * 1_000);
    expect(CLUB_JOIN_CODE_TTL_MILLISECONDS).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(CLUB_JOIN_OPEN_REQUEST_LIMIT_PER_LINK).toBe(300);
  });

  it("期限を、基準の日時から、決まった時間だけ後に作る", () => {
    expect(createClubJoinLinkExpiry(now)).toEqual(later(CLUB_JOIN_LINK_TTL_MILLISECONDS));
    expect(createClubJoinConfirmationExpiry(now)).toEqual(
      later(CLUB_JOIN_CONFIRMATION_TTL_MILLISECONDS),
    );
    expect(createClubJoinCodeExpiry(now)).toEqual(later(CLUB_JOIN_CODE_TTL_MILLISECONDS));
  });
});

describe("数字の生成と形式", () => { // 6桁(先頭0を含む)の数字
  it("乱数の値を、6桁に、0で埋める", () => {
    expect(generateClubJoinVerificationCode(() => 0)).toBe("000000");
    expect(generateClubJoinVerificationCode(() => 42)).toBe("000042");
    expect(generateClubJoinVerificationCode(() => 999_999)).toBe("999999");
  });

  it("乱数の関数へ、0以上100万未満の範囲を渡す", () => {
    let received: [number, number] | null = null;
    generateClubJoinVerificationCode((min, max) => {
      received = [min, max];
      return 1;
    });
    expect(received).toEqual([0, 1_000_000]);
  });

  it("形式は、6桁の10進数だけを許す", () => {
    expect(isClubJoinVerificationCode("012345")).toBe(true);
    for (const value of ["12345", "1234567", "12345a", "", " 12345", "12345\n"]) {
      expect(isClubJoinVerificationCode(value)).toBe(false);
    }
  });
});

describe("トークンのハッシュの形式", () => { // SHA-256の小文字16進(64文字)
  it("64桁の小文字16進だけを許す", () => {
    expect(isClubJoinTokenHash("a".repeat(64))).toBe(true);
    for (const value of ["A".repeat(64), "a".repeat(63), "a".repeat(65), "g".repeat(64), ""]) {
      expect(isClubJoinTokenHash(value)).toBe(false);
    }
  });
});

describe("参加リンクが使えるかの判定", () => { // 期限内かつ未無効化
  it("期限内で、無効化されていなければ、使える", () => {
    expect(isClubJoinLinkUsable({ expiresAt: later(1), revokedAt: null }, now)).toBe(true);
  });

  it("期限ちょうど・期限後は、使えない", () => {
    expect(isClubJoinLinkUsable({ expiresAt: now, revokedAt: null }, now)).toBe(false);
    expect(isClubJoinLinkUsable({ expiresAt: later(-1), revokedAt: null }, now)).toBe(false);
  });

  it("無効化されていれば、期限内でも、使えない", () => {
    expect(isClubJoinLinkUsable({ expiresAt: later(1_000), revokedAt: later(-1) }, now)).toBe(
      false,
    );
  });
});

describe("申請者の入力の検証と正規化", () => { // メールの正規化・名前の長さ・制御文字
  it("メールを正規化し、名前の前後の空白を除く", () => {
    const result = validateClubJoinApplicant({
      email: "  Parent@Example.TEST ",
      name: "  山田 花子  ",
    });
    expect(result).toEqual({
      success: true,
      data: { email: "parent@example.test", name: "山田 花子" },
    });
  });

  it("不正な入力は、理由を含まずに、失敗する", () => {
    const cases = [
      { email: "not-an-email", name: "山田" },
      { email: "", name: "山田" },
      { email: "a@example.test", name: "   " },
      { email: "a@example.test", name: "あ".repeat(CLUB_JOIN_NAME_MAX_LENGTH + 1) },
      { email: "a@example.test", name: "山田\u0000" },
      { email: "a@example.test", name: "山田\n花子" },
      { email: `${"a".repeat(250)}@example.test`, name: "山田" },
    ];
    for (const input of cases) {
      expect(validateClubJoinApplicant(input)).toEqual({ success: false });
    }
  });

  it("名前は、上限ちょうどまで許す", () => {
    const name = "あ".repeat(CLUB_JOIN_NAME_MAX_LENGTH);
    expect(validateClubJoinApplicant({ email: "a@example.test", name }).success).toBe(true);
  });
});

describe("メール確認のボタンの判定", () => { // 発行・再表示・拒否
  it("メール確認待ちで期限内なら、数字を発行する", () => {
    expect(evaluateClubJoinConfirmation(request({}), now)).toEqual({ action: "ISSUE" });
  });

  it("メール確認の期限ちょうど・期限後は、拒否する", () => {
    for (const confirmationExpiresAt of [now, later(-1)]) {
      expect(evaluateClubJoinConfirmation(request({ confirmationExpiresAt }), now)).toEqual({
        action: "REJECT",
        violation: "CONFIRMATION_EXPIRED",
      });
    }
  });

  it("承認待ちで、数字が期限内なら、同じ数字を再表示する(冪等)", () => {
    const state = request({ status: "AWAITING_APPROVAL", codeExpiresAt: later(1) });
    expect(evaluateClubJoinConfirmation(state, now)).toEqual({ action: "REUSE" });
  });

  it("承認待ちで、数字の期限が過ぎていれば、拒否する", () => {
    for (const codeExpiresAt of [now, later(-1), null]) {
      const state = request({ status: "AWAITING_APPROVAL", codeExpiresAt });
      expect(evaluateClubJoinConfirmation(state, now)).toEqual({
        action: "REJECT",
        violation: "CODE_EXPIRED",
      });
    }
  });

  it("承認済み・却下・期限切れの申請は、拒否する", () => {
    for (const status of ["APPROVED", "REJECTED", "EXPIRED"] as const) {
      expect(evaluateClubJoinConfirmation(request({ status }), now)).toEqual({
        action: "REJECT",
        violation: "NOT_AWAITING_CONFIRMATION",
      });
    }
  });
});

describe("画面に表示する申請の状態", () => { // 整理(Cron)の前でも、期限切れとして扱う
  it("期限内の進行中の申請は、そのままの状態", () => {
    expect(resolveClubJoinRequestStatus(request({}), now)).toBe("AWAITING_EMAIL_CONFIRMATION");
    expect(
      resolveClubJoinRequestStatus(
        request({ status: "AWAITING_APPROVAL", codeExpiresAt: later(1) }),
        now,
      ),
    ).toBe("AWAITING_APPROVAL");
  });

  it("期限が過ぎた進行中の申請は、期限切れ", () => {
    expect(
      resolveClubJoinRequestStatus(request({ confirmationExpiresAt: now }), now),
    ).toBe("EXPIRED");
    expect(
      resolveClubJoinRequestStatus(
        request({ status: "AWAITING_APPROVAL", codeExpiresAt: now }),
        now,
      ),
    ).toBe("EXPIRED");
  });

  it("終わった申請は、そのままの状態", () => {
    for (const status of ["APPROVED", "REJECTED", "EXPIRED"] as const) {
      expect(resolveClubJoinRequestStatus(request({ status }), now)).toBe(status);
    }
  });
});
