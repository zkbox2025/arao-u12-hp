// src/infrastructure/storage/pdf-file-validation.test.ts
//イベントお知らせに添付されてるPDFの検査関数のテスト

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  validatePdfFiles,
} from "@/src/infrastructure/storage/pdf-file-validation";

vi.mock("server-only", () => ({}));

function createFile(input?: {
  content?: string;
  name?: string;
  type?: string;
}): File {
  return new File(
    [
      input?.content ??
        "%PDF-1.7\nPDF content",
    ],
    input?.name ?? "document.pdf",
    {
      type:
        input?.type ??
        "application/pdf",
    },
  );
}

describe("validatePdfFiles", () => {
  it("正しいPDFを受け入れる", async () => {
    const result =
      await validatePdfFiles({
        files: [createFile()],
      });

    expect(result).toEqual({
      success: true,
      issues: [],
    });
  });

  it("ファイルが0件でも成功する", async () => {
    const result =
      await validatePdfFiles({
        files: [],
      });

    expect(result.success).toBe(true);
  });

  it("空ファイルを拒否する", async () => {
    const result =
      await validatePdfFiles({
        files: [
          createFile({
            content: "",
          }),
        ],
      });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.issues.map(
          (issue) => issue.code,
        ),
      ).toContain("EMPTY_FILE");
    }
  });

  it("ファイル数上限を検査する", async () => {
    const result =
      await validatePdfFiles({
        files: [
          createFile(),
          createFile(),
          createFile(),
        ],
        limits: {
          maxFiles: 2,
        },
      });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.issues.map(
          (issue) => issue.code,
        ),
      ).toContain("TOO_MANY_FILES");
    }
  });

  it("既存ファイルを含めてファイル数を検査する", async () => {
    const result =
      await validatePdfFiles({
        files: [createFile()],
        existingFileCount: 2,
        limits: {
          maxFiles: 2,
        },
      });

    expect(result.success).toBe(false);
  });

  it("1ファイルの容量上限を検査する", async () => {
    const result =
      await validatePdfFiles({
        files: [
          createFile({
            content:
              "%PDF-" + "x".repeat(100),
          }),
        ],
        limits: {
          maxFileSizeBytes: 50,
          maxTotalSizeBytes: 200,
        },
      });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.issues.map(
          (issue) => issue.code,
        ),
      ).toContain("FILE_TOO_LARGE");
    }
  });

  it("合計容量上限を検査する", async () => {
    const result =
      await validatePdfFiles({
        files: [
          createFile({
            content:
              "%PDF-" + "a".repeat(20),
          }),
          createFile({
            content:
              "%PDF-" + "b".repeat(20),
          }),
        ],
        limits: {
          maxFileSizeBytes: 100,
          maxTotalSizeBytes: 30,
        },
      });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.issues.map(
          (issue) => issue.code,
        ),
      ).toContain(
        "TOTAL_SIZE_EXCEEDED",
      );
    }
  });

  it("application/pdf以外を拒否する", async () => {
    const result =
      await validatePdfFiles({
        files: [
          createFile({
            type: "text/plain",
          }),
        ],
      });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.issues.map(
          (issue) => issue.code,
        ),
      ).toContain(
        "INVALID_MIME_TYPE",
      );
    }
  });

  it(".pdf以外の拡張子を拒否する", async () => {
    const result =
      await validatePdfFiles({
        files: [
          createFile({
            name: "document.txt",
          }),
        ],
      });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.issues.map(
          (issue) => issue.code,
        ),
      ).toContain(
        "INVALID_EXTENSION",
      );
    }
  });

  it("%PDF-で始まらないファイルを拒否する", async () => {
    const result =
      await validatePdfFiles({
        files: [
          createFile({
            content: "not a pdf",
          }),
        ],
      });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(
        result.issues.map(
          (issue) => issue.code,
        ),
      ).toContain(
        "INVALID_SIGNATURE",
      );
    }
  });

  it.each([
    "folder/document.pdf",
    "folder\\document.pdf",
    "document\n.pdf",
    "document\u0000.pdf",
  ])(
    "危険なファイル名を拒否する: %s",
    async (name) => {
      const result =
        await validatePdfFiles({
          files: [
            createFile({
              name,
            }),
          ],
        });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(
          result.issues.map(
            (issue) => issue.code,
          ),
        ).toContain(
          "UNSAFE_FILE_NAME",
        );
      }
    },
  );
});