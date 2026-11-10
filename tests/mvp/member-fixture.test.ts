// tests/mvp/member-fixture.test.ts
// 架空メールとURLだけで招待リンクの所有照合と秘密非出力を検証する。

import {
  expect, // 期待値を生成する関数
  it // 単体ケースを登録する関数
} from "vitest";
import {
  invitationRecipientEmail, // 所有scopeに予約した招待先メールを返す関数
  readInvitationLink // 宛先・origin・slugが一致する招待URLだけを返す関数
} from "./member-fixture";

const SCOPE = "12345678-1234-4234-8234-123456789abc";
const APP = "https://127.0.0.1:3443";
const AUTH = "http://127.0.0.1:54321";
const SLUG = `mvp-f12-${SCOPE}-a`;
const PRIVATE = "FAKE_PRIVATE_TOKEN_".repeat(3).slice(0, 43); // 架空の秘密文字列を試験用の長さへ繰り返すメソッド / 架空tokenを仕様どおり43文字へ切り出すメソッド

/**
 * 本番メール本文と同じ独立したURL行を持つ、架空のstub応答を作る。
 */
function message(link: string, // 架空のメール記録を持つstub応答を作る関数 / 文字列型
  email = invitationRecipientEmail(SCOPE)): unknown { // 所有scopeに予約した招待先メールを返す関数 / 未確定値の型
  return {
    records: [{
      channel: "resend",
      body: {
        to: email,
        text: `案内\n${link}\n期限`
      }
    }]
  };
}

/**
 * 実装と同じqueryキーだけで、架空の既存アカウント向けURLを作る。
 */
function destination(): URL { // 架空の招待先URLを作る関数 / 解析済みURLの型
  const url = new URL("/club-invitations/accept", APP); // URLをメモリ内で解析するコンストラクター
  url.searchParams.set("clubSlug", SLUG); // query項目を単一値へ設定するメソッド
  url.searchParams.set("token", PRIVATE); // query項目を単一値へ設定するメソッド
  return url;
}

it("所有scopeの予約メールと、単一宛先の最新ローカル案内だけを返す", // 単体ケースを登録する関数
  /**
   * 架空の2通から最新の案内を選び、入力を変更しない。
   */
  () => { // 所有する入力を受け取り操作・照合するコールバック
    const email = invitationRecipientEmail(SCOPE); // 所有scopeに予約した招待先メールを返す関数
    expect(email).toBe(`mvp-f12-${SCOPE}-invitee@example.test`); // 値の一致を検証するメソッド / 期待値を生成する関数
    const url = destination(); // 架空の招待先URLを作る関数
    const value = message(url.toString()); // 架空のメール記録を持つstub応答を作る関数 / URL等を文字列にするメソッド
    expect(readInvitationLink(value, email, APP, AUTH, SLUG, "existing") === url.toString()).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 宛先・origin・slugが一致する招待URLだけを返す関数 / URL等を文字列にするメソッド
    const verify = new URL("/auth/v1/verify", AUTH); // URLをメモリ内で解析するコンストラクター
    verify.searchParams.set("type", "invite"); // query項目を単一値へ設定するメソッド
    verify.searchParams.set("token", PRIVATE); // query項目を単一値へ設定するメソッド
    url.pathname = "/welcome";
    verify.searchParams.set("redirect_to", url.toString()); // query項目を単一値へ設定するメソッド / URL等を文字列にするメソッド
    expect(readInvitationLink(message(verify.toString()), email, APP, AUTH, SLUG, "new") === verify.toString()).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 宛先・origin・slugが一致する招待URLだけを返す関数 / 架空のメール記録を持つstub応答を作る関数 / URL等を文字列にするメソッド
  },
);

