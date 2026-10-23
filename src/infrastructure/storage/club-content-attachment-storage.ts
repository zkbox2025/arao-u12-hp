// src/infrastructure/storage/club-content-attachment-storage.ts
//イベント・お知らせ共通Storage処理
//アップロード、アップロード失敗の処理（お掃除）、「Public: OFF（非公開）」のバケットから、安全にPDFをダウンロード・閲覧するための
//「期間限定の秘密のURL」を発行する関数
//ストレージからPDFファイルを安全に削除する関数（補足：削除失敗した場合は、「じゃあ1分後にまた自動でリトライしよう！」という予定を立てる関数（buildStorageDeletionNextAttemptAt）が今後別ファイルで呼び出される）

import "server-only";

import {
  randomUUID,//誰とも被らない独自のIDを自動で作り出す機能
} from "node:crypto";

import {
  createSupabaseAdminClient,// Storage操作専用のService Roleクライアント(アプリのPDFに使う)
} from "@/src/infrastructure/supabase/admin";

import {
  CLUB_ATTACHMENT_BUCKET,//ストレージ内の保管場所の名前
} from "@/src/infrastructure/storage/club-attachment-storage-constants";

    //PDFをストレージにアップロードする際の戻り値
export type UploadedClubAttachment = {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  displayOrder: number;
};

type ContentDirectory =
  | "notices"
  | "events";

  //ストレージにPDFをアップロードする関数
export async function uploadClubContentAttachments(
  input: {
    clubId: string;
    contentId: string;

    contentDirectory:
      ContentDirectory;

    files: readonly File[];

    startDisplayOrder: number;//新しく追加するPDFファイルに、何番から並び順（連番）を割り当て始めるか」を決めるための開始番号（スタート位置）
  },
): Promise<
  UploadedClubAttachment[]
> {
  const supabase =
    createSupabaseAdminClient();

  const uploaded://Supabase Storageへのアップロードが成功した新しいファイルたちの情報を、1つずつ一時的に記録（ストック）しておくための空っぽの箱（配列）
    UploadedClubAttachment[] = [];

  try {
    for (//ファイルと番号を取得
      const [
        index,
        file,
      ] of input.files.entries()
    ) {
      const storagePath = [//randomUUID使ってファイル名を作り、それを元に保存パスを作成する
        "clubs",
        input.clubId,
        input.contentDirectory,
        input.contentId,
        `${randomUUID()}.pdf`,
      ].join("/");

      const fileBody =//ファイルをバイナリデータ（arrayBuffer）に変換してバケットにアップロードする
        await file.arrayBuffer();

      const {
        error,
      } = await supabase.storage//contentType: "application/pdf" を明示的に指定して、PDFとして正しく保存しています。
        .from(
          CLUB_ATTACHMENT_BUCKET,
        )
        .upload(
          storagePath,
          fileBody,
          {
            contentType:
              "application/pdf",

            upsert: false,

            cacheControl: "3600",
          },
        );

      if (error) {
        throw new Error(
          "PDFのアップロードに失敗しました。",
          {
            cause: error,
          },
        );
      }

      uploaded.push({//成功したデータを箱(uploaded)に詰める
        storagePath,
        fileName: file.name,
        mimeType:
          "application/pdf",
        sizeBytes: file.size,

        displayOrder:
          input.startDisplayOrder +//新しく追加するPDFファイルに、何番から並び順（連番）を割り当て始めるか」を決めるための開始番号（スタート位置）にindexをプラスする
          index,
      });
    }

    return uploaded;
  } catch (error) {
    // 3つのPDFを同時にアップロードしているとき、2つ目までは成功したのに、
    // 3つ目でインターネットが切れてエラーになった場合、
    //1つ目と2つ目のファイルだけがSupabase Storageの中にゴミデータとして一生残り続ける不具合を防ぐため、
    //uploaded（それまでに成功したファイルリスト）を確認し、途中までアップロードしたファイル（1つ目と2つ目）
    // をStorageから自動で綺麗に削除する
    await deleteClubContentStorageObjects({
      storagePaths:
        uploaded.map(
          (attachment) =>
            attachment.storagePath,
        ),
    });

    throw error;
  }
}

