// app/admin/(dashboard)/pagecontent/actions.ts
// サイト内文章設定の保存Action

"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import {
  parseBlockKey,
  parsePageContentFormData,
  parsePageKey,
} from "@/lib/validations/admin-page-content";
import { getPageContentPublicPath } from "@/constants/page-content";
import {
  ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
} from "@/constants/adminActionError";
import {
  buildPageContentActionValuesFromData,
  buildPageContentActionValuesFromFormData,
} from "@/app/admin/_utils/form-helpers";//エラー時の入力値表示のための関数
import type { PageContentActionState } from "@/types/action-state";


const PAGE_CONTENT_IMAGE_BUCKET = "club-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;


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

function buildAdminPageContentPath({
  pageKey,
  blockKey,
  saved,
  deleteError,
}: {
  pageKey: string;
  blockKey: string;
  saved?: boolean;
  deleteError?: boolean;
}) {
  const params = new URLSearchParams();

  params.set("pageKey", pageKey);
  params.set("blockKey", blockKey);

  if (saved) {
    params.set("saved", "1");
    params.set("toastId", Date.now().toString());
  }

  if (deleteError) {
    params.set("deleteError", "1");
    params.set("toastId", Date.now().toString());
  }

  return `/admin/pagecontent?${params.toString()}#top`;
}

function getSafeImageExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (
    extension === "jpg" ||
    extension === "jpeg" ||
    extension === "png" ||
    extension === "webp" ||
    extension === "gif"
  ) {
    return extension;
  }

  return "jpg";
}


// ローカル開発でスマホ実機確認するときだけ使う一時対応。
// 127.0.0.1 はスマホ自身を指してしまうため、PCのLAN IP（192..）に変換し、DB（ポスグレ）に保存する。
// リリース前・本番反映前には削除して data.publicUrl をそのまま保存すること。
function normalizeLocalSupabasePublicUrl(publicUrl: string) {
  return publicUrl
    .replace("http://127.0.0.1:54321", "http://192.168.210.188:54321")
    .replace("http://localhost:54321", "http://192.168.210.188:54321");
}

