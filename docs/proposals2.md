//docs/proposal2.md
//実装前に作成した設計書

参考資料
クラブ情報共有アプリ 設計書（一旦完成）

1. 開発目的
ARAO U-12 BASKETBALL CLUBでは、現在、練習予定、大会予定、練習時間の変更、集合時間、持ち物、大会資料などを主にLINEグループで共有している。
LINEは素早い連絡には適している一方、投稿が増えると重要な情報が過去の会話に埋もれ、保護者が必要な情報を後から探しにくいという課題がある。
総監督へのヒアリングの結果、現時点では出欠回答、送迎調整、コメント、提出物管理などをアプリへ移行する必要性は低く、次の2点への要望が強いことが分かった。
* 最新の月間予定をカレンダー形式でいつでも確認できること
* 練習変更、大会、合宿などの重要なお知らせを整理して確認できること
そのため、初期開発では機能を広げすぎず、予定とお知らせの情報共有に特化したシンプルなアプリを開発する。
将来的には、複数クラブへのヒアリングと利用実績をもとに、月謝決済やその他の運営機能を追加する。

2. 解決する課題
* LINEグループ内で重要なお知らせが他の会話に埋もれる
* 月間予定を確認するために過去のLINE投稿や画像を探す必要がある
* 練習時間、場所、集合時間などの変更情報を後から探しにくい
* 大会要項や合宿資料などのPDFをまとめて確認できる場所がない
* 管理者が同じ質問や予定確認に何度も対応する必要がある

3. アプリの役割
本アプリはLINEを完全に置き換えるものではない。

LINE
・緊急連絡
・欠席連絡
・保護者同士の相談
・送迎調整
・個別の質問

アプリ
・正式な月間予定の確認
・重要なお知らせの保管
・練習時間や場所の変更確認
・大会、遠征、合宿資料の確認




４. 構成と主要機能について
【構成】
フロントエンド：
Next.js / React / Tailwind CSS

認証：
Supabase Auth
初期段階では管理者ログイン、保護者ログインを必須とする
（管理者：ログイン必須
保護者：ログイン必須
公開HP：ログイン不要）

DB：
Supabase PostgreSQL

ストレージ：
Supabase Storage

通知：
既存のLINE公式アカウントおよびMessaging APIを利用

LIFF：
運営アプリ用LIFFアプリを設定

マルチテナント：
クラブに属するデータは、原則として直接 clubId を持ち、一つのDBで複数クラブを管理する
環境変数：システム全体の秘密鍵、暗号鍵、インフラ接続情報。
DB：クラブごとに違う設定や資格情報。ただし秘密情報は暗号化。

clubIdを持たせるべき

クラブに属する運営データ
イベント
お知らせ
添付PDF
既読
メモ
LINE通知先
LINE登録トークン
LINE送信履歴
招待
メール設定
LINE設定
サポート・不具合報告

clubIdを持たせなくていい

AppUser
Child



・各クラブが、それぞれ独自のLINE公式アカウントおよびMessaging APIチャネル（Channel Secret / チャネルアクセストークン）を所有・管理する。
各クラブ内においては、単一のMessaging APIチャネル・チャネルアクセストークンを使い回す。
これにより、同一クラブ内であれば「ホームページ（体験/見学申し込み・お問い合わせ通知）」と「運営アプリ（イベント通知、お知らせ通知）」の双方の通知を、そのクラブ専用の同じ公式アカウントから一元的に送信する。

・LIFF → HPとは別に運営アプリ用に別LIFFアプリを追加する。
HP管理用LIFF → 管理者ログイン、HP編集、問い合わせ確認 
運営アプリ用LIFF → 連絡、スケジュール、保護者/スタッフ向け操作
に分ける。
・既存のHPとDBを同じにして、同じクラブIDでHPと運営アプリをつなぐことから、同一のNext.jsプロジェクト内で、公開HP・HP管理画面・クラブ運営アプリをルートグループで分離して管理する。

※LINE公式アカウント・Messaging API方針（補足）

商品方針として、各クラブが自分のLINE公式アカウントおよびMessaging APIチャネルを持つ。

クラブごとに以下の値は異なる。

・Channel ID
・Channel Secret
・Channel Access Token
・Bot User ID
・Webhook URL

ARAO U-12では、既存HPで使用しているLINE公式アカウントおよびMessaging APIチャネルを、ARAO U-12のClubLineSettingとして登録して利用する。

商品化後、他クラブを追加する場合は、そのクラブ自身のLINE公式アカウントとMessaging APIチャネルをClubLineSettingへ登録する。
複数クラブで同じChannel SecretやAccess Tokenを共有しない。


【主要機能について】
MVPv1
保護者側
月間予定
* 月間カレンダー表示
* 練習、大会、遠征、合宿、休みなどの表示
* イベント詳細の確認（日時、場所、集合時間、持ち物、注意事項、本人専用メモ欄（本人しか見れない用）、関連PDFの添付）
お知らせ
* お知らせ一覧（タイトルと更新日をカード形式で表示）
* お知らせ詳細（練習時間・場所の変更、緊急連絡、大会・遠征・合宿の案内、PDF添付、重要なお知らせを表示）
マイページ
・アカウント設定（氏名、メールアドレス、所属する子どもの名前、学年）
・サポート・規約（利用規約・プライバシーポリシー、ヘルプ・不具合報告）
・関連リンク（公式HP、公式Instagram）
・イベント・お知らせ管理（管理者（コーチと役員）のみ表示。管理者用のイベント・お知らせページに遷移する）
・ログアウト
その他
* LINEからアプリを開ける
* スマートフォン表示に最適化する
管理者側
イベント管理
* イベントの作成、編集、削除、下書き・公開
* 日時、場所、集合時間、持ち物、注意事項の登録
* PDF添付
* 前月予定の複製
* 定期練習予定の一括作成
お知らせ管理
* お知らせの作成
* 編集
* 削除
* 下書き・公開
* PDF添付
* 重要表示
* 公開時のLINE通知連携

MVPv1.5
* カレンダーの見やすさ改善
* 管理画面のスマートフォン操作改善
* 定期イベントの複製
* 公開予約
* お知らせの固定表示
* PDF管理の改善
* 管理者向けプレビュー
* 利用状況の確認
* アプリ内未読バッジ表示 フッターの「イベント」「お知らせ」に、ログイン中の利用者がまだ確認していない公開情報の件数を表示する

MVPv2.0
* プッシュ通知および端末のアプリアイコンへの未読件数表示
* ホームページの練習スケジュール変更と、アプリのお知らせ（ジャンル：練習）を繋ぐ（アプリのお知らせをジャンル：練習で投稿したらホームページの練習スケジュール変更に同じ内容で投稿される。逆は要検討（どうすればいいか教えて欲しい）。）
* Googleカレンダーに追加ボタン
* ヘッダーにロゴをつけ、オーナーのみクラブ設定でロゴをアップロードできるようにする。

※将来実装を検討する機能
以下は初期開発には含めず、複数クラブへのヒアリングと有料需要を確認したうえで開発判断する。
優先検討
* 月謝の口座振替・カード決済
* 未読確認・既読率
* LINEリマインド通知
* 月間予定表のPDF・CSV出力
検証待ち
* イベントの参加・欠席回答
* 欠席理由
* 送迎可否
* コメント・質問機能
* 提出物締切管理
* 複数Child登録自体はMVP
* 兄弟別の出欠・請求・通知が将来
* コーチ出勤予定
* コーチ報酬計算
* 振込用CSV
* 報酬振込連携



※機能追加の判断基準
新機能は、次の条件を満たした場合に実装を検討する。
* 5〜10クラブ以上へヒアリングする
* 同じ課題が3クラブ以上から挙がる
* 定期的に発生する課題である
* 現在の作業時間や負担が明確である
* 既存のLINEや表計算だけでは解決しにくい
* 有料でも利用したいクラブが存在する
* 全顧客へ共通機能として提供できる
* 開発後の問い合わせ・保守負担が過大にならない


５. 主要データについて
既存のHPのDBに追加する形で作成する
【追加分】
// クラブごとのテーブル
model Club {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  name         String
  slug         String   @unique
  websiteUrl   String?
  instagramUrl String?
  domain       String?  @unique
  planType     PlanType @default(STARTER)
  appBaseUrl   String?

  timezone String @default("Asia/Tokyo") //基準とする時間（DBではUTCで保存する）イベントを日別で表示する際にどの日付で表示するかに使う

  memberships ClubMembership[]
  childMemberships ChildClubMembership[]
  events      ClubEvent[]
  notices     ClubNotice[]

  eventAttachments ClubEventAttachment[] 
  noticeAttachments  ClubNoticeAttachment[]

  eventMemos ClubEventMemo[] 
  eventReads ClubEventRead[] 
  noticeReads ClubNoticeRead[]

  invitations ClubInvitation[]

  lineSetting ClubLineSetting?
  lineTargets ClubLineTarget[] 
  lineRegistrationTokens ClubLineRegistrationToken[]
  lineDeliveries ClubLineDelivery[]  //ライン通知の送信記録テーブル
  emailSetting ClubEmailSetting?

  supportReports SupportReport[]

}

// 運営アプリのユーザー
model AppUser {
  id        String   @id
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  email String? @unique  //他の人と被らないただ一つのメアド（招待処理で検索するため）
  name  String?

  children    Child[]
  memberships ClubMembership[]
}

//子どものテーブル
model Child {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  parentId String
  parent   AppUser @relation(
    fields: [parentId],
    references: [id],
    onDelete: Cascade
  )

  name  String
  grade Grade?
  clubMemberships ChildClubMembership[]

  @@unique([id, parentId])
  @@index([parentId])
}

// 運営アプリのユーザー（親）のクラブ所属・役割
model ClubMembership {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clubId String
  userId String

  role   ClubMemberRole       @default(MEMBER)
  status ClubMembershipStatus @default(ACTIVE)

  parentedChildMemberships ChildClubMembership[]
    @relation("ChildClubMembershipParent")

  canManageWebsite Boolean @default(false)  //HPに入れるかの判定

  club Club    @relation(fields: [clubId], references: [id], onDelete: Cascade)
  user AppUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  eventMemos ClubEventMemo[]
  eventReads ClubEventRead[] 
  noticeReads ClubNoticeRead[]

  createdEvents ClubEvent[] @relation("ClubEventCreatedBy")
  updatedEvents ClubEvent[] @relation("ClubEventUpdatedBy")

  createdNotices ClubNotice[] @relation("ClubNoticeCreatedBy")
  updatedNotices ClubNotice[] @relation("ClubNoticeUpdatedBy")

  supportReports SupportReport[] @relation("SupportReportReporter")

  lineRegistrationTokens ClubLineRegistrationToken[]

  sentInvitations ClubInvitation[] @relation("ClubInvitationInviter")//過去に送ったメンバー加入への招待状データ

  invitation ClubInvitation? @relation("ClubInvitationMembership")//承諾した招メンバー加入招待状のデータ

  requestedLineDeliveries ClubLineDelivery[] @relation("ClubLineDeliveryRequester")

@@unique([id, clubId])
@@unique([clubId, userId]) 
@@index([userId, status]) 
@@index([clubId, role]) 
@@index([clubId, status]) 
@@index([clubId, status, canManageWebsite])
@@index([clubId, role, status])
}



//子どものクラブ所属・役割を管理するテーブル（複数クラブに所属してもいいようにする）
model ChildClubMembership {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clubId  String
  childId String

  parentUserId String

  status ClubMembershipStatus @default(ACTIVE)

  club  Club  @relation(fields: [clubId], references: [id], onDelete: Cascade)
  child Child @relation(
    fields: [childId, parentUserId],
    references: [id, parentId],
    onDelete: Cascade,
    onUpdate: Cascade
  )

  parentMembership ClubMembership @relation(
    "ChildClubMembershipParent",
    fields: [clubId, parentUserId],
    references: [clubId, userId],
    onDelete: Cascade,
    onUpdate: Cascade
  )

  @@unique([clubId, childId])
  @@index([childId, status])
  @@index([clubId, status])
  @@index([parentUserId])
}

