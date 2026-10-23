//domain/shared/file-size.ts
// PDFなどのファイルサイズを表示用文字列へ変換する共通関数


//PDFのファイルのサイズを人が理解できる単位に自動変換する関数
export function formatFileSize(
  sizeBytes: number,
): string {
  if (sizeBytes < 1_024) {//１KB以下はBをつけて返す
    return `${sizeBytes} B`;
  }

  const kiloBytes =//BをKB（kiloBytes）に変える
    sizeBytes / 1_024;

  if (kiloBytes < 1_024) {//1MB以下ならKBをつける
    return `${kiloBytes.toFixed(1)} KB`;
  }

  return `${(//それ以上はMB
    kiloBytes / 1_024
  ).toFixed(1)} MB`;
}