//一つでも保存失敗した場合、それ以外の保存成功したファイルをストレージから削除する関数
//戻り値は保存成功したファイルの削除に失敗した値（なければ空）
// 複数ファイルを補償削除する関数
export async function deleteClubContentStorageObjects(
  input: {
    storagePaths:
      readonly string[];
  },
): Promise<{
  failedStoragePaths: string[];
  failedCount: number;
}> {
  const failedStoragePaths:
    string[] = [];

  for (
    const storagePath
    of new Set(
      input.storagePaths,
    )
  ) {
    const result =
      await deleteClubStorageObject({//Supabase（クラウドストレージ）からクラブの添付ファイル（PDFなど）を安全に1件削除するための関数
        bucket:
          CLUB_ATTACHMENT_BUCKET,

        storagePath,
      });

    if (!result.success) {
      failedStoragePaths.push(
        storagePath,
      );
    }
  }

  return {
    failedStoragePaths,

    failedCount:
      failedStoragePaths.length,
  };
}


//「Public: OFF（非公開）」のバケットから、安全にPDFをダウンロード・閲覧するための
// 「期間限定の秘密のURL」を発行する関数(ファイル（PDF）のURLをそのままブラウザに入力しても、Supabaseに拒否されてダウンロードすることができないから、
//5分間だけ有効な、パスワード付きの特殊なURLを発行する）
export async function createClubAttachmentSignedUrl(
  storagePath: string,
): Promise<string> {
  const supabase =
    createSupabaseAdminClient();

  const {
    data,
    error,
  } = await supabase.storage//「5分間（5 × 60秒）」だけアクセスを許可する特別なURLをSupabaseに作らせる
    .from(
      CLUB_ATTACHMENT_BUCKET,
    )
    .createSignedUrl(
      storagePath,
      5 * 60,
    );

  if (
    error ||
    !data.signedUrl
  ) {
    throw new Error(
      "PDFの閲覧URLを作成できませんでした。",
      {
        cause: error,
      },
    );
  }

  return data.signedUrl;
}
//※もしユーザーがそのURLをコピーしてSNSなどに貼り付けたり、部外者に転送したりしても、
// 5分後には自動で使えなくなるため、大切なPDFが外部にずっと流出し続けるのを防ぐことができます。



//削除関数が返す結果の型
export type DeleteClubStorageObjectResult =
  | {
      success: true;
    }
  | {
      success: false;

      errorCode:
        | "UNSUPPORTED_BUCKET"//失敗（バケット不正）
        | "STORAGE_DELETE_FAILED";//失敗（削除失敗）
    };


 //返ってきたエラーが404かどうかを判定する関数
 //Supabaseが「すでに存在しない」を404で返した場合も削除完了として扱う。

function isStorageNotFoundError(
  error: unknown,
): boolean {
  if (//エラーの中身が文字列ではなかったり、nullの場合はfalseを返す
    typeof error !== "object" ||
    error === null
  ) {
    return false;
  }

  const candidate =//エラーの中身を取り出す
    error as {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
    };

  return [//エラーの中身が数値の404または文字列の404が含まれればtrueを返す
    candidate.status,
    candidate.statusCode,
    candidate.code,
  ].some(
    (value) =>
      value === 404 ||
      value === "404",
  );
}

//Supabase（クラウドストレージ）からクラブの添付ファイル（PDFなど）を安全に1件削除するための関数
export async function deleteClubStorageObject(
  input: {
    bucket: string;//保管場所の名前
    storagePath: string;//ファイルの場所
  },
): Promise<DeleteClubStorageObjectResult> {
  /*
   * DBが改ざんされても、
   * 想定外のbucketを削除しない。
   */
  if (
    input.bucket !==
    CLUB_ATTACHMENT_BUCKET//違う保管場所のデータは削除しないでエラーを返す
  ) {
    return {
      success: false,
      errorCode:
        "UNSUPPORTED_BUCKET",
    };
  }

  //ストレージからファイルの削除を試みる
  try {
    const supabase =
      createSupabaseAdminClient();

    const {
      error,
    } = await supabase.storage
      .from(input.bucket)
      .remove([
        input.storagePath,
      ]);

//エラーがない場合、もしくはすでにファイルがない（404）場合、成功として扱う
    if (
      !error ||
      isStorageNotFoundError(
        error,
      )
    ) {
      return {
        success: true,
      };
    }

    //上記以外の予期せぬエラー（通信遮断など）が起きた場合は、すべて安全に
    // 「削除失敗（STORAGE_DELETE_FAILED）」として処理を終了します
    return {
      success: false,
      errorCode:
        "STORAGE_DELETE_FAILED",
    };
  } catch {
    return {
      success: false,
      errorCode:
        "STORAGE_DELETE_FAILED",
    };
  }
}