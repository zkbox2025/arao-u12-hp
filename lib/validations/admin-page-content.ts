// lib/validations/admin-page-content.ts
// サイト内文章設定の入力値バリデーション関数
//編集ページ名と編集ブロック名が型に当てはまるかや入力値のバリデーションを行う

import {
  PAGE_CONTENT_DEFINITIONS,
  PAGE_CONTENT_PAGE_KEYS,
  getFirstBlockKey,
  type PageContentPageKey,
} from "@/constants/page-content";

export type ParsedPageContentFormResult =
  | {
      ok: true;
      data: {
        pageKey: PageContentPageKey;
        blockKey: string;
        content: string;
        imageUrl: string | null;
        imageAlt: string | null;
      };
    }
  | {
      ok: false;
      error: string;
      values: {
        pageKey: string;
        blockKey: string;
        content: string;
        imageUrl: string;
        imageAlt: string;
      };
    };


    //編集ページ名が型に当てはまってるかをチェックする関数（もし当てはまってなければデフォルト：TOPを返す）
export function parsePageKey(pageKey: string | undefined): PageContentPageKey {
  if (PAGE_CONTENT_PAGE_KEYS.includes(pageKey as PageContentPageKey)) {
    return pageKey as PageContentPageKey;
  }

  return "TOP";
}

//選んだページの中に、指定された編集ブロック（パーツ）が本当に存在するかチェックし、
// なければ自動的に1番目のブロックに補正して返す安全関数
export function parseBlockKey({
  pageKey,
  blockKey,
}: {
  pageKey: PageContentPageKey;
  blockKey: string | undefined;
}) {
  const blocks = PAGE_CONTENT_DEFINITIONS[pageKey].blocks;//指定されたページのブロック一覧を出す

  //hasOwnProperty.call:そのオブジェクトの中に(blocks)、指定した名前のプロパティ（blockKey）が存在するかどうかを安全に調べるための、JavaScriptの確実なチェック方法
  if (blockKey && Object.prototype.hasOwnProperty.call(blocks, blockKey)) {//ブロック名が一覧にあるかチェックし、あったらそのまま返す
    return blockKey;
  }

  return getFirstBlockKey(pageKey);//なければ一番最初のブロックにする
}

//入力値のバリデーション関数
export function parsePageContentFormData(
  formData: FormData
): ParsedPageContentFormResult {
  const rawPageKey = String(formData.get("pageKey") ?? "");
  const rawBlockKey = String(formData.get("blockKey") ?? "");
  const content = String(formData.get("content") ?? "");
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const imageAlt = String(formData.get("imageAlt") ?? "").trim();

  //ページ側でデフォルト値を表示するための値
  const values = {
    pageKey: rawPageKey,
    blockKey: rawBlockKey,
    content,
    imageUrl,
    imageAlt,
  };


//ページ名がページ名一覧型になければエラーを返す
  if (!PAGE_CONTENT_PAGE_KEYS.includes(rawPageKey as PageContentPageKey)) {
    return {
      ok: false,
      error: "不正なページです。",
      values,
    };
  }

  const pageKey = rawPageKey as PageContentPageKey;
  const blocks = PAGE_CONTENT_DEFINITIONS[pageKey].blocks;

  //hasOwnProperty.call:そのオブジェクトの中に(blocks)、指定した名前のプロパティ（rawBlockKey）が存在するかどうかを安全に調べるための、JavaScriptの確実なチェック方法
  if (!Object.prototype.hasOwnProperty.call(blocks, rawBlockKey)) {
    return {
      ok: false,
      error: "不正な編集パーツです。",
      values,
    };
  }

  return {
    ok: true,
    data: {
      pageKey,
      blockKey: rawBlockKey,
      content,
      imageUrl: imageUrl || null,
      imageAlt: imageAlt || null,
    },
  };
}