async function uploadPageContentImage({
  file,
  pageKey,
  blockKey,
}: {
  file: File;
  pageKey: string;
  blockKey: string;
}) {
  const supabase = createStorageAdminClient();

  const extension = getSafeImageExtension(file.name);
  const filePath = `page-content/${pageKey}/${blockKey}/${randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(PAGE_CONTENT_IMAGE_BUCKET)
    .upload(filePath, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage
    .from(PAGE_CONTENT_IMAGE_BUCKET)
    .getPublicUrl(filePath);

  return {
  imageUrl: normalizeLocalSupabasePublicUrl(data.publicUrl),
  imagePath: filePath,
};
}

async function deletePageContentStorageImage(imagePath?: string | null) {
  if (!imagePath) return;

  const supabase = createStorageAdminClient();

  const { error } = await supabase.storage
    .from(PAGE_CONTENT_IMAGE_BUCKET)
    .remove([imagePath]);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updatePageContent(
  state: PageContentActionState,
  formData: FormData
): Promise<PageContentActionState> {
  await requireAdmin();

  const parsed = parsePageContentFormData(formData);

if (!parsed.ok) {
  return {
    error: parsed.error,
    values: buildPageContentActionValuesFromFormData(
      formData,
      state.values
    ),
  };
}

  let currentPageContent: {
    imageUrl: string | null;
    imagePath: string | null;
  } | null = null;

  try {
    currentPageContent = await prisma.pageContent.findUnique({
      where: {
        pageKey_blockKey: {
          pageKey: parsed.data.pageKey,
          blockKey: parsed.data.blockKey,
        },
      },
      select: {
        imageUrl: true,
        imagePath: true,
      },
    });
  } catch (error) {
    console.error("PageContent取得に失敗しました", {
      pageKey: parsed.data.pageKey,
      blockKey: parsed.data.blockKey,
      error,
    });

  return {
  error: ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
  values: buildPageContentActionValuesFromData({
    ...parsed.data,
    imageUrl: state.values?.imageUrl,
  }),
};
  }

  let imageUrl = currentPageContent?.imageUrl ?? null;
  let imagePath = currentPageContent?.imagePath ?? null;
  let uploadedImagePath: string | null = null;
  const previousImagePath = imagePath;

  const imageFile = formData.get("imageFile");

  if (imageFile instanceof File && imageFile.size > 0) {
    if (!imageFile.type.startsWith("image/")) {
      return {
        error: "画像ファイルを選択してください。",
        values: buildPageContentActionValuesFromData({
          ...parsed.data,
          imageUrl,
        }),
      };
    }

    if (imageFile.size > MAX_IMAGE_SIZE) {
      return {
        error: "画像は5MB以内にしてください。",
        values: buildPageContentActionValuesFromData({
          ...parsed.data,
          imageUrl,
        }),
      };
    }

    try {
      const uploadedImage = await uploadPageContentImage({
        file: imageFile,
        pageKey: parsed.data.pageKey,
        blockKey: parsed.data.blockKey,
      });

      imageUrl = uploadedImage.imageUrl;
      imagePath = uploadedImage.imagePath;
      uploadedImagePath = uploadedImage.imagePath;
    } catch (error) {
      console.error("PageContent画像アップロードに失敗しました", {
        pageKey: parsed.data.pageKey,
        blockKey: parsed.data.blockKey,
        error,
      });

      return {
        error: "画像のアップロードに失敗しました。",
        values: buildPageContentActionValuesFromData({
          ...parsed.data,
          imageUrl: currentPageContent?.imageUrl,
        }),
      };
    }
  }

  try {
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
        imagePath,
        imageAlt: parsed.data.imageAlt,
      },
      create: {
        pageKey: parsed.data.pageKey,
        blockKey: parsed.data.blockKey,
        content: parsed.data.content,
        imageUrl,
        imagePath,
        imageAlt: parsed.data.imageAlt,
      },
    });
  } catch (error) {
    console.error("PageContent保存に失敗しました", {
      pageKey: parsed.data.pageKey,
      blockKey: parsed.data.blockKey,
      error,
    });

    if (uploadedImagePath) {
      try {
        await deletePageContentStorageImage(uploadedImagePath);
      } catch (deleteUploadedImageError) {
        console.error("保存失敗後のアップロード済み画像削除に失敗しました", {
          uploadedImagePath,
          deleteUploadedImageError,
        });
      }
    }

    return {
      error: ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
      values: buildPageContentActionValuesFromData({
        ...parsed.data,
        imageUrl: currentPageContent?.imageUrl,
      }),
    };
  }

  if (uploadedImagePath && previousImagePath) {
    try {
      await deletePageContentStorageImage(previousImagePath);
    } catch (error) {
      console.error("差し替え前画像のStorage削除に失敗しました", {
        previousImagePath,
        error,
      });
    }
  }

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

export async function deletePageContentImage(formData: FormData) {
  await requireAdmin();

  const pageKey = parsePageKey(String(formData.get("pageKey") ?? ""));

  const blockKey = parseBlockKey({
    pageKey,
    blockKey: String(formData.get("blockKey") ?? ""),
  });

  let currentPageContent: {
    imageUrl: string | null;
    imagePath: string | null;
  } | null = null;

  try {
    currentPageContent = await prisma.pageContent.findUnique({
      where: {
        pageKey_blockKey: {
          pageKey,
          blockKey,
        },
      },
      select: {
        imageUrl: true,
        imagePath: true,
      },
    });
  } catch (error) {
    console.error("PageContent画像削除前のデータ取得に失敗しました", {
      pageKey,
      blockKey,
      error,
    });

    redirect(
      buildAdminPageContentPath({
        pageKey,
        blockKey,
        deleteError: true,
      })
    );
  }

  try {
    await deletePageContentStorageImage(currentPageContent?.imagePath);
  } catch (error) {
    console.error("PageContent画像のStorage削除に失敗しました", {
      pageKey,
      blockKey,
      imageUrl: currentPageContent?.imageUrl,
      imagePath: currentPageContent?.imagePath,
      error,
    });

    redirect(
      buildAdminPageContentPath({
        pageKey,
        blockKey,
        deleteError: true,
      })
    );
  }

  try {
    await prisma.pageContent.update({
      where: {
        pageKey_blockKey: {
          pageKey,
          blockKey,
        },
      },
      data: {
        imageUrl: null,
        imagePath: null,
        imageAlt: null,
      },
    });
  } catch (error) {
    console.error("PageContent画像情報のDB削除に失敗しました", {
      pageKey,
      blockKey,
      error,
    });

    redirect(
      buildAdminPageContentPath({
        pageKey,
        blockKey,
        deleteError: true,
      })
    );
  }

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