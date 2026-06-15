// app/admin/(dashboard)/pagecontent/actions.ts
// サイト内文章設定の保存Action

"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import { createClient } from "@/src/infrastructure/supabase/server";
import { parsePageContentFormData, parsePageKey } from "@/lib/validations/admin-page-content";
import { getPageContentPublicPath } from "@/constants/page-content";


const PAGE_CONTENT_IMAGE_BUCKET = "club-images";
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

type PageContentActionState = {
  error?: string;
  values?: {
    pageKey?: string;
    blockKey?: string;
    content?: string;
    imageUrl?: string;
    imageAlt?: string;
  };
};

function buildAdminPageContentPath({
  pageKey,
  blockKey,
  saved,
}: {
  pageKey: string;
  blockKey: string;
  saved?: boolean;
}) {
  const params = new URLSearchParams();

  params.set("pageKey", pageKey);
  params.set("blockKey", blockKey);

  if (saved) {
    params.set("saved", "1");
    params.set("toastId", Date.now().toString());
  }

  return `/admin/pagecontent?${params.toString()}#top`;
}

function getSafeImageExtension(fileName: string) {
  //ファイル名を小文字に変換する
  const extension = fileName.split(".").pop()?.toLowerCase();

  //この内のいずれかであるか判定する
  if (
    extension === "jpg" ||
    extension === "jpeg" ||
    extension === "png" ||
    extension === "webp" ||
    extension === "gif"
  ) {
    return extension;
  }

  //不明なら一律jpg
  return "jpg";
}

//DBやフォームから送られてきた生のデータを使いやすいようにマッピングする
function buildPageContentActionValues(data: {
  pageKey: string;
  blockKey: string;
  content: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
}): PageContentActionState["values"] {
  return {
    pageKey: data.pageKey,
    blockKey: data.blockKey,
    content: data.content,
    imageUrl: data.imageUrl ?? undefined,
    imageAlt: data.imageAlt ?? undefined,
  };
}

function normalizeLocalSupabasePublicUrl(publicUrl: string) {
  return publicUrl
    .replace("http://127.0.0.1:54321", "http://192.168.210.188:54321")
    .replace("http://localhost:54321", "http://192.168.210.188:54321");
}

//supabaseにアップロードとURLの取得
async function uploadPageContentImage({
  file,
  pageKey,
  blockKey,
}: {
  file: File;
  pageKey: string;
  blockKey: string;
}) {
  const supabase = await createClient();

  const extension = getSafeImageExtension(file.name);
  //保存先を組み立てる
  const filePath = `page-content/${pageKey}/${blockKey}/${randomUUID()}.${extension}`;

  //supabaseのバケット（club-images）にファイルをアップロードする
  const { error } = await supabase.storage
    .from(PAGE_CONTENT_IMAGE_BUCKET)
    .upload(filePath, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

    //エラーなら処理を中断してエラーを投げる
  if (error) {
    throw new Error(error.message);
  }

  //アップロードが終わったらそのファイルにアクセスするための「公開URL」（DBに保存する際の画像住所）を生成する
  const { data } = supabase.storage
    .from(PAGE_CONTENT_IMAGE_BUCKET)
    .getPublicUrl(filePath);//あらかじめ決まっているベースURL（https://...）にファイルの保存パス（filePath）を結合だけで組み立てる

    
    //公開URLを呼び出し下に返す
  return normalizeLocalSupabasePublicUrl(data.publicUrl);
}

export async function updatePageContent(
  _state: PageContentActionState,
  formData: FormData
): Promise<PageContentActionState> {
  await requireAdmin();

  const parsed = parsePageContentFormData(formData);

  if (!parsed.ok) {
    return {
      error: parsed.error,
      values: parsed.values,
    };
  }

  let imageUrl = parsed.data.imageUrl;

  const imageFile = formData.get("imageFile");

  if (imageFile instanceof File && imageFile.size > 0) {
    if (!imageFile.type.startsWith("image/")) {
      return {
        error: "画像ファイルを選択してください。",
        values: buildPageContentActionValues(parsed.data),
      };
    }

    if (imageFile.size > MAX_IMAGE_SIZE) {
      return {
        error: "画像は2MB以内にしてください。",
        values: buildPageContentActionValues(parsed.data),
      };
    }

    try {
      imageUrl = await uploadPageContentImage({
        file: imageFile,
        pageKey: parsed.data.pageKey,
        blockKey: parsed.data.blockKey,
      });
    } catch {
      return {
        error: "画像のアップロードに失敗しました。",
        values: buildPageContentActionValues(parsed.data),
      };
    }
  }

  await prisma.pageContent.upsert({
    where: {
      pageKey_blockKey: {
        pageKey: parsed.data.pageKey,
        blockKey: parsed.data.blockKey,
      },
    },
    update: {
      content: parsed.data.content,
      imageUrl,
      imageAlt: parsed.data.imageAlt,
    },
    create: {
      pageKey: parsed.data.pageKey,
      blockKey: parsed.data.blockKey,
      content: parsed.data.content,
      imageUrl,
      imageAlt: parsed.data.imageAlt,
    },
  });

  const publicPath = getPageContentPublicPath(parsed.data.pageKey);

  revalidatePath("/admin/pagecontent");
  revalidatePath(publicPath);

  if (publicPath === "/explore") {
    revalidatePath("/");
  }

  redirect(
    buildAdminPageContentPath({
      pageKey: parsed.data.pageKey,
      blockKey: parsed.data.blockKey,
      saved: true,
    })
  );
}


//DB上の画像データを削除する関数（supabaseストレージには残る仕様：MVPならまずこれでOK）
export async function deletePageContentImage(formData: FormData) {
  await requireAdmin();

  const pageKey = parsePageKey(String(formData.get("pageKey") ?? ""));
  const blockKey = String(formData.get("blockKey") ?? "");

  if (!blockKey) {
    redirect("/admin/pagecontent#top");
  }

  await prisma.pageContent.update({
    where: {
      pageKey_blockKey: {
        pageKey,
        blockKey,
      },
    },
    data: {
      imageUrl: null,
      imageAlt: null,
    },
  });

  const publicPath = getPageContentPublicPath(pageKey);

  revalidatePath("/admin/pagecontent");
  revalidatePath(publicPath);

  if (publicPath === "/explore") {
    revalidatePath("/");
  }

  redirect(
    buildAdminPageContentPath({
      pageKey,
      blockKey,
      saved: true,
    })
  );
}