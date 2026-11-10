// tests/event-practice-batch-input-fields.test.ts
// 実Componentを静的描画し、共通入力のHTML契約を確認する。実ブラウザー操作は対象外。
import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import {
  EventPracticeBatchInputFields, // 定期練習の共通入力を表示するComponent
} from "@/app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchInputFields";
import {
  EVENT_LOCATION_MAX_LENGTH, // 開催場所の最大文字数
  EVENT_TITLE_MAX_LENGTH, // タイトルの最大文字数
} from "@/domain/club/event/event-form";
import type {
  EventPracticeBatchFormValues, // 定期練習のフォーム入力値の型
} from "@/domain/club/event/event-practice-batch-types";

/**
 * 実Componentから取り出した入力欄のprops。
 */
type Props = Parameters<typeof EventPracticeBatchInputFields>[0]; // 引数型取得の組込み型 / 共通入力Componentの型
/**
 * 要素のpropsを検証するための限定したReact要素型。
 */
type Element = ReactElement<Record<string, unknown>>; // React要素型 / 不明値の辞書型

/**
 * 月全体を期間とする親フォームの初期入力を用意する。
 */
function values(): EventPracticeBatchFormValues { // 初期入力生成関数 / 共通入力値の型
  return {
    targetMonth: "2026-11",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    weekdays: ["0", "6"],
    title: "定期練習",
    startTime: "09:00",
    endTime: "12:00",
    location: "グラウンド",
    meetingTime: "08:30",
    meetingLocation: "入口",
    targetRoles: ["OWNER", "MEMBER"],
  };
}

/**
 * 上書き可能なpropsを用意する。
 */
function props(overrides: Partial<Props> = {}): Props { // props生成関数 / 部分指定型 / Component props型
  return {
    idPrefix: "practice",
    values: values(), // 初期入力を生成する関数
    fieldErrors: {},
    disabled: false,
    ...overrides,
  };
}

/**
 * hookを置換せずに実Componentと既存の公開対象部品を静的描画する。
 */
function render(overrides: Partial<Props> = {}): string { // 静的描画関数 / 部分指定型 / 文字列型
  return renderToStaticMarkup( // React要素をHTMLへ描画する関数
    createElement(EventPracticeBatchInputFields, props(overrides)), // 要素生成関数 / 共通入力Component / props生成関数
  );
}

/**
 * 指定したnameのinput開始タグをHTMLから取り出す。
 */
function inputs(html: string, name: string): string[] { // 入力タグ取得関数 / 文字列型 / 配列型
  return [...html.matchAll(/<input\b[^>]*>/g)] // 入力タグを列挙するメソッド
    .map( // 一致した開始タグを取り出すメソッド
      /**
       * 正規表現で一致したタグの全文を返す。
       */
      (match) => match[0], // タグ抽出のコールバック
    )
    .filter( // 指定項目のタグに限定するメソッド
      /**
       * 固定された業務項目名の完全一致を調べる。
       */
      (tag) => tag.includes(`name="${name}"`), // 項目名を照合するコールバック / 部分文字列検査メソッド
    );
}

/**
 * hookを持つ子Componentを実行せず、表示ツリーに渡したpropsを集める。
 */
function elements(node: ReactNode): Element[] { // ツリー収集関数 / React子要素型 / 限定React要素の配列型
  const result: Element[] = []; // 収集するReact要素の配列型
  Children.forEach( // Reactの子要素を反復する関数
    node,
    /**
     * JSX要素と、そのchildrenだけを再帰的に収集する。
     */
    (child) => { // 子要素を集めるコールバック
      if (!isValidElement<Record<string, unknown>>(child)) { // React要素を判定する関数 / propsの辞書型
        return;
      }
      result.push(child); // 要素を追加するメソッド
      result.push(...elements(child.props.children as ReactNode)); // 追加メソッド / 子要素収集関数 / React子要素型へのアサーション
    },
  );
  return result;
}

