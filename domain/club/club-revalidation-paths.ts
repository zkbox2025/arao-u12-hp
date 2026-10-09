// domain/club/club-revalidation-paths.ts
// Next.jsに依存せず、再検証対象のパスだけを生成する。

//イベント、お知らせ、(オーナー用)メンバー管理・設定ページ
// マイページ、（オーナー用）ライン通知グループ管理ページ
//の再検証(revalidate)パスの生成


//クラブスラッグの正規の型を定義する
const CLUB_SLUG_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

//IDの正規の型を定義する
const ID_PATTERN =
  /^[A-Za-z0-9_-]+$/;

  //クラブスラッグが誤った形ならエラーを投げる
function assertClubSlug(
  clubSlug: string,
): void {
  if (
    !CLUB_SLUG_PATTERN.test(clubSlug)
  ) {
    throw new RangeError(
      "clubSlugが正しくありません。",
    );
  }
}

//IDが誤った形だった場合、エラーを投げる
function assertId(
  id: string,
  name: string,
): void {
  if (!ID_PATTERN.test(id)) {
    throw new RangeError(
      `${name}が正しくありません。`,
    );
  }
}

//クラブスラッグが正しい形か確認した上で、pathを作成する関数
function getClubBasePath(
  clubSlug: string,
): string {
  assertClubSlug(clubSlug);

  return `/club/${clubSlug}`;
}

//イベントの再検証(revalidate)パスを生成する関数
export function getClubEventRevalidationPaths(
  clubSlug: string,
  eventId?: string,
): string[] {
  const basePath =
    getClubBasePath(clubSlug);

  const paths = [
    `${basePath}/events`,
    `${basePath}/events/list`,
    `${basePath}/admin/events`,
    `${basePath}/admin/events/list`,
  ];

  if (eventId !== undefined) {
    assertId(eventId, "eventId");

    paths.push(
      `${basePath}/events/${eventId}`,
      `${basePath}/admin/events/${eventId}/edit`,
    );
  }

  return paths;
}

//お知らせの再検証(revalidate)パスを生成する関数
/**
 * お知らせ更新後に再検証するパスを生成する。
 *
 * noticeIdがない場合は一覧だけ、
 * noticeIdがある場合は一覧と詳細・編集ページを返す。
 */
// お知らせの再検証パスを生成する
export function getClubNoticeRevalidationPaths(
  clubSlug: string,
  noticeId?: string,
): string[] {
  /*
   * getClubBasePath内で
   * clubSlugの形式を検証する。
   */
  const basePath =
    getClubBasePath(clubSlug);

  const paths = [
    `${basePath}/notice`,
    `${basePath}/admin/notice`,
  ];

  /*
   * 空文字も不正値として検証するため、
   * if (!noticeId)ではなく
   * undefinedだけを判定する。
   */
  if (noticeId !== undefined) {
    assertId(
      noticeId,
      "noticeId",
    );

    paths.push(
      `${basePath}/notice/${noticeId}`,
      `${basePath}/admin/notice/${noticeId}/edit`,
    );
  }

  return paths;
}


//(オーナー用)メンバー管理・設定ページとマイページの再検証(revalidate)パスを生成する関数
export function getClubMemberRevalidationPaths(
  clubSlug: string,
): string[] {
  const basePath =
    getClubBasePath(clubSlug);

  return [
    `${basePath}/admin/members`,
    `${basePath}/account`,
  ];
}

//（オーナー用）ライン通知グループ管理ページの再検証(revalidate)パスを生成する関数
export function getClubSettingsRevalidationPaths(
  clubSlug: string,
): string[] {
  const basePath =
    getClubBasePath(clubSlug);

  return [
    `${basePath}/admin/settings/line`,
  ];
}