// app/admin/(dashboard)/dashboard/DashboardSessionApplicationTable.tsx
// ダッシュボード用の体験/見学申し込み一覧テーブル

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import type {
  Grade,
  SessionApplicationStatus,
  SessionType,
} from "@/types/prisma";
import {
  GRADE_LABELS,
  SESSION_TYPE_LABELS,
} from "@/constants/adminLabels";
import { SessionApplicationStatusBadge } from "@/components/admin/status/SessionApplicationStatusBadge";
import {
  formatAdminDate,
  formatAdminDateOrFallback,
} from "@/lib/utils/date";
import { truncateText } from "@/lib/utils/text";

type DashboardSessionApplication = {
  id: string;
  createdAt: Date;
  type: SessionType;
  childName: string;
  childGrade: Grade;
  preferredDate1: Date | null;
  status: SessionApplicationStatus;
};

type DashboardSessionApplicationTableProps = {
  sessionApplications: DashboardSessionApplication[];
};

export function DashboardSessionApplicationTable({
  sessionApplications,
}: DashboardSessionApplicationTableProps) {
  return (
    <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center text-neutral-900">
            <ClipboardList size={24} aria-hidden="true" />
          </span>

          <h2 className="text-xl font-black text-neutral-900">
            体験/見学申し込み
          </h2>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-225 border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-neutral-600">
              <th className="px-4 py-3 font-bold">受信日時</th>
              <th className="px-4 py-3 font-bold">参加内容</th>
              <th className="px-4 py-3 font-bold">子どものお名前</th>
              <th className="px-4 py-3 font-bold">学年</th>
              <th className="px-4 py-3 font-bold">第一希望日</th>
              <th className="px-4 py-3 font-bold">対応ステータス</th>
            </tr>
          </thead>

          <tbody>
            {sessionApplications.map((application) => (
              <tr
                key={application.id}
                className="group border-b border-neutral-200 transition hover:bg-green-50"
              >
                <td className="px-4 py-0">
                  <Link
                    href={`/admin/session-application/${application.id}#top`}
                    className="block py-4 text-neutral-700"
                  >
                    {formatAdminDate(application.createdAt)}
                  </Link>
                </td>

                <td className="px-4 py-0">
                  <Link
                    href={`/admin/session-application/${application.id}#top`}
                    className="block py-4 font-bold text-neutral-900"
                  >
                    {SESSION_TYPE_LABELS[application.type]}
                  </Link>
                </td>

                <td className="px-4 py-0">
                  <Link
                    href={`/admin/session-application/${application.id}#top`}
                    className="block py-4 font-bold text-neutral-900"
                  >
                    {truncateText(application.childName)}
                  </Link>
                </td>

                <td className="px-4 py-0">
                  <Link
                    href={`/admin/session-application/${application.id}#top`}
                    className="block py-4 text-neutral-700"
                  >
                    {GRADE_LABELS[application.childGrade]}
                  </Link>
                </td>

                <td className="px-4 py-0">
                  <Link
                    href={`/admin/session-application/${application.id}#top`}
                    className="block py-4 text-neutral-700"
                  >
                    {formatAdminDateOrFallback(application.preferredDate1)}
                  </Link>
                </td>

                <td className="px-4 py-0">
                  <Link
                    href={`/admin/session-application/${application.id}#top`}
                    className="block py-4"
                  >
                    <SessionApplicationStatusBadge
                      status={application.status}
                    />
                  </Link>
                </td>
              </tr>
            ))}

            {sessionApplications.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-neutral-500"
                >
                  体験/見学申し込みはまだありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-end">
        <Link
          href="/admin/session-application#top"
          className="inline-flex rounded-lg border border-neutral-300 bg-white px-5 py-3 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100"
        >
          もっと見る
        </Link>
      </div>
    </section>
  );
}