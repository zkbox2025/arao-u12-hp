// tests/mvp/member-fixture.ts
// 招待先とメール内URLをメモリ上で照合し、URLやtokenを例外へ含めない。

import {
  z // 所有fixture付きのE2Eケースを登録する関数
} from "zod";

const FAILURE = "F12_MEMBER_INVITATION_LINK_FAILED";
const mail = z.object({ // オブジェクトの入力schemaを定義するメソッド
  to: z.union([z.string(), z.array(z.string())]), // 許可する入力型をまとめるメソッド / 文字列の入力schemaを定義するメソッド / 配列の入力schemaを定義するメソッド
  text: z.string(), // 文字列の入力schemaを定義するメソッド
});
const payload = z.object({ // オブジェクトの入力schemaを定義するメソッド
  records: z.array(z.object({ // 配列の入力schemaを定義するメソッド / オブジェクトの入力schemaを定義するメソッド
    channel: z.enum(["resend", "line"]), // 許可値の入力schemaを定義するメソッド
    body: z.unknown(), // 未確定値の入力schemaを定義するメソッド
  })),
});

/**
 * 所有scopeに予約する、AppUser未作成の招待先メールを返す。
 */
export function invitationRecipientEmail(scopeId: string): string { // 所有scopeに予約した招待先メールを返す関数 / 文字列型
  if (!z.uuid().safeParse(scopeId).success) { // 入力の検証結果を返すメソッド / UUID書式の入力schemaを定義するメソッド
    throw new Error(FAILURE); // 秘密を含めない固定例外のコンストラクター
  }
  return `mvp-f12-${scopeId}-invitee@example.test`;
}

/**
 * ローカルstubの最新メールから、宛先・origin・clubSlugが一致する招待URLだけを返す。
 * 新規Authのverify URLと既存アカウント用URLは別々に照合する。返り値は記録しない。
 */
export function readInvitationLink( // 宛先・origin・slugが一致する招待URLだけを返す関数
  value: unknown, // 未確定値の型
  email: string, // 文字列型
  appOrigin: string, // 文字列型
  supabaseOrigin: string, // 文字列型
  clubSlug: string, // 文字列型
  kind: "new" | "existing",
): string { // 文字列型
  try {
    if (!/^mvp-f12-[a-z0-9-]+@example\.test$/u.test(email)) { // 正規表現との一致を検証するメソッド
      throw new Error(FAILURE); // 秘密を含めない固定例外のコンストラクター
    }
    const messages = payload.parse(value).records; // 入力構造を検証するメソッド
    let result: string | undefined; // 文字列型 / 未設定の型
    for (const record of messages) {
      if (record.channel !== "resend") {
        continue;
      }
      const message = mail.parse(record.body); // 入力構造を検証するメソッド
      const recipients = typeof message.to === "string" ? [message.to] : message.to;
      if (recipients.length !== 1 ||
        recipients[0] !== email) {
        continue;
      }
      const links = message.text.split("\n").filter( // 条件に一致する要素だけを選ぶメソッド / 文字列を区切りで分割するメソッド
        /**
         * 本文の独立したURL行だけを候補にする。
         */
        (line) => /^https?:\/\//u.test(line), // 所有する入力を受け取り操作・照合するコールバック / 正規表現との一致を検証するメソッド
      );
      if (links.length !== 1) {
        throw new Error(FAILURE); // 秘密を含めない固定例外のコンストラクター
      }
      const link = new URL(links[0]); // URLをメモリ内で解析するコンストラクター
      if (link.username ||
        link.password ||
        link.hash) {
        throw new Error(FAILURE); // 秘密を含めない固定例外のコンストラクター
      }
      const destination = kind === "new"
        ? new URL(link.searchParams.get("redirect_to") ?? "") // URLをメモリ内で解析するコンストラクター / query項目を取得するメソッド
        : link;
      if (
        destination.origin !== appOrigin ||
        Array.from(destination.searchParams.keys()).length !== 2 || // queryキーを列挙して追加項目を拒否する関数・メソッド / 列挙値を配列へ変換する関数 / query項目の名前を列挙するメソッド
        destination.pathname !== (kind === "new" ? "/welcome" : "/club-invitations/accept") ||
        destination.searchParams.getAll("clubSlug").length !== 1 || // 同じquery項目の値をすべて取得するメソッド
        destination.searchParams.get("clubSlug") !== clubSlug || // query項目を取得するメソッド
        destination.searchParams.getAll("token").length !== 1 || // 同じquery項目の値をすべて取得するメソッド
        !/^[a-zA-Z0-9_-]{43}$/u.test(destination.searchParams.get("token") ?? "") || // 正規表現との一致を検証するメソッド / query項目を取得するメソッド
        destination.username ||
        destination.password ||
        destination.hash
      ) {
        throw new Error(FAILURE); // 秘密を含めない固定例外のコンストラクター
      }
      if (kind === "new" &&
        (
          link.origin !== supabaseOrigin ||
          link.pathname !== "/auth/v1/verify" ||
          link.searchParams.getAll("type").length !== 1 || // 同じquery項目の値をすべて取得するメソッド
          link.searchParams.get("type") !== "invite" || // query項目を取得するメソッド
          link.searchParams.getAll("token").length !== 1 || // 同じquery項目の値をすべて取得するメソッド
          !link.searchParams.get("token") || // query項目を取得するメソッド
          link.searchParams.getAll("redirect_to").length !== 1 // 同じquery項目の値をすべて取得するメソッド
        )) {
        throw new Error(FAILURE); // 秘密を含めない固定例外のコンストラクター
      }
      result = link.toString(); // URL等を文字列にするメソッド
    }
    if (!result) {
      throw new Error(FAILURE); // 秘密を含めない固定例外のコンストラクター
    }
    return result;
  } catch {
    throw new Error(FAILURE); // 秘密を含めない固定例外のコンストラクター
  }
}
