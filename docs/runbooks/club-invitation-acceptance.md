<!-- docs/runbooks/club-invitation-acceptance.md -->

# F06 招待承諾の受入・再開手順

F06粒度10の確認手順です。実装済み、mock試験済み、実DB・Auth試験済み、
実ブラウザ確認済みを分けて記録します。未実施・skip・未達があればF06受入完了にしません。
この手順書の追加やpatch作成だけでは、実DB・Auth・実メールを操作しません。
運営者向けの送信・取消・PREPARING復旧は[既存手順](./club-member-invitations.md)を使用します。

## 到達点と処理の境界

| 操作 | 実装箇所・入出力 | DB変更 |
| --- | --- | --- |
| 招待URLを開く | `proxy.ts` の `proxy` がslug・raw tokenを検証し、短期context Cookieとclean URLへ交換 | なし |
| 新規Authの本人確認 | `welcome/InvitationAuthBridge.tsx` がfragmentを履歴から消し、tokenを同一originのPOST bodyだけで送る | なし |
| SSR sessionを確立 | `auth/confirm/route.ts` のPOSTがcontextId・Auth ID・現在email・招待を照合し、検証後にAuth Cookieを返す | 招待の読取のみ |
| 利用可能な画面を表示 | `welcome/InvitationAcceptanceScreen.tsx` → `getClubInvitationAcceptance` が安全な表示DTOを返す | 読取のみ |
| 新規の初回設定 | `completeClubInvitationAction` → `acceptClubInvitation` → `updateClubInvitationPassword` | AuthのPW更新後にアプリDB承諾 |
| 既存のログイン・再開 | `club-login/actions.ts` の `loginAction` が検証済みpassword sessionとpending招待から固定の承諾画面へ案内 | 読取のみ |
| 既存の承諾 | `acceptExistingClubInvitationAction` → `acceptClubInvitation`。PW欄・PW更新なし | アプリDB承諾のみ |
| DB承諾 | `club-invitation-repository.ts` の `acceptClubInvitationForUser`。slug・hash・本人・email・期限・INVITEDを再確認 | 同一transactionでInvitationをACCEPTED、acceptedAt設定、MembershipをACTIVEへ条件付き更新 |
| 完了 | Actionがcontext Cookieを失効させ、会員管理・account・クラブ選択を再検証して対象eventsへ固定遷移 | 再承諾なし |

画面・Actionのパスは `app/(club-app)/` 配下です。Serviceは
`src/application/club/invitation/`、Repositoryは `src/infrastructure/prisma/repositories/`、
Auth adapterは `src/infrastructure/supabase/club-invitation-session.ts` です。
後続粒度待ちの接続はありません。実ブラウザの確認結果は別途必要です。

新規・既存はAppUserの有無やCookieの自己申告で決めません。
検証済みAMRがotpなら初回設定、passwordなら既存承諾へ進み、不明ならログインへ戻します。
contextIdは表示時の招待を固定するnonceで、本人認証やDBの一回限り保証を代行しません。
PW・確認値はtrimや正規化をせず、ActionStateへ保持しません。

## 実行前のローカル環境

1. データを捨てられる専用のSupabaseローカル環境を用意します。日常の開発DBや本番は使いません。
2. DBとAuthが同じローカルstackであること、既存migrationが適用済みであることを確認します。
   テストはstack起動、migration、seed、パッケージ追加、スキーマ変更を代行しません。
3. Authの通知先はローカルの受信箱に限定し、外部SMTP・実配送・本番hookを接続しません。
   テストは `generateLink` と `createUser` を使い、Resendや `inviteUserByEmail` を呼びません。
4. 設定を承認された方法でプロセス環境へ渡します。この手順では.envを表示・自動読込しません。
   キー・PW・接続文字列をコマンド引数、チャット、テスト報告へ貼り付けません。
