// app/(club-app)/club/[clubSlug]/page.tsx
//クラブログインページからクラブアプリに遷移する際に、会員用月別イベントページに遷移する仕様にしているが
// 万が一変更前のapp/(club-app)/club/[clubSlug]/pageに遷移した場合のリダイレクト保険

import {
  redirect,
} from "next/navigation";

import {
  requireClubAppAccess,
} from "@/app/(club-app)/club/club-app-authorization";

type Props = {
  params: Promise<{
    clubSlug: string;
  }>;
};

export default async function ClubTopPage({
  params,
}: Props) {
  const {
    clubSlug,
  } = await params;

  const context =
    await requireClubAppAccess(
      clubSlug,
    );

  redirect(
    `/club/${encodeURIComponent(
      context.club.slug,
    )}/events`,
  );
}