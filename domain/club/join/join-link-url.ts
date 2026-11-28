// domain/club/join/join-link-url.ts
// 参加リンクのURLの作成と、QRコードの図形(SVGのパス)の作成をする純粋関数。
// 設計:docs/implementation/phases/member-join-link-plan.md(5.1)

import { encode } from "uqr"; // QRコードのモジュール(黒白の格子)を作る外部ライブラリの関数

/** QRコードの周囲に空ける余白(モジュール数)。読み取りに必要な最小の4。 */
export const CLUB_JOIN_QR_QUIET_ZONE = 4;

/** QRコードの図形。SVGの viewBox の一辺と、黒いモジュールのパスを持つ。 */
export type ClubJoinQrShape = {
  viewBoxSize: number; // 余白を含む一辺のモジュール数
  path: string; // 黒いモジュールを塗るSVGのpath要素のd属性
};

/**
 * 参加リンクのURLの、origin(スキーム+ホスト)を決める。
 * クラブの設定(appBaseUrl)を優先し、なければ環境の既定値を使う。
 * @param input クラブの設定値・環境の既定値・本番かどうか。
 * @returns 末尾のパスを含まないorigin。設定が不正ならnull。
 */
export function resolveClubJoinOrigin(input: {
  clubAppBaseUrl: string | null; // クラブに設定されたアプリのURL
  fallbackOrigin: string | undefined; // クラブに設定がないときの既定のURL
  isProduction: boolean; // 本番ならtrue(httpsだけを許す)
}): string | null {
  const configured = input.clubAppBaseUrl?.trim() || input.fallbackOrigin?.trim(); // 前後の空白を除く標準の文字列関数

  if (!configured) {
    return null;
  }

  let url: URL; // URLの型(標準)

  try {
    url = new URL(configured); // URLを解析する標準のコンストラクタ
  } catch {
    return null;
  }

  const isAllowedProtocol =
    url.protocol === "https:" || (!input.isProduction && url.protocol === "http:");

  if (!isAllowedProtocol || url.pathname !== "/" || url.search || url.hash) {
    return null;
  }

  return url.origin;
}

/**
 * 参加リンクのURLを作る。
 * @param input origin・クラブのURL識別子・生トークン。
 * @returns 保護者に配る、参加ページのURL。
 */
export function buildClubJoinUrl(input: {
  origin: string; // resolveClubJoinOriginの戻り値
  clubSlug: string; // クラブのURL識別子
  token: string; // 生トークン(DBには保存しない)
}): string {
  const url = new URL("/club-join", input.origin); // URLを組み立てる標準のコンストラクタ

  url.search = new URLSearchParams({ // URLのサーチの部分に入れる
    clubSlug: input.clubSlug,
    token: input.token,
  }).toString();

  return url.toString();
}

/**
 * URLをQRコードにするための、SVGのパスを作る。
 * 横に並ぶ黒いモジュールは、1本の線にまとめる(文字数を減らす)。
 * @param text QRコードにする文字列(参加リンクのURL)。
 * @returns 余白を含む一辺の大きさと、黒いモジュールのパス。
 */
export function buildClubJoinQrShape(text: string): ClubJoinQrShape {
  const { data, size } = encode(text, { ecc: "M", border: 0 }); // QRコードの格子(true=黒)を作る外部ライブラリの関数
  const commands: string[] = [];

  data.forEach((row, y) => { // 行ごとに処理する標準の配列メソッド
    let x = 0;

    while (x < size) {
      if (!row[x]) {
        x += 1;
        continue;
      }

      let length = 0;

      while (x + length < size && row[x + length]) {
        length += 1;
      }

      commands.push(
        `M${x + CLUB_JOIN_QR_QUIET_ZONE} ${y + CLUB_JOIN_QR_QUIET_ZONE}h${length}v1h-${length}z`,
      );
      x += length;
    }
  });

  return {
    viewBoxSize: size + CLUB_JOIN_QR_QUIET_ZONE * 2,
    path: commands.join(""),
  };
}
