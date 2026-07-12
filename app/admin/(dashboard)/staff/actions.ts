// app/admin/(dashboard)/staff/actions.ts
// スタッフ紹介管理の保存Action

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import type { ContentStatus } from "@/types/prisma";
import {
  MAX_STAFF_IMAGE_SIZE,
  deleteStaffStorageImage,
  isAllowedStaffImageType,
  uploadStaffImage,
} from "@/lib/storage/staff-image-storage";

function buildAdminStaffPath({
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

  return `/admin/staff${query ? `?${query}` : ""}#top`;
}

function parseContentStatus(value: FormDataEntryValue | null): ContentStatus {
  return value === "DRAFT" ? "DRAFT" : "PUBLISHED";
}

function parseSortOrder(value: FormDataEntryValue | null) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue)) {
    return 0;
  }

  return numberValue;
}

function getOptionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  return value || null;
}

function validateStaffImageFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: true as const,
      file: null,
    };
  }

  if (!isAllowedStaffImageType(file.type)) {
    return {
      ok: false as const,
      error: "画像は jpg / png / webp / gif のいずれかを選択してください。",
    };
  }

  if (file.size > MAX_STAFF_IMAGE_SIZE) {
    return {
      ok: false as const,
      error: "画像は5MB以内にしてください。",
    };
  }

  return {
    ok: true as const,
    file,
  };
}

export async function updateStaffPageSetting(formData: FormData) {
  await requireAdmin();

  const topSummaryTitle = String(formData.get("topSummaryTitle") ?? "").trim();
  const topSummaryBody = String(formData.get("topSummaryBody") ?? "").trim();
  const leadBody = String(formData.get("leadBody") ?? "").trim();
  const topImageAlt = getOptionalText(formData, "topImageAlt");
  const topImageFile = formData.get("topImageFile");

  if (!topSummaryTitle || !topSummaryBody || !leadBody) {
    redirect(buildAdminStaffPath({ error: true }));
  }

  const validatedImage = validateStaffImageFile(topImageFile);

  if (!validatedImage.ok) {
    console.error(validatedImage.error);
    redirect(buildAdminStaffPath({ error: true }));
  }

  const currentSetting = await prisma.staffPageSetting.findUnique({
    where: {
      id: "staff-page-setting",
    },
    select: {
      topImageUrl: true,
      topImagePath: true,
    },
  });

  let topImageUrl = currentSetting?.topImageUrl ?? null;
  let topImagePath = currentSetting?.topImagePath ?? null;
  let uploadedImagePath: string | null = null;
  const previousImagePath = topImagePath;

  try {
    if (validatedImage.file) {
      const uploadedImage = await uploadStaffImage({
        file: validatedImage.file,
        folder: "top-summary",
      });

      topImageUrl = uploadedImage.imageUrl;
      topImagePath = uploadedImage.imagePath;
      uploadedImagePath = uploadedImage.imagePath;
    }

    await prisma.staffPageSetting.upsert({
      where: {
        id: "staff-page-setting",
      },
      update: {
        topSummaryTitle,
        topSummaryBody,
        leadBody,
        topImageUrl,
        topImagePath,
        topImageAlt,
      },
      create: {
        id: "staff-page-setting",
        topSummaryTitle,
        topSummaryBody,
        leadBody,
        topImageUrl,
        topImagePath,
        topImageAlt,
      },
    });
  } catch (error) {
    console.error("スタッフページ設定の保存に失敗しました", {
      uploadedImagePath,
      error,
    });

    if (uploadedImagePath) {
      try {
        await deleteStaffStorageImage(uploadedImagePath);
      } catch (deleteUploadedImageError) {
        console.error("保存失敗後のスタッフ要約画像削除に失敗しました", {
          uploadedImagePath,
          deleteUploadedImageError,
        });
      }
    }

    redirect(buildAdminStaffPath({ error: true }));
  }

  if (uploadedImagePath && previousImagePath) {
    try {
      await deleteStaffStorageImage(previousImagePath);
    } catch (error) {
      console.error("差し替え前のスタッフ要約画像削除に失敗しました", {
        previousImagePath,
        error,
      });
    }
  }

  revalidatePath("/admin/staff");
  revalidatePath("/staff");
  revalidatePath("/explore");
  revalidatePath("/");

  redirect(buildAdminStaffPath({ saved: true }));
}

