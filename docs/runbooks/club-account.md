<!-- docs/runbooks/club-account.md -->

# F07 マイページ・本人氏名・複数Childの受入手順

F07粒度10の専用試験と手動受入の手順です。実装済み、mock試験済み、実DB試験済み、
ブラウザー確認済みを分けて記録します。patch作成・適用や通常テストの成功だけで
F07受入完了にはしません。この手順書は実DB操作、migration、実Auth変更、メール送信を代行しません。

## 対象と変更しないもの

- 本人氏名、複数Childの新規作成・編集、現在クラブへの所属追加・所属解除が対象です。
- emailはAuthとAppUserそれぞれの値を表示するだけです。Auth email・PWの更新は対象外です。
- Child本体は親のグローバルデータです。氏名・学年の編集は他クラブにも反映されます。
- 学年は未設定を許可し、DBではnullです。所属解除は現在クラブの所属をWITHDRAWNにします。
- 既存Childの再利用では複製しません。再有効化はWITHDRAWNだけです。
- SUSPENDED・INVITEDの本人による再有効化、Child本体の物理削除は提供しません。
- schema・migration・既存test:db・依存パッケージ・Auth設定は変更しません。

## 操作からDBまでの追跡箇所

画面・Actionの基点は `app/(club-app)/club/[clubSlug]/account/` です。

| 段階 | ファイル・関数、入力と出力 | DB変更 |
| --- | --- | --- |
| 表示 | `page.tsx / ClubAccountPage` がslugで認可し、`getClubAccount(context)` の表示DTOをフォームへ渡す | 読取のみ |
| 確認 | `AccountNameForm`・`ChildForm`・`ChildMembershipOperations` → `AccountConfirmDialog.tsx / useConfirmedAccountForm` がFormDataを保持し、確定後にActionへ渡す | なし |
| Action | `actions.ts` の各Actionがslugで再認可し、requestId・入力・束縛したChild IDを再確認する | Service経由 |
| 本人氏名 | `updateAccountNameAction` → `update-club-account.ts / updateClubAccountName` → `club-account-repository.ts / updateAccountNameForUser` | 本人AppUser.nameだけを更新 |
| 新規Child | `createChildAction` → `createClubChild` → `club-child-repository.ts / createChildForUser` | requestIdをChild IDとして、Childと初回ACTIVE所属を同一transactionで作成 |
| グローバル編集 | `updateChildAction` → `updateClubChild` → `updateChildForUser` | 本人Childのname・gradeだけを更新 |
| 所属の追加・再開 | `addChildToClubAction` → `addClubChild` → `addChildToClubForUser` | 現在クラブの所属作成、またはWITHDRAWNからACTIVEへ変更 |
| 所属解除 | `withdrawChildFromClubAction` → `withdrawClubChild` → `withdrawChildFromClubForUser` | 現在クラブのACTIVE所属だけをWITHDRAWNへ変更 |
| 候補 | `getAttachableChildrenAction` → `get-club-account.ts / getAttachableClubChildren` → `findAttachableChildrenForUser` | 本人が追加UIを開いた時だけ読取 |
| 再検証・完了 | `actions.ts / finishSavedAccount` がRepository由来slugを `revalidateClubAccountNamePaths` または `revalidateClubAccountPaths` へ渡し、固定account URLへredirect | 再保存なし |
| ログアウト | `AccountLogoutButton` が確認後に `app/(club-app)/club/actions.ts / logoutAction` を呼ぶ | Authセッションを終了、アプリDB更新なし |

Serviceは `src/application/club/account/`、Repositoryは
`src/infrastructure/prisma/repositories/`、再検証は
`app/(club-app)/club/revalidate-club-paths.ts` です。
氏名更新は影響クラブの会員管理とaccount、Child編集は影響クラブのaccountを再検証します。
作成・所属追加・解除の影響先は現在クラブです。保存済みで再検証が失敗した場合は
`saved-reload` の案内に従って再読込し、保存操作を無条件に再送しません。
今回のフローに後続粒度待ちの接続はありません。公開先の未提供は後述の受入保留事項です。

## DBなしの自動回帰

実接続用flagを設定しない環境で実行します。共有Prisma clientはdotenv初期化を持つため、
この専用試験ではトップレベルimportせず、専用clientをガード後に注入します。
`.env` の内容や接続文字列を表示・報告しません。

