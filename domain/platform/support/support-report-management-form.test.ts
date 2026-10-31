// domain/platform/support/support-report-management-form.test.ts
// 管理操作の限定入力、メモ境界、version、公開結果の型を確認する。

import {
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import type {
  SupportReport, // Prismaのサポート報告モデル型
} from "@/types/prisma";
import {
  isSupportReportVersion, // 更新日時のUTC ISO表記を検証する関数
  parseSupportReportNoteFormData, // メモFormDataを検証する関数
  parseSupportReportStatusFormData, // status FormDataを検証する関数
  SUPPORT_REPORT_NOTE_MAX_LENGTH, // 内部メモのUTF-16単位の最大長
  validateSupportReportNoteInput, // メモ入力を正規化・検証する関数
  validateSupportReportStatusInput, // status入力を検証する関数
  type SupportReportNoteInput, // 検証済みメモ保存入力の型
  type SupportReportStatusInput, // 検証済みステータス変更入力の型
} from "./support-report-management-form";
import type {
  PlatformSupportReport, // 認可後の管理画面に限定した報告DTOの型
  PlatformSupportUpdateResult, // 管理更新の固定返却結果型
} from "./support-report-management-types";

const identity = {
  reportId: "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6",
  requestId: "8c4d5e1f-75ba-47bf-9b72-3129f21a2ac6",
  expectedUpdatedAt: "2026-10-23T01:02:03.004Z",
};

// 許可された識別値と操作値だけを持つ送信データを作る。
function form(kind: "status" | "internalNote"): FormData { // 試験用フォーム生成関数 / 操作名の型 / FormData型
  const data = new FormData(); // フォーム値を保持するFormDataコンストラクター
  for (const [key, value] of Object.entries(identity)) { // 識別値のキー・値を列挙するメソッド
    data.set(key, value); // フォーム項目を設定するメソッド
  }
  data.set(kind, kind === "status" ? "RESOLVED" : " メモ "); // 操作値を設定するメソッド
  return data;
}

describe("管理入力の許可列", () => { // 管理入力の試験群を定義する関数とコールバック
  it.each(["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED"])( // 全statusの試験定義メソッド
    "%sを許可し、内部列を取り込まない",
    (status) => { // ステータスごとの試験コールバック
      const result = validateSupportReportStatusInput({ // ステータス入力を検証する関数
        ...identity,
        status,
        internalNote: "無関係なメモ",
        handledByPlatformAdminId: "foreign-admin",
        statusChangedAt: "forged",
        resolvedAt: "forged",
        notifyError: "private",
        clubId: "foreign-club",
      });
      expect(result).toEqual({ // 検証結果の期待値生成関数と等値比較メソッド
        success: true,
        data: {
          ...identity,
          status,
        },
      });
    },
  );

  it("trim済みメモ以外の管理列を採用しない", () => { // メモの限定入力を確認する試験関数とコールバック
    expect(validateSupportReportNoteInput({ // メモ検証関数と期待値生成関数
      ...identity,
      internalNote: "　 メモ\n本文　 ",
      status: "RESOLVED",
      handledByPlatformAdminId: "foreign-admin",
      message: "別本文",
    })).toEqual({ // 許可列だけの等値比較メソッド
      success: true,
      data: {
        ...identity,
        internalNote: "メモ\n本文",
      },
    });
  });

  it.each(["", "　 \t\n", null])("空メモをnullに正規化する %#", (internalNote) => { // 空メモごとの試験メソッドとコールバック
    expect(validateSupportReportNoteInput({ // メモ入力を検証する関数と期待値生成関数
      ...identity,
      internalNote,
    })).toEqual({ // メモ検証関数と等値比較メソッド
      success: true,
      data: {
        ...identity,
        internalNote: null,
      },
    });
  });

  it("5000文字とUTF-16境界を許可し、超過を切り捨てない", () => { // メモ上限の試験関数とコールバック
    const valid = "あ".repeat(SUPPORT_REPORT_NOTE_MAX_LENGTH); // 上限長の文字列を生成するメソッド
    expect(validateSupportReportNoteInput({ // メモ検証関数と期待値生成関数
      ...identity,
      internalNote: ` ${valid} `,
    }).success).toBe(true); // 上限長の成功を比較するメソッド
    expect(validateSupportReportNoteInput({ // メモ検証関数と期待値生成関数
      ...identity,
      internalNote: "😀".repeat(2500), // UTF-16で5000単位の文字列を生成するメソッド
    }).success).toBe(true); // UTF-16上限の成功を比較するメソッド
    expect(validateSupportReportNoteInput({ // メモ検証関数と期待値生成関数
      ...identity,
      internalNote: `${valid}あ`,
    }).success).toBe(false); // 超過の拒否を比較するメソッド
  });

  it.each([undefined, 0, {}, [], new File(["秘密"], "note.txt")])( // 非文字列の試験定義メソッド / Fileコンストラクター
    "非文字列メモを拒否する %#",
    (internalNote) => { // 非文字列メモの試験コールバック
      expect(validateSupportReportNoteInput({ // メモ入力を検証する関数と期待値生成関数
        ...identity,
        internalNote,
      }).success).toBe(false); // メモ検証関数と拒否の比較メソッド
    },
  );

  it.each([undefined, null, [], "input", {}, { // 不正入力ごとの試験を定義するメソッド
    ...identity,
    status: "UNKNOWN",
  }])( // 不正入力ごとの試験定義メソッド
    "不正status入力を拒否する %#",
    (input) => { // 不正入力の試験コールバック
      expect(validateSupportReportStatusInput(input).success).toBe(false); // status検証関数と拒否の比較メソッド
    },
  );

  it.each(["reportId", "requestId", "expectedUpdatedAt"] as const)( // 識別項目別の試験メソッド / 読取専用リテラル型
    "%sを検証する",
    (field) => { // 識別項目ごとの試験コールバック
      const result = validateSupportReportStatusInput({ // status入力を検証する関数
        ...identity,
        status: "OPEN",
        [field]: "invalid-private-value",
      });
      expect(result.success).toBe(false); // 拒否を比較するメソッド
      if (!result.success) {
        expect(Object.keys(result.fieldErrors)).toEqual([field]); // エラー項目を列挙する関数 / 等値比較メソッド
        expect(JSON.stringify(result)).not.toContain("invalid-private-value"); // JSON文字列化メソッド / 秘密値非反射の検証メソッド
      }
    },
  );

  it("reportIdはUUID v7も許可するがrequestIdはv4に限定する", () => { // UUID用途の分離を確認する試験関数とコールバック
    const uuid7 = "7b4d5e1f-75ba-77bf-9b72-3129f21a2ac6";
    expect(validateSupportReportStatusInput({ // status入力を検証する関数と期待値生成関数
      ...identity,
      reportId: uuid7,
      status: "OPEN",
    }).success).toBe(true); // 報告IDの許可を比較するメソッド
    expect(validateSupportReportStatusInput({ // status入力を検証する関数と期待値生成関数
      ...identity,
      requestId: uuid7,
      status: "OPEN",
    }).success).toBe(false); // requestIdの拒否を比較するメソッド
  });
});

describe("単一FormData", () => { // FormData改ざんの試験群を定義する関数とコールバック
  describe.each(["status", "internalNote"] as const)( // 操作別の試験群定義メソッド / 読取専用リテラル型
    "%sフォーム",
    (kind) => { // 操作別の試験コールバック
      const parse = kind === "status" ? parseSupportReportStatusFormData : parseSupportReportNoteFormData; // 各操作用FormData検証関数の参照
      it("余分な権限・通知・本文を返さない", () => { // 許可列の試験関数とコールバック
        const data = form(kind); // 試験用フォーム生成関数
        data.set("handledByPlatformAdminId", "private-admin"); // 余分な項目を設定するメソッド
        data.set("notifyError", "private-error"); // 余分な通知列を設定するメソッド
        const result = parse(data); // 操作別のFormData検証関数
        expect(result.success).toBe(true); // 成功を比較するメソッド
        if (result.success) {
          expect(Object.keys(result.data).sort()).toEqual([ // 成功値のキー列挙・整列・等値比較メソッド
            "expectedUpdatedAt", kind, "reportId", "requestId",
          ].sort()); // 期待するキーを整列するメソッド
        }
      });
      describe.each(["reportId", "expectedUpdatedAt", "requestId", kind])( // 全必須項目の試験群定義メソッド
        "%s",
        (field) => { // 項目別の試験コールバック
          it.each(["missing", "duplicate", "file"])( // 改ざん種別ごとの試験定義メソッド
            "%sを成功値へ変換しない",
            (mode) => { // 改ざん種別ごとの試験コールバック
              const data = form(kind); // 試験用フォーム生成関数
              if (mode === "missing") {
                data.delete(field); // 必須項目を削除するメソッド
              } else if (mode === "duplicate") {
                data.append(field, String(data.get(field))); // 同名値を追加・文字列化・取得するメソッド
              } else {
                data.set(field, new File(["private"], "input.txt")); // File項目の設定メソッドとコンストラクター
              }
              expect(parse(data).success).toBe(false); // 操作別検証関数と拒否の比較メソッド
            },
          );
        },
      );
      it("FormData以外を固定エラーにする", () => { // 不正入力全体の試験関数とコールバック
        expect(parse(null as unknown as FormData).success).toBe(false); // 検証関数 / 不明値とFormDataへの意図的な型アサーション / 比較メソッド
      });
    },
  );
});

describe("versionと型の境界", () => { // 日時・型契約の試験群を定義する関数とコールバック
  it.each([ // 不正日時の試験定義メソッド
    "2026-02-30T01:02:03.004Z", "2026-10-23T25:02:03.004Z",
    "2026-10-23T01:02:03Z", "2026-10-23T01:02:03.004+00:00",
    "invalid", "", null, new Date(), // Dateを作るコンストラクター
  ])("不正versionを拒否する %#", (value) => { // 不正日時の試験コールバック
    expect(isSupportReportVersion(value)).toBe(false); // version検証関数と比較メソッド
  });

  it("UTC ISO文字列を許可する", () => { // 正規日時の試験関数とコールバック
    expect(isSupportReportVersion(identity.expectedUpdatedAt)).toBe(true); // version検証関数と比較メソッド
    expect(isSupportReportVersion("2024-02-29T00:00:00.000Z")).toBe(true); // うるう日検証関数と比較メソッド
  });

  it("入力と公開更新結果に管理列・本文を混ぜない", () => { // 型による非開示境界の試験関数とコールバック
    expectTypeOf<keyof SupportReportStatusInput>() // status入力のキー型を検査する関数
      .toEqualTypeOf<"reportId" | "requestId" | "expectedUpdatedAt" | "status">(); // 許可キー型との一致を検証するメソッド
    expectTypeOf<SupportReportNoteInput["internalNote"]>() // 正規化メモの型を検査する関数
      .toEqualTypeOf<SupportReport["internalNote"]>(); // DBのメモnullable型との一致を検証するメソッド
    expectTypeOf<keyof Extract<PlatformSupportUpdateResult, { outcome: "UPDATED" | "UNCHANGED" }>>() // 更新成功結果のキー型を抽出・検査する関数
      .toEqualTypeOf<"outcome" | "reportId" | "updatedAt">(); // 公開結果の許可キー型との一致を検証するメソッド
    expectTypeOf<Extract<keyof PlatformSupportReport, "notifyError" | "membershipId">>() // 管理DTOの不要キー型を抽出・検査する関数
      .toEqualTypeOf<never>(); // 不要キーが存在しないnever型を検証するメソッド
  });
});
