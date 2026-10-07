//docs/memo2.md
//開発中の学習メモをそのまま載せています（原本）

◯DBでのsetnullについて：ライン送信履歴で以下のようにイベントIDを送信履歴テーブルにリレーションする際、
event ClubEvent? @relation(
  fields: [eventId],
  references: [id],
  onDelete: SetNull
)
なぜsetnullにするのか
→イベント削除時に履歴自体を削除せずにイベントidのみnullにして
LINE送信履歴
 ├─ eventId = null
 ├─ contentTitle = "8月の練習"
 └─ messageSnapshot = "集合は9時です"
 というように履歴を残しておくため

※複合（二つを結びつける）外部キー（他の場所にある参照しているコード）の場合、setnullにするとイベントを削除したらeventId, clubIdの両方がsetnullになり、エラーになってしまうので注意すること。
event ClubEvent? @relation(
  fields: [eventId, clubId],
  references: [id, clubId],
  onDelete: SetNull
)

※まとめ
Setnull：親が削除されたら子の外部キーは削除ではなくがnullになる
Cascade：親が削除されたら子も削除される
Restrict：親がいる限り親は削除されない
SetDefault：親が消えたら、子の外部キーをあらかじめ設定しておいた「デフォルト値（初期値）」に書き換える

◯【重要！】次メインにマージするときはPRした残りからマージする


◯先に開発ページから作るのではなくて、開発基板、DB、アプリ認可基板、共通基板から実装してから、ログインやレイアウトを実装し、その後に各機能やページなどを実装するようにすると、責務分離等が楽。

◯イベントアクションの削除処理失敗時の処理の仕方を考える

◯既読更新について
Server Componentでは既読更新しない（サーバーでページデータを取ってきて表示した後にクライアントコンポーネントでuseEffectなどで既読アクション関数を読んできてDBの既読データを追加する）
このほうがページ表示が早い。


お知らせの公開日時ルール

| 操作        | `firstPublishedAt` | `readRequiredAt` |
| --------- | -----------------: | ---------------: |
| 新規下書き     |             `null` |           `null` |
| 初回公開      |              `now` |            `now` |
| 公開中の通常編集  |                 維持 |               維持 |
| 公開中の再確認ON |                 維持 |            `now` |
| 公開済み→下書き  |                 維持 |               維持 |
| 下書き→再公開   |                 維持 |            `now` |


イベントの公開日時ルール
| 操作             | `firstPublishedAt` | `readRequiredAt` |
| -------------- | -----------------: | ---------------: |
| 新規下書き          |             `null` |           `null` |
| 初回公開・確認必須ON    |              `now` |            `now` |
| 初回公開・確認必須OFF   |              `now` |           `null` |
| 公開中の通常編集       |                 維持 |               維持 |
| 公開中の再確認ON      |                 維持 |            `now` |
| 公開済み→下書き       |                 維持 |               維持 |
| 下書き→再公開・再確認ON  |                 維持 |            `now` |
| 下書き→再公開・再確認OFF |                 維持 |               維持 |


アプリ開発で難しかったところ
・HPとアプリで練習スケジュール変更とお知らせを同じnoticeで表記していたので、
途中で命名を変更したところが少し手間取った


◯お知らせのエラー対応
| 状況                               | 表示              |
| -------------------------------- | --------------- |
| Repositoryが`null`を返し`notFound()` | `not-found.tsx` |
| Prisma接続障害などで例外                  | `error.tsx`     |
| 正常取得                             | `page.tsx`      |

◯ルート規約ファイルとは：開発者が自分で「このURLのときはこのファイルを読み込む」という設定を書く必要がなく、特定の名前でファイルを保存するだけで機能が有効になる
例）
page.tsx:メイン画面
layout.tsx:複数画面で使い回す共通の枠組み
loading.tsx:読み込み中画面（スケルトンなど）
error.tsx:エラー表示画面（真っ白になるのを防ぐ）
not-found.tsx:ページが見つからない時の画面

◯イベントとお知らせの実装で共通関数化しながら進めるのが難しかった。具体的には、イベント作成→お知らせ作成→共通関数化しようとしたけど、イベントとお知らせを共通のUIで実装するのに一つずつAIに確かめながら実装する必要があった。確認作業のようなものが必要だった（逆にここを怠らなければ大丈夫）

◯カレンダー表示のところのコードを再度理解し直すこと

◯ライン通知先グループを登録する流れ
【フェーズ1: コード発行】オーナーが画面でコードを発行 (DBにはハッシュのみ保存)
      ↓
【フェーズ2: LINE側操作】グループに公式LINEを招待し、生のコードをチャットに投稿
      ↓
【フェーズ3: 自動連携】  LINE Webhookが検知。サーバーで「その場でハッシュ化」して照合。
                        一致したらコードを即時失効(expiresAt=now)し、通知先を「仮登録」
      ↓
【フェーズ4: 最終有効化】オーナーが管理画面で確認し、「有効」ボタンを押して連携完了！

※詳細は以下の通り
🔓 フェーズ1：オーナーによる登録コード発行（管理画面）
1. オーナーの操作：
管理画面の「LINEグループ連携」ページで、「新しい登録コードを発行する」ボタンを押します。
2. 裏側のプログラムの動き：
	• requireClubOwner(clubSlug) が走り、本当に管理者かどうかを厳重チェックします。
	• システムが、絶対に予測不可能な暗号学的乱数で「生のコード（raw token）」を生成します。
	• 生成された生コードをその場で即座に「ハッシュ化（暗号化）」します。
	• replaceClubLineRegistrationToken() が実行され、もし過去に発行したきり未使用だった古いコードがあれば一瞬で失効（爆破）させます。
	• DBには安全のために「ハッシュ化したデータのみ」を保存します。