```sh
npm test -- \
  domain/club/account \
  src/application/club/account \
  tests/club-account-repository.test.ts \
  tests/club-child-repository.test.ts \
  tests/club-account-actions.test.ts \
  tests/club-account-revalidation.test.ts \
  tests/club-account-navigation.test.ts \
  tests/club-account-pages.test.ts \
  tests/club-account-forms.test.ts \
  tests/club-account.flow.integration.test.ts \
  tests/club-membership-authorization.test.ts \
  tests/club-members-actions.test.ts \
  domain/club/club-login-destination.test.ts \
  domain/club/club-revalidation-paths.test.ts
```

`tests/club-account.flow.integration.test.ts` の接続ガード15件はDBなしで実行でき、
実DBの16件は両flagが揃わなければskipします。
既存DB試験には共有clientをトップレベルimportするものがあります。
通常実行へ `RUN_DB_INTEGRATION_TESTS=1` を持ち越さず、この手順で既存test:dbを起動しません。

## 使い捨てローカルDBの事前確認と実行

1. 日常の開発データ・本番データを含まない、破棄できる専用ローカルDBを用意します。
2. 既存migrationが適用済みであることを担当者が確認します。専用試験はmigration・seed・reset・
   schema変更を実行しません。fixtureに必要なAppUserはDBだけに作成し、実Authは変更しません。
3. 接続設定は承認された方法でプロセス環境へ渡します。URL・PWをコマンド引数、
   チャット、結果ファイルへ貼り付けません。専用scriptはdotenvを自動読込しません。
4. loopbackがリモートDBへのトンネル・proxyではないことを担当者が確認します。
   URLの検査だけでは転送先やDBが空であることまでは証明できません。
5. 使い捨てであることを確認した担当者だけが `CLUB_ACCOUNT_DISPOSABLE=1` を設定します。

| 環境設定 | 許可・用途 |
| --- | --- |
| `DATABASE_URL` | postgres/postgresql、localhostまたは127.0.0.1、ポート54322、DB名postgres、認証あり。query・fragmentなし |
| `CLUB_ACCOUNT_DISPOSABLE` | 担当者が使い捨て確認後に設定する1 |
| `NODE_ENV` | productionを拒否 |
| `RUN_CLUB_ACCOUNT_TESTS` | F07専用flag。専用scriptが1に設定 |
| `RUN_DB_INTEGRATION_TESTS` | DB用flag。専用scriptが1に設定 |

事前条件を満たした環境で、次の専用コマンドだけを実行します。

```sh
npm run test:club-account:local
```

両flagがあっても接続条件が不正なら、接続前に固定メッセージで失敗します。
失敗報告に設定値・Prisma原文・個人情報を含めません。ケース名・基準コミット・
PostgreSQLとPrismaの版・migration適用状況・pass/fail/skipと理由を記録します。
接続先を広げるためにガードを外しません。

fixtureは各ケースのUUIDで分離し、作成したクラブ・AppUserのUUIDだけをcleanupします。
全件削除・truncateは行いません。クラブ・親の削除による既存Cascadeで関連fixtureを片付けます。
途中失敗・強制終了時は専用環境に残る可能性があるため、他データと共用せず担当者が残存を確認します。

## 実DB試験が確認することと限界

- Child所有者とparentUserId、親MembershipのclubIdとuserIdの複合FK、存在しないクラブの拒否。
- 同一Child・同一クラブのunique、同じ作成識別子の競合・再送でも保存は1回だけ。
- Childと初回所属の実transaction rollback。FK失敗と、Repositoryの初回所属createへの障害注入を区別。
- 自分と他人、クラブA/B、現在所属と候補、親所属の失効、対象ID・requestIdの改ざん。
- WITHDRAWNだけの再有効化、SUSPENDED・INVITED拒否、解除時のChild・他クラブ所属の保持。
- 別クラブから編集したChildの再読取、複製しないこと、氏名更新でemail・Child・所属を変えないこと。
- 作成・編集・解除・再有効化・親の失効を同時開始した結果と永続化の整合性。
- DBから導出した影響先だけを再検証へ渡すことと、固定URLへのredirect。

Auth本人取得・Actionの入口認可・Nextのredirect・revalidatePathは試験用境界へ置換します。
Service・Repository・DB制約は実物です。失効済みcontextも渡し、Repository側の再確認を検証します。
この試験は実Auth、Nextの実キャッシュ、HTTP経由のOrigin検査、ブラウザーを検証しません。
`Promise.all` による競合試験は同時開始の結果を確認しますが、特定SQLの順序やP2034発生を
強制しません。再試行上限・特定エラー注入は既存Repository単体試験と分けて記録します。

## 実ブラウザーの受入

