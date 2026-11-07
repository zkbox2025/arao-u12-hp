// domain/platform/platform-login-form.test.ts
// ログイン入力の単一値制約と、パスワードを画面へ返さない契約を確認する。

import {
  expect,
  expectTypeOf,
  it,
} from "vitest";

import {
  createInitialActionState, // フォームの共通初期stateを作成する関数
} from "@/domain/shared/action-state";
import {
  isRequestId, // UUID v4のrequestIdを検証する関数
} from "@/domain/shared/request-id";
import {
  buildPlatformLoginFormValues, // メールだけの公開表示値を構築する関数
  parsePlatformLoginFormData, // 単一email・password・requestIdを検証する関数
  PLATFORM_LOGIN_INITIAL_VALUES, // パスワードを含めないログイン初期表示値
  type PlatformLoginActionState, // ログイン画面へ返すAction state型
  type PlatformLoginFormValues, // メールだけの公開入力型
} from "./platform-login-form";

const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const PASSWORD = "  Private-password1!  ";

/**
 * 正規化前メールと加工しないパスワードを持つ、試験用FormDataを作る。
 */
function form(): FormData { // 試験用フォーム生成関数 / ブラウザー送信値のFormData型
  const data = new FormData(); // FormDataコンストラクター
  data.set("email", "　ＡＤＭＩＮ＠ＥＸＡＭＰＬＥ．ＴＥＳＴ　"); // フォーム項目設定メソッド
  data.set("password", PASSWORD); // パスワード項目設定メソッド
  data.set("requestId", REQUEST_ID); // 操作識別値の設定メソッド
  return data;
}

it( // 試験を登録する関数
  "メールだけ正規化し、パスワードの前後の空白を保持する",
  /**
   * メール形式の検証と正規化を分け、Auth用パスワードを加工しないことを確認する。
   */
  () => { // 認証入力の試験コールバック
    const data = form(); // 試験用フォーム生成関数
    data.set("returnTo", "https://foreign.example.test"); // 余分な項目の設定メソッド
    data.set("role", "DEVELOPER"); // 偽造権限の設定メソッド
    expect(parsePlatformLoginFormData(data)).toEqual({ // FormData検証関数 / 期待値生成・等値比較メソッド
      success: true,
      data: {
        email: "admin@example.test",
        password: PASSWORD,
        requestId: REQUEST_ID,
      },
    });
    expect(buildPlatformLoginFormValues(data)).toEqual({ // 表示値構築関数 / 期待値生成・等値比較メソッド
      email: "admin@example.test",
    });
    expect(data.get("password")).toBe(PASSWORD); // 項目読取メソッド / 期待値生成・等値比較メソッド
  },
);

it.each(["email", "password", "requestId"] as const)( // 項目別試験定義メソッド / 読取専用リテラル型
  "%sの欠落・重複・Fileを受け入れない",
  /**
   * 全必須項目の改ざんを、成功値や秘密値を含まない失敗へ変換する。
   */
  (field) => { // 項目別の試験コールバック
    for (const mode of ["missing", "duplicate", "file"]) {
      const data = form(); // 試験用フォーム生成関数
      if (mode === "missing") {
        data.delete(field); // 必須項目の削除メソッド
      } else if (mode === "duplicate") {
        data.append(field, String(data.get(field))); // 同名項目追加 / 値の文字列化 / 項目読取メソッド
      } else {
        data.set(field, new File([PASSWORD], "private.txt")); // 項目設定メソッド / Fileコンストラクター
      }
      const result = parsePlatformLoginFormData(data); // ログイン入力検証関数
      expect(result.success).toBe(false); // 期待値生成・拒否の比較メソッド
      if (!result.success) {
        expect(result.fieldErrors[field]).toBeDefined(); // 期待値生成・項目エラーの存在確認メソッド
        expect(JSON.stringify(result)).not.toContain(PASSWORD); // JSON文字列化 / 期待値生成・秘密値の非反射確認メソッド
        expect(Object.keys(result.values)).toEqual(["email"]); // キー列挙 / 期待値生成・公開項目の比較メソッド
      }
    }
  },
);

