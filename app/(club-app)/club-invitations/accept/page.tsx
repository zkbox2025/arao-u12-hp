// app/(club-app)/club-invitations/accept/page.tsx
//所属クラブが既にあり、新しい別のクラブの招待を受けたユーザーのための招待承諾ページ

import {
  InvitationAcceptanceScreen,//招待承諾画面（新規ユーザーと所属クラブがあるユーザーで表示が異なる）
} from "../../welcome/InvitationAcceptanceScreen";

export const dynamic = "force-dynamic";

//所属クラブが既にあり、新しい別のクラブの招待を受けたユーザーのための招待承諾ページ
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
  }>;
}) {
  const query = await searchParams;

  return InvitationAcceptanceScreen({//招待承諾画面（所属クラブが他にあるユーザーとしての表示（PW入力なしの承諾ボタン））
    mode: "existing",
    invalidLink: query.error !== undefined,
  });
}
