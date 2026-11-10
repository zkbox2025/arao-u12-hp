// src/infrastructure/security/token.ts
// 招待などで使用する秘密トークンの生成・ハッシュ化を行う。

import "server-only";

import {
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * 256bitの推測困難なトークンを生成する。
 *
 * 戻り値は招待URLなどで一度だけ使用し、
 * DBやログには保存しない。
 */
export function createSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * 生トークンをSHA-256でハッシュ化する。
 *
 * DBには生トークンではなく、この戻り値を保存する（ClubInvitationテーブルのトークンハッシュとして保存）。
 */
export function hashToken(
  rawToken: string,
): string {
  return createHash("sha256")
    .update(rawToken, "utf8")
    .digest("hex");
}