it.each(["origin", "slug", "duplicate", "empty-token", "credentials", "fragment", "recipient", "multiple", "unparseable", "extra-query"])( // 入力ごとの試験ケースを登録する関数 / 入力ごとの試験を登録するメソッド
  "%sの不正な案内ではURL・token・causeを公開しない",
  /**
   * 秘密を含む不正入力は必ず固定文で拒否されることを確認する。
   */
  (mode) => { // 所有する入力を受け取り操作・照合するコールバック
    const url = destination(); // 架空の招待先URLを作る関数
    if (mode === "origin") url.hostname = "remote.invalid";
    if (mode === "slug") url.searchParams.set("clubSlug", "other"); // query項目を単一値へ設定するメソッド
    if (mode === "duplicate") url.searchParams.append("token", PRIVATE); // 重複したquery項目を追加するメソッド
    if (mode === "empty-token") url.searchParams.set("token", ""); // query項目を単一値へ設定するメソッド
    if (mode === "credentials") url.username = PRIVATE;
    if (mode === "fragment") url.hash = PRIVATE;
    if (mode === "extra-query") url.searchParams.set("clubId", PRIVATE); // queryを改ざんするメソッド / query項目を単一値へ設定するメソッド
    let value = message(url.toString(), mode === "recipient" ? "other@example.test" : undefined); // 架空のメール記録を持つstub応答を作る関数 / URL等を文字列にするメソッド
    if (mode === "multiple") value = message(url.toString() + "\n" + url.toString()); // 架空のメール記録を持つstub応答を作る関数 / URL等を文字列にするメソッド
    if (mode === "unparseable") value = {
      records: PRIVATE
    };
    let caught: unknown; // 未確定値の型
    try {
      readInvitationLink(value, invitationRecipientEmail(SCOPE), APP, AUTH, SLUG, "existing"); // 宛先・origin・slugが一致する招待URLだけを返す関数 / 所有scopeに予約した招待先メールを返す関数
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof Error).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(String(caught)).toBe("Error: F12_MEMBER_INVITATION_LINK_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 例外を文字列へ変換する関数
    expect((caught as Error).cause).toBeUndefined(); // 未設定であることを検証するメソッド / 期待値を生成する関数 / 型を明示するアサーション / 例外の型
  },
);

it.each(["origin", "path", "type", "redirect", "duplicate"])( // 入力ごとの試験ケースを登録する関数 / 入力ごとの試験を登録するメソッド
  "新規Authの%s不一致を固定文で拒否する",
  /**
   * Authリンクの送信先と戻り先の両方をローカルの実行契約へ限定する。
   */
  (mode) => { // 所有する入力を受け取り操作・照合するコールバック
    const target = destination(); // 架空の招待先URLを作る関数
    target.pathname = "/welcome";
    const link = new URL("/auth/v1/verify", AUTH); // URLをメモリ内で解析するコンストラクター
    link.searchParams.set("type", "invite"); // query項目を単一値へ設定するメソッド
    link.searchParams.set("token", PRIVATE); // query項目を単一値へ設定するメソッド
    link.searchParams.set("redirect_to", target.toString()); // query項目を単一値へ設定するメソッド / URL等を文字列にするメソッド
    if (mode === "origin") link.hostname = "remote.invalid";
    if (mode === "path") link.pathname = "/auth/v1/token";
    if (mode === "type") link.searchParams.set("type", "recovery"); // query項目を単一値へ設定するメソッド
    if (mode === "redirect") link.searchParams.set("redirect_to", PRIVATE); // query項目を単一値へ設定するメソッド
    if (mode === "duplicate") link.searchParams.append("redirect_to", target.toString()); // 重複したquery項目を追加するメソッド / URL等を文字列にするメソッド
    expect( // 期待値を生成する関数
      /**
       * 不正URLの値そのものは期待値へ渡さず、固定例外だけを照合する。
       */
      () => readInvitationLink(message(link.toString()), invitationRecipientEmail(SCOPE), APP, AUTH, SLUG, "new"), // 所有する入力を受け取り操作・照合するコールバック / 宛先・origin・slugが一致する招待URLだけを返す関数 / 架空のメール記録を持つstub応答を作る関数 / URL等を文字列にするメソッド / 所有scopeに予約した招待先メールを返す関数
    ).toThrow("F12_MEMBER_INVITATION_LINK_FAILED"); // 固定例外による拒否を検証するメソッド
  },
);

it("不正scopeをURLやメールへ組み込まない", // 単体ケースを登録する関数
  /**
   * 予約先名の生成前に入力のUUIDを確認する。
   */
  () => { // 所有する入力を受け取り操作・照合するコールバック
    expect( // 期待値を生成する関数
      /**
       * scopeへパスや秘密を混入した入力を渡す。
       */
      () => invitationRecipientEmail(PRIVATE), // 所有する入力を受け取り操作・照合するコールバック / 所有scopeに予約した招待先メールを返す関数
    ).toThrow("F12_MEMBER_INVITATION_LINK_FAILED"); // 固定例外による拒否を検証するメソッド
  },
);

it("同じ宛先の2通から最後の案内だけを選ぶ", // 単体ケースを登録する関数
  /**
   * 再送前後のURLを同じstub記録へ入れ、旧リンクを選ばないことを確認する。
   */
  () => { // 所有する入力を受け取り操作・照合するコールバック
    const first = destination(); // 架空の招待先URLを作る関数
    const last = destination(); // 架空の招待先URLを作る関数
    last.searchParams.set("token", "b".repeat(43)); // query項目を単一値へ設定するメソッド / 架空の秘密文字列を試験用の長さへ繰り返すメソッド
    const email = invitationRecipientEmail(SCOPE); // 所有scopeに予約した招待先メールを返す関数
    const value = {
      records: [
        {
          channel: "resend",
          body: {
            to: [email],
            text: first.toString() // URL等を文字列にするメソッド
          }
        },
        {
          channel: "resend",
          body: {
            to: [email],
            text: last.toString() // URL等を文字列にするメソッド
          }
        },
      ]
    };
    expect(readInvitationLink(value, email, APP, AUTH, SLUG, "existing") === last.toString()).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数 / 宛先・origin・slugが一致する招待URLだけを返す関数 / URL等を文字列にするメソッド
  },
);