5. 本番ではないことに加え、使い捨てであることを確認した担当者だけが
   `CLUB_INVITATION_ACCEPTANCE_DISPOSABLE=1` を環境へ設定します。

| 設定 | 許可する値・用途 |
| --- | --- |
| `DATABASE_URL` | localhostまたは127.0.0.1、54322、DB名postgres、postgres/postgresql、認証あり。query・fragmentなし |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://localhost:54321` または `http://127.0.0.1:54321`。path・認証・query・fragmentなし |
| `APP_BASE_URL` | 同じloopback stackのHTTPポート3000。path・認証・query・fragmentなし |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 上記ローカルAuthのanon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 上記ローカルAuthの管理key。fixture作成だけに使用 |
| `CLUB_INVITATION_ACCEPTANCE_DISPOSABLE` | 担当者が確認後に明示する `1` |

既存 `supabase/config.toml` の `/welcome` とクエリの許可を使います。
Site URL、共用password policy、JWT hook、cookie domain、OTP期限を勝手に変更しません。
実際のAuth版・CLI版と設定反映を記録します。URLのloopback判定だけでは、
転送されたDBやリモートへproxyするローカルサービス、同じstackであることまでは証明できません。

## 自動確認

通常の `npm test` は3つの実行flagを設定しない環境で実行します。
新しいflowテストの接続ガード17件はDB・Authなしで動き、実接続の24件はskipします。
既存DB試験は単独のDB用flagで有効になるため、通常実行へflagを持ち越しません。

F06とF05送信の主な回帰は、flagなしで次を実行します。

```sh
npm test -- \
  domain/club/invitation \
  src/application/club/invitation \
  src/infrastructure/security/club-invitation-context.test.ts \
  src/infrastructure/supabase/club-invitation-session.test.ts \
  src/infrastructure/supabase/club-invitation-auth.test.ts \
  tests/club-invitation-entry.test.ts \
  tests/club-invitation-confirm.test.ts \
  tests/club-invitation-actions.test.ts \
  tests/club-invitation-acceptance-actions.test.ts \
  tests/club-invitation-login-resume.test.ts \
  tests/club-invitation-acceptance-pages.test.ts \
  tests/club-invitation-acceptance-repository.integration.test.ts \
  tests/club-invitation-acceptance.flow.integration.test.ts
```

実DB・実Authの統合は、上記の事前確認後に次だけを明示実行します。

```sh
npm run test:club-invitation:acceptance:local
```

このscriptは専用flowファイルだけを選び、次の3つをすべて `1` にします。
`RUN_CLUB_INVITATION_ACCEPTANCE_TESTS`、`RUN_DB_INTEGRATION_TESTS`、
`RUN_CLUB_INVITATION_AUTH_TESTS`。使い捨て確認flagはscriptが自動設定しません。
flag不足ではskip、明示起動後の接続設定不正や接続不可では失敗です。
どちらも実DB・Authの成功として記録しません。

flow試験は実SDK・実Auth・実Service・実Repository・実Actionを使います。
F05の送信済み招待をDB fixtureで用意し、メール配送そのものは対象にしません。
`next/headers` のrequest Cookieと `next/cache` の再検証だけをテスト境界に置き換えます。
共有Prisma clientのdotenv読込を避け、専用clientをガード後に注入します。
Auth通信は許可したloopback originだけとし、自動redirectを拒否します。
実verifyリンクはmanual redirectでLocationを検査します。

ブラウザでのCookie保存・同時送信・hydrationやNextのHTTP Action受付を再現する試験ではありません。
2並行のケースは検証済み本人による実RepositoryのDB承諾であり、
AuthのPW更新まで全体を一回限りにする保証には使用しません。
DB障害ケースは実Auth更新後、transaction開始を一度だけ故障注入し、
実PWログイン・既存Actionによる再開を確認します。ネットワーク断自体の再現ではありません。

既存のDB制約・F05 Repository・復旧は専用環境で別途実行します。

