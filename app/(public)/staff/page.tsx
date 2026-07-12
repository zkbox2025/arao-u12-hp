// app/(public)/staff/page.tsx
// 公開ページ：スタッフ紹介

import Image from "next/image";
import { findPublishedStaffs, findStaffPageSetting } from "@/lib/repositories/staff";
import type { Staff } from "@/types/prisma";
import { STAFF_LEAD_FALLBACK } from "@/constants/staff/fallbacks";
import { PageTitle } from "@/components/public/PageTitle";


function validateImageUrl(value?: string | null) {
  const imageUrl = value?.trim();

  if (!imageUrl) return "";

  if (imageUrl.startsWith("/")) {
    return imageUrl;
  }

  const allowedSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!allowedSupabaseUrl) {
    return "";
  }

  try {
    const url = new URL(imageUrl);
    const allowedUrl = new URL(allowedSupabaseUrl);

    if (url.hostname !== allowedUrl.hostname) {
      return "";
    }

    return imageUrl;
  } catch {
    return "";
  }
}

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const [staffPageSetting, staffs] = await Promise.all([
    findStaffPageSetting(),
    findPublishedStaffs(),
  ]);

return (
  <div id="top">
    <PageTitle title="スタッフ紹介" />

    <p className="mb-8 whitespace-pre-wrap leading-8 text-neutral-700">
      {staffPageSetting?.leadBody || STAFF_LEAD_FALLBACK}
    </p>

    {staffs.length === 0 ? (
      <section className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6">
        <p className="text-sm leading-7 text-neutral-500">
          スタッフ情報は準備中です。公開までしばらくお待ちください。
        </p>
      </section>
    ) : (
      <div className="space-y-6 border-t border-neutral-300 pt-6">
  {staffs.map((staff, index) => (
    <StaffProfileSection
      key={staff.id}
      staff={staff}
      hasBottomBorder={index !== staffs.length - 1}
    />
  ))}
</div>
    )}
  </div>
);
}

function StaffProfileSection({
  staff,
  hasBottomBorder,
}: {
  staff: Staff;
  hasBottomBorder: boolean;
}) {
  const safeImageUrl = validateImageUrl(staff.imageUrl);

  return (
    <section
      className={hasBottomBorder ? "border-b border-neutral-300 pb-6" : ""}
    >
      <div className="space-y-5">
        {safeImageUrl ? (
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-neutral-200 sm:mx-auto sm:max-w-md">
            <Image
              src={safeImageUrl}
              alt={staff.imageAlt || staff.name}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center border border-dashed border-neutral-300 bg-neutral-100 sm:mx-auto sm:max-w-md">
            <span className="text-sm font-bold tracking-[0.3em] text-neutral-400">
              STAFF
            </span>
          </div>
        )}

        <div>
          <p className="text-sm font-bold text-green-700">{staff.role}</p>

          <h2 className="mt-2 text-2xl font-black text-neutral-900">
            {staff.name}
          </h2>
        </div>

        <div className="space-y-5">
          <StaffInfoBlock title="プロフィール" body={staff.profile} />

          {staff.license ? (
            <StaffInfoBlock title="ライセンス" body={staff.license} />
          ) : null}

          {staff.achievement ? (
            <StaffInfoBlock title="指導実績" body={staff.achievement} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StaffInfoBlock({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl bg-neutral-100 p-4">
      <h3 className="text-sm font-black text-neutral-900">{title}</h3>

      <p className="mt-3 whitespace-pre-wrap leading-8 text-neutral-700">
        {body}
      </p>
    </div>
  );
}