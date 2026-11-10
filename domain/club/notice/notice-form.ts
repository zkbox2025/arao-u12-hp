//domain/club/notice/notice-form.ts
//お知らせの入力値(生データ)をバリデーションしやすい形に変更する関数
//バリデーション関数



import type {
  FieldErrors,//フォームの入力項目ごとのエラーメッセージを格納する型
  ActionState,
} from "@/domain/shared/action-state";

import type {
  ClubNoticeGenre,//"IMPORTANT" | "SCHEDULE" | "EVENT" | "ACCOUNTING(会計、手続き)" | "GENERAL"
  ContentStatus,// "DRAFT" | "PUBLISHED"
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
} from "@/types/prisma";

import {
  isClubNoticeContentStatus,//入力値が有効な公開状態か確認する
  isClubNoticeGenre,//入力値が有効なお知らせジャンルか確認する
} from "@/domain/club/notice/notice-labels";

export const NOTICE_TITLE_MAX_LENGTH =
  120;

export const NOTICE_CONTENT_MAX_LENGTH =
  20_000;

  //お知らせフォームの送信型
export type ClubNoticeFormValues = {
  title: string;
  content: string;
  status: string;
  genre: string;

  isPinned: boolean;

  targetRoles: string[];

  requestReconfirmation:
    boolean;

  shouldNotifyLine: boolean;

  lineTargetIds: string[];

};

//お知らせの項目名の一覧を作成
export type ClubNoticeFormField =
  Extract<
    keyof ClubNoticeFormValues,
    string
  >
  | "attachmentFiles"
  | "deleteAttachmentIds";

  //バリデーション済みのデータの型
export type ValidClubNoticeInput = {
  title: string;
  content: string;
  status: ContentStatus;
  genre: ClubNoticeGenre;

  isPinned: boolean;

  targetRoles: string[];

  requestReconfirmation:
    boolean;

  shouldNotifyLine: boolean;

  lineTargetIds: string[];
};

export type ClubNoticeActionState=
  ActionState<
    ClubNoticeFormValues,
    ClubNoticeFormField
  >;

  // DBから取得したお知らせを編集フォームの初期値へ変換する関数の入力値
  type BuildClubNoticeInitialValuesInput = {
  title: string;
  content: string;
  status: ContentStatus;
  genre: ClubNoticeGenre;
  isPinned: boolean;
  targetRoles:
    ClubMemberRole[];
};



  //フォームデータ内の名前を取り出して文字列かを確認する関数（文字列ではなかったら空欄にする）
function getString(
  formData: FormData,
  name: string,
): string {
  const value = formData.get(name);

  return typeof value === "string"
    ? value
    : "";
}

//入力して送られたお知らせの生のデータをバリデーションしやすい形に変換する関数
export function buildClubNoticeFormValues(
  formData: FormData,
): ClubNoticeFormValues {
  return {
    title:
      getString(
        formData,
        "title",
      ).trim(),

    content:
      getString(
        formData,
        "content",
      ).trim(),

    status:
      getString(
        formData,
        "status",
      ),

    genre:
      getString(
        formData,
        "genre",
      ),

    isPinned://ピン留めチェックボックス（trueかfalse）
      formData.get("isPinned") ===
      "on",

    targetRoles: formData//複数選択された権限を安全な文字列として取得する
      .getAll("targetRoles")
      .filter(
        (value):
          value is string =>
            typeof value ===
            "string",
      ),

    requestReconfirmation://未読配信するかのチェックボックス（trueかfalse）
      formData.get(
        "requestReconfirmation",
      ) === "on",

    shouldNotifyLine:
    formData.get(
      "shouldNotifyLine",
    ) === "on",

    lineTargetIds:
    formData
      .getAll(
        "lineTargetIds",
      )
      .filter(
        (
          value,
        ): value is string =>
          typeof value ===
          "string",
      ),

  };
}

//お知らせフォームの送信データのバリデーション関数
export function validateClubNoticeFormValues(
  values: ClubNoticeFormValues,
):
  | {
      success: true;
      data: ValidClubNoticeInput;
    }
  | {
      success: false;
      fieldErrors:
        FieldErrors<ClubNoticeFormField>;
    } {
  const fieldErrors:
    FieldErrors<ClubNoticeFormField> =
      {};

  if (!values.title) {
    fieldErrors.title = [
      "タイトルを入力してください。",
    ];
  } else if (
    values.title.length >
    NOTICE_TITLE_MAX_LENGTH
  ) {
    fieldErrors.title = [
      `タイトルは${NOTICE_TITLE_MAX_LENGTH}文字以内で入力してください。`,
    ];
  }

  if (!values.content) {
    fieldErrors.content = [
      "本文を入力してください。",
    ];
  } else if (
    values.content.length >
    NOTICE_CONTENT_MAX_LENGTH
  ) {
    fieldErrors.content = [
      `本文は${NOTICE_CONTENT_MAX_LENGTH}文字以内で入力してください。`,
    ];
  }

  const status =
    isClubNoticeContentStatus(//入力値が有効な公開状態か確認する
      values.status,
    )
      ? values.status
      : null;

  if (!status) {
    fieldErrors.status = [
      "公開状態を確認してください。",
    ];
  }

  const genre =
    isClubNoticeGenre(//入力値が有効なお知らせジャンルか確認する
      values.genre,
    )
      ? values.genre
      : null;

  if (!genre) {
    fieldErrors.genre = [
      "お知らせの種類を確認してください。",
    ];
  }

  if (
  values.shouldNotifyLine &&
  status !== "PUBLISHED"
) {
  fieldErrors.shouldNotifyLine = [
    "LINE通知は公開時のみ利用できます。",
  ];
}

if (
  values.shouldNotifyLine &&
  values.lineTargetIds.length === 0
) {
  fieldErrors.lineTargetIds = [
    "LINE通知先を1件以上選択してください。",
  ];
}

  /*
   * statusとgenreのnull判定は、
   * TypeScriptへバリデーション済みであることを
   * 明示する目的もある。
   */
  if (
    Object.keys(fieldErrors)
      .length > 0 ||
    !status ||
    !genre
  ) {
    return {
      success: false,
      fieldErrors,
    };
  }

  return {
    success: true,
    data: {
      title: values.title,
      content: values.content,
      status,
      genre,
      isPinned:
        values.isPinned,
      targetRoles:
        values.targetRoles,
      requestReconfirmation:
        values.requestReconfirmation,
      shouldNotifyLine:
        values.shouldNotifyLine,
      lineTargetIds:
        values.shouldNotifyLine
    ? [
        ...new Set(
          values.lineTargetIds,
        ),
      ]
    : [],
    },
  };
}

// DBから取得したお知らせを編集フォームの初期値へ変換する。
export function buildClubNoticeInitialValues(
  notice:
    BuildClubNoticeInitialValuesInput,//引数
): ClubNoticeFormValues {//戻り値
  return {
    title: notice.title,
    content: notice.content,
    status: notice.status,
    genre: notice.genre,
    isPinned:
      notice.isPinned,
    targetRoles: [
      ...notice.targetRoles,
    ],

    // ページを開いた時点ではOFF
    requestReconfirmation:
      false,
    shouldNotifyLine: false,
    lineTargetIds: [],
  };
}