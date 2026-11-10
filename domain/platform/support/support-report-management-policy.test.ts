// domain/platform/support/support-report-management-policy.test.ts
// 全状態遷移と、メモ保存による日時・通知列の不変を確認する。

import {
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import {
  buildSupportReportNoteUpdate, // メモと対応者の限定更新列を構築する純粋関数
  buildSupportReportStatusUpdate, // 同statusの非更新または状態更新列を構築する純粋関数
  type SupportReportNoteUpdate, // メモ保存の限定更新列の型
  type SupportReportStatusUpdate, // ステータス実変更の限定更新列の型
} from "./support-report-management-policy";
import {
  SUPPORT_REPORT_STATUS_OPTIONS, // 報告ステータスの値と表示ラベル一覧
} from "./support-report-query";

const actorId = "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6";
const now = new Date("2026-10-23T01:02:03.004Z"); // 試験用サーバー日時のDateコンストラクター

describe("ステータス遷移", () => { // 遷移の試験群を定義する関数とコールバック
  describe.each(SUPPORT_REPORT_STATUS_OPTIONS)( // 遷移元ごとの試験群定義メソッド
    "$valueから",
    (current) => { // 遷移元を試験するコールバック
      it.each(SUPPORT_REPORT_STATUS_OPTIONS)( // 遷移先ごとの試験定義メソッド
        "$valueへの変更だけで状態日時を更新する",
        (next) => { // 遷移先を試験するコールバック
          const result = buildSupportReportStatusUpdate(current.value, next.value, actorId, now); // 状態更新列を構築する純粋関数
          if (current.value === next.value) {
            expect(result).toEqual({ outcome: "UNCHANGED" }); // 同statusで更新列を持たないことの等値比較メソッド
            return;
          }
          expect(result).toEqual({ // 実変更の等値比較メソッド
            outcome: "UPDATED",
            data: {
              status: next.value,
              handledByPlatformAdminId: actorId,
              statusChangedAt: now,
              resolvedAt: next.value === "RESOLVED" ? now : null,
            },
          });
          if (result.outcome === "UPDATED") {
            expect(result.data.statusChangedAt).not.toBe(now); // 入力日時を参照共有しないことの比較メソッド
            result.data.statusChangedAt.setUTCFullYear(2000); // 返却日時を変更するメソッド
            expect(now.toISOString()).toBe("2026-10-23T01:02:03.004Z"); // 入力日時をUTC ISO化して不変を検証するメソッド
            if (result.data.resolvedAt) {
              expect(result.data.resolvedAt.toISOString()).toBe(now.toISOString()); // 解決日時も参照共有しないことをUTC ISOで比較するメソッド
            }
          }
        },
      );
    },
  );

  it("不正な現在日時では実変更列を構築しない", () => { // 不正日時の試験関数とコールバック
    expect(() => buildSupportReportStatusUpdate( // 例外検証のコールバックと状態更新列構築関数
      "OPEN",
      "RESOLVED",
      actorId,
      new Date("invalid"), // 無効なDateを作るコンストラクター
    )).toThrow("状態変更日時が不正です。"); // 固定エラーだけを検証するメソッド
  });
});

describe("内部メモの限定更新", () => { // メモ更新の試験群を定義する関数とコールバック
  it.each(["対応を確認中", "", null])("%sでも状態日時を返さず対応者を更新する", (note) => { // メモ別の試験定義メソッドとコールバック
    expect(buildSupportReportNoteUpdate(note, actorId)).toEqual({ // メモ更新列構築関数 / 等値比較メソッド
      internalNote: note,
      handledByPlatformAdminId: actorId,
    });
  });

  it("更新型を管理対象の列だけに制限する", () => { // 更新列の型境界を確認する試験関数とコールバック
    expectTypeOf<keyof SupportReportStatusUpdate>() // 状態更新列のキー型を検査する関数
      .toEqualTypeOf<"status" | "handledByPlatformAdminId" | "statusChangedAt" | "resolvedAt">(); // 状態更新の許可キー型を検証するメソッド
    expectTypeOf<keyof SupportReportNoteUpdate>() // メモ更新列のキー型を検査する関数
      .toEqualTypeOf<"internalNote" | "handledByPlatformAdminId">(); // メモと対応者だけのキー型を検証するメソッド
  });
});
