//domain/shared/email.ts
//メールアドレスを正規化する（整える）関数
//新規ユーザーをDBに登録するときや、ユーザーがログインするときなどに使用する

//全角を半角に直す
//前後の余計なスペースを消す
//大文字を全て小文字にする

//※メール形式が正しいかどうかを検証しない。他のファイルでZodでメール形式を検証する

export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").trim().toLowerCase();
}