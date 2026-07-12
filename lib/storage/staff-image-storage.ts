// lib/storage/staff-image-storage.ts
// Staff画像のSupabase Storage操作をまとめる

import "server-only";

import { randomUUID } from "crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const STAFF_IMAGE_BUCKET = "club-images";

export const MAX_STAFF_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_STAFF_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

type AllowedStaffImageType = (typeof ALLOWED_STAFF_IMAGE_TYPES)[number];

export function isAllowedStaffImageType(
  type: string
): type is AllowedStaffImageType {
  return ALLOWED_STAFF_IMAGE_TYPES.includes(type as AllowedStaffImageType);
}

function getImageExtensionByMimeType(type: AllowedStaffImageType) {
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

export async function uploadStaffImage({
  file,
  folder,
}: {
  file: File;
  folder: string;
}) {
  if (!isAllowedStaffImageType(file.type)) {
    throw new Error("Unsupported staff image type");
  }

  if (file.size > MAX_STAFF_IMAGE_SIZE) {
    throw new Error("Staff image file is too large");
  }

  const supabase = createStorageAdminClient();

  const extension = getImageExtensionByMimeType(file.type);
  const filePath = `staff/${folder}/${randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(STAFF_IMAGE_BUCKET)
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage
    .from(STAFF_IMAGE_BUCKET)
    .getPublicUrl(filePath);

  return {
    imageUrl: data.publicUrl,
    imagePath: filePath,
  };
}

export async function deleteStaffStorageImage(imagePath?: string | null) {
  if (!imagePath) return;

  const supabase = createStorageAdminClient();

  const { error } = await supabase.storage
    .from(STAFF_IMAGE_BUCKET)
    .remove([imagePath]);

  if (error) {
    throw new Error(error.message);
  }
}