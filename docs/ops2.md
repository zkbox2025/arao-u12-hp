クラブHP運用メモ
・VSCode内の特定のプロジェクトのコードを全てコピペする方法
機能：ChatGPT & Claude Code Exporter（拡張機能にてインストール済み）
方法：全てファイルを閉じた状態でCmd + Option + Xをする。
注意：以下はファイルを右クリックしてExclude from Exportを選択すること（コピペ不可にするため）（.vscode/project-export.jsonに保存される）
.env.local
.env.prod
.DS_Store
tsconfig.tsbuildinfo

◯本番DB、本番環境へのマージはアプリ完成までやらないでおく

◯ローカルでの検証するコマンド（scripts/validate-env.mjs（環境変数のチェックコード）,tests/foundation.test.ts（テストコード）,vitest.config.ts（どのテストコードを読むべきか選定するコード））

「npm run verify:local」とターミナルでコマンドを打つと

以下の点をプロジェクト内のコードを自動でチェックする
環境変数の設定ミスがないか （単体確認：npm run env:validate）
データベースの設計に矛盾がないか （単体確認：npm run prisma:validate）
コードに壊れている部分（型エラーなど）がないか （単体確認：npm run typecheck）
自動テスト（Vitest）でsample.test.ts内に書いてある自動検証コードの検証がすべてクリアしているか実行 （単体確認：npm run test）
Vercelでビルドエラーが起きないか （単体確認：npm run build）

※sample.test.tsにお知らせの既読機能の検証など検証を書いておくと、npm run verify:localを実行するだけで自動検証してくれる。ぽちぽちしなくていい。ありがたい。
※「npm run test:watch」とすると、テストコードを実行監視しながら開発が進められるのでおすすめ。

◯コードの検証をするコマンド（eslint.config.mjs）
「npm run lint」とターミナルにコマンドを打つと

以下の点を自動でチェックする
アプリの表示速度が遅くなるような書き方をしていないか
宣言したのに使っていない変数がある
など


◯今後、Prismaスキーマを変更するときは次の順番です。

npx dotenv-cli -e .env.local -- npx prisma format


npx dotenv-cli -e .env.local -- \
  npx prisma migrate dev \
  --name 変更内容 \
  --create-only

生成されたmigration.sqlを確認し、必要なCHECK制約などを書き足します。

npx dotenv-cli -e .env.local -- npx prisma migrate dev

適用済みの過去のmigration.sqlは編集しません。

本番ではmigrate devではなく、未適用の履歴だけを適用する次のコマンドを使用します。

npx dotenv-cli -e .env.prod -- npx prisma migrate deploy

※すでにパッチの中にマイグレーションファイル（SQL）が含まれていて、patchを反映させる場合は、既存のマイグレーション（SQL）をローカルDBに適用するコマンドでOK。以下の通り。
◯npx dotenv-cli -e .env.local -- npx prisma migrate deploy
◯npx dotenv-cli -e .env.local -- npx prisma generate
◯npx dotenv-cli -e .env.local -- npx prisma validate


◯本番DBを変更前にバックアップをする

◯cronについて
・Vercel Hobby（無料版）の１枠（1日1回1時間以内の制限あり）
api/cron/delete-old-security-logs
・Supabase Cronについて
api/cron/club-line-deliveries
api/cron/storage-deletions

※ローカルのsupabase cronの立ち上げる場合のURL
コマンド：npx next dev \
  --hostname 0.0.0.0 \
  --port 3000
URL：http://192.168.210.198:3000/api/cron/club-line-deliveriesなど
ローカルではターミナルにクロンの200が表示される

◯本番で初期データ（LINE_CHANNEL_ACCESS_TOKENなど）を各クラブのDBに入れる際はターミナルから打ち込み（スクリプト）をして入れる。envに書かなくてもターミナルに打ち込むだけでコード内の「process.env.LINE_CHANNEL_SECRET」という命令を使ってキャッチする（process.envだからと言ってenvに書く必要はない）




【本番用】クラブ納品の際に初期値（ライン関係）を設定するための手順！（シェル変数）
※下記にある実際の手順では①〜④のコマンドを一回で終わらせるために一気にコマンドする方法でやっているのでチェックすること

