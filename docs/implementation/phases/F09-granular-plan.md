<!-- docs/implementation/phases/F09-granular-plan.md -->

# F09 Platformサポート管理画面：粒度別実装計画

## 1. 基準と確定事項

- 調査時の `git status --short` は空。ブランチは `feat/club-app-foundation`。
- 基準コミット：`42431dc7d0e296a4725a6b919e4f50eae2071b63`。
- 優先順位はAGENTS.md、F09.md、背景資料proposals2.md、現在コードによる実装状況の照合。
  CLAUDE.mdは `@AGENTS.md` の参照のみ。
- この作業は計画文書の作成のみ。ソース、index、依存関係、DB、Auth、メールを変更しない。
- 以降の新規パス・関数名はすべて提案名。既存シンボルとして存在するとの主張ではない。
  粒度作成時に参照検索をやり直し、先行粒度の適用済みコードを基準とする。

### ユーザー回答で確定した仕様

1. 内部メモ更新時は対応者を更新する。
2. statusChangedAt・resolvedAtはステータスが実際に変わった場合だけ更新する。
   同じステータスの再送では日時を維持する。
3. 一覧は1ページ50件のページ送りを付ける。全件本文の一括取得はしない。

### 本計画で採用する設計と、粒度1で仕様へ補足する事項

- F09.md推奨の `/platform-login` を新設する。成功後は固定 `/platform/support`。
  任意returnToを追加せず、既存クラブログインや招待再開を変更しない。
- DEVELOPER・SUPPORTかつisActive=true、本人Auth IDとPlatformAdmin.idの一致が必要。
  ClubMembershipもAppUserもPlatformログインの必須条件にしない。
- statusは4種の既存enumを使用。RESOLVEDへの実変更でresolvedAtを設定し、
  非RESOLVEDへの実変更でnullにする。statusChangedAtと同じサーバー時刻を使う。
- status変更とメモ保存は別操作。status操作でメモを上書きせず、メモ操作で日時を変更しない。
- 競合検出には既存SupportReport.updatedAtを使う案。競合を無条件に再試行しない。
  同じstatusの再送は変更なしとして成功を返し、対応者や日時を奪い合わない。
- 内部メモはtrim後5000文字、空はnullとする案。これは現行仕様の確定値ではなく、
  今回の実装案として粒度1で明文化する。既存DB値を表示時に破壊・切り捨てない。
- 表示日時は共通 `formatClubDateTime(date, "Asia/Tokyo")` を使いJSTと明示する案。
  DBはUTC。クラブ別timezoneを同じ一覧内で暗黙に混在させない。
- status選択は背景設計どおり変更後に送信し、メモは明示的な保存ボタンで保存する。
- ページ送りはcreatedAt desc・id descで安定化したoffset方式を最小構成とする。
  スクロール中の新規投稿によるページ間移動まではスナップショット保証しない。

## 2. 現在の実装状況

| 区分 | 確認済みの根拠と、F09で残る仕事 |
| --- | --- |
| 実装済み：DB | `prisma/schema.prisma / SupportReport` に管理用status、internalNote、handledByPlatformAdminId、statusChangedAt、resolvedAt、updatedAtが存在。PlatformAdminと両enumも存在 |
| 一部実装：認可 | `app/(club-app)/platform/require-platform-admin.ts / requirePlatformAdmin` はgetUserと本人PlatformAdminのisActiveを確認する。未ログイン先 `/platform-admin/login` は存在しない。ロールの明示判定・専用試験は未実装 |
| 実装済み：クラブ権限分離 | `club-membership-authorization.ts / requireActiveClubMembership` は本人・slug・ACTIVE所属を照合。`club-app-authorization.ts / requireClubAppAccess` は利用プランを確認。Platform権限によるOWNER代行は存在しない |
| 実装済み：マイページ導線 | `club-account-repository.ts / findClubAccountForUser` は本人のactive PlatformAdmin有無を取得。`AccountNavigation.tsx / AccountNavigation` は `/platform/support` リンクを表示。リンクを重複作成しない |
| 実装済み：F08受付 | `support-report-repository.ts / createSupportReportForMember` がOPEN・snapshot・metadataを作成。`recordSupportReportNotification` が通知列だけを更新。F09へ受付・メール送信を混在させない |
| 一部実装：ログイン基盤 | `src/infrastructure/supabase/server.ts / createClient`、クラブログイン・HP管理ログインがある。Platform専用ログイン、ログアウト先、Membership 0件の導線は未実装 |
| 一部実装：セッション更新 | `proxy.ts / config.matcher` にclub・club-login等はあるがplatform・platform-loginはない。`updateSession` はCookie更新のみで認可しない |
| 未実装：管理読取・更新 | 全クラブ一覧、club/status/categoryフィルター、50件ページ送り、全文表示、管理列の更新Repository・Service・Actionは存在しない |
| 未実装：専用画面 | Platform配下はrequire-platform-admin.tsだけ。layout、support/page、フォーム、ログインPage・Componentは存在しない |
| 一部実装：試験 | F08の単体・DBガード、クラブ認可、Platformリンクの表示試験はある。Platform権限そのもの・管理操作・横断読取の試験はない |

`docs/proposals2.md` はPlatform全クラブ横断をSupportReport限定の例外とし、
Platform用とクラブ会員用のRepository分離を明記する。F09の実装境界として採用する。

## 3. 調査した主要ファイルと確認シンボル

