// app/(club-app)/club/[clubSlug]/admin/members/join-link-actions.ts
// OWNERが、参加リンク(URLとQRコード)を発行・無効化するServer Action。
// 設計:docs/implementation/phases/member-join-link-plan.md(5.1)

"use server";

import { notFound, unstable_rethrow } from "next/navigation"; // 404表示の関数 / 画面遷移用の例外を再送出する関数

import {
  requireClubAppOwnerAccess, // OWNERかつアプリが使えるクラブかを、サーバーで確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  revalidateClubMemberPaths, // メンバー管理ページなどのキャッシュを再検証する関数
} from "@/app/(club-app)/club/revalidate-club-paths";
import {
  buildClubJoinQrShape, // URLからQRコードの図形(SVGのパス)を作る関数
  buildClubJoinUrl, // 参加リンクのURLを作る関数
  resolveClubJoinOrigin, // URLのoriginを決める関数
  type ClubJoinQrShape, // QRコードの図形の型
} from "@/domain/club/join/join-link-url";
import type {
  ActionState, // Server Actionの結果(状態)の型
} from "@/domain/shared/action-state";
import {
  formatClubDateTime, // 日時をクラブのタイムゾーンの表示に変える関数
} from "@/domain/shared/date-time/club-date-time";
import {
  createRequestId, // 二重送信防止のrequestIdを作る関数
  isRequestId, // requestIdの形式を検査する関数
} from "@/domain/shared/request-id";
import { prisma } from "@/src/infrastructure/prisma/client"; // PrismaClient(DB接続)
import {
  createClubJoinLink, // 参加リンクを発行し、既存の有効なリンクを無効化するRepository関数
  revokeClubJoinLink, // 参加リンクを無効化するRepository関数
} from "@/src/infrastructure/prisma/repositories/club-join-repository";
import {
  createSecureToken, // 推測困難な生トークンを作る関数
  hashToken, // 生トークンのSHA-256ハッシュを作る関数
} from "@/src/infrastructure/security/token";

/** 発行直後に、1回だけ画面に返す情報(生トークンを含むため、保存しない)。 */
export type ClubJoinLinkIssued = {
  url: string; // 保護者に配る参加リンクのURL
  expiresAtLabel: string; // 有効期限の表示
  qr: ClubJoinQrShape; // QRコードの図形
};

/** 参加リンク操作(発行・無効化)の結果の型。 */
export type ClubJoinLinkActionState = ActionState<
  Record<string, never>, // 入力欄はない
  never, // 項目ごとのエラーはない
  ClubJoinLinkIssued // 発行の成功時だけ返す情報
>;

const EXPIRED_FORM_MESSAGE =
  "フォームの有効期限が切れました。もう一度お試しください。";
const FAILURE_MESSAGE =
  "参加リンクの処理を完了できませんでした。時間をおいてもう一度お試しください。";
const ORIGIN_MESSAGE =
  "参加リンクのURLの設定を確認できません。運営者へお問い合わせください。";

/**
 * 画面へ返す、エラーの状態を作る。固定メッセージだけを使う。
 * @param requestId 直前の状態のrequestId。
 * @param message 画面に出す固定メッセージ。
 * @returns エラーの状態。
 */
function errorState(
  requestId: unknown, // 直前のrequestId(不正なら作り直す)
  message: string,
): ClubJoinLinkActionState {
  return {
    status: "error",
    values: {},
    fieldErrors: {},
    formError: message,
    requestId: isRequestId(requestId) ? requestId : createRequestId(), // 形式の検査 / 新しいrequestIdを作る関数
  };
}

/**
 * フォームのrequestIdが、直前の状態と一致するかを確認する(二重送信・古い画面の防止)。
 * @param previousRequestId 直前の状態のrequestId。
 * @param formData 送信されたフォーム。
 * @returns 一致すればtrue。
 */
function matchesRequestId(
  previousRequestId: unknown, // 直前の状態のrequestId
  formData: FormData, // 送信されたフォームの型
): boolean {
  const requestId = formData.get("requestId"); // フォームの値を取り出す標準のメソッド

  return (
    isRequestId(previousRequestId) && // requestIdの形式を検査する関数
    isRequestId(requestId) &&
    requestId === previousRequestId
  );
}

/**
 * 参加リンク(メアドとPWを入力するフォームのURL付き)を発行する。既存の有効なリンクは、同じトランザクションで、無効化される。
 * 生トークンは、この戻り値の1回だけ画面に返し、保存しない。
 * @param clubSlug URLのクラブ識別子(権限の根拠にはせず、サーバーのOWNER認可で確認する)。
 * @param previousState 直前の状態(requestIdの照合に使う)。
 * @param formData 送信されたフォーム(requestIdのみ)。
 * @returns 成功ならURL・QRコード・期限。失敗なら固定メッセージ。
 */
