// app/(club-app)/club/[clubSlug]/admin/members/ClubJoinLinkPanel.tsx
// OWNER用の「参加リンク」エリア。発行(URL・QRコード)と無効化を行う。

"use client";

import { useActionState, useRef, useState } from "react"; // 【修正】Server Actionの状態を扱うhook / 入力欄への参照を持つhook / 状態を持つhook

import {
  FormErrorAlert, // フォーム全体のエラーをアラートで表示するコンポーネント
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";

import type {
  ClubJoinLinkActionState, // 参加リンク操作の結果の型
} from "./join-link-actions";

/** 参加リンクエリアの入力。 */
type Props = {
  activeLink: { expiresAtLabel: string } | null; // 現在使えるリンク(なければnull)。URLは再表示できない
  issueInitialState: ClubJoinLinkActionState; // 発行の初期状態
  revokeInitialState: ClubJoinLinkActionState; // 無効化の初期状態
  issueAction: (
    previousState: ClubJoinLinkActionState,
    formData: FormData,
  ) => Promise<ClubJoinLinkActionState>; // 発行のServer Action(クラブは束縛済み)
  revokeAction: (
    previousState: ClubJoinLinkActionState,
    formData: FormData,
  ) => Promise<ClubJoinLinkActionState>; // 無効化のServer Action(クラブは束縛済み)
};

/**
 * 参加リンクの発行・無効化のエリア。
 * 発行の直後だけ、URLとQRコードを表示する(生トークンは保存されないため、再表示できない)。
 * @param props 現在のリンクの状態と、操作のAction。
 * @returns 参加リンクのエリア。
 */
export function ClubJoinLinkPanel({
  activeLink,
  issueInitialState,
  revokeInitialState,
  issueAction,
  revokeAction,
}: Props) {
  const urlInputRef = useRef<HTMLInputElement>(null); // 【追加】URLの入力欄への参照(コピーの代替手段で使う)
  const [issuedHidden, setIssuedHidden] = useState(false); // 【追加】無効化したため、発行直後の表示を隠すか
  const [copyMessage, setCopyMessage] = useState<string | null>(null); // コピー結果の表示

  /**
   * 【追加】発行のActionを包み、新しい発行の成功で、発行直後の表示を再び出す。
   * @param previousState 直前の状態。
   * @param formData 送信されたフォーム。
   * @returns 発行の結果。
   */
  async function issueWithReset(
    previousState: ClubJoinLinkActionState, // 参加リンク操作の状態の型
    formData: FormData,
  ): Promise<ClubJoinLinkActionState> {
    const result = await issueAction(previousState, formData); // 発行のServer Action

    if (result.status === "success") {
      setIssuedHidden(false);
      setCopyMessage(null);
    }

    return result;
  }

  /**
   * 【追加】無効化のActionを包み、成功したら、発行直後の表示(URL・QR)を隠す。
   * @param previousState 直前の状態。
   * @param formData 送信されたフォーム。
   * @returns 無効化の結果。
   */
  async function revokeWithHide(
    previousState: ClubJoinLinkActionState, // 参加リンク操作の状態の型
    formData: FormData,
  ): Promise<ClubJoinLinkActionState> {
    const result = await revokeAction(previousState, formData); // 無効化のServer Action

    if (result.status === "success") {
      setIssuedHidden(true);
    }

    return result;
  }

  const [issueState, issueFormAction, isIssuing] = useActionState(issueWithReset, issueInitialState); // 発行の状態
  const [revokeState, revokeFormAction, isRevoking] = useActionState(revokeWithHide, revokeInitialState); // 無効化の状態

  const issued =
    issueState.status === "success" && !issuedHidden ? issueState.data : undefined; // 【修正】発行直後の情報(無効化後は隠す)
  const revokedAfterIssue = revokeState.status === "success" && !issued; // 無効化の成功を表示するか

  /**
   * 【修正】参加リンクのURLを、クリップボードへコピーする。
   * httpの画面などで、標準のAPIが使えないときは、入力欄を選択して、従来の方法でコピーする。
   * @param url コピーするURL。
   */
  async function copyUrl(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url); // クリップボードに書く標準のAPI(httpsかlocalhostだけ)
      setCopyMessage("コピーしました。");
      return;
    } catch {
      // 次の代替手段へ進む
    }

    try {
      const input = urlInputRef.current; // URLの入力欄

      if (input) {
        input.focus();
        input.select(); // 入力欄の文字を選択する標準のメソッド

        if (document.execCommand("copy")) { // 選択中の文字をコピーする従来の標準の関数
          setCopyMessage("コピーしました。");
          return;
        }
      }
    } catch {
      // 失敗の案内へ進む
    }

    setCopyMessage("コピーできませんでした。URLを選択してコピーしてください。");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-700">
        このリンクをグループLINEに貼ると、保護者が自分で参加を申請できます。申請は、
        あなたの承認で確定します。リンクは、新しく発行すると、前のリンクが使えなくなります。
      </p>

      <FormErrorAlert message={issueState.formError ?? revokeState.formError} />

      {issued ? (
        <div className="space-y-3 rounded-lg border border-green-300 bg-green-50 p-4">
          <p className="text-sm font-bold text-green-900">
            参加リンクを発行しました。この画面を閉じると、URLは再表示できません。
          </p>
          <input
            ref={urlInputRef}
            type="text"
            readOnly
            value={issued.url}
            aria-label="参加リンクのURL"
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void copyUrl(issued.url)}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold
                text-slate-700 hover:bg-slate-50 focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              URLをコピー
            </button>
            {copyMessage ? (
              <span role="status" className="text-sm text-slate-700">{copyMessage}</span>
            ) : null}
          </div>
          <p className="text-sm text-slate-700">有効期限:{issued.expiresAtLabel}</p>
          <svg
            role="img"
            aria-label="参加リンクのQRコード"
            viewBox={`0 0 ${issued.qr.viewBoxSize} ${issued.qr.viewBoxSize}`}
            className="h-56 w-56 rounded-md bg-white"
            shapeRendering="crispEdges"
          >
            <rect width="100%" height="100%" fill="#ffffff" />
            <path d={issued.qr.path} fill="#000000" />
          </svg>
        </div>
      ) : activeLink ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
          使えるリンクがあります(有効期限:{activeLink.expiresAtLabel})。
          セキュリティのため、URLは再表示できません。必要なら、新しく発行してください。
        </p>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700">
          {revokedAfterIssue ? "参加リンクを無効にしました。" : "使える参加リンクはありません。"}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <form action={issueFormAction} aria-busy={isIssuing}>
          <input type="hidden" name="requestId" value={issueState.requestId} />
          <button
            type="submit"
            disabled={isIssuing || isRevoking}
            className="rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white
              hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
          >
            {isIssuing ? "発行中..." : "参加リンクを新しく発行する"}
          </button>
        </form>

        {activeLink || issued ? (
          <form action={revokeFormAction} aria-busy={isRevoking}>
            <input type="hidden" name="requestId" value={revokeState.requestId} />
            <button
              type="submit"
              disabled={isIssuing || isRevoking}
              className="rounded-md border border-red-300 bg-white px-4 py-3 text-sm font-bold
                text-red-700 hover:bg-red-50 focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-red-600
                disabled:cursor-wait disabled:opacity-60"
            >
              {isRevoking ? "無効化中..." : "このリンクを無効にする"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