3. 画面の表示：
画面には、今回発行された「生のコード（例：club-app-xyz123）」が1度だけ表示されます。オーナーはこれをコピーします。

💬 フェーズ2：LINEグループでの連携操作（ユーザーの操作）
1. グループ作成：
オーナー（または部員）が、通知を飛ばしたいLINEの「グループライン」を開きます。
2. ボット招待：
そのLINEグループに、クラブ専用の「公式LINEアカウント（LINE Bot）」を友だち招待します。
3. コード投稿：
グループチャット内に、先ほどコピーした生のコード club-app-xyz123 をそのままメッセージとして送信（投稿）します。

⚙️ フェーズ3：LINE Webhookによる自動照合と仮登録（サーバーの裏側）
メッセージが投稿された瞬間、プログラムが全自動で以下の高速処理を行います。
1. Webhookが起動：
LINEから、Next.jsのURL /api/line/webhook/[webhookKey] 宛てに「メッセージが届いたよ」とデータが送られてきます。
2. セキュリティ検証：
	• findClubLineSettingForWebhook() で対象のクラブ設定を特定。
	• DBから「Channel Secret」を復号して取り出し、LINE公式からの本物の通信か「署名検証」を行います。
	• destination（ボットID）が正しいか照合します。
3. ハッシュ化と照合：
	• 届いたチャット内容から、登録コード部分をきれいに抜き出します。
	• 抜き出した生のコードを、サーバーの中で「その場でハッシュ化」します。
4. DB書き換え（トランザクション）：
	• consumeClubLineRegistrationTokenAndUpsertTarget() が起動。
	• 「その場でハッシュ化したもの」と「DBに保存されているハッシュ」を照合し、一致していればコードを「使用済み（失効）」にします。
	• これにより、同じコードは二度と使えなくなります。
	• DBの Target テーブルに、このLINEグループの情報（IDなど）を上書き・または新規作成（upsert）します。
	• 注意： この時点では、悪意ある登録を防ぐため isEnabled = false（まだ無効・仮登録状態） として保存されます。

🎯 フェーズ4：オーナーによる最終確認と「有効化」（管理画面）
1. オーナーの操作：
オーナーが再び管理画面を開くと、先ほどまで「未連携」だったステータスが、「新しいLINEグループ（仮登録）からの申請があります」という表示に切り替わっています。
2. 有効化ボタンをポチる：
グループ名（例：「Arao U12 保護者会グループ」など）が正しいことを確認し、画面にある「有効化（承認）」ボタンを押します。
3. 連携完了：
DBの isEnabled が true に書き換わり、ロックが解除されます。これ以降、スケジュールされたCronやお知らせの通知が、このLINEグループへ100%安全かつ確実に自動配信されるようになります！


【ライン通知先変更について】
ユーザー操作からDBまでの処理フロー
通知先編集
順序	ファイル・関数
1	ClubLineTargetForm.tsxから送信
2	updateClubLineTargetAction()
3	requireClubAppOwnerAccess()
4	buildClubLineTargetFormValues()
5	validateClubLineTargetFormValues()
6	updateClubLineTargetForOwner()
7	ClubLineTargetをtargetId + clubIdで更新
8	revalidateClubSettingsPaths()
9	設定ページへredirect
登録コード発行
順序	ファイル・関数
1	ClubLineRegistrationCodePanel.tsx
2	createClubLineRegistrationCodeAction()
3	OWNER認可
4	createSecureToken()
5	buildClubLineRegistrationCode()
6	hashToken()
7	replaceClubLineRegistrationToken()
8	旧未使用コードを期限切れ化
9	hashだけDB保存
10	生コードをActionStateへ一度だけ返す
Webhook登録
順序	ファイル・関数
1	app/api/line/webhook/[webhookKey]/route.ts
2	handleClubLineWebhook()
3	findClubLineSettingForWebhook()
4	decryptLineCredential()
5	verifyLineWebhookSignature()
6	parseLineWebhookPayload()
7	destination === lineBotUserId確認
8	parseClubLineRegistrationCode()
9	hashToken()
10	consumeClubLineRegistrationTokenAndUpsertTarget()
11	transaction内でtokenを条件付き消費
12	TargetをisEnabled=falseでupsert
13	設定ページを再検証


新会員のメンバーシップ登録の流れ
※オーナーが新会員に向けて招待メールを送り（status: "INVITED"）
新会員が承諾をした後の流れ
1.編集フォームからroleとstatusを送信
2.buildClubMemberUpdateFormValues()がFormDataを文字列へ変換
3.validateClubMemberUpdateFormValues()がPrisma enumへ絞り込み
4.後続のupdateClubMemberAction()がOWNER認可を実行
5.RepositoryがmembershipId + clubIdで対象を取得
6.Serializable transaction内でACTIVE OWNER数を取得
7.evaluateClubMembershipUpdate()で業務ルールを判定
8.allowed: trueの場合だけClubMembershipを更新
9.?toast=member-updatedへリダイレクト
10.getClubMembersToastMessage()で固定メッセージへ変換