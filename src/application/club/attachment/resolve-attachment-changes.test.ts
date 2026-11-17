//src/application/club/attachment/resolve-attachment-changes.test.ts
//PDFの編集（追加や削除）が発生したときに、バグや不正な操作が起きないようデータを整理し、
// 次に必要な情報をすべて揃えてくれる『司令塔』のような関数のテスト



import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getPdfFilesFromFormData,
} from "./resolve-attachment-changes";

describe(
  "getPdfFilesFromFormData",
  () => {
    it(
      "選択件数が0なら未選択Fileの名前に関係なく除外する",
      () => {
        const formData =
          new FormData();

        /*
         * ブラウザやmultipartパーサーが、
         * 予想外の名前で0バイトFileを生成した状況を再現する。
         */
        formData.append(
          "attachmentFiles",
          new File(
            [],
            "unexpected-placeholder",
            {
              type:
                "application/octet-stream",
            },
          ),
        );

        formData.set(
          "attachmentFilesCount",
          "0",
        );

        expect(
          getPdfFilesFromFormData(
            formData,
          ),
        ).toEqual([]);
      },
    );

    it(
      "選択件数が送信されていない場合はファイルなしにする",
      () => {
        const formData =
          new FormData();

        formData.append(
          "attachmentFiles",
          new File(
            [],
            "placeholder",
            {
              type:
                "application/octet-stream",
            },
          ),
        );

        expect(
          getPdfFilesFromFormData(
            formData,
          ),
        ).toEqual([]);
      },
    );

    it(
      "実際に選択されたPDFを取得する",
      () => {
        const formData =
          new FormData();

        const pdf =
          new File(
            ["%PDF-1.7"],
            "document.pdf",
            {
              type:
                "application/pdf",
            },
          );

        formData.append(
          "attachmentFiles",
          pdf,
        );

        formData.set(
          "attachmentFilesCount",
          "1",
        );

        expect(
          getPdfFilesFromFormData(
            formData,
          ),
        ).toEqual([pdf]);
      },
    );

    it(
      "実際に選択された0バイトPDFは後段の検証へ渡す",
      () => {
        const formData =
          new FormData();

        const emptyPdf =
          new File(
            [],
            "empty.pdf",
            {
              type:
                "application/pdf",
            },
          );

        formData.append(
          "attachmentFiles",
          emptyPdf,
        );

        formData.set(
          "attachmentFilesCount",
          "1",
        );

        expect(
          getPdfFilesFromFormData(
            formData,
          ),
        ).toEqual([
          emptyPdf,
        ]);
      },
    );

    it(
      "複数選択したPDFをすべて取得する",
      () => {
        const formData =
          new FormData();

        const firstPdf =
          new File(
            ["%PDF-first"],
            "first.pdf",
            {
              type:
                "application/pdf",
            },
          );

        const secondPdf =
          new File(
            ["%PDF-second"],
            "second.pdf",
            {
              type:
                "application/pdf",
            },
          );

        formData.append(
          "attachmentFiles",
          firstPdf,
        );

        formData.append(
          "attachmentFiles",
          secondPdf,
        );

        formData.set(
          "attachmentFilesCount",
          "2",
        );

        expect(
          getPdfFilesFromFormData(
            formData,
          ),
        ).toEqual([
          firstPdf,
          secondPdf,
        ]);
      },
    );

    it(
      "選択件数が不正ならファイルなしにする",
      () => {
        const formData =
          new FormData();

        formData.append(
          "attachmentFiles",
          new File(
            ["%PDF-1.7"],
            "document.pdf",
            {
              type:
                "application/pdf",
            },
          ),
        );

        formData.set(
          "attachmentFilesCount",
          "invalid",
        );

        expect(
          getPdfFilesFromFormData(
            formData,
          ),
        ).toEqual([]);
      },
    );
  },
);