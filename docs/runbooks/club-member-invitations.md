<!-- docs/runbooks/club-member-invitations.md -->

# クラブ招待の確認・復旧手順

この手順はF05粒度9の運営者向け手順です。patch作成中に実DB・Auth・メールを操作しません。
ローカル実SDKテスト、実DBテスト、実配送確認は以下の条件を満たしてから個別に実行します。

## 現在の到達点

- OWNER管理画面で新規招待・再送・取消・期限切れ表示を操作できます。
- 新規ユーザーのメールはSupabaseの認証リンク、既存ユーザーはアプリの参加リンクを使用します。
- `/welcome?clubSlug=...&token=...` と `/club-invitations/accept?clubSlug=...&token=...` は確定契約です。
- 受入画面、Authから戻ったセッションCookieの生成、承諾によるACTIVE化は後続F06です。
  現時点ではメール・DB状態までを確認できても、入会完了の受入確認を完了と扱えません。
- `/auth/confirm` はパスワード再設定専用です。invite対応済みとして使用しません。

## 接続先と設定

`DATABASE_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、
`SUPABASE_SERVICE_ROLE_KEY` は同じ対象環境の組合せにしてください。
クラブの `appBaseUrl` が優先され、未設定の場合だけ `APP_BASE_URL` が使われます。
キー・接続文字列をチャット、実行結果、シェルのコマンド引数に貼り付けません。

ローカル実AuthテストはSupabase APIのloopbackポート54321とアプリのloopbackポート3000だけを許可します。
実DB復旧テストもloopbackの専用DBだけを許可し、本番モードでは拒否します。
同じローカルDBへ既存migrationを適用済みであることを、テスト前に別途確認してください。
テストがmigrationやスキーマ変更を代行することはありません。

`supabase/config.toml` の既存Site URL・既存Redirect URLs・確認メール設定は維持します。
追加したRedirect許可はローカルの `/welcome` とそのクエリだけです。
`\\?` はTOMLを経由してglobの文字通りの `?` にします。
本番では公式資料と実環境で、固定origin・固定パス・必要なクエリが許可されることを確認してください。
本番Auth設定はHPのパスワード再設定等と共用されるため、既存許可を消したり全パスへ広げたりしません。

Authの `otp_expiry` は現設定3600秒、アプリの招待期限は24時間です。
この2つは別の判定です。Authが先に失効した場合はOWNERから再送します。
inviteへの正確な期限適用、旧リンク失効、確認済みユーザーへのリンク発行の挙動は、
使用中のローカルAuth版で検証して記録してください。単に24時間表示を見てAuthリンクも24時間有効と判断しません。
共用のOTP期限を変更する場合はHPのパスワード再設定への影響も別途確認してください。

## 実行する確認

通常の `npm test` は新規CLIのmock確認を行い、専用DB・実Authテストをskipします。
既存のRepository・Auth・メールのmockテストと合わせて確認してください。

ローカル専用DBの接続情報を安全に環境へ読み込んだうえで、次を実行します。

```sh
npm run test:club-invitation:recovery
```

DB統合テストは実DBと実Repository・Serviceを使用し、Auth照合だけをmockします。
dry-run無変更、ID未記録と記録済みの復旧、クラブ・OWNERの混在拒否、
取消・期限切れ・再送競合を確認します。生成したDB fixtureだけを後片付けします。
既存 `npm run test:db` にもこのテストを登録しています。

Supabaseをローカルで起動し、現在のconfigを反映したうえで、同じローカルのURL・キーと
`APP_BASE_URL` を安全に環境へ読み込み、次を明示実行します。

```sh
npm run test:club-invitation:auth:local
```

このテストは `generateLink()` と既知ID照合、確認済みAuthの拒否、旧invite token・使用済みtokenの
拒否と新tokenの本人確認を実SDKで検証します。メール配送APIは呼びません。
ローカルのテスト用Authユーザーが残ります。Authユーザー削除は実装していません。
後片付けは対象が使い捨てローカル環境であることを確認したうえで、別途ローカル環境を再作成します。
テストで発行したリンク・token・メールは出力しません。

## 実配送の受入確認

F06実装までは、本番への入会導線の公開・入会完了テストは保留します。
実配送は管理された検証先・送信ドメイン・対象クラブを確認してから、OWNER画面で個別に実行します。
`RESEND_API_KEY` と `MAIL_FROM_ADDRESS` を確認し、実ユーザーへ一括送信しません。

| ケース | メール・画面・DBで確認する結果 |
| --- | --- |
| 新規Auth | PREPARING保存後にAuth ID記録、AppUser・INVITED Membershipを紐付け、READY_TO_SENDからSENTへ進む |
| 既存AppUser | Authで確認済みであることを照合し、アプリ参加リンクを案内する。既存氏名・所属を置き換えない |
| 再送 | アプリtokenと送信試行番号を更新する。古いアプリtokenを受け付けない |
| Resendの明確な拒否 | EMAIL_FAILEDとINVITEDを残し、固定の送信失敗案内・再送ボタンを表示する |
| 配送不明・受付後DB失敗 | READY_TO_SENDとleaseを保持する。未送信と決めつけて自動で再送しない |
| 取消 | 未承諾INVITEDだけを削除し、CANCELLED履歴とAppUserを残す。古い処理がSENTへ戻せない |
| 期限切れ | 一覧取得でEXPIRED化し、tokenを拒否する。INVITEDは保持する |
| 初回設定・受入 | F06後にCookie・本人ID・クラブ・招待期限を照合し、tokenだけでACTIVE化しないことを確認する |

Resendの受付は受信者への到着を保証しません。到着・迷惑メール分類は管理された受信箱で確認します。
スクリーンショット・障害報告・分析情報・インフラのリクエストログへリンクやクエリの機密値を残しません。
F06の受入ページはno-storeとReferrer-Policy: no-referrerを使用し、受入後にtoken付きURLを履歴へ残さない導線を確認します。

## PREPARINGの復旧

このCLIは管理資格情報を扱える承認済み運営者が使用します。
指定する `--actor-membership-id` は対象クラブの承認済みACTIVE OWNERです。
このID指定は運営者本人のログイン認証を代行するものではありません。
作業申請に操作者・対象クラブ・Invitation ID・指定したOWNER・dry-run/applyの結果を記録します。
Auth user IDは管理画面等の安全な経路で個別に確認し、メールの検索結果だけで推測しません。

```sh
npm run club:invitation:recover -- \
  --club-slug CLUB_SLUG \
  --club-id CLUB_UUID \
  --invitation-id INVITATION_UUID \
  --auth-user-id AUTH_UUID \
  --actor-membership-id OWNER_MEMBERSHIP_UUID \
  --dry-run
