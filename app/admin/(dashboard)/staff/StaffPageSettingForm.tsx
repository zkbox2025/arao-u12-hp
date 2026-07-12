// app/admin/(dashboard)/staff/StaffPageSettingForm.tsx
// スタッフ紹介ページ設定フォーム

import Image from "next/image";
import type { StaffPageSetting } from "@/types/prisma";
import {
  STAFF_LEAD_FALLBACK,
  STAFF_TOP_SUMMARY_BODY_FALLBACK,
  STAFF_TOP_SUMMARY_TITLE_FALLBACK,
} from "@/constants/staff/fallbacks";
import { updateStaffPageSetting } from "./actions";
import { StaffTopImageDeleteButton } from "./StaffTopImageDeleteButton";

type StaffPageSettingFormProps = {
  setting: StaffPageSetting | null;
};

export function StaffPageSettingForm({ setting }: StaffPageSettingFormProps) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <div className="border-b border-neutral-200 pb-4">
        <h2 className="text-xl font-black text-neutral-900">
          スタッフ紹介ページ設定
        </h2>

        <p className="mt-2 text-sm leading-7 text-neutral-600">
          トップページのスタッフ紹介セクションと、スタッフ紹介ページの導入文を設定します。
        </p>
      </div>

      <form action={updateStaffPageSetting} className="mt-5 space-y-5">
        <div>
          <label
            htmlFor="topSummaryTitle"
            className="block text-sm font-bold text-neutral-900"
          >
            トップページ要約見出し
          </label>

          <input
            id="topSummaryTitle"
            name="topSummaryTitle"
            type="text"
            defaultValue={
              setting?.topSummaryTitle ?? STAFF_TOP_SUMMARY_TITLE_FALLBACK
            }
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
            required
          />
        </div>

        <div>
          <label
            htmlFor="topSummaryBody"
            className="block text-sm font-bold text-neutral-900"
          >
            トップページ要約本文
          </label>

          <textarea
            id="topSummaryBody"
            name="topSummaryBody"
            rows={5}
            defaultValue={
              setting?.topSummaryBody ?? STAFF_TOP_SUMMARY_BODY_FALLBACK
            }
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
            required
          />
        </div>

        <div>
          <label
            htmlFor="leadBody"
            className="block text-sm font-bold text-neutral-900"
          >
            スタッフ紹介ページ導入文
          </label>

          <textarea
            id="leadBody"
            name="leadBody"
            rows={5}
            defaultValue={setting?.leadBody ?? STAFF_LEAD_FALLBACK}
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
            required
          />
        </div>

        <div className="border-t border-neutral-200 pt-5">
          <h3 className="text-sm font-bold text-neutral-900">
            トップページ要約画像
          </h3>

          <div className="mt-4">
            <label
              htmlFor="topImageFile"
              className="block text-sm font-bold text-neutral-700"
            >
              画像をアップロード
            </label>

            <input
              id="topImageFile"
              name="topImageFile"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
            />

            <p className="mt-2 text-xs leading-6 text-neutral-500">
              jpg / png / webp / gif の画像を選択できます。最大5MBまでです。
              新しい画像を選んで保存すると、現在の画像と差し替わります。
            </p>
          </div>

          <div className="mt-4">
            <label
              htmlFor="topImageAlt"
              className="block text-sm font-bold text-neutral-700"
            >
              画像の説明文（alt）
            </label>

            <input
              id="topImageAlt"
              name="topImageAlt"
              type="text"
              defaultValue={setting?.topImageAlt ?? ""}
              placeholder="例：スタッフが体育館で子どもたちを見守っている様子"
              className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-neutral-200 pt-5">
          <button
            type="submit"
            className="rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            ページ設定を保存する
          </button>
        </div>
      </form>

      {setting?.topImageUrl ? (
        <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="mb-3 text-sm font-bold text-neutral-700">
            現在の画像プレビュー
          </p>

          <div className="relative aspect-video overflow-hidden rounded-xl bg-neutral-200">
            <Image
              src={setting.topImageUrl}
              alt={setting.topImageAlt || "スタッフ紹介"}
              fill
              unoptimized
              className="object-cover"
            />
          </div>

          <div className="mt-4">
            <StaffTopImageDeleteButton />
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm leading-7 text-neutral-500">
          現在設定されているトップ要約画像はありません。
        </div>
      )}
    </section>
  );
}