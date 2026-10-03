// app/(club-app)/club/[clubSlug]/admin/settings/line/ClubLineRegistrationCodePanel.tsx
// LINEグループ登録コードの発行・コピー・登録待機UIファイル
//グループラインに登録コードが投稿されたかを定期的に問い合わせするポーリングファイル

"use client";

import {
  useActionState,
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  FormErrorAlert,//フォーム全体で発生したエラー（サーバーエラー、ログイン失敗、通信タイムアウトなど）を受け取り、アラートとして表示する関数
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";

import {
  useScrollToFormError,//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
} from "@/app/(club-app)/club/admin/_hooks/useScrollToFormError";

import type {
  ClubLineRegistrationCodeActionState,//ライン通知先アクションステイトの型（入力・エラー・戻り値）
} from "@/domain/club/line/line-registration-code";

const REGISTRATION_POLL_INTERVAL_MILLISECONDS =//4秒ごとにポーリング（グループラインに登録コードを投稿されてDBの有効期限が書き換わったか）を行う
  4_000;

type CopyStatus =
  | "idle"
  | "copied"
  | "failed";

  //関数の引数の型
type ClubLineRegistrationCodePanelProps = {
  action: (
    previousState:
      ClubLineRegistrationCodeActionState,//ライン通知先アクションステイトの型（入力・エラー・戻り値）
    formData: FormData,
  ) => Promise<ClubLineRegistrationCodeActionState>;//ライン通知先アクションステイトの型（入力・エラー・戻り値）

  initialState:
    ClubLineRegistrationCodeActionState;//ライン通知先アクションステイトの型（入力・エラー・戻り値）

  canIssueCode: boolean;
  activeRegistrationExpiresAt:
    string | null;
  timeZone: string;
};

//有効期限のバリデーション関数
function formatExpiresAt(
  value: string,
  timeZone: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "期限を確認できません";
  }

  try {
    return new Intl.DateTimeFormat(
      "ja-JP-u-ca-gregory-nu-latn",
      {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      },
    ).format(date);
  } catch {
    return "期限を確認できません";
  }
}

//登録コードをコピーする関数
async function copyText(
  value: string,
): Promise<void> {
  if (
    navigator.clipboard &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(
      value,
    );
    return;
  }

  /*
   * ローカルIPのHTTP確認など、Clipboard APIを
   * 使用できない環境向けのフォールバック。
   */
  const textArea =
    document.createElement(
      "textarea",
    );

  textArea.value = value;
  textArea.readOnly = true;
  textArea.style.position =
    "fixed";
  textArea.style.opacity =
    "0";

  document.body.appendChild(
    textArea,
  );

  textArea.select();

  const copied =
    document.execCommand(
      "copy",
    );

  textArea.remove();

  if (!copied) {
    throw new Error(
      "Copy failed",
    );
  }
}

//登録コードをコピーする処理
function RegistrationCodeDisplay({
  registrationCode,//登録コード
}: {
  registrationCode: string;
}) {
  const [
    copyStatus,
    setCopyStatus,
  ] = useState<CopyStatus>(
    "idle",
  );

  
  async function handleCopy():
    Promise<void> {
    try {
      await copyText(
        registrationCode,
      );

      setCopyStatus(
        "copied",
      );
    } catch {
      setCopyStatus(
        "failed",
      );
    }
  }

  return (
    <div className="rounded-lg border border-blue-300 bg-white p-4">
      <p className="text-sm font-bold text-neutral-900">
        発行した登録コード
      </p>

      <code className="mt-3 block break-all rounded-md bg-neutral-900 p-3 text-sm font-bold text-white">
        {registrationCode}
      </code>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="cursor-pointer rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          コードをコピー
        </button>

        <span
          aria-live="polite"
          className="text-xs font-medium text-neutral-700"
        >
          {copyStatus ===
          "copied"
            ? "コピーしました。"
            : copyStatus ===
                "failed"
              ? "コピーできませんでした。コードを長押ししてコピーしてください。"
              : "このコードは再読み込み後に再表示できません。"}
        </span>
      </div>
    </div>
  );
}


