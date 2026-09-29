// app/(club-app)/club/admin/_components/ContentAttachmentFieldset.tsx
// お知らせ・イベント共通PDF入力欄

"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  FieldErrorList,//各入力項目ごとのエラーメッセージ配列を受け取り、エラーを赤字の箇条書きで各入力項目に表示する関数
} from "./FieldErrorList";

import {
  formatFileSize,//PDFのファイルのサイズを人が理解できる単位に自動変換する関数
} from "@/domain/shared/file-size";

type ContentAttachmentFieldsetProps = {
  idPrefix: string;//IDの最初の文字（例：usr_12345（ユーザー））
  clubSlug: string;
  contentType:
    | "notice"
    | "event";
  existingAttachments:
    readonly {
      id: string;
      fileName: string;
      sizeBytes: number;
    }[];
  errors?: readonly string[];
  disabled: boolean;//有効か無効かの真偽
  onChange?: () => void; // ファイルの追加・解除を未保存変更として通知する。
};


//引数として受け取った File オブジェクトから、一意の識別文字列（キー）を作る関数
function buildFileIdentity(
  file: File,
): string {
  return [
    file.name,
    file.size,
    file.lastModified,
  ].join(":");//コロン : で結合した文字列にする
}

//すでに選択済みのPDFへ新しい選択を追加する
function mergeFiles(
  currentFiles:
    readonly File[],
  addedFiles:
    readonly File[],
): File[] {
  const filesByIdentity =
    new Map<string, File>();//同じラベルが一つしか入らないようにする

  for (
    const file
    of [
      ...currentFiles,
      ...addedFiles,
    ]
  ) {
    filesByIdentity.set(
      buildFileIdentity(file),//一意の識別文字列（キー）を作る関数(これにより重複を消す)
      file,
    );
  }

  return [
    ...filesByIdentity.values(),
  ];
}

