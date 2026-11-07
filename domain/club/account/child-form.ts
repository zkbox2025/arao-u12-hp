// domain/club/account/child-form.ts
// //子どもに関する入力値やchildIdのバリデーションファイル

import type {
  ActionState,//アクションステイトの型
  FieldErrors,//エラー項目の型
} from "@/domain/shared/action-state";
import {
  isRequestId,//値がUUID v4形式か検証する。
} from "@/domain/shared/request-id";
import type {
  Grade,//"YOUJI" | "ELEMENTARY_1" | "ELEMENTARY_2" | "ELEMENTARY_3" | "ELEMENTARY_4" | "ELEMENTARY_5" | "ELEMENTARY_6"
} from "@/types/prisma";

import {
  validateAccountNameInput,//アカウント名の入力値のバリデーション関数
} from "./account-form";

//子どもの学年のバリューとラベル一覧
// 未設定の選択肢はvalue=""で扱う。
export const CHILD_GRADE_OPTIONS = [
  {
    value: "YOUJI",
    label: "幼児",
  },
  {
    value: "ELEMENTARY_1",
    label: "小学1年",
  },
  {
    value: "ELEMENTARY_2",
    label: "小学2年",
  },
  {
    value: "ELEMENTARY_3",
    label: "小学3年",
  },
  {
    value: "ELEMENTARY_4",
    label: "小学4年",
  },
  {
    value: "ELEMENTARY_5",
    label: "小学5年",
  },
  {
    value: "ELEMENTARY_6",
    label: "小学6年",
  },
] as const satisfies ReadonlyArray<{//DBを変えたらここも変えないとエラーになる仕様
  value: Grade;//"YOUJI" | "ELEMENTARY_1" | "ELEMENTARY_2" | "ELEMENTARY_3" | "ELEMENTARY_4" | "ELEMENTARY_5" | "ELEMENTARY_6"
  label: string;
}>;

//子どものフォームの値の型
export type ChildFormValues = {
  name: string;
  grade: string;
};

export type ChildFormField = keyof ChildFormValues;//子どものフォームの値の項目だけを抜き出した型

export type ChildActionState = ActionState<//アクションステイトの型
  ChildFormValues,//子どものフォームの値の型
  ChildFormField//子どものフォームの項目の型
>;

//子どものバリデーションの結果
export type ChildValidationResult =
  | {
      success: true;
      data: {
        name: string;
        grade: Grade | null;//"YOUJI" | "ELEMENTARY_1" | "ELEMENTARY_2" | "ELEMENTARY_3" | "ELEMENTARY_4" | "ELEMENTARY_5" | "ELEMENTARY_6"
      };
    }
  | {
      success: false;
      fieldErrors: FieldErrors<ChildFormField>;//子どものフォームの項目を項目エラーの型に入れる
    };

    //子どものメンバーシップのフォームの値
export type ChildMembershipFormValues = {
  childId: string;
};

//子どものメンバーシップのアクションステイト
export type ChildMembershipActionState = ActionState<//以下をアクションステイトの型へ入れたものの型
  ChildMembershipFormValues,//子どものメンバーシップのフォームの値
  "childId"
>;

//子どものIDをバリデーションした結果の型
export type ChildIdValidationResult =
  | {
      success: true;
      data: ChildMembershipFormValues;//子どものメンバーシップのフォームの値
    }
  | {
      success: false;
      fieldErrors: FieldErrors<"childId">;//エラー項目の型にchildIdを入れる
    };

// 値が学年の値（"ELEMENTARY_1"など）かをチェックする関数
function isGrade(value: unknown): value is Grade {//値が以下に含まれてるかを検証する関数："YOUJI" | "ELEMENTARY_1" | "ELEMENTARY_2" | "ELEMENTARY_3" | "ELEMENTARY_4" | "ELEMENTARY_5" | "ELEMENTARY_6"
  return CHILD_GRADE_OPTIONS.some((option) => option.value === value);//子どもの学年のバリューとラベル一覧の中に一致するものが一つでもあるかを一つずつチェックする。
}

//子どもに関する入力値のバリデーション関数
export function validateChildInput(
  input: unknown,
): ChildValidationResult {//子どものバリデーションの結果
  const nameResult = validateAccountNameInput(input);//アカウント名の入力値のバリデーション関数
  const rawGrade = typeof input === "object" &&//入力値がオブジェクトであり、かつ
    input !== null &&//nullではなく、かつ
    !Array.isArray(input) &&//配列ではなく、かつ
    "grade" in input//入力値にgradeの項目がある
    ? input.grade//上記の全てがクリアしてるならrawGrade＝input.grade
    : undefined;//一つでも違うならrawGrade＝undefined
  const grade = rawGrade === "" ||
    rawGrade === null
    ? null
    : isGrade(rawGrade)// 値が学年の値（"ELEMENTARY_1"など）かをチェックする関数
      ? rawGrade
      : undefined;
  const fieldErrors: FieldErrors<ChildFormField> = {};//エラー項目の型に子どものフォームの項目の型を入れる

  if (!nameResult.success) {
    fieldErrors.name = nameResult.fieldErrors.name;
  }
  if (grade === undefined) {
    fieldErrors.grade = ["学年は未設定、または選択肢から選んでください。"];
  }

  if (
    !nameResult.success ||
    grade === undefined
  ) {
    return {
      success: false,
      fieldErrors,
    };
  }

  return {
    success: true,
    data: {
      name: nameResult.data.name,//バリデーションの結果のデータの中のname
      grade,
    },
  };
}

//フォームデータから子どもの名前と学年を抜き出して検証し復元する関数
export function parseChildFormData(
  formData: FormData,
): ChildValidationResult {//子どものバリデーションの結果
  //フォームデータが正常なら名前と学年を抜き出す。異常なら空欄
  const names = formData instanceof FormData ? formData.getAll("name") : [];
  const grades = formData instanceof FormData ? formData.getAll("grade") : [];

  return validateChildInput({//子どもに関する入力値のバリデーション関数
    name: names.length === 1 ? names[0] : undefined,
    grade: grades.length === 1 ? grades[0] : undefined,
  });
}

//子どものIDがUUID v4形式かを検証する関数
export function validateChildIdInput(
  childId: unknown,
): ChildIdValidationResult {//子どものIDをバリデーションした結果の型
  if (!isRequestId(childId)) {//childIdがUUID v4形式ではない場合
    return {
      success: false,
      fieldErrors: {
        childId: ["対象の子どもを選び直してください。"],
      },
    };
  }

  return {
    success: true,
    data: {
      childId,
    },
  };
}

//フォームデータからchildIdを抜き出して検証し復元する関数
export function parseChildIdFormData(
  formData: FormData,
): ChildIdValidationResult {//子どものIDをバリデーションした結果の型
  const ids = formData instanceof FormData ? formData.getAll("childId") : [];//フォームデータが正常ならchildIdを抜き出し、異常なら空欄にする

  return validateChildIdInput(ids.length === 1 ? ids[0] : undefined);//子どものIDがUUID v4形式かを検証する
}