```sh
npm run test:db
npm run test:club-invitation:auth:local
```

これらの既存scriptはflow専用と同じ接続ガードを持つとは限りません。
実行前に専用環境・接続先を確認します。F05 Auth単独試験の成功を、
F06のブラウザCookie・本人照合・DB承諾の代替にはしません。

## 受入条件と確認先

| 確認する条件 | 自動試験 | 実ブラウザでの確認 |
| --- | --- | --- |
| 新規の有効招待・初回PW・ACTIVE化 | flowのnew、有効招待Action | 初回設定だけを表示し、英字・数字・8文字・確認一致を検証。記号と前後空白を勝手に変更しない |
| 既存の有効招待・別クラブ追加 | flowのexisting、PW更新0回・既存所属保持 | PW再設定を要求せず、ログイン前のpending招待から承諾を再開 |
| 別Authがtokenだけ所持 | flowの両経路、既存認可・読取Service試験 | 他人のクラブ名・取消・期限・承諾済みを開示せず更新しない |
| 現在email変更 | flowの両経路 | 招待と不一致なら更新しない。JWTの古いemailだけで許可しない |
| 期限境界・取消・使用済み | flowの両経路、既存Domain試験 | 本人だけに安全な理由。承諾済みは再更新せず通常利用へ |
| 2並行・取消／再送競合・旧token | flowの両経路、実DB Repository試験 | 連打・2タブでもDB承諾1件。再送後の旧リンクは利用不可 |
| Auth成功DB失敗後の再開 | flowの両経路、Service／Action故障試験 | 設定済みPWでログイン。PWを再設定せず承諾を再開 |
| Auth結果不明 | 既存Service／Action試験 | 自動再送せず、入力したPWでログインして状態を確認 |
| Cookie改変・別タブ・直接Action | flowの両経路、Action／Page試験 | 古い表示時nonceで別招待を承諾しない。File・重複field・余分なIDも試す |
| inviteの実戻り形式・SSR Cookie再読取 | flowのnew、Auth単独試験 | fragment除去、実Set-Cookie、refresh、再読込、戻る操作を下記手順で確認 |
| Originと任意戻り先 | flowのconfirm Origin拒否・固定遷移、既存Action試験 | HTTP経由でforeign OriginのActionを拒否。外部next／redirectToへ遷移しない |
| no-store／no-referrer・秘密の非出力 | Route／entry／Service／Action試験 | 実応答・Referer・URL履歴・アプリ／インフラログを確認 |

自動試験のファイルは `tests/club-invitation-*` と
`src/application/club/invitation/*.test.ts`、Domainは
`domain/club/invitation/acceptance-*.test.ts` です。追加flowは
`tests/club-invitation-acceptance.flow.integration.test.ts` です。

## 実ブラウザの確認

1. 同じ専用stackへ接続したアプリをポート3000で起動し、新規・既存のテスト対象を用意します。
   fixtureは自動試験がDBを片付けるため、手動試験と同時に使い回しません。
   配送の代わりにローカルの管理された手段でテストリンクを生成します。
   このテストはリンクやtokenを出力しないため、テストログからリンクを取得しません。
2. 新規リンクを開き、Auth→`/welcome` の実戻りを確認します。
   `/auth/confirm` POST前にfragmentが履歴から除去され、送信先が同一originであることを確認します。
   生値をHAR、スクリーンショット、エラー報告へ保存しません。
3. GETのqueryが短期Cookieへ交換され、clean URLになること、context CookieがHttpOnly・
   SameSite=Lax・host-only・path=/・約15分であることを確認します。
   HTTPS本番相当ではSecureが付くことも別途確認します。ローカルHTTPではSecureなしです。
   Supabase Auth CookieはSDKの設定を確認し、contextと同じHttpOnly属性だと決めつけません。
