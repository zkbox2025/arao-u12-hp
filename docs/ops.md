satori 運用メモ
・DBテーブルのマイグレーションのやり方
⭐️ローカル環境へのマイグレーション
（更新したschema.prismaをローカルDB（DockerのPostgres）上に書き換えをお願いするとき）（npx dotenv-cli -e .env.local -- npx prisma migrate dev --name ・・・）
⭐️本番環境へのマイグレーション
（npx dotenv-cli -e .env.prod -- npx prisma migrate deploy）を行うことで、ローカルでmigrationsを本番DBへmigrateを実行できる。

・SupabaseのローカルページのURL
http://127.0.0.1:54323 
・クラブHP作成のSQLについて
Prismaには管理者権限を持たせて（SQLの影響は受けない設定にして）、SQLを匿名ユーザーがPrisma以外（インサート以外）の行動をとった場合は、実行不可能とするという設定をする（データベースに直接不正な命令を送り込んできた場合の最後の砦とする）。
本番環境で作業する時に本番のSupabaseダッシュボードで、個人情報を扱うテーブル（Contact や SessionApplication）の 「RLSを有効（Enable RLS）」 に切り替える（SQLに何も書かないことで全てをシャットアウトする）。
・MVPv1から管理画面への設定の流れについて
PageContentとfaqはMVPv1の段階では固定（仮）で作っといて、MVPv2で管理画面を作成と同時に該当部分を差し替えにする

・スパム対策テーブルの意味
model FormSubmissionLog {
  id          String   @id @default(uuid())
  createdAt   DateTime @default(now())

  formType    FormType
  ipHash      String? //誰が（どのネット環境から）フォームを送信したかを識別する（IPアドレス（ネット上の住所）の特定。個人情報なのでHash（復元できない文字列）を使う）
  emailHash   String? //入力されたメールアドレスを暗号化して特定する
  userAgent   String? //送信に使われたブラウザや端末情報を特定する
  result      SubmissionResult
  reason      String? //ブロック理由：短時間での連続送信のため（Rate Limit Exceeded）など
}

enum FormType {
  CONTACT
  SESSION_APPLICATION
}

enum SubmissionResult {
  ALLOWED
  BLOCKED
}

◯管理者ページのログインアカウントの作成方法
Supabase Dashboard
→ Authentication
→ Users
→ Add user
→ コーチ/開発者のメールアドレスを登録


◯スマホでチェックするときのターミナルで起動方法
npx next dev --hostname 192.168.210.198 --port 3000
※数値の確認方法：ipconfig getifaddr en0
URL＝http://192.168.210.198:3000


【Ngrokの場合の立ち上げる時のコマンド】

1. 本番ビルドする
   `npm run build`

2. 本番モードで起動する
   `npx next start -H 0.0.0.0 -p 3000`

3. 別ターミナルでngrokを起動する
   `ngrok http 3000 --host-header=localhost:3000`

4. 発行されたngrok URLで通常ページを確認する

URLは以下の通り
https://talia-noncrinoid-fructuously.ngrok-free.dev


◯liffの検証をする際は、本番用：https://arao-u12-hp.vercel.appで検証すること（起動の必要なし）。理由としては、ngrok（開発用を本番環境で試すためのURL）だと警告ページが表示されるのでリダイレクトがうまくいかないため

◯内部ページ遷移は基本 #top なし
ページ内アンカーだけ #top あり

◯アクションとトライキャッチのルール
・管理者がフォームから更新するAction → try/catchする
・削除Action → try/catchする
・redirect() は try/catch の外に置く
・revalidatePath() も基本はDB成功後に実行する
・ユーザーには共通メッセージ、console.errorには詳細情報

【開発中の画像表示について】
スマホから見るとページ本体はPCにアクセスできているけど、画像だけはスマホ自身の 127.0.0.1 に取りに行ってしまう。スマホ上にはsupabaseが動いていないためスマホでは画像が表示されません。そのためPC自身である192.168.210.198:54321に変更することでスマホでもPCでも（PCではsupabaseが動いているから見れる）画像確認できるようになる。
よって画像をスマホで見る際は
1. ページコンテントのアクション関数に以下を入れる

function normalizeLocalSupabasePublicUrl(publicUrl: string) {
  return publicUrl
    .replace("http://127.0.0.1:54321", "http://192.168.210.198:54321")
    .replace("http://localhost:54321", "http://192.168.210.198:54321");
}
return {
  imageUrl: normalizeLocalSupabasePublicUrl(data.publicUrl),
  imagePath: filePath,
};
を入れる

