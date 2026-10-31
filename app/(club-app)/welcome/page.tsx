// app/(club-app)/welcome/page.tsx
//所属クラブがない新規ユーザーのための初回PW設定ページ

import {
  InvitationAcceptanceScreen,//招待承諾画面のファイル（新規ユーザーと所属クラブがあるユーザーで表示が異なる）
} from "./InvitationAcceptanceScreen";

export const dynamic = "force-dynamic";

//所属クラブがない新規ユーザーのための初回PW設定ページ
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
  }>;
}) {
  const query = await searchParams;

  return InvitationAcceptanceScreen({//招待承諾画面のファイル（新規ユーザーとして表示）
    mode: "welcome",
    invalidLink: query.error !== undefined,
  });
}