前提：対象クラブを確認する

Supabase SQL Editorなど、対象環境のDBで次を実行します。

```sql
select
  id,
  name,
  slug
from "Club"
where slug = 'arao-u-12';

①一時環境変数の平文をターミナルで入力(まだこの段階ではパソコンのメモリに一時保存している段階。④で削除する)
read -r "CLUB_LINE_INIT_CHANNEL_ID?LINE Channel ID: "
read -r "CLUB_LINE_INIT_BOT_USER_ID?LINE Bot User ID: "

read -rs "CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN?LINE Channel Access Token: "
echo

read -rs "CLUB_LINE_INIT_CHANNEL_SECRET?LINE Channel Secret: "
echo

export CLUB_LINE_INIT_CHANNEL_ID
export CLUB_LINE_INIT_BOT_USER_ID
export CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN
export CLUB_LINE_INIT_CHANNEL_SECRET

②本番DBでdry-run（本番環境に対して、データが壊れたりしないよう安全な『テストモード』でLINE設定プログラムを実行する）
npx dotenv-cli -e .env.prod -- \
  npm run club:line:init -- \
  --club-slug arao-u-12 \
  --club-id '<本番DBのクラブID>' \
  --dry-run

③本番DBに反映（webhookkeyを発行しDBに保存される）
npx dotenv-cli -e .env.prod -- \
  npm run club:line:init -- \
  --club-slug arao-u-12 \
  --club-id '<本番DBのクラブID>' \
  --apply

④パソコンに一時保存されてる一時環境変数を削除（以下を実行。①でパソコンのメモリに一時保存しているパスワードを削除する）
unset CLUB_LINE_INIT_CHANNEL_ID
unset CLUB_LINE_INIT_BOT_USER_ID
unset CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN
unset CLUB_LINE_INIT_CHANNEL_SECRET

※新しいクラブを納品する際に初期値をDBに保存するとき、DB保存後に、①で一時的にパソコンのメモリに保存したそのクラブ専用のCLUB_LINE_INIT_*を必ず以下を実行し消すこと！
unset CLUB_LINE_INIT_CHANNEL_ID
unset CLUB_LINE_INIT_BOT_USER_ID
unset CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN
unset CLUB_LINE_INIT_CHANNEL_SECRET

⑤webhookkeyを含むwebhookURLをラインのエンドポンドに設定する
https://(本番のドメイン)/api/line/webhook/webhookkey(文字列)

⑥SQLで確認する
select
  "lineChannelId",
  "lineBotUserId",
  "webhookKey",
  "lineChannelAccessTokenEncrypted" is not null
    as "hasEncryptedAccessToken",
  "lineChannelSecretEncrypted" is not null
    as "hasEncryptedSecret"
from "ClubLineSetting"
where "clubId" = '<本番DBのクラブID>';



※本番環境への安全な反映手順

現在のHPを止めないため、次の順序が安全です。

1. 既存環境変数を削除しない

移行完了までは、現在の本番HPで使っている次のような旧環境変数を残します。

LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_ADMIN_GROUP_ID=

粒度6の初期化が終わっただけで削除してはいけません。既存HPコードがまだ参照している可能性があります。

2. Vercelへ本番暗号鍵を設定する

本番Vercelに、次を設定します。

LINE_CREDENTIAL_ENCRYPTION_KEY=本番専用暗号鍵

この鍵はクラブごとではなく、本番環境全体で1つです。

新しいクラブも同じ暗号鍵を使用します。ただし、暗号化時にclubIdが組み込まれるため、別クラブへ暗号文をコピーしても復号できません。

3. コードを先に本番へデプロイする

順序は次です。

ローカル検証完了
コミット
Git push
Vercelデプロイ成功
新Webhook URLへアクセス可能なことを確認
その後に本番DBを初期化
最後にLINE DevelopersのWebhook URLを切り替える

初期化スクリプト自体は、デプロイ時に自動実行されません。そのため、追加しただけで本番DBが変更されたり、HPが停止したりすることはありません。

4. 本番DBのクラブIDを確認する

本番SupabaseのSQL Editorで実行します。

select
  id,
  name,
  slug
from "Club"
where slug = 'arao-u-12';

ここで取得した本番DBのIDを使います。

5. .env.prodを確認する

初期化を行う管理者端末の.env.prodは、少なくとも次を本番用にします。

DATABASE_URL=本番DB
APP_BASE_URL=https://本番ドメイン
LINE_CREDENTIAL_ENCRYPTION_KEY=Vercelと完全に同じ本番暗号鍵

重要なのは、.env.prodの暗号鍵とVercel本番環境の暗号鍵が完全一致することです。

.env.prodはGitへコミットしません。

6. 本番用資格情報を入力して実行する（①〜④を一気に実行する）（ID前後の<>は消すこと）
⭐️CLUB_LINE_INIT_BOT_USER_IDはターミナルでコマンドを打ってから確認すること（ラインデベロッパーズの中には書いてないから注意！）
(
  set -e

  read -r "CLUB_LINE_INIT_CHANNEL_ID?本番LINE Channel ID: "
  read -r "CLUB_LINE_INIT_BOT_USER_ID?本番LINE Bot User ID: "

  read -rs "CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN?本番Channel Access Token: "
  echo

  read -rs "CLUB_LINE_INIT_CHANNEL_SECRET?本番Channel Secret: "
  echo

  export CLUB_LINE_INIT_CHANNEL_ID
  export CLUB_LINE_INIT_BOT_USER_ID
  export CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN
  export CLUB_LINE_INIT_CHANNEL_SECRET

  npx dotenv-cli -e .env.prod -- \
    npm run club:line:init -- \
    --club-slug arao-u-12 \
    --club-id '<本番DBのクラブID>' \
    --dry-run

  read -r "APPLY_CONFIRM?本番DBへ反映する場合は APPLY と入力: "

  if [[ "$APPLY_CONFIRM" != "APPLY" ]]; then
    echo "本番DBへの反映を中止しました。"
    exit 1
  fi

  npx dotenv-cli -e .env.prod -- \
    npm run club:line:init -- \
    --club-slug arao-u-12 \
    --club-id '<本番DBのクラブID>' \
    --apply
)

処理終了後、サブシェルが閉じるため一時環境変数は自動的に消えます。

7. LINE Developersを切り替える

--apply成功時に表示されたURLを設定します。

https://本番ドメイン/api/line/webhook/{webhookKey}

その後、LINE Developersの「検証」を実行してHTTP 200を確認します。

注意点として、旧Webhookに本番運用中の受信処理がある場合は、その処理が新Webhookへ移行済みであることを確認してから切り替えます。LINEの送信機能はWebhook URLとは別なので、既存HPからのLINE送信は通常そのまま動作します。

8. 本番確認
Vercelログで新Webhookが200
Secret、Access Token、登録コード、groupId完全値がログにない
OWNER用設定ページが表示できる
登録コードで通知先を登録できる
登録直後はisEnabled=false
OWNERが名前・roleを設定後に有効化できる
既存HPのメール・LINE送信が継続して動作する
新しいクラブを追加する場合

※クラブごとに次を繰り返します。

Clubレコードを作成
本番DBでclubIdとclubSlugを確認
そのクラブのLINE資格情報を取得
一時環境変数へ入力
--dry-run
--apply
表示されたWebhook URLをそのクラブのLINE Developersへ設定
疎通確認
サブシェル終了により一時環境変数を削除

LINE_CREDENTIAL_ENCRYPTION_KEYはクラブ追加のたびに変更しません。変更すると、すでに保存されている全クラブの暗号文を復号できなくなるためです。

つまり、今後の整理は次のとおりです。

クラブごとのLINE資格情報
→ 登録時だけ一時入力
→ 暗号化してDBへ保存
→ 平文は即座に破棄

本番暗号鍵
→ Vercelと初期化端末で同じ値
→ 全クラブ共通
→ 継続して安全に保管

【開発用】開発用データとしてクラブの初期値（ライン関係）を設定するための手順！（シェル変数）
※下記にある実際の手順では①〜④のコマンドを一回で終わらせるために一気にコマンドする方法でやっているのでチェックすること

前提：対象クラブを確認する

Supabase SQL Editorなど、対象環境のDBで次を実行します。

```sql
select
  id,
  name,
  slug