2. lib/storage/page-content-image-storage.tsに以下を入れる
function normalizeLocalSupabasePublicUrl(publicUrl: string) {
  return publicUrl
    .replace("http://127.0.0.1:54321", "http://192.168.210.188:54321")
    .replace("http://localhost:54321", "http://192.168.210.188:54321");
}
return {
    imageUrl: normalizeLocalSupabasePublicUrl(data.publicUrl),
    imagePath: filePath,
  };
  を入れる

3. next.config.tsに以下を入れる
{
  protocol: "http",
  hostname: "192.168.210.198",
  port: "54321",
  pathname: "/storage/v1/object/public/**",
}

4. 公開ページ側(exploreのページ)の以下を書き加える    

 const allowedHosts = [
      "uibiezgxpdfciznhbsxr.supabase.co",
      "127.0.0.1",
      "localhost",
      "192.168.210.198",
    ];

    if (!allowedHosts.includes(url.hostname)) {
      return "";
    }



※なお、本番環境では画像の保存住所が 自分のPCの中ではなく、Supabaseのクラウド上 になる。そのため、PCでもスマホでも読める。
※198の数字の確認方法：ipconfig getifaddr en0
たまに変わる

【リリース前の変更点について】
1. normalizeLocalSupabasePublicUrl()をページコンテントのアクション関数及びlib/storage/page-content-image-storage.ts から削除

削除する関数：

function normalizeLocalSupabasePublicUrl(publicUrl: string) {
  return publicUrl
    .replace("http://127.0.0.1:54321", "http://192.168.210.198:54321")
    .replace("http://localhost:54321", "http://192.168.210.198:54321");
}
2. return を元に戻す（ページコンテントのアクション関数及びlib/storage/page-content-image-storage.ts ）

開発中（スマホ確認中）：

return {
  imageUrl: normalizeLocalSupabasePublicUrl(data.publicUrl),
  imagePath: filePath,
};

これを以下のようにリリース前に戻す：

return {
  imageUrl: data.publicUrl,
  imagePath: filePath,
};

3. next.config.ts のLAN IP設定を削除

削除する設定：

{
  protocol: "http",
  hostname: "192.168.210.198",
  port: "54321",
  pathname: "/storage/v1/object/public/**",
}

{
  protocol: "http",
  hostname: "127.0.0.1",
  port: "54321",
  pathname: "/storage/v1/object/public/**",
},

4.公開ページ側(exploreのページ)の以下を変更する    

function validateImageUrl(value?: string | null) {
  const imageUrl = value?.trim();

  if (!imageUrl) return "";

  if (imageUrl.startsWith("/")) {
    return imageUrl;
  }

  try {
    const url = new URL(imageUrl);

    const allowedHosts = [
      "uibiezgxpdfciznhbsxr.supabase.co",
      "127.0.0.1",
      "localhost",
      "192.168.210.188",
    ];

    if (!allowedHosts.includes(url.hostname)) {
      return "";
    }

    return imageUrl;
  } catch {
    return "";
  }
}

を

// 画像URLの許可ルール関数
function validateImageUrl(value?: string | null) {
  const imageUrl = value?.trim();

  if (!imageUrl) return "";

  if (imageUrl.startsWith("/")) {
    return imageUrl;
  }

  const allowedSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!allowedSupabaseUrl) {
    return "";
  }

  try {
    const url = new URL(imageUrl);
    const allowedUrl = new URL(allowedSupabaseUrl);

    if (url.hostname !== allowedUrl.hostname) {
      return "";
    }

    return imageUrl;
  } catch {
    return "";
  }
}

にする。

以上。

◯（スマホ実機版、ローカル画像URL）http://127.0.0.1:54321/storage/v1/object/public/...
※PCブラウザのみ閲覧可能
◯（PC実機版、ローカル画像URL）http://192.168.210.198:54321/storage/v1/object/public/...
※スマホからでもPCからでも（PCではsupabaseが動いているため）確認可能

◯supabaseの本番のSQLについて：ローカルからマイグレーション済みなのでSQlエディタに載っていないけど反映はされてるので大丈夫

◯本番用のFAQや文章画像を納品者に添削してもらい、全てで揃ったら、シードしてDBに直接保存する