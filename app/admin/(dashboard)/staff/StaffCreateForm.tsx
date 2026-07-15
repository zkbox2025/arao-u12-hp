// app/admin/(dashboard)/staff/StaffCreateForm.tsx
// スタッフ新規追加フォーム

import { createStaff } from "./actions";

export function StaffCreateForm() {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <div className="border-b border-neutral-200 pb-4">
        <h2 className="text-xl font-black text-neutral-900">
          スタッフを追加
        </h2>

        <p className="mt-2 text-sm leading-7 text-neutral-600">
          スタッフ紹介ページに表示する人物情報を追加します。
        </p>
      </div>

      <form action={createStaff} className="mt-5 space-y-5">
  <div className="grid gap-4 sm:grid-cols-2">
    <div>
      <label
        htmlFor="create-role"
        className="block text-sm font-bold text-neutral-900"
      >
        役職
      </label>

      <input
        id="create-role"
        name="role"
        type="text"
        placeholder="例：コーチ"
        className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
        required
      />
    </div>

    <div>
      <label
        htmlFor="create-externalRole"
        className="block text-sm font-bold text-neutral-900"
      >
        外部役職
      </label>

      <input
        id="create-externalRole"
        name="externalRole"
        type="text"
        placeholder="例：荒尾市バスケットボール協会 会長"
        className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
      />

      <p className="mt-2 text-xs leading-6 text-neutral-500">
        クラブ外での役職がある場合のみ入力してください。
      </p>
    </div>
  </div>

  <div>
    <label
      htmlFor="create-name"
      className="block text-sm font-bold text-neutral-900"
    >
      名前
    </label>

    <input
      id="create-name"
      name="name"
      type="text"
      placeholder="例：田中 太郎"
      className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
      required
    />
  </div>

        <div>
          <label
            htmlFor="create-profile"
            className="block text-sm font-bold text-neutral-900"
          >
            プロフィール
          </label>

          <textarea
            id="create-profile"
            name="profile"
            rows={5}
            placeholder="例：田中太郎（たなか たろう）&#10;1994年4月14日生まれ&#10;熊本県荒尾市出身"
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
            required
          />
        </div>

        <div>
          <label
            htmlFor="create-license"
            className="block text-sm font-bold text-neutral-900"
          >
            ライセンス
          </label>

          <textarea
            id="create-license"
            name="license"
            rows={3}
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
          />
        </div>

        <div>
          <label
            htmlFor="create-achievement"
            className="block text-sm font-bold text-neutral-900"
          >
            指導実績
          </label>

          <textarea
            id="create-achievement"
            name="achievement"
            rows={4}
            placeholder="例：2024年：全国大会出場"
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
          />
        </div>

        <div>
          <label
            htmlFor="create-imageFile"
            className="block text-sm font-bold text-neutral-900"
          >
            スタッフ写真
          </label>

          <input
            id="create-imageFile"
            name="imageFile"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </div>

        <div>
          <label
            htmlFor="create-imageAlt"
            className="block text-sm font-bold text-neutral-900"
          >
            画像の説明文（alt）
          </label>

          <input
            id="create-imageAlt"
            name="imageAlt"
            type="text"
            placeholder="例：総監督 田中太郎"
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="create-sortOrder"
              className="block text-sm font-bold text-neutral-900"
            >
              表示順
            </label>

            <input
              id="create-sortOrder"
              name="sortOrder"
              type="number"
              defaultValue={1}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
            />
          </div>

          <div>
            <label
              htmlFor="create-status"
              className="block text-sm font-bold text-neutral-900"
            >
              公開状態
            </label>

            <select
              id="create-status"
              name="status"
              defaultValue="PUBLISHED"
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
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            スタッフを追加する
          </button>
        </div>
      </form>
    </section>
  );
}