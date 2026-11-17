// domain/club/support/support-report-form.ts
//不具合・サポート報告の型一覧、バリデーション関数

import type {
  ActionState,//アクションステイトの型
  FieldErrors,//項目エラーの型
} from "@/domain/shared/action-state";
import type {
  SupportReportCategory,//"BUG" | "QUESTION" | "REQUEST" | "OTHER"
} from "@/types/prisma";

export const SUPPORT_REPORT_MESSAGE_MAX_LENGTH = 2000;//サポート報告メッセージの長さの最大値（2000文字）

//不具合・サポート報告のカテゴリーのバリューとラベル一覧
export const SUPPORT_REPORT_CATEGORY_OPTIONS = [
  {
    value: "BUG",
    label: "不具合",
  },
  {
    value: "QUESTION",
    label: "質問",
  },
  {
    value: "REQUEST",
    label: "改善要望",
  },
  {
    value: "OTHER",
    label: "その他",
  },
] as const satisfies readonly {//以下に含まれているものだけ許可する
  value: SupportReportCategory;//"BUG" | "QUESTION" | "REQUEST" | "OTHER"
  label: string;
}[];

//サポート報告のフォームの値
export type SupportReportFormValues = {
  category: SupportReportCategory;//"BUG" | "QUESTION" | "REQUEST" | "OTHER"
  message: string;
};

//サポート報告のフォーム項目
export type SupportReportFormField = keyof SupportReportFormValues;//サポート報告のフォームの値のキー

export type SupportReportActionState = ActionState<//アクションステイトの型
  SupportReportFormValues,//サポート報告のフォームの値
  SupportReportFormField//サポート報告のフォーム項目
>;

//サポート報告の初期値（バグ）
export const SUPPORT_REPORT_INITIAL_VALUES: Readonly<SupportReportFormValues> = {//サポート報告のフォームの値
  category: "BUG",
  message: "",
};
//サポート報告の承諾メッセージ
export const SUPPORT_REPORT_ACCEPTED_MESSAGE =
  "不具合報告を受け付けました。開発チームにて確認し、サービスの改善に役立てさせていただきます。ご協力ありがとうございます。";
//サポート報告の送信失敗メッセージ
export const SUPPORT_REPORT_FAILED_MESSAGE =
  "送信できませんでした。時間をおいてもう一度お試しください。";

  //サポート報告のバリデーション結果の型
export type SupportReportValidationResult =
  | {
      success: true;
      data: SupportReportFormValues;//サポート報告のフォームの値
    }
  | {
      success: false;
      fieldErrors: FieldErrors<SupportReportFormField>;//項目エラーの型にサポート報告のフォーム項目を入れる
    };

//値が不具合・サポート報告のカテゴリーのバリューとラベル一覧に含まれてるかをチェックする関数
function isSupportReportCategory(value: unknown): value is SupportReportCategory {//"BUG" | "QUESTION" | "REQUEST" | "OTHER"
  return SUPPORT_REPORT_CATEGORY_OPTIONS.some((option) => option.value === value);//不具合・サポート報告のカテゴリーのバリューとラベル一覧に含まれてるかをチェックする
}

//フォームデータから項目を抜き出して単一の文字列であるかをチェックする関数
function singleFormString(
  formData: FormData,
  field: SupportReportFormField,//サポート報告のフォーム項目
): string | undefined {
  const entries = formData instanceof FormData ? formData.getAll(field) : [];//正しいフォームデータの形なら項目を抜き出す。壊れてるなら空欄
  return (
    entries.length === 1 &&//たった一つ、かつ
    typeof entries[0] === "string"//データが文字列ならそれを返す
  ) ? entries[0] : undefined;
}

//サポート報告のフォームの値を生成する関数
export function buildSupportReportFormValues(
  formData: FormData,
): SupportReportFormValues {//サポート報告のフォームの値
  const category = singleFormString(formData, "category");//フォームデータから項目を抜き出して単一の文字列であるかをチェックする関数
  const message = singleFormString(formData, "message");//フォームデータから項目を抜き出して単一の文字列であるかをチェックする関数
  return {
    category: isSupportReportCategory(category) ? category : "BUG",//値が不具合・サポート報告のカテゴリーのバリューとラベル一覧に含まれていればそのカテゴリーで、当てはまらないならデフォルトの"BUG"をカテゴリーにする
    message: (message ?? "").slice(0, SUPPORT_REPORT_MESSAGE_MAX_LENGTH),//サポート報告メッセージを最大値（2000文字）までに切り取る
  };
}

//サポート報告の入力値（カテゴリーとメッセージ）をバリデーションする関数
export function validateSupportReportInput(
  input: unknown,
): SupportReportValidationResult {//サポート報告のバリデーション結果の型
  const record = (
    typeof input === "object" &&//入力値がオブジェクトであり、かつ
    input !== null &&//nullではなく、かつ
    !Array.isArray(input)//配列ではない場合、recordをキーは文字列だけど値がまだわからない状態のオブジェクトとする。
  ) ? input as Record<string, unknown> : undefined;
  const category = isSupportReportCategory(record?.category) ? record.category : null;//ecord?.categoryが不具合・サポート報告のカテゴリーのバリューとラベル一覧に含まれていればecord?.categoryを返す
  const message = typeof record?.message === "string" ? record.message.trim() : "";//record?.messageが文字列なら空白除去して、違うなら空欄
  const fieldErrors: FieldErrors<SupportReportFormField> = {};//項目エラーの型にサポート報告のフォーム項目を入れる

  if (category === null) {
    fieldErrors.category = ["種別を選択してください。"];
  }
  if (!message) {
    fieldErrors.message = ["内容を入力してください。"];
  } else if (message.length > SUPPORT_REPORT_MESSAGE_MAX_LENGTH) {//サポート報告メッセージの長さの最大値（2000文字）より長かったなら以下をエラーとして返す
    fieldErrors.message = ["内容は2000文字以内で入力してください。"];
  }
  if (
    category === null ||
    fieldErrors.message !== undefined
  ) {
    return {
      success: false,
      fieldErrors,
    };
  }
  return {
    success: true,
    data: {
      category,
      message,
    },
  };
}

//サポート報告のフォームデータを受け取りバリデーション関数に渡し結果を返す関数
export function parseSupportReportFormData(
  formData: FormData,
): SupportReportValidationResult {//サポート報告のバリデーション結果の型
  return validateSupportReportInput({//サポート報告の入力値（カテゴリーとメッセージ）をバリデーションする関数
    category: singleFormString(formData, "category"),//フォームデータから項目を抜き出して単一の文字列であるかをチェックする関数
    message: singleFormString(formData, "message"),//フォームデータから項目を抜き出して単一の文字列であるかをチェックする関数
  });
}
