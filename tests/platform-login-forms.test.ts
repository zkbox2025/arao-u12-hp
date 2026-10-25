// tests/platform-login-forms.test.ts
// nodeでhook境界と静的propsを確認する。実DOM・自動入力・Cookie・React schedulerは再現しない。

import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  renderToStaticMarkup,
} from "react-dom/server";
import {
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import {
  PlatformLoginForm, // Platform専用ログインフォームComponent
} from "@/app/(club-app)/platform-login/PlatformLoginForm";
import {
  PlatformLogoutButton, // 本人用localログアウトボタンComponent
} from "@/app/(club-app)/platform-login/PlatformLogoutButton";
import type {
  PlatformLoginActionState, // PWを含めない公開ログインstate型
} from "@/domain/platform/platform-login-form";

const mocks = vi.hoisted( // import前のモック生成メソッド
  /**
   * hookの返却値と専用Actionを観測するモックを作る。
   */
  () => ({ // モック生成コールバック関数
    actionState: vi.fn(), // hookモックの生成メソッド
    id: vi.fn(), // useIdモックの生成メソッド
    login: vi.fn(), // ログインActionモックの生成メソッド
    logout: vi.fn(), // ログアウトActionモックの生成メソッド
    dispatch: vi.fn(), // form送信関数モックの生成メソッド
  }),
);

vi.mock( // Reactモジュールの部分置換メソッド
  "react",
  /**
   * 要素生成は実Reactを使い、hookの値だけを明示的に与える。
   */
  async (original) => ({ // 元Reactモジュールを読む非同期コールバック関数
    ...await original<typeof import("react")>(), // 元モジュール読込関数 / Reactモジュールの型
    useActionState: mocks.actionState, // Action state hookモック関数の参照
    useId: mocks.id, // ID生成hookモック関数の参照
  }),
);
vi.mock( // 専用Actionモジュールの置換メソッド
  "@/app/(club-app)/platform-login/actions",
  /**
   * 本物のAuth・DB処理を実行せず、専用Actionとの接続を確認する。
   */
  () => ({ // Action置換のコールバック関数
    platformLoginAction: mocks.login, // ログインActionモック関数の参照
    platformLogoutAction: mocks.logout, // ログアウトActionモック関数の参照
  }),
);

const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const PRIVATE = "private-password-token-cookie";

/**
 * PWを含めないログインフォームstateを作る。
 */
function state(): PlatformLoginActionState { // state生成関数 / 公開ログインstate型
  return {
    status: "idle",
    values: { email: "admin@example.test" },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
}

/**
 * React要素から指定したnativeタグのpropsだけを取り出す。
 * Componentの再描画やブラウザーイベントは実行しない。
 */
function nodes( // native要素のprops収集関数
  node: ReactNode, // 描画可能なReact要素の型
  tag: string, // 対象タグ名の文字列型
): Record<string, unknown>[] { // 文字列キーと不明値のprops辞書配列型
  if (Array.isArray(node)) { // 配列を判定するメソッド
    const found: Record<string, unknown>[] = []; // props辞書の配列型
    for (const child of node) {
      found.push(...nodes(child, tag)); // 配列追加メソッド / native要素のprops収集関数
    }
    return found;
  }
  if (!isValidElement<Record<string, unknown>>(node)) { // React要素判定関数 / props辞書の型
    return [];
  }
  return [
    ...(node.type === tag ? [node.props] : []),
    ...nodes(node.props.children as ReactNode, tag), // props収集関数 / 子要素のReactNode型アサーション
  ];
}

/**
 * Action接続はpropsで別に検証し、静的HTML化ではformの送信関数を取り除く。
 */
function html( // 静的HTML生成関数
  node: ReactElement<Record<string, unknown>>, // props辞書を持つReact要素の型
): string { // HTML文字列の型
  return renderToStaticMarkup(cloneElement(node, { action: undefined })); // HTML変換関数 / React要素の複製関数
}

/**
 * hookへ渡されたlogout送信関数を取り出す。
 */
function logoutSubmit(): () => Promise<{ formError: string | null }> { // 送信関数取得関数 / 固定エラーを非同期に返す関数型
  PlatformLogoutButton(); // hook接続を評価するログアウトComponent関数
  return mocks.actionState.mock.calls[0][0];
}

beforeEach( // 試験前処理を登録する関数
  /**
   * idle状態と固定IDを返すhookモックを用意する。
   */
  () => { // 前処理のコールバック関数
    vi.resetAllMocks(); // モック初期化メソッド
    mocks.actionState.mockReturnValue([state(), mocks.dispatch, false]); // state生成関数 / hook返却値の設定メソッド
    mocks.id.mockReturnValue("platform-1"); // useId返却値の設定メソッド
    mocks.logout.mockResolvedValue(undefined); // ログアウト成功の設定メソッド
  },
);

it( // 試験を登録する関数
  "専用Actionに接続し、PWをvalue・defaultValue・stateへ保持しない",
  /**
   * requestIdとメールだけを表示値へ反映し、PWは非制御inputとして送信する。
   */
  () => { // 接続と秘密値非保持の試験コールバック
    const initial = state(); // 初期state生成関数
    const tree = PlatformLoginForm({ initialState: initial }); // ログインフォームComponent関数
    expect(mocks.actionState).toHaveBeenCalledExactlyOnceWith(mocks.login, initial); // hook参照・Action参照 / 期待値生成・引数比較メソッド
    expect(nodes(tree, "form")[0].action).toBe(mocks.dispatch); // props収集関数 / 送信関数参照 / 期待値生成・比較メソッド
    const inputs = nodes(tree, "input"); // inputのprops収集関数
    const password = inputs.find( // 対象inputを検索するメソッド
      /**
       * パスワード項目のpropsを選ぶ。
       */
      (input) => input.name === "password", // input検索のコールバック関数
    );
    expect(password?.type).toBe("password"); // 期待値生成・input種別比較メソッド
    expect(password?.autoComplete).toBe("current-password"); // 期待値生成・自動入力属性比較メソッド
    expect(password).not.toHaveProperty("value"); // 期待値生成・保持値非設定の比較メソッド
    expect(password).not.toHaveProperty("defaultValue"); // 期待値生成・初期PW非設定の比較メソッド
    expect(password).not.toHaveProperty("onChange"); // 期待値生成・PW状態更新なしの比較メソッド
    expect(html(tree)).toContain('name="requestId"'); // HTML生成関数 / 期待値生成・識別値項目比較メソッド
    expect(html(tree)).not.toContain(PRIVATE); // HTML生成関数 / 期待値生成・秘密値非表示比較メソッド
  },
);

it.each([false, true])( // pending状態別の試験メソッド
  "ログインpending=%sでは入力と送信のdisabledを揃える",
  /**
   * hookのpendingをフォームと入力・送信ボタンに反映する。
   */
  (pending) => { // pending別の試験コールバック
    mocks.actionState.mockReturnValue([state(), mocks.dispatch, pending]); // state生成関数 / hook返却値の設定メソッド
    const tree = PlatformLoginForm({ initialState: state() }); // Component関数 / 初期state生成関数
    expect(nodes(tree, "form")[0]["aria-busy"]).toBe(pending); // props収集関数 / 期待値生成・pending比較メソッド
    for (const input of nodes(tree, "input")) { // inputのprops収集関数
      if (input.type !== "hidden") {
        expect(input.disabled).toBe(pending); // 期待値生成・disabled比較メソッド
      }
    }
    expect(nodes(tree, "button")[0].disabled).toBe(pending); // props収集関数 / 期待値生成・disabled比較メソッド
    expect(html(tree)).toContain(pending ? "ログイン中..." : "ログイン"); // HTML生成関数 / 期待値生成・送信文面比較メソッド
  },
);

it( // 試験を登録する関数
  "メール・PW・requestId・全体エラーを表示し、更新後の識別値を送る",
  /**
   * Actionからのエラーを固定stateの項目に対応させ、入力とのaria関連付けを確認する。
   */
  () => { // 項目エラーの試験コールバック
    const current = state(); // 初期state生成関数
    current.status = "error";
    current.values.email = "normalized@example.test";
    current.requestId = "55555555-5555-4555-8555-555555555555";
    current.formError = "入力内容を確認してください。";
    current.fieldErrors = {
      email: ["メールの形式を確認してください。"],
      password: ["パスワードを入力してください。"],
      requestId: ["フォームを開き直してください。"],
    };
    mocks.actionState.mockReturnValue([current, mocks.dispatch, false]); // エラーstateの設定メソッド
    const tree = PlatformLoginForm({ initialState: state() }); // Component関数 / 初期state生成関数
    const output = html(tree); // 静的HTML生成関数
    for (const message of [
      current.formError,
      ...(current.fieldErrors.email ?? []),
      ...(current.fieldErrors.password ?? []),
      ...(current.fieldErrors.requestId ?? []),
    ]) {
      expect(output).toContain(message); // 期待値生成・エラー文面包含比較メソッド
    }
    const inputs = nodes(tree, "input"); // inputのprops収集関数
    for (const input of inputs) {
      if (input.type !== "hidden") {
        expect(input["aria-invalid"]).toBe(true); // 期待値生成・エラー属性比較メソッド
        expect(output).toContain(`id="${input["aria-describedby"]}"`); // 期待値生成・関連付け先の包含比較メソッド
      } else {
        expect(input.value).toBe(current.requestId); // 期待値生成・最新識別値比較メソッド
      }
    }
    expect(output).toContain("normalized@example.test"); // 期待値生成・メール表示比較メソッド
  },
);

it( // 試験を登録する関数
  "複数フォームのlabelとエラーIDを混同しない",
  /**
   * useIdによる異なる識別子を各フォームの入力とlabelへ反映する。
   */
  () => { // ID独立性の試験コールバック
    mocks.id.mockReturnValueOnce("platform-a").mockReturnValueOnce("platform-b"); // 各フォームのID設定メソッド
    const first = PlatformLoginForm({ initialState: state() }); // Component関数 / 初期state生成関数
    const second = PlatformLoginForm({ initialState: state() }); // Component関数 / 初期state生成関数
    expect(html(first)).toContain('for="platform-a-email"'); // HTML生成関数 / 期待値生成・label関連付け比較メソッド
    expect(html(second)).toContain('for="platform-b-email"'); // HTML生成関数 / 期待値生成・label関連付け比較メソッド
  },
);

it.each([false, true])( // logout pending状態別の試験メソッド
  "ログアウトpending=%sを表示し、専用送信へ接続する",
  /**
   * logoutのpendingを反映し、元のクラブ用Actionへ接続しないことを確認する。
   */
  (pending) => { // logout pending別の試験コールバック
    mocks.actionState.mockReturnValue([{ formError: null }, mocks.dispatch, pending]); // logout hook返却値の設定メソッド
    const tree = PlatformLogoutButton(); // ログアウトComponent関数
    expect(nodes(tree, "form")[0].action).toBe(mocks.dispatch); // props収集関数 / 送信関数参照 / 期待値生成・比較メソッド
    expect(nodes(tree, "button")[0].disabled).toBe(pending); // props収集関数 / 期待値生成・disabled比較メソッド
    expect(html(tree)).toContain(pending ? "ログアウト中..." : "ログアウト"); // HTML生成関数 / 期待値生成・文面比較メソッド
    expect(mocks.logout).not.toHaveBeenCalled(); // Action参照 / 期待値生成・表示だけで未実行の比較メソッド
  },
);

it( // 試験を登録する関数
  "logout送信だけが専用Actionを実行し、成功は空エラーにする",
  /**
   * ボタンの描画ではなく、登録した送信関数を呼ぶことでActionを実行する。
   */
  async () => { // logout成功の非同期試験コールバック
    mocks.actionState.mockReturnValue([{ formError: null }, mocks.dispatch, false]); // logout hook返却値の設定メソッド
    const result = await logoutSubmit()(); // 送信関数取得関数と取得した非同期送信関数の呼出し
    expect(mocks.logout).toHaveBeenCalledExactlyOnceWith(); // Action参照 / 期待値生成・引数なし単一呼出し比較メソッド
    expect(result).toEqual({ formError: null }); // 期待値生成・成功state比較メソッド
  },
);

it( // 試験を登録する関数
  "logout失敗は原文を保持せず固定文面を表示する",
  /**
   * Server Actionの一般例外を固定stateへ変換し、再描画時のalertを確認する。
   */
  async () => { // logout失敗の非同期試験コールバック
    mocks.actionState.mockReturnValue([{ formError: null }, mocks.dispatch, false]); // logout hook返却値の設定メソッド
    mocks.logout.mockRejectedValue(new Error(PRIVATE)); // Action例外の設定メソッド / Errorコンストラクター
    const result = await logoutSubmit()(); // 送信関数取得関数と非同期送信関数の呼出し
    expect(result.formError).toBe("ログアウトできませんでした。もう一度お試しください。"); // 期待値生成・固定文面比較メソッド
    mocks.actionState.mockReturnValue([result, mocks.dispatch, false]); // エラー表示用hook返却値の設定メソッド
    const output = html(PlatformLogoutButton()); // HTML生成関数 / ログアウトComponent関数
    expect(output).toContain('role="alert"'); // 期待値生成・alert包含比較メソッド
    expect(output).not.toContain(PRIVATE); // 期待値生成・原文非表示比較メソッド
  },
);

it( // 試験を登録する関数
  "logoutのNext制御例外を一般エラーへ変換しない",
  /**
   * Client側の送信ラッパーでもNext公開APIの制御例外を保持する。
   */
  async () => { // 制御例外の非同期試験コールバック
    mocks.actionState.mockReturnValue([{ formError: null }, mocks.dispatch, false]); // logout hook返却値の設定メソッド
    const navigation = await vi.importActual<typeof import("next/navigation")>( // 元モジュール読込メソッド / navigationモジュールの型
      "next/navigation",
    );
    let control: unknown; // Next制御例外を保持する不明値型
    try {
      navigation.redirect("/platform-login"); // Next制御例外を生成する関数
    } catch (error) {
      control = error;
    }
    mocks.logout.mockRejectedValue(control); // 制御例外を返す設定メソッド
    await expect(logoutSubmit()()).rejects.toBe(control); // 送信関数取得・非同期送信関数 / 期待値生成・例外同一性比較メソッド
  },
);
