// src/infrastructure/storage/club-event-attachment-storage.ts
//イベントのPDFStorage処理
//アップロード、アップロード失敗の処理（お掃除）

import {
  deleteClubContentStorageObjects,//一つでもストレージへのPDF保存失敗した場合、それ以外の保存成功したファイルをストレージから削除する関数
  uploadClubContentAttachments,  //ストレージにPDFをアップロードする関数
} from "./club-content-attachment-storage";


//イベントのPDFストレージアップロード関数
export function uploadClubEventAttachments(
  input: {
    clubId: string;
    eventId: string;
    files: readonly File[];
    startDisplayOrder: number;
  },
) {
  return uploadClubContentAttachments({//ストレージにPDFをアップロードする関数
    clubId: input.clubId,
    contentId:
      input.eventId,

    contentDirectory:
      "events",

    files: input.files,

    startDisplayOrder:
      input.startDisplayOrder,
  });
}

//イベントのPDFのストレージ保存が一つでも失敗した際に、保存成功したPDFをストレージから削除する関数
export function deleteClubEventStorageObjects(
  storagePaths:
    readonly string[],
) {
  return deleteClubContentStorageObjects({//一つでもストレージへのPDF保存失敗した場合、それ以外の保存成功したファイルをストレージから削除する関数
    storagePaths,
  });
}