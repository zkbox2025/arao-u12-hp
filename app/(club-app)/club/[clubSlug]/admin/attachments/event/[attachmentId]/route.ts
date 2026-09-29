// app/(club-app)/club/[clubSlug]/admin/attachments/event/[attachmentId]/route.ts
//管理者用イベントのPDFファイルを、権限のあるメンバーだけが安全にダウンロード（表示）できるようにするための仕組み


import {
  NextResponse,
} from "next/server";

import {
  requireClubAppAdminAccess,
} from "@/app/(club-app)/club/club-app-authorization";

import {
  findClubEventAttachmentForAdmin,// 管理者用イベントのPDFのDB用ストレージパス（ファイルの保存住所）を１つ取得する関数
} from "@/src/infrastructure/prisma/repositories/club-event-repository";

import {
  createClubAttachmentSignedUrl,//「Public: OFF（非公開）」のバケットから、安全にPDFをダウンロード・閲覧するための
// 「期間限定の秘密のURL」を発行する関数(ファイル（PDF）のURLをそのままブラウザに入力しても、Supabaseに拒否されてダウンロードすることができないから、
//5分間だけ有効な、パスワード付きの特殊なURLを発行する）
} from "@/src/infrastructure/storage/club-content-attachment-storage";

type RouteProps = {
  params: Promise<{
    clubSlug: string;
    attachmentId: string;
  }>;
};

//PDFを安全にダウンロードするためにPDFファイルを開いた瞬間にパスワード付きの特殊なURL（５分有効）にリダイレクトする関数
export async function GET(
  _request: Request,
  { params }: RouteProps,
) {
  const {
    clubSlug,
    attachmentId,
  } = await params;

  const access =
    await requireClubAppAdminAccess(
      clubSlug,
    );

  const attachment =
    await findClubEventAttachmentForAdmin({// 管理者用イベントのPDFのDB用ストレージパス（ファイルの保存住所）を１つ取得する関数
      clubId: access.club.id,
      attachmentId,
    });

  if (!attachment) {
    return new NextResponse(
      "Not Found",
      { status: 404 },
    );
  }

  const signedUrl =
    await createClubAttachmentSignedUrl(//「Public: OFF（非公開）」のバケットから、安全にPDFをダウンロード・閲覧するための
// 「期間限定の秘密のURL」を発行する関数(ファイル（PDF）のURLをそのままブラウザに入力しても、Supabaseに拒否されてダウンロードすることができないから、
//5分間だけ有効な、パスワード付きの特殊なURLを発行する）
      attachment.storagePath,
    );

  return NextResponse.redirect(
    signedUrl,
  );
}