| ファイル | 確認した関数・型・モデル・設定 |
| --- | --- |
| `AGENTS.md`、`CLAUDE.md` | 粒度制限、patch作成、import説明、Nextローカルdocs優先 |
| `docs/implementation/phases/F09.md` | 10項目、inactive拒否、権限分離、RESOLVEDの日時 |
| `docs/proposals2.md` | Platform横断例外、専用Repository、7-22一覧・フィルター・全文・status即時更新、従来のreturnTo案 |
| `app/(club-app)/platform/require-platform-admin.ts` | PlatformAdminAccessContext、requirePlatformAdmin、存在しないredirect先 |
| `prisma/schema.prisma` | PlatformAdmin、SupportReport、Club、AppUser、ClubMembership、PlatformAdminRole、SupportReportStatus/Category |
| `prisma/migrations/20260816221153_add_club_app_schema/migration.sql` | 管理列、TIMESTAMP(3)、担当者FKのON DELETE SET NULL |
| `src/infrastructure/prisma/repositories/support-report-repository.ts` | createSupportReportForMember、recordSupportReportNotification。管理列を変更していないこと、通知保存もupdatedAtへ影響し得ること |
| `src/application/club/support/create-support-report.ts` | createSupportReportのDB→通知→結果保存。F09から再通知しない |
| `domain/club/support/support-report-form.ts` | SUPPORT_REPORT_CATEGORY_OPTIONS、既存受付契約。カテゴリラベルを必要なら読み取り利用 |
| `domain/club/support/support-report-metadata.ts` | sanitizeSupportPageUrl、sanitizeSupportUserAgent。保存済みmetadataも表示では不信入力として扱う |
| `types/prisma.ts` | PlatformAdmin・SupportReportモデル型と各enumのtype再export |
| `app/(club-app)/club-login/actions.ts` | loginAction、LoginActionState、signInWithPassword、招待再開・所属別redirect |
| `app/(club-app)/club-login/page.tsx`、`LoginForm.tsx` | ClubLoginPage、LoginForm、useActionState、パスワードをstateへ返さない構成 |
| `app/(club-app)/club/actions.ts` | logoutActionはscope:localでsignOutし、club-loginへredirectするため、そのままPlatformから使わない |
| `app/admin/login/actions.ts` | loginAdmin、既存ログイン制限の利用例。raw errorのconsole出力は新実装へコピーしない |
| `lib/security/login-rate-limit.ts`、`login-submission-log.ts` | checkLoginRateLimit、saveLoginSubmissionLog、共通LoginSubmissionLogの利用条件 |
| `lib/security/hash.ts`、`request.ts` | hashValueのFORM_LOG_HASH_SALT依存、getRequestMetaのheaders。値自体は未読 |
| `src/infrastructure/supabase/server.ts`、`middleware.ts` | createClient、updateSession、Cookie設定・更新と認可の違い |
| `proxy.ts` | matcher、招待専用処理、updateSession呼出し。Platform追加時も招待処理を変えない |
| `app/layout.tsx`、`app/(club-app)/club/[clubSlug]/layout.tsx` | RootLayout、ClubAppLayout。ClubHeader/Footerはclub/[clubSlug]配下だけ |
| `app/(club-app)/club/club-membership-authorization.ts`、`club-app-authorization.ts` | requireActiveClubMembership、requireClubOwner、requireClubAppAccess等。独立した所属境界 |
| `src/infrastructure/prisma/repositories/club-account-repository.ts` | findClubAccountForUser内の本人active PlatformAdmin判定 |
| `app/(club-app)/club/[clubSlug]/account/AccountNavigation.tsx` | isPlatformAdminとサポートリンク。会員管理導線は別のClubMemberRoleで判定 |
| `domain/shared/action-state.ts`、`request-id.ts`、`email.ts` | ActionState/FieldErrors、createInitialActionState、createRequestId/isRequestId、normalizeEmail。正規化とメール検証は別 |
| `src/infrastructure/logging/sanitize-log-context.ts`、同test | sanitizeLogContext、SanitizedLogContext、許可項目と固定DomainErrorCode |
| `domain/shared/date-time/club-date-time.ts`、同test | formatClubDateTime、timezone指定と日時検証 |
| `tests/club-invitation-login-resume.test.ts` | 既存loginAction/Pageのmock境界、招待再開を壊さない回帰 |
| `tests/club-invitation-entry.test.ts` | proxyと既存matcher試験、Next付属のmatcher評価器 |
| `tests/club-membership-authorization.test.ts` | inactive所属拒否。Platform本人でも所属なしならクラブ認可不可の回帰基点 |
| `tests/club-account-repository.test.ts`、`tests/club-account-navigation.test.ts` | 本人active PlatformAdminのリンク有無。F09の権限検証済みとは扱わない |
| `tests/support-report.flow.integration.test.ts` | enabled、localConfiguration、safeCheck、専用client注入、UUID限定cleanup |
| `prisma/seed-app-local.ts` | ローカルPlatformAdminとOWNERを同時作成するfixture。権限が結合している根拠ではない。今回変更・実行しない |
| `package.json`、`package-lock.json`、`vitest.config.mts` | scripts、固定された版、node環境、server-only alias |

### インストール済みバージョンとNext規約

package.jsonの指定、lockの該当エントリ、インストール済みpackage情報を照合した。
Next 16.2.6、React 19.2.4、Prisma Client/adapter-pg 7.8.0、Supabase JS 2.112.3、
SSR 0.10.3、Zod 4.4.3、Vitest 4.1.10。パッケージ更新は不要。

`node_modules/next/dist/docs/` は存在し、関係する箇所を確認した。

- `01-app/02-guides/authentication.md`：layoutだけの認可では不十分。Page・Action・データ取得境界で確認。
- `01-app/03-api-reference/04-functions/cookies.md`：非同期Cookie API。
- 同 `unstable_rethrow.md`：catch先頭でNext制御例外を再送出。redirectを一般失敗へ丸めない。
- 同 `revalidatePath.md`：Server Functionから固定パスを再検証する。DB保存後の再検証失敗を再保存理由にしない。
- `01-app/03-api-reference/03-file-conventions/proxy.md`：matcherとProxyの境界。
  Proxyのセッション更新を権限の正本にしない。

必要なSDK呼出しは既存signInWithPassword・getUser・scope:localのsignOutを基点とする。
未解決のSDK仕様は現時点でなく、外部資料の検索や生成Prisma Clientの本文調査はしていない。

## 4. 共通の調査・実装境界

各粒度の調査開始には `AGENTS.md`、F09.mdの該当仕様、当該粒度、`vitest.config.mts` を含む。
以下に列挙する開始ファイルは現在存在するものだけ。新規案と、先行粒度適用後の確認は別に示す。
「変更しない」は読取禁止ではない。互換性・セキュリティ上必要なら依存先を追加確認する。
範囲外変更が必要になったら、理由・影響先・計画変更案を報告し、勝手に実装しない。