export async function deleteStaffTopImage(_formData: FormData) {
  await requireAdmin();

  const currentSetting = await prisma.staffPageSetting.findUnique({
    where: {
      id: "staff-page-setting",
    },
    select: {
      topImagePath: true,
    },
  });

  try {
    await prisma.staffPageSetting.upsert({
      where: {
        id: "staff-page-setting",
      },
      update: {
        topImageUrl: null,
        topImagePath: null,
        topImageAlt: null,
      },
      create: {
        id: "staff-page-setting",
        topSummaryTitle: "スタッフ紹介",
        topSummaryBody:
          "子どもたち一人ひとりに寄り添い、成長を支えるスタッフを紹介します。",
        leadBody:
          "私たちは、ARAO U-12 BASKETBALL CLUBのスタッフです。バスケットボールを通して、子どもたちの心と技術の成長を支えます。",
        topImageUrl: null,
        topImagePath: null,
        topImageAlt: null,
      },
    });
  } catch (error) {
    console.error("スタッフ要約画像のDB削除に失敗しました", {
      error,
    });

    redirect(buildAdminStaffPath({ error: true }));
  }

  try {
    await deleteStaffStorageImage(currentSetting?.topImagePath);
  } catch (error) {
    console.error("スタッフ要約画像のStorage削除に失敗しました", {
      imagePath: currentSetting?.topImagePath,
      error,
    });
  }

  revalidatePath("/admin/staff");
  revalidatePath("/staff");
  revalidatePath("/explore");
  revalidatePath("/");

  redirect(buildAdminStaffPath({ saved: true }));
}