it("月全体の初期期間と、必須・任意・文字数上限を表示する", // テストを登録する関数
  /**
   * 親が渡した月全体と既存Domain定数に一致する入力制約を確認する。
   */
  () => { // 初期表示を検証するコールバック
    const html = render(); // 共通入力を静的描画する関数
    for (const name of ["periodStart", "periodEnd"]) {
      const tag = inputs(html, name)[0]; // 項目の入力タグを取得する関数
      expect(tag).toContain('type="date"'); // 期待値生成関数 / 文字列包含の検証メソッド
      expect(tag).toContain('min="2026-11-01"'); // 期待値生成関数 / 下限の検証メソッド
      expect(tag).toContain('max="2026-11-30"'); // 期待値生成関数 / 上限の検証メソッド
      expect(tag).toContain('required=""'); // 期待値生成関数 / 必須の検証メソッド
    }
    expect(inputs(html, "periodStart")[0]).toContain('value="2026-11-01"'); // 期待値生成関数 / タグ取得関数 / 月初の検証メソッド
    expect(inputs(html, "periodEnd")[0]).toContain('value="2026-11-30"'); // 期待値生成関数 / タグ取得関数 / 月末の検証メソッド
    expect(inputs(html, "title")[0]).toContain(`maxLength="${EVENT_TITLE_MAX_LENGTH}"`); // 期待値生成関数 / タグ取得関数 / 文字数制約の検証メソッド
    for (const name of ["title", "startTime", "endTime"]) {
      expect(inputs(html, name)[0]).toContain('required=""'); // 期待値生成関数 / タグ取得関数 / 必須の検証メソッド
    }
    for (const name of ["location", "meetingLocation"]) {
      expect(inputs(html, name)[0]).toContain(`maxLength="${EVENT_LOCATION_MAX_LENGTH}"`); // 期待値生成関数 / タグ取得関数 / 上限の検証メソッド
    }
    for (const name of ["location", "meetingLocation", "meetingTime"]) {
      expect(inputs(html, name)[0]).not.toContain('required=""'); // 期待値生成関数 / タグ取得関数 / 任意入力の検証メソッド
    }
    expect(html).toContain("終了時刻は同日の開始時刻より後"); // 期待値生成関数 / 同日終了説明の検証メソッド
  },
);

it.each([ // 月末境界のパラメーター試験を登録する関数
  ["2028-02", "29"],
  ["1900-02", "28"],
  ["2000-02", "29"],
  ["0001-01", "31"],
  ["9999-12", "31"],
])("%sの月末を%s日として制約する", // パラメーター試験を登録する関数
  /**
   * 閏年・世紀・年1と9999でもUTCの月末がずれないことを確認する。
   */
  (targetMonth, day) => { // 月末制約を検証するコールバック
    const html = render({ // 静的描画関数
      values: {
        ...values(), // 初期値生成関数
        targetMonth,
      },
    });
    expect(inputs(html, "periodEnd")[0]).toContain(`max="${targetMonth}-${day}"`); // 期待値生成関数 / タグ取得関数 / 月末制約の検証メソッド
  },
);

it("不正な対象月を現在月へ置き換えず、エラー表示とともに保持する", // テストを登録する関数
  /**
   * 不正月から不正なmin・maxを組み立てたり、意図せず別月を選んだりしない。
   */
  () => { // 不正月の表示を検証するコールバック
    const html = render({ // 静的描画する関数
      values: {
        ...values(), // 初期値生成関数
        targetMonth: "2026-13",
      },
      fieldErrors: { targetMonth: ["対象月を確認してください。"] },
    });
    expect(inputs(html, "targetMonth")[0]).toContain('value="2026-13"'); // 期待値生成関数 / タグ取得関数 / 入力保持の検証メソッド
    expect(inputs(html, "periodStart")[0]).not.toMatch(/\b(?:min|max)=/); // 期待値生成関数 / タグ取得関数 / 境界未設定の検証メソッド
    expect(html).toContain('aria-describedby="practice-targetMonth-error"'); // 期待値生成関数 / エラー関連付けの検証メソッド
    expect(html).toContain("対象月を確認してください。"); // 期待値生成関数 / エラー内容の検証メソッド
  },
);

