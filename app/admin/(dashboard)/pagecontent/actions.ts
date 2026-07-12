// app/admin/(dashboard)/pagecontent/actions.ts
// サイト内文章設定の保存Action

"use server";

import {
  MAX_PAGE_CONTENT_IMAGE_SIZE,
  deletePageContentStorageImage,
  isAllowedPageContentImageType,
  uploadPageContentImage,
} from "@/lib/storage/page-content-image-storage";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
} from "@/app/admin/_utils/form-helpers";//エラー時の入力値表示のための関数
import type { PageContentActionState } from "@/types/action-state";
import { canEditPageContentImage } from "@/lib/page-content/image-editable-blocks";




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





export async function updatePageContent(
  state: PageContentActionState,
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

  let currentPageContent: {
    imageUrl: string | null;
    imagePath: string | null;
    imageAlt: string | null;
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
  imageAlt: true,
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
    imageUrl: state.values?.imageUrl ?? null,
    // DBから現在の画像URLを取得できなかった。
    // さらに、バリデーション成功時の parsed.data には imageUrl を含めていないため、
    // 直前に画面で表示していた画像URLが state に残っていれば復元用に使う。
  }),
};
  }

const canEditImage = canEditPageContentImage({
  pageKey: parsed.data.pageKey,
  blockKey: parsed.data.blockKey,
});

let imageUrl = currentPageContent?.imageUrl ?? null;
let imagePath = currentPageContent?.imagePath ?? null;
const imageAlt = canEditImage
  ? parsed.data.imageAlt
  : currentPageContent?.imageAlt ?? null;
let uploadedImagePath: string | null = null;
const previousImagePath = imagePath;

const imageFile = formData.get("imageFile");

if (canEditImage && imageFile instanceof File && imageFile.size > 0) {
  if (!isAllowedPageContentImageType(imageFile.type)) {
    return {
      error: "画像は jpg / png / webp / gif のいずれかを選択してください。",
      values: buildPageContentActionValuesFromData({
        ...parsed.data,
        imageUrl,
      }),
    };
  }

  if (imageFile.size > MAX_PAGE_CONTENT_IMAGE_SIZE) {
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
        imageAlt,
      },
      create: {
        pageKey: parsed.data.pageKey,
        blockKey: parsed.data.blockKey,
        content: parsed.data.content,
        imageUrl,
        imagePath,
        imageAlt,
      },
    });
  } catch (error) {
    console.error("PageContent保存に失敗しました", {
      pageKey: parsed.data.pageKey,
      blockKey: parsed.data.blockKey,
      error,
    });

    //DB保存が失敗した際に失敗ように取っておいたストレージに保存されてるデータを削除する
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

  //アップロードの画像と以前の画像が競合した場合は、ストレージから以前の画像データを消す
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

//画像を削除する関数
export async function deletePageContentImage(formData: FormData) {
  await requireAdmin();

  const pageKey = parsePageKey(String(formData.get("pageKey") ?? ""));

  const blockKey = parseBlockKey({
    pageKey,
    blockKey: String(formData.get("blockKey") ?? ""),
  });

  const canEditImage = canEditPageContentImage({
  pageKey,
  blockKey,
});

if (!canEditImage) {
  redirect(
    buildAdminPageContentPath({
      pageKey,
      blockKey,
      deleteError: true,
    })
  );
}

  let currentPageContent: {
    imageUrl: string | null;
    imagePath: string | null;
    imageAlt: string | null;
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
  imageAlt: true,
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

  //画像削除する（null）にする
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

  //redirect(deleteError: true)にしない理由：DB上は画像なしになっているので、ユーザー表示としては成功扱いでOK。
  // Storageにゴミが残る可能性はありますが、公開ページで壊れた画像が出るよりマシ。万が一Storage削除が失敗しても、画面上は画像なしになる。
  try {
    await deletePageContentStorageImage(currentPageContent?.imagePath);
  } catch (error) {
    console.error("PageContent画像のStorage削除に失敗しました", {
      pageKey,
      blockKey,
      imagePath: currentPageContent?.imagePath,
      error,
    });
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