from "Club"
where slug = 'arao-u-12';


①一時環境変数の平文をターミナルで入力(まだこの段階ではパソコンのメモリに一時保存している段階。④で削除する)
read -r "CLUB_LINE_INIT_CHANNEL_ID?LINE Channel ID: "
read -r "CLUB_LINE_INIT_BOT_USER_ID?LINE Bot User ID: "

read -rs "CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN?LINE Channel Access Token: "
echo

read -rs "CLUB_LINE_INIT_CHANNEL_SECRET?LINE Channel Secret: "
echo

export CLUB_LINE_INIT_CHANNEL_ID
export CLUB_LINE_INIT_BOT_USER_ID
export CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN
export CLUB_LINE_INIT_CHANNEL_SECRET

②ローカルDBでdry-run（ローカル環境に対して、データが壊れたりしないよう安全な『テストモード』でLINE設定プログラムを実行する）
npx dotenv-cli -e .env.local -- \
  npm run club:line:init -- \
  --club-slug arao-u-12 \
  --club-id '<ローカルDBのクラブID>' \
  --dry-run

③ローカルDBに反映（webhookkeyを発行しDBに保存される）
npx dotenv-cli -e .env.local -- \
  npm run club:line:init -- \
  --club-slug arao-u-12 \
  --club-id '<ローカルDBのクラブID>' \
  --apply