it.each(["", "invalid", "admin@", "admin@example.test another@example.test"])( // 不正メール別の試験定義メソッド
  "不正メールを正規化だけで成功にしない %#",
  /**
   * 正規化後にもメール形式を検証することを確認する。
   */
  (email) => { // 不正メールの試験コールバック
    const data = form(); // 試験用フォーム生成関数
    data.set("email", email); // メール項目設定メソッド
    expect(parsePlatformLoginFormData(data).success).toBe(false); // 入力検証関数 / 期待値生成・拒否の比較メソッド
  },
);

it.each(["", "invalid", "44444444-4444-7444-8444-444444444444"])( // 不正requestId別の試験定義メソッド
  "不正requestIdを認証前に拒否する %#",
  /**
   * 欠落・任意文字列・UUID v4以外を受け入れない。
   */
  (requestId) => { // 不正識別値の試験コールバック
    const data = form(); // 試験用フォーム生成関数
    data.set("requestId", requestId); // 識別値の設定メソッド
    const result = parsePlatformLoginFormData(data); // ログイン入力検証関数
    expect(result.success).toBe(false); // 期待値生成・拒否の比較メソッド
  },
);

it( // 試験を登録する関数
  "空パスワードを拒否し、空白文字列は勝手に加工しない",
  /**
   * 既存ログインと同じく空文字だけを拒否し、認証文字列の解釈をAuthへ委ねる。
   */
  () => { // パスワード境界の試験コールバック
    const data = form(); // 試験用フォーム生成関数
    data.set("password", ""); // 空パスワードの設定メソッド
    expect(parsePlatformLoginFormData(data).success).toBe(false); // 入力検証関数 / 期待値生成・拒否の比較メソッド
    data.set("password", " "); // 空白パスワードの設定メソッド
    const result = parsePlatformLoginFormData(data); // 入力検証関数
    expect(result.success).toBe(true); // 期待値生成・成功の比較メソッド
    if (result.success) {
      expect(result.data.password).toBe(" "); // 期待値生成・パスワード非加工の比較メソッド
    }
  },
);

it( // 試験を登録する関数
  "FormData以外でも秘密値を含まない失敗値を返す",
  /**
   * 型付きAPIを不正に呼び出しても、固定項目エラーだけを返すことを確認する。
   */
  () => { // 不正入力全体の試験コールバック
    const result = parsePlatformLoginFormData(null as unknown as FormData); // 入力検証関数 / 不明値・FormData型への意図的アサーション
    expect(result.success).toBe(false); // 期待値生成・拒否の比較メソッド
  },
);

it( // 試験を登録する関数
  "初期stateを共通化し、公開型へパスワードやセッションを含めない",
  /**
   * 初期表示・requestIdと、公開Action stateの最小型を確認する。
   */
  () => { // 公開型と初期stateの試験コールバック
    const state: PlatformLoginActionState = createInitialActionState({ // 公開ログインstate型 / 共通初期state生成関数
      ...PLATFORM_LOGIN_INITIAL_VALUES,
    });
    expect(isRequestId(state.requestId)).toBe(true); // UUID検証関数 / 期待値生成・比較メソッド
    expect(state.values).toEqual({ email: "" }); // 期待値生成・初期値の等値比較メソッド
    expectTypeOf<keyof PlatformLoginFormValues>() // 公開表示値のキー型を検査する関数
      .toEqualTypeOf<"email">(); // 公開項目のリテラル型一致メソッド
    expectTypeOf<PlatformLoginActionState["data"]>() // 公開stateの付加データ型を検査する関数
      .toEqualTypeOf<undefined>(); // セッション等のデータがない未定義型との一致検証メソッド
  },
);
