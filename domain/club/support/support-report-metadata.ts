// domain/club/support/support-report-metadata.ts
//サポート報告ページで使われるメタデータの値（ページURlとユーザーエージェント：ブラウザやOSのデータ）が正しいかチェックし無害化安全化する関数

//ユーザーエージェント（User Agent）というデータの長さを、最大512文字までに制限する
export const SUPPORT_REPORT_USER_AGENT_MAX_LENGTH = 512;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;//怪しい文字が1つでも含まれているか調べる
const USER_AGENT_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/gu;//怪しい文字をすべて見つけて削除・置換する
const UNSAFE_SLUG_CHARACTER_PATTERN = /[/\\?#%]/u;//URLに使われると危険、または誤作動を起こしやすい特定の記号を検出するパターン

// 値（URL）が特定のクラブの正しいアカウントページのURLかを検証する関数
export function sanitizeSupportPageUrl(
  value: unknown,
  clubSlug: string,
): string | null {
  if (
    typeof value !== "string" ||
    typeof clubSlug !== "string" ||
    !clubSlug ||
    clubSlug !== clubSlug.trim() ||
    clubSlug === "." ||
    clubSlug === ".." ||
    UNSAFE_SLUG_CHARACTER_PATTERN.test(clubSlug) ||//URLに使われると危険、または誤作動を起こしやすい特定の記号をクラブスラッグから検出するパターン
    CONTROL_CHARACTER_PATTERN.test(clubSlug) ||//怪しい文字が1つでも含まれているか調べる
    CONTROL_CHARACTER_PATTERN.test(value)//怪しい文字が1つでも含まれているか調べる
  ) {
    return null;
  }

  // URI変換不能な不正サロゲートでも報告metadataのために例外を漏らさない。
  let accountPath: string;
  try {
    accountPath = `/club/${encodeURIComponent(clubSlug)}/account`;
  } catch {
    return null;
  }

  const path = value.split(/[?#]/u, 1)[0];//値（URL）の最後の部分を削除したものをpathとする
  return path === accountPath ? accountPath : null;
}

// 値を不正な文字の削除や長さのトリミング、空白除去する関数
export function sanitizeSupportUserAgent(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const sanitized = value
    .replace(USER_AGENT_CONTROL_CHARACTERS, "")//怪しい文字をすべて見つけて削除・置換する
    .trim()//空白除去
    .slice(0, SUPPORT_REPORT_USER_AGENT_MAX_LENGTH);//ユーザーエージェント（User Agent）というデータの長さを、最大512文字までに制限する
  return sanitized || null;
}
