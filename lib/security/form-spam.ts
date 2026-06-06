// lib/security/form-spam.ts
// フォーム送信時の簡易スパム判定関数

const MIN_SUBMIT_TIME_MS = 3000;//フォーム送信にかかる最低限の時間：3秒

//フォームデータの送信があったら発動する関数でハニーポットの透明トラップをチェック
export function isHoneypotFilled(formData: FormData) {
  const honeypot = formData.get("company");//送信データ内の「company(透明な罠)を取り出す」

  return typeof honeypot === "string" && honeypot.trim() !== "";//中身があったらtrue(罠にかかった)を返す
}

//フォームデータの送信があったら発動する関数で送信スピードをチェック
export function isTooFastSubmit(formStartedAt: FormDataEntryValue | null) {
     // もし「ページを開いた時刻」のデータが文字として存在しなければ、怪しいので「true（不正だからボット）」
  if (typeof formStartedAt !== "string") {
    return true;
  }

  //「ページを開いた時刻」のデータを計算できる「数字（ミリ秒）」に変換する
  const startedAt = Number(formStartedAt);

  //もし数字への変換に失敗したら（不正な文字が送られてきたら）「true（不正だからボット）」とする
  if (Number.isNaN(startedAt)) {
    return true;
  }

  //「たった今の時刻（Date.now()）」から「ページを開いた時刻」を引き算して、かかった時間を計算する
  const elapsedMs = Date.now() - startedAt;

  //かかった時間が、基準（3秒）よりも短ければ「true（早すぎるからボット）」を返す
  return elapsedMs < MIN_SUBMIT_TIME_MS;
}