- Platform用の新規Domain・Service・Repositoryを分離する。F08受付Repositoryに管理用引数を追加しない。
- actor IDは認可contextから構築し、フォームの担当者ID・権限・日時・clubIdを採用しない。
- 横断読取・更新の対象はSupportReportだけ。Club・PlatformAdminは必要な表示・認可列だけを読む。
- Page/Layout/Actionは毎回本人を確認し、Repositoryも最新PlatformAdminを再照合する。
  stale context、無効化、権限のない直接呼出しを拒否する。
- 内部メモ・本文・snapshot・PW・Cookie・UA・URL・SDK/DB例外原文をログへ渡さない。
  ログはsanitizeLogContextの許可項目と固定operation/result/errorCodeだけ。
- 管理DTOに限定selectを使い、機密を含むDTOを長期の共有cacheへ格納しない。
  一覧は要求時に取得し、認可前のデータ取得・一覧prefetchによる非開示破りを防ぐ。
- 再検証は固定 `/platform/support`。クラブ用再検証関数や任意returnToは使わない。
- スキーマ変更・追加パッケージ・Service Role key導入・Supabase RLS緩和・実Auth管理は不要。
- patch時のソース変更・実行は一時環境だけ。元のワークツリーはfeature.patch以外変更せず、
  git apply --check・--stat・最終statusを確認する。実DB・実メールはpatch作成で動かさない。

## 5. 粒度一覧・依存関係

| 粒度 | 目的 | 主な依存 |
| --- | --- | --- |
| 1 | 仕様補足と管理入力・query・結果・日時契約 | 現状 |
| 2 | Platform認可の完成と専用読取Repository | 1 |
| 3 | Platform専用ログイン・ログアウトAction | 2 |
| 4 | ログインPage・フォーム・セッション更新経路 | 3 |
| 5 | Platformサポート一覧の読取Repository | 1・2 |
| 6 | 管理列を限定更新するRepository | 1・2 |
| 7 | 一覧取得・status変更・メモ保存のService | 5・6 |
| 8 | 管理操作Server Actionと再検証 | 7 |
| 9 | Platform専用layoutと読取画面 | 4・7 |
| 10 | status即時更新・メモ保存UIの接続 | 8・9 |
| 11 | ガード付き実DBフロー・専用script | 2〜10 |
| 12 | 運用手順・ブラウザー・HTTP受入 | 1〜11 |

順次適用を基本とする。5・6は互いの実装へ依存させず別ファイルにする。
4のログイン成功先は9まで未提供、8の更新Actionは10まで画面未接続。
途中粒度の適用可能性と、F09全体の利用可能・受入完了を区別する。

## 6. 各粒度の計画

### 粒度1：仕様・管理入力・query・結果契約

**目的**：確定回答と、未仕様化の入力上限・日時・競合処理を純粋な契約へ固定する。

**調査開始ファイル**

- `docs/implementation/phases/F09.md`：10項目と確定回答の補足先。
- `prisma/schema.prisma`、`types/prisma.ts`：SupportReportの列、enum、updatedAt、型の入口。
- `domain/club/support/support-report-form.ts`、`domain/club/support/support-report-form.test.ts`：カテゴリ定義と限定FormDataの既存例。
- `domain/shared/action-state.ts`、`domain/shared/request-id.ts`：値・エラー・requestIdと認可の違い。
- `src/infrastructure/prisma/repositories/support-report-repository.ts`：通知更新も行われる既存行の境界。

**変更予定の既存ファイル**：`docs/implementation/phases/F09.md` のF09内の仕様補足だけ。

**新規案**：

- `domain/platform/support/support-report-query.ts`
- `domain/platform/support/support-report-query.test.ts`
- `domain/platform/support/support-report-management-form.ts`
- `domain/platform/support/support-report-management-form.test.ts`
- `domain/platform/support/support-report-management-policy.ts`
- `domain/platform/support/support-report-management-policy.test.ts`
- `domain/platform/support/support-report-management-types.ts`

**内容**：queryのclubId/status/category/pageを単一値として検証。50件固定、pageは正整数・
安全な上限、無効フィルターを無条件の全件取得へ変換しない。status・noteは別parse。
reportId、expectedUpdatedAt、requestIdを検証し、担当者ID・管理日時・通知列を採用しない。
note空→null・5000文字案、日時遷移、同status no-op、UPDATED/UNCHANGED/CONFLICT等の固定結果を定義する。

**必要時だけ確認**：UUID・日時の型が不明なら既存Zod型・該当migrationを確認する。
一覧のラベル変更が必要な場合だけF08カテゴリ参照元を検索する。

**変更しない**：F08契約、DB、Repository、Action、画面、ログ基盤。
**完了条件・試験**：純粋関数の境界、重複/File、空欄・5001文字、enum外、日時不正、
RESOLVED往復・同status・メモのみの日時不変、型で公開結果への内部列混入防止。
新規3testと既存 `domain/club/support/support-report-form.test.ts` を実行する。

### 粒度2：Platform権限の完成

**目的**：本人のactiveなDEVELOPER/SUPPORTだけにPlatform access contextを返す。

**調査開始ファイル**

- `app/(club-app)/platform/require-platform-admin.ts`：requirePlatformAdminとcontext型、redirect先。
- `src/infrastructure/supabase/server.ts`：createClient、getUserを使う認証境界。
- `prisma/schema.prisma`：PlatformAdmin.id/isActive/role、ClubMembershipと独立したモデル。
- `tests/club-membership-authorization.test.ts`：認可のmock方法と越権防止の回帰。
- `tests/club-account-repository.test.ts`、`tests/club-account-navigation.test.ts`：リンク判定の既存仕様。

**既存変更**：`app/(club-app)/platform/require-platform-admin.ts`。
**新規案**：`src/infrastructure/prisma/repositories/platform-admin-repository.ts`、
`tests/platform-admin-repository.test.ts`、`tests/platform-authorization.test.ts`。
提案 `findActivePlatformAdminByUserId` を限定selectで実装し、helperから利用する。

