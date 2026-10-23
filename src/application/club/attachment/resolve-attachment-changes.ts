// src/application/club/attachment/resolve-attachment-changes.ts
//イベント・お知らせ共通のPDF差分解決
//PDFの編集（追加や削除）が発生したときに、バグや不正な操作が起きないようデータを整理し、
// 次に必要な情報をすべて揃えてくれる『司令塔』のような関数

import "server-only";

import {
  validatePdfFiles,// イベント・お知らせへ添付するPDFの基本検査を行う。
} from "@/src/infrastructure/storage/pdf-file-validation";


//既存の添付PDFファイル情報
export type ExistingClubAttachment = {
  id: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  displayOrder: number;
};

//「最終的にどういう変更をストレージやDBに反映すべきか」をまとめたデータ
export type ResolvedAttachmentChanges = {
  keepAttachments://既存のまま残すファイル（削除しなかったもの）
    ExistingClubAttachment[];

  deleteAttachments://削除するファイル
    ExistingClubAttachment[];

  newFiles: File[];//新しくアップロードするファイル

  nextDisplayOrder: number;//並び順の基準値
};


//複数のPDFエラーを箇条書きで表示するためのファイル
export class AttachmentInputError
  extends Error {
  readonly messages: string[];//複数のエラーメッセージの配列

  constructor(
    messages: string[],
  ) {
    super(
      messages[0] ??//１件目のエラーメッセージを渡して初期化する
        "PDF添付を確認してください。",
    );

    this.name =//名前を書き換える
      "AttachmentInputError";

    this.messages = messages;//エラーメッセージ全件を保存する
  }
}



// フォームデータから、画面で実際に選択されたPDFだけを取得する。
export function getPdfFilesFromFormData(
  formData: FormData,
  fieldName =
    "attachmentFiles",

  // ContentAttachmentFieldsetが送信する選択件数
  countFieldName =
    "attachmentFilesCount",
): File[] {
  const rawSelectedFileCount =
    formData.get(
      countFieldName,
    );

  /*
   * 選択件数が送られていない、または不正な場合は
   * 新規PDFなしとして扱う。
   *
   * Actionを直接呼び出されても、
   * 意図しないファイルを保存しない安全側の動作になる。
   */
  if (
    typeof rawSelectedFileCount !==
      "string" ||
    !/^[0-9]+$/u.test(
      rawSelectedFileCount,
    )
  ) {
    return [];
  }

  const selectedFileCount =
    Number(
      rawSelectedFileCount,
    );

  /*
   * 画面側で0件なら、ブラウザやmultipartパーサーが
   * どんな名前の0バイトFileを生成しても無視する。
   */
  if (
    !Number.isSafeInteger(
      selectedFileCount,
    ) ||
    selectedFileCount <= 0
  ) {
    return [];
  }

  /*
   * 1件以上選択されている場合はFileをすべて返す。
   *
   * 名前のある実際の0バイトPDFもここでは残るため、
   * 後段のvalidatePdfFiles()で従来どおり拒否される。
   */
  return formData
    .getAll(fieldName)
    .filter(
      (
        value,//本物のファイルのみに絞り込む
      ): value is File =>
        value instanceof File,
    );
}

//フォームデータから、指定した名前の『文字列（テキスト）』だけをきれいに抜き出してリスト（配列）にする関数
export function getStringArrayFromFormData(
  formData: FormData,
  fieldName: string,
): string[] {
  return formData
    .getAll(fieldName)
    .filter(//文字列だけにするためのフィルター
      (
        value,
      ): value is string =>
        typeof value ===
        "string",
    );
}

//PDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
export async function resolveAttachmentChanges(
  input: {
    existingAttachments:
      readonly ExistingClubAttachment[];//既存の添付PDFファイル情報

    deleteAttachmentIds://削除するファイルID
      readonly string[];

    newFiles://新しくアップロードするファイル
      readonly File[];
  },
): Promise<ResolvedAttachmentChanges> {

  // 削除IDの重複のない集合に変換
  const deleteIdSet =
    new Set(
      input.deleteAttachmentIds,
    );

    //既存の添付PDFファイル情報をIDとファイルデータのペアにマッピングして検索しやすいようにする
  const existingById =
    new Map(
      input.existingAttachments.map(
        (attachment) => [
          attachment.id,
          attachment,
        ],
      ),
    );

  //既存の添付PDFファイル内に削除IDがなければエラーを投げる
  for (
    const deleteId
    of deleteIdSet
  ) {
    if (
      !existingById.has(
        deleteId,
      )
    ) {
      throw new AttachmentInputError([
        "削除対象のPDFが正しくありません。画面を再読み込みしてください。",
      ]);
    }
  }

  //既存の添付PDFファイル情報の中から、「削除IDリストに含まれているファイル」だけを抜き出す
  const deleteAttachments =
    input.existingAttachments.filter(
      (attachment) =>
        deleteIdSet.has(
          attachment.id,
        ),
    );

    //既存の添付PDFファイル情報の中から「削除IDリストに含まれていない（＝残す）ファイル」だけを抜き出します。
  const keepAttachments =
    input.existingAttachments.filter(
      (attachment) =>
        !deleteIdSet.has(
          attachment.id,
        ),
    );

    //「削除するものを除いた（＝残すことになった）既存のファイル」と
    // 「新しくアップロードしたファイル」の2つを組み合わせてバリデーション
  const validation =
    await validatePdfFiles({
      files: input.newFiles,

      existingFileCount:
        keepAttachments.length,

      existingTotalSizeBytes:
        keepAttachments.reduce(
          (
            total,
            attachment,
          ) =>
            total +
            attachment.sizeBytes,
          0,
        ),
    });

  if (!validation.success) {
    throw new AttachmentInputError(
      validation.issues.map(
        (issue) =>
          issue.message,
      ),
    );
  }

  const nextDisplayOrder =
    keepAttachments.length === 0
      ? 0//既存のファイルがなければ 0 にする
      : Math.max(//今あるファイルの中で『一番大きい並び順の番号』を見つけて、それに1を足して安全に処理する
          ...keepAttachments.map(
            (attachment) =>
              attachment
                .displayOrder,
          ),
        ) + 1;

  return {
    keepAttachments: [
      ...keepAttachments,
    ],

    deleteAttachments: [
      ...deleteAttachments,
    ],

    newFiles: [
      ...input.newFiles,
    ],

    nextDisplayOrder,
  };
}