// app/(club-app)/club/[clubSlug]/admin/settings/line/page.tsx
// OWNER用LINE通知グループ管理ページ

import Link from "next/link";

import {
  requireClubAppOwnerAccess,//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  buildClubLineTargetInitialValues,//DBの通知先を編集フォームの初期値へ変換する関数
  type ClubLineTargetActionState,//ライン通知先アクションのステイト
} from "@/domain/club/line/line-target-form";

import type {
  ClubLineRegistrationCodeActionState,//ライン通知先アクションステイトの型（入力・エラー・戻り値）
} from "@/domain/club/line/line-registration-code";

import {
  getClubLineSettingsToastMessage,// LINE通知設定ページのURL識別子（成功）を固定メッセージ（通知設定を保存しました）へ変換する
} from "@/domain/club/line/line-settings-toast";

import {
  createInitialActionState,//新規登録画面はまっさらで編集画面はDBから取得した既存のデータ（value）が入る
} from "@/domain/shared/action-state";

import {
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
} from "@/domain/shared/date-time/club-date-time";

import {
  findClubLineSettingsForOwner,//OWNERのみ閲覧可能なライン通知先設定画面へ表示するLINE設定一式を取得する。
} from "@/src/infrastructure/prisma/repositories/club-line-setting-repository";

import {
  ClubLineRegistrationCodePanel,// LINEグループ登録コードの発行・コピー・登録待機UIファイル
} from "./ClubLineRegistrationCodePanel";

import {
  ClubLineTargetForm,//ライン通知先の変更フォーム
} from "./ClubLineTargetForm";

import {
  createClubLineRegistrationCodeAction,//LINEグループへ投稿する登録コードを発行する関数
  updateClubLineTargetAction,//OWNERが所属クラブのLINE通知先を更新する関数
} from "./actions";

export const dynamic =
  "force-dynamic";

  //ライン通知先設定ページの関数の引数の型
type ClubLineSettingsPageProps = {
  params: Promise<{
    clubSlug: string;
  }>;

  searchParams: Promise<{
    toast?:
      | string
      | string[];
    toastId?:
      | string
      | string[];
  }>;
};

//接続状態表示(Massaging APIとWebhook受付の接続状態を表示するのに使う)
function ConnectionStatus({
  label,//項目
  configured,//DBから取得したライン設定一式のデータに接続データがあるなら引数として代入する
}: {
  label: string;
  configured: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-sm font-bold text-neutral-900">
        {label}
      </p>

      <p
        className={
          configured
            ? "mt-2 text-sm font-bold text-green-700"
            : "mt-2 text-sm font-bold text-red-700"
        }
      >
        {configured
          ? "設定済み"
          : "未設定"}
      </p>
    </div>
  );
}

