// app/admin/(dashboard)/top-settings/actions.ts
// 管理者ページのトップページ設定の保存Action

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import {
  MAX_PAGE_CONTENT_IMAGE_SIZE,
  deletePageContentStorageImage,
  isAllowedPageContentImageType,
  uploadPageContentImage,
} from "@/lib/storage/page-content-image-storage";
import { canEditPageContentImage } from "@/lib/page-content/image-editable-blocks";
import { getPageContentFallback } from "@/constants/page-content";
import type { PageContentBlockKey } from "@/constants/page-content";

function buildAdminTopSettingsPath({
  saved,
  error,
}: {
  saved?: boolean;
  error?: boolean;
}) {
  const params = new URLSearchParams();

  if (saved) {
    params.set("saved", "1");
    params.set("toastId", Date.now().toString());
  }

  if (error) {
    params.set("error", "1");
    params.set("toastId", Date.now().toString());
  }

  const query = params.toString();

  return `/admin/top-settings${query ? `?${query}` : ""}#top`;
}

export async function updateTopSummaryImage(formData: FormData) {
  await requireAdmin();

  const pageKey = "TOP" as const;
  const blockKey = String(formData.get("blockKey") ?? "");
  const imageAlt = String(formData.get("imageAlt") ?? "").trim();
  const imageFile = formData.get("imageFile");

  if (
    !canEditPageContentImage({
      pageKey,
      blockKey,
    })
  ) {
    redirect(buildAdminTopSettingsPath({ error: true }));
  }

  if (!(imageFile instanceof File) || imageFile.size === 0) {
    redirect(buildAdminTopSettingsPath({ error: true }));
  }

  if (!isAllowedPageContentImageType(imageFile.type)) {
    redirect(buildAdminTopSettingsPath({ error: true }));
  }

  if (imageFile.size > MAX_PAGE_CONTENT_IMAGE_SIZE) {
    redirect(buildAdminTopSettingsPath({ error: true }));
  }

  const typedBlockKey = blockKey as PageContentBlockKey<"TOP">;

  const currentPageContent = await prisma.pageContent.findUnique({
    where: {
      pageKey_blockKey: {
        pageKey,
        blockKey: typedBlockKey,
      },
    },
    select: {
      content: true,
      imagePath: true,
    },
  });

  let uploadedImagePath: string | null = null;

  try {
    const uploadedImage = await uploadPageContentImage({
      file: imageFile,
      pageKey,
      blockKey: typedBlockKey,
    });

    uploadedImagePath = uploadedImage.imagePath;

    await prisma.pageContent.upsert({
      where: {
        pageKey_blockKey: {
          pageKey,
          blockKey: typedBlockKey,
        },
      },
      update: {
        imageUrl: uploadedImage.imageUrl,
        imagePath: uploadedImage.imagePath,
        imageAlt: imageAlt || null,
      },
      create: {
        pageKey,
        blockKey: typedBlockKey,
        content:
          currentPageContent?.content ??
          getPageContentFallback({
            pageKey,
            blockKey: typedBlockKey,
          }),
        imageUrl: uploadedImage.imageUrl,
        imagePath: uploadedImage.imagePath,
        imageAlt: imageAlt || null,
      },
    });

    if (currentPageContent?.imagePath) {
      try {
        await deletePageContentStorageImage(currentPageContent.imagePath);
      } catch (deleteOldImageError) {
        console.error("トップ要約画像の旧画像削除に失敗しました", {
          blockKey,
          imagePath: currentPageContent.imagePath,
          deleteOldImageError,
        });
      }
    }
    //このエラーにはストレージ保存とDB保存両方の意味合いがある
  } catch (error) {
    console.error("トップ要約画像の保存に失敗しました", {
      blockKey,
      uploadedImagePath,
      error,
    });

    //DB保存が失敗した場合は、ストレージの保存した画像を削除する
    if (uploadedImagePath) {
      try {
        await deletePageContentStorageImage(uploadedImagePath);
      } catch (deleteUploadedImageError) {
        console.error("保存失敗後のトップ要約画像削除に失敗しました", {
          uploadedImagePath,
          deleteUploadedImageError,
        });
      }
    }

    redirect(buildAdminTopSettingsPath({ error: true }));
  }

  revalidatePath("/admin/top-settings");
  revalidatePath("/explore");
  revalidatePath("/");

  redirect(buildAdminTopSettingsPath({ saved: true }));
}

export async function deleteTopSummaryImage(blockKey: string) {
  await requireAdmin();

  const pageKey = "TOP" as const;

  if (
    !canEditPageContentImage({
      pageKey,
      blockKey,
    })
  ) {
    redirect(buildAdminTopSettingsPath({ error: true }));
  }

  const typedBlockKey = blockKey as PageContentBlockKey<"TOP">;

  const currentPageContent = await prisma.pageContent.findUnique({
    where: {
      pageKey_blockKey: {
        pageKey,
        blockKey: typedBlockKey,
      },
    },
    select: {
      imagePath: true,
    },
  });

  try {
    await prisma.pageContent.update({
      where: {
        pageKey_blockKey: {
          pageKey,
          blockKey: typedBlockKey,
        },
      },
      data: {
        imageUrl: null,
        imagePath: null,
        imageAlt: null,
      },
    });
  } catch (error) {
    console.error("トップ要約画像のDB削除に失敗しました", {
      blockKey,
      error,
    });

    redirect(buildAdminTopSettingsPath({ error: true }));
  }

  try {
    await deletePageContentStorageImage(currentPageContent?.imagePath);
  } catch (error) {
    console.error("トップ要約画像のStorage削除に失敗しました", {
      blockKey,
      imagePath: currentPageContent?.imagePath,
      error,
    });
  }

  revalidatePath("/admin/top-settings");
  revalidatePath("/explore");
  revalidatePath("/");

  redirect(buildAdminTopSettingsPath({ saved: true }));
}