**内容**：redirectを `/platform-login` へ修正。本人ID一致・isActive・両roleを明示確認する。
未ログインは固定ログイン先、一般会員/inactiveは情報を開示せず拒否する。
Membership 0件・AppUserなしのPlatformAdminを許可する。任意returnTo・クラブOWNER昇格は作らない。

**必要時だけ確認**：Auth型・制御例外の該当Nextローカルdocs。DBエラーを権限ありへ丸めない。
**変更しない**：クラブ認可、マイページリンク、DB、PlatformAdmin登録、既存Auth設定。
**完了条件・試験**：両role、inactive、他人のID、一般会員、Auth失敗、DB例外、Membership 0件。
新規2testと既存クラブ認可・Platformリンク試験。後続Page/Actionからの呼出し元は各粒度で確認する。

### 粒度3：専用ログイン・ログアウトAction

**目的**：クラブ所属に依存せず認証し、Platform用の固定遷移を行う。

**調査開始ファイル**

- `app/(club-app)/club-login/actions.ts`：loginActionのPW非返却・requestId・既存招待分岐を確認。
- `app/(club-app)/club/actions.ts`：scope:localのlogoutAction。遷移先が異なるため変更せず参考にする。
- `app/admin/login/actions.ts`：checkLoginRateLimit/saveLoginSubmissionLogの利用例。
- `lib/security/login-rate-limit.ts`、`lib/security/login-submission-log.ts`、`lib/security/hash.ts`、`lib/security/request.ts`：必要な設定とログ境界。
- `domain/shared/email.ts`、`domain/shared/action-state.ts`、`domain/shared/request-id.ts`、
  `src/infrastructure/logging/sanitize-log-context.ts` と `src/infrastructure/logging/sanitize-log-context.test.ts`。
- `tests/club-invitation-login-resume.test.ts`：既存ログインを壊さない回帰。

**先行後に確認**：2のPlatformAdmin Repositoryと試験。
**既存変更**：なし。
**新規案**：

- `domain/platform/platform-login-form.ts`
- `domain/platform/platform-login-form.test.ts`
- `app/(club-app)/platform-login/actions.ts`
- `tests/platform-login-actions.test.ts`

提案 `platformLoginAction`・`platformLogoutAction` を作る。

**内容**：単一email/password/requestIdを検証し、normalizeEmailと形式検証を分ける。
PWはstate/URL/ログへ返さない。Auth成功後に本人active PlatformAdminを再照合し、固定support先へ進む。
非管理者・inactiveには固定エラー。認証成功後の権限拒否では当該ローカルセッションを破棄する。
単にログインPageを開いた一般クラブ会員を勝手にsignOutしない。
logoutは本人の現在セッションだけを終了しplatform-loginへ遷移。inactiveでも自分のlogoutは可能にする。

既存rate limit関数とハッシュ化試行ログを利用する案。IP・email原文をログへ出さずUA保存は省略する。
既存HPログインと試行数を共有する点を明記し、ログ保存例外はsanitizeした固定分類だけを記録する。
制限判定障害時はsignInへ進まない。Auth/DB障害で許可へfallbackしない。

**必要時だけ確認**：SDK型でsignIn/getUser/local signOutの挙動が不足する場合だけ該当型。
ログ関数の参照元を追加確認してもHP側のraw error修正へ範囲を広げない。
**変更しない**：既存ログイン、招待再開、reset-password、HPログイン、共通rate limit・ログ関数、DB。
**完了条件・試験**：両role・所属0・一般ユーザー・inactive・認証失敗・制限・設定障害・logout失敗、
requestId/重複/File、秘密値非反射、固定遷移、Next制御例外。新規2testと既存招待ログイン回帰。

### 粒度4：専用ログインPage・フォーム・Proxy経路

**目的**：安全な専用ログインUIとセッション更新経路を提供する。

**調査開始ファイル**

- `app/(club-app)/club-login/page.tsx`、`app/(club-app)/club-login/LoginForm.tsx`：PageとClient状態の分離、useActionStateの例。
- `src/infrastructure/supabase/server.ts`、`src/infrastructure/supabase/middleware.ts`：非同期Cookie、更新責務。
- `proxy.ts`：config.matcherと招待専用分岐。
- `tests/club-invitation-entry.test.ts`：現在のmatcherと招待回帰。
- `app/layout.tsx`：専用ログインの親layoutがクラブFooterを付けないこと。

**先行後に確認**：2・3のhelper・Domain・Actionsと試験。
**既存変更**：`proxy.ts` のmatcherに `/platform/:path*` と `/platform-login/:path*` を追加するだけ。
**新規案**：

- `app/(club-app)/platform-login/page.tsx`
- `app/(club-app)/platform-login/PlatformLoginForm.tsx`
- `app/(club-app)/platform-login/PlatformLogoutButton.tsx`
- `tests/platform-login-pages.test.ts`
- `tests/platform-login-forms.test.ts`
- `tests/platform-entry.test.ts`


**内容**：既存セッションのactive管理者は固定support先、未認証はログインフォーム。
既存非管理者セッションでは情報を出さず、再ログイン/本人logoutが可能でループしない構成にする。
Cookieの更新はProxyへ、認可はPage/Actionへ置く。PW非保持、項目エラー、pending、固定エラーを確認する。
専用logoutボタンは後続Platform layoutでも再利用し、クラブ用logoutの遷移先は変えない。

**必要時だけ確認**：Next matcher評価器・useActionState・Cookie APIのローカルdocs/型。
**変更しない**：updateSession本体、招待Cookie変換、既存matcher対象、既存ログインUI、club/public layout。
**完了条件・試験**：新規Page/フォーム/entry試験、両Platform経路のmatcher評価、
既存 `tests/club-invitation-entry.test.ts`・`tests/club-invitation-login-resume.test.ts` 回帰。
node試験を実Cookie更新・HTTP認証の実証にしない。

### 粒度5：Platform一覧の読取Repository

**目的**：認可されたPlatform担当者にだけ、全クラブの限定DTOと絞り込み候補を返す。

**調査開始ファイル**