④パソコンに一時保存されてる一時環境変数を削除（以下を実行。①でパソコンのメモリに一時保存しているパスワードを削除する）
unset CLUB_LINE_INIT_CHANNEL_ID
unset CLUB_LINE_INIT_BOT_USER_ID
unset CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN
unset CLUB_LINE_INIT_CHANNEL_SECRET

※開発用データとしてクラブの初期値（ライン関係）を設定する際に初期値をDBに保存するとき、DB保存後に、①で一時的にパソコンのメモリに保存したそのクラブ専用のCLUB_LINE_INIT_*を必ず以下を実行し消すこと！
unset CLUB_LINE_INIT_CHANNEL_ID
unset CLUB_LINE_INIT_BOT_USER_ID
unset CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN
unset CLUB_LINE_INIT_CHANNEL_SECRET

⑤webhookkeyを含むwebhookURLをラインのエンドポンドに設定することはできない。
 http://192.168.210.188:3000/api/line/webhook/webhookkey(文字列)
 以下の外部公開された開発用URLでないと設定できない
 https://外部公開された開発用URL/api/line/webhook/{実際のwebhookKey}

⑥SQLで確認する
select
  "lineChannelId",
  "lineBotUserId",
  "webhookKey",
  "lineChannelAccessTokenEncrypted" is not null
    as "hasEncryptedAccessToken",
  "lineChannelSecretEncrypted" is not null
    as "hasEncryptedSecret"
from "ClubLineSetting"
where "clubId" = '<ローカルDBのクラブID>';

※開発環境での初期化・テスト手順
1. 開発用LINEチャネルを用意する

可能なら、本番ARAOのMessaging APIチャネルを開発環境で使用せず、開発専用のチャネルとLINEグループを用意してください。

LINE Messaging APIチャネルのWebhook URLは基本的に1つなので、本番ARAOのWebhook URLをローカルURLへ変更すると、本番のWebhook受信が止まります。

テスト範囲によって次のように分けます。

DB保存・暗号化・管理画面だけ確認：形式を満たすテスト値でも可能
実際のLINE Webhookまで確認：開発専用LINEチャネルが必要
LINE DevelopersからローカルへWebhook送信：外部から接続可能なHTTPS URLが必要
2. ローカルDBのクラブIDを確認する

ローカルSupabaseのSQL Editorで実行します。

select
  id,
  name,
  slug
from "Club"
where slug = 'arao-u-12';

本番DBのIDではなく、ローカルDBで表示されたIDを使用します。

3. ローカル用暗号鍵を確認する

.env.localには、少なくとも次が必要です。