// クラブ会員へのメール招待状のテーブル
model ClubInvitation {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clubId String
  club   Club @relation(fields: [clubId], references: [id], onDelete: Cascade)

  email String
  name  String?

  role ClubMemberRole

   status ClubInvitationStatus @default(PREPARING)

  tokenHash  String    @unique
  expiresAt  DateTime //有効期限
  acceptedAt DateTime? //承諾した日時

membershipId String? @unique 
membership ClubMembership?@relation( "ClubInvitationMembership", fields: [membershipId], references: [id], onDelete: SetNull )

authUserId   String?

  invitedByMembershipId String //誰から招待状が送られたかのID
  invitedByMembership   ClubMembership @relation(
    "ClubInvitationInviter",
    fields: [invitedByMembershipId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )

  emailSentAt DateTime?   //メール送信日時
  emailSendError String? @db.Text  //メール送信エラーについて

  attemptCount  Int       @default(0)
  lastAttemptAt DateTime?

  @@index([clubId, email])
  @@index([expiresAt])
  @@index([acceptedAt])
}


// クラブイベント
model ClubEvent {
  id            String            @id @default(uuid())
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  status        ContentStatus     @default(DRAFT)

  title         String
  content       String?            @db.Text
 
  targetRoles   ClubMemberRole[]  // 会員画面での公開対象。OWNERは常に含める

  startAt DateTime 
  endAt DateTime?
  isAllDay Boolean @default(false) // 終日イベントかどうか

  location      String?
  meetingAt DateTime? // 集合日時
  meetingLocation String? // 集合場所

  belongings    String?           @db.Text // 持ち物
  notes         String?           @db.Text // 注意事項
  
  clubId        String
  club          Club    @relation(fields: [clubId], references: [id], onDelete: Cascade)

  createdByMembershipId String?
  createdByMembership   ClubMembership? @relation(
  "ClubEventCreatedBy",
  fields: [createdByMembershipId],
  references: [id],
  onDelete: SetNull
)

  updatedByMembershipId String?
  updatedByMembership   ClubMembership? @relation(
  "ClubEventUpdatedBy",
  fields: [updatedByMembershipId],
  references: [id],
  onDelete: SetNull
)


  personalMemos ClubEventMemo[]   // メモ
  reads ClubEventRead[] //既読機能
  attachments ClubEventAttachment[]  //添付したPDFのテーブル

  lineDeliveries ClubLineDelivery[]  //ライン通知の記録テーブル

  genre ClubEventGenre @default(PRACTICE)

  firstPublishedAt DateTime? // 初めて公開した日時
  readRequiredAt DateTime? //未読・再確認表示の基準日時

@@unique([id, clubId])
@@index([clubId, status, startAt])
@@index([clubId, status, endAt])
}

// イベントに対する「自分専用メモ」
model ClubEventMemo {
  id           String         @id @default(uuid())
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  content      String         @db.Text   // メモの内容

  clubId String 
  club Club @relation(fields: [clubId], references: [id], onDelete: Cascade)
  
  eventId      String
  event ClubEvent @relation(
    fields: [eventId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )
  
  membershipId String         // 「誰（どの所属メンバー）が書いたメモか」
  membership ClubMembership @relation(
    fields: [membershipId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )
  
@@unique([clubId, eventId, membershipId]) 
@@index([clubId, eventId]) 
@@index([clubId, membershipId])
}

// クラブお知らせ
model ClubNotice {
  id          String           @id @default(uuid())
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  status      ContentStatus    @default(DRAFT)

  title       String
  content     String           @db.Text
  targetRoles ClubMemberRole[] // // 会員画面での公開対象。OWNERは常に含める

  isPinned Boolean @default(false)//重要表示
  genre ClubNoticeGenre @default(GENERAL)


createdByMembershipId String? 
createdByMembership ClubMembership? @relation( 
"ClubNoticeCreatedBy", 
fields: [createdByMembershipId], 
references: [id], onDelete: SetNull ) 

updatedByMembershipId String? 
updatedByMembership ClubMembership? @relation(
 "ClubNoticeUpdatedBy",
 fields: [updatedByMembershipId], 
references: [id], onDelete: SetNull )


  reads ClubNoticeRead[]  //既読機能
  attachments ClubNoticeAttachment[]

  lineDeliveries ClubLineDelivery[]

  firstPublishedAt DateTime? // 初めて公開した日時
  readRequiredAt DateTime? // 未読・再確認表示の基準日時

  clubId      String
  club        Club             @relation(fields: [clubId], references: [id], onDelete: Cascade)

@@unique([id, clubId])
@@index([clubId, status, createdAt])
@@index([clubId, status, isPinned, updatedAt])
}


//イベントに添付されたPDFのテーブル
model ClubEventAttachment {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  clubId String
  club   Club @relation(fields: [clubId], references: [id], onDelete: Cascade)

  eventId String
  event ClubEvent @relation(
    fields: [eventId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )

  storagePath String @unique
  fileName    String
  mimeType    String
  sizeBytes   Int

  displayOrder Int @default(0)  //並び順

@@index([clubId, eventId]) 
@@index([clubId, eventId, displayOrder]) 
@@index([eventId])
}


//お知らせに添付したPDFのテーブル
model ClubNoticeAttachment {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  clubId String
  club   Club @relation(fields: [clubId], references: [id], onDelete: Cascade)

  noticeId String
  notice ClubNotice @relation(
    fields: [noticeId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )

  storagePath String @unique
  fileName    String
  mimeType    String
  sizeBytes   Int

  displayOrder Int @default(0)  //並び順

@@index([clubId, noticeId]) 
@@index([clubId, noticeId, displayOrder]) 
@@index([noticeId])
}


//イベントの既読か未読かの記録テーブル
model ClubEventRead {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clubId String 
  club Club @relation(fields: [clubId], references: [id], onDelete: Cascade)

  eventId String
  event ClubEvent @relation(
    fields: [eventId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )

  membershipId String
  membership ClubMembership @relation(
    fields: [membershipId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )

  readAt DateTime @default(now())

  @@unique([clubId, eventId, membershipId]) 
  @@index([clubId, membershipId, readAt]) 
  @@index([clubId, eventId])
}

//お知らせの既読か未読かの記録テーブル
model ClubNoticeRead {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clubId String 
  club Club @relation(fields: [clubId], references: [id], onDelete: Cascade)

  noticeId String
  notice ClubNotice @relation(
    fields: [noticeId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )

  membershipId String
  membership ClubMembership @relation(
    fields: [membershipId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )

  readAt DateTime @default(now())

@@unique([clubId, noticeId, membershipId]) 
@@index([clubId, membershipId, readAt]) 
@@index([clubId, noticeId])
}

// クラブLINE通知・LIFF設定
model ClubLineSetting {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clubId String @unique
  club   Club   @relation(
    fields: [clubId],
    references: [id],
    onDelete: Cascade
  )

  lineChannelId String?  //LINE Developers上のチャネルID
  lineBotUserId String? //Webhook本文のdestinationとクラブ設定を照合するためのBotユーザーID
  lineChannelAccessTokenEncrypted String?  @db.Text   //LINEへ通知を送信する際に使う暗号化済みトークン
  lineChannelSecretEncrypted String?  @db.Text  //LINEから届いたWebhookの署名検証に使う暗号化済み秘密鍵

  webhookKey String @unique @default(uuid()) // Webhook URL用の公開識別子.秘密鍵ではないが、推測困難なランダム値として扱う

  targets ClubLineTarget[]
  registrationTokens ClubLineRegistrationToken[]

  adminLiffId  String? // HP管理者ページ用LIFF
  adminLiffUrl String?

  operationLiffId  String? // 運営アプリ用LIFF
  operationLiffUrl String?

@@unique([id, clubId])
}



// クラブごとのLINEグループ通知先
model ClubLineTarget {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clubId String 
  club Club @relation(fields: [clubId], references: [id], onDelete: Cascade)

  lineSettingId String
  lineSetting ClubLineSetting @relation(
  fields: [lineSettingId, clubId],
  references: [id, clubId],
  onDelete: Cascade
)

  targetName  String?
  lineGroupId String

  targetRoles ClubMemberRole[]  // このグループへ通知する対象

  isEnabled Boolean @default(false)

  deliveries ClubLineDelivery[]  //通知先ごとの送信履歴を辿れるように


@@unique([id, clubId])
@@unique([lineSettingId, lineGroupId]) 
@@index([clubId, isEnabled]) 
@@index([clubId]) 
@@index([lineSettingId, isEnabled])
}

//通知ライングループ登録用テーブル
model ClubLineRegistrationToken {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  clubId String 
  club Club @relation(fields: [clubId], references: [id], onDelete: Cascade)

  lineSettingId String
  lineSetting ClubLineSetting @relation(
    fields: [lineSettingId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )

  tokenHash String @unique
  expiresAt DateTime
  usedAt    DateTime?

  createdByMembershipId String
  createdByMembership ClubMembership @relation(
    fields: [createdByMembershipId, clubId],
    references: [id, clubId],
    onDelete: Cascade
  )

@@index([clubId, expiresAt]) 
@@index([clubId, usedAt]) 
@@index([lineSettingId, expiresAt])
}

//メール通知機能テーブル
model ClubEmailSetting {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clubId String @unique
  club   Club @relation(
    fields: [clubId],
    references: [id],
    onDelete: Cascade
  )

  // HPの問い合わせ・体験見学、お知らせ通知、イベント通知を送るクラブ側通知先
  notificationEmail String?

  // メール表示名。nullならClub.nameを使用
  fromName String?

  // 返信先（問い合わせに対して返信する時にfromに自動で入るメアド）
  replyToEmail String?

  isEnabled Boolean @default(true)
}

//ヘルプ・不具合報告の記録テーブル
model SupportReport {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clubId String
  club   Club @relation(fields: [clubId], references: [id], onDelete: Cascade)

  membershipId String?
  membership   ClubMembership? @relation(
    "SupportReportReporter",
    fields: [membershipId],
    references: [id],
    onDelete: SetNull
  )

  category SupportReportCategory @default(BUG)
  status   SupportReportStatus   @default(OPEN)

  message String @db.Text

  pageUrl   String? @db.Text
  userAgent String? @db.Text

  reporterName  String?
  reporterEmail String?
  reporterRole  ClubMemberRole?

  handledByPlatformAdminId String?

  handledByPlatformAdmin PlatformAdmin? @relation(
  "SupportReportHandler",
  fields: [handledByPlatformAdminId],
  references: [id],
  onDelete: SetNull
)

statusChangedAt DateTime?

  resolvedAt DateTime?

  internalNote String? @db.Text

  notifiedAt  DateTime?
  notifyError String? @db.Text

  @@index([clubId, status, createdAt])
  @@index([clubId, membershipId, createdAt])
  @@index([status, createdAt])
}

//ライン通知の送信記録テーブル
model ClubLineDelivery {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clubId String
  club   Club @relation(
    fields: [clubId],
    references: [id],
    onDelete: Cascade
  )

  targetId String
  target ClubLineTarget @relation(
  fields: [targetId, clubId],
  references: [id, clubId],
  onDelete: Restrict
)

  // 元となったイベント。
  // イベント削除後も送信履歴を残すためSetNull。
  eventId String?
  event   ClubEvent? @relation(
    fields: [eventId],
    references: [id],
    onDelete: SetNull
  )

  // 元となったお知らせ。
  // お知らせ削除後も送信履歴を残すためSetNull。
  noticeId String?
  notice   ClubNotice? @relation(
    fields: [noticeId],
    references: [id],
    onDelete: SetNull
  )

  // 送信時点の内容を履歴として保存する
  contentType     LineDeliveryContentType
  contentTitle    String
  messageSnapshot String? @db.Text
  targetNameSnapshot String?

  requestedByMembershipId String?
  requestedByMembership ClubMembership? @relation(
    "ClubLineDeliveryRequester",
    fields: [requestedByMembershipId],
    references: [id],
    onDelete: SetNull
  )

  status LineDeliveryStatus @default(PENDING)

  requestedAt DateTime @default(now())
  sentAt      DateTime?

  errorCode   String?
  errorDetail String? @db.Text

  idempotencyKey String @unique
  requestId      String

  claimedAt     DateTime?
  claimToken    String?     @unique
  leaseExpiresAt DateTime?

  attemptCount  Int       @default(0)
  lastAttemptAt DateTime?
  nextAttemptAt DateTime?


  @@index([clubId, requestedAt])
  @@index([clubId, requestId])
  @@index([clubId, targetId, status])
  @@index([clubId, eventId, status])
  @@index([clubId, noticeId, status])
  @@index([status, nextAttemptAt]) 
  @@index([clubId, status, nextAttemptAt])
}


// クラブ情報共有アプリ全体を管理する運営者
model PlatformAdmin {
  // Supabase Auth user.id と同じUUIDを使用する
  id        String   @id
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  email String @unique
  name  String?

  role     PlatformAdminRole @default(DEVELOPER)
  isActive Boolean           @default(true)

  handledSupportReports SupportReport[]
    @relation("SupportReportHandler")

  @@index([role, isActive])
}

enum ClubMemberRole {
  OWNER // クラブ代表者・最高管理者
  COACH   // コーチ（指導者）
  OFFICER // 役員（保護者会長や会計など）
  MEMBER  // 会員（保護者・選手）
}

enum ClubMembershipStatus {
  INVITED  // 招待中
  ACTIVE   // 在籍中
  SUSPENDED // 休部中
  WITHDRAWN // 退会済み
}

enum PlanType {
  STARTER
  STANDARD
  PRO
}

enum ClubEventGenre {
  PRACTICE
  PRACTICE_GAME
  TOURNAMENT
  CAMP
  HOLIDAY
  OTHER
}

enum ClubNoticeGenre {
  IMPORTANT //緊急連絡・重要
  SCHEDULE  //スケジュール変更
  EVENT  //大会・試合・合宿について
  ACCOUNTING //会計・手続き
  GENERAL //その他
}


enum LineDeliveryStatus {  //ライン通知の記録テーブルに使用する
  PENDING
  SENT
  FAILED
}


enum SupportReportCategory { //ヘルプ・不具合報告のカテゴリー
  BUG  //バグ
  QUESTION  //質問
  REQUEST  //要望
  OTHER  //その他
}

enum SupportReportStatus {  //サポート不具合送信一覧のステータス
  OPEN        // 未対応
  IN_PROGRESS // 対応中
  ON_HOLD     // 保留
  RESOLVED    // 対応済み
}

enum PlatformAdminRole {
  DEVELOPER // 開発者・サービス運営者
  SUPPORT   // 将来サポート担当者を追加する場合
}

enum LineDeliveryContentType {
  EVENT
  NOTICE
}

enum ClubInvitationStatus {
  PREPARING
  READY_TO_SEND
  SENT
  EMAIL_FAILED
  ACCEPTED
  CANCELLED
  EXPIRED
}

【既存のHPのすでにあるDB】
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

//体験/見学申し込み
model SessionApplication {
  id             String            @id @default(uuid())
  createdAt      DateTime          @default(now())
  type           Type // 参加内容（必須）
  childName      String // 子供の名前（必須）
  childNameKana  String // 子供の名前カナ（必須）
  childGrade     Grade // 学年（必須 / 幼児、小1〜小6）
  experience     ExperienceYears // 経験年数（必須）
  preferredDate1 DateTime          @db.Date // 第一希望日 (必須)
  preferredDate2 DateTime?         @db.Date // 第二希望日（任意）
  email          String // メールアドレス（必須）
  phone          String? // 電話番号（任意）
  status         ApplicationStatus @default(PENDING) // 初期値は参加待ち
  adminMemo      String? // 管理者メモ
  updatedAt      DateTime          @updatedAt // ステータス変更・メモ編集日時
}

//問い合わせ
model Contact {
  id            String        @id @default(uuid())
  createdAt     DateTime      @default(now())
  name          String // 名前（必須）
  nameKana      String // 名前カナ（必須）
  email         String // メールアドレス（必須）
  phone         String? // 電話番号（任意）
  content       String // 問い合わせ内容
  status        ContactStatus @default(PENDING) // 初期値は未回答
  adminMemo     String? // 管理者メモ
  updatedAt     DateTime      @updatedAt // ステータス変更・メモ編集日時
}

//文章ブロック管理画面用
model PageContent {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  pageKey   String // どのページか（例: "TOP", "ABOUT", "POLICY", "FLOW"）
  blockKey  String // どのパーツ（場所）か（例: "CLUB_NAME"）
  content   String   @db.Text // 編集する文章そのもの（テキストのみ）
  imageUrl  String? // 画像URL
  imagePath String? //DBストレージの画像削除用
  imageAlt  String?

  @@unique([pageKey, blockKey]) // 1ページ内に、同じブロックが重複しないように
}

//練習場所・時間変更画面用（お知らせ）
model Notice {
  id        String        @id @default(uuid())
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  title     String
  content   String        @db.Text
  status    ContentStatus @default(DRAFT)
  eventDate DateTime?     @db.Date // MVPv1.5にてカレンダー入力仕様。それまでは手入力
}

//よくある質問用
model Faq {
  id        String        @id @default(uuid())
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  category  FaqCategory   @default(TARGET)
  question  String        @db.Text
  answer    String        @db.Text
  status    ContentStatus @default(DRAFT)
  sortOrder Int           @default(0) // 自動で番号をふって並び替えできるようにする
}

//フォーム送信用スパム対策
model FormSubmissionLog {
  id          String   @id @default(uuid())
  createdAt   DateTime @default(now())

  formType    FormType
  ipHash      String?
  emailHash   String?
  contentHash String?
  userAgent   String?
  result      FormSubmissionResult
  reason      String?

  @@index([formType, ipHash, createdAt])
  @@index([formType, emailHash, createdAt])
  @@index([formType, emailHash, contentHash, createdAt])
}

//メール通知先設定
model FormNotificationSetting {
  formType  FormType @id
  emails    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

//管理者ページへのログイン申請のスパム対策
model LoginSubmissionLog {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())

  ipHash    String?
  emailHash String?
  userAgent String?
  result    LoginSubmissionResult
  reason    String?

  @@index([ipHash, createdAt])
  @@index([emailHash, createdAt])
  @@index([emailHash, result, createdAt])
}

//月別計画の画像保存テーブル
model MonthlyPracticePlan {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  title     String
  year      Int
  month     Int

  pdfUrl    String
  pdfPath   String

  status    ContentStatus @default(PUBLISHED)

  @@index([status, year, month])
}

//スタッフ紹介ページ（個別ページ）の人物情報
model Staff {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  role      String
  externalRole String?
  name      String
  profile   String
  license   String?
  achievement String?

  imageUrl  String?
  imagePath String?
  imageAlt  String?

  sortOrder Int @default(0)
  status    ContentStatus @default(PUBLISHED)
}

//トップページのスタッフ紹介セクションと個別ページの導入文
model StaffPageSetting {
  id        String   @id @default("staff-page-setting")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  topSummaryTitle String
  topSummaryBody  String

  leadBody String

  topImageUrl  String?
  topImagePath String?
  topImageAlt  String?
}

enum Type {
  OBSERVATION //見学
  TRIAL //体験
}

enum Grade {
  YOUJI // 幼児
  ELEMENTARY_1
  ELEMENTARY_2
  ELEMENTARY_3
  ELEMENTARY_4
  ELEMENTARY_5
  ELEMENTARY_6
}

enum ExperienceYears {
  NONE
  LESS_THAN_1YEAR
  YEARS_1_OR_MORE
}

enum ApplicationStatus {
  PENDING
  ATTENDED
  CANCELED
}

enum ContactStatus {
  PENDING
  REPLIED
}

enum ContentStatus {
  DRAFT
  PUBLISHED
}

enum FaqCategory {
  TARGET
  PRACTICE
  ACTIVITY
  PARENT
  FEE
  JOIN
}

enum FormType {
  CONTACT
  SESSION_APPLICATION
}

enum FormSubmissionResult {
  ALLOWED
  BLOCKED
}

enum LoginSubmissionResult {
  SUCCESS
  FAILED
  BLOCKED
}



※初期開発では新規の運営アプリ関連テーブルをclubId対応とする。
既存HPテーブルは商品化前のマルチテナント移行時にclubIdを追加し、
既存データをARAO U-12のClubレコードへ移行する。

※権限制御

OWNER・COACH・OFFICER
・イベントとお知らせの作成、編集、削除、公開・下書き管理が可能

MEMBER
・自身が公開対象となっている公開済みイベント・お知らせの閲覧のみ可能

※権限制御・RLS・Prismaの責任分担

運営アプリのデータ取得・更新・削除は、原則としてNext.jsサーバー側からPrismaで行う。
ブラウザからSupabase DBへ直接アクセスしない。

ブラウザ側で使用するSupabaseは、主にログイン・ログアウト・セッション取得などSupabase Auth用途に限定する。

そのため、認可の主軸はServer Component、Server Action、Route Handler側で行う。

画面：
権限のないボタンやリンクを表示しない。
ただし、画面表示制御だけを認可として信用しない。

Server Action / Server Component / Route Handler：
必ずログインユーザーの userId、clubId、membership status、role を確認する。
イベント・お知らせ・添付PDF・LINE設定・メンバー管理など、すべての操作で共通認可関数を通す。

DB / RLS：
RLSは最後の防御層として使う。
ただし、PrismaがどのDB接続権限で接続するかによってRLSが期待通り働かない場合があるため、RLSだけに依存しない。

基本方針：
Server Action側の認可チェックを主軸とし、RLSは補助的な防御層として扱う。

※役割
OWNER（クラブ代表者・最高管理者）
・LINE通知先設定
・会員管理
・月謝設定
・クラブ設定
・イベント／お知らせ管理

COACH（コーチ）
・イベント／お知らせ管理

OFFICER（保護者会長、会計など）
・イベント／お知らせ管理
・必要に応じて会員確認

MEMBER（会員）
・閲覧のみ

※LINEグループ通知とアプリ内未読表示は別機能として扱う。

・お知らせを新規公開した場合
  → LINE通知を送らなくても、対象利用者にはアプリ内で未読として表示する。

・イベントを新規公開した場合
  → 「利用者に確認してほしい予定として未読表示する」を選択した場合のみ、対象利用者にはアプリ内で未読として表示する。
  → 通常練習など、カレンダーに追加するだけの予定は未読表示なしで公開できる。

・LINE通知
  → 管理者が作成・編集時に「LINEグループへ通知する」を選択した場合のみ送信する。

・定期練習の一括登録や軽微な修正
  → LINE通知なし、未読表示なしで公開できる。


※公開日時・既読判定

下書きとして保存
  → readRequiredAtは変更しない

firstPublishedAt:
初めて公開した日時。
公開日表示に使う。

readRequiredAt:
利用者に未読・再確認として表示する基準日時。
null の場合、その情報は未読表示の対象にしない。

updatedAt:
最終更新日時。
軽微な修正でも自動更新される。

【イベント初回公開・未読表示OFF】
firstPublishedAt = 現在日時
readRequiredAt = null

【イベント初回公開・未読表示ON】
firstPublishedAt = 現在日時
readRequiredAt = 現在日時

【お知らせ初回公開】
firstPublishedAt = 現在日時
readRequiredAt = 現在日時

【軽微な修正】
firstPublishedAt = 変更なし
readRequiredAt = 変更なし
updatedAt = 自動更新

【再確認が必要な重要更新】
firstPublishedAt = 変更なし
readRequiredAt = 現在日時

【未読判定】
readRequiredAt が存在する
かつ
readレコードがない、または readAt < readRequiredAt


※イベントとお知らせの未読表示ルール

イベントとお知らせでは、新規公開時の未読表示ルールを分ける。

【イベント】
通常練習など、カレンダーに予定として追加するだけのイベントは、公開しても未読表示しないことができる。
大会、集合時間変更、持ち物確認など、利用者に確認してほしいイベントのみ未読表示する。

イベント新規作成画面には以下のチェック欄を表示する。

□ 利用者に確認してほしい予定として未読表示する

初期値はチェックなしとする。
チェックなしで公開した場合、カレンダーには表示するが未読バッジは付けない。
チェックありで公開した場合、対象利用者に未読として表示する。

【お知らせ】
お知らせは利用者へ確認してもらう情報として扱うため、新規公開時は必ず未読表示する。
お知らせ新規作成画面には「未読として表示する」チェック欄を表示しない。

【編集時】
イベント・お知らせの編集画面には以下のチェック欄を表示する。

□ この更新を利用者へ未読として再表示する

チェックありの場合のみ、readRequiredAtを現在日時に更新する。
チェックなしの場合は、readRequiredAtを変更しない。

※公開済みの情報を一度下書きへ戻した場合

firstPublishedAt は変更しない。
readRequiredAt は下書きへ戻しただけでは変更しない。

再公開時は以下の通りとする。

イベント：
「利用者に確認してほしい予定として未読表示する」または「この更新を利用者へ未読として再表示する」がONの場合のみ、readRequiredAtを現在日時に更新する。

お知らせ：
再公開時は利用者へ確認してもらう情報として扱い、readRequiredAtを現在日時に更新する。


※集合日時の保存ルール

meetingAt:
集合日 + 集合時間

集合時間が未入力：
meetingAt = null

集合時間あり、集合日なし：
開催日 + 集合時間

meetingLocation:
集合場所が入力されていれば保存
未入力なら null

※イベントの作成時編集時のバリデーション
タイトル必須
開始日必須
isAllDay = false の場合は開始時間必須
公開対象ロールは1つ以上必須
endAt がある場合は startAt より後
meetingAt がある場合は、基本的に startAt 以前（特殊なケースがありそうなので警告表示をする。）


※各ページのヘッダーは、各ページのメインタイトル及び選択した日付を基本的に画面中央に添える（詳細ページは例外的にタイトルを左寄せにする）。日別イベント詳細ページ、イベント詳細ページ、お知らせ詳細ページを表示した際はヘッダーの左端に戻るボタン（[←]）もしくは一番下に一覧へ戻るボタンを用意して押すと月別イベント一覧ページや月別お知らせ一覧ページに戻る仕様にする。また、（管理者）ライン通知グループ管理ページ（/(club-app)/club/[clubSlug]/admin/settings/line）のヘッダーの左端に戻るボタン（[←]）を用意して押すと（会員・管理者共通）マイページ （/(club-app)/club/[clubSlug]/account）へ遷移するようにする。ヘッダー自体はすべてのページに表示したい。
※フッターはセレクトタブにして「イベント」「お知らせ」「マイページ」が三つ横に並んでいる形にしたい。それぞれ丸で囲まれている形で、イベント・お知らせの新規作成／編集ページとログインページ以外の全てのページに表示する（ここ重要です）。
※ヘッダーとフッターにはそれぞれ上下を挟むように水平な直線（ボーダー線）を引く。

※更新日及び公開日は、全てに「今日・昨日は相対表記（〇時間前、昨日）、それ以前は日付（月/日）」というハイブリッド方式を採用する

※保存や削除が行われたら原則として全てに緑色の文字で『保存しました』「削除しました」と３秒だけ画面上部にトースト通知（ポップアップ）を出す

※以下にはモーダルで確認をつける
削除
LINE通知付き公開
公開から下書きへ戻す
ロール・ステータス変更
OWNER変更
未保存状態でページ離脱
ログアウト

また全てに「保存中…」「削除中…」などPendingをつける（削除はモーダルファイルに実装し、保存等は保存・変更・更新ボタン専用ファイルとして作成する）

※終日イベントの保存ルール
isAllDay = false の場合

startAt:
開催日 + 開始時間

endAt:
終了日 + 終了時間
終了日が未入力で終了時間だけ入力された場合は、開催日 + 終了時間

表示:
18:30〜20:30


isAllDay = true の場合

startAt:
開催日の 00:00

endAt:
基本は null

表示:
終日

MVPでは、終日イベントは単日扱い


※タイムゾーン設計

Clubには timezone を持たせる。

timezone:
クラブの現地タイムゾーン。
初期値は Asia/Tokyo とする。

DBに保存する DateTime はUTCに統一する。
画面入力ではクラブの timezone に基づいた現地日時として扱い、保存時にUTCへ変換する。
表示時はDBのUTC日時をクラブの timezone に変換して表示する。

例：
クラブ timezone = Asia/Tokyo
画面入力 = 2026年7月15日 18:30
DB保存 = 2026年7月15日 09:30 UTC
画面表示 = 2026年7月15日 18:30

※日時入力とUTC保存

イベント新規作成・編集画面で入力された日時は、クラブの timezone における現地日時として扱う。

保存時は以下のように変換する。

startAt:
開催日 + 開始時間を、club.timezone の日時として解釈し、UTCに変換して保存する。

endAt:
終了日 + 終了時間を、club.timezone の日時として解釈し、UTCに変換して保存する。
終了日が未入力で終了時間のみ入力された場合は、開催日と同じ日として扱う。

meetingAt:
集合日 + 集合時間を、club.timezone の日時として解釈し、UTCに変換して保存する。
集合日が未入力で集合時間のみ入力された場合は、開催日と同じ日として扱う。

表示時:
保存されたUTC日時を club.timezone に変換して表示する。

【終日イベント】

isAllDay = true の場合、開始時間・終了時間は入力不要とする。

startAt:
開催日の 00:00 を club.timezone の日時として解釈し、UTCに変換して保存する。

endAt:
MVPでは null とする。

表示:
会員画面では時刻ではなく「終日」と表示する。


※実装では、日時変換を各ページ・各Actionにバラ撒かないで、 専用ファイルを作ること。

lib/datetime/club-time.ts

※日時表示

DBに保存されている startAt、endAt、meetingAt、firstPublishedAt、readRequiredAtはUTCとして扱う。

表示時は club.timezone に変換する。

例：
club.timezone = Asia/Tokyo
startAt = 2026-07-15T09:30:00.000Z
表示 = 2026年7月15日 18:30


※日別・月別一覧の取得条件

画面上の日付範囲は club.timezone を基準に計算する。
ただし、Prismaで検索するときは、開始境界・終了境界をUTCへ変換してから検索する。

例：
club.timezone = Asia/Tokyo
date = 2026-07-15

dayStartLocal = 2026-07-15 00:00 Asia/Tokyo
dayEndLocal   = 2026-07-16 00:00 Asia/Tokyo

これらをUTCに変換して、

dayStartUtc
dayEndUtc

として検索条件に使う。


※Supabase Storage バケットは以下の通り作成済み
Supabase Dashboardで非公開バケットを作ります。

bucket name:
club-app-attachments

public:
false

このバケットには、イベントPDF・お知らせPDFをまとめて入れます。

club-app-attachments/
  clubs/
    {clubId}/
      events/
        {eventId}/
          {uuid}.pdf
      notice/
        {noticeId}/
          {uuid}.pdf

// ① イベントの添付ファイルの場合 const eventPath = `clubs/${clubId}/events/${eventId}/${uuid}.pdf`; // ② お知らせの添付ファイルの場合 const noticePath = `clubs/${clubId}/notice/${noticeId}/${uuid}.pdf`;


※PDF添付設計

イベント・お知らせのPDFは、ClubEvent / ClubNotice に直接 pdfUrl / pdfPath を持たせない。

代わりに以下の添付テーブルで管理する。

ClubEventAttachment
ClubNoticeAttachment

添付テーブルには以下を保存する。

storagePath:
Supabase Storage上の保存パス。
署名付きURLではなく、永続的なStorageパスを保存する。

fileName:
アップロード時の元ファイル名。
画面表示に使う。

mimeType:
MIMEタイプ。
PDFの場合は application/pdf。

sizeBytes:
ファイルサイズ。
画面で 1.8MB のように表示するために使う。

PDFファイルは Supabase Storage の非公開バケットへ保存する。
公開URLはDBに保存しない。

PDF閲覧時は、ログインユーザーのClubMembershipと公開対象ロールを確認したうえで、サーバー側で署名付きURLを発行する。
署名付きURLは短時間のみ有効とする。

DBレコードを削除してもStorage上のファイルは自動削除されない。
イベント・お知らせ削除時、またはPDF差し替え時は、

1. DBレコードを削除・更新する
2. Storageオブジェクトを削除する
3. Storage削除に失敗した場合はログに残し、後で手動またはバッチで再削除できるようにする

という順番で処理する。
 PDFファイルのルートについてのURLの構成
/club/[clubSlug]/attachments/event/[attachmentId]
/club/[clubSlug]/attachments/notice/[attachmentId]

役割は以下の通り
1. ログイン確認
2. clubSlugからClub取得
3. ClubMembership確認
4. event/noticeの公開状態とtargetRoles確認
5. storagePathから署名付きURLを発行（君は怪しい人じゃないと確認できたから、特別に5分間だけファイルを見られる『秘密の裏口キー付きURL』を発行してあげる）
6. signed URL（５で発行した秘密の裏口キー付きURL）へredirect


※ClubLineDelivery は eventId または noticeId のどちらか一方のみを持つ。
イベント通知の場合は eventId を保存し、noticeId は null とする。
お知らせ通知の場合は noticeId を保存し、eventId は null とする。
eventId と noticeId の両方が null、または両方に値が入る状態は許可しない。
これらをサーバーアクション側でバリデーションする。

【作成後】 関連するClubEvent / ClubNoticeが削除された場合は、 onDelete: SetNull により、 eventId / noticeIdがnullになることを許可する。 ただし、 contentType / contentTitle / messageSnapshot に送信時点の情報を保存しているため、 LINE送信履歴自体は保持する。

※LINE通知送信履歴

LINE通知は、イベント・お知らせ本体に1つの送信日時だけを保存しない。

理由：
複数のLINEグループへ通知する場合、通知先ごとに成功・失敗が分かれる可能性があるため。

例：
保護者グループ：成功
コーチグループ：失敗
役員グループ：成功

このような部分失敗を管理するため、通知先ごとの送信履歴を ClubLineDelivery に保存する。

【送信処理の流れ】

1. 管理者がイベントまたはお知らせを公開する
2. 「LINEグループへ通知する」がONの場合、選択された通知先を取得する
3. 通知先ごとに ClubLineDelivery を PENDING で作成する
4. LINE Messaging APIへ送信する
5. 送信成功した通知先は SENT に更新する
6. 送信失敗した通知先は FAILED に更新し、errorCode / errorDetail を保存する

【二重送信防止】

1回の送信操作ごとに requestId を発行する。
通知先ごとに idempotencyKey を作成する。

例：
event:{eventId}:request:{requestId}:target:{targetId}
notice:{noticeId}:request:{requestId}:target:{targetId}

idempotencyKey は unique とする。
同じ送信操作が二重実行されても、同じ通知先への送信履歴は1件だけ作成される。

【再送】

FAILED の通知履歴のみ再送可能とする。
SENT の通知履歴は再送しない。
再送時は新しい requestId を発行し、新しい ClubLineDelivery を作成する。


※LINE Webhook署名検証方針

ClubLineSettingには webhookKey を持たせる。

webhookKey:
Webhook URL用の公開識別子。
秘密鍵ではないが、推測困難なランダム値として生成する。
LINE DevelopersのWebhook URLに含める。

Webhook URL:

/api/line/webhook/[webhookKey]

処理順序:

1. URLのwebhookKeyを取得する
2. webhookKeyからClubLineSettingを取得する
3. lineChannelSecretEncryptedを復号する
4. 復号したChannel Secretで署名検証する
5. 署名検証に成功した場合のみJSON本文を解析する
6. destinationとlineBotUserIdを照合する
7. Webhookイベントを処理する

署名検証前の本文は信用しない。
そのため、署名検証前にbody.destinationを使ってクラブを判定しない。
body.destinationは署名検証後の整合性チェックにのみ使用する。

【注意！】ただし既存HP稼働中のため、現在の /api/line/webhook はすぐには変更しない。

運営アプリ実装時は、新しいWebhook URLとして
/api/line/webhook/[webhookKey]
を追加する。

既存の /api/line/webhook は、移行完了まで残す。
LINE Developers側のWebhook URL変更は、新Webhookの実装・本番デプロイ・検証が完了してから行う。

既存HP稼働中のWebhook移行方針

現在、既存HPと同じNext.jsプロジェクト内で /api/line/webhook が稼働している。
そのため、運営アプリ実装前の段階では、既存のWebhook URLを変更しない。

運営アプリでは、マルチテナント対応のため、将来的に以下のWebhook URLを追加する。

/api/line/webhook/[webhookKey]

既存の /api/line/webhook はすぐに削除せず、移行完了まで残す。

移行手順：

1. ClubLineSetting に webhookKey を追加する
2. 新しい /api/line/webhook/[webhookKey] route を追加する
3. 既存の /api/line/webhook は残す
4. 本番デプロイ後、LINE Developers側のWebhook URLを新URLへ変更する
5. LINE Developersの検証とAxiomログで正常動作を確認する
6. 問題があればLINE Developers側のWebhook URLを旧URLへ戻す
7. 新Webhookが安定してから旧Webhookの削除可否を判断する

Webhook URLの切り替えは、実装・本番デプロイ・動作確認の直前までは行わない。

※【RLSとPrismaの責任分担】
運営アプリのDBアクセスは、原則としてNext.jsサーバー側からPrismaで行う。

ブラウザからSupabase DBへ直接アクセスしない。
ブラウザで使うSupabaseは、主にAuthのログイン状態管理に限定する。

そのため、認可の主軸はServer Action / Server Component / Route Handler側の共通関数で行う。

RLSは防御層として使うが、RLSだけに依存しない。

つまり、

ブラウザ
↓
Next.js Server Action / Server Component
↓
requireActiveClubMembership()
requireClubRole()
requireClubOwner()
↓
Prisma
↓
DB

という形

※lib/club/access-control.tsを作成しrequireActiveClubMembership()、requireClubRole()、requireClubOwner()をまとめる。

※Prisma取得・更新時の必須ルール

ユーザー入力由来の id を使ってデータを取得する場合、必ず clubId とセットで検索する。

禁止例：

findUnique({
  where: {
    id: eventId
  }
})

上記のように id だけで取得してから、後で clubId を比較する実装は禁止する。

推奨例：

findFirst({
  where: {
    id: eventId,
    clubId: currentClub.id
  }
})

イベント詳細、イベント編集、お知らせ詳細、お知らせ編集、添付PDF、既読処理、メモ処理、LINE通知設定、メンバー管理など、すべて同じ方針とする。
【以下まとめる】
会員用ページ共通

権限制御：
ページ表示時に requireActiveClubMembership(clubSlug) を実行する。
取得条件には必ず clubId、status = PUBLISHED、targetRoles has currentMembership.role を含める。OWNERも例外扱いしない。
OWNERはtargetRolesに常に含まれるため、通常の targetRoles 判定で表示される。
権限外データは notFound とする。

対象ページ：

７-1 会員用月別イベント一覧
７-2 会員用日別イベント一覧
７-3 会員用イベント詳細
７-8 会員用お知らせ一覧
７-9 会員用お知らせ詳細

管理者用ページ共通

権限制御：
ページ表示時に requireClubAdminMembership(clubSlug) を実行する。
対象ロールは OWNER、COACH、OFFICER とする。
取得条件には必ず clubId を含める。
MEMBERは notFound または会員用ページへリダイレクトする。
管理者用ページでは、targetRoles に関係なく、所属クラブのイベント・お知らせをすべて取得する。

ただし、管理者用ページへ入れるのは ACTIVE状態の OWNER / COACH / OFFICER のみとする。

MEMBERは管理者用ページへアクセスできない。

対象ページ：

７-4 管理者用月別イベント一覧
７-5 管理者用日別イベント一覧
７-6 イベント新規作成
７-7 イベント編集
７-10 管理者用お知らせ一覧
７-11 お知らせ新規作成
７-12 お知らせ編集

OWNER専用ページ

権限制御：
ページ表示時に requireClubOwner(clubSlug) を実行する。
対象ロールは OWNER のみとする。
取得・更新・削除条件には必ず clubId を含める。

対象ページ：

７-14 LINE通知グループ管理ページ
７-17 メンバー管理・設定ページ

※子テーブルのclubId方針

クラブに属する運営アプリ用データには、原則として直接 clubId を持たせる。

関連先をたどればclubIdが分かる場合でも、認可、RLS、検索、サポート対応、顧客ごとのデータ抽出・削除を簡単にするため、主要な子テーブルにもclubIdを保存する。

対象：

ClubEventMemo
ClubEventRead
ClubNoticeRead
ClubLineTarget
ClubLineRegistrationToken
ClubEventAttachment
ClubNoticeAttachment
ClubLineDelivery
SupportReport

例外：

AppUser:
ユーザー本人を表すグローバル寄りのデータのため、clubIdを直接持たせない。
クラブ所属はClubMembershipで管理する。

Child:
子ども本人を表すデータのため、clubIdを直接持たせない。
クラブ所属はChildClubMembershipで管理する。

注意：

clubIdを子テーブルに直接持たせる場合、作成・更新時に関連データのclubIdが一致していることをServer Action側で必ず確認する。

例：

ClubEventReadを作成する場合、
eventIdのClubEvent.clubId
membershipIdのClubMembership.clubId
保存するclubId
がすべて一致することを確認する。

ClubEventMemoを作成する場合、
eventIdのClubEvent.clubId
membershipIdのClubMembership.clubId
保存するclubId
がすべて一致することを確認する。

ClubLineTargetを作成する場合、
lineSettingIdのClubLineSetting.clubId
保存するclubId
が一致することを確認する。

ClubLineRegistrationTokenを作成する場合、
lineSettingIdのClubLineSetting.clubId
createdByMembershipIdのClubMembership.clubId
保存するclubId
が一致することを確認する。

※clubIdを持つ子テーブルの取得ルール

clubIdを直接持つ子テーブルは、取得・更新・削除時に必ずclubIdをwhere条件へ含める。

例：

ClubEventRead:
where: {
  clubId,
  eventId,
  membershipId
}

ClubEventMemo:
where: {
  clubId,
  eventId,
  membershipId
}

ClubLineTarget:
where: {
  clubId,
  id: targetId
}

ClubLineRegistrationToken:
where: {
  clubId,
  tokenHash
}

関連先をたどってからclubIdを確認するのではなく、最初の検索条件にclubIdを含める。


※作成者・更新者の記録

ClubEvent と ClubNotice には、作成者・更新者として以下を保存する。

createdByMembershipId:
最初に作成したClubMembership.id

updatedByMembershipId:
最後に更新したClubMembership.id

作成者・更新者は AppUser.id ではなく ClubMembership.id で保存する。
理由は、同じユーザーでもクラブごとに役割が異なる可能性があるため。

新規作成時：
createdByMembershipId = 実行者のClubMembership.id
updatedByMembershipId = 実行者のClubMembership.id

編集時：
createdByMembershipId は変更しない。
updatedByMembershipId = 実行者のClubMembership.id

前月予定の複製や定期練習の一括作成時：
新しく作られたイベントの createdByMembershipId は、複製・一括作成を実行した管理者のClubMembership.id とする。


※作成者本人の自動表示ルールはやめる
createdByMembershipId:
誰が作成したかを記録するために使う。

updatedByMembershipId:
誰が最後に更新したかを記録するために使う。

これらは監査・管理画面表示用であり、会員画面の公開判定には使わない。

会員画面の公開判定は targetRoles のみで行う。


※会員用イベント・お知らせページの表示条件

会員画面では、公開済みで、かつログイン中の role が targetRoles に含まれるイベント・お知らせのみ表示する。

表示条件：

status = PUBLISHED
かつ
targetRoles にログイン中の ClubMembership.role が含まれる

作成者本人であっても、targetRoles に自分の role が含まれていない場合、会員画面では表示されない。

createdByMembershipId / updatedByMembershipId は、作成者・更新者の記録として使用する。
会員画面の公開判定には使わない。

OWNER は常に targetRoles に含める。
そのため、OWNER も特別扱いではなく、通常の targetRoles 判定で表示される。

ただし、status = PUBLISHED の条件は維持する。
下書きは会員用ページには表示しない。
下書き確認は管理者用ページで行う。
・表示条件
status = PUBLISHED
かつ
以下に該当する

role が targetRoles に含まれる


管理者用イベント・お知らせの一覧詳細ページ（（管理者用）月別イベント一覧ページ、（管理者用）日別イベント一覧ページ、（管理者用）お知らせ一覧ページ）には以下の補足分を差し込む。
「※管理者ページでは、公開対象に関係なく、管理権限を持つユーザーがすべてのイベント・お知らせを確認できます。」



※Supabase Authユーザー削除方針

メンバー管理画面では、Supabase Authユーザー自体を削除しない。

理由：
同じAppUserが複数クラブに所属している可能性があるため。
あるクラブから退会しても、他クラブでは利用中の可能性がある。

メンバー管理画面で操作する対象は、原則としてそのクラブのClubMembershipのみとする。

ACTIVE済みメンバーを退会扱いにする場合：
ClubMembership.status = WITHDRAWN

一時的に利用停止する場合：
ClubMembership.status = SUSPENDED

招待中メンバーを取り消す場合：
ClubMembership.status = INVITED の場合のみ、招待取消としてClubMembershipと未承諾のClubInvitationを削除できる。

ただし、招待取消の場合でもSupabase Authユーザー自体は削除しない。

Supabase Authユーザーの削除は、すべてのClubMembershipがなくなり、本人確認や運用上の確認が取れた場合のみ、管理者または運営者が個別対応する。
MVPでは自動削除しない。


※どこまでを未読とするのかについて
イベント未読数：現在月の初日以降に該当する公開イベント
お知らせ未読数：公開から180日以内



※サポート・不具合報告の保存方針

マイページの「ヘルプ・不具合報告」から送信された内容は、SupportReport に保存する。

メール送信だけにはしない。
理由は、30クラブ以上を運用する場合、メールだけでは対応状況・報告者・クラブ・発生ページを追跡しにくいため。

SupportReport には以下を保存する。

clubId:
報告者が所属しているクラブID。

membershipId:
報告したClubMembership.id。
退会や招待取消などで参照先がなくなる可能性に備え、nullable とする。

reporterName / reporterEmail / reporterRole:
報告時点の利用者情報をスナップショットとして保存する。

message:
利用者が入力した内容。

pageUrl:
不具合が起きたページURL。
保存前に不要なトークンや危険なURLを除去する。

userAgent:
端末・ブラウザ情報。
iPhone / Android / Chrome / Safari などの調査に使う。

category:
BUG / QUESTION / REQUEST / OTHER のいずれか。

status:
OPEN / IN_PROGRESS / RESOLVED のいずれか。

DB保存を正式な受付とする。
メール通知は新着に気づくための補助として扱う。

メール通知に失敗しても、DB保存に成功していれば利用者には「不具合報告を受け付けました。開発チームにて確認し、サービスの改善に役立てさせていただきます。ご協力ありがとうございます。」と表示する。
メール通知失敗は notifyError またはログに残す。



※メール送信基盤方針

運営アプリのメール送信基盤は、
開発者が管理する共通Resendアカウント・共通送信ドメインを使用する。

顧客ごとにResendアカウント・APIキー・送信ドメインを作成しない。

システム共通：

RESEND_API_KEY
MAIL_FROM_ADDRESS

はVercel等の環境変数として管理する。

例：

RESEND_API_KEY=re_xxxxx
MAIL_FROM_ADDRESS=invite@mail.example.jp

クラブごとのメール表示名はClub.name等から動的に生成する。

例：

ARAO U-12 <invite@mail.example.jp>
○○ミニバス <invite@mail.example.jp>

ResendのAPIキーはclubIdごとのDBには保存しない。

運営アプリの新規ユーザー招待では、
Supabase AuthのgenerateLink(type: "invite")で認証リンクのみ生成し、
実際の招待メールはResendから送信する。

既存ユーザーを別クラブへ招待する場合は、
新しいSupabase Authユーザーを作成せず、
ClubInvitationの招待URLをResendから送信する。

既存HPのメール送信処理は運営アプリ開発時には変更しない。
HPをマルチテナント化する段階で、
問い合わせ・体験見学メールも同じ共通Resend基盤へ移行する。



※まとめ
今アプリを作る段階から generateLink + 開発者Resend にする。
既存HPは今触らない。
HPマルチテナント化時に問い合わせ・体験見学メールを同じ共通Resendへ移す。


メンバー招待
→ generateLink + Resend API

パスワード再設定
→ resetPasswordForEmail()
→ Supabase Custom SMTP
→ 同じResendアカウント

※DBのmodel Clubテーブル の planType     PlanType @default(STARTER)にenum PlanType {
  STARTER
  STANDARD
  PRO
} という選択肢があり、HPのみやHP＋アプリなどの組み合わせで売りたいのでこのPlanTypeでアプリの付け外しができるようにホームページとアプリを同じプロジェクト内で分けたい。


※プラットフォーム運営者権限

DEVELOPERはClubMemberRoleには含めない。

DEVELOPERは各クラブのOWNERではなく、
サービス全体を管理するPlatformAdminとして扱う。

PlatformAdminは、
クラブ単位のrequireClubOwner()や
requireClubAdminMembership()を自動的に突破しない。

MVPではPlatformAdminに許可する機能を
以下に限定する。

・全クラブから送信されたSupportReportの閲覧
・SupportReportの対応ステータス変更
・SupportReportの内部メモ編集

将来、運用上必要になった場合のみ、
クラブデータへのサポートアクセス機能を別途設計する。

※開発者専用の認可関数を作る
現在、

requireActiveClubMembership()
requireClubRole()
requireClubOwner()

がありますよね。
ここへ混ぜません。
新しく、

lib/platform/access-control.ts

を作って、

requirePlatformAdmin()

を作ります。
概念はこうです。

import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";
import { prisma } from "@/src/infrastructure/prisma/client";

export async function requirePlatformAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/club-login");
  }

  const platformAdmin = await prisma.platformAdmin.findFirst({
    where: {
      id: user.id,
      isActive: true,
    },
  });

  if (!platformAdmin) {
    notFound();
  }

  return {
    user,
    platformAdmin,
  };
}

つまり、

クラブ画面

requireActiveClubMembership()
requireClubAdminMembership()
requireClubOwner()


サービス運営画面

requirePlatformAdmin()

と完全に分離します。


※開発者がClubMembershipを持っていなくてもいい

※PlatformAdminによる全クラブ横断取得

原則としてクラブ運営データの取得・更新・削除には
clubIdを必ず含める。

ただし、PlatformAdmin専用のサービス運営画面は例外とする。

例：

/platform/support

このページは全クラブのSupportReportを横断取得することが
機能要件そのものであるため、clubIdによるテナント制限を行わない。

ただし必ず事前に、

requirePlatformAdmin()

を実行する。

通常のClubMembershipユーザーから
この横断取得処理を呼び出すことはできない。

PlatformAdmin用Repositoryと
ClubMembership用Repositoryは分離する。


※PlatformAdminとしてログインしたいことをどう判定するか」
同じ /club-login を使い、

/club-login?returnTo=/platform/support

とする方式です。
ただし returnTo は好きなURLをそのまま信用せず、

/platform/support

など許可した内部パスだけ通すようにする。

returnTo = /platform/support
↓
Supabase Auth成功
↓
requirePlatformAdmin()
↓
/platform/support


※プランタイプはSTARTER：ホームページのみ
STANDARD：ホームページ＋アプリ
PRO：まだ未定（保留）とする

※テナントの整合性についてServer Actionの確認だけでなく、可能な部分は複合外部キー・CHECK制約でも保証する

※二重送信について：idempotencyKey だけでなく、送信処理の原子的な取得状態を追加する。今後、月謝引き落としなどで同じく使用するため。
※Supabaseユーザー作成後にDB・メールが失敗した場合の再送・復旧手順は、時間の関係上チャットGPTに設計と実装をお願いする

※イベント削除
↓
ClubEvent削除
↓
関連する
ClubEventAttachment
ClubEventMemo
ClubEventRead
などはCascade削除

ただし
ClubLineDeliveryは削除しない

↓
ClubLineDelivery.eventIdだけnull

※テナントA/Bを使った越境テストはアプリ実装完了後に実装しテストする。

※クラブアプリのページ、Server Action、Route Handlerを新規作成する際は、
処理開始時にrequireClubAppAccess()または
requireClubAppAdminAccess()を必ず実行する。

LINE WebhookなどMembershipを持たない処理は、
クラブ特定後にrequireClubFeature(club, "CLUB_APP")を実行する。


6.フォルダ構成
├── app/
│   ├── (public)/                            ───【一般公開のHP画面】
│   │   ├── notice/
│   │   ├── staff/
│   │   ├── flow/
│   │   └── layout.tsx                       ─── HP用のヘッダー・フッター
│   │
│   ├── admin/                               ───【HP全体の管理画面】
│   │   ├── login/
│   │   │   └── page.tsx                     ─── HP管理者ログイン画面
│   │   ├── layout.tsx                       ─── HP管理画面用のヘッダー・フッター
│   │   └── page.tsx                         ─── [URL: /admin]
│   │
│   ├── (auth)/                              ───【認証専用画面】
│   │   ├── club-login/
│   │   │   └── page.tsx                     ─── 会員・管理者ログイン画面
│   │   ├── welcome/
│   │   │   └── page.tsx                     ─── 初回パスワード設定ページ
│   │   ├── reset-password/
│   │   │   └── page.tsx                     ─── パスワード再設定専用ページ
│   │   └── forget-password/
│   │       └── page.tsx                     ─── パスワード再設定メール申請ページ
│   │
│   ├── api/                                 ───【外部連携用API（LINE Webhookなど）】
│   │   └── line/
│   │       └── webhook/
│   │           ├── route.ts                 ─── 既存HP/legacy用。移行完了まで残す
│   │           └── [webhookKey]/
│   │               └── route.ts             ─── 運営アプリ用Webhook
│   │
│   └── (club-app)/                          ───【クラブ運営アプリ画面】
│       └── club/
│           └── [clubSlug]/
│               ├── layout.tsx               ─── アプリ用のヘッダー・フッター
│               │
│               ├── attachments/             ───【動的ファイル配信ルート】
│               │   ├── event/
│               │   │   └── [attachmentId]/
│               │   │       └── route.ts     ─── イベント添付ファイルのセキュア配信
│               │   └── notice/
│               │       └── [attachmentId]/
│               │           └── route.ts     ─── お知らせ添付ファイルのセキュア配信
│               │
│               ├── events/
│               │   ├── page.tsx             ─── 会員用：月別イベント一覧ページ
│               │   ├── list/
│               │   │   └── page.tsx         ─── 会員用：日別イベント一覧ページ
│               │   └── [eventId]/
│               │       └── page.tsx         ─── 会員用：イベント詳細ページ
│               │
│               ├── notice/
│               │   ├── page.tsx             ─── 会員用：お知らせ一覧ページ
│               │   └── [noticeId]/
│               │       └── page.tsx         ─── 会員用：お知らせ詳細ページ
│               │
│               ├── account/
│               │   ├── page.tsx             ─── 会員・管理者共通：マイページ
│               │   ├── actions.ts           ─── 不具合報告フォームのServer Action
│               │   └── SupportReportForm.tsx ── 不具合報告フォームUI
│               │
│               ├── password/
│               │   └── page.tsx          ─── 会員・管理者共通：パスワード再設定ページ
│               │
│               └── admin/                   ───【各クラブの管理者用画面】
│                   ├── events/
│                   │   ├── page.tsx         ─── 管理者用：月別イベント一覧ページ
│                   │   ├── list/
│                   │   │   └── page.tsx     ─── 管理者用：日別イベント一覧ページ
│                   │   ├── new/
│                   │   │   └── page.tsx     ─── 管理者用：イベント新規作成ページ
│                   │   └── [eventId]/
│                   │       └── edit/
│                   │           └── page.tsx ─── 管理者用：イベント編集ページ
│                   │
│                   ├── notice/
│                   │   ├── page.tsx         ─── 管理者用：お知らせ一覧ページ
│                   │   ├── new/
│                   │   │   └── page.tsx     ─── 管理者用：お知らせ新規作成ページ
│                   │   └── [noticeId]/
│                   │       └── edit/
│                   │           └── page.tsx ─── 管理者用：お知らせ編集ページ
│                   │
│                   ├── members/
│                   │   └── page.tsx         ─── オーナー用：メンバー管理・設定ページ
│                   │
│                   └── settings/
│                       └── line/
│                           └── page.tsx     ─── オーナー用：LINE通知グループ管理ページ
│
└── lib/                                      ───【共有ロジック・ユーティリティ】
    ├── club/
    │   └── access-control.ts                 ─── 所属クラブや権限のチェックロジック
    │
    ├── datetime/
    │   └── club-time.ts                      ─── クラブ運営用の日時・タイムゾーン処理
    │
    ├── line/
    │   ├── verify-line-signature.ts          ─── LINEの署名検証ロジック
    │   ├── webhook-key.ts                    ─── webhookKey の生成やバリデーション
    │   ├── create-line-deliveries.ts         ─── 配信対象データ（キュー）の作成
    │   └── send-line-deliveries.ts  ──実際にLINE APIへメッセージを送信する処理
    │
    ├── email/
    │   ├── resend-client.ts                  ─── Resendクライアントを生成する処理
    │   ├── send-email.ts                     ─── メール送信の共通処理
    │   └── club-invitation-email.ts          ──クラブ招待メール本文・件名を作る処理
    │
    ├── auth/
    │   └── generate-club-invite-link.ts-Supabaseでクラブ招待リンクを生成する処理
    │
    ├── storage/
    │   └── club-app-attachment-storage.ts -S3や各種ストレージへのファイル操作
    │
    ├── repositories/
    │   └── support-report.ts                 ─── クラブ利用者からの不具合報告
    │　└── platform-support-report.ts　─── 
    ├── notifications/
    │   └── support-report-email.ts           ─── 不具合報告メール通知処理
    │
    └── format/
        └── file-size.ts                      ─── ファイルサイズ（KB/MB）の変換関数

※resend-client.ts
→ RESEND_API_KEYからResend Clientを作る

send-email.ts
→ 共通From等を設定してResendへ送る

club-invitation-email.ts
→ クラブ招待メールの件名・本文を作る

generate-club-invite-link.ts
→ Supabase AuthのgenerateLink()を使う

７画面の流れ
ページ目次
７-1 （会員用）月別イベント一覧ページ(/(club-app)/club/[clubSlug]/events)
７-2 （会員用）日別イベント一覧ページ(/(club-app)/club/[clubSlug]/events/list)
７-3（会員用）イベント詳細ページ（/(club-app)/club/[clubSlug]/events/[eventId]）
７-4（管理者用）月別イベント一覧ページ（/(club-app)/club/[clubSlug]/admin/events）（新規作成の権限あり）
７-5（管理者用）日別イベント一覧ページ（/(club-app)/club/[clubSlug]/admin/events/list）（全て・下書き・公開表示タブ設定（バッジ付き）や編集、削除の権限あり）
７-6（管理者用）イベント新規作成ページ（/(club-app)/club/[clubSlug]/admin/events/new）
７-7（管理者用）イベント編集ページ（/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit）
７-8（会員用）お知らせ一覧ページ（/(club-app)/club/[clubSlug]/notice）
７-9（会員用）お知らせ詳細ページ（/(club-app)/club/[clubSlug]/notice/[noticeId]）
７-10（管理者用）お知らせ一覧ページ（/(club-app)/club/[clubSlug]/admin/notice）（全て・下書き・公開表示タブ設定（バッジ付き）や新規作成、編集、削除の権限あり）
７-11（管理者用）お知らせ新規作成ページ（/(club-app)/club/[clubSlug]/admin/notice/new）
７-12（管理者用）お知らせ編集ページ（/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit）
７-13（会員・管理者共通）マイページ （/(club-app)/club/[clubSlug]/account）
7-14（オーナー用）ライン通知グループ管理ページ（/(club-app)/club/[clubSlug]/admin/settings/line）
7-15（会員・管理者共通）ログインページ（/(auth)/club-login）
７-16（会員・管理者共通）パスワード再設定ページ(/(club-app)/club/[clubSlug]/password)
７-17（オーナー用）メンバー管理・設定ページ（/(club-app)/club/[clubSlug]/admin/members）
７-18 初回パスワード設定ページ( /(auth)/welcome)
７-19 パスワード再設定専用ページ(/(auth)/reset-password)
7-20 パスワード再設定メール申請ページ(/(auth)/forget-password
)
7-21 クラブ選択画面（（club-app）/club/select）
7-22 不具合送信管理ページ（/(club-app)/platform/support）
 

※LINEグループ通知先の登録方法

1. OWNERがLINE通知グループ管理ページを開く
2. 「新しいグループを登録」を押す
3. アプリが有効期限付きの登録コードを発行する
4. 対象のLINEグループへ公式LINEアカウントを参加させる
5. LINEグループ内で登録コードを送信する
6. WebhookでグループIDと登録コードを受信する
7. 該当クラブの通知先としてClubLineTargetへ保存する
8. 管理画面で通知先名、対象ロール、有効・無効を設定する


７-1 （会員用）月別イベント一覧ページ(/(club-app)/club/[clubSlug]/events)
【機能要件】 1.ページ名：会員用月別イベント一覧ページ

2.URL：/(club-app)/club/[clubSlug]/events

3.利用可能な役割：ACTIVE状態のOWNER・COACH・OFFICER・MEMBER

4.表示条件：
・所属クラブのデータのみ
・statusがPUBLISHED
・ログイン中のroleがtargetRolesに含まれる
・原則として対象月のイベント

5.取得データ
・ClubEvent 
・ClubEventRead

6.表示内容：
・月間カレンダー
・ジャンルごとの色分け
・未読表示

7.操作：
・日付選択
・タップした日の日別イベント一覧(/(club-app)/club/[clubSlug]/events/list)へ遷移する
・タップしたカードのイベント詳細（/(club-app)/club/[clubSlug]/events/[eventId]）へ遷移する
・月選択（前月／翌月への移動）

8. 権限制御：
roleがtargetRolesに含まれないイベントは取得しない

9.既読処理：一覧表示だけでは既読にせず、イベント詳細ページ（/(club-app)/club/[clubSlug]/events/[eventId]）を開いた時点で既読にする

10.空状態：イベントが入っていないカレンダーを表示する。

11.エラー：取得失敗時は「イベントを取得できませんでした」と言う表示を出す

【画面レイアウト構成】
目次：①ヘッダー ②年月切替 ③曜日 ④カレンダー ⑤イベントカード ⑥フッター
①ヘッダー
中央に「月別イベント」

上下に罫線

────────────

②年月切替

＜ 2026年7月 ＞
大きめの太字で中央に表示。
左右には前後月を薄文字でやや小さく表示（前後それぞれ二ヶ月分：前なら6月と5月、後なら8月と9月）

タップで切替

────────────

③曜日

月 火 水 木 金 土 日

土は青

日は赤

────────────

④カレンダー

各日付の左上に日付

イベントはカード表示

ジャンル色分け

タイトルは5文字程度＋…

未読は右上に未読数が赤丸で書かれている。

────────────

⑤フッター

イベント
お知らせ
マイページ

月別イベント一覧の取得条件

対象月の開始日時と終了日時は club.timezone に基づいて計算する。

対象月の時間帯とイベント期間が重なるイベントを取得する。

取得条件：

startAt < 対象月の翌月1日00:00
かつ
endAt がある場合は endAt > 対象月の1日00:00
endAt がない場合は startAt >= 対象月の1日00:00

※

７-2（会員用）日別イベント一覧ページ
（/(club-app)/club/[clubSlug]/events/list）

【機能要件】
1. ページ名
会員用日別イベント一覧ページ
2. URL

/(club-app)/club/[clubSlug]/events/list?date=2026-07-15

実際のURL：

/club/[clubSlug]/events/list?date=2026-07-15

3. 利用可能な役割
ACTIVE状態の以下の利用者。

OWNER
COACH
OFFICER
MEMBER

4. 表示条件
* ログイン中の利用者が所属するクラブのイベントのみ
* status が PUBLISHED
* ログイン中の role が targetRoles に含まれる
* URLの date で指定された日付に該当するイベント
* date が不正または未指定の場合は当日を表示
5. 取得データ
* ClubEvent
* ClubEventRead
* ログイン中の ClubMembership
6. 表示内容
* 選択中の日付
* 前日・翌日への移動
* 対象日のイベントカード一覧
* イベントジャンル
* イベントタイトル
* 未読表示（赤枠でカードを囲む）
* PDF添付の有無
* 更新日
* イベントが複数ある場合は開始時間順に表示
7. 操作
* 前日へ移動
* 翌日へ移動
* 月別イベント一覧へ戻るボタン（←）
* イベントカードをタップしてイベント詳細（/club/[clubSlug]/events/[eventId]）へ遷移
* イベント一覧の縦スクロール
8. 権限制御
* 所属クラブ以外のイベントは取得しない
* role が targetRoles に含まれないイベントは取得しない
* 下書きイベントは取得しない
* URLを直接入力しても権限外イベントは表示しない
9. 既読処理
一覧表示だけでは既読にしない。
イベント詳細ページ（/club/[clubSlug]/events/[eventId]）を開いた時点で既読にする。
10. 空状態
対象日にイベントがない場合：

この日のイベントはありません。

月別カレンダーへ戻るボタンを表示する。
11. エラー表示
取得失敗時：

イベントを取得できませんでした。
時間をおいて、もう一度お試しください。


【画面レイアウト構成】
目次：

①ヘッダー
②選択日表示
③前日・翌日切替
④イベントカード一覧
⑤月別表示へのリンク
⑥フッター

①ヘッダー
共通ヘッダー中央にページタイトル「日別イベント」を表示する。
左端に月別イベント一覧へ戻るボタン（←）を配置する。

その下の中央に大きめの太字で「選択日表示」。例）2026年7月15日（水）


②前日・翌日切替
選択日の左右に前日・翌日の切り替えボタンを表示する（薄文字でやや小さく）

＜ 7月14日　　7月16日 ＞


⑦イベント管理カード一覧
イベントを開始時間順で縦に並べる。
各カードには次を表示する。

【１行目】公開状態バッジ＋ジャンルバッジ＋時計マークと開始時間（🕰️０９：３０〜）
【２行目】イベントタイトル
【３行目】📍開催場所＋PDF添付マーク＋🔴 未読（未読の場合）


⑧フッター

イベント
お知らせ
マイページ

イベントを選択状態にする。


※

７-3（会員用）イベント詳細ページ
/(club-app)/club/[clubSlug]/events/[eventId]
【機能要件】
1. ページ名
会員用イベント詳細ページ
2. URL

/(club-app)/club/[clubSlug]/events/[eventId]

3. 利用可能な役割
ACTIVE状態のOWNER・COACH・OFFICER・MEMBER。
4. 表示条件
* 所属クラブのイベント
* status が PUBLISHED
* ログイン中の role が targetRoles に含まれる
* 存在する eventId
5. 取得データ
* ClubEvent
* ClubEventRead
* ClubEventMemo
* ログイン中の ClubMembership
6. 表示内容
* タイトル
* ジャンル
* 開始日時
* 終了日時
* 終日イベント表示
* 開催場所
* 集合日時
* 集合場所
* 本文
* 持ち物
* 注意事項
* PDFリンク
* 自分専用メモ
* 最終更新日時
* 公開日
7. 操作
* 一覧へ戻るボタン
* PDFを別画面で開く
* 自分専用メモを入力・保存
* 自分専用メモを編集
* 自分専用メモを削除
8. 権限制御
* 権限外イベントは表示しない
* 他人の個人メモは取得・表示・編集しない
* 自分の membershipId と一致するメモのみ操作可能
* この会員画面からイベント本体の編集・削除はできない
9. 既読処理
ページを正常に表示した時点で、ClubEventRead をupsertする。

readAt = 現在日時

readAt < readRequiredAt の場合も、現在日時へ更新する。
10. 空状態
該当イベントが存在しない場合：

イベントが見つかりませんでした。

11. エラー表示

イベントを表示できませんでした。

メモ保存失敗時：

メモを保存できませんでした。

【画面レイアウト構成】
目次：
①ヘッダー
②ジャンル・タイトル
③日時（開始と終了）・場所
④本文
⑤持ち物
⑥注意事項
⑦添付PDF
⑧自分専用メモ（保存・削除ボタン付き）
⑨フッター

ヘッダー左端に戻るボタンを配置する。

【画面レイアウト構成】
目次：

①ヘッダー（ジャンル・タイトル）
②日時・場所
③イベント本文
④持ち物
⑤注意事項
⑥添付PDF
⑦自分専用メモ
⑧最終更新情報
⑨戻るボタン
⑩フッター

①ヘッダー
画面最上部の左寄せで戻るボタン（←）＋中央に見出し「イベント詳細」
画面上部左寄せでイベントのジャンルバッジを表示する。
例：

通常練習
練習試合
大会
合宿
休み
その他

ジャンルごとに背景色を変更する。
ジャンルバッジの下に、イベントタイトルを大きめの太字で左寄せで表示する。
例：

通常練習
熊本県ミニバスケットボール大会
夏季合宿

タイトルが長い場合も省略せず、複数行へ折り返して表示する。

②日時・集合情報・場所

タイトルの下に、日時・集合情報・場所をまとめた情報エリアを表示する。

開催日
2026年7月15日（水）

時間
18:30〜20:30

終日イベントの場合：
終日

集合時間
18:00

集合場所
荒尾市民体育館 入口前

開催場所
荒尾市民体育館 メインアリーナ

終了日時が未設定の場合は開始日時のみ表示する。
isAllDay = true の場合は時間帯ではなく「終日」と表示する。

meetingAt が未設定の場合は、集合時間の行を表示しない。
meetingLocation が未設定の場合は、集合場所の行を表示しない。
location が未設定の場合は、開催場所の行を表示しない。

日時・集合情報・場所エリアは、薄い背景色または枠線付きのカードとして表示する。

③イベント本文
「詳細」という見出しを表示し、その下に本文を表示する。
改行はDBに保存されている内容を維持する。
イベント本文が未設定の場合は、詳細の行自体を表示しない。

当日は18時15分までに集合してください。
練習開始前に各自で準備運動を行います。

本文が長い場合は、ページ全体を縦スクロールして確認できるようにする。

④持ち物
持ち物が設定されている場合のみ表示する。

持ち物

・バスケットボール
・飲み物
・タオル
・着替え

見出しと内容を、薄い背景色のカード内に表示する。

⑤注意事項
注意事項が設定されている場合のみ表示する。

注意事項

体育館の駐車台数には限りがあります。
できるだけ乗り合わせてお越しください。

重要な内容であることが分かるように、薄い黄色の背景を使う。
警告色を使いすぎない。

⑥添付PDF
PDFが添付されている場合のみ表示する。

添付資料

大会要項.pdf
1.8MB
［PDFを開く］

PDFボタンを押すと、別タブまたは端末のPDFビューアで開く。
PDFがない場合は、このセクション自体を表示しない。

複数添付なら 添付資料

大会要項.pdf
1.8MB
［PDFを開く］

駐車場案内.pdf
820KB
［PDFを開く］

⑦自分専用メモ
「自分専用メモ」という見出しを表示する。
その下に説明文を表示する。

このメモは自分だけが確認できます。
他の会員や管理者には表示されません。

入力欄は複数行入力可能なtextareaとする。

例：
集合時間の10分前に到着する
青いユニフォームを持参

入力欄の下にボタンを配置する。

［メモを保存する］

既にメモが保存されている場合は、その内容を入力欄に初期表示する。
保存済みの場合は、次のボタンを表示する。

［変更を保存する］（右　緑）
［メモを削除する］（左　グレー）

削除ボタンを押した場合は確認モーダルを表示する。

このメモを削除しますか？

［キャンセル］
［削除する］

変更を保存ボタンを押すと 緑色の文字で『メモを保存しました』と3秒だけトースト通知（ポップアップ）を出す


⑧最終更新情報
イベント情報の最後に、最終更新日時を小さめの文字で表示する。

最終更新：2026年7月10日 18:30
公開：2026年6月21日 17:30


⑨戻るボタン
一覧へ戻るボタンを押した場合、原則として直前に表示していた日別イベント一覧へ戻る。
直前ページ情報が取得できない場合は、月別イベント一覧ページへ戻る。


⑩フッター
アプリ共通フッターを画面下部に固定表示する。

イベント
お知らせ
マイページ

現在表示中の「イベント」を選択状態として強調表示する。

※



７-4（管理者用）月別イベント一覧ページ
/(club-app)/club/[clubSlug]/admin/events
【機能要件】
1. ページ名
管理者用月別イベント一覧ページ
2. URL

/(club-app)/club/[clubSlug]/admin/events

3. 利用可能な役割

OWNER
COACH
OFFICER

いずれもACTIVE状態に限る。
4. 表示条件
* 所属クラブのイベント
* 公開・下書きの両方
* 対象月のイベント
* targetRolesに関係なく管理対象を表示
5. 取得データ
* ClubEvent
* ログイン中の ClubMembership
6. 表示内容
* 管理者用月間カレンダー
* 公開・下書きバッジ
* ジャンル色分け
* 新規作成ボタン
* 日別管理一覧への切替
* 会員画面で確認ボタン
* 定期練習一括作成への入口
7. 操作
* 新規作成ページへ移動
* 日付を選択して日別管理一覧へ移動
* イベントカードから編集ページへ移動
* 前月・翌月へ移動
* 会員画面での表示確認
8. 権限制御
* MEMBERはアクセス不可
* Server ActionでもOWNER・COACH・OFFICERのみ許可
* 他クラブのイベントは取得しない
9. 既読処理
管理者用画面の閲覧では既読状態を変更しない。
10. 空状態
イベントがない月でも空の管理カレンダーを表示する。
11. エラー表示

イベントを取得できませんでした。


【画面レイアウト構成】
目次：

①ヘッダー
③管理操作ボタン
⑤年月切替
⑥曜日表示
⑦管理用カレンダー
⑧会員画面で確認ボタン
⑨フッター

①ヘッダー
共通ヘッダー中央にページタイトル「（管理）月別イベント」を表示する。
左端に管理メニューへ戻るボタン（←）を配置する。
その下に補足文を表示する。

イベントの作成、編集、公開状態の変更を行います。

③管理操作ボタン
ページタイトルの下左寄せに、主要操作ボタンを配置する。

［＋ 新しいイベントを作成］(７-6（管理者用）イベント新規作成ページ（/(club-app)/club/[clubSlug]/admin/events/new）へ遷移する）
［定期練習を一括作成］

「新しいイベントを作成」は目立つ塗りつぶしボタンとする。
「定期練習を一括作成」は補助的な枠線ボタンとする。

⑤年月切替
中央に対象年月を大きく表示する。

2026年7月

左右に前後2か月分の移動ボタンを小さく表示する（会員用月別イベント一覧と同じ）。

＜　2026年7月　＞

⑥曜日表示
曜日を月曜日から日曜日まで表示する。

月 火 水 木 金 土 日

土曜日は青、日曜日は赤で表示する。

⑦管理用カレンダー
各日付セルの左上に日付を表示する。
日付ごとにイベントカードを表示する。
カードには次を表示する。

ジャンル色分け

タイトルは5文字程度＋…


タイトル（５文字程度＋…）
ジャンル色

公開か下書きかをバッジで表示

イベントカードを押すと編集ページへ遷移する。

/club/[clubSlug]/admin/events/[eventId]/edit

イベントが複数ある日は縦に並べる。
表示可能な高さを超える場合は、

ほか2件

カード以外を押すと、その日付の（管理用）日別イベント一覧へ遷移する。

⑧会員画面で確認ボタン
一番下（フッターの上）に会員画面で確認ボタンをおいて（会員用）イベント一覧ページに遷移するリンクを置く


⑨フッター
共通フッターを表示する。
管理画面であっても、

イベント
お知らせ
マイページ

を表示する。
ただし、現在のページが管理ページであることをヘッダーやページタイトルで明確にする（管理者ページのフッターは（管理）をつけるか要検討）。


月別イベント一覧の取得条件

対象月の開始日時と終了日時は club.timezone に基づいて計算する。

対象月の時間帯とイベント期間が重なるイベントを取得する。

取得条件：

startAt < 対象月の翌月1日00:00
かつ
endAt がある場合は endAt > 対象月の1日00:00
endAt がない場合は startAt >= 対象月の1日00:00


７-5（管理者用）日別イベント一覧ページ
/(club-app)/club/[clubSlug]/admin/events/list
【機能要件】
1. ページ名
管理者用日別イベント一覧ページ
2. URL

/(club-app)/club/[clubSlug]/admin/events/list?date=2026-07-15&status=ALL

3. 利用可能な役割
ACTIVE状態のOWNER・COACH・OFFICER。
4. 表示条件
* 所属クラブのイベント
* 指定日
* statusによる絞り込み

ALL
PUBLISHED
DRAFT

5. 取得データ
* ClubEvent
* ログイン中の ClubMembership
6. 表示内容
* 選択日
* 全て・公開中・下書きタブ
* イベントカード
* 公開状態バッジ
* ジャンルバッジ
* 編集ボタン
* 削除ボタン
* 新規作成ボタン
7. 操作
* ステータスタブの切替
* 前日・翌日への移動
* 新規作成
* 編集
* 削除
* 会員画面で確認
* 月別管理ページへ戻る
8. 権限制御
* MEMBERはアクセス不可
* 削除・編集Server Actionでも管理権限を再確認
* 他クラブデータは操作不可
9. 既読処理
管理者一覧では既読処理を行わない。
10. 空状態

該当するイベントはありません。

11. エラー表示

イベントを取得できませんでした。

削除失敗時：

イベントを削除できませんでした。



【画面レイアウト構成】
目次：

①ヘッダー
②ページタイトル
③新規作成ボタン
④月表示・一覧表示切替
⑤日付切替
⑥公開状態タブ
⑦イベント管理カード一覧
⑧フッター


①ヘッダー
共通ヘッダー中央にページタイトル「（管理）日別イベント」を表示する。
左端に管理メニューへ戻るボタン（←）を配置する。
その下に補足文を表示する。

イベントの作成、編集、公開状態の変更を行います。
その下の中央に大きめの太字で「選択日表示」。例）2026年7月15日（水）

②前日・翌日切替
選択日の左右に前日・翌日の切り替えボタンを表示する（薄文字でやや小さく）

＜ 7月14日　　7月16日 ＞



③新規作成ボタン
ヘッダー下左寄せで次のボタンを配置する。

［＋ 新しいイベントを作成］

押すと新規作成ページへ遷移する。



⑥公開状態タブ
次のプルダウンタブで表示。

全て（デフォルト）
公開中
下書き


⑦イベントカード一覧
イベントを開始時間順で縦に並べる。
各カードには次を表示する。
【１行目】公開状態バッジ＋ジャンルバッジ＋時計マークと開始時間（🕰️０９：３０〜）
【２行目】イベントタイトル
【３行目】📍開催場所＋👥公開対象＋PDF添付マーク

カード左端に操作ボタン （(∨ シェブロン):「編集」、「削除」［会員画面で確認］が選択できる）を配置する。

［編集］
［削除］
［会員画面で確認］

下書きの場合は「会員画面で確認」を表示しない。
削除を押した場合は確認モーダルを表示する。

「○○」を完全に削除しますか？
削除したイベントと関連データは元に戻せません。

［キャンセル］
［削除する］

［会員画面で確認］を押したら（会員用）イベント詳細ページに遷移する


⑧フッター

イベント
お知らせ
マイページ

イベントを選択状態にする。


※日別イベント一覧の取得条件

URLの date は、club.timezone における日付として扱う。

例：
/club/[clubSlug]/events/list?date=2026-07-15

この場合、club.timezone における
2026-07-15 00:00:00 以上
2026-07-16 00:00:00 未満
の1日を対象範囲とする。

ただし、イベントが前日から当日にまたがる場合も表示するため、
指定日の時間帯とイベント期間が重なるイベントを取得する。

取得条件：

startAt < 指定日の翌日00:00
かつ
endAt がある場合は endAt > 指定日の00:00
endAt がない場合は startAt >= 指定日の00:00



７-6（管理者用）イベント新規作成ページ
/(club-app)/club/[clubSlug]/admin/events/new
【機能要件】
1. ページ名
管理者用イベント新規作成ページ
2. URL

/(club-app)/club/[clubSlug]/admin/events/new

3. 利用可能な役割
ACTIVE状態のOWNER・COACH・OFFICER。
4. 表示条件
管理権限を持つ所属者のみ。
5. 取得データ
* ログイン中の ClubMembership
* ClubLineTarget
* 必要に応じて複製元の ClubEvent
6. 表示内容
入力項目：
* タイトル
* ジャンル
* 終日イベント
* 開催日
* 開始時間
* 終了日
* 終了時間
* 開催場所
* 集合日
* 集合時間
* 集合場所
* 本文
* 持ち物
* 注意事項
* PDF
* 公開対象ロール
* 公開状態
* 利用者に確認してほしい予定として未読表示する設定
* LINEグループ通知設定
* 通知先グループ
7. 操作
* 下書き保存
* 公開
* 公開と同時にグループラインにLINE通知
* キャンセル
* PDF選択
* PDF選択解除
8. 権限制御
* MEMBERはアクセス不可
* Server Actionで管理権限を確認
* clubIdはフォーム値を信用せず、ログイン中の所属から確定
* 公開対象を1件以上必須とする
9. 既読処理
作成画面では既読処理なし。
下書き保存
firstPublishedAt = null
readRequiredAt = null

新規公開・未読表示OFF
firstPublishedAt = 現在日時
readRequiredAt = null

新規公開・未読表示ON
firstPublishedAt = 現在日時
readRequiredAt = 現在日時

LINE通知ON
選択された通知先グループごとに ClubLineDelivery を作成する。

送信前：
status = PENDING

LINE送信成功：
status = SENT
sentAt = 現在日時

LINE送信失敗：
status = FAILED
errorCode = エラーコード
errorDetail = エラー詳細

イベント・お知らせ本体には lastLineNotifiedAt を保存しない。
通知状況は ClubLineDelivery から集計して表示する。

10. 空状態
該当なし。
11. エラー表示
入力値を保持して、各エラーを表示する。
例：

タイトルを入力してください。
開始日時を入力してください。
公開対象を1つ以上選択してください。
PDFは指定された形式・容量で選択してください。
イベントを保存できませんでした。

【画面レイアウト構成】
目次：

①ヘッダー
③基本情報
④日時・場所
⑤詳細内容
⑥PDF添付
⑦公開対象
⑧公開状態
⑨LINE通知
・利用者へ未読として公開する設定
⑩保存・キャンセル

①ヘッダー
中央に「イベント新規作成」という見出しをつける
見出しの左側に戻るボタン（←）を配置し、押すと（管理者用）月別イベント一覧ページもしくは（管理者用）日別イベント一覧ページへ戻る（つまり元いた場所に戻る）。
入力中に戻る場合は、未保存内容があるときだけ確認モーダルを表示する。
入力内容は保存されていません。
このページを離れますか？


③基本情報
枠線付きセクション内に以下を配置する。

タイトル
ジャンル

タイトルは２行入力欄。
ジャンルはプルダウン式で選択できるようにする。
選択肢は以下の通り
enum ClubEventGenre {
  PRACTICE　//練習
  PRACTICE_GAME　//練習試合
  TOURNAMENT //大会
  CAMP　//合宿
  HOLIDAY　//休み
  OTHER　//その他
}

④日時・集合情報・場所

入力項目：

□ 終日イベント

開催日
開始時間
終了日
終了時間
開催場所

集合日
集合時間
集合場所

開始日は必須とする。
終日イベントがOFFの場合、開始時間を必須とする。
終日イベントがONの場合、開始時間・終了時間は非表示または入力不可にし、会員画面では「終日」と表示する。

終了日・終了時間は任意。
終了時間のみ入力されている場合は、終了日は開催日と同じ日として扱う。

集合日・集合時間・集合場所は任意。
集合時間のみ入力されている場合は、集合日は開催日と同じ日として扱う。
集合場所が未入力の場合は、画面表示はなし。DBには meetingLocation = null のまま保存する。

⑤詳細内容
入力項目：

本文
持ち物
注意事項

すべて複数行入力欄とする。
本文、持ち物と注意事項は任意。

⑥PDF添付
ファイル選択欄を表示する。

関連PDF
［ファイルを選択］

選択後はファイル名と容量を表示する。

大会要項.pdf
1.8MB

［選択を解除］

許可形式と最大容量を説明する。

⑦公開対象
チェックボックス形式で表示する。

公開対象

☑ オーナー
□ コーチ
□ 役員
□ 会員

オーナーは常に公開対象に含まれます。
このチェックは解除できません。

1つ以上選択必須。
全員へ公開する補助ボタンを設ける。

［すべて選択］



⑧公開状態
次の選択肢を表示する。

○ 下書きとして保存
○ 公開する

初期値は下書きにする。
※公開するの場合のみ以下のチェック欄を表示
既読管理
□ 利用者に確認してほしい予定として未読表示する
（初期値：チェックなし）
補足説明：通常練習など、カレンダーに追加するだけでよい予定はチェック不要です。
大会・集合時間変更・持ち物確認など、利用者に確認してほしい予定の場合のみチェックしてください。

⑨LINE通知
公開状態が「公開する」の場合のみ操作可能にする。

□ 公開時にLINEグループへ通知する

チェックを入れた場合、登録済み通知先を表示する。

送信先

□ 保護者グループ
□ コーチと役員グループ
□ コーチグループ

初期値は通知なし。
固定練習の大量登録で誤通知しないため、毎回管理者が明示的に選択する。

⑩保存・キャンセル
画面最下部にボタンを配置する。

［キャンセル］
［保存する］

LINE通知を選択している場合、公開前に確認モーダルを表示する。

「イベントを公開し、選択したLINEグループへ通知しますか？」

作成ページではフッターを非表示にする。





７-7（管理者用）イベント編集ページ
/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit
【機能要件】
新規作成ページと基本構成は共通。
1. ページ名
管理者用イベント編集ページ
2. URL

/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit

3. 利用可能な役割
ACTIVE状態のOWNER・COACH・OFFICER。
4. 表示条件
* 所属クラブのイベント
* 公開・下書きを問わない
* 存在する eventId
5. 取得データ
* ClubEvent
* ClubLineTarget
* ログイン中の ClubMembership
6. 表示内容
* 現在の登録内容
* 現在の公開状態
* 現在のPDF
* 最終公開日時
* LINE通知日時
* 更新内容を未読へ戻す設定
* 更新内容をLINE通知する設定
* 作成者
* 最終更新者
7. 操作
* 更新保存
* 公開
* 下書きへ戻す
* PDF差し替え
* PDF削除
* 今回の更新を未読として再表示
* 今回の更新をLINE通知
* 削除
* キャンセル
8. 権限制御
* MEMBERはアクセス不可
* 他クラブイベントは編集不可
* Server Actionで再確認
* 削除は確認モーダルを必須とする
9. 既読処理
「この更新を利用者へ未読として再表示」がONの場合：

readRequiredAt = 現在日時

OFFの場合は変更しない。
10. 空状態
イベントが存在しない場合はnotFound表示。
11. エラー表示
入力値を保持してエラーを表示する。

【画面レイアウト構成】
目次：

①ヘッダー
③基本情報
④日時・場所
⑤詳細内容
⑥PDF添付
⑦公開対象
⑧公開状態
⑨LINE通知
・利用者へ未読として公開する設定
⑩保存・キャンセル
⑪削除エリア

①ヘッダー
中央に「イベント編集」という見出しをつける
見出しの左側に戻るボタン（←）を配置し、押すと（管理者用）月別イベント一覧ページもしくは（管理者用）日別イベント一覧ページへ戻る（つまり元いた場所に戻る）。
入力中に戻る場合は、未保存内容があるときだけ確認モーダルを表示する。
入力内容は保存されていません。
このページを離れますか？

見出しの下に
作成者： 山田 太郎
最終更新者： 佐藤 次郎
現在の状態：公開中
最終公開：2026年7月1日 10:00
LINE通知状況：

保護者グループ
送信済み：2026年7月1日 10:05

コーチグループ
送信失敗：2026年7月1日 10:05
エラー：LINE公式アカウントがグループから退出している可能性があります。

役員グループ
送信済み：2026年7月1日 10:05
を表示する（ライン通知なしの場合は項目ごとなしにする）


③基本情報
枠線付きセクション内に以下を配置し、既存値を各入力欄へ初期表示する。

タイトル
ジャンル

タイトルは２行入力欄。
ジャンルはプルダウン式で選択できるようにする。
選択肢は以下の通り
enum ClubEventGenre {
  PRACTICE　//練習
  PRACTICE_GAME　//練習試合
  TOURNAMENT //大会
  CAMP　//合宿
  HOLIDAY　//休み
  OTHER　//その他
}

④日時・集合情報・場所

既存値を各入力欄へ初期表示する。

入力項目：

□ 終日イベント

開催日
開始時間
終了日
終了時間
開催場所

集合日
集合時間
集合場所

isAllDay = true の場合は、終日イベントにチェックを入れ、開始時間・終了時間は非表示または入力不可にする。

meetingAt が存在する場合は、集合日・集合時間に分解して初期表示する。
meetingLocation が存在する場合は、集合場所に初期表示する。

集合場所が未入力の場合は、表示の際に集合場所という項目自体を消す。
⑤詳細内容
既存値を各入力欄へ初期表示する。
入力項目：

本文
持ち物
注意事項

すべて複数行入力欄とする。
本文、持ち物と注意事項は任意。

⑥PDF添付
ファイル選択欄を表示する。
既存値をプレビュー画像で初期表示する。

関連PDF
［ファイルを置き換える］

選択後はファイル名と容量、を表示する。

大会要項.pdf
1.8MB

［選択を解除］

許可形式と最大容量を説明する。

プレビュー欄を設け既存値のプレビューを表示する。
その下に［ファイルを削除］（既存のPDFを完全に消去し、添付なしにする）を設ける

⑦公開対象
既存値を各入力欄へ初期表示する。
チェックボックス形式で表示する。

公開対象

☑ オーナー
□ コーチ
□ 役員
□ 会員

オーナーは常に公開対象に含まれます。
このチェックは解除できません。

1つ以上選択必須。
全員へ公開する補助ボタンを設ける。

［すべて選択］




⑧公開状態
既存値を各入力欄へ初期表示する。
次の選択肢を表示する。

○ 下書きとして保存
○ 公開する

※公開するの場合のみ以下のチェック欄を表示
既読管理
□ この更新を利用者へ未読として再表示する
補足：集合時間・場所・持ち物など、利用者に再確認してほしい変更がある場合のみチェックしてください。
誤字修正などの軽微な変更ではチェック不要です。

⑨LINE通知
既存値を各入力欄へ初期表示する。
公開状態が「公開する」の場合のみ操作可能にする。

□ 公開時にLINEグループへ通知する

チェックを入れた場合、登録済み通知先を表示する。

送信先

□ 保護者グループ
□ コーチと役員グループ
□ コーチグループ

固定練習の大量登録で誤通知しないため、毎回管理者が明示的に選択する。

⑩保存・キャンセル
画面最下部にボタンを配置する。

［キャンセル］
［変更を保存する］

LINE通知を選択している場合、公開前に確認モーダルを表示する。

「イベントを公開し、選択したLINEグループへ通知しますか？」

作成ページではフッターを非表示にする。

※LINE通知ONの場合

選択された通知先グループごとに ClubLineDelivery を作成する。

送信前：
status = PENDING

LINE送信成功：
status = SENT
sentAt = 現在日時

LINE送信失敗：
status = FAILED
errorCode = エラーコード
errorDetail = エラー詳細

イベント・お知らせ本体には lastLineNotifiedAt を保存しない。
通知状況は ClubLineDelivery から集計して表示する。

⑪削除エリア
ページ最下部に、他の入力エリアと明確に分けた危険操作セクションを表示する。

このイベントを完全に削除します。
関連する個人メモや既読記録も削除されます。

［イベントを削除する］

削除ボタンは赤系の枠線と文字にする。
押した場合は確認モーダルを表示する。








７-8（会員用）お知らせ一覧ページ
/(club-app)/club/[clubSlug]/notice
【機能要件】
1. ページ名
会員用お知らせ一覧ページ
2. URL

/(club-app)/club/[clubSlug]/notice

3. 利用可能な役割
ACTIVE状態のOWNER・COACH・OFFICER・MEMBER。
4. 表示条件
* 所属クラブのお知らせ
* status が PUBLISHED
* role が targetRoles に含まれる
* 固定表示を優先
* その後、公開日時または更新日時の新しい順
5. 取得データ
* ClubNotice
* ClubNoticeRead
* ログイン中の ClubMembership
6. 表示内容
* 検索ボックス
* ジャンル絞り込みプルダウンタブ
* お知らせカード一覧
* ジャンルバッジ
* 重要表示
* 未読表示
* タイトル
* 公開日・更新日
* PDF添付マーク
7. 操作
* お知らせ詳細へ移動
* ジャンルによる絞り込み
* 一覧の縦スクロール
* 検索ボックスでのワード検索
8. 権限制御
* 権限外のお知らせは取得しない
* 下書きは取得しない
* 他クラブデータは取得しない
9. 既読処理
一覧表示では既読にしない。
詳細ページを正常に開いた時点で既読にする。
10. 空状態

現在、お知らせはありません。

11. エラー表示

お知らせを取得できませんでした。

【画面レイアウト構成】

①ヘッダー
②ジャンル絞り込み
③重要なお知らせ
④通常のお知らせ一覧
⑤フッター


【画面レイアウト構成】
目次：

①ヘッダー
②検索ボックス
③ジャンル絞り込み
④重要なお知らせ
⑤通常のお知らせ一覧
⑥空状態・追加読み込み
⑦フッター

①ヘッダー
「お知らせ一覧」という見出しをを中央に表示

上下を区切り線で囲む。
未読件数がある場合は見出しの右横に表示。


②検索ボックス
ヘッダーの下に検索ボックスを設ける。


③ジャンル絞り込み
検索ボックスの下にプルダウンタブで絞り込み選択ボタンを配置する。

すべて（デフォルト）
重要
予定変更
大会・合宿
会計・手続き
その他


選択中ジャンルを表示する。

④重要なお知らせ
isPinned = true のお知らせがある場合のみ表示する。
見出し：

黒縁の黄色で「重要」て書かれたバッジをカードにつける。



⑤通常のお知らせ一覧
カードを新しい順に縦に並べる。
カードには次を表示する。

【1行目（最優先：メタ情報）】
* 左端： 重要バッジ（重要なお知らせであれば表示） ＋ ジャンルバッジ
* ※タイトルを読む前に「自分の子供に関係があるか」「急ぎか」を判断させます。
【2行目（主役：内容）】
* 全体：タイトル（太字で大きく、スマホの横幅いっぱいに使えるようにする）
【3行目（補足：添付と日付）】
* 左端：PDF添付マーク（PDF添付があれば表示）＋更新日（「今日・昨日は相対表記（〇時間前、昨日）、それ以前は日付（月/日）」というハイブリッド方式）＋🔴未読（未読の場合）

カード全体をタップ可能にし、詳細ページへ遷移する。

⑥空状態・追加読み込み
お知らせがない場合：

現在、お知らせはありません。

件数が多い場合は、１０件ごとに「もっと見る」を表示する。

⑦フッター

イベント
お知らせ
マイページ

お知らせを選択状態にする。

※


７-9（会員用）お知らせ詳細ページ
/(club-app)/club/[clubSlug]/notice/[noticeId]
【機能要件】
1. ページ名
会員用お知らせ詳細ページ
2. URL

/(club-app)/club/[clubSlug]/notice/[noticeId]

3. 利用可能な役割
ACTIVE状態のOWNER・COACH・OFFICER・MEMBER。
4. 表示条件
* 所属クラブ
* PUBLISHED
* targetRolesに現在のroleを含む
* 存在する noticeId
5. 取得データ
* ClubNotice
* ClubNoticeRead
* ログイン中の ClubMembership
6. 表示内容
* ジャンル
* 重要表示
* タイトル
* 本文
* 公開日時
* 更新日時
* PDFリンク
7. 操作
* お知らせ一覧へ戻る
* PDFを開く
* 関連リンクを開く
8. 権限制御
* 権限外のお知らせは表示しない
* 他クラブお知らせは表示しない
9. 既読処理
ページ表示成功時に ClubNoticeRead をupsertする。
10. 空状態
該当お知らせがない場合はnotFound表示。
11. エラー表示

お知らせを表示できませんでした。


【画面レイアウト構成】
目次：

①ヘッダー
②ジャンル・重要表示
③タイトル、本文
④公開・更新日時
⑥添付PDF
⑦一覧へ戻るリンク
⑧フッター

【ヘッダー】
左端に戻るボタン（←）＋中央に見出し「お知らせ詳細」
【２行目（最優先：メタ情報）】
左端： 重要バッジ ＋ ジャンルバッジ※タイトルを読む前に「自分の子供に関係があるか」「急ぎか」を判断させます。
【３行目（主役：内容）】
全体：タイトル（太字で大きく、スマホの横幅いっぱいに使えるようにする）＋本文
【本文下】
添付資料

大会要項.pdf
1.8MB
［PDFを開く］
PDFボタンを押すと、別タブまたは端末のPDFビューアで開く。 PDFがない場合は、このセクション自体を表示しない。

複数添付の場合
添付資料

大会要項.pdf
1.8MB
［PDFを開く］

駐車場案内.pdf
820KB
［PDFを開く］



【PDFの下】
最終更新情報 お知らせ情報の最後に、最終更新日時と公開日時を小さめの文字で表示する。 最終更新：2026年7月10日 18:30 公開：2026年6月21日 17:30
【戻るボタン】
一覧へ戻るボタンを押した場合、原則として直前に表示していたお知らせ一覧へ戻る。


フッター
お知らせを選択状態にする。


※

７-10（管理者用）お知らせ一覧ページ
/(club-app)/club/[clubSlug]/admin/notice
【機能要件】
1. ページ名
管理者用お知らせ一覧ページ
2. URL

/(club-app)/club/[clubSlug]/admin/notice?status=ALL

3. 利用可能な役割
ACTIVE状態のOWNER・COACH・OFFICER。
4. 表示条件
* 所属クラブ
* 公開・下書きの両方
* ステータスタブによる絞り込み
5. 取得データ
* ClubNotice
* ログイン中の ClubMembership
6. 表示内容
* 新規作成ボタン
* 全て・公開中・下書きタブ
* お知らせ管理カード
* ジャンルバッジ
* 公開状態バッジ
* 重要表示
* 編集・削除ボタン
7. 操作
* 新規作成
* タブ切替
* 編集
* 削除
* 会員画面で確認
* 重要表示の確認
8. 権限制御
* MEMBERはアクセス不可
* Server Actionでも管理権限を確認
* 他クラブのお知らせは操作不可
9. 既読処理
管理一覧では既読処理を行わない。
10. 空状態

該当するお知らせはありません。

11. エラー表示

お知らせを取得できませんでした。

【画面レイアウト構成】
目次：

①ヘッダー
②ページタイトル
③新規作成ボタン
④公開状態タブ
⑤お知らせ管理カード一覧
⑥会員画面確認リンク
⑦フッター

①ヘッダー
左端にマイページへ戻るボタン。
中央にページタイトル

（管理）お知らせ一覧

補足：

お知らせの作成、編集、公開状態の変更を行います。


③新規作成ボタン

［＋ 新しいお知らせを作成］

目立つ位置に配置する。

④公開状態タブ

全て
公開中
下書き

各件数を表示してもよい。

お知らせ管理カード一覧
isPinned = true を先頭に表示し、その後 updatedAt の新しい順で表示する。
各カードには次を表示する。
【１行目】公開状態バッジ＋重要バッジ＋ジャンルバッジ
【２行目】お知らせのタイトル
【３行目】👥公開対象＋PDF添付マーク＋更新日

カード左端に操作ボタン （(∨ シェブロン):「編集」、「削除」［会員画面で確認］が選択できる）を配置する。

［編集］
［削除］
［会員画面で確認］

下書きの場合は「会員画面で確認」を表示しない。
削除を押した場合は確認モーダルを表示する。

「○○」を完全に削除しますか？
削除したお知らせと関連データは元に戻せません。

［キャンセル］
［削除する］

［会員画面で確認］を押したら（会員用）お知らせ詳細ページに遷移する


⑧フッター

イベント
お知らせ
マイページ

お知らせを選択状態にする。


７-11（管理者用）お知らせ新規作成ページ
/(club-app)/club/[clubSlug]/admin/notice/new
【機能要件】
1. ページ名
管理者用お知らせ新規作成ページ
2. URL

/(club-app)/club/[clubSlug]/admin/notice/new

3. 利用可能な役割
ACTIVE状態のOWNER・COACH・OFFICER。
4. 表示条件
管理権限を持つ所属者のみ。
5. 取得データ
* ClubLineTarget
* ログイン中の ClubMembership
6. 表示内容
入力項目：
* タイトル
* ジャンル
* 本文
* PDF
* 重要表示
* 公開対象ロール
* 公開状態
* LINE通知有無
* LINE通知先
7. 操作
* 下書き保存
* 公開
* 公開と同時にLINE通知
* PDF選択
* キャンセル
8. 権限制御
* MEMBERはアクセス不可
* clubIdをフォーム値から決定しない
* 公開対象を1件以上必須とする
9. 既読処理
公開時：

firstPublishedAt = 現在日時
readRequiredAt = 現在日時
LINE送信成功時：
選択された通知先グループごとに ClubLineDelivery を作成する。

送信前：
status = PENDING

LINE送信成功：
status = SENT
sentAt = 現在日時

LINE送信失敗：
status = FAILED
errorCode = エラーコード
errorDetail = エラー詳細

イベント・お知らせ本体には lastLineNotifiedAt を保存しない。
通知状況は ClubLineDelivery から集計して表示する。

10. 空状態
該当なし。
11. エラー表示
入力値を保持して表示。

タイトルを入力してください。
本文を入力してください。
公開対象を選択してください。
お知らせを保存できませんでした。


【画面レイアウト構成】
目次：

①ヘッダー
③基本情報
⑤詳細内容
⑥PDF添付
⑦公開対象
⑧公開状態
⑨LINE通知
・利用者へ未読として公開する設定
⑩保存・キャンセル

①ヘッダー
中央に「お知らせ新規作成」という見出しをつける
見出しの左側に戻るボタン（←）を配置し、押すと（（管理者用）お知らせ一覧ページへ戻る（つまり元いた場所に戻る）。
入力中に戻る場合は、未保存内容があるときだけ確認モーダルを表示する。
入力内容は保存されていません。
このページを離れますか？


③基本情報
枠線付きセクション内に以下を配置する。

タイトル
ジャンル

タイトルは２行入力欄。
ジャンルはプルダウン式で選択できるようにする。
選択肢は以下の通り
重要
予定変更
大会・試合・合宿
会計・手続き
その他


④本文
複数行入力欄を配置する。
本文は必須とする。


⑥PDF添付
ファイル選択欄を表示する。

関連PDF
［ファイルを選択］

選択後はファイル名と容量を表示する。

大会要項.pdf
1.8MB

［選択を解除］

許可形式と最大容量を説明する。

⑥重要表示

□ 重要なお知らせとして表示する

ジャンルがIMPORTANTでも、isPinnedとは別に扱う。


⑦公開対象
チェックボックス形式で表示する。

公開対象

☑ オーナー
□ コーチ
□ 役員
□ 会員

オーナーは常に公開対象に含まれます。
このチェックは解除できません。

1つ以上選択必須。
全員へ公開する補助ボタンを設ける。

［すべて選択］





⑧公開状態
次の選択肢を表示する。

○ 下書きとして保存
○ 公開する

初期値は下書きにする。

⑨LINE通知
公開状態が「公開する」の場合のみ操作可能にする。

□ 公開時にLINEグループへ通知する

チェックを入れた場合、登録済み通知先を表示する。

送信先

□ 保護者グループ
□ コーチと役員グループ
□ コーチグループ

初期値は通知なし。
固定練習の大量登録で誤通知しないため、毎回管理者が明示的に選択する。

⑩保存・キャンセル
画面最下部にボタンを配置する。

［キャンセル］
［保存する］

LINE通知を選択している場合、公開前に確認モーダルを表示する。

「お知らせを公開し、選択したLINEグループへ通知しますか？」

作成ページではフッターを非表示にする。


７-12（管理者用）お知らせ編集ページ
/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit
【機能要件】
1. ページ名
管理者用お知らせ編集ページ
2. URL

/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit

3. 利用可能な役割
ACTIVE状態のOWNER・COACH・OFFICER。
4. 表示条件
所属クラブの既存お知らせ。
5. 取得データ
* ClubNotice
* ClubLineTarget
* ログイン中の ClubMembership
6. 表示内容
* 現在の登録内容
* 公開状態
* PDF
* 最終公開日時
* LINE通知日時
* 未読へ戻す設定
* LINE通知設定
* 作成者
* 最終更新者
7. 操作
* 更新
* 公開
* 下書きへ戻す
* PDF差し替え
* PDF削除
* 重要表示変更
* 未読へ再設定
* LINE通知
* 削除
* キャンセル
8. 権限制御
* MEMBERはアクセス不可
* 他クラブのお知らせは編集不可
* 削除時は確認モーダルを表示
9. 既読処理
「利用者へ未読として再表示」がONの場合のみ、readRequiredAtを更新。
オフの場合、何もしない。
10. 空状態
該当お知らせがない場合はnotFound。
11. エラー表示
入力値を保持してエラー表示。


【画面レイアウト構成】
目次：

①ヘッダー
③基本情報
⑤詳細内容
⑥PDF添付
⑦公開対象
⑧公開状態
⑨LINE通知
・利用者へ未読として公開する設定
⑩保存・キャンセル
⑪削除エリア

①ヘッダー
中央に「お知らせ編集」という見出しをつける
見出しの左側に戻るボタン（←）を配置し、押すと（管理者用）お知らせ一覧ページへ戻る（つまり元いた場所に戻る）。
入力中に戻る場合は、未保存内容があるときだけ確認モーダルを表示する。
入力内容は保存されていません。
このページを離れますか？

見出しの下に
作成者： 山田 太郎
最終更新者： 佐藤 次郎
現在の状態：公開中
最終公開：2026年7月1日 10:00
LINE通知状況：

保護者グループ
送信済み：2026年7月1日 10:05

コーチグループ
送信失敗：2026年7月1日 10:05
エラー：LINE公式アカウントがグループから退出している可能性があります。

役員グループ
送信済み：2026年7月1日 10:05
を表示する（ライン通知なしの場合は項目ごとなしにする）


③基本情報
枠線付きセクション内に以下を配置し、既存値を各入力欄へ初期表示する。

タイトル
ジャンル

タイトルは２行入力欄。
ジャンルはプルダウン式で選択できるようにする。
選択肢は以下の通り
重要
予定変更
大会・試合・合宿
会計・手続き
その他

④本文
既存値を各入力欄へ初期表示する。


⑥PDF添付
ファイル選択欄を表示する。
既存値をプレビュー画像で初期表示する。

関連PDF
［ファイルを置き換える］

選択後はファイル名と容量、を表示する。

大会要項.pdf
1.8MB

［選択を解除］

許可形式と最大容量を説明する。

プレビュー欄を設け既存値のプレビューを表示する。
その下に［ファイルを削除］（既存のPDFを完全に消去し、添付なしにする）を設ける


⑥重要表示

□ 重要なお知らせとして表示する

ジャンルがIMPORTANTでも、isPinnedとは別に扱う。

⑦公開対象
既存値を各入力欄へ初期表示する。
チェックボックス形式で表示する。

公開対象

☑ オーナー
□ コーチ
□ 役員
□ 会員

オーナーは常に公開対象に含まれます。
このチェックは解除できません。

1つ以上選択必須。
全員へ公開する補助ボタンを設ける。

［すべて選択］



⑧公開状態
既存値を各入力欄へ初期表示する。
次の選択肢を表示する。

○ 下書きとして保存
○ 公開する

※公開するの場合のみ以下のチェック欄を表示
既読管理
□ この更新を利用者へ未読として再表示する


⑨LINE通知
既存値を各入力欄へ初期表示する。
公開状態が「公開する」の場合のみ操作可能にする。

□ 公開時にLINEグループへ通知する

チェックを入れた場合、登録済み通知先を表示する。

送信先

□ 保護者グループ
□ コーチと役員グループ
□ コーチグループ

固定練習の大量登録で誤通知しないため、毎回管理者が明示的に選択する。

⑩保存・キャンセル
画面最下部にボタンを配置する。

［キャンセル］
［変更を保存する］

LINE通知を選択している場合、公開前に確認モーダルを表示する。

「お知らせを公開し、選択したLINEグループへ通知しますか？」

作成ページではフッターを非表示にする。

※LINE通知ONの場合

選択された通知先グループごとに ClubLineDelivery を作成する。

送信前：
status = PENDING

LINE送信成功：
status = SENT
sentAt = 現在日時

LINE送信失敗：
status = FAILED
errorCode = エラーコード
errorDetail = エラー詳細

イベント・お知らせ本体には lastLineNotifiedAt を保存しない。
通知状況は ClubLineDelivery から集計して表示する。

⑪削除エリア
ページ最下部に、他の入力エリアと明確に分けた危険操作セクションを表示する。

このお知らせを完全に削除します。
関連する既読記録も削除されます。

［お知らせを削除する］

削除ボタンは赤系の枠線と文字にする。
押した場合は確認モーダルを表示する。


７-13（会員・管理者共通）マイページ
/(club-app)/club/[clubSlug]/account
【機能要件】
1. ページ名
マイページ
2. URL

/(club-app)/club/[clubSlug]/account

3. 利用可能な役割
ACTIVE状態のOWNER・COACH・OFFICER・MEMBER。
4. 表示条件
ログイン中の利用者本人の情報。
5. 取得データ
* AppUser
* ClubMembership
* Child
* ChildClubMembership
* Club
* 権限に応じて管理機能へのリンク
* *不具合報告送信用のログイン中ClubMembership
6. 表示内容
* アカウント情報
* 氏名
* メールアドレス
* 所属クラブ
* 所属する子どもの氏名・学年
* サポート・規約
* 関連リンク
* 管理機能
* ログアウト
管理権限者（オーナー、コーチ、オフィサー）のみ：管理機能

イベント管理
お知らせ管理

OWNERのみ：

LINE通知グループ管理
メンバー

PlatformAdminのみ：
不具合一覧

複数クラブ所属者：
所属クラブ切り替えボタン
※ACTIVE Membershipが2件以上の場合のみ表示

7. 操作
* 各セクションへのページ内スクロール
* アカウント情報確認
* HPを開く
* Instagramを開く
* 利用規約を開く
* プライバシーポリシーを開く
* 不具合報告
* 管理画面へ移動
* ログアウト
8. 権限制御
* MEMBERには管理セクションを表示しない
* COACH・OFFICERにはイベント・お知らせ管理のみ表示
* OWNERには全管理項目を表示
9. 既読処理
なし。
10. 空状態
子どもが登録されていない場合：

所属するお子さまは登録されていません。

InstagramやHPが未設定なら該当リンクを表示しない。
11. エラー表示

アカウント情報を取得できませんでした。

【画面レイアウト構成】
７-13（会員・管理者共通）マイページ （/(club-app)/club/[clubSlug]/account）（管理者権限でイベント・お知らせ管理（イベント管理、お知らせ管理）を表示して管理者ページに遷移する項目をつける）
1. マイページのレイアウト構成（ファーストビュー）ヘッダー（マイページと中央に書かれている）のすぐ下に、長方形のボタンを等間隔に配置したメニュー（ナビゲーション）を設置します。画面サイズ（デバイス）によって、以下のようにボタンの並び順（レイアウト）が切り替わる仕様とします。 * スマホ閲覧時：押しやすさと視認性を最優先し、横３列× 縦３段（メンバーは縦１段）（コーチとオーナーは縦２段）（開発者は縦３段）で綺麗に並べる。イベント・お知らせ管理は管理者のみ表示する。* PC閲覧時：画面の大きさに合わせ、横一列（横6列）などに自動で並び順が変わる（レスポンシブデザイン）。 各長方形の中には「設定」、「サポート」、「通知設定（オーナーのみ）」「メンバー（オーナーのみ）」「リンク」「イベント・お知らせ管理（※管理者：メンバー以外）」「不具合一覧（開発者のみ）」「クラブ切替（複数クラブ所属者）」の文字と、その下に横棒線がありその下にスクロールを促す下矢印記号シェブロン（∨）を配置する。なお、下のアカウント設定とは横線で区切られています。 2. ページ内リンク（スムーススクロール）機能 ユーザーがその長方形ボタンをクリックすると、画面が滑らかにスクロール（スムーススクロール）し、マイページ内にある該当のコンテンツエリア（セクション）まで自動で移動します。右下には常に「🔼ページ上部へ」のボタンがありそれを押すとページ一番上に行くようにする。
2.各項目
以下の各項目の見出しの下に項目が並んでいる。通知設定とメンバーはOWNERのみ表示、イベント・お知らせ管理はOWNER,COACH,OFFIERのみ表示、他の項目はログインできる全ての役職で見られる。
・アカウント設定（氏名、メールアドレス、所属する子どもの名前、学年というタイトルの下に入力ボックスがあり入力その下に保存ボタンがある（メールアドレスは編集不可。学年はYOUJI // 幼児、 ELEMENTARY_1、ELEMENTARY_2、ELEMENTARY_3、ELEMENTARY_4、ELEMENTARY_5、ELEMENTARY_6から選択できる）。保存ボタンを押すと保存しますかというモーダルが出てきて保存するを押すと保存される）
・通知設定（オーナーのみ）を押すと７-14（OWNER用）LINE通知グループ管理ページ（/(club-app)/club/[clubSlug]/admin/settings/line）へ遷移する。
・サポート・規約

利用規約
プライバシーポリシー
ヘルプ・不具合報告

ヘルプ・不具合報告には、以下を入力できる。

入力項目：

種別
○ 不具合
○ 質問
○ 改善要望
○ その他

内容
複数行入力欄。
できるだけ具体的に記入してもらう。

補足文：
どの画面で、何をしたときに、どのような問題が起きたかを書いてください。
パスワードや個人情報は入力しないでください。

送信時に自動で保存する情報：

・ログイン中のClubMembership.id
・クラブID
・氏名
・メールアドレス
・権限
・報告直前のページURL
・端末、ブラウザ情報 userAgent

送信成功時：

「不具合報告を受け付けました。開発チームにて確認し、サービスの改善に役立てさせていただきます。ご協力ありがとうございます。」

というトースト通知を表示する。

送信失敗時：

「送信できませんでした。時間をおいてもう一度お試しください。」

と表示する。
・メンバーについては、メンバー管理・設定画面へいうリンクがあり、それを押すと、/club/[clubSlug]/admin/membersへ遷移する。
・関連リンク（公式HP、公式Instagramのリンクが書かれてある）
・各種管理（イベント・お知らせ管理という見出しの下に「イベント管理」「お知らせ管理」という二つが並んでおり、それぞれ７-4（管理者用）イベント一覧ページ（/(club-app)/club/[clubSlug]/admin/events）と７-10（管理者用）お知らせ一覧ページ（/(club-app)/club/[clubSlug]/admin/notice）へ遷移する。

・不具合一覧：開発者のみ表示（7-22 不具合送信管理ページ（/(club-app)/platform/support）へ遷移する）

・クラブ切替：ACTIVE Membershipが2件以上の場合のみ表示。（club-app）/club/selectへ遷移する。

・ログアウトボタン（ログアウトしますかというモーダルが出てきてログアウトするというボタンを押すとログアウトする）
ログアウトだけはページ内ナビゲーションに含めず、最下部へ独立表示する。



※不具合報告を送信したとき

1. requireActiveClubMembership(clubSlug) を実行する。

2. 入力された message を trim する。

3. message が空の場合はエラーにする。

4. message が長すぎる場合はエラーにする。
   目安は2000文字以内とする。

5. pageUrl はそのまま信用せず、同一アプリ内のURLか確認する。
   招待トークン、パスワード再設定トークンなど、秘密情報を含む可能性のあるqueryは保存しない。

6. userAgent を取得する。

7. SupportReport を作成する。

8. 運営者宛にメール通知を送る。

9. メール通知に成功した場合は notifiedAt を保存する。

10. メール通知に失敗した場合は notifyError に保存する、またはログに残す。
    ただし、SupportReportの作成に成功していれば、利用者には受付完了として表示する。

11. 画面に「不具合報告を受け付けました。開発チームにて確認し、サービスの改善に役立てさせていただきます。ご協力ありがとうございます。」と表示する。


７-14（OWNER用）LINE通知グループ管理ページ
/(club-app)/club/[clubSlug]/admin/settings/line
権限上はOWNER専用とするのがおすすめです。
【機能要件】
1. ページ名
LINE通知グループ管理ページ
2. URL

/(club-app)/club/[clubSlug]/admin/settings/line

3. 利用可能な役割
ACTIVE状態のOWNERのみ。
4. 表示条件
所属クラブのLINE設定と通知先のみ。
5. 取得データ
* ClubLineSetting
* ClubLineTarget
* ClubLineRegistrationToken
* ログイン中の ClubMembership
6. 表示内容
* Messaging API設定状態
* 登録済み通知グループ一覧
* 通知先名
* 対象ロール
* 有効・無効
* 登録日時
* 新しいグループ登録ボタン
* 登録手順
* 接続テストボタン
7. 操作
* 登録コード発行
* 通知先名の編集
* 対象ロールの変更
* 有効・無効切替
* テスト通知
* 通知先削除
8. 権限制御
* OWNER以外はアクセス不可
* トークンやアクセストークンの平文を画面表示しない
* 他クラブのLINE設定は取得・操作不可
* Server ActionでもOWNER権限を確認
9. 既読処理
なし。
10. 空状態

LINE通知グループはまだ登録されていません。

11. エラー表示

LINE設定を取得できませんでした。
登録コードを発行できませんでした。
テスト通知を送信できませんでした。

【画面レイアウト構成】
①ヘッダー
左端にマイページへ戻るボタンを配置する。
中央にページタイトル「LINE通知グループ管理」を表示。
その下に説明：「イベントやお知らせを通知するLINEグループを管理します。」を表示する。

③Messaging API接続状態
カード形式で接続状態を表示する。

Messaging API
接続済み

未設定の場合：

Messaging APIが設定されていません。

アクセストークンそのものは表示しない。

④登録済みグループ一覧
見出し：

登録済み通知先

カード例：

保護者グループ

通知対象
役員・会員

状態
有効

［編集］
［テスト通知］
［削除］

グループIDは原則として画面に表示しない。
必要なら末尾数文字だけ表示する。
状態が「有効」になってから利用開始すること（デフォルトはfalse）

・LINE通知先は原則として物理削除しない
・使わない通知先は isEnabled = false にする
・画面上は「削除」ではなく「無効化」にするのが安全
・どうしても削除ボタンを置くなら、送信履歴がある通知先は削除不可にする

テスト通知成功時は、「テスト通知を送信しました。対象のLINEグループにメッセージが届いているかご確認ください。」
テスト通知失敗時は、「テスト通知の送信に失敗しました。公式アカウントがグループに正しく参加しているかご確認ください。」
のトーストを表示する

⑤グループ編集
編集ボタンを押すとモーダルまたは専用フォームを表示する。
入力項目：

通知先名
［保護者グループ］

通知対象
□ コーチ
□ 役員
□ 会員

有効状態（補足：無効にしたら通知なしになります）
□ この通知先を使用する

保存：

［保存する］


⑥新規グループ登録

［＋ 新しいグループを登録］

押すと有効期限付き登録コードを発行する。
例：

登録コード

ARAO-482913

有効期限：10分
［コードをコピー］

使用済みまたは期限切れになったら無効化する。

⑦登録手順
番号付きで表示する。

1. 登録コードを発行します
2. 公式LINEアカウントを対象グループへ招待します
3. グループ内で登録コードを送信します（１で発行されたコードをグループ内で送信する）
4. アプリがグループを自動登録します（アプリがコードを読み取りコードを送信したグループIDを自動取得する）（システムがコードを検知して、正しいグループのIDを特定・保存する）
5. 通知先名と通知対象を設定します（登録済みグループ一覧に新たに登録されたカードを編集し設定する）

登録完了後は画面を自動更新する。

⑧注意事項
薄い注意カードに表示する。

・登録コードには有効期限があります。
・LINE公式アカウントをグループから退出させると通知できなくなります。
・1つのLINEグループには、同時に1つのLINE公式アカウントのみ参加できます。
・グループ登録と削除はOWNERだけが操作できます。


⑨フッター
共通フッターを表示する（マイページが選択されている）。

７-15（会員・管理者共通）ログインページ
/(auth)/club-login
【機能要件】
1. ページ名
クラブ関係者ログインページ
2. URL

/(auth)/club-login

実際のURL：

/club-login

3. 利用可能な役割
未ログイン利用者。
ログイン済みの場合は（会員用）月別イベント一覧へリダイレクトする。
4. 表示条件
認証セッションが存在しない場合。
5. 取得データ
基本的にはなし。
必要に応じて：
* Supabase Authセッション
6. 表示内容
* 見出し「クラブ運営アプリ　ログインページ」
* ログイン説明
* メールアドレス
* パスワード
* ログインボタン
* パスワード再設定
* ログインエラー
LIFF認証を採用する場合は：
* LINEでログイン
* LINE連携状態
7. 操作
* メールアドレス・パスワードログイン
* LINEログイン
* パスワード再設定
* 利用規約表示
* プライバシーポリシー表示
ログイン成功時：

/club/[clubSlug]/events#top

へ遷移。
8. 権限制御
* Supabase Authで本人認証
* AppUserが存在すること
* ClubMembership.statusがACTIVEであること
* INVITEDの場合は初回登録画面へ誘導
* SUSPENDED・WITHDRAWNはログイン後のアプリ閲覧を拒否
9. 既読処理
なし。
10. 空状態
該当なし。
11. エラー表示

メールアドレスまたはパスワードが正しくありません。
このアカウントは利用できません。
所属クラブを確認できませんでした。
ログイン処理に失敗しました。

セキュリティ上、メールアドレスの登録有無を詳細に言い分けすぎない。
【画面レイアウト構成】

②アプリ名・説明
③ログインフォーム
④パスワード再設定
⑤LINEログイン
⑥利用規約・プライバシーポリシー

ログイン後、Supabase Authでログインユーザーを取得します。
そのユーザーが所属しているクラブを ClubMembership から取得します。
1クラブだけなら、そのままリダイレクトします。
redirect(`/club/${club.slug}/events`);
複数クラブに所属しているなら、クラブ選択画面へ飛ばします。
redirect("/club/select");


※登録の流れ
1. 管理者の作業：管理画面から「会員のメールアドレス」を登録し、システムから「招待メール（または登録URL）」を自動送信する。この時点で、SupabaseのAuth（認証）と、アプリ用のデータベース（AppUserテーブルなど）に「招待中（INVITED）」の状態でデータが作られます。
2. 会員の作業：届いたメールのURLを開き、会員自身が好きなパスワードを入力して登録を完了させます（これで状態が ACTIVE に変わります）。





７-16（会員・管理者共通）パスワード再設定ページ
/(club-app)/club/[clubSlug]/password
【機能要件】
1. ページ名
パスワード再設定ページ
2. URL

/(club-app)/club/[clubSlug]/password

実際のURL：

/club/[clubSlug]/password

3. 利用可能な役割
ログイン利用者。
4. 表示条件
5. 取得データ
基本的にはなし。
6. 表示内容
* 見出し「パスワード変更」
* 変更説明
* 現在のパスワード
* 新しいパスワード
* 新しいパスワード（確認）
* パスワード変更ボタン
* エラー
7. 操作
* パスワード再設定

8. 権限制御
ページ表示時に requireActiveClubMembership(clubSlug) を実行する。
ACTIVE状態の所属メンバーのみ利用可能とする。
SUSPENDED、WITHDRAWN、未所属ユーザーは利用不可とする。

9. 既読処理
なし。
10. 空状態
該当なし。
11. エラー表示

現在のパスワードが正しくありません。
現在のパスワードと新しいパスワードを入力してください。
このテキストは８文字以上で指定してください。




７-17（オーナー用）メンバー管理・設定ページ
/(club-app)/club/[clubSlug]/admin/members 
1. ページ基本情報
* ページ名: メンバー管理・設定ページ
* URL: /club/[clubSlug]/admin/members
* 利用可能な役割: OWNER（オーナー）
* 表示条件: 認証セッションが存在し、かつログインユーザーの権限が OWNER であること。
* OWNER人数ルール：OWNERは複数人設定可能。ただし、ACTIVE状態のOWNERを0人にする操作は禁止する。

【エラー表示】
最後のOWNERは降格・利用停止・退会扱いにできません。
先に別のメンバーをOWNERに設定してください。
メンバー情報を変更できませんでした。
対象のメンバーが見つかりませんでした。


2. 画面レイアウト構成

① ヘッダー
* 左端: ［マイページへ戻る］ボタンを配置。
* 中央: ページタイトル「メンバー管理・設定」を表示。
* その下: 説明文「クラブ関係者の招待、権限変更、ステータス管理を行います。」を表示。

② メンバー新規招待エリア（最上部またはボタン押下でモーダル表示）
新規メンバーをシステムに招待するためのフォームです。
* 見出し: 新規メンバーを招待
* 入力項目:
    * メールアドレス: [ ]
    * 氏名: [ ]
    * 権限ロール: ( ) 指導者(COACH) ( ) 役員(OFFICER) (●) 会員(MEMBER)
* アクション:
    * ［ 招待メールを送信する ］ ボタン
    * ※招待メール送信時
    * 
    * 新規ユーザーの場合：
    * 
    * 1. Supabase Authで招待用認証リンクを生成する
    * 2. AppUser / ClubMembership / ClubInvitationを作成する
    * 3. Resendを使って招待メールを送信する
    * 4. メールにはSupabase Authの認証リンクを含める
    * 5. 認証成功後、/welcomeへ遷移する
    * 
    * 既存ユーザーの場合：
    * 
    * 1. Supabase Authユーザーは新規作成しない
    * 2. ClubMembership / ClubInvitationを作成する
    * 3. Resendを使ってクラブ参加案内メールを送信する
    * 4. 既存アカウントでログイン後、クラブ招待を承諾する

③ メンバー一覧（カードまたはテーブル形式）
登録・招待済みのメンバー全員をテーブル（表形式）で一覧表示します。横幅に入りきれなければ横にスクロールできるようにする。名前、メールアドレス、権限、ステータス、操作を項目とし、その下に一覧として表示する
* 見出し: 登録メンバー一覧
* 表示項目（1名分の例）:text  山田 太郎 （yamada@example.com）
* 
* 権限ロール: 会員(MEMBER)
* ステータス: 招待中(INVITED)  ※ACTIVE、SUSPENDEDなどの状態を表示
* 
* 下向きシェブロンを押すと［ 権限・状態を変更 ］ ［ 招待取り消し ］（INVITED状態のみ表示）  招待取り消しを押すとモーダルで取り消し確認が表示される。
* 操作表示：
* 
* INVITED状態：
* ［権限・状態を変更］
* ［招待取消］
* 
* ACTIVE状態：
* ［権限・状態を変更］
* 
* SUSPENDED状態：
* ［権限・状態を変更］
* 
* WITHDRAWN状態：
* ［権限・状態を変更］
* 
* ACTIVE / SUSPENDED / WITHDRAWN のメンバーには「削除」ボタンを表示しない。
* 退会扱い・利用停止は、権限・状態変更モーダルから行う。 
※招待取消ルール

招待取消は、ClubMembership.status = INVITED のメンバーにのみ表示する。

招待取消を行うと、以下を処理する。

1. 対象のClubMembershipが、ログイン中OWNERと同じclubIdに属していることを確認する
2. 対象のstatusがINVITEDであることを確認する
3. 未承諾のClubInvitationを削除する
4. 対象のClubMembershipを削除する
5. Supabase Authユーザー自体は削除しない
6. AppUserも原則として削除しない

ACTIVE / SUSPENDED / WITHDRAWN のメンバーには招待取消を表示しない。


④ 【モーダル】メンバー編集フォーム
一覧の「［ 権限・状態を変更 ］」ボタンを押した際、ポップアップで表示されるフォームです。
* タイトル: メンバー情報の変更
* 対象者: 山田 太郎
* 変更項目:
    * 権限ロールの変更:
        * プルダウンまたはラジオボタン: 指導者(COACH) / 役員(OFFICER) / 会員(MEMBER) / オーナー(OWNER)
    * ステータス（有効状態）の変更:
        * プルダウン: 招待中(INVITED) / 有効(ACTIVE) / 利用停止(SUSPENDED) / 退会(WITHDRAWN)
* 補足テキスト:
    * 「※利用停止(SUSPENDED)・退会(WITHDRAWN)にすると、該当ユーザーはログイン後のアプリ閲覧ができなくなります。」
    * オーナールール
* ACTIVEなOWNERを0人にすることはできない（常に1人以上必要）。
* 最後の1人のACTIVE OWNERは、以下の操作を不可とする。
* 権限の変更（降格）
* アカウントの停止（利用停止）
* 削除（退会） [1]
* 自分自身が「最後の1人」の場合、自分の権限を変更できない。

* アクション:
    * ［ 変更を保存する ］ ボタン

最後のACTIVE OWNERを編集する場合：

・権限ロールのOWNER以外を非活性にする
・ステータスのSUSPENDED / WITHDRAWNを非活性にする
・保存ボタン付近に注意文を表示する

表示文言：

このメンバーは現在、最後の有効なOWNERです。
先に別のメンバーをOWNERにしてから、権限やステータスを変更してください。

Server Action側でも必ず拒否する

・削除を押したらモーダルで確認される。

※メンバー削除方針

一度ACTIVEになったメンバーは、原則として物理削除しない。
退会・利用停止・削除扱いにしたい場合は、ClubMembership.status を WITHDRAWN または SUSPENDED に変更する。

理由：
過去のイベント・お知らせ・LINE通知・招待履歴・作成者情報を保持するため。

管理画面上の表示は「削除」ではなく、基本的に「退会扱いにする」「利用停止にする」とする。

例外：
INVITED状態で、まだ一度も有効化されていない招待中メンバーは、招待取消として物理削除できるただし、関連するClubInvitationもあわせて処理する。


※OWNER人数・権限譲渡ルール

OWNERは1クラブ内に複数人設定できる。

ただし、ACTIVE状態のOWNERは必ず1人以上必要とする。

ACTIVE状態のOWNERとは、

role = OWNER
かつ
status = ACTIVE

のClubMembershipを指す。

禁止する操作：

・最後のACTIVE OWNERをCOACH / OFFICER / MEMBERへ降格する
・最後のACTIVE OWNERをSUSPENDEDへ変更する
・最後のACTIVE OWNERをWITHDRAWNへ変更する
・最後のACTIVE OWNERである自分自身を降格・利用停止・退会扱いにする

OWNERの譲渡を行う場合は、先に別のメンバーをOWNERかつACTIVEに変更する。
その後、元のOWNERを別ロールへ変更する。

つまり、OWNER譲渡は以下の順番で行う。

1. 新しい管理者をOWNERにする
2. ACTIVE OWNERが2人以上いる状態にする
3. 旧OWNERをCOACH / OFFICER / MEMBERへ変更する、またはWITHDRAWNへ変更する

一時的にでもACTIVE OWNERが0人になる状態は許可しない。


⑤ 注意事項
画面下部に薄い注意カード（Alert）として表示します。
* ・メンバーの招待、削除、および権限の変更は OWNER 権限を持つユーザーのみが実行できます。
* ・招待メールの有効期限は送信から24時間です。期限が切れた場合は一度削除し、再度招待を行ってください。
* 利用停止（SUSPENDED）にされたユーザーは、即座にすべての管理画面・イベント画面にアクセスできなくなります。
* OWNERを別の人へ譲渡したい場合は、先に新しい管理者をOWNERに変更してください。
* ACTIVE状態のOWNERが2人以上になってから、元のOWNERを別ロールまたは退会扱いに変更できます。
* 一時的にでもACTIVE OWNERが0人になる変更はできません。
* Supabase Authユーザー自体はこの画面から削除されません。

⑥ フッター
* 共通フッターを表示。


3. 画面内の操作・裏側の処理フロー

1. 新規招待ボタンを押したとき
1. 新規招待ボタンを押したとき

1. 入力されたメールアドレスを小文字化・trimして正規化する。

2. AppUserテーブルから同じメールアドレスの既存ユーザーを検索する。

3. 既存AppUserが存在しない場合
   - Supabase Authへ招待メールを送信する。
   - 返却されたSupabase Auth user.idをAppUser.idとして保存する。
   - AppUserにemail、nameを保存する。
   - ClubMembershipにclubId、userId、role、status=INVITEDを保存する。
   - ClubInvitationにemail、name、role、tokenHash、expiresAt、invitedByMembershipIdを保存する。

4. 既存AppUserが存在する場合
   - Supabase Authユーザーは新規作成しない。
   - 対象クラブにまだ所属していないことを確認する。
   - ClubMembershipにclubId、既存AppUser.id、role、status=INVITEDを保存する。
   - ClubInvitationにemail、name、role、tokenHash、expiresAt、invitedByMembershipIdを保存する。
   - 既存ユーザー向けにクラブ参加案内メールを送信する。

5. 招待URLから承諾されたら
   - ClubInvitation.acceptedAtを更新する。
   - ClubMembership.statusをACTIVEに更新する。

6. ClubMembershipにはemail、nameを保存しない。
   - email、nameはAppUserに保存する。
   - ClubMembershipはclubId、userId、role、statusを管理する。

※画面上に「招待メールを送信しました。」とトースト通知を表示し、一覧を自動更新する。

※新規ユーザー招待の流れは以下の通り
1. ClubInvitationをPREPARINGで作成
2. Supabase generateLink
3. Auth user.idを取得
4. AppUser・Membershipをtransactionで作成
5. InvitationへmembershipIdを設定
6. READY_TO_SENDへ変更
7. Resend送信
8. 成功 → SENT
9. 失敗 → EMAIL_FAILED
10. OWNERが再送可能

2. 編集モーダルで「変更を保存する」を押したとき

1. requireClubOwner(clubSlug) を実行し、操作しているユーザーがACTIVE状態のOWNERであることを確認する。

2. 対象のClubMembershipを、idとclubIdで取得する。

3. 対象が存在しない場合はエラーにする。

4. 変更後の role / status を計算する。

5. 対象メンバーが現在 ACTIVE OWNER であり、今回の変更で ACTIVE OWNER ではなくなる場合は、同じclubId内に他のACTIVE OWNERが存在するか確認する。

6. 他のACTIVE OWNERが0人の場合、変更を拒否する。

7. 問題なければ、ClubMembershipの role / status を更新する。

8. Supabase Authユーザー自体は削除・変更しない。

9. 画面上に「変更を保存しました。」とトースト通知を表示し、モーダルを閉じて一覧を最新の状態にする。



７-18 初回パスワード設定ページ( /(auth)/welcome)

1. ページ基本情報
* ページ名: 初回パスワード設定ページ
* URL: /(auth)/welcome
    * ※実際のURL： /welcome （招待メールに記載される有効期限付きリンクの遷移先となります）
* 利用可能な役割: 未ログイン利用者（招待メールのリンクからアクセスしたユーザー）。
* 表示条件: 管理者から送信された有効な招待トークン（セッション）をURLパラメーター、またはSupabase Auth経由で保持していること。



2. 画面レイアウト構成

① 見出し・説明
* 見出し: クラブ運営アプリ　アカウント初期設定
* 説明文:「クラブ運営アプリへようこそ！
* セキュリティのため、今後ログインで使用するあなた専用のパスワードを設定してください。」

② パスワード設定フォーム
パスワードを設定するための入力欄です。
* 入力項目:
    * 新しいパスワード: [ ] （非表示入力・目のアイコンで切り替え可能）
    * 新しいパスワード（確認）: [ ]
* 補足テキスト:
    * 「※パスワードは８文字以上で、英数字を含めて設定してください。」
* アクション:
    * ［ パスワードを設定して利用を開始する ］ ボタン

④ 注意事項（薄い注意カード）
* ・この登録リンクの有効期限は送信から24時間です。期限が切れた場合は、クラブの管理者（OWNER）へ再招待を依頼してください。※招待リンクの有効期限を24時間と書くので認証サービス側の実際の設定も24時間に合わせること

⑤ フッター
なし



3. 画面内の操作・裏側の処理フロー

1. ページを開いたとき（初期表示）
【/welcome 初期表示】

1. 利用者はResendから届いた招待メール内の
   「初期設定を開始する」を押す

2. リンク先ではSupabase Authの招待認証が行われる

3. 認証成功後、/welcomeへredirectされる

4. /welcome側でSupabase Authセッションを確認する

5. invitationTokenからClubInvitationを取得する

6. 以下を確認する

   ・tokenHash一致
   ・expiresAt > now
   ・acceptedAt = null
   ・対象Membership.status = INVITED
   ・Supabase Auth userと招待emailが一致

7. 正常な場合のみパスワード設定フォームを表示する


※トークンが「期限切れ」または「無効」な場合は、即座にログインエラー画面、または「招待リンクの期限が切れています。管理者に再発行を依頼してください」というエラーメッセージを表示します。

2. 「利用を開始する」ボタンを押したとき
1. バリデーションチェック:
    * 2つの入力欄が一致しているか。
    * ８文字以上入力されているか。
2. パスワード設定実行:
    * Supabase Authの機能（updateUser）を使い、ユーザーのパスワードを確定させます。
3. ステータス更新（DB処理）:
    * パスワード設定が成功した直後、データベース（ClubMembership テーブルなど）の対象ユーザーのステータス（status）を、INVITED（招待中） から ACTIVE（有効） へ自動的に書き換えます。
4. 自動ログイン＆遷移:
    * 登録完了と同時に自動でログイン状態（セッション確立）とし、次の画面へリダイレクトします。
    * 遷移先: /club/[clubSlug]/events#top （月別イベント一覧ページ）
5. トースト通知:
    * 遷移後の画面で「アカウントの登録が完了しました。アプリをご利用いただけます！」と歓迎メッセージをトースト表示します。



4. エラー表示
* 「パスワードが一致しません。」 （確認用入力が異なる場合）
* 「このテキストは８文字以上で指定してください。」 （文字数不足の場合）
* 「登録処理に失敗しました。時間をおいて再度お試しください。」 （通信エラー等）


７-19 パスワード再設定専用ページ(/(auth)/reset-password)
1. ページ基本情報
* ページ名: パスワード再設定ページ
* URL: /(auth)/reset-password
    * ※実際のURL： /reset-password （紛失時に届く再設定メールに記載された有効期限付きリンクの遷移先となります）
* 利用可能な役割: 未ログイン利用者（パスワード再設定メールのリンクからアクセスしたユーザー）。
* 表示条件: Supabase Authが発行した有効なパスワードリセット用トークン（セッション）を保持していること。



2. 画面レイアウト構成

① 見出し・説明
* 見出し: クラブ運営アプリ　パスワード再設定
* 説明文:「新しいパスワードを設定します。
* 他の人に推測されにくい安全なパスワードを入力してください。」

② パスワード再設定フォーム
* 入力項目:
    * 新しいパスワード: [ ] （非表示入力・目のアイコンで切り替え可能）
    * 新しいパスワード（確認）: [ ]
* 補足テキスト:
    * 「※パスワードは８文字以上で、英数字を含めて設定してください。」
* アクション:
    * ［ パスワードを更新してログインする ］ ボタン

④ 注意事項（薄い注意カード）
* ・この再設定リンクには有効期限があります。期限切れのエラーが表示された場合は、再度ログイン画面の「パスワード再設定」からメールを再発行してください。

⑤ フッター
* なし



3. 画面内の操作・裏側の処理フロー

1. ページを開いたとき（初期表示）
1. URLに含まれるリセットトークンを Supabase Auth が自動で検証します。
2. トークンが「期限切れ」または「無効」な場合は、画面上に「パスワードリセットの有効期限が切れています。ログイン画面から再度手続きを行ってください。」とエラーメッセージを表示し、フォームを非活性（入力不可）にします。

2. 「パスワードを更新してログインする」ボタンを押したとき
1. バリデーションチェック:
    * 2つの入力欄が一致しているか。
    * ８文字以上入力されているか。
2. パスワード更新実行:
    * Supabase Authの機能（updateUser）を使い、新しいパスワードへ上書きします。
3. ステータス制御（DB処理）:
    * データベース（ClubMembership テーブルなど）のステータス（status）は変更しません。（ACTIVE などの現在の状態を維持します）
4. 自動ログイン＆遷移:
    * パスワード更新完了と同時に自動でログイン状態（セッション確立）とし、アプリのトップ画面へリダイレクトします。
    * 遷移先: /club/[clubSlug]/events#top （月別イベント一覧ページ）
5. トースト通知:
    * 遷移後の画面で「パスワードを更新しました。」とトースト表示します。



4. エラー表示
* 「パスワードが一致しません。」 （確認用入力が異なる場合）
* 「このテキストは８文字以上で指定してください。」 （文字数不足の場合）
* 「パスワードの更新に失敗しました。もう一度やり直してください。」 （通信エラーやトークン失効の場合）

7-20 パスワード再設定メール申請ページ(/(auth)/forget-password
)

1. ページ基本情報
* ページ名: パスワード再設定メール申請ページ
* URL: /(auth)/forget-password
    * ※実際のURL： /forget-password
* 利用可能な役割: 未ログイン利用者（パスワードを忘れてログインできないユーザー）。
* 表示条件: なし（ログイン画面の「パスワードを忘れた方はこちら」リンクから誰でもアクセス可能）。



2. 画面レイアウト構成

① 見出し・説明
* 見出し: クラブ運営アプリ　パスワード再設定の申請
* 説明文:「登録しているメールアドレスを入力してください。
* パスワードを再設定するための専用リンクをメールでお送りします。」

② メールアドレス入力フォーム
* 入力項目:
    * メールアドレス: [ ] （type="email" で入力）
* アクション:
    * ［ 再設定メールを送信する ］ ボタン
    * ＜ ログインページへ戻る （リンク形式で配置）

③ フッター
* なし



3. 画面内の操作・裏側の処理フロー

1. 「再設定メールを送信する」ボタンを押したとき
1. バリデーションチェック:
    * メールアドレスの形式（@ やドメインが含まれているか）が正しいか。
2. メール送信依頼（Supabase Auth処理）:
    * Supabase Authの機能（resetPasswordForEmail）を呼び出し、入力されたメールアドレス宛に「パスワード再設定用リンク」を自動送信します。
    * ※このリンクの遷移先が、/(auth)/reset-password になります。
※パスワード再設定メールの送信には、
Supabase Authに設定したCustom SMTPを使用する。

Custom SMTPの送信サービスには、
開発者が管理する共通Resendアカウントを使用する。

そのため、
クラブごとのResend APIキーや
クラブごとのメール送信設定は使用しない。
1. 完了画面の表示（またはトースト通知）:
    * セキュリティ上の理由（そのメールアドレスが本当に登録されているかをハッカー等に知られないようにするため）、入力されたアドレスが登録されていても・されていなくても、画面には全く同じ成功メッセージを表示します。
    * 表示文言: 「ご入力いただいたメールアドレス宛に、再設定用の案内メールを送信しました。メール内のリンクから手続きを完了させてください。」
2. フォームの非活性化:
    * 二重送信を防ぐため、送信ボタンをグレーアウト（非活性）にします。



4. エラー表示
* 「メールアドレスの形式が正しくありません。」 （アドレスの打ち間違いなど）
* 「送信処理に失敗しました。時間をおいて再度お試しください。」 （通信エラー等）


7-21 クラブ選択画面（（club-app）/club/select）
ClubMembershipから取得したclubIdの数だけ利用者の所属クラブ一覧を出す。選択した所属クラブの（会員用）月別イベント一覧ページに遷移する。
※将来、複数クラブに所属する保護者が発生した場合に選択できるようにするための実装。
※このページではクラブ別フッター（イベント、お知らせ、マイページ）は表示しない。

（実装上の注意事項）
・フッタータブは [clubSlug]/layout.tsx で作る
ログイン後に遷移したapp/club/[clubSlug]/layout.tsx内でパラムスでURLからclubslugを取得して、別ファイルでcomponents/club/FooterTabNav.tsxを作成し、その中で<Link href={`/club/${clubSlug}/events`}> イベント </Link> <Link href={`/club/${clubSlug}/notice`}> お知らせ </Link> <Link href={`/club/${clubSlug}/account`}> アカウント </Link>のようにスラッグ付きフッターを表示し、[clubSlug]/layout.tsxにインポートして表示する。各ページではURLのslugからClubを取得する。
まとめ
ログイン直後
→ DBから所属クラブを取得
→ slug付きURLへ入れる

slug付きURLに入った後
→ URLの [clubSlug] を使う

データ取得時
→ [clubSlug] から Club.id を取得
→ ClubMembershipで権限確認
→ clubIdでイベント・お知らせを取得

フッター
→ [clubSlug] を使ってリンク生成

詳細ページ
→ [clubSlug] + eventId で取得



7-22 不具合送信管理ページ（/(club-app)/platform/support）
URL： /platform/support
利用可能： ACTIVE状態のPlatformAdmin 
role： DEVELOPER SUPPORT

利用可能な役割

PlatformAdmin.isActive = true

かつ

PlatformAdmin.role =
DEVELOPER
または
SUPPORT

ClubMemberRole は使用しない。

表示条件
全クラブから送信された SupportReport。
クラブ単位の clubId 制限は行わない。
ただし、

requirePlatformAdmin()

を必ず実行する。

取得データ

SupportReport

Club

表示に使用：

SupportReport.id
createdAt
category
status
message
pageUrl
userAgent

reporterName
reporterEmail
reporterRole

internalNote
notifiedAt
notifyError

statusChangedAt
resolvedAt

Club.id
Club.name
Club.slug

handledByPlatformAdmin

表示内容
一覧は最新順。

createdAt desc

テーブル：

受付日時

クラブ名

種別

内容

送信者

メールアドレス

送信者権限

ステータス

操作

 絞り込み

全クラブ / クラブ別

全ステータス
未対応
対応中
保留
対応済み

全カテゴリ
不具合
質問
改善要望
その他

不具合ステータス更新アクション
1. supportReportId
   nextStatus
   を受け取る

2. requirePlatformAdmin()

3. nextStatusをparseする

4. validateSupportReportStatus()

5. SupportReportを取得

6. 存在しなければエラー

7. statusを更新

8. handledByPlatformAdminId
   = 現在のPlatformAdmin.id

9. statusChangedAt
   = now

10. nextStatus = RESOLVEDの場合

    resolvedAt = now

11. RESOLVEDから別statusへ戻した場合

    resolvedAt = null

12. revalidatePath("/platform/support")

13. 成功を返す


クラブ全ての不具合送信のデータを管理するページ（送信者とのやり取りはメールで行う）
* アクセス制限: 開発者のセッションがある場合のみ閲覧可能。
* 一覧表示: テーブル形式で(横幅に入りきれなかったら横スクロールで見れるようにする。ゆえに各表示項目は一定の間隔を空ける)、最新の報告から順（createdAt: 'desc'）に表示。
    * 表示項目：日時、種別、内容（省略表示）、メールアドレス、送信者名、クラブID、ステータス（プルダウン：デフォルトは未対応）
* 一覧の行をクリックしたら内容の全文が読める（アコーディオン）にする。
* ステータス更新:
    * プルダウン（未対応 / 対応中 / 保留 / 対応済）を変更した瞬間（onChange）、API（Server Actions）が走り、DBを即時更新してトーストで「更新完了」を出す。

※Platform画面にはクラブ用フッターを表示しない（不具合管理、ログアウトのシンプルな表示にする）



①以下、クラブ運営アプリの詳細設計
1.会員用月別イベント一覧
2.会員用日別イベント一覧
3.会員用イベント詳細
4.お知らせ一覧
5.お知らせ詳細
6.マイページ
7.LINE通知グループ管理

の詳細設計になります。
  1. 会員用月別イベント一覧 詳細設計
URL：
/club/[clubSlug]/events?month=2026-08
取得条件
ページ表示時に、
requireActiveClubMembership(clubSlug)
を実行する。
利用可能：
* OWNER
* COACH
* OFFICER
* MEMBER
いずれも status = ACTIVE のみ。
ClubEventの取得条件：
* clubId = currentClub.id
* status = PUBLISHED
* targetRoles にログイン中の membership.role を含む
* 指定月の期間とイベント期間が重なっている
指定月は searchParams.month から取得する。
未指定・不正な場合は club.timezone における現在月を使用する。
月の開始・終了は club.timezone で計算し、UTCへ変換してPrismaの検索条件へ使用する。
取得条件の考え方：
startAt < 翌月1日00:00

かつ

endAtあり
→ endAt > 当月1日00:00

endAtなし
→ startAt >= 当月1日00:00
表示データ
* ClubEvent.id
* title
* genre
* startAt
* endAt
* isAllDay
* location
* readRequiredAt
* ClubEventRead.readAt
未読判定：
readRequiredAt != null

かつ

readレコードがない
または
readAt < readRequiredAt
一覧表示だけでは既読にしない。
使う主な関数
requireActiveClubMembership()

parseMonthSearchParam()

getClubMonthUtcRange()

findPublishedClubEventsForMonth()

isEventUnread()
ページの流れ
1. paramsから clubSlug を取得する。
2. requireActiveClubMembership(clubSlug) を実行する。
3. searchParams.month から対象月を取得する。
4. club.timezone を基準に対象月のUTC範囲を作る。
5. 公開対象となるClubEventをDBから取得する。
6. ClubEventReadと照合して未読状態を作る。
7. 月間カレンダーへイベントを表示する。
8. 日付を押した場合、 /club/[clubSlug]/events/list?date=YYYY-MM-DD へ遷移する。
9. イベントカードを押した場合、 /club/[clubSlug]/events/[eventId] へ遷移する。
10. 前月・翌月を押した場合は month を変更したURLへ遷移し、その月のデータを再取得する。
2. 会員用日別イベント一覧 詳細設計
URL：
/club/[clubSlug]/events/list?date=2026-08-12
取得条件
requireActiveClubMembership(clubSlug) を実行する。
ClubEvent：
* clubId = currentClub.id
* status = PUBLISHED
* targetRoles にログイン中の membership.role を含む
* 指定日の時間帯とイベント期間が重なる
searchParams.date が未指定・不正な場合は、club.timezone における当日を使用する。
取得条件：
startAt < 翌日00:00

かつ

endAtあり
→ endAt > 当日00:00

endAtなし
→ startAt >= 当日00:00
表示データ
* ClubEvent.id
* title
* genre
* startAt
* endAt
* isAllDay
* location
* attachmentsの有無
* updatedAt
* readRequiredAt
* ClubEventRead.readAt
イベントは開始時刻順に表示する。
使う主な関数
requireActiveClubMembership()

parseDateSearchParam()

getClubDayUtcRange()

findPublishedClubEventsForDay()

isEventUnread()
ページの流れ
1. clubSlug を取得する。
2. ACTIVE Membershipを確認する。
3. searchParams.date から対象日を取得する。
4. club.timezone から対象日のUTC範囲を作る。
5. 対象日のClubEventをDBから取得する。
6. 未読判定を行う。
7. イベントカードを開始時刻順に表示する。
8. カードを押すとイベント詳細へ遷移する。
9. 前日・翌日を押した場合は date を変更したURLへ遷移する。
10. 月別一覧へ戻る場合は対象月を維持して月別ページへ遷移する。
3. 会員用イベント詳細 詳細設計
URL：
/club/[clubSlug]/events/[eventId]
取得条件
requireActiveClubMembership(clubSlug) を実行する。
ClubEventを以下で取得する。
* id = eventId
* clubId = currentClub.id
* status = PUBLISHED
* targetRoles にログイン中の membership.role を含む
上記を満たさない場合は notFound()。
自分専用メモは、
* clubId
* eventId
* membershipId = currentMembership.id
で取得する。
表示データ
* ClubEvent本体
* ClubEventAttachment
* 自分のClubEventMemo
* 自分のClubEventRead
* club.timezone
表示対象：
* タイトル
* ジャンル
* 日時
* 場所
* 集合日時・場所
* 本文
* 持ち物
* 注意事項
* PDF
* 自分専用メモ
* 公開日時
* 更新日時
使う主な関数
requireActiveClubMembership()

findPublishedClubEventDetail()

findClubEventMemo()

markClubEventRead()

formatClubDateTime()
ページの流れ
1. clubSlug と eventId を取得する。
2. ACTIVE Membershipを確認する。
3. eventId + clubId + PUBLISHED + targetRoles でイベントを取得する。
4. 添付PDFと自分専用メモを取得する。
5. 正常に閲覧可能なイベントであることを確認する。
6. ClubEventReadをupsertし、 readAt = now とする。
7. イベント詳細を表示する。
8. PDFは専用Route Handler経由で開く。
9. メモの保存・変更・削除は別Server Actionで処理する。
4. 会員用お知らせ一覧 詳細設計
URL：
/club/[clubSlug]/notice
取得条件
requireActiveClubMembership(clubSlug) を実行する。
ClubNotice：
* clubId = currentClub.id
* status = PUBLISHED
* targetRoles にログイン中の membership.role を含む
表示順：
1. isPinned = true を優先
2. その中で updatedAt desc
3. 通常のお知らせも updatedAt desc
初回15件取得。
「もっと見る」でさらに15件表示する。
※既存設計の10件表記は15件へ統一する。
検索・ジャンル絞り込みを行う場合も同じ公開条件を維持する。
表示データ
* ClubNotice.id
* title
* genre
* isPinned
* updatedAt
* firstPublishedAt
* readRequiredAt
* ClubNoticeRead.readAt
* attachmentsの有無
使う主な関数
requireActiveClubMembership()

findPublishedClubNotices()

isNoticeUnread()

parseNoticeGenre()

parseNoticeListLimit()
ページの流れ
1. clubSlug を取得する。
2. ACTIVE Membershipを確認する。
3. 検索・ジャンル・表示件数をsearchParamsから取得する。
4. 公開対象のお知らせを15件取得する。
5. ClubNoticeReadと照合して未読状態を作る。
6. 固定表示を優先してカード一覧を表示する。
7. カードを押すと、 /club/[clubSlug]/notice/[noticeId] へ遷移する。
8. 「もっと見る」を押した場合は表示件数を15件増やして再取得する。
9. 一覧表示だけでは既読にしない。
5. 会員用お知らせ詳細 詳細設計
URL：
/club/[clubSlug]/notice/[noticeId]
取得条件
requireActiveClubMembership(clubSlug) を実行する。
ClubNotice：
* id = noticeId
* clubId = currentClub.id
* status = PUBLISHED
* targetRoles に現在の membership.role を含む
条件を満たさない場合は notFound()。
表示データ
* ClubNotice本体
* ClubNoticeAttachment
* ClubNoticeRead
* club.timezone
表示：
* ジャンル
* 重要表示
* タイトル
* 本文
* 公開日時
* 更新日時
* 添付PDF
使う主な関数
requireActiveClubMembership()

findPublishedClubNoticeDetail()

markClubNoticeRead()

formatClubDateTime()
ページの流れ
1. clubSlug と noticeId を取得する。
2. ACTIVE Membershipを確認する。
3. noticeId + clubId + PUBLISHED + targetRoles で取得する。
4. 添付PDFを取得する。
5. 閲覧可能なお知らせであることを確認する。
6. ClubNoticeReadをupsertし、 readAt = now とする。
7. お知らせ詳細を表示する。
8. PDFは専用Route Handlerから開く。
6. マイページ 詳細設計
URL：
/club/[clubSlug]/account
取得条件
ページ表示時に、
requireActiveClubMembership(clubSlug)
を実行する。
取得対象：
* AppUser
* 現在のClubMembership
* Club
* 現在クラブに所属しているChild
* ChildClubMembership
* ACTIVEなClubMembership件数
* PlatformAdminの有無
子どもは単純に AppUser.children を全部表示するのではなく、
現在の clubId に紐づくChildClubMembershipを持つ子どもだけを取得する。
表示データ
アカウント設定
* 氏名
* メールアドレス
* 現在クラブ
* 所属する子どもの氏名
* 学年
※MVPではメールアドレスは表示のみを推奨する。
メールアドレスを変更可能にすると、AppUserだけでなくSupabase Auth側のメール変更・本人確認処理も必要になるため、氏名や子ども情報とは別機能として扱う。
権限別リンク
OWNER：
* LINE通知設定
* メンバー管理
* イベント管理
* お知らせ管理
COACH / OFFICER：
* イベント管理
* お知らせ管理
MEMBER：
* 管理リンクなし
PlatformAdmin：
* 不具合管理 /platform/support
※PlatformAdminがClubMembershipを持っていない場合はクラブマイページ自体には入れないため、Platform管理画面へはログイン後から直接遷移できる導線も別途持たせる。
その他
* 利用規約
* プライバシーポリシー
* 不具合報告
* 公式HP
* Instagram
* クラブ切替
* ログアウト
クラブ切替はACTIVE Membershipが2件以上の場合のみ表示する。
使う主な関数
requireActiveClubMembership()

findClubAccountPageData()

findActiveMembershipCount()

findPlatformAdminByUserId()

buildAccountInitialValues()

buildAccountFormValues()

parseAccountFormData()

validateAccountInput()

updateAccountAction()

createSupportReportAction()
6-1. アカウント設定ページの流れ
1. paramsから clubSlug を取得する。
2. searchParamsから accountSaved を取得する。
3. requireActiveClubMembership(clubSlug) を実行する。
4. AppUser・現在クラブのChild等を取得する。
5. buildAccountInitialValues() でフォーム初期値を作る。
6. AccountFormへinitialValuesを渡す。
7. accountSaved === "1" の場合は「保存しました」をトースト表示する。
6-2. アカウント設定フォーム
1. useActionState で updateAccountAction() を呼ぶ。
2. 入力初期値は、
defaultValue={
  state.values?.name ??
  initialValues.name
}
の形とする。
1. state.errors を各入力欄付近に表示する。
2. useFormStatus でpending中は保存ボタンをdisabledにする。
3. 保存時に確認モーダルを表示する。
4. 学年の選択肢はconstantsへ定義する。
6-3. アカウント更新Action
1. requireActiveClubMembership(clubSlug)
2. buildAccountFormValues(formData)
3. parseAccountFormData(formData)
4. validateAccountInput(input)
5. 現在ユーザー・現在クラブのデータだけを更新する。
6. 子どもを更新する場合は、そのChildが現在ユーザーの子どもかつ現在クラブに所属していることを確認する。
7. DB更新。
8. revalidatePath()
9. /club/[clubSlug]/account?accountSaved=1 へredirect。
6-4. サポート・不具合報告
取得条件
不具合報告はOWNER限定にしない。
ACTIVE状態の、
* OWNER
* COACH
* OFFICER
* MEMBER
すべて利用可能。
requireActiveClubMembership(clubSlug) を使用する。
表示データ
フォーム：
* category
* message
自動取得：
* clubId
* membershipId
* reporterName
* reporterEmail
* reporterRole
* pageUrl
* userAgent
使う主な関数
buildSupportReportFormValues()

parseSupportReportFormData()

validateSupportReportInput()

sanitizeSupportPageUrl()

createSupportReport()

sendSupportReportEmail()
フォームの流れ
1. useActionState で createSupportReportAction() を呼ぶ。
2. category / messageを入力する。
3. state.errors を表示する。
4. pending中は送信ボタンをdisabledにする。
5. 送信時に確認モーダルを表示する。
6. 成功後に入力内容を空にする場合は、FormInnerにreset用keyを持たせる。
6-5. 不具合報告Action
1. requireActiveClubMembership(clubSlug)
2. FormDataからエラー時表示用valuesを作る。
3. FormDataをparseする。
4. message をtrimする。
5. category / messageをvalidationする。
6. messageは最大2000文字とする。
7. pageUrlをsanitizeする。
8. userAgentをサーバー側で取得する。
9. SupportReportをDBへ保存する。
10. DB保存成功後、開発者共通Resendから運営者へメール通知する。
11. メール成功：
notifiedAt = now
1. メール失敗：
notifyError = エラー内容
またはAxiom等へログを残す。
1. メール送信に失敗してもDB保存成功なら受付成功として扱う。
2. /club/[clubSlug]/account?sent=1 へredirectする。
3. マイページで受付完了トーストを表示する。
7. OWNER用 LINE通知グループ管理 詳細設計
URL：
/club/[clubSlug]/admin/settings/line
取得条件
requireClubOwner(clubSlug) を実行する。
取得対象：
* ClubLineSetting
* ClubLineTarget
* 未使用・有効期限内のClubLineRegistrationToken
取得・更新条件には必ず clubId を含める。
表示データ
ClubLineSetting：
* 接続設定の有無
* webhook設定状態など
ClubLineTarget：
* id
* targetName
* targetRoles
* isEnabled
* createdAt
ClubLineRegistrationToken：
* 有効期限
* 使用済みかどうか
Channel Secret・Access Token・lineGroupIdの完全な値は画面へ表示しない。
使う主な関数
requireClubOwner()

findClubLineSettingForOwner()

findClubLineTargetsForOwner()

buildLineTargetInitialValues()

buildLineTargetFormValues()

parseLineTargetFormData()

validateLineTargetInput()

updateClubLineTargetAction()

createClubLineRegistrationTokenAction()

generateLineRegistrationCode()

registerClubLineTargetFromWebhook()
7-1. LINE通知設定ページの流れ
1. paramsから clubSlug を取得する。
2. searchParamsから saved 等を取得する。
3. requireClubOwner(clubSlug) を実行する。
4. 現在のClubLineSettingを取得する。
5. 現在登録済みのClubLineTargetを取得する。
6. 必要に応じて有効期限内の登録トークン情報を取得する。
7. グループ編集フォームへ既存値を渡す。
8. 新しいグループ登録UIを表示する。
9. saved === "1" の場合は「保存しました」をトースト表示する。
7-2. グループ編集フォーム
1. ClubLineTargetの既存値を表示する。
2. useActionState で更新Actionを呼ぶ。
3. エラー時は、
state.values
↓
既存値
の優先順位で入力値を表示する。
1. 編集項目：
* targetName
* targetRoles
* isEnabled
1. pending中は保存ボタンをdisabledにする。
7-3. グループ編集Action
1. requireClubOwner(clubSlug)
2. FormDataからvaluesを作る。
3. FormDataをparseする。
4. validationする。
5. 対象ClubLineTargetを、
id
+
clubId
で確認する。
1. lineSettingIdが現在クラブのClubLineSettingに属していることも確認する。
2. DBへ変更を保存する。
3. revalidatePath("/club/[clubSlug]/admin/settings/line")
4. /club/[clubSlug]/admin/settings/line?saved=1 へredirectする。
※編集後にマイページへ戻さず、LINE通知設定ページへ戻す。
7-4. 新しいグループ登録コード発行Action
このActionではgroupIdを取得しない。
役割は「登録コードを発行するところまで」。
1. requireClubOwner(clubSlug)
2. ClubLineSettingを取得する。
3. ランダムな登録コードを生成する。
4. DBへは生コードを保存せずhash化する。
5. ClubLineRegistrationTokenを作成する。
保存：
clubId
lineSettingId
tokenHash
expiresAt
usedAt = null
createdByMembershipId
1. 生の登録コードを画面へ返す。
2. OWNERがそのコードを対象LINEグループへ投稿する。
7-5. LINEグループ登録Webhookの流れ
登録コード発行Actionとは別処理とする。
1. LINEグループ内で登録コードが投稿される。
2. /api/line/webhook/[webhookKey] がWebhookを受信する。
3. webhookKeyからClubLineSettingを取得する。
4. Channel Secretを復号し、LINE署名を検証する。
5. 署名成功後に本文をparseする。
6. Webhook本文から、
source.groupId
message.text
を取得する。
1. message.textから登録コードを取得しhash化する。
2. 以下に一致するClubLineRegistrationTokenを取得する。
clubId = currentClub.id
lineSettingId = currentLineSetting.id
tokenHash = 入力コードのhash
usedAt = null
expiresAt > now
1. 正常な場合、ClubLineTargetをupsertする。
clubId
lineSettingId
lineGroupId = source.groupId
targetName = null
targetRoles = []
isEnabled = false
1. ClubLineRegistrationTokenの、
usedAt = now
を更新する。
1. OWNERがLINE通知設定ページを再読み込みすると、新しい通知先が表示される。
2. OWNERが通知先名・対象ロール・有効状態を設定する。

・LINE通知先は原則として物理削除しない
・使わない通知先は isEnabled = false にする
・画面上は「削除」ではなく「無効化」にするのが安全
・どうしても削除ボタンを置くなら、送信履歴がある通知先は削除不可にする


②以下、クラブ運営アプリの詳細設計
「イベント新規作成」
「イベント編集」
「お知らせ新規作成」
「お知らせ編集」
「PDF添付」
「ライン通知」
「メンバー管理」
「ログイン後のクラブ判定」
の詳細設計になります。

新規イベント作成ページ 詳細設計

対象ページ：
/club/[clubSlug]/admin/events/new

対象ファイル：
app/(club-app)/club/[clubSlug]/admin/events/new/page.tsx
app/(club-app)/club/[clubSlug]/admin/events/new/EventCreateForm.tsx
app/(club-app)/club/[clubSlug]/admin/events/new/actions.ts

使用する主な関数：
requireClubAdminMembership(clubSlug)
findEnabledClubLineTargets(clubId)
buildEventFormValues(formData)
parseClubEventFormData(formData)
validateClubEventInput(input)
buildContentTargetRoles(input.targetRoles)
convertEventInputToUtc(input, club.timezone)
buildEventPublishTimestamps(input, now)
uploadClubEventAttachments()
createEventLineDeliveries()
sendPendingLineDeliveries()
revalidateClubEventPaths()

【page.tsの流れ】
1. paramsからclubSlugを取得する

2. requireClubAdminMembership(clubSlug) を実行する
   - OWNER / COACH / OFFICERかつstatus = ACTIVEのみ許可
未ログイン：ログイン画面へredirect
ログイン済みだが権限なし：notFound 

3. ClubLineTargetを取得する
   - clubIdで絞る
   - isEnabled = true

4. EventCreateFormへpropsを渡す
   - clubSlug
   - lineTargets
   - 初期state


【フォームの流れ】
1. 入力フォームを表示する

2. useActionStateでcreateClubEventActionを呼ぶ

3. state.values があれば defaultValue に入れる

4. state.errors があれば各入力欄の近くに表示する

5. useFormStatusでpending中は保存ボタンをdisabledにする

6. 保存時は確認モーダルを出す
   - LINE通知ONの場合は特に明確に確認する

7. hiddenで必要な値を持つ
   - requestId（フォームを開いた瞬間に生成するランダムな値。二重保存防止のため）
   - returnDate （送信完了後にどの日付の一覧に戻るか）など、戻り先に使う値


【actionの流れ】
関数名：
createClubEventAction(clubSlug ,prevState, formData)

1. requireClubAdminMembership(clubSlug)
   - clubId
   - club.timezone
   - membershipId
   - role
   を取得する

2. buildEventFormValues(formData)
   - エラー時にフォームへ戻すためのvaluesを作る



3. parseClubEventFormData(formData)
   - バリデーション処理に使いやすい形へ変換する

4. validateClubEventInput(input),validateEventCreateReferences()でバリデーションする
   - タイトル必須
   - 開始日必須
   - 終日OFFなら開始時間必須
   - endAt > startAt
   - 公開対象チェック
   - PDF形式・容量
   - LINE通知ONなら通知先が1つ以上あるか確認
など

5. buildContentTargetRoles(input.targetRoles)
   - OWNERを必ず追加
   - 重複排除
   - COACH / OFFICER / MEMBER の不正値を除外

6. convertEventInputToUtc(input, club.timezone)
   - startAt
   - endAt
   - meetingAt
   をUTCへ変換する

7. now = new Date() を作る

8. buildEventPublishTimestamps(input, now)
   - 下書き：
     firstPublishedAt = null
     readRequiredAt = null

   - 公開＋未読OFF：
     firstPublishedAt = now
     readRequiredAt = null

   - 公開＋未読ON：
     firstPublishedAt = now
     readRequiredAt = now

9. eventIdをrandomUUIDで生成する

10. PDFがある場合
   - Storage pathを作る
   - clubs/${clubId}/events/${eventId}/${uuid}.pdf
   - Storageへアップロードする
   - uploadedFiles配列に保存結果を保持する

11. prisma.$transaction
   - ClubEventを作成する
   - createdByMembershipId = adminMembership.id
   - updatedByMembershipId = adminMembership.id
   - ClubEventAttachmentを作成する
   - LINE通知ONならClubLineDeliveryをPENDINGで作成する

12. transaction失敗時
   - アップロード済みStorageファイルを削除する
   - stateにエラーとvaluesを返す

13. LINE通知ONの場合
   - transaction完了後にsendPendingLineDeliveriesを実行する
   - 成功した通知先はSENT
   - 失敗した通知先はFAILED
   - LINE送信失敗でもイベント作成は成功扱いにする

14. revalidatePathを実行する
   - /club/[clubSlug]/admin/events
   - /club/[clubSlug]/admin/events/list
   - /club/[clubSlug]/events
   -/club/[clubSlug]/events/listなど

15. redirectする
管理用日別イベント一覧ページ

※ validateClubEventInput(input):入力値Validation
※buildContentTargetRoles():正規化関数
※validateEventCreateReferences():DB参照Validation

チェック内容：

1. title が空でない
2. title が長すぎない
3. startDate がある
4. isAllDay = false の場合、startTime がある
5. endAt がある場合、startAt より後
6. meetingAt がある場合、基本的に startAt 以前
   - MVPではエラーではなく警告でも可
7. targetRoles はサーバー側で必ず OWNER を追加する 
- OWNERのみ公開も許可する - そのため「公開対象を1つ以上選択」は実質OWNERで満たされる - COACH / OFFICER / MEMBER の不正値は除外する
8. status が DRAFT / PUBLISHED のどちらか
9. genre が ClubEventGenre のどれか
10. PDFは application/pdf のみ
11. PDFサイズは上限以内
12. LINE通知ONの場合、lineTargetIds が1つ以上ある
13. lineTargetIds は同じclubIdのClubLineTargetだけ許可

入力値Validation：
1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12

正規化関数：
7

DB参照Validation：
13


※ レートリミットはMVPでは設けない。
理由：管理者ページであり、定期練習などを連続作成する可能性があるため。

ただし、二重送信防止は行う。

クライアント側：
useFormStatus で pending 中は保存ボタンを disabled にする。

サーバー側：
requestId または clientRequestId を使い、同じ送信が重複処理されないようにする。

新規イベント作成ページ:pending実装（バックエンドでは二重送信防止関数）
フォーム:フォームの格インプットに以下のようにデフォルトバリューをつける。エラー時にステイトがあれば入力値として表示して、初期の段階でなければ空白。つまり、エラー時はstate.valuesをdefaultValueに入れて入力値を復元する
defaultValue={state.values?.startDate ?? ""}

※ redirectをcatch外

※アクションのエラーメッセージをconstants/...というファイルにまとめておくこと


イベント編集ページ 詳細設計

対象ページ：
/club/[clubSlug]/admin/events/[eventId]/edit

対象ファイル：
app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/page.tsx
app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/EventEditForm.tsx
app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/EventDeleteButton.tsx
app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/actions.ts

使用する主な関数：
requireClubAdminMembership(clubSlug)
findClubEventForAdmin({ clubId, eventId })
findEnabledClubLineTargets(clubId)
buildEventInitialValues(event)
buildEventFormValues(formData)
parseClubEventFormData(formData)
validateClubEventInput(input)
buildContentTargetRoles(input.targetRoles)
convertEventInputToUtc(input, club.timezone)
buildEventUpdatePublishTimestamps({ existingEvent, input, now })
resolveEventAttachmentChanges()
uploadClubEventAttachments()
deleteClubEventStorageObjects()
createEventLineDeliveries()
sendPendingLineDeliveries()
revalidateClubEventPaths(



【page.tsx の流れ】
1. paramsから clubSlug と eventId を取得する

2. searchParamsから returnDate  / error / toastId を取得する
   - eventId は searchParams から取らない
   - eventId はURLパラメータ [eventId] から取る

3. requireClubAdminMembership(clubSlug) を実行する
   - OWNER / COACH / OFFICER かつstatus = ACTIVEのみ許可
   未ログイン：ログイン画面へredirect
   ログイン済みだが権限なし：notFound 


4. findClubEventForAdmin({ clubId, eventId }) を実行する
   - where: { id: eventId, clubId }
   - include:
     - attachments
     - createdByMembership.user
     - updatedByMembership.user
     - lineDeliveries.target

5. event が存在しなければ notFound()

6. findEnabledClubLineTargets(clubId) を実行する
   - clubIdで絞る
   - isEnabled = true

7. buildEventInitialValues(event) でフォーム初期値を作る
   - DBのUTC日時を club.timezone の表示用日時に戻す
   - targetRoles
   - status
   - genre
   - PDF一覧
   - 公開日時
   - 更新日時

8. EventEditFormへpropsを渡す
   - clubSlug
   - eventId
   - initialValues
   - attachments
   - lineTargets
   - returnDate
   - 初期state

9. EventDeleteButtonへpropsを渡す
   - clubSlug
   - eventId
   - eventTitle
   - returnDate


【EventEditForm.tsx】
1. 既存イベントの入力フォームを表示する

2. useActionStateで updateClubEventAction を呼ぶ

3. 各inputには以下の形で初期値を入れる

   defaultValue={state.values?.title ?? initialValues.title}

4. checkbox / radio は以下のようにする（例は通知先コーチ用のチェックボックス）

   defaultChecked={
     state.values?.targetRoles?.includes("COACH")
       ?? initialValues.targetRoles.includes("COACH")
   }

5. OWNERは常にチェック済み・解除不可にする
   - UI上は disabled checked
   - ただしdisabledの値はFormDataに入らないため、サーバー側で必ずOWNERを追加する

6. state.errors があれば各入力欄の近くに表示する

7. useFormStatus で pending 中は保存ボタンを disabled にする

8. 保存時は確認モーダルを出す

9. LINE通知ONの場合は、より強い確認文を表示する

   「イベントを更新し、選択したLINEグループへ通知しますか？」

10. hiddenで必要な値を持つ
   - returnDate（保存後の遷移先の日付の際に必要）
   - requestId（二重送信防止のため）
   - deleteAttachmentIds（既存の添付ファイルを削除する操作をした（ゴミ箱ボタンを押したなど）際に、削除対象となったファイルのIDを一時的に溜めておくための値。保存ボタンを押した瞬間DBとストレージから削除する際に使う。）

【EventDeleteButton.tsx】
1. 削除ボタンを表示する

2. 押したら確認モーダルを表示する

3. 確認文を表示する

   「〇〇」を完全に削除しますか？
   関連するPDF、個人メモ、既読記録も削除されます。
   この操作は元に戻せません。

4. useFormStatusでpending中は削除ボタンをdisabledにする

5. deleteClubEventAction を呼ぶ

6. 削除成功後は管理者用月別イベント一覧へredirectする

【アクション関数】
関数名：updateClubEventAction(clubSlug, eventId, prevState, formData)

1. requireClubAdminMembership(clubSlug)
   - clubId
   - club.timezone
   - membershipId
   - role
   を取得する

2. buildEventFormValues(formData)
   - エラー時にフォームへ戻すための values を作る
   - ここではDB保存用の変換はしない



3. 既存イベントを取得する（添付ファイルの削除の際に照らし合わせるためなのと公開日時の変更に使うため）

   findFirst({
     where: {
       id: eventId,
       clubId: adminMembership.club.id
     },
     include: {
       attachments: true
     }
   })

   存在しなければ notFound()

4. parseClubEventFormData(formData)
   - バリデーションしやすい形へ変換する
   - title
   - content
   - status
   - genre
   - targetRoles
   - startDate
   - startTime
   - endDate
   - endTime
   - meetingDate
   - meetingTime
   - location
   - belongings
   - notes
   - shouldMarkUpdateAsUnread
   - shouldNotifyLine
   - lineTargetIds
   - deleteAttachmentIds
   - newPdfFiles
   - requestId

5. validateClubEventInput(input),validateEventEditReferences
   - 失敗したら state に errors と values を返す

6. buildContentTargetRoles(input.targetRoles)
   - OWNERを必ず追加
   - 重複排除
   - COACH / OFFICER / MEMBER 以外の不正値を除外

7. convertEventInputToUtc(input, club.timezone)
   - startAt
   - endAt
   - meetingAt
   をUTCへ変換する

8. now = new Date() を作る

9. buildEventUpdatePublishTimestamps({
     existingEvent,
     input,
     now
   })
   で firstPublishedAt / readRequiredAt を決める

10. resolveEventAttachmentChanges()
   - 削除対象PDFがこのイベント・このclubIdに属しているか確認する
   - 新規追加PDFを整理する
   - 削除対象storagePathを保持する

11. 新規PDFがある場合、Storageへアップロードする
   - path:
     clubs/${clubId}/events/${eventId}/${uuid}.pdf
   - uploadedFiles配列に保存結果を保持する

12. prisma.$transaction を実行する

   transaction内で行うこと：

   - ClubEventを更新する
   - updatedByMembershipId = adminMembership.id
   - ClubEventAttachmentを追加する
   - 削除対象のClubEventAttachmentを削除する
   - LINE通知ONならClubLineDeliveryをPENDINGで作成する

13. transaction失敗時
   - 新しくアップロード済みのStorageファイルを削除する
   - stateにエラーとvaluesを返す

14. transaction成功後
   - 削除対象だった古いStorageファイルを削除する
   - 古いStorage削除に失敗してもイベント更新は成功扱い
   - 失敗内容はログに残す

15. LINE通知ONの場合
   - sendPendingLineDeliveries を実行する
   - 成功した通知先は SENT
   - 失敗した通知先は FAILED
   - LINE送信失敗でもイベント更新は成功扱い

16. revalidatePathを実行する

   - /club/[clubSlug]/admin/events
   - /club/[clubSlug]/admin/events/list
   - /club/[clubSlug]/admin/events/[eventId]/edit
   - /club/[clubSlug]/events
   - /club/[clubSlug]/events/list
   - /club/[clubSlug]/events/[eventId]など

17. redirectする
  管理用日別イベント一覧ページ

   削除時のみ：
管理用月別イベント一覧ページ

※ validateClubEventInput(input)：入力値Validation
※buildContentTargetRoles：正規化関数
※validateEventEditReferences()：DB参照Validation


チェック内容：

1. title が空でない

2. title が長すぎない

3. startDate がある

4. isAllDay = false の場合、startTime がある

5. endAt がある場合、startAt より後

6. meetingAt がある場合、基本的に startAt 以前
   - MVPではエラーではなく警告でも可

7. targetRoles はサーバー側で必ず OWNER を追加する
   - OWNERのみ公開も許可する
   - そのため「公開対象を1つ以上選択」は実質OWNERで満たされる
   - COACH / OFFICER / MEMBER の不正値は除外する

8. status が DRAFT / PUBLISHED のどちらか

9. genre が ClubEventGenre のどれか

10. 新規PDFは application/pdf のみ

11. 新規PDFサイズは上限以内

12. 削除対象attachmentIdが、このclubId・このeventIdに属している

13. LINE通知ONの場合、最終statusは PUBLISHED であること

14. LINE通知ONの場合、lineTargetIds が1つ以上あること

15. lineTargetIds は同じclubIdの有効なClubLineTargetだけ許可する

入力値Validation：
1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14

正規化関数
7

DB参照Validation：
12, 15

【PDF更新フロー】
1. 既存attachmentsを取得する

2. formDataから deleteAttachmentIds を取得する

3. deleteAttachmentIds がすべて既存attachmentsに含まれているか確認する

4. 新規PDFがあればStorageへアップロードする

5. transaction内で、
   - 新規ClubEventAttachmentを作成する
   - 削除対象ClubEventAttachmentを削除する

6. transaction失敗時
   - 新規アップロード済みStorageを削除する

7. transaction成功後
   - 削除対象だった古いStorageを削除する

8. 古いStorage削除に失敗した場合
   - イベント更新は成功扱い
   - ログに残す

【ライン通知詳細】
LINE通知ONの場合：

1. 最終statusが PUBLISHED か確認する

2. 選択された通知先が同じclubIdの有効なClubLineTargetか確認する

3. requestId を使って ClubLineDelivery を PENDING で作成する

4. transaction完了後に sendPendingLineDeliveries() を実行する

5. 成功した通知先：
   status = SENT
   sentAt = now

6. 失敗した通知先：
   status = FAILED
   errorCode / errorDetail を保存

7. LINE通知に失敗しても、イベント更新は成功扱いにする

レートリミットはMVPでは設けないが二重送信防止は行う。

※レートリミットはMVPでは設けない。
理由：
管理者ページであり、連続編集や定期練習の作成があるため。

ただし、二重送信防止は行う。

クライアント側：
useFormStatus で pending 中は保存ボタンを disabled にする。

サーバー側：
通常のイベント更新は updateMany により同じ内容へ更新されるため大きな問題になりにくい。

ただし、LINE通知は requestId と idempotencyKey により二重通知履歴を防ぐ。

PDF追加はMVPでは pending による二重送信防止を基本とする。
将来的により厳密にする場合は、アップロードrequestIdやActionRequestテーブルで二重処理を防ぐ。

【削除アクション（deleteClubEventAction）の流れ】
関数名：
deleteClubEventAction(clubSlug, eventId, formData)

1. requireClubAdminMembership(clubSlug)

2. eventId + clubId でイベントを取得する
   - attachmentsも取得する

3. 存在しなければ notFound()

4. 削除確認用の値を確認する
   - hidden confirmValue など
   - MVPでは確認モーダルのみでも可

5. prisma.$transaction
   - ClubEventを削除する
   - 関連する memo / read / attachment / delivery は onDelete: Cascade で削除

6. transaction成功後
   - 事前に取得しておいた storagePath を使ってStorageファイルを削除する

7. Storage削除失敗時
   - 削除処理自体は成功扱い
   - ログに残す

8. revalidatePath
   - /club/[clubSlug]/admin/events
   - /club/[clubSlug]/admin/events/list
   - /club/[clubSlug]/eventsなど

9. redirect
   管理用月別イベント一覧ページ

※ redirectをcatch外

※アクションのエラーメッセージをconstants/...というファイルにまとめておくこと



新規お知らせ作成ページ 詳細設計

対象ページ：
/club/[clubSlug]/admin/notice/new

対象ファイル：
app/(club-app)/club/[clubSlug]/admin/notice/new/page.tsx
app/(club-app)/club/[clubSlug]/admin/notice/new/NoticeCreateForm.tsx
app/(club-app)/club/[clubSlug]/admin/notice/new/actions.ts

使用する主な関数：
requireClubAdminMembership(clubSlug)
findEnabledClubLineTargets(clubId)
buildNoticeFormValues(formData)
parseClubNoticeFormData(formData)
validateClubNoticeInput(input)
buildContentTargetRoles(input.targetRoles)
buildNoticeCreatePublishTimestamps(input, now)
uploadClubNoticeAttachments()
createNoticeLineDeliveries()
sendPendingLineDeliveries()
revalidateClubNoticePaths()

【page.tsx の流れ】

1. paramsから clubSlug を取得する

2. searchParamsから returnDate / error / toastId を取得する
   - noticeId は searchParams から取らない
   - noticeId はURLパラメータ [noticeId] から取る

2. requireClubAdminMembership(clubSlug) を実行する
   - OWNER / COACH / OFFICER かつstatus = ACTIVEのみ許可
   未ログイン：ログイン画面へredirect
   ログイン済みだが権限なし：notFound 

3. ClubLineTarget を取得する
   - clubId で絞る
   - isEnabled = true

4. NoticeCreateForm へ props を渡す
   - clubSlug
   - lineTargets
   - 初期state


【フォームの流れ】

1. 入力フォームを表示する

2. useActionState で createClubNoticeAction を呼ぶ

3. state.values があれば defaultValue に入れる

4. state.errors があれば各入力欄の近くに表示する

5. useFormStatus で pending 中は保存ボタンを disabled にする

6. 保存時は確認モーダルを出す

7. LINE通知ONの場合は、明確な確認文を出す

   「お知らせを公開し、選択したLINEグループへ通知しますか？」

8. hiddenで必要な値を持つ
   - requestId

requestIdは、主にLINE通知の二重送信防止に使う。


【action の流れ】

関数名：
createClubNoticeAction(clubSlug,prevState, formData)

1. requireClubAdminMembership(clubSlug)
   - clubId
   - membershipId
   - role
   を取得する

2. buildNoticeFormValues(formData)
   - エラー時にフォームへ戻すための values を作る

3. parseClubNoticeFormData(formData)
   - バリデーション処理に使いやすい形へ変換する

4. validateClubNoticeInput(input),validateNoticeCreateReferences
   - 失敗したら state に errors と values を返す

5. buildContentTargetRoles(input.targetRoles)
   - OWNERを必ず追加
   - 重複排除
   - COACH / OFFICER / MEMBER 以外の不正値を除外

6. now = new Date() を作る

7. buildNoticeCreatePublishTimestamps(input, now)
   - 下書き：
     firstPublishedAt = null
     readRequiredAt = null

   - 公開：
     firstPublishedAt = now
     readRequiredAt = now

8. noticeId を randomUUID で生成する

9. PDFがある場合
   - Storage path を作る
   - clubs/${clubId}/notices/${noticeId}/${uuid}.pdf
   - Storageへアップロードする
   - uploadedFiles配列に保存結果を保持する

10. prisma.$transaction を実行する

   transaction内で行うこと：
   - ClubNoticeを作成する
   - createdByMembershipId = adminMembership.id
   - updatedByMembershipId = adminMembership.id
   - ClubNoticeAttachmentを作成する
   - LINE通知ONならClubLineDeliveryをPENDINGで作成する

11. transaction失敗時
   - アップロード済みStorageファイルを削除する
   - stateにエラーとvaluesを返す

12. LINE通知ONの場合
   - transaction完了後に sendPendingLineDeliveries を実行する
   - 成功した通知先は SENT
   - 失敗した通知先は FAILED
   - LINE送信失敗でもお知らせ作成は成功扱いにする

13. revalidatePath を実行する
   - /club/[clubSlug]/admin/notice
   - /club/[clubSlug]/notice
   - /club/[clubSlug]/admin/notice/[noticeId]/edit

など

14. redirectする
（管理用）お知らせ一覧ページにリダイレクトする

※ validateClubNoticeInput(input)：入力値Validation
※buildContentTargetRoles：正規化関数
※validateNoticeCreateReferences()：DB参照Validation

チェック内容：

1. title が空でない
2. title が長すぎない
3. content が空でない
4. content が長すぎない
5. status が DRAFT / PUBLISHED のどちらか
6. genre が ClubNoticeGenre のどれか
7. isPinned が boolean として扱える値である
8. targetRoles はサーバー側で必ず OWNER を追加する
9. COACH / OFFICER / MEMBER の不正値は除外する
10. PDFは application/pdf のみ
11. PDFサイズは上限以内
12. PDFの添付数が上限以内
13. LINE通知ONの場合、最終statusは PUBLISHED であること
14. LINE通知ONの場合、lineTargetIds が1つ以上あること
15. lineTargetIds は同じclubIdの有効なClubLineTargetだけ許可する
16. requestId が空でない

入力値Validation：
1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 16

正規化関数：
8,9

DB参照Validation：
15


※ redirectをcatch外

※アクションのエラーメッセージをconstants/...というファイルにまとめておくこと



お知らせ編集ページ　詳細設計

対象ページ
/club/[clubSlug]/admin/notice/[noticeId]/edit

対象ファイル
app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/page.tsx
app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/NoticeEditForm.tsx
app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/NoticeDeleteButton.tsx
app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/actions.ts

使用する主な関数
requireClubAdminMembership(clubSlug)
findClubNoticeForAdmin({
  clubId,
  noticeId
})
findEnabledClubLineTargets(clubId)
buildNoticeInitialValues(notice)
buildNoticeFormValues(formData)
parseClubNoticeFormData(formData)
validateClubNoticeInput(input)
buildContentTargetRoles(input.targetRoles)
buildNoticeUpdatePublishTimestamps({
  existingNotice,
  input,
  now
})
resolveNoticeAttachmentChanges()
uploadClubNoticeAttachments()
deleteClubNoticeStorageObjects()
createNoticeLineDeliveries()
sendPendingLineDeliveries()
revalidateClubNoticePaths()


【page.tsx の流れ】
1. paramsから clubSlug と noticeId を取得する

2. 必要であればsearchParamsを取得する


3. requireClubAdminMembership(clubSlug) を実行する
   - OWNER / COACH / OFFICER かつstatus = ACTIVEのみ許可
   未ログイン：ログイン画面へredirect
   ログイン済みだが権限なし：notFound 


4. findClubNoticeForAdmin({ clubId, noticeId }) を実行する

5. Noticeが存在しなければ notFound()

6. ClubLineTarget を取得する
   - clubId で絞る
   - isEnabled = true

7. buildNoticeInitialValues(notice) でフォーム初期値を作る


8. NoticeEditFormへpropsを渡す

9. NoticeDeleteButtonへpropsを渡す


【NoticeEditForm.tsx】
1. 既存お知らせの入力フォームを表示する

2. useActionStateで updateClubNoticeAction を呼ぶ

3. 各inputには以下の形で初期値を入れる

   defaultValue={state.values?.title ?? initialValues.title}

4. checkbox / radio は以下のようにする（例は通知先コーチ用のチェックボックス）

   defaultChecked={
     state.values?.targetRoles?.includes("COACH")
       ?? initialValues.targetRoles.includes("COACH")
   }

5. OWNERは常にチェック済み・解除不可にする
   - UI上は disabled checked
   - ただしdisabledの値はFormDataに入らないため、サーバー側で必ずOWNERを追加する

6. state.errors があれば各入力欄の近くに表示する

7. useFormStatus で pending 中は保存ボタンを disabled にする

8. 保存時は確認モーダルを出す

9. LINE通知ONの場合は、より強い確認文を表示する

   「お知らせを更新し、選択したLINEグループへ通知しますか？」

10. hiddenで必要な値を持つ
   - requestId（ライン通知の二重送信防止のため）
   - deleteAttachmentIds（既存の添付ファイルを削除する操作をした（ゴミ箱ボタンを押したなど）際に、削除対象となったファイルのIDを一時的に溜めておくための値。保存ボタンを押した瞬間DBとストレージから削除する際に使う。）

【NoticeDeleteButton.tsx】
1. 削除ボタンを表示する

2. 押したら確認モーダルを表示する

3. 確認文を表示する

   「〇〇」を完全に削除しますか？
   関連するPDF、既読記録も削除されます。
   この操作は元に戻せません。

4. useFormStatusでpending中は削除ボタンをdisabledにする

5. deleteClub NoticeAction を呼ぶ

6. 削除成功後は管理者用お知らせ一覧へredirectする

【アクション関数】
関数名：updateClubNoticeAction(clubSlug, noticeId, prevState, formData)

1. requireClubAdminMembership(clubSlug)
   - clubId
   - membershipId
   - role
   を取得する

2. buildNoticeFormValues(formData)
   - エラー時にフォームへ戻すための values を作る
   - ここではDB保存用の変換はしない



3. 既存お知らせを取得する（添付ファイルの削除の際に照らし合わせるためなのと公開日時の変更に使うため）

   findFirst({
     where: {
       id: noticeId,
       clubId: adminMembership.club.id
     },
     include: {
       attachments: true
     }
   })

   存在しなければ notFound()

4. parseClubNoticeFormData(formData)
   - バリデーションしやすい形へ変換する


5. validateClubNoticeInput(input),validateNoticeEditReferences
   - 失敗したら state に errors と values を返す

6. buildContentTargetRoles(input.targetRoles)
   - OWNERを必ず追加
   - 重複排除
   - COACH / OFFICER / MEMBER 以外の不正値を除外


8. now = new Date() を作る

9. buildNoticeUpdatePublishTimestamps({
     existingNotice,
     input,
     now
   })
   で firstPublishedAt / readRequiredAt を決める

10. resolveNoticeAttachmentChanges()
   - 削除対象PDFがこのお知らせ・このclubIdに属しているか確認する
   - 新規追加PDFを整理する
   - 削除対象storagePathを保持する

11. 新規PDFがある場合、Storageへアップロードする
   - path:
     clubs/${clubId}/notice/${noticeId}/${uuid}.pdf
   - uploadedFiles配列に保存結果を保持する

12. prisma.$transaction を実行する

   transaction内で行うこと：

   - Clubnoticeを更新する
   - updatedByMembershipId = adminMembership.id
   - ClubNoticeAttachmentを追加する
   - 削除対象のClubNoticeAttachmentを削除する
   - LINE通知ONならClubLineDeliveryをPENDINGで作成する

13. transaction失敗時
   - 新しくアップロード済みのStorageファイルを削除する
   - stateにエラーとvaluesを返す

14. transaction成功後
   - 削除対象だった古いStorageファイルを削除する
   - 古いStorage削除に失敗してもお知らせ更新は成功扱い
   - 失敗内容はログに残す

15. LINE通知ONの場合
   - sendPendingLineDeliveries を実行する
   - 成功した通知先は SENT
   - 失敗した通知先は FAILED
   - LINE送信失敗でもお知らせ更新は成功扱い

16. revalidatePathを実行する


17. redirectする
  管理用お知らせ一覧ページ

   削除時も上記と同じ

※ validateClubNoticeInput(input)：入力値Validation
※buildContentTargetRoles：正規化関数
※validateNoticeEditReferences()：DB参照Validation



チェック内容：

1. title が空でない
2. title が長すぎない
3. content が空でない
4. content が長すぎない
5. status が DRAFT / PUBLISHED のどちらか
6. genre が ClubNoticeGenre のどれか
7. isPinned が boolean として扱える値である
8. targetRoles はサーバー側で必ず OWNER を追加する
9. COACH / OFFICER / MEMBER の不正値は除外する
10. 新規PDFは application/pdf のみ
11. 新規PDFサイズは上限以内(編集後PDF総数 =既存PDF数 - 削除予定PDF数 + 新規PDF数)
12. PDFの添付数が上限以内
13. LINE通知ONの場合、最終statusは PUBLISHED であること
14. LINE通知ONの場合、lineTargetIds が1つ以上あること
15. lineTargetIds は同じclubIdの有効なClubLineTargetだけ許可する
16. requestId が空でない
17. 削除対象attachmentIdが、このclubId・このnoticeIdに属している

入力値Validation：
1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 16

正規化関数
8,9

DB参照Validation：
15, 17

【PDF更新フロー】
1. 既存attachmentsを取得する

2. formDataから deleteAttachmentIds を取得する

3. deleteAttachmentIds がすべて既存attachmentsに含まれているか確認する

4. 新規PDFがあればStorageへアップロードする

5. transaction内で、
   - 新規ClubNOticeAttachmentを作成する
   - 削除対象ClubNoticeAttachmentを削除する

6. transaction失敗時
   - 新規アップロード済みStorageを削除する

7. transaction成功後
   - 削除対象だった古いStorageを削除する

8. 古いStorage削除に失敗した場合
   - お知らせ更新は成功扱い
   - ログに残す

【ライン通知詳細】
LINE通知ONの場合：

1. 最終statusが PUBLISHED か確認する

2. 選択された通知先が同じclubIdの有効なClubLineTargetか確認する

3. requestId を使って ClubLineDelivery を PENDING で作成する

4. transaction完了後に sendPendingLineDeliveries() を実行する

5. 成功した通知先：
   status = SENT
   sentAt = now

6. 失敗した通知先：
   status = FAILED
   errorCode / errorDetail を保存

7. LINE通知に失敗しても、お知らせ更新は成功扱いにする

レートリミットはMVPでは設けないが二重送信防止は行う。

※レートリミットはMVPでは設けない。
理由：
管理者ページであり、連続編集や定期練習の作成があるため。

ただし、二重送信防止は行う。

クライアント側：
useFormStatus で pending 中は保存ボタンを disabled にする。

サーバー側：
通常のお知らせ更新は updateMany により同じ内容へ更新されるため大きな問題になりにくい。

ただし、LINE通知は requestId と idempotencyKey により二重通知履歴を防ぐ。

PDF追加はMVPでは pending による二重送信防止を基本とする。
将来的により厳密にする場合は、アップロードrequestIdやActionRequestテーブルで二重処理を防ぐ。

【削除アクション（deleteClubNoticeAction）の流れ】
関数名：
deleteClubNoticeAction(clubSlug, noticeId, formData)

1. requireClubAdminMembership(clubSlug)

2. noticeId + clubId でお知らせを取得する
   - attachmentsも取得する

3. 存在しなければ notFound()

4. 削除確認用の値を確認する
   - hidden confirmValue など
   - MVPでは確認モーダルのみでも可

5. prisma.$transaction
   - ClubNoticeを削除する
   - 関連する read / attachment / delivery は onDelete: Cascade で削除

6. transaction成功後
   - 事前に取得しておいた storagePath を使ってStorageファイルを削除する

7. Storage削除失敗時
   - 削除処理自体は成功扱い
   - ログに残す

8. revalidatePath
   - /club/[clubSlug]/admin/notice
   - /club/[clubSlug]/noticeなど

9. redirect
   管理用お知らせ一覧ページ

【お知らせ編集時の公開日時ルール】
ケース1：下書き保存
最終状態：

status = DRAFT

の場合、

firstPublishedAt
→ 既存値を維持

readRequiredAt
→ 既存値を維持

一度公開済みのお知らせを下書きへ戻しても、

firstPublishedAt = null

にはしない。

ケース2：一度も公開していない下書きを初公開
条件：

existingNotice.firstPublishedAt = null
かつ
input.status = PUBLISHED

結果：

firstPublishedAt = now
readRequiredAt = now

お知らせは初回公開時必ず未読。

ケース3：一度公開したものを下書きに戻し、再公開
条件：

existingNotice.status = DRAFT

existingNotice.firstPublishedAt != null

input.status = PUBLISHED

結果：

firstPublishedAt
→ 既存値

readRequiredAt
→ now

お知らせは再公開時に必ず再確認対象にする。

ケース4：公開中 → 公開中の通常編集
「この更新を利用者へ未読として再表示」がOFF：

firstPublishedAt
→ 変更なし

readRequiredAt
→ 変更なし

ON：

firstPublishedAt
→ 変更なし

readRequiredAt
→ now




※ redirect() と notFound() はNext.js内部で特殊な例外を利用するため、 大きなtry/catchで握りつぶさない。

※アクションのエラーメッセージをconstants/...というファイルにまとめておくこと


【PDF添付・更新 共通詳細設計】

使用する主な関数：
お知らせの場合：

resolveNoticeAttachmentChanges()
uploadClubNoticeAttachments()
deleteClubNoticeStorageObjects()

イベントの場合：

resolveEventAttachmentChanges()
uploadClubEventAttachments()
deleteClubEventStorageObjects()


【resolveNoticeAttachmentChanges()、resolveEventAttachmentChanges()】
役割：既存PDF
削除予定PDF
新規PDF

の差分を整理する。


1. deleteAttachmentIdsの重複を除去する

2. deleteAttachmentIdsが、
   existingAttachmentsに含まれることを確認する

3. 削除対象attachmentを抽出する

4. 削除しないattachmentを抽出する

5. 新規PDFを検証する
   - application/pdf
   - 最大容量以内

6. 保存後のPDF総数を計算する

   existingAttachments.length
   - deleteAttachments.length
   + newFiles.length

7. 上限を超えていたらエラーにする

8. 以下を返す

   keepAttachments
   deleteAttachments
   newFiles


【uploadClubEventAttachments()、uploadClubNoticeAttachments()】
1. 各PDF用にuuidを生成する

2. Storage pathを作る

clubs/${clubId}/notices/${noticeId}/${uuid}.pdf

3. Supabase Storageへアップロードする

4. アップロード成功したファイルについて、

storagePath
fileName
mimeType
sizeBytes

を保持する

5. 途中のPDFアップロードで失敗した場合、
今回の処理ですでにアップロード済みのファイルを削除する

6. エラーを上位へ返す

【DB transaction】

Storageへの新規アップロード成功後、
prisma.$transactionを開始する。

transaction内：

1. ClubNoticeを更新する

2. 新規ClubNoticeAttachmentを作成する

3. 削除予定ClubNoticeAttachmentをDBから削除する

transaction失敗：

今回新規アップロードしたStorageファイルのみ削除する。

既存PDFはStorageからまだ削除していないため、そのまま維持される。


transaction成功後

削除予定だった既存PDFのStorageオブジェクトを削除する。

ここが大事。
旧PDFはDB更新成功後に消す。
順番：

新PDF Storage追加
↓
DB更新
↓
旧PDF Storage削除



【deleteClubNoticeStorageObjects()、deleteClubEventStorageObjects()】
入力：

storagePaths: string[]

処理：

1. Storageから対象ファイルを削除する

2. 全件成功
   → 正常終了

3. 一部または全部失敗
   → DB処理はrollbackしない
   → 失敗storagePathをログに残す



共通詳細設計：LINE通知処理

使用する主な関数：
createEventLineDeliveries()
createNoticeLineDeliveries()
sendPendingLineDeliveries()（PENDING：保留状態になっているライン通知を一括で送信する関数）

LINE通知を行う条件

shouldNotifyLine = true
かつ
status = PUBLISHED

の場合だけ実行する。
下書きではLINE通知不可。


1. 通知対象を検証
Server Action側で、

TargetIds（ClubLineTargetのid）

を受け取る。
DBから、

clubId = 現在のクラブ
id IN TargetIds
isEnabled = true

で取得する。
送信されたID数と、DBから取得できた通知先数が一致することを確認する。
一致しない場合、

不正なLINE通知先が含まれている

として保存処理を止める。

2. requestIdを確認する
LINE通知ONなら、

requestId

必須。
例：

9a14c...

今回の保存操作に伴うLINE通知を識別する。

3. idempotencyKey を作る
お知らせ：

notice:{noticeId}:request:{requestId}:target:{targetId}

イベント：

event:{eventId}:request:{requestId}:target:{targetId}

通知先ごとに異なるキーを作る。

4. ClubLineDelivery をPENDINGで作る
transaction内で、
通知先ごとに、

clubId
targetId
noticeId または eventId
requestedByMembershipId
status = PENDING
requestedAt = now
requestId
idempotencyKey

を保存する。

5. 同じ idempotencyKey が存在する場合
これは明記しておいた方がいいです。

同一idempotencyKeyのClubLineDeliveryを二重作成しない。

同じ保存操作が再実行された場合でも、
同じ通知先へのLINE通知をもう一度送らない。

つまり、

unique idempotencyKey

をDB側でも保証する。

6. transaction完了後にLINE APIへ送信する
ここ大事です。

DB transaction中にLINE Messaging APIを呼ばない。

順番：

ClubNotice / ClubEvent保存
↓
ClubLineDelivery PENDING作成
↓
transaction commit
↓
LINE API送信

です。
LINE APIが遅いからといってDB transactionを長時間保持しない。

7. sendPendingLineDeliveries()
入力：

{
  clubId,
  deliveryIds
}

おすすめはこのActionで新しく作ったdeliveryだけを渡すことです。
「このrequestIdのPENDINGを全部送る」より安全です。
処理：

1. deliveryIds + clubIdでClubLineDeliveryを取得する

2. status = PENDING のものだけ対象にする

3. ClubLineTargetを取得する

4. ClubLineSettingからAccess Tokenを取得・復号する

5. LINE Messaging APIへ送信する

6. 成功
   → status = SENT
   → sentAt = 現在日時

7. 失敗
   → status = FAILED
   → errorCode
   → errorDetail


8. 一部だけ失敗した場合
例えば、

保護者グループ
→ SENT

コーチグループ
→ FAILED

役員グループ
→ SENT

でも、

ClubNotice / ClubEventの更新自体は成功

とする。
redirect後に必要なら、

お知らせを更新しました。
一部のLINE通知に失敗しました。

と表示する。

9. LINE通知失敗でイベント・お知らせをrollbackしない
明記していいです。

LINE通知はDB保存後に行う副作用として扱う。

LINE通知失敗を理由に、
作成・編集済みのClubNotice / ClubEventをrollbackしない。

これかなり大事。

10. 再送ルール
既に決めたルールも共通設計に入れます。

SENT
→ 再送しない

FAILED
→ 明示的な再送操作のみ許可

再送時
→ 新しいrequestIdを発行
→ 新しいClubLineDeliveryを作成

前回の失敗deliveryを、

FAILED → PENDING

に戻して使い回さない。
履歴として残す。

11. 二重送信防止
ここは現在の文章を少し修正した方がいいです。
現在：
通常のお知らせ更新は updateMany により同じ内容へ更新されるため大きな問題になりにくい。
updateMany だから安全なのではありません。
正確には、

お知らせ本体の更新は、
同じ入力内容で複数回UPDATEされても、
最終的なデータ内容がほぼ同じになるため、
MVPではAction全体の厳密な冪等制御までは行わない。

です。
ただし、

LINE送信
PDF追加

は副作用なので別。
詳細設計はこう。

【二重送信防止】

クライアント側：

useFormStatusによりpending中は保存ボタンをdisabledにする。


サーバー側：

ClubNotice / ClubEvent本体：
MVPではActionRequest等による厳密な二重実行防止は行わない。

LINE通知：
requestId + idempotencyKey + DB unique制約により、
同じ通知操作の二重送信を防止する。

PDF：
MVPではpendingによる連続送信防止を基本とする。

将来的に厳密な二重処理防止が必要になった場合は、
ActionRequestやアップロードrequestIdを導入する。

※注意点
idempotencyKeyによるunique制約は、
ClubLineDeliveryの二重作成防止には有効。

ただし、完全に同時に2つのServer Actionが実行された場合、
「同じPENDINGレコードを2つの処理がLINE APIへ送信する」
競合まで完全に防ぐには、送信処理のclaim機構やキュー処理が必要になる。

MVPでは、
・pendingによるUI側の連打防止
・idempotencyKey unique
・今回作成したdeliveryIdのみsendPendingLineDeliveriesへ渡す

までを実装する。

実運用で同時送信問題が確認された場合、
SENDING状態やジョブキュー方式を検討する。



（OWNER用）メンバー管理・設定ページ 詳細設計

対象ページ

/club/[clubSlug]/admin/members

対象ファイル

app/(club-app)/club/[clubSlug]/admin/members/page.tsx

app/(club-app)/club/[clubSlug]/admin/members/MemberInviteForm.tsx

app/(club-app)/club/[clubSlug]/admin/members/MemberListTable.tsx

app/(club-app)/club/[clubSlug]/admin/members/MemberEditModal.tsx

app/(club-app)/club/[clubSlug]/admin/members/InviteCancelButton.tsx

app/(club-app)/club/[clubSlug]/admin/members/actions.ts

共通処理を切り出すなら

lib/club/members/member-form.ts
lib/club/members/member-validation.ts
lib/club/members/member-invitation.ts
lib/club/members/member-role-status.ts

lib/repositories/club-membership.ts
lib/repositories/club-invitation.ts



使用する主な関数

requireClubOwner(clubSlug)

findClubMembersForOwner(clubId)

buildMemberInviteFormValues(formData)

parseMemberInviteFormData(formData)

normalizeEmail(email)

validateMemberInviteInput(input)

validateMemberInviteReferences({
  clubId,
  input
})

createClubInvitationToken()

hashClubInvitationToken(token)

createClubMemberInvitation()

sendClubInvitationEmail()

buildMemberEditFormValues(formData)

parseMemberEditFormData(formData)

validateMemberEditInput(input)

validateMemberEditReferences({
  clubId,
  membershipId,
  input
})

assertActiveOwnerInvariant()

cancelClubInvitation()

revalidateClubMembersPath()


【page.tsx の流れ】
1. paramsから clubSlug を取得する

2. searchParams を取得する
成功トースト表示用。

invited
updated
cancelled
toastId

など。

3. requireClubOwner(clubSlug) を実行する

OWNERのみ

role = OWNER
かつ
status = ACTIVE

を許可。

未ログイン
→ /club-loginへredirect

ログイン済みだがOWNERではない
→ notFound()


4. findClubMembersForOwner(clubId) を実行する
対象クラブの全 ClubMembership を取得する。

取得対象：

ClubMembership.id
role
status
createdAt

AppUser.id
AppUser.name
AppUser.email

Prismaイメージ：

where: {
  clubId: ownerMembership.club.id,
}

include: {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
}


5. ACTIVE OWNER数を計算する

role = OWNER
AND
status = ACTIVE

の人数を計算する。
各メンバーについて、

isLastActiveOwner

を作ってもよい。

const isLastActiveOwner =
  member.role === "OWNER" &&
  member.status === "ACTIVE" &&
  activeOwnerCount === 1;

これはUI制御用。
ただし、Server Action側でも必ず再判定する。

6. MemberInviteForm へpropsを渡す

clubSlug
initialState


7. MemberListTable へpropsを渡す

members
activeOwnerCount
currentMembershipId

必要に応じて各行から、

MemberEditModal
InviteCancelButton

を表示する。

【MemberInviteForm.tsx】
重要修正：パスワード欄は置かない
招待フォームで入力するのは、

メールアドレス
氏名
権限

だけ。


1. 招待フォームを表示する

メールアドレス
氏名
権限

権限：

COACH
OFFICER
MEMBER

初期値：

MEMBER

新規招待ではOWNERを選択できない方針でOKです。
OWNERへ昇格させる場合は、

招待
↓
本人が承諾
↓
ACTIVE
↓
既存OWNERが編集画面からOWNERへ変更

とします。

2. useActionState で inviteClubMemberAction を呼ぶ

3. エラー時の入力値を復元する

defaultValue={state.values?.email ?? ""}


defaultValue={state.values?.name ?? ""}

role：

state.values.role
があれば復元
なければMEMBER


4. state.errors を各入力欄付近に表示する

5. useFormStatus でpending制御
通常：

招待メールを送信する

pending：

送信中…

かつdisabled。

6. 招待前に確認モーダルを表示する
例：

以下の内容でメンバーを招待しますか？

メール：
yamada@example.com

氏名：
山田 太郎

権限：
会員



失敗
→ stateをreturn
→ 入力値を残す

成功
→ /admin/members?invited=1...
   へredirect
→ 新しいページになるのでフォームは初期状態

これで十分です。

【招待Action】
関数名：

inviteClubMemberAction(
  clubSlug,
  prevState,
  formData
)

【新規ユーザー招待】
1. requireClubOwner(clubSlug)
OWNER + ACTIVEを確認。

2. buildMemberInviteFormValues(formData)
エラー時に戻すための値。

email
name
role


3. parseMemberInviteFormData(formData)
処理用データへ変換。

4. normalizeEmail()
これは「正規化関数」を作ってOKです。

trim
小文字化

例えば：

yamada@EXAMPLE.COM
↓
yamada@example.com



UI初期値
→ MEMBER

Server Action
→ COACH / OFFICER / MEMBER のどれかであることを検証

不正値
→ MEMBERへ勝手に変換せずエラー

つまり、

normalizeEmail()

はあり。



5. validateMemberInviteInput(input)
純粋な入力値チェック。

1. emailが空でない

2. email形式が正しい

3. emailが長すぎない

4. nameが空でない

5. nameが長すぎない

6. roleが以下のいずれか

   COACH
   OFFICER
   MEMBER

7. OWNERは新規招待では許可しない

status はフォームから受け取らない。
サーバー側で必ず、

INVITED

にする。

6. validateMemberInviteReferences()
DBを使うチェック。
まず正規化済みemailから AppUser を検索する。

AppUserが存在する場合
対象クラブの ClubMembership が存在するか確認する。

存在しない
→ 招待可能

INVITED
→ 「すでに招待済みです」

ACTIVE
→ 「すでにクラブへ登録されています」

SUSPENDED
→ 新規招待しない
   既存メンバーの状態変更で対応

WITHDRAWN
→ 新規招待しない
   既存メンバーの状態変更で対応

@@unique([clubId, userId]) があるため、この方針とDB設計も一致します。

AppUserが存在しない場合
新規Authユーザーとして招待処理へ進む。

未承諾招待も確認する

clubId
email
acceptedAt = null

の ClubInvitation が既に存在する場合は、二重招待を防止する。
MVPでは、

すでに招待中です。
招待を取り消してから再度招待してください。

でOKです。

7. ClubInvitation tokenを作る

rawToken

をランダム生成。
DBにはrawTokenそのものを保存しない。

SHA-256等でhash化
↓
tokenHashとして保存

有効期限：

expiresAt = now + 24時間


8. AppUserの有無で処理を分岐する
 新規AppUserの場合で分岐する
今回 ClubEmailSetting + Resend を持つため、ホームページも含めてマルチテナント化する際に、Supabaseで招待リンクだけ生成し、メール送信自体はResendに統一する方式にする。

つまり

Supabase
→ 認証用invite link生成

Resend
→ クラブ名入りの招待メールを送る

にする

具体的には、
ClubInvitation.rawToken
↓
generateLink の redirectTo に
/welcome?invitationToken={rawToken}
を設定
↓
Resendメール内のSupabase招待リンクをクリック
↓
Supabase Auth認証処理
↓
/welcome?invitationToken={rawToken}

9. expiresAtを作る

10. Supabase AuthのgenerateLink()を実行する

   type = invite
   email = 招待先メール

   redirectToには、
   /welcomeへ戻るURLを指定する。

   この処理でSupabase Auth側の新規ユーザーと
   招待用認証リンクを準備する。

11. Supabase Auth user.idを取得する

12. Prisma transaction

   AppUser作成

   ClubMembership作成
   status = INVITED

   ClubInvitation作成
   membershipId = 作成したClubMembership.id
   tokenHash
   expiresAt
   invitedByMembershipId

13. transaction成功後、
    Resendから招待メールを送信する

   From：
   ${club.name} <共通MAIL_FROM_ADDRESS>

   To：
   招待先email

   メール本文：
   クラブ名
   招待されたrole
   初期設定ボタン

   初期設定ボタン：
   Supabase generateLinkで取得した認証リンク

14. Resend送信成功
   → 招待成功

15. revalidatePath()

16. 管理者メンバー一覧へredirect

【既存AppUserを別クラブへ招待】

1. Supabase generateLink(type: invite)は使わない

2. 既存Supabase Authユーザーも変更しない

3. ClubMembership
   status = INVITED
   を作成

4. ClubInvitationを作成

5. Resendからクラブ参加案内を送る

メール内リンク：

/club-login?invitationToken={rawToken}

6. 既存メールアドレス・既存パスワードでログイン

7. ClubInvitationを検証

8. ClubMembership
   INVITED → ACTIVE

9. ClubInvitation.acceptedAt = now

【まとめ】
Supabase Authログイン成功
↓
invitationToken がある？
    ↓ Yes
ClubInvitation検証
membership.userId === Auth user.id 確認
expiresAt確認
acceptedAt === null確認
membership.status === INVITED確認
↓
transaction
acceptedAt = now
membership.status = ACTIVE
↓
その後にACTIVE Membership件数を判定
↓
1クラブ → events
2クラブ以上 → /club/select

【MemberEditModal.tsx】
1. 対象メンバー情報を表示

氏名
メール
現在のrole
現在のstatus


2. role入力

OWNER
COACH
OFFICER
MEMBER


3. status入力
ここは基本設計を少し厳密化した方がいいです。
INVITED は普通の状態変更先として使わない方がいいです。

INVITED
= まだ招待を承諾していない状態

だからです。
おすすめルール：

現在INVITED：
statusはINVITED固定
activationは招待承諾時のみ

現在ACTIVE：
ACTIVE
SUSPENDED
WITHDRAWN

現在SUSPENDED：
ACTIVE
SUSPENDED
WITHDRAWN

現在WITHDRAWN：
ACTIVE
WITHDRAWN

少なくとも、

ACTIVE → INVITED
WITHDRAWN → INVITED

は禁止。

4. INVITEDメンバーではOWNERを選択不可にする
新規招待時と揃えて、

INVITED
→ COACH / OFFICER / MEMBER

のみ。
一度ACTIVEになってからOWNERへ昇格させる。

5. useActionState

updateClubMemberAction

を呼ぶ。

6. エラー時は入力値を復元

7. pending中は保存ボタンdisabled

8. 変更前確認モーダル
通常：

この内容でメンバー情報を変更しますか？

OWNER変更の場合：

このメンバーのOWNER権限を変更します。

権限変更後は、利用できる管理機能が変わります。
変更しますか？

SUSPENDED / WITHDRAWN：

変更後、このメンバーはアプリを利用できなくなります。
変更しますか？


最後のACTIVE OWNER UI
isLastActiveOwner = true の場合、

OWNER以外のrole
→ disabled

SUSPENDED
WITHDRAWN
→ disabled

注意文：

このメンバーは現在、最後の有効なOWNERです。

先に別のメンバーをOWNERにしてから、
権限やステータスを変更してください。

これは基本設計とも一致しています。

【updateClubMemberAction】
関数名：

updateClubMemberAction(
  clubSlug,
  membershipId,
  prevState,
  formData
)

membershipId はできればhiddenを信用するのではなく、

updateClubMemberAction.bind(
  null,
  clubSlug,
  membershipId
)

のように渡す。

1. requireClubOwner(clubSlug)

2. buildMemberEditFormValues()

role
status


3. 対象ClubMembershipを取得

id = membershipId
clubId = ownerMembership.club.id

必ず両方。
取得できなければ notFound() またはAction error。

4. parseMemberEditFormData()

5. validateMemberEditInput()

roleが

OWNER
COACH
OFFICER
MEMBER

のいずれか。


statusが

INVITED
ACTIVE
SUSPENDED
WITHDRAWN

のいずれか。


6. role / status遷移ルールを確認


INVITED → ACTIVE
は編集画面から行わない。

INVITED → SUSPENDED
不可

INVITED → WITHDRAWN
不可

ACTIVE / SUSPENDED / WITHDRAWN
→ INVITED
不可

INVITEDのactivationは招待承諾Actionだけ。

7. ACTIVE OWNERを外れる変更か判定

const targetIsActiveOwner =
  target.role === "OWNER" &&
  target.status === "ACTIVE";

const willStopBeingActiveOwner =
  targetIsActiveOwner &&
  (
    nextRole !== "OWNER" ||
    nextStatus !== "ACTIVE"
  );


8. OWNER invariantを確認
willStopBeingActiveOwner の場合、
同じclubIdの、

role = OWNER
status = ACTIVE
id != targetMembership.id

を数える。
0人なら拒否。

LAST_ACTIVE_OWNER_REQUIRED


9. DB更新
ここは可能ならtransaction内で、

対象Membership再取得
↓
ACTIVE OWNER数再確認
↓
更新

まで行います。
理由は、

OWNER A
OWNER B

が同時に自分を降格しようとした場合、
両方が「もう1人OWNERがいる」と判定してしまう競合を減らすためです。
MVPではSerializable相当の強いtransaction分離レベルを使ってOWNER人数確認と更新をまとめる設計にしておくと安全です。

10. ClubMembership を更新

where:
id
clubId

data:
role
status

Supabase Authは変更しない。
AppUserも変更しない。

11. 成功

revalidatePath(...)

↓

/admin/members
?updated=1
&toastId=...

へredirect。

12. 失敗
redirectしない。

return {
  ok: false,
  values,
  errors,
};

モーダルを開いたままエラー表示。

【InviteCancelButton.tsx】
status = INVITED のメンバーにだけ表示。

1. 招待取消ボタン

招待取消


2. 確認モーダル

山田 太郎さんへの招待を取り消しますか？

招待リンクは利用できなくなります。


3. pending中disabled

4. cancelClubInvitationAction() を呼ぶ

【cancelClubInvitationAction】

cancelClubInvitationAction(
  clubSlug,
  membershipId,
  formData
)

1. requireClubOwner(clubSlug)
2. membershipを

id + clubId

で取得。
3. status = INVITED を確認
そうでなければ拒否。
4. 未承諾ClubInvitationを取得
現在のSchemaなら、

clubId
email = membership.user.email
acceptedAt = null

で探す。
5. transaction

未承諾ClubInvitation削除

ClubMembership削除

6. 削除しないもの

Supabase Auth
AppUser

これは現在の基本方針そのものです。
7. revalidate
8. redirect

/admin/members
?cancelled=1
&toastId=...



初回パスワード設定は別Action


① OWNERページ
inviteClubMemberAction()

② /welcome
completeClubInvitationAction()

OWNERページのActionは、

招待を作る
メールを送る

ところまで。
/welcome 側は、

招待token確認
↓
Supabaseセッション確認
↓
本人がpassword設定
↓
ClubInvitation確認
↓
ClubMembership INVITED → ACTIVE
↓
acceptedAt = now
↓
イベント一覧へredirect

です。
この2つを混ぜないのがかなり大事です。

最終的なAction構成
このページは、実質3本です。

actions.ts

inviteClubMemberAction()
→ 新規招待

updateClubMemberAction()
→ role / status変更

cancelClubInvitationAction()
→ INVITED招待取消

そして別ページ：

/welcome/actions.ts

completeClubInvitationAction()
→ 初回設定・招待承諾


◯Resendについて
現在、顧客ごとにアカウントを生成しているが、マルチテナント化後には、以下のようにアカウントを一つにして共通送信ドメインにする。
Resendアカウント（開発者）
1個

認証ドメイン（開発者）
1個

APIキー（開発者）
1個

DNS設定（開発者）
1回

という共通送信ドメインにする。

【現在】
ARAO U-12 HP
↓
問い合わせフォーム
↓
ARAO U-12専用Resend
↓
管理者へメール

【修正後】
ARAO U-12 HP
↓
問い合わせフォーム
↓
共通sendEmail()
↓
あなたのResend
↓
ARAO U-12管理者へメール


イメージ
あなたのResendアカウント
        │
        ├─ あなたの送信用ドメインを1個だけ認証
        │
        │  例：
        │  mail.club-app.jp
        │
        ├─ ホームページのお問い合わせ通知
        ├─ ホームページの体験・見学通知
        ├─ アプリのメンバー招待
        ├─ パスワード再設定
        └─ その他システムメール

すべてここから送信

DBのresendApiKeyEncryptedは要らなくなる。
【各クラブの独自ドメインから送る場合は料金が１万円くらい発生するから、共通ドメインにすること】


ログイン後のクラブ判定　　詳細設計
使用する主な関数

signInClubUserAction()

buildClubLoginFormValues()

parseClubLoginFormData()

validateClubLoginInput()

findActiveClubMembershipsForUser()

resolvePostLoginDestination()

requireActiveClubMembership()

【ログインフォームの流れ】
1. 入力フォームを表示する

メールアドレス
パスワード


2. useActionState で signInClubUserAction() を呼ぶ

3. state.values がある場合はメールアドレスを復元する

defaultValue={state.values?.email ?? ""}

パスワードはエラー時でも復元しない。

4. state.errors を表示する
セキュリティ上、

このメールアドレスは登録されていません

などとは細かく表示せず、

メールアドレスまたはパスワードが正しくありません。

程度にする。

5. useFormStatus でpending制御
通常：

ログインする

pending：

ログイン中…

かつdisabled。

【signInClubUserAction の流れ】

signInClubUserAction(
  prevState,
  formData
)

1. buildClubLoginFormValues(formData)
エラー時にフォームへ戻す値を作る。

email

パスワードはstateへ戻さない。

2. parseClubLoginFormData(formData)
処理しやすい形へ変換する。

3. メールアドレスを正規化する

trim
小文字化

例えば、

 TEST@EXAMPLE.COM
↓
test@example.com


4. validateClubLoginInput(input)
入力値バリデーション。

emailが空でない

email形式が正しい

passwordが空でない


5. Supabase Authで認証する

supabase.auth.signInWithPassword({
  email,
  password,
});

認証失敗：

メールアドレスまたはパスワードが正しくありません。

としてstateをreturn。


6. Supabase Auth userを取得する
ログイン成功後の、

user.id

を取得する。
今回の設計では、

Supabase Auth user.id
        ↓
AppUser.id

が対応します。

７.PlatformAdminを確認する 

８. ACTIVEなPlatformAdminで、 Platform画面へのアクセスとしてログインした場合 → /platform/support 



９. 通常利用者の場合 → AppUserを確認する

AppUser.id = Supabase Auth user.id

を確認する。
存在しない場合は、Authだけ存在してアプリDBとの整合が取れていない状態なので、アプリを利用させない。

アカウント情報を確認できませんでした。

などとして処理する。
必要ならSupabaseからsignOutしてログイン画面へ戻す。

１０. ACTIVEなClubMembershipを取得する
ユーザーが持っている全Membership数ではなく、ACTIVEなMembershipだけをクラブ判定に使います。

where: {
  userId: user.id,
  status: "ACTIVE",
}

Clubも同時に取得。

include: {
  club: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
}

つまり、

INVITED
SUSPENDED
WITHDRAWN

はクラブ選択候補に含めません。

１１. ACTIVE Membership数を判定する
0件の場合
アプリへ入れない。
ただし状態によって意味が違います。

INVITEDしかない
→ 招待手続きが未完了

SUSPENDEDしかない
→ 利用停止中

WITHDRAWNしかない
→ 退会済み

Membership自体がない
→ 所属クラブなし

通常ログインから INVITED → ACTIVE へ勝手に変更してはいけません。
INVITEDの有効化は、

招待メール
↓
招待承諾
↓
/welcome等の招待完了処理

だけで行います。
ユーザーへの表示は細かい内部情報を出しすぎず、

現在利用できるクラブがありません。
招待手続きが未完了の場合は、招待メールから登録を完了してください。


ACTIVE Membershipが1件の場合
クラブ選択画面を表示しない。
取得したClubの、

club.slug

を使って、

redirect(
  `/club/${membership.club.slug}/events`
);

とする。
例えば、

ARAO U-12

slug =
arao-u12

なら、

/club/arao-u12/events

へ直接遷移。

ACTIVE Membershipが2件以上の場合

redirect("/club/select");

クラブ選択画面へ遷移する。




Supabase Authのログインユーザーと、
ClubMembershipの所属クラブは別々に扱う。

ログイン成功後、Supabase Auth user.idを取得する。

そのuser.idを使い、

ClubMembership.userId = user.id
かつ
ClubMembership.status = ACTIVE

のMembershipを取得する。

クラブ判定に使用するのはACTIVE状態のMembershipのみとし、
INVITED / SUSPENDED / WITHDRAWNはクラブ選択候補に含めない。

ACTIVEな所属クラブ数によって遷移先を分ける。

0件：
アプリを利用させない。
招待手続き未完了、利用停止、退会などに応じた案内を表示する。

1件：
Club.slugを取得し、

/club/[clubSlug]/events

へ直接redirectする。

2件以上：

/club/select

へredirectする。

クラブ選択画面では、
ログインユーザーがACTIVE状態で所属しているクラブだけを表示する。

利用者がクラブを選択した場合、
選択したClub.slugをURLに使用して、

/club/[clubSlug]/events

へ遷移する。

clubSlugをセッションやClubMembershipへ「現在のクラブ」として保存する必要はない。
現在操作しているクラブはURLの[clubSlug]で表現する。

slug付きURLへ遷移した後は、
各ページおよび[clubSlug]/layout.tsxで

requireActiveClubMembership(clubSlug)

を実行し、

Supabase Auth user.id
Club.id
ClubMembership.userId
ClubMembership.clubId
ClubMembership.status = ACTIVE

の整合性を必ず確認する。

URLを手動変更して他クラブのclubSlugを指定しても、
ACTIVEなClubMembershipが存在しなければアクセスを許可しない。