export async function issueClubJoinLinkAction(
  clubSlug: string,
  previousState: ClubJoinLinkActionState, // 参加リンク操作の状態の型
  formData: FormData,
): Promise<ClubJoinLinkActionState> {
  const access = await requireClubAppOwnerAccess(clubSlug); // OWNER・アプリ利用可を確認する関数

  if (!matchesRequestId(previousState.requestId, formData)) { // requestIdの照合
    return errorState(previousState.requestId, EXPIRED_FORM_MESSAGE);
  }

  try {
    const club = await prisma.club.findUnique({ // クラブを1件取得するPrismaのメソッド
      where: { id: access.club.id }, // サーバーで認可済みのクラブ
      select: { appBaseUrl: true, timezone: true },
    });
    const origin = club
      ? resolveClubJoinOrigin({ // URLのoriginを決める関数
          clubAppBaseUrl: club.appBaseUrl,
          fallbackOrigin: process.env.APP_BASE_URL,
          isProduction: process.env.NODE_ENV === "production",
        })
      : null;

    if (!club || !origin) { // 表示できるURLを作れないなら、リンクを作らない
      return errorState(previousState.requestId, ORIGIN_MESSAGE);
    }

    const token = createSecureToken(); // 生トークンを作る関数
    const result = await createClubJoinLink({ // 参加リンクをDBに作成する
      clubId: access.club.id,
      actorMembershipId: access.membership.id,
      tokenHash: hashToken(token), // 保存するのはハッシュだけ
    });

    if (result.outcome === "ACTOR_NOT_ACTIVE_OWNER") {
      notFound(); // 取得中にOWNER資格を失った場合
    }

    revalidateClubMemberPaths(access.club.slug); // 再検証する関数

    const url = buildClubJoinUrl({ origin, clubSlug: access.club.slug, token }); // 参加リンクのURLを作る関数

    return {
      status: "success",
      values: {},
      fieldErrors: {},
      formError: null,
      data: {
        url,
        expiresAtLabel: formatClubDateTime(result.link.expiresAt, club.timezone), // 日時の表示を作る関数
        qr: buildClubJoinQrShape(url), // QRコードの図形を作る関数
      },
      requestId: createRequestId(), // 次の操作のための新しいrequestId
    };
  } catch (error) {
    unstable_rethrow(error); // notFoundなどの画面遷移の例外は、そのまま通す
    return errorState(previousState.requestId, FAILURE_MESSAGE); // 生のエラーは、画面に出さない
  }
}

/**
 * DB内のクラブの有効な参加リンクを、無効化する。申請済みのものには、影響しない。
 * @param clubSlug URLのクラブ識別子(サーバーのOWNER認可で確認する)。
 * @param previousState 直前の状態(requestIdの照合に使う)。
 * @param formData 送信されたフォーム(requestIdのみ)。
 * @returns 成功(有効なリンクがなくても成功)か、固定メッセージのエラー。
 */
export async function revokeClubJoinLinkAction(
  clubSlug: string,
  previousState: ClubJoinLinkActionState, // 参加リンク操作の状態の型
  formData: FormData,
): Promise<ClubJoinLinkActionState> {
  const access = await requireClubAppOwnerAccess(clubSlug); // OWNER・アプリ利用可を確認する関数

  if (!matchesRequestId(previousState.requestId, formData)) { // requestIdの照合
    return errorState(previousState.requestId, EXPIRED_FORM_MESSAGE);
  }

  try {
    const result = await revokeClubJoinLink({ // DB内のクラブの有効な参加リンクを、無効化するRepository関数(OWNERを再確認する)
      clubId: access.club.id,
      actorMembershipId: access.membership.id,
    });

    if (result.outcome === "ACTOR_NOT_ACTIVE_OWNER") {
      notFound(); // 取得中にOWNER資格を失った場合
    }

    revalidateClubMemberPaths(access.club.slug); // 再検証する関数

    return {
      status: "success",
      values: {},
      fieldErrors: {},
      formError: null,
      requestId: createRequestId(), // 次の操作のための新しいrequestId
    };
  } catch (error) {
    unstable_rethrow(error); // 画面遷移の例外は、そのまま通す
    return errorState(previousState.requestId, FAILURE_MESSAGE); // 生のエラーは、画面に出さない
  }
}
