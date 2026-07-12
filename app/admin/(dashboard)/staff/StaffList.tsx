// app/admin/(dashboard)/staff/StaffList.tsx
// スタッフ一覧・編集フォーム

import Image from "next/image";
import type { Staff } from "@/types/prisma";
import { updateStaff } from "./actions";
import { StaffDeleteButton } from "./StaffDeleteButton";

type StaffListProps = {
  staffs: Staff[];
};

export function StaffList({ staffs }: StaffListProps) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <div className="border-b border-neutral-200 pb-4">
        <h2 className="text-xl font-black text-neutral-900">
          登録済みスタッフ
        </h2>
      </div>

      <div className="mt-5">
        {staffs.length === 0 ? (
          <p className="text-sm leading-7 text-neutral-500">
            登録済みのスタッフはありません。
          </p>
        ) : (
          <div className="space-y-6">
            {staffs.map((staff) => (
  <div
    key={staff.id}
    className="rounded-2xl border border-neutral-200 p-4"
  >
    <form action={updateStaff}>
      <input type="hidden" name="id" value={staff.id} />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div>
          {staff.imageUrl ? (
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-neutral-200">
              <Image
                src={staff.imageUrl}
                alt={staff.imageAlt || staff.name}
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          ) : (
            <div className="flex aspect-[4/5] items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-100">
              <span className="text-xs font-bold tracking-[0.3em] text-neutral-400">
                STAFF
              </span>
            </div>
          )}

          <div className="mt-4">
            <label
              htmlFor={`imageFile-${staff.id}`}
              className="block text-sm font-bold text-neutral-900"
            >
              写真を差し替える
            </label>

            <input
              id={`imageFile-${staff.id}`}
              name="imageFile"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`role-${staff.id}`}
                className="block text-sm font-bold text-neutral-900"
              >
                役職
              </label>

              <input
                id={`role-${staff.id}`}
                name="role"
                type="text"
                defaultValue={staff.role}
                className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
                required
              />
            </div>

            <div>
              <label
                htmlFor={`name-${staff.id}`}
                className="block text-sm font-bold text-neutral-900"
              >
                名前
              </label>

              <input
                id={`name-${staff.id}`}
                name="name"
                type="text"
                defaultValue={staff.name}
                className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`profile-${staff.id}`}
              className="block text-sm font-bold text-neutral-900"
            >
              プロフィール
            </label>

            <textarea
              id={`profile-${staff.id}`}
              name="profile"
              rows={5}
              defaultValue={staff.profile}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
              required
            />
          </div>

          <div>
            <label
              htmlFor={`license-${staff.id}`}
              className="block text-sm font-bold text-neutral-900"
            >
              ライセンス
            </label>

            <textarea
              id={`license-${staff.id}`}
              name="license"
              rows={3}
              defaultValue={staff.license ?? ""}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
            />
          </div>

          <div>
            <label
              htmlFor={`achievement-${staff.id}`}
              className="block text-sm font-bold text-neutral-900"
            >
              指導実績
            </label>

            <textarea
              id={`achievement-${staff.id}`}
              name="achievement"
              rows={4}
              defaultValue={staff.achievement ?? ""}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
            />
          </div>

          <div>
            <label
              htmlFor={`imageAlt-${staff.id}`}
              className="block text-sm font-bold text-neutral-900"
            >
              画像の説明文（alt）
            </label>

            <input
              id={`imageAlt-${staff.id}`}
              name="imageAlt"
              type="text"
              defaultValue={staff.imageAlt ?? ""}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`sortOrder-${staff.id}`}
                className="block text-sm font-bold text-neutral-900"
              >
                表示順
              </label>

              <input
                id={`sortOrder-${staff.id}`}
                name="sortOrder"
                type="number"
                defaultValue={staff.sortOrder}
                className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
              />
            </div>

            <div>
              <label
                htmlFor={`status-${staff.id}`}
                className="block text-sm font-bold text-neutral-900"
              >
                公開状態
              </label>

              <select
                id={`status-${staff.id}`}
                name="status"
                defaultValue={staff.status}
                className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
              >
                <option value="PUBLISHED">公開中</option>
                <option value="DRAFT">下書き</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end border-t border-neutral-200 pt-5">
            <button
              type="submit"
              className="rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
            >
              保存する
            </button>
          </div>
        </div>
      </div>
    </form>

    <div className="mt-3 flex justify-end">
      <StaffDeleteButton staffId={staff.id} name={staff.name} />
    </div>
  </div>
))}
          </div>
        )}
      </div>
    </section>
  );
}