// src/infrastructure/storage/pdf-file-validation.ts
// イベント・お知らせへ添付するPDFの基本検査を行う。

import "server-only";


//本物のPDFかを調べる型
const PDF_SIGNATURE = [
  0x25, // %
  0x50, // P
  0x44, // D
  0x46, // F
  0x2d, // -
] as const;

//ファイル名にバグを引き起こす危険な文字が含まれていないかを調べる型
const UNSAFE_FILE_NAME_PATTERN =
  /[\/\\\u0000-\u001f\u007f-\u009f]/u;

//一度にアップロードできるファイル数や容量の制限ルール
export type PdfFileLimits = {
  maxFiles: number;//最大ファイル数
  maxFileSizeBytes: number;//ファイル一つあたりの最大容量
  maxTotalSizeBytes: number;//ファイル合計の最大容量
};

/**
 * Server ActionのbodySizeLimitを4mbにする前提のMVP用設定。
 *
 * multipart/form-dataのオーバーヘッドを考慮し、
 * PDF本体の合計は3MBまでにする。
 */

//最大３mbしかアップロードできないような仕様にする
export const DEFAULT_PDF_FILE_LIMITS: PdfFileLimits =
  {
    maxFiles: 3,
    maxFileSizeBytes: 3 * 1024 * 1024,
    maxTotalSizeBytes: 3 * 1024 * 1024,
  };

//エラーコード一覧
export type PdfFileValidationIssueCode =
  | "TOO_MANY_FILES"//ファイル数が多すぎる
  | "EMPTY_FILE"//ファイルが空（０バイト）
  | "FILE_TOO_LARGE"//ファイルが大きすぎる
  | "TOTAL_SIZE_EXCEEDED"//合計サイズが大きすぎる
  | "INVALID_MIME_TYPE"//データ形式がPDFじゃない
  | "INVALID_EXTENSION"//拡張子が.pdfじゃない
  | "INVALID_SIGNATURE"//偽物のPDF
  | "UNSAFE_FILE_NAME";//ファイル名に危険な文字が入っている

  //エラーが起きた時にどんな情報を持たせるかを決める
export type PdfFileValidationIssue = {
  code: PdfFileValidationIssueCode;//エラーコード
  message: string;
  fileIndex?: number;//何番目のファイルでエラーが起きたか（複数同時にアップロードした時用）
};

//最終結果
export type PdfFileValidationResult =
  | {
      success: true;
      issues: [];
    }
  | {
      success: false;
      issues: PdfFileValidationIssue[];
    };

    //PDFバリデーション関数の引数
export type ValidatePdfFilesInput = {
  files: readonly File[];

  existingFileCount?: number;//編集する場合の既存ファイル数

  existingTotalSizeBytes?: number;//編集する場合の既存ファイルの合計容量

  limits?: Partial<PdfFileLimits>;//一度にアップロードできるファイル数や容量の制限ルールを上書きして変更できる引数
};

//値が1以上の安全な整数であるかの確認関数（開発者ミス防止）
function assertPositiveSafeInteger(
  value: number,
  name: string,
): void {
  if (
    !Number.isSafeInteger(value) ||//少数や大きすぎる数、NaNを弾く
    value <= 0//マイナスや０を弾く
  ) {
    throw new RangeError(
      `${name}は正の整数で指定してください。`,
    );
  }
}

//値が0以上の安全な整数であるかの確認関数
function assertNonNegativeSafeInteger(
  value: number,
  name: string,
): void {
  if (
    !Number.isSafeInteger(value) ||//少数や大きすぎる数、NaNを弾く
    value < 0//マイナスだけを弾く
  ) {
    throw new RangeError(
      `${name}は0以上の整数で指定してください。`,
    );
  }
}

//細かい数字を見てわかるようなMBに変換する関数（バイト→メガバイト）
function formatMegabytes(
  bytes: number,
): string {
  const megabytes =
    bytes / (1024 * 1024);//バイトをメガバイトに計算する

  return Number.isInteger(megabytes)
    ? `${megabytes}MB`//割り切れる場合はそのまま返す
    : `${megabytes.toFixed(1)}MB`;//割り切れない場合は少数第一位まで返す
}

//アップロードされたファイルが本物のPDFかを調べる関数（拡張子を偽装しただけの偽物じゃないか調べる）
async function hasPdfSignature(
  file: File,
): Promise<boolean> {
  if (file.size < PDF_SIGNATURE.length) {//本物のPDFファイルは%PDF- という5つの文字（5バイト）が刻印されているためその確認をする
    return false;
  }

  //先頭の先頭の５バイトを読み取る
  const header = new Uint8Array(
    await file
      .slice(0, PDF_SIGNATURE.length)
      .arrayBuffer(),
  );

//先頭の5バイトがPDF_SIGNATURE（本物のPDFであるかの検査型）に完全に一致するかを調べる
  return PDF_SIGNATURE.every(
    (expectedByte, index) =>
      header[index] === expectedByte,
  );
}

/**
 * PDFファイルの基本検査を行う。
 *
 * ウイルス・マルウェア検査ではない。
 */
