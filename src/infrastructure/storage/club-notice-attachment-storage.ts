// src/infrastructure/storage/club-notice-attachment-storage.ts
//お知らせのPDFStorage処理
//アップロード、アップロード失敗の処理（お掃除）

import {
  deleteClubContentStorageObjects,//一つでも保存失敗した場合、それ以外の保存成功したファイルをストレージから削除する関数
  uploadClubContentAttachments,  //ストレージにPDFをアップロードする関数
} from "./club-content-attachment-storage";

//お知らせのPDFストレージアップロード関数
export function uploadClubNoticeAttachments(
  input: {
    clubId: string;
    noticeId: string;
    files: readonly File[];
    startDisplayOrder: number;
  },
) {
  return uploadClubContentAttachments({  //ストレージにPDFをアップロードする関数
    clubId: input.clubId,
    contentId:
      input.noticeId,

    contentDirectory:
      "notices",

    files: input.files,

    startDisplayOrder:
      input.startDisplayOrder,
  });
}

//お知らせのPDFの保存が一つでも失敗した際に、保存成功したPDFをストレージから削除する関数
export function deleteClubNoticeStorageObjects(
  storagePaths:
    readonly string[],
) {
  return deleteClubContentStorageObjects({//一つでも保存失敗した場合、それ以外の保存成功したファイルをストレージから削除する関数
    storagePaths,
  });
}