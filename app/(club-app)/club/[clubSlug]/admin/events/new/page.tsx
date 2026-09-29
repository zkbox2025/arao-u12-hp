//admin/events/new/page.tsx
//イベント新規作成ページ

import {
  requireClubAppAdminAccess,//ログイン中のユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  type ClubEventActionState,//イベントのアクションステイト
  type ClubEventFormValues,//イベント送信時の値
} from "@/domain/club/event/event-form";
import {
  createInitialActionState,//初期値を作成する。新規登録画面はまっさらで編集画面はDBから取得した既存のデータが入る
} from "@/domain/shared/action-state";
import {
  formatClubDateOnly,// DBのUTC日時を、クラブ現地のYYYY-MM-DDへ変換する
} from "@/domain/shared/date-time/club-date-time";

import {
  ClubEventCreateForm,//イベント新規作成フォーム
} from "./ClubEventCreateForm";
import {
  createClubEventAction,//イベント新規作成アクションファイル
} from "./actions";
import {
  findEnabledClubLineTargets,//ライン通知の対象となるLINE通知先（グループ）を取得する関数
} from "@/src/infrastructure/prisma/repositories/club-line-target-repository";

type ClubEventNewPageProps = {
  params: Promise<{
    clubSlug: string;
  }>;
};

export default async function ClubEventNewPage({
  params,
}: ClubEventNewPageProps) {
  const { clubSlug } = await params;
  const access =
    await requireClubAppAdminAccess(
      clubSlug,
    );

  const lineTargets =
  await findEnabledClubLineTargets({//ライン通知の対象となるLINE通知先（グループ）を取得する関数
    clubId: access.club.id,
  });
  const today = formatClubDateOnly(// DBのUTC日時を、クラブ現地のYYYY-MM-DDへ変換する
    new Date(),
    access.club.timezone,
  );

  const initialValues://イベント新規作成フォームの初期値
    ClubEventFormValues = {
      title: "",
      genre: "PRACTICE",
      isAllDay: false,
      startDate: today,
      startTime: "",
      endDate: "",
      endTime: "",
      location: "",
      meetingDate: "",
      meetingTime: "",
      meetingLocation: "",
      content: "",
      belongings: "",
      notes: "",
      targetRoles: ["OWNER"],
      status: "DRAFT",
      shouldMarkAsUnread: false,
      shouldNotifyLine: false,
      lineTargetIds: [],
    };

  const initialState:
    ClubEventActionState =
      createInitialActionState(//初期値を作成する関数
        initialValues,
      );
  const action =
    createClubEventAction.bind(//イベント新規作成アクションに引数を事前に入れる
      null,
      access.club.slug,
    );
  const cancelHref =//キャンセルボタンを押した際の戻るページ（管理用月別イベント一覧ページへ）
    `/club/${encodeURIComponent(
      access.club.slug,
    )}/admin/events`;

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-medium text-blue-700">
          管理者ページ
        </p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900">
          イベント新規作成
        </h1>
      </header>

      <ClubEventCreateForm
         action={action}
         initialState={initialState}
         cancelHref={cancelHref}
         clubSlug={access.club.slug}
         lineTargets={lineTargets}
      />
    </section>
  );
}