//つまり以下のポーリングに使用するものは、登録コードを発行するアクション関数のstateから取得した発行コードの固定の有効期限（issuedExpiresAt）と親コンポーネントから受け取った
//DBに保存されてある可変の有効期限（登録コード発行ボタンを押した時やグループラインに登録コードが投稿されてDBに保存される変数の有効期限：activeRegistrationExpiresAt）、
//useEffectによって、画面上に登録コードや有効期限を表示するためのメモ（observedIssuedExpiresAt）が、登録コードの発行が完了したタイミング（issuedExpiresAt＝activeRegistrationExpiresAt）で
//有効期限と登録コードを画面上にメモして表示させるものの三つがある。
//登録コードを発行するとuseEffectにより、setObservedIssuedExpiresAtが実行されobservedIssuedExpiresAtでnullから画面上に有効期限と登録コードの表示へ変わる
//グループラインで登録コードを投稿することでissuedTokenIsActiveで issuedExpiresAt ＝activeRegistrationExpiresAt（有効期限がnow書き変わる）が成立しないのでfalseになる。
//それによってisWaitingForRegistrationがfalseになりuseEffectがrefreshRegistrationStateをする前に終了（setObservedIssuedExpiresAtが実行なし）となり、画面上に登録完了済みとなる。

//LINE登録コードを発行し、そのコードがLINEグループ内で入力されるのを画面の前のオーナーが待機するための、
// フロントエンド（画面側）の主役級のコンポーネント（関数）
export function ClubLineRegistrationCodePanel({
  action,
  initialState,
  canIssueCode,
  activeRegistrationExpiresAt,//DB側が4秒ごとにリアルタイムで送ってくる最新の有効期限（可変）
  timeZone,
}: ClubLineRegistrationCodePanelProps) {
  const router =//画面を書き換えたり、遷移するための道具
    useRouter();

const [
  state,
  formAction,
  isPending,
] = useActionState(//ボタンを押したらアクションを呼び出してステイトを記録する
  action,
  initialState,
);

const formRef =
  useScrollToFormError(//エラーが起きた時にスクロールするための機能
    state,
  );


// サーバー上で一度確認できた
// 発行コードの有効期限とコードを画面に表示する。
const [
  observedIssuedExpiresAt,//発行された登録コードの有効期限とコードをメモして画面に表示するための変数（初期はnull）
  //DBから送られてきた『変わる方の有効期限（activeRegistrationExpiresAt）』とissuedExpiresAt（stateの有効期限。固定値）が一致する場合に働く（つまり登録コード発行済みの合図。ライングループに登録コードが投稿されたら働かない）。
  setObservedIssuedExpiresAt,
] = useState<string | null>(
  null,
);

const [
  currentTime,//現在の時刻を記録する
  setCurrentTime,
] = useState(() =>
  Date.now(),
);

const issuedData =//以下の時だけ、データ（コードと有効期限）を取り出す。
  state.status === "success"
    ? state.data
    : undefined;

const issuedExpiresAt =//取り出した中身から有効期限のみを取得する。画面（ブラウザ）が最初に発行したコードの期限（固定）
  issuedData?.expiresAt ??
  null;


//「stateで新しく発行した固定の有効期限（issuedExpiresAt）」と、
// //発行された登録コードの有効期限とコードをメモして画面に表示するための変数（初期はnull）（observedIssuedExpiresAt）を比べる
//これはDBの有効期限が（グループラインに投稿されてない場合でも）画面上のメモに反映される変数（observedIssuedExpiresAt）に登録されたかどうかを判定させる関数
//trueなら登録コードが発行されたということになる
const issuedTokenWasObserved =
  Boolean(
    issuedExpiresAt &&
    observedIssuedExpiresAt ===//発行された登録コードの有効期限とコードをメモして画面に表示するための変数（初期はnull。登録コード発行済みでまだグループラインに投稿してない場合に有効期限のメモを記録し表示する）
      issuedExpiresAt,
  );


  //「stateで新しく発行した固定の有効期限（issuedExpiresAt）」と、親コンポーネントから渡された「現在DB上で有効な設定の変動する有効期限
  // （activeRegistrationExpiresAt）」を比べる
  //LINEグループ側で誰かがコードを打ち込んで、Webhook経由でDBの登録（仮登録）が無事に完了したことを判定する（falseだと仮登録済み）
const issuedTokenIsActive =
  Boolean(
    issuedExpiresAt &&
    activeRegistrationExpiresAt ===//DB側が4秒ごとにリアルタイムで送ってくる最新の有効期限（可変）（グループラインに登録コードを投稿したらDBの有効期限が今に書き換わり失効される）
      issuedExpiresAt,
  );

  //有効期限の文字を数字に変換する
const issuedExpiresAtTime =
  issuedExpiresAt
    ? new Date(
        issuedExpiresAt,
      ).getTime()
    : Number.NaN;

    //有効期限が現在の時刻を過ぎていないか確認し、過ぎていれば期限切れ（true）になる
const issuedTokenIsExpired =
  Boolean(
    issuedExpiresAt &&
    Number.isFinite(
      issuedExpiresAtTime,
    ) &&
    currentTime >=
      issuedExpiresAtTime,
  );


  //登録完了を待ってる状態かの最終判定（true:待機中）
const isWaitingForRegistration =
  issuedExpiresAt//パターン①：新しくコードを発行した直後、以下の場合は待機中（true）
    ? !issuedTokenIsExpired &&//有効期限が切れてない
      (
        !issuedTokenWasObserved ||//DBの有効期限が画面上のメモに反映される変数（observedIssuedExpiresAt）に登録されたかどうかを判定させる関数がfalseもしくは
        issuedTokenIsActive//グループラインでまだ投稿されてない状態
      )
    : Boolean(//画面を開き直した場合（issuedExpiresAt＝null）、以下の場合は待機中（true）
        activeRegistrationExpiresAt,//DB側が4秒ごとにリアルタイムで送ってくる最新の有効期限（可変）（グループラインに登録コードを投稿したらDBの有効期限が今に書き換わり失効される）
      );


// 登録待機中だけポーリング（定期問い合わせ）する。理由：待機中の状態から、ライングループに登録コードが投稿され、DBへ有効期限が保存されたタイミングを４秒ごとに毎回確認し、確認次第画面を登録完了しましたへ変更するため
//その間に有効期限を照らし合わせて（stateから取得した固定の有効期限（issuedExpiresAt）と
//親コンポーネントから渡された「現在DB上で有効な設定の期限（activeRegistrationExpiresAt）（グループラインに登録コードが投稿されたらwebhookが検視してDBの有効期限を今にして失効させる）」とが同じか比べて)
//画面上に有効期限を表示する関数（falseだとグループラインに登録コードが投稿されDBの有効期限が書き換わったたという意味）
useEffect(() => {
  if (!isWaitingForRegistration) {//ライングループに登録コードを投稿して登録完了だとそのまま終わる
    return;
  }

  let cancelled = false;//画面が閉じられたり再起動した時に、タイマーの処理が暴走して二重に動かないようにするための安全ストッパー

  function refreshRegistrationState():
    void {
    if (cancelled) {
      return;
    }

    /*
     * サーバーから今回の発行コードを
     * 発行できたことを記録し、画面上に表示する。
     */
    if ( // 1. もしLINE側での登録が完了（stateから取得した固定の有効期限（issuedExpiresAt）とDB側が4秒ごとにリアルタイムで送ってくる最新の有効期限（可変）（グループラインに登録コードを投稿したらDBの有効期限が今に書き換わり失効される）が一致（登録コードが発行され、まだグループラインに登録コードが投稿されてない場合）していたら、画面側にも「有効期限」とコードをメモして表示させる
      issuedExpiresAt &&
      activeRegistrationExpiresAt ===//DB側が4秒ごとにリアルタイムで送ってくる最新の有効期限（可変）（グループラインに登録コードを投稿したらDBの有効期限が今に書き換わり失効される）
        issuedExpiresAt//取り出した中身から取得した有効期限
    ) {
      setObservedIssuedExpiresAt(//useEffectでstateの固定有効期限を画面上のメモに反映させる（setObservedIssuedExpiresAt(issuedExpiresAt);）
        (current) =>
          current ===//「現在のメモ（current）」と、「新しくサーバーから届いた有効期限（issuedExpiresAt）」が同じか違うか
          issuedExpiresAt
            ? current//同じなら、今のメモ（current）をそのままキープ！
            : issuedExpiresAt,//違うなら新しくサーバーから届いた有効期限（issuedExpiresAt）へ書き換える
      );
    }

    setCurrentTime(// 2. 現在時刻を「今」に更新する（1秒ずつ時計を進めるイメージ）
      Date.now(),
    );

    router.refresh();// 3.Next.jsの画面を裏側でシュッと最新状態に更新する
  }

  const initialRefreshId =// 画面を開いた瞬間にすぐ1回実行する（遅延0秒）
    window.setTimeout(
      refreshRegistrationState,//有効期限を照らし合わせて合致する場合（登録コードの発行が完了した場合）は画面に表示する関数
      0,
    );

  const intervalId =// その後は、指定された間隔（約4秒ごと）で「定期実行」を繰り返す
    window.setInterval(
      refreshRegistrationState,
      REGISTRATION_POLL_INTERVAL_MILLISECONDS,
    );

  return () => { // 【お片付け】この画面が閉じられたら、タイマーを完全に停止する
    cancelled = true;

    window.clearTimeout(
      initialRefreshId,
    );

    window.clearInterval(
      intervalId,
    );
  };
}, [
  isWaitingForRegistration,//ライングループに登録コードを投稿して登録完了したことを判定する関数（false:登録完了）
  issuedExpiresAt,//stateから取り出した中身から取得した有効期限（固定）
  activeRegistrationExpiresAt,//DB側が4秒ごとにリアルタイムで送ってくる最新の有効期限（可変）（グループラインに登録コードを投稿したらDBの有効期限が今に書き換わり失効される）
  router,
]);

//stateから取り出した中身から取得した有効期限（固定）があり、登録コードが発行され、グループラインに登録コードが投稿されており、有効期限が切れてない場合はtrue
const registrationCompleted =
  Boolean(
    issuedExpiresAt &&//stateから取り出した中身から取得した有効期限（固定）
    issuedTokenWasObserved &&//DBの有効期限が画面上のメモに反映される変数（observedIssuedExpiresAt）に登録されたかどうかを判定させる関数（true：登録コードが発行された）
    !issuedTokenIsActive &&//グループラインでまだ投稿されたか判定する関数（false：登録済み）
    !issuedTokenIsExpired,//有効期限が現在の時刻を過ぎていないか確認し、過ぎていれば期限切れ（true）になる
  );

//stateから取り出した中身から取得した有効期限（固定）があり、登録コードが発行され、グループラインで登録コードを投稿済みで、有効期限が切れている場合は、true
const registrationExpired =
  Boolean(
    issuedExpiresAt &&//stateから取り出した中身から取得した有効期限（固定）
    issuedTokenWasObserved &&//DBの有効期限が画面上のメモに反映される変数（observedIssuedExpiresAt）に登録されたかどうかを判定させる関数（true：登録コードが発行された）
    !issuedTokenIsActive &&//グループラインで投稿されたか判定する関数（false：登録済み）
    issuedTokenIsExpired,//有効期限が現在の時刻を過ぎていないか確認し、過ぎていれば期限切れ（true）になる
  );

const showRawCode =
  Boolean(
    issuedData &&//stateのデータ（コードと有効期限）
    !registrationCompleted &&//グループラインで登録コードを投稿されてない状態
    !registrationExpired,
  );

const displayedExpiresAt =
  issuedExpiresAt ??//stateから取り出した中身から取得した有効期限（固定）
  activeRegistrationExpiresAt;//DB側が4秒ごとにリアルタイムで送ってくる最新の有効期限（可変）（グループラインに登録コードを投稿したらDBの有効期限が今に書き換わり失効される）

  return (
    <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">
          新しいLINEグループを登録
        </h2>

        <p className="mt-2 text-sm leading-6 text-neutral-700">
          登録コードを発行し、通知先にしたいLINEグループへコードだけを投稿してください。有効期限は発行から10分です。
        </p>
      </div>

      {isWaitingForRegistration ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4"
        >
          <p className="text-sm font-bold text-amber-900">
            LINEグループからの登録を待っています
          </p>

          {displayedExpiresAt ? (
            <p className="mt-1 text-xs text-amber-800">
              有効期限：
              {formatExpiresAt(
                displayedExpiresAt,
                timeZone,
              )}
            </p>
          ) : null}

          <p className="mt-2 text-xs leading-5 text-amber-800">
            この表示中だけ、約4秒ごとに登録状態を更新します。
          </p>
        </div>
      ) : registrationCompleted ? (//登録コード発行済みでグループライン投稿しているが有効期限が切れてない場合
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm font-bold text-green-800"
        >
          LINEグループの登録を確認しました。下の通知先設定を確認して有効化してください。
        </div>
      ) : registrationExpired ? (//登録コード発行済みでグループライン投稿しているが有効期限が切れている場合
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-neutral-300 bg-neutral-50 p-4 text-sm font-bold text-neutral-700"
        >
          登録コードの有効期限が切れました。必要な場合は新しいコードを発行してください。
        </div>
      ) : (
        <p className="text-sm text-neutral-600">
          現在、有効な登録コードはありません。
        </p>
      )}

      {showRawCode &&
      issuedData ? (
        <RegistrationCodeDisplay//登録コードをコピーする処理
          key={
            issuedData
              .registrationCode
          }
          registrationCode={
            issuedData
              .registrationCode
          }
        />
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        aria-busy={isPending}
        className="space-y-4"
      >
        <input
          type="hidden"
          name="requestId"
          value={state.requestId}
        />

        <FormErrorAlert
          message={state.formError}
        />

        {!canIssueCode ? (
          <p className="text-sm font-medium text-red-700">
            Messaging APIとWebhookの接続設定が完了するまで登録コードを発行できません。
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            isPending ||
            !canIssueCode
          }
          className="cursor-pointer rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending
            ? "発行中..."
            : isWaitingForRegistration//登録コードは発行されてあるがグループラインにまだ投稿してない状態
              ? "新しいコードを再発行する"
              : "登録コードを発行する"}
        </button>
      </form>
    </section>
  );
}
