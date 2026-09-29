// src/application/cron/cron-authorization.ts
// Cron Route Handler共通認証（合言葉：CRON_SECRETが合うかの検証を行う）

import "server-only";

import {
  timingSafeEqual,
} from "node:crypto";

/**
 * 【追加】定期実行されるプログラム（Cronジョブ）からのリクエストが、本物（許可されたもの）かどうかを安全に確認する
 * Vercel Cronから送られる
 * Authorization: Bearer <CRON_SECRET>
 * を検証する。
 */
export function isAuthorizedCronRequest(
  request: Request,
): boolean {
  const cronSecret =
    process.env
      .CRON_SECRET
      ?.trim();

  if (!cronSecret) {
    return false;
  }

  // 相手が送ってきた「提示された合言葉」を取得する（無ければ空文字）
  const actualAuthorization =
    request.headers.get(
      "authorization",
    ) ?? "";

    // 環境変数に設定されたある正しい「Bearer 【合言葉】」という形を作る
  const expectedAuthorization =
    `Bearer ${cronSecret}`;

    // 安全に比較するために、お互いを「Buffer」というバイトデータに変換する
  const actualBuffer =
    Buffer.from(
      actualAuthorization,
      "utf8",
    );

  const expectedBuffer =
    Buffer.from(
      expectedAuthorization,
      "utf8",
    );

    //そもそも文字の長さが違ったら、その時点で拒否（false）
  if (
    actualBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }
// 2つのデータ（環境変数と合言葉）を「時間を一定に保つ安全な方法」で比較して、一致するかどうかを返す
  return timingSafeEqual(
    actualBuffer,
    expectedBuffer,
  );
}