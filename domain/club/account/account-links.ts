// domain/club/account/account-links.ts
// アカウントページの外部リンクの定数と一覧生成関数（HP URL,インスタURL,プライバシーポリシーURL,利用規約URL）

//アカウントの外部リンクの型
export type AccountExternalLink = {
  label: string;
  href: string;
};

// 利用規約とプライバシーポリシーのURLを管理するための定数（現在はnull。URLが決まったら変更すること）
export const ACCOUNT_LEGAL_URLS: Readonly<{//読み取り専用なので絶対に書き換えられない
  terms: string | null;
  privacy: string | null;
}> = {
  terms: null,
  privacy: null,
};

//アカウントページの外部URLを安全に取得する関数
export function getSafeAccountExternalUrl(value: unknown): string | null {
if (
  typeof value !== "string" ||          // 1. 文字列ではない（nullやオブジェクトなど）ならNG
  !/^https?:\/\//i.test(value) ||       // 2. 「http://」または「https://」から始まっていないならNG
  /[\u0000-\u0020\u007f\\]/.test(value) // 3. 特殊な制御文字や「\（バックスラッシュ）」が含まれていたらNG
) {
  return null;
}
  try {
    const url = new URL(value);
const authority = value.match(/^https?:\/\/([^/?#]*)/i)?.[1]; // ドメイン部分を正規表現で抽出
if (
  (url.protocol !== "https:" && url.protocol !== "http:") || // プロトコルがhttp/https以外ならNG
  !url.hostname ||                                           // ドメイン名（google.comなど）が空ならNG
  !authority ||                                              // ドメイン部分がうまく抽出できなければNG
  authority.includes("@") ||                                 // ドメインに「@」が含まれる（認証悪用のリスク）ならNG
  url.username ||                                            // URLの中にユーザー名（http://user:...）が含まれていたらNG
  url.password                                               // URLの中にパスワード（http://...:pass@...）が含まれていたらNG
) {
  return null;
}
return url.href; // すべての厳しいチェックをクリアしたら、綺麗に整形されたURL文字列を返す
  } catch {
    return null;
  }
}

//アカウントページの外部リンク一覧を生成する関数（HPURL,インスタURL,プライバシーポリシーURL,利用規約URL）
export function getAccountExternalLinks(club: {
  websiteUrl: string | null;
  instagramUrl: string | null;
}): AccountExternalLink[] {//アカウントの外部リンクの型
  const candidates = [//４つのリンク候補をリスト化する
    {
      label: "公式HP",
      url: club.websiteUrl,
    },
    {
      label: "Instagram",
      url: club.instagramUrl,
    },
    {
      label: "利用規約",
      url: ACCOUNT_LEGAL_URLS.terms,// 利用規約とプライバシーポリシーのURLを管理するための定数（現在はnull。URLが決まったら変更すること）
    },
    {
      label: "プライバシーポリシー",
      url: ACCOUNT_LEGAL_URLS.privacy,// 利用規約とプライバシーポリシーのURLを管理するための定数（現在はnull。URLが決まったら変更すること）
    },
  ];
  return candidates.flatMap((candidate) => {//一つずつ順番に以下を処理する
    const href = getSafeAccountExternalUrl(candidate.url);//アカウントページの外部URLを安全に取得する関数
    return href ? [{
      label: candidate.label,
      href,
    },] : [];
  },
  );
}
