// app/(club-app)/club/revalidate-club-paths.ts
// Server ActionなどからNext.jsのキャッシュを再検証する。

//このファイルの関数はNext.js依存の再検証関数

//domain/club/club-revalidation-paths.tsはNext.jsに依存しない再検証対象のパスだけを生成し
//こちらにインポートしてキャッシュクリアする

import "server-only";

import {
  revalidatePath,
} from "next/cache";

import {
  getClubEventRevalidationPaths,
  getClubMemberRevalidationPaths,
  getClubNoticeRevalidationPaths,
  getClubSettingsRevalidationPaths,
} from "@/domain/club/club-revalidation-paths";


//URLパスを受け取り、キャッシュをクリアにする関数
function revalidatePaths(
  paths: readonly string[],
): void {
  for (const path of paths) {
    revalidatePath(path);
  }
}

//イベントを更新(追加、編集、削除)した時のrevalidatePath実行関数
export function revalidateClubEventPaths(
  clubSlug: string,
  eventId?: string,
): void {
  revalidatePaths(
    getClubEventRevalidationPaths(
      clubSlug,
      eventId,
    ),
  );
}

//お知らせを更新(追加、編集、削除)した時のrevalidatePath実行関数
export function revalidateClubNoticePaths(
  clubSlug: string,
  noticeId?: string,
): void {
  revalidatePaths(
    getClubNoticeRevalidationPaths(
      clubSlug,
      noticeId,
    ),
  );
}

//会員情報などが更新された際に(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
export function revalidateClubMemberPaths(
  clubSlug: string,
): void {
  revalidatePaths(
    getClubMemberRevalidationPaths(
      clubSlug,
    ),
  );
}

//ラインの通知グループを追加編集した時の（オーナー用）ライン通知グループ管理ページのrevalidatePath実行関数
export function revalidateClubSettingsPaths(
  clubSlug: string,
): void {
  revalidatePaths(
    getClubSettingsRevalidationPaths(
      clubSlug,
    ),
  );
}