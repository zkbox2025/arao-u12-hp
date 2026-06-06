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