//お知らせ・イベント共通PDF入力欄
export function ContentAttachmentFieldset({
  idPrefix,
  clubSlug,
  contentType,
  existingAttachments,
  errors,
  disabled,
  onChange,
}: ContentAttachmentFieldsetProps) {

  //PDFファイルを選択するHTMLのボタン（<input type="file">）」を、
  //プログラム側から直接指さして操作できるようにするための「リモコン」を作成する
  const fileInputRef =
    useRef<HTMLInputElement>(
      null,
    );

    //画面更新のためにユーザーが今、どのPDFファイルを選んでいるかという状態（データ）をReactに記憶させておくための「ファイル置き場」
  const [
    selectedFiles,
    setSelectedFiles,
  ] = useState<File[]>([]);

  const inputId =
    `${idPrefix}-attachments`;

  const helpId =
    `${idPrefix}-attachment-help`;

  const selectedFilesId =
    `${idPrefix}-selected-attachments`;

  const errorId =
    `${idPrefix}-attachment-errors`;

  const encodedClubSlug =
    encodeURIComponent(clubSlug);

  const hasErrors =//今エラーが起きているかどうか（yesかno）
    Boolean(errors?.length);


    //視覚障害などを持つ方が使うスクリーンリーダー（画面読み上げソフト）に対して、
    // 「この入力欄（PDFファイル選択ボタンなど）には、どんな説明文やエラーメッセージが紐付いているか」を正しく伝えるための
    // 「IDのリスト」を作っているコード
  const describedBy = [
    helpId,
    selectedFiles.length > 0
      ? selectedFilesId
      : null,
    hasErrors
      ? errorId
      : null,
  ]
    .filter(//配列の中から中身がないものを除外する
      (
        id,
      ): id is string =>
        id !== null,
    )
    .join(" ");//残ったIDを一つの文字列にする


  //「画面でアップロードしたPDFファイル一覧を、ブラウザが本番の送信時に使うファイルデータ（input.files）へ反映する。
  //「プログラム上のPDFファイルリスト」と「ブラウザが持っているPDFファイルリスト」のズレをなくすための裏方処理
  //なぜこの処理をするのか：Reactの開発では、通常「データ（State）が変われば、画面（HTML）も自動的に変わる」というのが基本です。
  // しかし、HTMLのファイル選択ボタン（<input type="file">）だけは例外で、セキュリティの理由
  // （悪意あるプログラムが勝手にパソコン内のファイルを盗み見ないようにするため）から、ブラウザがガチガチに保護しています。
  // そのため、React側から「重複消したから、ボタンの中身もこれに変えといて！」と普通に命令しても、ブラウザが無視してしまいます。
  // そこで、ブラウザが唯一認めている合法的な手続き（DataTransfer という輸送ケースを使う方法）を使って、
  // 「これが今、画面に表示されている正しいファイルリストだよ。だからそっちのデータもこれで上書きしてね！」と手動で同期させている
  function updateNativeFileInput(
    files: readonly File[],
  ): void {
    const input =
      fileInputRef.current; //以前用意した「リモコン（fileInputRef）」を使って、
      // 画面上の本物のPDFファイル選択ボタン（input）を捕まえる。もしボタンがまだ画面に存在していなければ、何もせず処理を終了。

    if (!input) {
      return;
    }

    //ファイルを詰め込んでボタンに届けるための、「専用の輸送ケース（DataTransfer）」を作る
    const dataTransfer =
      new DataTransfer();

    for (const file of files) {//DataTransferにファイルを追加していく
      dataTransfer.items.add(file);
    }

    //輸送ケースの中身（dataTransfer.files）を、PDFファイル選択ボタンのデータ置き場（input.files）に
    //上書き代入します。これでブラウザ側のデータが最新に更新されます。
    input.files =
      dataTransfer.files;
  }

  //これまでのパーツ（PDF重複消去、リモコンの同期、画面の更新）をまとめて処理する関数
  function handleFileSelection(
    event:
      ChangeEvent<HTMLInputElement>,
  ): void {
    const addedFiles =
      Array.from(//新しく選択されたファイルを配列に変換する
        event.currentTarget.files ??
          [],
      );

    if (
      addedFiles.length === 0
    ) {
      return;
    }

    const nextFiles =//以下を合体する
      mergeFiles(
        selectedFiles,//以前選んだファイル
        addedFiles,//今選んだファイル
      );

    updateNativeFileInput(//「画面でアップロードしたPDFファイル一覧を、ブラウザが本番の送信時に使うファイルデータ（input.files）へ反映する。
      nextFiles,
    );

    setSelectedFiles(//画面を更新する
      nextFiles,
    );

    onChange?.();//親コンポーネントに変更を報告する
  }

  //ユーザーが画面上で「選択から外す」ボタンを押したときに、
  // 以前選んだPDFファイルの中から特定のPDFファイルを1個だけ削除する関数
  function removeSelectedFile(
    removeIndex: number,//削除したPDFファイルが何番目か
  ): void {
    const nextFiles =
      selectedFiles.filter(//以前選んだPDFファイルの中から、削除するPDFファイルの番号と一致しないものだけを残す
        (
          _file,
          index,
        ) =>
          index !==//削除するファイルの番号と一致しないものだけを残す
          removeIndex,
      );

    updateNativeFileInput(//「画面でアップロードしたPDFファイル一覧を、ブラウザが本番の送信時に使うファイルデータ（input.files）へ反映する。
      nextFiles,
    );

    setSelectedFiles(//画面を更新する（削除ファイルを除く）
      nextFiles,
    );

    onChange?.();//親コンポーネントに変更を報告する
  }

  // Reactやブラウザによってフォームがリセットされた場合に
  // PDF選択ファイル表示も空へ戻す。
  useEffect(() => {
    const input =
      fileInputRef.current;

    const form =
      input?.form;//リモコン（fileInputRef）を使ってファイル選択ボタンを捕まえ、
      // そのボタンが所属しているフォーム（<form>）を自動的に見つけ出します。


    if (!form) {// もしフォームの中にいなければ、何もせず終了します
      return;
    }

    const handleReset =
      () => {
        setSelectedFiles([]);//フォームがリセットされたら、画面更新を使ってファイル置き場を空にする
      };

    form.addEventListener(//リセットされたら、「フォームがリセットされたら、画面更新を使ってファイル置き場を空にする」処理を実行する
      "reset",
      handleReset,
    );

    return () => {//画面が切り替わってファイル選択ボタンが消えたら、リセットイベントの監視をやめる
      form.removeEventListener(
        "reset",
        handleReset,
      );
    };
  }, []);

  return (
    <fieldset
      tabIndex={
        hasErrors
          ? -1
          : undefined
      }
      aria-invalid={
        hasErrors
      }
      aria-describedby={
        describedBy
      }
      className="rounded-lg border border-neutral-200 p-4"
    >
      <legend className="px-1 text-sm font-bold text-neutral-900">
        PDF添付
      </legend>

      {existingAttachments.length >
      0 ? (
        <ul className="mt-3 space-y-2">
          {existingAttachments.map(
            (attachment) => (
              <li
                key={
                  attachment.id
                }
                className="rounded-md border border-neutral-200 p-3"
              >
                <a
                  href={`/club/${encodedClubSlug}/admin/attachments/${contentType}/${encodeURIComponent(
                    attachment.id,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wrap-break-word text-sm font-medium text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  {
                    attachment.fileName
                  }
                </a>

                <p className="mt-1 text-xs text-neutral-500">
                  {formatFileSize(
                    attachment.sizeBytes,
                  )}
                </p>

                <label className="mt-2 flex items-center gap-2 text-sm text-red-700">
                  <input
                    type="checkbox"
                    name="deleteAttachmentIds"
                    value={
                      attachment.id
                    }
                    disabled={
                      disabled
                    }
                    onChange={
                      onChange
                    }
                  />

                  このPDFを削除する
                </label>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-neutral-600">
          現在、添付PDFはありません。
        </p>
      )}

      <div className="mt-4">
        {/*
    実際に画面で選択されているPDF数を送信する。

    ブラウザが未選択欄を0バイトFileとして送信しても、
    この値が0ならServer Action側で新規PDFとして扱わない。
  */}

  <input
    type="hidden"
    name="attachmentFilesCount"
    value={
      selectedFiles.length
    }
  />
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          name="attachmentFiles"
          accept=".pdf,application/pdf"
          multiple
          disabled={disabled}
          aria-describedby={
            describedBy
          }
          onChange={
            handleFileSelection
          }
          className="peer sr-only"
        />

        <label
          htmlFor={inputId}
          aria-disabled={
            disabled
          }
          className={
            disabled
              ? "inline-flex cursor-not-allowed items-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white opacity-50"
              : "inline-flex cursor-pointer items-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] active:bg-blue-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600"
          }
        >
          {selectedFiles.length > 0
            ? "PDFをさらに追加"
            : "新しいPDFを追加"}
        </label>
      </div>

      {/* 新規選択したPDFを表示する */}
      {selectedFiles.length > 0 ? (
        <div
          id={selectedFilesId}
          className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3"
        >
          <p
            aria-live="polite"
            className="text-sm font-bold text-blue-900"
          >
            新しく追加するPDF：
            {selectedFiles.length}
            件
          </p>

          <ul className="mt-2 space-y-2">
            {selectedFiles.map(
              (
                file,
                index,
              ) => (
                <li
                  key={`${buildFileIdentity(
                    file,
                  )}-${index}`}
                  className="flex flex-col gap-2 rounded-md bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="wrap-break-word text-sm font-medium text-neutral-900">
                      {file.name}
                    </p>

                    <p className="mt-1 text-xs text-neutral-500">
                      {formatFileSize(
                        file.size,
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={
                      disabled
                    }
                    onClick={() => {
                      removeSelectedFile(
                        index,
                      );
                    }}
                    className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 active:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    選択から外す
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}

      <p
        id={helpId}
        className="mt-2 text-xs leading-5 text-neutral-500"
      >
        PDFのみ、最大3ファイル、合計3MBまで添付できます。
        一度に複数選択することも、後から追加選択することもできます。
        保存エラー時はファイルを再選択してください。
      </p>

      <FieldErrorList
        id={errorId}
        errors={errors}
      />
    </fieldset>
  );
}