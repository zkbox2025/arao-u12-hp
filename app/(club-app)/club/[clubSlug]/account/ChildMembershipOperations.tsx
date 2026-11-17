// app/(club-app)/club/[clubSlug]/account/ChildMembershipOperations.tsx
//子どものメンバーシップの追加と退会処理のためのフォーム

"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  FieldErrorList,//各入力項目ごとのエラーメッセージ配列を受け取り、エラーを赤字の箇条書きで各入力項目に表示する関数
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";
import {
  FormErrorAlert,//フォーム全体で発生したエラー（サーバーエラー、ログイン失敗、通信タイムアウトなど）を受け取りアラートとして表示する関数
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import {
  useScrollToFormError,//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
} from "@/app/(club-app)/club/admin/_hooks/useScrollToFormError";
import type {
  ClubAccountChildCandidatesResult,//クラブアカウントに紐づけられている子供アカウントの検索結果の型
  ClubAccountChildView,// 子供のアカウントの表示情報
} from "@/domain/club/account/account-types";
import {
  CHILD_GRADE_OPTIONS,//子どもの学年のラベルと値
  type ChildMembershipActionState,//子どものメンバーシップのアクションステイト
} from "@/domain/club/account/child-form";
import {
  createInitialActionState,//初期値を作成する
} from "@/domain/shared/action-state";

import {
  AccountConfirmDialog,//アカウントページで使う確認ダイアログ（モーダル）の画面コンポーネント
  useConfirmedAccountForm,//アカウントページでユーザーがフォーム送信ボタンを押したときに、一度入力内容を保持したままモーダルを開き、ユーザーがOKを押して初めて安全に送信を実行するという、確認画面付きフォームのためのカスタムフック
} from "./AccountConfirmDialog";

//子どものメンバーシップのアクションの引数と戻り値の型
type MembershipAction = (
  state: ChildMembershipActionState,//子どものメンバーシップのアクションステイト
  data: FormData,
) => Promise<ChildMembershipActionState>;//子どものメンバーシップのアクションステイト

//子どものメンバーシップの追加・退会処理の引数
type MembershipProps = {
  mode: "add" | "withdraw";
  childId: string;
  initialState: ChildMembershipActionState;//子どものメンバーシップのアクションステイト
  action: MembershipAction;//子どものメンバーシップのアクションの引数と戻り値の型
  disabled?: boolean;//ボタンや入力欄を操作できない（無効化）ようにするかを切り替える設定
  onBusyChange?: (busy: boolean) => void;//現在、サーバー側で保存や削除などの重い処理を実行中（通信中）であるかどうか
};

//子どものメンバーシップの追加の引数
type AddProps = {
  mode: "add";
  loadAction: () => Promise<ClubAccountChildCandidatesResult>;//クラブアカウントに紐づけられている子供アカウントの検索結果の型
  action: (childId: string, state: ChildMembershipActionState, data: FormData) =>//子どものメンバーシップのアクションステイト
    Promise<ChildMembershipActionState>;//子どものメンバーシップのアクションステイト
};

type Props = (MembershipProps & { mode: "withdraw" }) | AddProps;//子どものメンバーシップの退会処理の引数と子どものメンバーシップの追加の引数

//子どものメンバーシップの追加と退会処理のためのフォームの共通関数
function MembershipForm({
  mode,
  childId,
  initialState,
  action,
  disabled = false,//ボタン、入力欄操作可能
  onBusyChange,
}: MembershipProps) {//メンバーシップの追加・退会処理の引数
  const form = useConfirmedAccountForm(action, initialState);//アカウントページでユーザーがフォーム送信ボタンを押したときに、一度入力内容を保持したままモーダルを開き、ユーザーがOKを押して初めて安全に送信を実行するという、確認画面付きフォームのためのカスタムフック
  const formRef = useScrollToFormError(form.state);//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
  const errorId = useId();//この画面内で絶対に重複しない、安全でユニークな『ID（識別子）』を自動的に1つ生成する
  const withdrawing = mode === "withdraw";
  const label = withdrawing ? "現在クラブから外す" : "現在クラブへ追加する";

  useEffect(() => {
    onBusyChange?.(form.pending || form.isOpen);//送信中：pending と確認中：isOpenのどちらかの場合、onBusyChangeがtrueになり重い処理を実行中であることを知らせる
    return () => onBusyChange?.(false);
  }, [form.pending, form.isOpen, onBusyChange]);

  return (
    <>
      <form
        ref={formRef}
        method="post"
        onSubmit={form.onSubmit}
        className="mt-4 space-y-2"
      >
        <fieldset disabled={disabled || form.pending || form.isOpen}>
          <input
            type="hidden"
            name="requestId"
            value={form.state.requestId}
          />
          <input
            type="hidden"
            name="childId"
            value={childId}
          />
          <FormErrorAlert message={form.state.formError} />
          <FieldErrorList
            id={errorId}
            errors={form.state.fieldErrors.childId}
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2"
          >
            {form.pending ? "処理中…" : label}
          </button>
        </fieldset>
      </form>
      <AccountConfirmDialog
        isOpen={form.isOpen}
        pending={form.pending}
        returnFocusRef={form.returnFocusRef}
        title={withdrawing ? "現在クラブから外しますか？" : "現在クラブへ追加しますか？"}
        confirmLabel={label}
        onClose={form.close}
        onConfirm={() => form.confirm()}
      >
        {withdrawing
          ? "子ども本体と他クラブの所属は残ります。入力中の編集は保存されません。"
          : "既存の子どもを再利用して現在クラブへ追加します。"}
      </AccountConfirmDialog>
    </>
  );
}

//子どものメンバーシップの追加のためのフォーム
function CandidateRow({ child, action, disabled, onBusyChange }: {
  child: ClubAccountChildView;// 子供のアカウントの表示情報
  action: AddProps["action"];//子どものメンバーシップの追加の引数
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [initialState] = useState(() => createInitialActionState({ childId: child.id }));//初期値を作成する
  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <p className="font-bold">{child.name}</p>
      <p className="text-sm text-slate-600">
        学年：{CHILD_GRADE_OPTIONS.find((option) => option.value === child.grade)?.label ?? "未設定"}
      </p>
      <MembershipForm
        mode="add"
        childId={child.id}
        initialState={initialState}
        action={action.bind(null, child.id)}
        disabled={disabled}
        onBusyChange={onBusyChange}
      />
    </li>
  );
}

//メンバーシップに追加する子どもの候補を表示して、追加を実行するためのエリア全体
function AddOperations({ loadAction, action }: AddProps) {//メンバーシップの追加の引数
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<ClubAccountChildCandidatesResult | null>(null);//クラブアカウントに紐づけられている子供アカウントの検索結果の型
  const [busy, setBusy] = useState(false);
  const [loading, startLoading] = useTransition();
  const loadingRef = useRef(false);

  // 認可失効によるNext制御例外はcatchで握りつぶさず、Nextへ委ねる。
  function open() {
    if (loading || loadingRef.current || busy) {
      return;
    }
    loadingRef.current = true;
    setIsOpen(true);
    setResult(null);
    startLoading(async () => {
      try {
        setResult(await loadAction());
      } finally {
        loadingRef.current = false;
      }
    });
  }

  return (
    <section className="mt-5 space-y-3">
      <button
        type="button"
        disabled={loading || busy}
        onClick={open}
      >
        {loading ? "候補を取得中…" : "登録済みの子どもを現在クラブへ追加"}
      </button>
      {isOpen ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="font-bold">追加できる子ども</h3>
          {result?.outcome === "FOUND" ? (
            result.children.length === 0 ? (
              <p>追加できる子どもはいません。</p>
            ) : (
              <ul className="space-y-3">
                {result.children.map((child) => (
                  <CandidateRow
                    key={child.id}
                    child={child}
                    action={action}
                    disabled={busy}
                    onBusyChange={setBusy}
                  />
                ))}
              </ul>
            )
          ) : result ? (
            <FormErrorAlert message="候補を取得できませんでした。ページを開き直してください。" />
          ) : null}
          <button
            type="button"
            disabled={loading || busy}
            onClick={() => setIsOpen(false)}
          >
            閉じる
          </button>
        </div>
      ) : null}
    </section>
  );
}

//props.mode === "add"であれば、メンバーシップに追加する子どもの候補を表示して、追加を実行するためのエリア全体を表示し、違うなら子どものメンバーシップの退会処理のためのフォームを表示する関数
export function ChildMembershipOperations(props: Props) {//子どものメンバーシップの退会処理の引数と子どものメンバーシップの追加の引数
  return props.mode === "add" ? <AddOperations {...props} /> : <MembershipForm {...props} />;
}
