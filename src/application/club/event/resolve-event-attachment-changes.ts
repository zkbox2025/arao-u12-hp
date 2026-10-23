// src/application/club/event/resolve-event-attachment-changes.ts
//イベントのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数

import {
  resolveAttachmentChanges,//PDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
  type ExistingClubAttachment,//既存の添付PDFファイル情報
} from "@/src/application/club/attachment/resolve-attachment-changes";

export function resolveEventAttachmentChanges(
  input: {
    existingAttachments:
      readonly ExistingClubAttachment[];//既存の添付PDFファイル情報

    deleteAttachmentIds:
      readonly string[];

    newFiles:
      readonly File[];
  },
) {
  return resolveAttachmentChanges(//PDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
    input,
  );
}