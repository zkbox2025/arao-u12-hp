//app/(club-app)/club/[clubSlug]/admin/notice/new/page.tsx
//お知らせ新規作成ページ


import {
  requireClubAppAdminAccess,//ログイン中のユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  type ClubNoticeActionState,//お知らせアクションステイト
  type ClubNoticeFormValues,//お知らせフォームの送信型
} from "@/domain/club/notice/notice-form";

import {
  createInitialActionState,//初期値を作成する。新規登録画面はまっさらで編集画面はDBから取得した既存のデータが入る
} from "@/domain/shared/action-state";

import {
  ClubNoticeCreateForm,//新規お知らせ作成フォーム
} from "./ClubNoticeCreateForm";

import {
  createClubNoticeAction,//新規お知らせ作成アクション
} from "./actions";

import {
  findEnabledClubLineTargets,//特定クラブの有効なライングループをDBから取得する関数（ID指定可能）
} from "@/src/infrastructure/prisma/repositories/club-line-target-repository";

type ClubNoticeNewPageProps = {
  params: Promise<{
    clubSlug: string;
  }>;
};

export default async function ClubNoticeNewPage({
  params,
}: ClubNoticeNewPageProps) {
  const {
    clubSlug,
  } = await params;

  const access =
    await requireClubAppAdminAccess(//ログイン中のユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
      clubSlug,
    );

  const initialValues:
    ClubNoticeFormValues = {
      title: "",
      content: "",
      status: "DRAFT",
      genre: "GENERAL",
      isPinned: false,
      targetRoles: [
      "OWNER",
      "COACH",
      "OFFICER",
      "MEMBER",
      ],
      requestReconfirmation:
        false,
      shouldNotifyLine://初期状態ではライン通知しない
      false,
      lineTargetIds: [],//初期状態ではライン通知先は選択しない
    };


const lineTargets =
  await findEnabledClubLineTargets({//特定クラブの有効なライングループをDBから取得する関数（ID指定可能）
    clubId: access.club.id,
  });


  const initialState:
    ClubNoticeActionState =
      createInitialActionState(//初期値を作成する。新規登録画面はまっさら（選択はデフォルト）で編集画面はDBから取得した既存のデータが入る
        initialValues,
      );

  const createAction =
    createClubNoticeAction.bind(//新規お知らせ作成アクションに引数を事前に入れておく
      null,
      access.club.slug,
    );

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-blue-700">
          管理者ページ
        </p>

        <h1 className="text-2xl font-bold text-neutral-900">
          お知らせ新規作成
        </h1>

        <p className="text-sm leading-6 text-neutral-600">
          会員へ公開するお知らせを作成します。
        </p>
      </header>

      <ClubNoticeCreateForm
        action={createAction}
        initialState={
          initialState
        }
        clubSlug={
          access.club.slug
        }
        lineTargets={lineTargets}
      />
    </section>
  );
}