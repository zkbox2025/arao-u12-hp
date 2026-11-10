//domain/club/content/content-policy.ts
//イベントとお知らせの共通ポリシー



import type {
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  ContentStatus,//"DRAFT" | "PUBLISHED"
} from "@/types/prisma";

const CLUB_MEMBER_ROLES = [
  "OWNER",
  "COACH",
  "OFFICER",
  "MEMBER",
] as const satisfies readonly ClubMemberRole[];

/**
 * 公開対象を正規化する。
 *
 * OWNERは必ず含め、不正な値と重複を除去する。
 */
export function buildContentTargetRoles(
  values: readonly string[],
): ClubMemberRole[] {
  // 有効なロールだけを Set に入れる
  const selected = new Set(
    values.filter((v) => CLUB_MEMBER_ROLES.includes(v as ClubMemberRole))
  );

  return CLUB_MEMBER_ROLES.filter(
    (role) => role === "OWNER" || selected.has(role),
  );
}


/**
 * 既読日時が再確認基準日時より前なら未読。
 */
//未読イベントがあるかどうかの判定関数
export function isContentUnread(input: {
  readRequiredAt: Date | null;
  readAt: Date | null;
}): boolean {
  if (!input.readRequiredAt) {
    return false;
  }

  return (
    !input.readAt ||
    input.readAt.getTime() <
      input.readRequiredAt.getTime()
  );
}

//既存値
type ExistingPublicationState = {
  status: ContentStatus;//下書きか公開か
  firstPublishedAt: Date | null;//初公開日時
  readRequiredAt: Date | null;//未読開始日時
};

//引数の型
type BuildPublicationTimestampsInput = {
  existing://既存値
    | ExistingPublicationState
    | null;

  nextStatus: ContentStatus;
  now: Date;

  requestReconfirmation: boolean;//未読で公開するか

  policy: {
    requireReadOnFirstPublish: boolean;//初回公開時に未読で公開するか
    requireReadOnRepublish: boolean;//下書きから再公開時に未読で公開するか
  };
};

/**
 * 初回公開日時と未読開始日時を計算する関数。
 */
export function buildContentPublicationTimestamps(
  input:
    BuildPublicationTimestampsInput,
): {
  firstPublishedAt: Date | null;//初回公開日時
  readRequiredAt: Date | null;//未読開始日時
} {
  const {
    existing,
    nextStatus,
    now,
    policy,
  } = input;

  // 下書きでは既存の公開履歴を消さない。
  if (nextStatus === "DRAFT") {
    return {
      firstPublishedAt:
        existing?.firstPublishedAt ??
        null,
      readRequiredAt:
        existing?.readRequiredAt ??
        null,
    };
  }

  const isFirstPublication =//初公開とする条件
    existing?.firstPublishedAt == null;

  const isRepublishing =//下書きから公開にする条件
    existing != null &&
    existing.status === "DRAFT" &&
    existing.firstPublishedAt != null;

  let renewReadRequiredAt = false;//renewReadRequiredAtという箱を作る

  if (isFirstPublication) {//初回公開の場合
    renewReadRequiredAt =
      policy.requireReadOnFirstPublish;//初回公開時に未読で公開するか
  } else if (isRepublishing) {//下書きから公開の場合
    renewReadRequiredAt =
      policy.requireReadOnRepublish;//下書きから再公開時に未読で公開するか
  } else {//その他(すでに公開のものをそのまま上書き更新した場合)
    renewReadRequiredAt =
      input.requestReconfirmation;//未読で公開するかの判定
  }

  return {
    firstPublishedAt:
      existing?.firstPublishedAt ??
      now,

    readRequiredAt:
      renewReadRequiredAt
        ? now
        : existing?.readRequiredAt ??
          null,
  };
}