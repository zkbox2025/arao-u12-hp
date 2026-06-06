// lib/security/hash.ts
//データをランダムな文字列に変換するための関数

import crypto from "crypto";//ハッシュ化を行う道具をインポート

export function hashValue(value: string) {

    //環境変数からソルトを取得
  const salt = process.env.FORM_LOG_HASH_SALT;

  if (!salt) {
    throw new Error("FORM_LOG_HASH_SALT is not defined");
  }

  // 「入力された文字」と「ソルト」を合体させて、SHA-256という方式でハッシュ化する
  return crypto
    .createHash("sha256")
    .update(`${value}:${salt}`)
    .digest("hex");//ハッシュ化された値を16進数の文字列として返す
}