4. 実レスポンスでno-storeとno-referrerを確認します。外部リンクへ秘密のRefererが出ないこと、
   第三者スクリプト・解析・外部画像から流出しないこと、URL/bodyを保存するログがないことを確認します。
   インフラ設定は運用担当へ確認し、アクセスログへ生値を出して検証しません。
5. 認証待ちではフォームを操作できず、PW認証済みには再設定を求めないことを確認します。
   PW表示切替・label・項目エラー・エラーフォーカス・Tab／Enter操作・pending抑止を確認します。
   エラー後、再読込、戻る、ブラウザの自動入力についてもPWがstateやHTMLへ反射されないことを確認します。
6. 同じ本人への別クラブ招待を2タブで開き、古いフォームから送信します。
   別の招待は承諾されず、再表示で選んだ招待だけが対象になることをDBの安全な状態表示で確認します。
7. 新規・既存の両方で有効、期限切れ、取消、承諾済み、別本人、email変更を確認します。
   自動試験のDB境界時刻は実ブラウザの待ち時間で代替しません。
8. HTTP経由の直接Action、foreign Origin、Cookie改変、任意戻り先を試します。
   NextのAction IDやセッションを外部へ出さず、同じ使い捨て環境だけで行います。
   関数直接呼出しのmock試験だけでHTTPのOrigin保護を確認済みにしません。
9. 完了後は正規slugのeventsへ進み、既存所属が残ること、戻る／再読込で再承諾しないことを確認します。

## 部分成功と再開

| 状態・表示 | 操作 |
| --- | --- |
| PW更新は成功、DB承諾は未完了 | 再設定・再送信を避け、設定したPWでログインして同じ招待を再開 |
| PW更新結果が不明 | 自動再試行しない。入力したPWでログインして最新状態を確認。失敗が続けば運営者へ連絡 |
| DB承諾済み、Cookie削除・再検証失敗 | 承諾をやり直さず、クラブ一覧から利用先を確認 |
| context期限切れ・別タブ差替え | 招待メールから開き直す。新contextが有効でも表示時nonceが古いフォームは使わない |
| アプリ招待期限切れ・取消 | OWNERへ新しい招待を依頼。Authユーザー削除や手動ACTIVE化で回避しない |
| 承諾済み | 通常のクラブ利用へ。tokenを再利用しない |
| 別本人・email不一致・認証方法不明 | 対象アカウントでログインし直す。合わなければ運営者へ確認 |

AuthのOTP期限は現設定3600秒、アプリ招待期限は24時間、contextは15分です。
各期限は独立です。Authが先に失効した場合はOWNERから再送します。
既存accountの承諾にPW再設定は不要です。共用のOTP期限・password policyを変更する場合は、
HPの回復導線への影響を別の変更として検討します。この粒度では変更しません。

## 後片付けと記録

flow試験はUUIDで追跡したクラブ・AppUserのDB fixtureだけを終了時に削除します。
Authのテストユーザーは残ります。使い捨てstackであることを確認し、管理された手順で環境を再作成します。
テスト失敗・強制終了でDB fixtureが残る場合も、既存データの一括削除へ切り替えません。

実行記録には日時、コミット、SDK・CLI・Auth版、対象環境の非秘密の識別名、
実行コマンド、passed／failed／skipped、未実施項目と担当者を残します。
実接続試験は失敗の原文を伏せるため、ケース名を使って設定・状態を安全に確認します。
PW、メール、token、Cookie、接続文字列、service role keyは添付しません。

| 確認区分 | patch作成時の扱い |
| --- | --- |
| 接続ガード・既存mock回帰 | 最終報告のコマンドと結果を参照 |
| 実DB＋実Auth flow | 未実施。通常実行のskipを成功扱いしない |
| 既存実DB／Auth単独 | 未実施の場合は未確認と記録 |
| 実ブラウザ・実応答ヘッダー・インフラログ | 未実施。全受入を満たすまではF06完了としない |