it("再表示用の値・空欄・複数曜日・公開対象を保持する", // テストを登録する関数
  /**
   * 初期値への巻き戻しや、必須欄の空欄を初期値で補う動作がないことを確認する。
   */
  () => { // 再表示値を検証するコールバック
    const data = values(); // 初期入力を生成する関数
    data.periodStart = "2026-11-03";
    data.periodEnd = "2026-11-25";
    data.title = "変更後の練習";
    data.startTime = "10:15";
    data.endTime = "11:45";
    data.meetingTime = "";
    data.meetingLocation = "";
    data.location = "変更後の場所";
    data.weekdays = ["2", "4"];
    data.targetRoles = ["OWNER", "COACH", "OFFICER"];
    const html = render({ values: data }); // 静的描画する関数
    for (const name of [ // 単一入力項目を反復する
      "periodStart",
      "periodEnd",
      "title",
      "startTime",
      "endTime",
      "meetingTime",
      "meetingLocation",
      "location",
    ] as const) { // 入力項目名を限定する読取専用リテラル型
      expect(inputs(html, name)[0]).toContain(`value="${data[name]}"`); // 期待値生成関数 / タグ取得関数 / 入力保持の検証メソッド
    }
    const selected = inputs(html, "weekdays").filter( // 曜日タグ取得関数 / 選択済みタグを絞るメソッド
      /**
       * 選択済みの曜日だけを抽出する。
       */
      (tag) => tag.includes('checked=""'), // 選択抽出のコールバック / 文字列包含を調べるメソッド
    );
    expect(selected).toHaveLength(2); // 期待値生成関数 / 選択数の検証メソッド
    expect(selected[0]).toContain('value="2"'); // 期待値生成関数 / 火曜選択の検証メソッド
    expect(selected[1]).toContain('value="4"'); // 期待値生成関数 / 木曜選択の検証メソッド
    for (const role of ["COACH", "OFFICER"]) {
      const tag = inputs(html, "targetRoles").find( // タグ取得関数 / 指定roleのタグを探すメソッド
        /**
         * 属性順序に依存せず指定roleを探す。
         */
        (input) => input.includes(`value="${role}"`), // role照合のコールバック / 包含検査メソッド
      );
      expect(tag).toContain('checked=""'); // 期待値生成関数 / 選択状態の検証メソッド
    }
    const empty = render({ // 静的描画関数
      values: {
        ...data,
        title: "",
        periodStart: "",
        endTime: "",
      },
    });
    for (const name of ["title", "periodStart", "endTime"]) {
      expect(inputs(empty, name)[0]).toContain('value=""'); // 期待値生成関数 / タグ取得関数 / 空欄保持の検証メソッド
    }
  },
);

it("曜日fieldsetと全入力のlabel・エラーIDを関連付ける", // テストを登録する関数
  /**
   * 単一欄・反復曜日・既存role欄のエラーを対応する入力グループへ結び付ける。
   */
  () => { // アクセシビリティ属性を検証するコールバック
    const fieldErrors: Props["fieldErrors"] = {}; // 共通入力propsから取り出した項目エラー型
    for (const name of [ // 入力項目名を反復する
      "periodStart",
      "periodEnd",
      "title",
      "startTime",
      "endTime",
      "location",
      "meetingTime",
      "meetingLocation",
      "weekdays",
      "targetRoles",
    ] as const) { // 項目名を限定する読取専用リテラル型
      fieldErrors[name] = [`${name}のエラー`];
    }
    const html = render({ fieldErrors }); // 静的描画する関数
    for (const name of [
      "periodStart",
      "periodEnd",
      "title",
      "startTime",
      "endTime",
      "location",
      "meetingTime",
      "meetingLocation",
    ]) {
      const tag = inputs(html, name)[0]; // 項目の入力タグを取得する関数
      expect(tag).toContain(`id="practice-${name}"`); // 期待値生成関数 / IDの検証メソッド
      expect(tag).toContain('aria-invalid="true"'); // 期待値生成関数 / 不正属性の検証メソッド
      expect(tag).toContain(`aria-describedby="practice-${name}-error"`); // 期待値生成関数 / エラーIDの検証メソッド
      expect(html).toContain(`for="practice-${name}"`); // 期待値生成関数 / labelの検証メソッド
      expect(html).toContain(`id="practice-${name}-error" role="alert"`); // 期待値生成関数 / エラー一覧の検証メソッド
    }
    expect(html).toContain("対象曜日（必須・複数選択可）"); // 期待値生成関数 / legendの検証メソッド
    expect(html).toContain('aria-describedby="practice-weekdays-help practice-weekdays-error"'); // 期待値生成関数 / 曜日エラーの関連付け検証メソッド
    expect(html).toContain('aria-describedby="practice-target-roles-error"'); // 期待値生成関数 / 公開対象エラーの検証メソッド
    const weekdays = inputs(html, "weekdays"); // 曜日入力を取得する関数
    expect(weekdays).toHaveLength(7); // 期待値生成関数 / 曜日数の検証メソッド
    for (let index = 0; index < 7; index += 1) {
      expect(weekdays[index]).toContain(`value="${index}"`); // 期待値生成関数 / 曜日値の検証メソッド
      expect(html).toContain(`for="practice-weekday-${index}"`); // 期待値生成関数 / 曜日labelの検証メソッド
      expect(weekdays[index]).not.toContain('required=""'); // 期待値生成関数 / 全曜日必須ではないことの検証メソッド
    }
  },
);

