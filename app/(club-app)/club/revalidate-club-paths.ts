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
  getClubAccountRevalidationPaths, // クラブアカウントページの再検証(revalidate)パスを生成する関数
  getClubEventRevalidationPaths,//イベントの再検証(revalidate)パスを生成する関数
  getClubMemberRevalidationPaths,//(オーナー用)メンバー管理・設定ページとマイページの再検証(revalidate)パスを生成する関数
  getClubNoticeRevalidationPaths,// お知らせの再検証パスを生成する
  getClubSettingsRevalidationPaths,//（オーナー用）ライン通知グループ管理ページの再検証(revalidate)パスを生成する関数
} from "@/domain/club/club-revalidation-paths";


//URLパスを受け取り、キャッシュをクリアにする関数
function revalidatePaths(
  paths: readonly string[],
): void {
  for (const path of paths) {
    revalidatePath(path);
  }
}

//イベントを更新(追加、編集、削除、既読、メモ保存・削除)した時のrevalidatePath実行関数
export function revalidateClubEventPaths(
  clubSlug: string,
  eventId?: string,
): void {
  revalidatePaths(//URLパスを受け取り、キャッシュをクリアにする関数
    getClubEventRevalidationPaths(//イベントの再検証(revalidate)パスを生成する関数
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
  revalidatePaths(//URLパスを受け取り、キャッシュをクリアにする関数
    getClubNoticeRevalidationPaths(// お知らせの再検証パスを生成する
      clubSlug,
      noticeId,
    ),
  );
}

//会員情報などが更新された際に(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
export function revalidateClubMemberPaths(
  clubSlug: string,
): void {
  revalidatePaths(//URLパスを受け取り、キャッシュをクリアにする関数
    getClubMemberRevalidationPaths(//(オーナー用)メンバー管理・設定ページとマイページの再検証(revalidate)パスを生成する関数
      clubSlug,
    ),
  );
}

//ラインの通知グループを追加編集した時の（オーナー用）ライン通知グループ管理ページのrevalidatePath実行関数
export function revalidateClubSettingsPaths(
  clubSlug: string,
): void {
  revalidatePaths(//URLパスを受け取り、キャッシュをクリアにする関数
    getClubSettingsRevalidationPaths(//（オーナー用）ライン通知グループ管理ページの再検証(revalidate)パスを生成する関数
      clubSlug,
    ),
  );
}

//クラブアカウント名の更新をした時の影響のあるクラブのページのrevalidatePath実行関数
// Repositoryが返した影響先だけを受け取り、全パス検証後に再検証する。
export function revalidateClubAccountNamePaths(
  affectedClubSlugs: readonly string[],
): void {
  const paths = [...new Set(affectedClubSlugs.flatMap((slug) =>
    getClubMemberRevalidationPaths(slug)))];//(オーナー用)メンバー管理・設定ページとマイページの再検証(revalidate)パスを生成する関数
  revalidatePaths(paths);//URLパスを受け取り、キャッシュをクリアにする関数
}

// 子どもの情報を変更したときのクラブのアカウント関連ページのrevalidatePath実行関数
export function revalidateClubAccountPaths(
  affectedClubSlugs: readonly string[],
): void {
  const paths = [...new Set(affectedClubSlugs.flatMap((slug) =>
    getClubAccountRevalidationPaths(slug)))];// クラブアカウントページの再検証(revalidate)パスを生成する関数
  revalidatePaths(paths);//URLパスを受け取り、キャッシュをクリアにする関数
}