export async function createStaff(formData: FormData) {
  await requireAdmin();

  const role = String(formData.get("role") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const profile = String(formData.get("profile") ?? "").trim();
  const license = getOptionalText(formData, "license");
  const achievement = getOptionalText(formData, "achievement");
  const imageAlt = getOptionalText(formData, "imageAlt");
  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  const status = parseContentStatus(formData.get("status"));
  const imageFile = formData.get("imageFile");

  if (!role || !name || !profile) {
    redirect(buildAdminStaffPath({ error: true }));
  }

  const validatedImage = validateStaffImageFile(imageFile);

  if (!validatedImage.ok) {
    console.error(validatedImage.error);
    redirect(buildAdminStaffPath({ error: true }));
  }

  let imageUrl: string | null = null;
  let imagePath: string | null = null;
  let uploadedImagePath: string | null = null;

  try {
    if (validatedImage.file) {
      const uploadedImage = await uploadStaffImage({
        file: validatedImage.file,
        folder: "profiles",
      });

      imageUrl = uploadedImage.imageUrl;
      imagePath = uploadedImage.imagePath;
      uploadedImagePath = uploadedImage.imagePath;
    }

    await prisma.staff.create({
      data: {
        role,
        name,
        profile,
        license,
        achievement,
        imageUrl,
        imagePath,
        imageAlt,
        sortOrder,
        status,
      },
    });
  } catch (error) {
    console.error("スタッフ情報の作成に失敗しました", {
      name,
      uploadedImagePath,
      error,
    });

    if (uploadedImagePath) {
      try {
        await deleteStaffStorageImage(uploadedImagePath);
      } catch (deleteUploadedImageError) {
        console.error("作成失敗後のスタッフ画像削除に失敗しました", {
          uploadedImagePath,
          deleteUploadedImageError,
        });
      }
    }

    redirect(buildAdminStaffPath({ error: true }));
  }

  revalidatePath("/admin/staff");
  revalidatePath("/staff");
  revalidatePath("/explore");
  revalidatePath("/");

  redirect(buildAdminStaffPath({ saved: true }));
}

export async function updateStaff(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const profile = String(formData.get("profile") ?? "").trim();
  const license = getOptionalText(formData, "license");
  const achievement = getOptionalText(formData, "achievement");
  const imageAlt = getOptionalText(formData, "imageAlt");
  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  const status = parseContentStatus(formData.get("status"));
  const imageFile = formData.get("imageFile");

  if (!id || !role || !name || !profile) {
    redirect(buildAdminStaffPath({ error: true }));
  }

  const validatedImage = validateStaffImageFile(imageFile);

  if (!validatedImage.ok) {
    console.error(validatedImage.error);
    redirect(buildAdminStaffPath({ error: true }));
  }

  const currentStaff = await prisma.staff.findUnique({
    where: {
      id,
    },
    select: {
      imageUrl: true,
      imagePath: true,
    },
  });

  if (!currentStaff) {
    redirect(buildAdminStaffPath({ error: true }));
  }

  let imageUrl = currentStaff.imageUrl;
  let imagePath = currentStaff.imagePath;
  let uploadedImagePath: string | null = null;
  const previousImagePath = imagePath;

  try {
    if (validatedImage.file) {
      const uploadedImage = await uploadStaffImage({
        file: validatedImage.file,
        folder: "profiles",
      });

      imageUrl = uploadedImage.imageUrl;
      imagePath = uploadedImage.imagePath;
      uploadedImagePath = uploadedImage.imagePath;
    }

    await prisma.staff.update({
      where: {
        id,
      },
      data: {
        role,
        name,
        profile,
        license,
        achievement,
        imageUrl,
        imagePath,
        imageAlt,
        sortOrder,
        status,
      },
    });
  } catch (error) {
    console.error("スタッフ情報の更新に失敗しました", {
      id,
      name,
      uploadedImagePath,
      error,
    });

    if (uploadedImagePath) {
      try {
        await deleteStaffStorageImage(uploadedImagePath);
      } catch (deleteUploadedImageError) {
        console.error("更新失敗後のスタッフ画像削除に失敗しました", {
          uploadedImagePath,
          deleteUploadedImageError,
        });
      }
    }

    redirect(buildAdminStaffPath({ error: true }));
  }

  if (uploadedImagePath && previousImagePath) {
    try {
      await deleteStaffStorageImage(previousImagePath);
    } catch (error) {
      console.error("差し替え前スタッフ画像のStorage削除に失敗しました", {
        previousImagePath,
        error,
      });
    }
  }

  revalidatePath("/admin/staff");
  revalidatePath("/staff");
  revalidatePath("/explore");
  revalidatePath("/");

  redirect(buildAdminStaffPath({ saved: true }));
}

export async function deleteStaff(staffId: string) {
  await requireAdmin();

  const staff = await prisma.staff.findUnique({
    where: {
      id: staffId,
    },
    select: {
      id: true,
      imagePath: true,
    },
  });

  if (!staff) {
    redirect(buildAdminStaffPath({ error: true }));
  }

  try {
    await prisma.staff.delete({
      where: {
        id: staff.id,
      },
    });
  } catch (error) {
    console.error("スタッフ情報のDB削除に失敗しました", {
      staffId,
      error,
    });

    redirect(buildAdminStaffPath({ error: true }));
  }

  try {
    await deleteStaffStorageImage(staff.imagePath);
  } catch (error) {
    console.error("スタッフ画像のStorage削除に失敗しました", {
      staffId,
      imagePath: staff.imagePath,
      error,
    });
  }

  revalidatePath("/admin/staff");
  revalidatePath("/staff");
  revalidatePath("/explore");
  revalidatePath("/");

  redirect(buildAdminStaffPath({ saved: true }));
}