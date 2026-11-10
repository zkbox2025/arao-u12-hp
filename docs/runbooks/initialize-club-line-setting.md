# クラブ別LINE設定の初期化手順（ops2.mdに詳しく書いてある）

## 目的

`ClubLineSetting`へ、クラブ固有のLINE Messaging API設定を安全に登録・更新します。

登録対象は次の5項目です。

- `lineChannelId`
- `lineBotUserId`
- `lineChannelAccessTokenEncrypted`
- `lineChannelSecretEncrypted`
- `webhookKey`

Channel Access TokenとChannel Secretの平文はDBへ保存しません。実行時だけ一時環境変数から受け取り、既存の`encryptLineCredential()`で暗号化して保存します。

## 重要な前提

- 最初に必ず`--dry-run`を実行してください。
- `--apply`はDBを書き換えます。
- `clubSlug`と、別途DBで確認した`clubId`の両方が一致しなければ処理しません。
- 既存設定を更新しても`webhookKey`は変更しません。
- SecretやAccess TokenをCLI引数、migration、seed、Git管理対象ファイルへ書かないでください。
- ローカルDBと本番DBは、それぞれの環境の`LINE_CREDENTIAL_ENCRYPTION_KEY`で別々に初期化してください。
- 別環境で作った暗号文をコピーしないでください。暗号文は暗号鍵・`clubId`・資格情報種別に結び付いています。

このスクリプトは既存の`server-only`暗号化処理を再利用するため、必ず`npm run club:line:init`経由で実行します。

## 1. 対象クラブを確認する

Supabase SQL Editorなど、対象環境のDBで次を実行します。

```sql
select
  id,
  name,
  slug
from "Club"
where slug = 'arao-u-12';
```

表示された`id`を、後述の`--club-id`へ指定します。ローカルDBと本番DBでIDが異なる場合は、それぞれのIDを使用してください。

## 2. 一時環境変数へ入力する

以下はzsh用です。SecretとAccess Tokenは画面に表示されず、値自体もシェル履歴へ残りません。

```bash
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
```

スクリプトが読む一時環境変数は次の4つです。

| 環境変数 | 内容 | 秘密情報 |
|---|---|---:|
| `CLUB_LINE_INIT_CHANNEL_ID` | Channel ID | いいえ |
| `CLUB_LINE_INIT_BOT_USER_ID` | Bot User ID（Webhook本文の`destination`） | いいえ |
| `CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN` | Channel Access Token | はい |
| `CLUB_LINE_INIT_CHANNEL_SECRET` | Channel Secret | はい |

`DATABASE_URL`、`APP_BASE_URL`、`LINE_CREDENTIAL_ENCRYPTION_KEY`は、対象環境の既存envファイルから読み込みます。LINE資格情報の平文4項目はenvファイルへ追記しません。

## 3. ローカルDBでdry-runする

`<LOCAL_CLUB_ID>`を手順1で確認したローカルDBのIDへ置き換えます。

```bash
npx dotenv-cli -e .env.local -- \
  npm run club:line:init -- \
  --club-slug arao-u-12 \
  --club-id '<LOCAL_CLUB_ID>' \
  --dry-run
```

dry-runでは次だけを確認し、DBを変更しません。

- 対象クラブが存在するか
- `clubSlug`と確認用`clubId`が一致するか
- 必須環境変数が揃っているか
- LINE資格情報を現在の暗号鍵で暗号化できるか
- 新規作成か既存設定の更新か

初回作成のdry-runでは`webhookKey`をまだ保存しないため、Webhook URLは表示しません。`--apply`成功後に確定したURLを表示します。

## 4. ローカルDBへ適用する

dry-runの内容に問題がなければ、最後の引数だけ`--apply`へ変更します。

```bash
npx dotenv-cli -e .env.local -- \
  npm run club:line:init -- \
  --club-slug arao-u-12 \
  --club-id '<LOCAL_CLUB_ID>' \
  --apply
```

成功時に表示するのは次だけです。

- クラブ名
- `clubSlug`
- 作成または更新結果
- LINE Developersへ設定するWebhook URL

## 5. 本番DBへ適用する

本番用の`DATABASE_URL`、`APP_BASE_URL`、`LINE_CREDENTIAL_ENCRYPTION_KEY`を読み込む状態で、手順1からやり直します。

`<PRODUCTION_CLUB_ID>`には本番DBで確認したIDを指定します。

```bash
npx dotenv-cli -e .env.prod -- \
  npm run club:line:init -- \
  --club-slug arao-u-12 \
  --club-id '<PRODUCTION_CLUB_ID>' \
  --dry-run
```

確認後に適用します。

```bash
npx dotenv-cli -e .env.prod -- \
  npm run club:line:init -- \
  --club-slug arao-u-12 \
  --club-id '<PRODUCTION_CLUB_ID>' \
  --apply
```

本番の`APP_BASE_URL`はHTTPSの共通本番ドメインを指定してください。成功時に表示されたWebhook URLを、ARAOのLINE DevelopersにあるMessaging APIチャネルへ設定します。

## 6. 一時環境変数を削除する

ローカル・本番とも、実行後すぐに次を実行します。

```bash
unset CLUB_LINE_INIT_CHANNEL_ID
unset CLUB_LINE_INIT_BOT_USER_ID
unset CLUB_LINE_INIT_CHANNEL_ACCESS_TOKEN
unset CLUB_LINE_INIT_CHANNEL_SECRET
```

ターミナルを閉じた場合も、そのシェルの一時環境変数は失われます。

## 7. 適用後の確認

1. OWNER用LINE設定ページで「Messaging API設定済み」「Webhook受付設定済み」を確認します。
2. LINE Developersへ、スクリプトが表示したWebhook URLを設定します。
3. Webhookの「検証」でHTTP 200を確認します。
4. 登録コードを発行し、対象LINEグループでコードだけを送信します。
5. 登録された通知先が初期状態で無効になっていることを確認します。
6. 通知先名と対象roleを設定してから有効化します。

## 再実行時の動作

- 同じクラブへ再実行すると資格情報を更新します。
- 既存の`webhookKey`は維持するため、LINE DevelopersのWebhook URLは変わりません。
- 通知先、登録コード、配信履歴は削除しません。
- 誤った資格情報を適用した場合は、正しい値で再度dry-runしてからapplyしてください。

## 環境変数について

`process.env`は、実行中のNode.jsプロセスへ渡された環境変数を読みます。ターミナルで値を入力しただけではなく、`export`した値が`npm run club:line:init`の子プロセスへ引き継がれることで読み取れます。

この初期化では、旧単一クラブ用の`LINE_CHANNEL_SECRET`や`LINE_CHANNEL_ACCESS_TOKEN`を使用しません。マルチテナントで別クラブの資格情報を誤登録しないため、初期化専用の`CLUB_LINE_INIT_*`だけを使用します。

永続的に必要な`LINE_CREDENTIAL_ENCRYPTION_KEY`は環境ごとのサーバー設定に残します。一方、Channel SecretとChannel Access Tokenの平文は初期化時だけ渡し、暗号化済みの値だけをDBへ保存します。
