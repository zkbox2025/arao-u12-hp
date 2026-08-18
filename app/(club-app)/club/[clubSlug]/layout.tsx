// app/(club-app)/club/[clubSlug]/layout.tsx
// クラブアプリのルートレイアウトでは、クラブのアプリ利用権限を確認する

import { notFound } from "next/navigation";

import {
  ClubFeatureUnavailableError,
} from "@/domain/club/plan-features";

import {
  requireClubAppAccess,
} from "@/app/(club-app)/club/club-app-authorization";

type ClubAppLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    clubSlug: string;
  }>;
};

export default async function ClubAppLayout({
  children,
  params,
}: ClubAppLayoutProps) {
  const { clubSlug } = await params;

  try {
    await requireClubAppAccess(clubSlug);
  } catch (error) {
    if (error instanceof ClubFeatureUnavailableError) {
      notFound();
    }

    throw error;
  }

  return children;
}