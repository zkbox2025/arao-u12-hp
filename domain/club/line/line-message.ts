// domain/club/line/line-message.ts
//お知らせ・イベント共通LINE通知本文生成

type ClubContentLineMessageInput = {
  clubName: string;
  contentName:
    | "お知らせ"
    | "イベント";
  title: string;
  detailUrl: string;
};

//お知らせ・イベント共通LINE通知本文生成関数
export function buildClubContentLineMessage(
  input:
    ClubContentLineMessageInput,
): string {
  const clubName =
    input.clubName
      .replace(/\s+/gu, " ")
      .trim();

  const title =
    input.title
      .replace(/\s+/gu, " ")
      .trim();

  const url =
    new URL(input.detailUrl);

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    throw new RangeError(
      `${input.contentName}URLが正しくありません。`,
    );
  }
  
  return [
    `【${clubName}】`,
    "",
    `新しい${input.contentName}があります。`,
    "",
    title,
    "",
    "詳細：",
    url.toString(),
  ].join("\n");//改行で分ける
}

// お知らせ側の既存呼び出しを壊さない薄いラッパー
export function buildClubNoticeLineMessage(
  input: {
    clubName: string;
    noticeTitle: string;
    detailUrl: string;
  },
): string {
  return buildClubContentLineMessage({
    clubName: input.clubName,
    contentName: "お知らせ",
    title: input.noticeTitle,
    detailUrl: input.detailUrl,
  });
}

// イベント用の既存呼び出しを壊さない薄いラッパー
export function buildClubEventLineMessage(
  input: {
    clubName: string;
    eventTitle: string;
    detailUrl: string;
  },
): string {
  return buildClubContentLineMessage({
    clubName: input.clubName,
    contentName: "イベント",
    title: input.eventTitle,
    detailUrl: input.detailUrl,
  });
}