it("OWNERは常時対象で、保存・公開・通知などの項目を持ち込まない", // テストを登録する関数
  /**
   * 任意roleが空でもOWNERを送信し、この粒度の入力範囲だけを表示する。
   */
  () => { // 公開対象と範囲を検証するコールバック
    const html = render({ // 静的描画関数
      values: {
        ...values(), // 初期値生成関数
        targetRoles: [],
      },
    });
    expect(inputs(html, "targetRoles")[0]).toContain('type="hidden"'); // 期待値生成関数 / タグ取得関数 / hidden属性の検証メソッド
    expect(inputs(html, "targetRoles")[0]).toContain('value="OWNER"'); // 期待値生成関数 / タグ取得関数 / OWNER送信の検証メソッド
    expect(html).toContain("代表者は常に公開対象へ含まれます。"); // 期待値生成関数 / OWNER説明の検証メソッド
    expect(html).not.toContain("<form"); // 期待値生成関数 / 親フォーム未実装の検証メソッド
    for (const name of [
      "status",
      "genre",
      "clubId",
      "selectedDates",
      "requestId",
      "previewFingerprint",
      "lineTargets",
      "attachments",
    ]) {
      expect(inputs(html, name)).toHaveLength(0); // 期待値生成関数 / タグ取得関数 / 対象外項目不存在の検証メソッド
    }
  },
);

it("disabled時はfieldset全体と公開対象の操作を止める", // テストを登録する関数
  /**
   * 親が送信中や保存済みの入力変更を止められるHTML契約を確認する。
   */
  () => { // 操作無効を検証するコールバック
    const html = render({ disabled: true }); // 静的描画する関数
    expect(html).toMatch(/^<fieldset disabled=""/); // 期待値生成関数 / 全体無効属性の検証メソッド
    expect(html).toMatch(/<button[^>]*disabled=""/); // 期待値生成関数 / 全選択無効の検証メソッド
    for (const tag of inputs(html, "targetRoles")) { // 公開対象入力タグを取得する関数
      if (tag.includes('type="checkbox"')) { // checkboxか調べるメソッド
        expect(tag).toContain('disabled=""'); // 期待値生成関数 / checkbox無効の検証メソッド
      }
    }
    expect(render()).not.toMatch(/^<fieldset disabled/); // 期待値生成関数 / 静的描画関数 / 通常操作可の検証メソッド
  },
);

it("文字列をHTMLとして実行せず、入力値とエラーをエスケープする", // テストを登録する関数
  /**
   * タイトル・場所・対象月・エラー経由のHTML注入を防ぐ表示を確認する。
   */
  () => { // HTMLエスケープを検証するコールバック
    const attack = '<img src=x onerror="alert(1)">';
    const html = render({ // 静的描画する関数
      idPrefix: 'practice" data-attack="yes',
      values: { // 初期値を上書きする
        ...values(), // 初期値を生成する関数
        targetMonth: attack,
        title: attack,
        location: attack,
        meetingLocation: attack,
      },
      fieldErrors: {
        title: [attack],
        weekdays: [attack],
        targetRoles: [attack],
      },
    });
    expect(html).not.toContain("<img"); // 期待値生成関数 / HTML非生成の検証メソッド
    expect(html).toContain("&lt;img"); // 期待値生成関数 / 文字列化の検証メソッド
    expect(html).not.toContain(' data-attack="yes"'); // 期待値生成関数 / 属性注入防止の検証メソッド
  },
);

it("単一欄・曜日・公開対象の変更通知を親へ渡す", // テストを登録する関数
  /**
   * 公開対象の全選択も親のpreview無効化で検知できるよう通知関数を渡す。
   */
  () => { // 変更通知の接続を検証するコールバック
    const onChange = vi.fn(); // 変更通知を記録するmock生成関数
    const nodes = elements(EventPracticeBatchInputFields(props({ onChange }))); // 要素収集関数 / 共通入力Component / props生成関数
    const handlers = nodes.filter( // 通知を渡した要素を抽出するメソッド
      /**
       * 親から渡した通知関数を保持する要素を探す。
       */
      (node) => node.props.onChange === onChange, // 関数参照を比較するコールバック
    );
    expect(handlers).toHaveLength(16); // 期待値生成関数 / 単一8・曜日7・role1の接続数検証メソッド
    for (const node of handlers) {
      const notify = node.props.onChange as () => void; // 親への通知関数型へのアサーション
      notify(); // 親へ変更を通知する関数
    }
    expect(onChange).toHaveBeenCalledTimes(16); // 期待値生成関数 / 通知回数の検証メソッド
  },
);