- `prisma/schema.prisma`：SupportReport・Club・PlatformAdmin・担当者関係とindex。
- `src/infrastructure/prisma/repositories/support-report-repository.ts`：F08受付との責務分離。
- `src/infrastructure/prisma/repositories/club-account-repository.ts`：限定selectの既存例。
- `src/infrastructure/prisma/client.ts`：共有clientとdotenvの副作用。
- `tests/support-report-repository.test.ts`：DBなしRepository試験のmock境界。

**先行後に確認**：1のquery/DTOと2のactor境界。
**既存変更**：なし。
**新規案**：`src/infrastructure/prisma/repositories/platform-support-report-repository.ts`、
`tests/platform-support-report-repository.test.ts`。
提案 `findSupportReportsForPlatform`。

**内容**：同一transactionでactorの本人IDとPlatformAdmin.idを最新isActive/roleと再照合し、一覧・件数・候補を取得する。
club/status/categoryをANDで適用、50件＋件数、createdAt desc/id desc。
クラブ候補は報告を持つクラブのid/name/slugだけ。クラブプランで横断結果を除外しない。
本文、snapshot、metadata、管理列、担当者の表示名を必要なselectだけで返す。
PlatformAdmin.email等の不要な列やAuth情報をDTOへ加えない。読み取りで管理列を変更しない。

**必要時だけ確認**：実行計画に問題が出た場合だけ既存index・SQLを追加調査する。
現時点で新indexやcursor基盤は計画しない。
**変更しない**：F08 Repository、ClubMembership用Repository、schema、通知、画面。
**完了条件・試験**：両role・inactive・一般会員・古いcontext、全クラブ/各filter、0件、
50件境界・2ページ・同時刻順序・無効query、限定DTO、DB例外の安全化。新規Repository単体試験。

### 粒度6：status・内部メモの更新Repository

**目的**：許可された管理列だけをatomicに変更し、権限失効・競合・日時更新を守る。

**調査開始ファイル**

- `prisma/schema.prisma`、`prisma/migrations/20260816221153_add_club_app_schema/migration.sql`：管理列・担当者FK・日時精度。
- `src/infrastructure/prisma/repositories/support-report-repository.ts`：既存の通知列限定updateMany・transaction。
- `tests/support-report-repository.test.ts`：更新0件・固定結果・原文非反射の例。

**先行後に確認**：1のpolicy/formと2の最新actor照合。
**既存変更**：なし。
**新規案**：`src/infrastructure/prisma/repositories/platform-support-report-mutation-repository.ts`、
`tests/platform-support-report-mutation-repository.test.ts`。
提案 `updateSupportReportStatusForPlatform`・`updateSupportReportNoteForPlatform`。

**内容**：transaction内で最新Platform権限と対象行を照合する。
reportId＋expectedUpdatedAtで条件付き更新し、0件をNOT_FOUND/CONFLICT等の固定結果へ分ける。
status変更はstatus/担当者/状態日時/解決日時だけ、メモ保存はinternalNote/担当者だけ。
担当者はcontext由来。statusChangedAtは実status変更時、resolvedAtはRESOLVEDへ入る時のnow、
出る時はnull。同status再送は日時・担当者を変更しない。メモだけでは両日時を維持する。
本文・snapshot・clubId・membershipId・通知列を変更しない。
通知結果保存に伴うupdatedAt変化も競合になり得るため、無条件上書きせず再読取を案内する。

**必要時だけ確認**：競合・FK・トリガーに差が出た場合だけ対象migrationを確認。
PlatformAdmin削除との実競合はDB試験で区別し、勝手にFKを変更しない。
**変更しない**：既存受付・通知Repository、schema/migration、クラブデータ、管理者の登録・削除機能。
**完了条件・試験**：全status遷移、同status、メモ空/null・上限、担当者本人、
inactive・競合・削除済み・DB例外、更新列の限定。新規mutation Repository試験。

### 粒度7：一覧・更新Application Service

**目的**：認可contextと許可入力を分け、固定結果へ整える。

**調査開始ファイル**

- `src/application/club/support/create-support-report.ts`、`src/application/club/support/create-support-report.test.ts`：固定結果、保存後失敗とログの扱い。
- `app/(club-app)/platform/require-platform-admin.ts`：context型。
- `src/infrastructure/logging/sanitize-log-context.ts`、`src/infrastructure/logging/sanitize-log-context.test.ts`：許可ログ項目。

**先行後に確認**：1の契約、5・6のRepositoryと全試験。
**既存変更**：なし。
**新規案**：

- `src/application/platform/support/get-platform-support.ts`
- `src/application/platform/support/get-platform-support.test.ts`
- `src/application/platform/support/update-platform-support.ts`
- `src/application/platform/support/update-platform-support.test.ts`

提案 `getPlatformSupport`、`updatePlatformSupportStatus`、`updatePlatformSupportNote`。

**内容**：actor IDはcontextから構築。入力を再検証し、余分な管理列を渡さない。
一覧失敗では部分DTOを返さず、更新は固定結果・必要最小のversion等だけを公開する。
F08受付成功・通知結果を変更せず、メール送信も呼ばない。
ログは固定分類・検証済みrequestId等だけ。例外原文をsanitizeへ渡す必要もない。

**必要時だけ確認**：結果型が実Repositoryと食い違う場合だけ該当型・呼出し元を追う。
**変更しない**：既存Service、共通logger、Repository契約外の修正、Action、画面。
**完了条件・試験**：context優先、余分な入力/結果除去、部分開示なし、各固定結果、秘密値入り例外。
新規Service2testと既存 `src/infrastructure/logging/sanitize-log-context.test.ts`。

### 粒度8：管理操作Server Action

**目的**：直接呼出しでも再認可し、管理操作を固定パスの再検証へ接続する。

**調査開始ファイル**

- `app/(club-app)/platform/require-platform-admin.ts`：毎回の認可。
- `app/(club-app)/club/[clubSlug]/account/support-actions.ts`、`tests/support-report-actions.test.ts`：前state・FormData・固定エラーの例。
- `domain/shared/action-state.ts`、`domain/shared/request-id.ts`：独立state、識別子の検証。
- `app/(club-app)/club/[clubSlug]/account/actions.ts`、`tests/club-account-actions.test.ts`：
  Next制御例外と保存後再検証失敗の既存例。

