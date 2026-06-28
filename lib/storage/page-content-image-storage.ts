// lib/storage/page-content-image-storage.ts
// PageContent画像のSupabase Storage操作をまとめる
//サーバー専用関数(SUPABASE_SERVICE_ROLE_KEYを使うため)

import "server-only";//Client Component からimportしないようにするためにチェックするためのもの

import { randomUUID } from "crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const PAGE_CONTENT_IMAGE_BUCKET = "club-images";

export const MAX_PAGE_CONTENT_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_PAGE_CONTENT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

type AllowedPageContentImageType =
  (typeof ALLOWED_PAGE_CONTENT_IMAGE_TYPES)[number];

export function isAllowedPageContentImageType(
  type: string
): type is AllowedPageContentImageType {
  return ALLOWED_PAGE_CONTENT_IMAGE_TYPES.includes(
    type as AllowedPageContentImageType
  );
}

function getImageExtensionByMimeType(type: AllowedPageContentImageType) {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
  }
}

function createStorageAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not defined");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not defined");
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}



//画像ファイルをストレージに保存して、ファイルパスとURL（１９２..に変換済み）を返す関数
export async function uploadPageContentImage({
  file,
  pageKey,
  blockKey,
}: {
  file: File;
  pageKey: string;
  blockKey: string;
}) {
  if (!isAllowedPageContentImageType(file.type)) {
    throw new Error("Unsupported image type");
  }

  const supabase = createStorageAdminClient();

  const extension = getImageExtensionByMimeType(file.type);
  const filePath = `page-content/${pageKey}/${blockKey}/${randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(PAGE_CONTENT_IMAGE_BUCKET)
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage
    .from(PAGE_CONTENT_IMAGE_BUCKET)
    .getPublicUrl(filePath);

return {
  imageUrl: data.publicUrl,
  imagePath: filePath,
};

}

//ストレージの画像ファイルを削除するのみの関数（親には何も返さない）
export async function deletePageContentStorageImage(
  imagePath?: string | null
) {
  if (!imagePath) return;

  const supabase = createStorageAdminClient();

  const { error } = await supabase.storage
    .from(PAGE_CONTENT_IMAGE_BUCKET)
    .remove([imagePath]);

  if (error) {
    throw new Error(error.message);
  }
}