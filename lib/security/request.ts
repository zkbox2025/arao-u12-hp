// lib/security/request.ts
//IPアドレス（ネット上の住所）（送信者のモバイル通信：au,softbankなどの基地局、やWifi機器の場所）』と『ユーザーエージェント（ブラウザやOSの種類）』を安全に特定して取得するのための関数

//順番⇩
//Vercelはアクセスを受けた際、自動的に x-forwarded-for や x-real-ip をヘッダーに正しく付与してくれる
//そのx-forwarded-for や x-real-ipを安全に取り出す関数がこのgetRequestMeta関数
//※userAgent はユーザーが使っているブラウザ（ChromeやSafariなど）が自動的に送信している情報

import { headers } from "next/headers";//アクセスしてきたユーザーのブラウザから送信される「ヘッダー情報（アクセス元の情報が詰まった書類のようなもの）」を読み取るための道具

export async function getRequestMeta() {
  const headersList = await headers();//ヘッダー情報を読み込む

  //特定の情報を取り出す
  //「x-forwarded-for」と「x-real-ip」はアクセス元のIPアドレスを特定するためのヘッダーで、ユーザーエージェントは「user-agent」というヘッダーに入っている
  const forwardedFor = headersList.get("x-forwarded-for");
  const realIp = headersList.get("x-real-ip");
  const userAgent = headersList.get("user-agent");

  //forwardedFor の先頭のIPアドレスを使う
  //forwardedForがない場合はrealIpを使う
  //どちらもない場合は「unknown」とする
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    realIp ||
    "unknown";

  return {
    ip,
    userAgent: userAgent || "unknown",
  };
}