**先行後に確認**：1のparse/結果、7の更新Serviceと試験。
**既存変更**：なし。
**新規案**：`app/(club-app)/platform/support/actions.ts`、`tests/platform-support-actions.test.ts`。
提案 `updateSupportReportStatusAction`・`updateSupportReportNoteAction`。

**内容**：requirePlatformAdminをAction内でも実行。bindしたreportIdと単一hidden値を照合し、
requestId・expectedUpdatedAt・statusまたはnoteだけをparseする。
handledBy・日時・通知列・clubId・任意returnToを信用しない。
更新後だけ `revalidatePath("/platform/support")`。Next制御例外は再送出する。
DB保存済みで再検証が一般例外となってもUPDATE_FAILEDに戻さず、保存済み・再読込案内を返す。
ページ全体のredirectで他行の未保存メモを消さない。

**必要時だけ確認**：NextのrevalidatePath・unstable_rethrowのローカルdocs/型。
**変更しない**：共通再検証、club Actions、F08、next.config、任意パス再検証。
**完了条件・試験**：一般会員・inactive・未ログインの直呼び拒否、ID/日時/前state改ざん、
限定入力、更新後だけ固定再検証、保存後例外、PW/本文/メモの非ログ。新規Action試験。

### 粒度9：Platform layout・一覧・絞り込み・全文

**目的**：専用layoutで50件ずつ安全に読み取り、F09の表示機能を提供する。

**調査開始ファイル**

- `app/layout.tsx`、`app/(club-app)/club/[clubSlug]/layout.tsx`：RootLayoutとClubHeader/Footerの設置境界。
- `app/(club-app)/platform/require-platform-admin.ts`：layoutだけに依存しないPage認可。
- `app/(club-app)/club/[clubSlug]/admin/members/page.tsx`：Promise params/searchParams・要求時取得の既存例。
- `domain/shared/date-time/club-date-time.ts`、`domain/shared/date-time/club-date-time.test.ts`：formatClubDateTimeと明示timezone。
- `tests/club-account-pages.test.ts`：Page/Client propsの境界をnodeで確認する方法。

**先行後に確認**：4のlogout Component、7の読取Service、1のquery契約。
**既存変更**：なし。
**新規案**：

- `app/(club-app)/platform/layout.tsx`
- `app/(club-app)/platform/support/page.tsx`
- `app/(club-app)/platform/support/SupportReportFilters.tsx`
- `app/(club-app)/platform/support/SupportReportTable.tsx`
- `tests/platform-support-pages.test.ts`


**内容**：管理見出し・supportリンク・専用logoutだけ。ClubHeader/Footerをimportしない。
Page自身で認可し、await searchParams→query検証→Service。認可データを共有cacheへ載せない。
GETフォームのclub/status/categoryフィルター変更ではpageを1へ戻し、ページ送りは条件を維持する。
テーブル＋横スクロール、createdAt最新順、snapshot、担当者、通知状態・管理日時を表示。
本文・内部メモ・UA・URLはReactのテキストで表示。dangerouslySetInnerHTMLは使わない。
全文はnative details等で開閉し、保存済みpageUrlを無条件hrefへしない。
認可エラー・空一覧・取得失敗を区別し、内部エラー/部分DTOを表示しない。
この粒度ではstatusとメモを読取専用にし、10で更新UIへ接続する。

**必要時だけ確認**：Nextのlayout/searchParams/キャッシュ仕様やSSR型の該当箇所。
**変更しない**：root/club/public layout、マイページ導線、F08フォーム、共通Footer。
**完了条件・試験**：両role、無所属、一般会員/inactive、50件・filter・page、XSS文字列、
null担当者・snapshot、Footerなし、logout接続、部分非開示。新規Page試験と既存リンク試験。

### 粒度10：status即時変更と内部メモフォーム

**目的**：更新機能を接続し、競合・pending・未保存メモの扱いを完成する。

**調査開始ファイル**

- `app/(club-app)/club/[clubSlug]/account/AccountNameForm.tsx`、`app/(club-app)/club/[clubSlug]/account/AccountConfirmDialog.tsx`：独立state・二重送信抑止の参考。
- `app/(club-app)/club/admin/_components/FieldErrorList.tsx`、`app/(club-app)/club/admin/_components/FormErrorAlert.tsx`：項目/全体エラー。
- `app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard.ts`：dirtyなメモの移動確認。
- `components/admin/ToastMessage.tsx`：固定通知とkey。
- `tests/club-account-forms.test.ts`：hook境界と実DOM試験の限界。

**先行後に確認**：8のAction、9のPage/Tableとprops契約。現時点では存在しないため実装後に読む。
**既存変更**：現在存在する既存ファイルはなし。
9で新規作成した以下の2ファイルを、その適用後に変更する。

- `app/(club-app)/platform/support/page.tsx`
- `app/(club-app)/platform/support/SupportReportTable.tsx`

**新規案**：`app/(club-app)/platform/support/SupportReportOperations.tsx`、
`tests/platform-support-forms.test.ts`。

**内容**：行単位のstatus選択とメモ保存を別Actionへbindする。
status変更はonChangeから送信し、pending中は同じ行で二重操作しない。メモは保存ボタン。
独立useId/requestId、限定hidden、固定エラー/トースト、競合時の再読取案内を付ける。
行のkeyはreportIdで安定させ、updatedAtやstatusをkeyにして未保存メモを消さない。
status更新成功時のversionを同じ行で共有するが、他者の更新を受けた際にdirtyなメモの基準versionを
無条件に差し替えない。CONFLICT時はdraftを維持し、再読取・再編集を選べるようにする。
再検証で行が移動/消えるフィルター条件、ページ移動、他行操作によるメモ消失も受入対象にする。

**必要時だけ確認**：hookの挙動に差が出た場合だけ該当定義と参照元を確認。
共通hook変更が必要なら別途影響と計画変更を報告する。
**変更しない**：F07/F08フォーム、共通hook/Toast、認可、Repository、通知。
**完了条件・試験**：即時送信、pending、error時status表示整合、メモ保持、日時/担当者反映、
競合、同status、再検証失敗、他行・filter・ページ移動。node試験と12のブラウザー確認を分ける。