担当者が用意した使い捨てアカウントとクラブA/Bだけで確認します。
自動DB試験のfixtureにはAuthユーザーを作らないため、これをそのままログイン用途へ流用しません。

| 観点 | 操作と期待結果 |
| --- | --- |
| ロール | OWNERはLINE設定・会員管理、OWNER/COACH/OFFICERは管理用イベント・お知らせ、MEMBERは一般導線。非表示のURLへ直接アクセスしても既存認可で拒否される |
| PlatformAdmin | 有効なPlatformAdmin本人にだけ専用リンクが表示される。表示と遷移先の完成度は別判定 |
| クラブ切替 | 利用可能なACTIVE所属が0/1件なら非表示、2件以上なら表示。現時点のSTANDARDだけを件数へ含め、STARTER・PROを足さない |
| 複数Child | 2人以上を並べ、ラベル・入力ID・エラー・pendingが混線しない。学年未設定の保存と再読込も確認 |
| 確認と入力保持 | 氏名・Childの編集内容を変えて確認を開く。キャンセルで入力が残り、送信されない。確定後だけ保存する |
| アクセシビリティ | ダイアログの見出し、初期フォーカス、Tab/Shift+Tabの閉じ込め、Escと閉じる操作、復帰先を確認。pending中は閉じない |
| 所属操作 | 他クラブの既存Childを再利用。現在クラブから外しても他クラブ表示が残り、再追加で同じChild・所属を再利用する |
| 連打と再読込 | 確定連打・通信遅延・戻る・再読込を確認。同じ作成識別子を再送しても重複せず、次の新規登録は新しい識別子になる |
| エラー | 入力エラーが正しい欄に出てフォーカス移動する。別Childのエラーへ混ざらず、例外原文を画面へ出さない |
| 横断更新とキャッシュ | Aで氏名・Childを編集しBでも再読取。氏名は会員管理にも反映する。再検証失敗時は保存済み案内となる |
| email | AuthとAppUserの値を表示するだけで、編集欄がない。フォーム改ざんでもemailを更新しない |
| 外部リンク | 正式HP・Instagramの承認済みhttps先、別タブ、relを確認。不正URLは表示されない |
| ログアウト | マイページの確認をキャンセルして入力保持、確定してログイン画面へ。Headerの既存ログアウトとは別に記録 |

フォームのnode試験はhook境界を模しており、DOM・native dialog・実際の入力保持・
ブラウザー履歴・beforeunloadを保証しません。上記の結果を別途残します。

## HTTP経由の直接呼び出し

関数直接試験をHTTPの保護の証明にしません。使い捨てローカルアプリで次を確認します。

1. 正常な保存リクエストを開発者ツールで識別し、変更前のfixture件数・値を記録します。
2. ローカル検証用のHTTPクライアントで、そのリクエストのOriginを別Originへ変更します。
   現在のAction識別子やCookieを公開資料・ログへ保存せず、実アカウントの認証情報を流用しません。
3. Nextがforeign Originを拒否し、DBに変化がないことを確認します。拒否応答・固定された挙動と
   アプリログの機密値非出力を記録します。Action識別子を文書へ固定しません。
4. 正常Originで対象childId、requestId、clubId、親ID、returnTo・影響slugをそれぞれ改ざんし、
   他人・他クラブの更新や外部redirectが起きないことを確認します。
5. 表示後に親Membershipを失効させたリクエストでも保存できないことを確認します。

## 保留事項と結果記録

| 項目 | patch作成時点の状態 |
| --- | --- |
| DBなしガード | 15件成功。実DBへ接続せずに確認 |
| 実DB統合 | 16件。実DB変更を行わない条件のため未実行・skip。実制約・rollback・競合の成功は未確認 |
| 既存単体・回帰 | 上記の対象18ファイルで、ガードを含む812件成功・実DB16件skip。一時環境で実行 |
| 実Auth・ブラウザー・HTTP | 未実施。別の受入結果が必要 |
| 規約・プライバシー | `domain/club/account/account-links.ts / ACCOUNT_LEGAL_URLS` はnull。公開URL・文面未確定。仮ページで代替しない |
| Platform遷移先 | `AccountNavigation` の `/platform/support` はF07外の依存。表示確認だけで到達済みにしない |
| F07受入完了 | 上記の未確認・未提供事項が残る間は未達 |

実施時は各項目に担当者・日付・基準コミット・実行環境・結果と根拠を追記します。
未実行をpassへ読み替えず、失敗した場合もこの粒度で本体を勝手に改修しません。
該当ファイル・関数・条件を特定し、修正すべき粒度と計画変更案を報告します。