```

すべて一致して `DRY_RUN_READY` になった対象だけ、同じ確認用IDで `--dry-run` を `--apply` へ変えます。
dry-runはDB・Authの読み取りだけです。将来のapply成功を保証せず、apply時に改めて照合します。

CLIはPREPARING・未承諾・招待期限内・稼働中leaseなしの対象に限定します。
確認後はupdatedAt・状態・OWNER条件を含む比較更新で、自分のclaimだけを取得します。
Auth ID未記録でもIDとemailをAuthで照合し、既存 `recordClubInvitationAuthUser()` で記録します。
既存 `recoverClubInvitationPreparation()` によってAppUser・INVITED Membershipを紐付けます。
token・期限・送信状態を再送のように更新せず、メールも送信しません。
`RECOVERED` はREADY_TO_SENDまでのDB準備完了です。その後OWNER画面から再送してください。

以下は自動で直しません。

- clubSlugと確認用clubIdの不一致、他クラブInvitation・OWNER、OWNER資格の失効。
- Auth ID・email、既存AppUser・Membershipの不一致、Authユーザーの欠損。
- ACCEPTED・CANCELLED・EXPIRED・送信済み状態、招待期限到達、処理中lease。

`CLAIM_LOST` では最新状態を確認し、別の処理を巻き戻しません。
障害後はPREPARINGと記録済みAuth IDが復旧地点として残る場合があります。
claim解除に失敗した場合は5分のlease終了後に確認し直します。
Authユーザーの削除・再作成、raw tokenの手動DB保存、ブラウザへの任意Auth ID入力は行いません。
CLIはクラブ・Invitation ID・指定OWNER・モード・固定結果だけを出力し、接続は終了時に閉じます。

## 確認記録と参照

DB制約は既存 `tests/club-invitation-schema.integration.test.ts` で正規化・CHECK・部分unique index・
関連制約を確認します。既存migrationのpreflightに失敗したDBへ復旧処理を進めません。
fixture内の成功だけで、本番migrationの適用状況を確認済みとしません。

実行環境、SDK・CLI・Auth版、実行日時、固定結果、未確認項目を記録してください。
今回のpatch作成では、実DB・実Auth・実配送・F06受入は未確認です。

- [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
- [Redirect URLの許可とglob](https://supabase.com/docs/guides/auth/redirect-urls)
- [ローカルAuth設定](https://supabase.com/docs/guides/local-development/cli/config)