### 粒度11：ガード付き実DB統合と専用コマンド

**目的**：Platformの横断例外と権限失効、管理列・競合・F08共存を実DBで照合する。

**調査開始ファイル**

- `tests/support-report.flow.integration.test.ts`：enabled/localConfiguration/safeCheck・専用client注入・UUID cleanup。
- `src/infrastructure/prisma/client.ts`：dotenv初期化を避ける境界。
- `prisma/schema.prisma`、`prisma/migrations/20260816221153_add_club_app_schema/migration.sql`：
  PlatformAdmin独立、担当者FKと既存管理列。
- `package.json`、`vitest.config.mts`：専用script・通常試験skip。
- `tests/club-membership-authorization.test.ts`、`tests/club-account-navigation.test.ts`：越権しない回帰。

**先行後に確認**：2〜10の実装と関連全試験。
**既存変更**：`package.json` に専用scriptを1個追加。既存script/lock/依存は変更しない。
**新規案**：`tests/platform-support.flow.integration.test.ts`。
script案 `test:platform-support:local`、flag案 `RUN_PLATFORM_SUPPORT_TESTS=1` と
`RUN_DB_INTEGRATION_TESTS=1`、使い捨て確認 `PLATFORM_SUPPORT_DISPOSABLE=1`。

**内容**：非production、使い捨てloopback DB、接続先query/fragment禁止の全条件後に専用clientを作る。
通常試験はガードだけを実行して実DBをskip。Auth・Next・実配送はmockする。
DEVELOPER/SUPPORT・無所属・AppUserなし、inactive・一般会員、A/B/全プラン報告の読取、
filter/50件、最新権限での更新、status日時・メモ・担当者、同status再送、同時更新のCONFLICT、
通知保存と管理更新の競合、F08の本文/snapshot/通知列を維持することを確認する。
PlatformAdmin削除後の担当者SetNullと、クラブOWNER昇格が起きないことを別ケースで確認。
fixtureは作成前にUUIDを登録し限定cleanup。migration・実Auth登録・実メールは行わない。

**必要時だけ確認**：実DB制約が差異を示した場合だけ対象migration/SQLを調査して報告する。
**変更しない**：DB/schema/migration、共有client・vitest設定、既存test:db、実環境設定。
**完了条件・試験**：ガード単体、各F09単体、既存F08/クラブ認可回帰。
許可条件が揃った時だけ実DB。未実行・skipを実DB成功として報告しない。

### 粒度12：運用手順と統合受入

**目的**：Platformの権限例外と、認証・更新・再検証・受入の限界を運用資料へ残す。

**調査開始ファイル**

- `docs/implementation/phases/F09.md`：10項目・受入条件。
- `docs/runbooks/support-report.md`：DB正本・通知の限界と受入記録の既存方式。
- `docs/runbooks/club-account.md`：実DB・ブラウザー・HTTPを分ける方式。
- `next.config.ts`：bodySizeLimit等を変更せず確認。
- `package.json`、`tests/support-report.flow.integration.test.ts`：コマンドと安全条件の既存例。

**先行後に確認**：F09全実装と単体・ガード・DB試験の結果。
**既存変更**：なし。
**新規案**：`docs/runbooks/platform-support.md`。

**内容**：PlatformAdminの作成/無効化は既存の承認済み運用に委ねる。公開登録画面を作らない。
無所属ログイン、inactive、一般会員、二つのrole、クラブ越権不可、一覧・全文・filter/ページ、
status往復、メモだけの更新、複数担当者競合、未保存入力、logout、認可失効後の送信を確認する。
HTTP foreign Originと関数直接試験を分離。Cookie・Action ID・PW・本文・メモを証跡へ載せない。
一度保存した後の再検証失敗を再保存依頼へ変換しない。
通常単体/mock・実DB・実Auth・ブラウザー・HTTPを分け、pass/fail/skipと理由を記録する。

**必要時だけ確認**：環境運用やログ連携に疑問が出た場合だけ該当設定・コードを確認。実値は取得しない。
**変更しない**：実装本体、既存runbook、本番設定、管理者登録や権限変更の自動化、他フェーズ。
**完了条件・試験**：全F09単体/ガード、F08回帰、クラブ認可・招待再開・matcher回帰。
実環境試験は条件を満たす場合だけ実施し、未確認のままF09受入完了としない。

## 7. DB・Prisma変更

追加・変更は不要。根拠はschemaのSupportReportとPlatformAdmin、および既存初期migration。

- SupportReport.status/internalNote/handledByPlatformAdminId/statusChangedAt/resolvedAt/updatedAtを利用。
- PlatformAdmin.idはAuth user.idと同値。ClubMembership・AppUserの作成を自動付与しない。
- 担当者FKは初期migrationでON DELETE SET NULL。担当者削除後も報告本体は残る。
- 既存indexはclubId/status/createdAt等に存在。最初から新indexを追加せず、必要なら実測根拠を報告。
- F08の通知保存でもupdatedAtが変わる。競合時は再読取と明示再編集を基本にし、
  メモやstatusを古い画面の内容で無条件再送しない。
- 実DBのmigration適用・RLS・権限・実行計画は未確認。schemaの確認を実DB確認と混同しない。

## 8. ユーザー操作からDBまでの予定フロー

| 操作 | ファイル・関数、値と結果 | DB変更 |
| --- | --- | --- |
| 専用ログイン | platform-login/page → PlatformLoginForm → actions/platformLoginAction。単一email/PW/requestIdを検証、signInWithPassword後にPlatformAdminを照合 | 共通LoginSubmissionLogへハッシュ化した試行記録。Authの本人セッションのみ |
| Page表示 | platform/layout・support/page → requirePlatformAdmin。getUserからPlatformAdminAccessContext | 権限読取のみ。クラブ所属を作らない |
| 一覧 | query parse → getPlatformSupport(context, query) → findSupportReportsForPlatform。本人active管理者を再確認し、50件DTO・件数・候補を返す | SupportReport/Club/担当者の必要列だけ読取 |
| 全文 | SupportReportTableがReactテキストとdetailsで表示 | なし。既読等を追加しない |
| status | SupportReportOperations → updateSupportReportStatusAction → updatePlatformSupportStatus → updateSupportReportStatusForPlatform | 管理列だけ、実status遷移の日時を更新。version競合なら非更新 |
| メモ | 同UIの別フォーム → updateSupportReportNoteAction → updatePlatformSupportNote → updateSupportReportNoteForPlatform | internalNote・対応者だけ。status日時を維持 |
| 完了 | Actionから固定結果・version等を返し、固定supportパスを再検証。行のdraft/stateは安全に維持 | 再保存なし |
| logout | PlatformLogoutButton → platformLogoutAction → local signOut、固定platform-loginへ | 現在のAuthセッション終了。PlatformAdmin/ClubMembershipは不変 |

