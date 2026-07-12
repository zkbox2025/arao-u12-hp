// app/admin/(dashboard)/monthly-practice-plans/MonthlyPracticePlanUploadForm.tsx
// 月別練習計画PDFのアップロードフォーム

import { createMonthlyPracticePlan } from "./actions";
import {
  getCurrentMonth,
  getCurrentYear,
} from "./monthly-practice-plan-view-helpers";

type MonthlyPracticePlanUploadFormProps = {
  returnPath?: string;
};

export function MonthlyPracticePlanUploadForm({
  returnPath = "/admin/monthly-practice-plans",
}: MonthlyPracticePlanUploadFormProps) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <div className="border-b border-neutral-200 pb-4">
        <h2 className="text-xl font-black text-neutral-900">
          月別練習計画をアップロード
        </h2>

        <p className="mt-2 text-sm leading-7 text-neutral-600">
          PDFをアップロードすると、公開中の最新年月のものがトップページに表示されます。
        </p>
      </div>

      <form action={createMonthlyPracticePlan} className="mt-5 space-y-5">
        <input type="hidden" name="returnPath" value={returnPath} />

        <div>
          <label
            htmlFor="title"
            className="block text-sm font-bold text-neutral-900"
          >
            タイトル
          </label>

          <input
            id="title"
            name="title"
            type="text"
            defaultValue={`${getCurrentYear()}年${getCurrentMonth()}月 練習計画`}
            className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="year"
              className="block text-sm font-bold text-neutral-900"
            >
              年
            </label>

            <input
              id="year"
              name="year"
              type="number"
              defaultValue={getCurrentYear()}
              min="2020"
              max="2100"
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label
              htmlFor="month"
              className="block text-sm font-bold text-neutral-900"
            >
              月
            </label>

            <select
              id="month"
              name="month"
              defaultValue={getCurrentMonth()}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              required
            >
              {Array.from({ length: 12 }, (_, index) => {
                const month = index + 1;

                return (
                  <option key={month} value={month}>
                    {month}月
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="pdfFile"
            className="block text-sm font-bold text-neutral-900"
          >
            PDFファイル
          </label>

          <input
            id="pdfFile"
            name="pdfFile"
            type="file"
            accept="application/pdf"
            className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            required
          />

          <p className="mt-2 text-xs leading-6 text-neutral-500">
            PDFファイルのみアップロードできます。
          </p>
        </div>

        <div>
          <label
            htmlFor="status"
            className="block text-sm font-bold text-neutral-900"
          >
            公開状態
          </label>

          <select
            id="status"
            name="status"
            defaultValue="PUBLISHED"
            className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            required
          >
            <option value="PUBLISHED">公開中</option>
            <option value="DRAFT">下書き</option>
          </select>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            保存する
          </button>
        </div>
      </form>
    </section>
  );
}