DATABASE_URL=ローカルDB
APP_BASE_URL=http://localhost:3000
LINE_CREDENTIAL_ENCRYPTION_KEY=ローカル専用暗号鍵

ローカル用暗号鍵は本番と異なっていて構いません。

4. 一時環境変数を設定して実行する（①〜④を一気に実行する）（ID前後の<>は消すこと）
⭐️CLUB_LINE_INIT_BOT_USER_IDはターミナルでコマンドを打ってから確認すること（ラインデベロッパーズの中には書いてないから注意！）

手動のunset忘れを防ぐため、サブシェル内で実行する方法がおすすめです。

(
  set -e

  read -r "CLUB_LINE_INIT_CHANNEL_ID?開発用LINE Channel ID: "
  read -r "CLUB_LINE_INIT_BOT_USER_ID?開発用LINE Bot User ID: "

  read -rs "CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN?開発用Channel Access Token: "
  echo

  read -rs "CLUB_LINE_INIT_CHANNEL_SECRET?開発用Channel Secret: "
  echo

  export CLUB_LINE_INIT_CHANNEL_ID
  export CLUB_LINE_INIT_BOT_USER_ID
  export CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN
  export CLUB_LINE_INIT_CHANNEL_SECRET

  npx dotenv-cli -e .env.local -- \
    npm run club:line:init -- \
    --club-slug arao-u-12 \
    --club-id '<ローカルDBのクラブID>' \
    --dry-run

  read -r "APPLY_CONFIRM?ローカルDBへ反映する場合は APPLY と入力: "

  if [[ "$APPLY_CONFIRM" != "APPLY" ]]; then
    echo "反映を中止しました。"
    exit 1
  fi

  npx dotenv-cli -e .env.local -- \
    npm run club:line:init -- \
    --club-slug arao-u-12 \
    --club-id '<ローカルDBのクラブID>' \
    --apply
)

最後の)でサブシェルが終了すると、4つの一時環境変数は自動的に消えます。手動のunsetは不要です。

5. ローカルDBを確認する

平文を取得せず、次だけ確認します。

select
  "lineChannelId",
  "lineBotUserId",
  "webhookKey",
  "lineChannelAccessTokenEncrypted" is not null
    as "hasEncryptedAccessToken",
  "lineChannelSecretEncrypted" is not null
    as "hasEncryptedSecret"
from "ClubLineSetting"
where "clubId" = '<ローカルDBのARAOクラブID>';

期待結果は次です。

lineChannelIdが入っている
lineBotUserIdが入っている
webhookKeyが入っている
hasEncryptedAccessToken = true
hasEncryptedSecret = true

暗号化済み列の完全な内容をログや画面へ出す必要はありません。

6. ローカル動作確認
npm run typecheck
npm run lint
npm test
npm run build

その後、OWNER用LINE設定ページで確認します。

/club/arao-u-12/admin/settings/line

確認項目：

Messaging API設定済み
Webhook受付設定済み
登録コードを発行できる
登録コードの期限が10分
通知先の初期状態が無効
OWNERが設定した後だけ有効化できる

⭐️開発用のwebhookのテストをしたい場合は、webhook URLにhttp://192.168.210.188:3000/api/line/webhook/webhookkeyを設定することができないから以下のように外部公開URL（Cloudflare Quick Tunnel）を設定してテストすること
LINE Platform
    ↓ HTTPS
外部公開URL
    ↓ トンネル転送
localhost:3000
    ↓
https://trycloudflare.com URL（毎回異なる）/api/line/webhook/実際のwebhookKey

※Quick TunnelのURLは停止すると使えなくなります。再起動すると別のURLになるため、次回はLINE DevelopersのWebhook URLを更新します。なお、次回は初期化スクリプトの再実行は不要。

【次回のテスト】

Next.js起動
  ↓
cloudflared起動
  ↓
新しいtrycloudflare.com URLを取得
  ↓
既存webhookKeyを末尾へ付ける
  ↓
LINE DevelopersのWebhook URLだけ更新

※イベントやお知らせの投稿時に通知ができるかのテストについてはappBaseUrlをローカルsupabaseのSQLでDBのappBaseUrlにhttps://trycloudflare.com URL（毎回異なる）を挿入するとできる