//ライン通知先設定ページのメイン関数
export default async function ClubLineSettingsPage({
  params,
  searchParams,
}: ClubLineSettingsPageProps) {
  const [
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([
    params,
    searchParams,
  ]);

  const access =
    await requireClubAppOwnerAccess(//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数
      resolvedParams.clubSlug,
    );

  const settings =
    await findClubLineSettingsForOwner({//OWNERのみ閲覧可能なライン通知先設定画面へ表示するLINE設定一式を取得する。
      clubId:
        access.club.id,
    });

  const toastMessage =
    getClubLineSettingsToastMessage(// LINE通知設定ページのURL識別子（成功）を固定メッセージ（通知設定を保存しました）へ変換する
      resolvedSearchParams.toast,
    );

    //URLのパラメータからトースト通知のIDを取得し、もし無ければデフォルトのID（line-settings-toast）を使う
  const toastId =
    typeof resolvedSearchParams
      .toastId === "string"
      ? resolvedSearchParams
          .toastId
      : "line-settings-toast";

      //クラブスラッグをURL仕様にする
  const encodedClubSlug =
    encodeURIComponent(
      access.club.slug,
    );

  const basePath =
    `/club/${encodedClubSlug}`;

  /*
   * /account実装後は、この1か所だけ
   * `${basePath}/account`へ差し替える。
   */
  const backHref =
    `${basePath}/admin/events`;

    //ライン通知先アクションステイト
  const registrationInitialState:
    ClubLineRegistrationCodeActionState =//ライン通知先アクションステイトの型（入力・エラー・戻り値）
      createInitialActionState(//新規登録画面はまっさらで編集画面はDBから取得した既存のデータ（value）が入る
        {},
      );

  const registrationAction =
    createClubLineRegistrationCodeAction.bind(//LINEグループへ投稿する登録コードを発行する関数へ先に引数の一部を代入する
      null,
      access.club.slug,
    );

    //expiresAt（有効期限）を日時データのような文字列にする関数
  const activeRegistrationExpiresAt =
    settings
      ?.activeRegistrationToken//findClubLineSettingsForOwnerの戻値のactiveRegistrationTokenの中のexpiresAt（有効期限）
      ?.expiresAt
      .toISOString() ??// 2. 日時データを "2026-10-02T14:56:00.000Z" のような世界標準の文字列に変換する
    null;//データがなければnullを返す

    //引数：接続済みかどうか
  const isConnected =
    settings?.isConnected ??
    false;

  return (
    <section className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium text-blue-700">
          OWNER専用ページ
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-neutral-900">
            LINE通知グループ管理
          </h1>

          <Link
            href={backHref}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            管理者用イベント一覧へ戻る
          </Link>
        </div>

        <p className="text-sm leading-6 text-neutral-600">
          LINE通知先の登録、通知対象、有効・無効を管理します。LINEグループIDや認証情報の完全な値は表示しません。
        </p>
      </header>

      {toastMessage ? (//保存しましたのトーストがあれば表示する
        <div
          key={toastId}
          role="status"
          aria-live="polite"
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm font-bold text-green-800"
        >
          {toastMessage}
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">
            接続状態
          </h2>

          <p className="mt-1 text-sm leading-6 text-neutral-600">
            秘密情報の値は表示せず、必要な設定が揃っているかだけを表示します。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionStatus
            label="Messaging API"
            configured={isConnected}
          />

          <ConnectionStatus
            label="Webhook受付"
            configured={isConnected}
          />
        </div>

        {!settings ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900"
          >
            このクラブのLINE接続設定がありません。初期設定の完了後に登録コードを発行してください。
          </p>
        ) : null}
      </section>

      <ClubLineRegistrationCodePanel
        action={registrationAction}
        initialState={
          registrationInitialState
        }
        canIssueCode={isConnected}
        activeRegistrationExpiresAt={
          activeRegistrationExpiresAt
        }
        timeZone={
          access.club.timezone
        }
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">
            登録済み通知先
          </h2>

          <p className="mt-1 text-sm leading-6 text-neutral-600">
            新しく登録された通知先は必ず無効です。通知先名と対象を確認した後に有効化してください。
          </p>
        </div>

        {settings &&
        settings.targets.length > 0 ? (
          <div className="space-y-5">
            {settings.targets.map(
              (target) => {
                const initialState:
                  ClubLineTargetActionState =//ライン通知先アクションのステイト
                    createInitialActionState(//新規登録画面はまっさらで編集画面はDBから取得した既存のデータ（value）が入る
                      buildClubLineTargetInitialValues(//DBの通知先を編集フォームの初期値へ変換する関数
                        target,
                      ),
                    );

                const updateAction =
                  updateClubLineTargetAction.bind(//OWNERが所属クラブのLINE通知先を更新する関数の引数を一部代入する
                    null,
                    access.club.slug,
                    target.id,
                  );

                return (
                  <ClubLineTargetForm//ライン通知先の変更フォーム
                    key={target.id}
                    targetId={target.id}
                    createdAtLabel={
                      formatClubDateTime(
                        target.createdAt,
                        access.club
                          .timezone,
                      )
                    }
                    action={updateAction}
                    initialState={
                      initialState
                    }
                  />
                );
              },
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center">
            <p className="text-sm font-bold text-neutral-800">
              登録済みのLINE通知先はありません。
            </p>

            <p className="mt-2 text-sm leading-6 text-neutral-600">
              登録コードをLINEグループへ投稿すると、ここに無効状態で追加されます。
            </p>
          </div>
        )}
      </section>
    </section>
  );
}