これらの新規名・接続は計画であり、現在動作するとの主張ではない。
特にPage・ActionができてもRepositoryの最新権限確認を省略しない。

## 9. 危険箇所と確認方法

| 危険箇所 | 対策・根拠と確認 |
| --- | --- |
| 横断データの漏洩 | proposals2.mdの例外はSupportReportだけ。Platform Repositoryのactor照合・限定DTO・inactive拒否を単体/実DBで検証 |
| PlatformからOWNERへ昇格 | requireActiveClubMembership・requireClubOwnerは維持。Platformだけの本人がクラブ管理を使えない回帰 |
| layoutだけの認可 | Nextローカルauthentication.mdのpartial rendering注意に従いPage・Action・Repositoryでも確認 |
| Cookie更新漏れ | proxy.matcherにPlatform経路だけ追加。updateSessionは認可を代行しない |
| ログイン経路の混線 | 新URLと固定遷移。既存club-login・招待・HP/adminログインは変更しない |
| 権限失効の競合 | 最新PlatformAdminのisActive/roleをtransaction内でも照合。表示時contextを信用し続けない |
| メモ上書き | updatedAt条件付き更新、CONFLICT、draft保持。通知保存によるversion変化も明記 |
| 日時・対応者の改ざん | フォームから日時/担当者を採用せず、Repositoryが認可contextとサーバーnowから構築 |
| XSS・危険リンク | 本文/メモ/URL/UAをReactテキストで表示。生HTML・無条件hrefなし |
| 過大取得 | 50件・限定select・安定sort・query検証。無効filterを全件扱いしない |
| 保存後の再検証障害 | 保存済み成功を保持し、固定案内。再保存・任意redirectなし |
| PIIログ | sanitizeLogContextへ固定値だけ。既存HP loginのraw errorログをコピーしない |
| 未保存入力の消失 | reportIdの安定key、statusとnoteの分離、他行/ページ/フィルター変更をブラウザー確認 |

## 10. 設計書との差・未確認事項・F09外の依存

### 矛盾・差と処理方針

- 全体設計はclub-login＋returnTo案、F09.mdは専用platform-login推奨。
  現行club-loginは招待と所属遷移に結合しているためF09の専用案を採用する。
- 既存requirePlatformAdminのredirectは未提供 `/platform-admin/login`。
  粒度2で修正し、粒度4で実在するログイン画面を提供する。
- 全体設計のstatus更新は毎回nowだが、回答により実status変更時だけとする。
  メモ更新は対応者更新、状態日時は維持。粒度1でF09.mdへ補足する。
- 背景説明には「開発者のみ」ともあるが、F09と詳細設計はDEVELOPER/SUPPORT。
  両roleを対象とし、ClubMemberRoleとは分離する。
- 背景の全件取得をそのまま実装せず、回答により50件ページ送りへする。
- 全体設計の `lib/repositories/platform-support-report.ts` は未存在。
  現在の `src/infrastructure/prisma/repositories/` 規約に合わせて新規提案する。

### 未確認・追加確認

- 内部メモ5000文字・空null、JST表示は本計画の提案。粒度1で仕様化してから実装する。
- 実DBの制約適用、RLS、実Auth設定、PlatformAdminの実登録・責任者、ログイン制限用salt実設定は未確認。
  .env、秘密値、実ログは調査していない。
- 共通LoginSubmissionLogの試行数共有は既存関数利用の影響。分離が必要なら別途理由と最小変更案を報告する。
- 現行PlatformAdmin helper専用テスト、一覧・更新コードは存在しないため、既存の動作確認済みとは扱わない。
- 競合や失効と同時更新の厳密なSQL順序、実HTTP Origin保護、Cookie更新、ブラウザー入力保持は未実証。
- 既存ログイン等の回帰試験は読取確認のみ。この計画作成では試験実行・DB接続・実Auth操作を行っていない。

### F09外の依存

- Supabase Authのアカウント準備・復旧・PW再設定、メール設定、PlatformAdmin登録運用は既存または別途承認事項。
  F09で公開管理者登録・権限付与APIやクラブOWNER自動作成を追加しない。
- F08受付・snapshot・通知、F07マイページリンク、既存クラブ認可・プラン規則を前提にする。
- PlatformAdmin管理画面・監査履歴専用モデル・メール返信機能・通知復旧worker・他クラブデータ編集は対象外。
- 法的文面や規約URL、クラブイベント・お知らせ・LINE設定など他フェーズの未提供はF09へ混入させない。

## 11. patchごとの検証と自己確認

- 各粒度の対象test、対象TypeScript・ESLint、git diff --checkを一時環境で確認する。
  純粋入力・node mock・ガード成功を、実DB・実Auth・HTTP・ブラウザー成功に読み替えない。
- 先行新規ファイルを変更する粒度では、適用後の実ファイルと参照元・試験を確認する。
- 実装予定の既存変更先はF09.md、require-platform-admin.ts、proxy.ts、package.jsonで、いずれも実物を確認した。
  9で新規作成するPage/Tableは10適用前に追加確認する条件を明記した。
- F09以外の実装は計画していない。F08受付・クラブ認可・既存リンク・既存DB列を重複実装しない。
- 定義元、現在の呼出し元、関連テスト・設定を確認した。未提供のPlatform呼出し元は新規案と明記した。
- 未確認の実環境、未存在の関数、提案値を既成事実で埋めていない。
- 本計画のソース変更はなし。F09全体の完了は12の未実施受入がなくなるまで宣言しない。