export async function validatePdfFiles(
  input: ValidatePdfFilesInput,
): Promise<PdfFileValidationResult> {

    //アップロードの最大ファイル数や最大容量などの制限ルールを決定する
  const limits: PdfFileLimits = {
    ...DEFAULT_PDF_FILE_LIMITS,
    ...input.limits,
  };

  //制限ルールが正しい値か（０より大きい値か）をチェックする（開発者ミス防止）
  assertPositiveSafeInteger(
    limits.maxFiles,
    "maxFiles",
  );
  assertPositiveSafeInteger(
    limits.maxFileSizeBytes,
    "maxFileSizeBytes",
  );
  assertPositiveSafeInteger(
    limits.maxTotalSizeBytes,
    "maxTotalSizeBytes",
  );

  //編集の際の既存ファイルの数と容量を調べる（新規なら０）
  const existingFileCount =
    input.existingFileCount ?? 0;

  const existingTotalSizeBytes =
    input.existingTotalSizeBytes ?? 0;

    //ファイル数と容量が０以上の正しい数であるかを調べる
  assertNonNegativeSafeInteger(
    existingFileCount,
    "existingFileCount",
  );
  assertNonNegativeSafeInteger(
    existingTotalSizeBytes,
    "existingTotalSizeBytes",
  );

  //エラーを一時的に入れておくための空の箱を作成する
  const issues: PdfFileValidationIssue[] =
    [];

    //合計のファイル数を出す
  const finalFileCount =
    existingFileCount +
    input.files.length;


    //ファイル数をチェックして３個より多ければエラーを返す
  if (finalFileCount > limits.maxFiles) {
    issues.push({
      code: "TOO_MANY_FILES",
      message:
        `添付できるPDFは最大${limits.maxFiles}ファイルです。`,
    });
  }

  //アップロードされた容量の合計を出す
  const newFileTotalSize =
    input.files.reduce(
      (total, file) =>
        total + file.size,
      0,
    );

    //アップロードされた容量と既存の容量を足して合計容量を出す
  const finalTotalSize =
    existingTotalSizeBytes +
    newFileTotalSize;

    //合計容量がファイル合計の最大容量のルールより大きければエラーを返す
  if (
    finalTotalSize >
    limits.maxTotalSizeBytes
  ) {
    issues.push({
      code: "TOTAL_SIZE_EXCEEDED",
      message:
        `PDFの合計容量は${formatMegabytes(
          limits.maxTotalSizeBytes,
        )}以下にしてください。`,
    });
  }

  //一つずつファイルを取り出して（０番目、１番目、２番目...）個別ファイル検査をする
  for (
    let index = 0;//0から始める
    index < input.files.length;//ファイルの合計枚数を調べる
    index += 1//一回処理が終わるたびにindexの数値を１上げる
  ) {
    const file = input.files[index];//一つずつファイルという箱にデータを入れて処理し、次にindexをあげて二つ目のファイルを箱に入れるのを繰り返す

    //ファイルサイズが０バイトならエラーを出さずに次へ進む
    if (!file) {
      continue;
    }

    //ファイルの中身が完全に０ならエラーを記録する
    if (file.size === 0) {
      issues.push({
        code: "EMPTY_FILE",
        message:
          "空のファイルは添付できません。",
        fileIndex: index,
      });

      continue;
    }


    //ファイル１個あたりの重さが最大容量を超えていないかを確認する
    if (
      file.size >
      limits.maxFileSizeBytes
    ) {
      issues.push({
        code: "FILE_TOO_LARGE",
        message:
          `PDFは1ファイルにつき${formatMegabytes(
            limits.maxFileSizeBytes,
          )}以下にしてください。`,
        fileIndex: index,
      });
    }

    //ファイル名に危険な文字がないかのチェックを行う
    if (
      UNSAFE_FILE_NAME_PATTERN.test(
        file.name,
      )
    ) {
      issues.push({
        code: "UNSAFE_FILE_NAME",
        message:
          "ファイル名に使用できない文字が含まれています。",
        fileIndex: index,
      });
    }


    // データ形式を調べて.pdfじゃなかったらエラーを返す
    if (
      !file.name
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      issues.push({
        code: "INVALID_EXTENSION",
        message:
          "拡張子が.pdfのファイルを選択してください。",
        fileIndex: index,
      });
    }

    //ファイルの形式をチェックして公式なPDFの形式（application/pdf）であるかを調べる
    if (
      file.type !== "application/pdf"
    ) {
      issues.push({
        code: "INVALID_MIME_TYPE",
        message:
          "PDF形式のファイルを選択してください。",
        fileIndex: index,
      });
    }


    //アップロードされたファイルが本物のPDFかを調べる関数でファイルチェックをする
    if (!(await hasPdfSignature(file))) {
      issues.push({
        code: "INVALID_SIGNATURE",
        message:
          "PDFファイルの内容を確認できません。",
        fileIndex: index,
      });
    }
  }


  //エラーを貯める箱に一つでも入っていたら不合格
  if (issues.length > 0) {
    return {
      success: false,
      issues,
    };
  }

  //それ以外は合格
  return {
    success: true,
    issues: [],
  };
}