<!-- docs/implementation/phases/F08-granular-plan.md -->

# F08実装粒度計画

## 1. 基準・確定事項

- 基準ブランチ：`feat/club-app-foundation`。
- 基準コミット：`252700691c9d20229a06d634c779e6d795776834`。
- 調査開始時の `git status --short` は空。既存の本ファイルは0行だった。
- 作業中に `docs/data-model2.md` へ将来の直前ページURL対応の外部追記が加わった。
  この差分は編集せず保持した。メモの「現在」という記述を送信機能の実装済み根拠には使わない。
- この作業では本計画書だけを作成する。ソース・schema・migration・依存関係・feature.patchは変更しない。
- AGENTS.mdを最優先とし、CLAUDE.mdはAGENTS.md参照のみであることを確認した。
- 実装対象は不具合・サポート報告の送信まで。Platform側の一覧・対応操作は含めない。

### 今回のユーザー回答

1. 「全ACTIVE会員」は、現行のアプリ利用可能プラン内のOWNER・COACH・OFFICER・MEMBER全員。
   現在はSTANDARDが対象。STARTER・PROへ利用範囲を広げない。
2. pageUrlは送信時のマイページURLとする。直前ページの履歴管理は追加しない。
   query・fragmentは保存せず、許可したページパスだけを保存する。

根拠：`F08.md` の対象・認可要件と今回の回答。
現在の境界は `club-membership-authorization.ts / requireActiveClubMembership`、
`club-app-authorization.ts / requireClubAppAccess`、
`domain/club/plan-features.ts / PLAN_FEATURES`、`[clubSlug]/layout.tsx / ClubAppLayout`。
これらのパスの基点は `app/(club-app)/club/`。

### この計画で採用する実装方針

以下は現在の実装が存在するという意味ではなく、F08向けの設計判断。

- categoryは既存enumのBUG・QUESTION・REQUEST・OTHER。新規報告statusはOPENで固定する。
- messageはtrim後に空欄を拒否し、2000文字以内。既存フォームと同じJavaScriptのlengthで判定する。
- reporterName・reporterEmailはDBのAppUser、reporterRoleはDBの最新Membershipから保存時に取得する。
  Auth由来userIdで本人を照合するが、AuthとAppUserのemailを無断で同期しない。
  DBのname・emailがnullならsnapshotもnullを許可する。
- pageUrlは絶対URLでなく、認可済みslugから導出した現在accountのcanonicalな相対パスを保存する。
  クライアントのpageUrl・Referer・Host等から保存先URLを採用しない。
  allowlistは当該 `/club/{encodedSlug}/account` のみ。query・fragmentを引き継がない。
- userAgentはActionで `await headers()` から取得する。制御文字除去・trim後に最大512文字、空ならnull。
  「サーバーで取得」は本人性の証明ではない。HTTPヘッダー自体は偽装できる。
- 通知先は既存のシステム共通 `ADMIN_EMAIL` を使う案とする。運用上の宛先実値は未確認。
  クラブOWNERや入力emailをtoへ使わず、HP用通知設定へSUPPORTを追加しない。
- DB保存が受付成立。通知の設定不足、失敗、結果不明、通知結果のDB更新失敗でも受付成功を維持する。
- 同じrequestIdをSupportReport.idへ使用して同一送信の重複保存を防ぐ。新しいDB列は増やさない。
- 成功はActionStateで返す。報告フォームの内側だけを新requestIdのkeyでresetし、固定トーストを出す。
  他の氏名・Childフォームの未保存入力を巻き込むページ全体のredirectは採用しない。

## 2. 現在の実装状況

| 区分 | 確認結果・根拠 |
| --- | --- |
| 実装済み | `prisma/schema.prisma / SupportReport` に本文、metadata、snapshot、通知結果、対応用フィールドがある |
| 実装済み | `SupportReportCategory` は4種、`SupportReportStatus` はOPEN・IN_PROGRESS・ON_HOLD・RESOLVED |
| 実装済み | `types/prisma.ts` はSupportReport・関連enumの型を再exportしている |
| 実装済み | `requireActiveClubMembership` はAuth user.id・slug・ACTIVEをDBで照合する |
| 実装済み | `requireClubAppAccess` は上記認可にCLUB_APPのプラン制限を加える |
| 実装済み | `lib/mail/resend.ts` は共通resend、adminEmail、buildMailFromを提供する |
| 実装済み | `sanitizeLogContext`、ActionState・requestId、フォームエラー表示、確認ダイアログ、トーストがある |
| 一部実装 | `account/page.tsx / ClubAccountPage` は本人情報・複数Child・権限別導線を持つが、報告フォームはない |
| 一部実装 | `tests/club-id-integrity.integration.test.ts` にSupportReportの別クラブ参照拒否・Membership削除時SetNullの試験がある。報告送信フローはない |
| 未実装 | SupportReport用Domain入力・metadata・結果契約、受付Repository、Application Service、通知adapter |
| 未実装 | createSupportReportAction、SupportReportForm、報告の成功reset・トースト、専用の受入試験・手順書 |
| 未確認 | 実DBのmigration適用、実メール配送、実運用設定、ブラウザー動作。今回は試験を実行していない |

`rg` でSupportReport・notifyError・reporter情報の定義と参照をプロジェクト全体から検索した。
報告送信の実装は見つからず、上記のDB・型・既存テスト以外の送信経路は確認できなかった。
既存機能の再実装を計画に入れない。

## 3. 調査した主要ファイル・確認したシンボル

パスはリポジトリルート基準。表は調査したファイルであり、変更対象一覧ではない。

| ファイル | 確認した関数・型・設定とF08との関係 |
| --- | --- |
| `AGENTS.md`、`CLAUDE.md` | 作業範囲、認可、ログ、patch作成、コード規則 |
| `docs/implementation/phases/F08.md` | F08の10項目・受入条件 |
| `docs/proposals2.md` | SupportReportモデル、保存方針、共通Resend、6-4/6-5の送信フロー、マイページの入力と文言 |
| `prisma/schema.prisma` | SupportReport、ClubMembership、AppUser、SupportReportCategory・Status、FormType |
| `types/prisma.ts` | SupportReportと関連enumの型export |
| `prisma/migrations/20260816221153_add_club_app_schema/migration.sql` | SupportReportの既存列、FK、index |
| `prisma/migrations/20260926084449_f01_enforce_club_scope_integrity/migration.sql` | SupportReport_membership_club_match、SupportReport_club_id_immutable |
| `prisma/migrations/20260927011826_f01_fix_same_club_set_null_trigger/migration.sql` | enforce_same_club_referenceのNULL許可、参照先照合 |
| `prisma/migrations/20260816223753_enable_rls_for_club_app/migration.sql` | SupportReportのRLS有効化。アプリ側認可の代わりとはしない |
| `app/(club-app)/club/club-membership-authorization.ts` | requireActiveClubMembership、ClubAccessContext、requireClubOwner |
| `app/(club-app)/club/club-app-authorization.ts` | requireClubAppAccessとプラン確認の順序 |
| `domain/club/plan-features.ts` | PLAN_FEATURES、hasClubFeature、requireClubFeature |
| `app/(club-app)/club/[clubSlug]/layout.tsx` | ClubAppLayoutの認可と利用可能プラン制限 |
| `app/(club-app)/club/[clubSlug]/account/page.tsx` | ClubAccountPage、独立state、既存toast、フォーム追加位置 |
| `app/(club-app)/club/[clubSlug]/account/AccountNameForm.tsx` | 確認、fieldset、useId、エラー表示、dirty guardの既存利用例 |
| `app/(club-app)/club/[clubSlug]/account/AccountConfirmDialog.tsx` | useConfirmedAccountForm、AccountConfirmDialog、FormData保持、pending、focus復帰 |
| `app/(club-app)/club/admin/_components/FieldErrorList.tsx` | FieldErrorListによる項目エラーの表示 |
| `app/(club-app)/club/admin/_components/FormErrorAlert.tsx` | FormErrorAlertによる固定文言のフォームエラー |
| `app/(club-app)/club/admin/_hooks/useScrollToFormError.ts` | useScrollToFormErrorのtextarea・select対応 |
| `app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard.ts` | useUnsavedChangesGuard、markDirty・markSubmitting |
| `components/admin/ToastMessage.tsx` | ToastMessage、再マウントkey、URLを書き換えない方針 |
| `domain/shared/action-state.ts`、`domain/shared/request-id.ts` | ActionState、createInitialActionState、createRequestId、isRequestId |
| `src/infrastructure/prisma/repositories/club-account-repository.ts` | ClubAccountReadScope、findClubAccountForUser、updateAccountNameForUserの本人照合・transactionの参考 |
| `src/infrastructure/prisma/client.ts` | 共有prisma、トップレベルdotenv/config、log: [] |
| `lib/mail/resend.ts` | resend、adminEmail、mailFromAddress、buildMailFrom、読込時の本番設定検査 |
| `lib/mail/club-invitation-mail.ts` | buildClubInvitationEmail、sendClubInvitationEmail、固定結果・idempotencyKey・SDK結果判定 |
| `lib/mail/club-invitation-mail.test.ts` | SDK・共通Resendのmock、本文・秘密値非出力の検証例 |
| `lib/mail/notification-recipients.ts` | getNotificationRecipientsはHPのFormType用。SupportReport用途へ転用しない |
| `lib/mail/contact-mail.ts` | sendAdminContactNotificationはHP用途。F08から変更・流用しない |
| `src/application/club/invitation/send-club-invitation.ts` | inviteClubMember等の共通メール利用、通知結果を分ける既存例。F08の依存にはしない |
| `src/infrastructure/logging/sanitize-log-context.ts` | sanitizeLogContext、SanitizedLogContext、許可項目 |
| `src/infrastructure/logging/sanitize-log-context.test.ts` | 個人情報・秘密情報・例外causeを除外する既存試験 |
| `app/(club-app)/club-login/reset-password/actions.ts` | logResetPasswordErrorでの既存の安全なログ呼出し例 |
| `lib/security/request.ts` | getRequestMetaはawait headers使用、UAの長さ制限はない。F08では必要なUAだけを直接取得する案 |
| `lib/security/rate-limit.ts` | checkFormRateLimitはHPのFormType・メール・IP用。F08へそのまま接続しない |
| `scripts/validate-env.mjs` | envSchema、ADMIN_EMAILは任意、本番Resend設定は必須、loadEnvConfigの副作用。実行していない |
| `tests/club-membership-authorization.test.ts` | 最新ACTIVE照合・失効・OWNER制限の既存試験 |
| `tests/club-account-pages.test.ts` | Pageの認可、本人DTO、失敗時非開示、Client propsのmock境界 |
| `tests/club-account-forms.test.ts` | hook境界を模したnode試験。DOMの保証と混同しない |
| `tests/club-id-integrity.integration.test.ts` | SupportReportのクラブ不一致拒否とSetNull。共有clientのトップレベルimportあり |
| `tests/club-account.flow.integration.test.ts` | enabled、localConfiguration、safeCheck、専用client注入、UUID限定cleanupの参考 |
| `package.json`、`package-lock.json`、`vitest.config.mts` | 依存の版、テストscript、node環境、server-only alias |
| `next.config.ts` | Server ActionのbodySizeLimitは12mb。F08で共通設定を変更しない |

### バージョンとNext.js

package.json・lockと必要なインストール済みpackage metadataを確認した。
Next 16.2.6、React/ReactDOM 19.2.4、Vitest 4.1.10、TypeScript 5.9.3、Resend 6.12.4、
Prisma/adapter-pg 7.8.0、Supabase SSR 0.10.3、Zod 4.4.3。

必要箇所だけ以下を確認した。SDK仕様は既存型で判断でき、外部公式サイトの確認は不要だった。

- `node_modules/next/dist/docs/01-app/02-guides/forms.md`：bind、useActionState、prevState、pending。
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md`：非同期headers、await必須。
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md`：制御例外の再throw。
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`：OriginとHostの照合。
- `node_modules/resend/dist/index.d.mts`：CreateEmailResponse、data.id・error、IdempotentRequest、sendの型。

API・Componentを変更する粒度5・6では、patch作成時にもインストール版と関係するローカルdocsを確認する。
型確認のための対象ファイル以外のnode_modules、生成済みPrisma Client本文、.envは読んでいない。

## 4. 共通の実装境界

- 以下の新規ファイル名・新規関数名・結果名は実装案。現在存在する定義と混同しない。
- 既存ファイルの変更予定は各粒度の専用欄へ記載する。調査開始ファイルは変更指示ではない。
- 「変更しない」は読み取り禁止ではない。互換性・認可確認のための追加読み取りは必要時に限ってよい。
- 対象外の変更が必要なら、実装を拡張せず根拠・影響・計画変更案を報告する。
- 先行粒度で作るファイルは、現在の調査開始ファイルとは分ける。適用後は実体を確認してから参照する。
- 共通型・共通Resend・既存認可・モーダル・F07フォームを作り直さない。
- 元のソース・index・依存関係を変更せず、一時環境のGit diffから各patchを作る。
  新規ファイルを含め、元のワークツリーでgit apply --check・--statを確認する。
- 通常テストは実DB・実Resendへ接続しない。dotenvを初期化するモジュールはテストで適切に置換する。
- パッケージ追加・更新、schema・migration・実DB変更、実メール送信は実装patch作成に含めない。

## 5. 粒度一覧と依存関係

| 粒度 | 目的 | 依存 |
| --- | --- | --- |
| 1 | 仕様補足・入力・metadata・結果契約 | 今回の確定回答と既存型 |
| 2 | 本人・クラブを再照合する受付Repositoryと通知結果保存 | 1 |
| 3 | 共通Resendを使う運営者通知adapter | 1 |
| 4 | DBを正本とする受付Application Service | 1・2・3 |
| 5 | 全ロール向けServer Action | 1・4 |
| 6 | マイページの確認付き報告フォーム・成功reset | 1・5 |
| 7 | ガード付きDB統合試験・専用コマンド | 2〜5。UIとの接続確認は6適用後 |
| 8 | 運用手順・統合受入の結果整理 | 1〜7 |

2と3は同じ契約の確定後に独立して作成できる。patchの適用順は1→2→3→4→5→6→7→8を基本とする。
1〜5の段階では画面から未接続であることを、各patchの完了報告へ明記する。

## 6. 各粒度の計画

### 粒度1：仕様補足・入力・metadata・結果契約

**目的**：クライアント入力とサーバー取得値を分離し、後続の層で共有する最小限の契約を決める。

**調査開始ファイル**

| 既存ファイル | 確認対象・理由 |
| --- | --- |
| `docs/implementation/phases/F08.md` | 10項目と受入条件。今回の回答と成功reset方針を補足 |
| `prisma/schema.prisma`、`types/prisma.ts` | SupportReportCategory・Status、nullable列、既存型に合わせる |
| `domain/shared/action-state.ts`、`domain/shared/request-id.ts` | ActionState、初期state、UUID v4。共通関数を再利用 |
| `domain/club/plan-features.ts` | 利用可能プランとDB側再照合で使う純粋関数 |
| `domain/club/account/account-form.ts`、`domain/club/account/account-form.test.ts` | 許可項目だけのparse・表示用values、境界試験の既存例 |
| `domain/shared/action-state.test.ts`、`domain/shared/request-id.test.ts` | 共通契約の回帰 |
| `vitest.config.mts`、`package.json` | node試験と既存コマンド |

**変更予定の既存ファイル**：`docs/implementation/phases/F08.md` の仕様補足だけ。
現在の目標を縮小せず、ユーザー回答、相対パス保存、成功時の局所resetを明文化する。

**新規ファイル案**

- `domain/club/support/support-report-form.ts`
- `domain/club/support/support-report-form.test.ts`
- `domain/club/support/support-report-metadata.ts`
- `domain/club/support/support-report-metadata.test.ts`
- `domain/club/support/support-report-types.ts`

**内容**

- 提案内の `buildSupportReportFormValues`、`parseSupportReportFormData`、
  `validateSupportReportInput`、`sanitizeSupportPageUrl` を新規実装する案。
- category・messageを各1個の文字列として厳密に確認。欠損・File・重複・不正categoryを拒否する。
  表示用valuesを制限しても、検証対象の2001文字以上を切り詰めて成功させない。
- 初期categoryはBUG、messageは空。ActionStateのvaluesはこの2項目だけ。
- pageUrlは認可後に構築する現在accountパスをallowlistで確認する。query・fragmentは保存しない。
  生URL、別クラブ、認証・招待パス、外部URL、資格情報付きURLを通さない。
- UA最大512文字、空・欠損はnull。制御文字を除く。FormDataのUAは採用しない。
- 受付内部結果はCREATED・ALREADY_ACCEPTED・拒否・失敗等を区別し、公開成功はACCEPTED相当に統一。
  通知結果は固定コードに限定する。新規enumをDBへ追加しない。
- category・本文・metadataの純粋関数は認証・snapshot・DB一回限り保存を保証しない。

**必要時だけ確認**：文字数やUnicode処理の差が出る場合は既存Zod型・関連フォームの実装、
metadataのパス構築で疑問が出た場合は `account/page.tsx / ClubAccountPage` と認可のslug定義を追う。

**この粒度では変更しない**：DB、Repository、メール、Service、Action、Page、共通型・共通ヘルパー。

**完了条件・テスト**：空白・2000/2001文字・重複・File・全4category・URLの秘密query/fragment・
別クラブ・外部/招待/認証パス・UA上限を新規2試験で確認し、上記の共通型試験と型チェックを行う。
サーバーから導出するpageUrl方針も、FormDataに危険URLを追加したAction試験で後続確認する。

### 粒度2：受付Repository・snapshot・通知結果保存

**目的**：保存時の最新本人・クラブ・ACTIVE・プランを再照合し、DB受付とsnapshotを成立させる。

**調査開始ファイル**

| 既存ファイル | 確認対象・理由 |
| --- | --- |
| `prisma/schema.prisma`、`types/prisma.ts` | SupportReport・AppUser・ClubMembership、nullableと既存enum |
| `prisma/migrations/20260816221153_add_club_app_schema/migration.sql` | SupportReportのFKと主キー |
| `prisma/migrations/20260926084449_f01_enforce_club_scope_integrity/migration.sql` | 同一クラブtrigger・clubId変更禁止 |
| `prisma/migrations/20260927011826_f01_fix_same_club_set_null_trigger/migration.sql` | 退会等で参照が消えた場合のNULL許可 |
| `src/infrastructure/prisma/repositories/club-account-repository.ts` | 本人scope・最新Membership・transactionの既存例 |
| `src/infrastructure/prisma/client.ts` | 共有clientとdotenv副作用、DB例外の自動ログ非出力 |
| `domain/club/plan-features.ts` | hasClubFeatureで最新DBプランを再確認 |
| `tests/club-account-repository.test.ts`、`tests/club-id-integrity.integration.test.ts` | mockの再照合・rollback、実DBの既存SupportReport FK試験 |
| `vitest.config.mts` | DBなし試験の境界 |

**先行粒度適用後に確認**：粒度1の3実装ファイル・2テスト。現在存在する開始ファイルとは区別する。

**変更予定の既存ファイル**：なし。

**新規ファイル案**

- `src/infrastructure/prisma/repositories/support-report-repository.ts`
- `tests/support-report-repository.test.ts`

**内容**

- 新規案 `createSupportReportForMember` でclubId・actorMembershipId・userIdをすべて照合する。
  現在のACTIVEとCLUB_APP利用可能プランもDBから再確認する。特定roleへの制限は加えない。
- 同じtransactionでAppUser.name・emailとMembership.roleを読み、snapshotとしてINSERTする。
  message・category以外の任意入力やcontext内の古い氏名・roleをsnapshotへコピーしない。
- idは検証済みrequestId、statusはOPEN。管理用列・通知成功値をクライアントから設定しない。
- 既存主キーで重複保存を抑止する。同一IDの再送は本人・クラブ・元Membership・category・messageを
  照合し、同じ受付だけALREADY_ACCEPTEDとする。内容差・他人のIDは競合/拒否、既存snapshotは更新しない。
- 同時INSERTのunique違反も、限定した再読取で判定する。任意のDB例外を成功扱いしない。
- 新規案 `recordSupportReportNotification` はサーバーが受領したreportId・clubIdだけで対象を絞る。
  notifiedAt・固定notifyErrorだけを更新し、本文・snapshot・status・clubIdを変更しない。
- 通知結果保存は受付後の内部処理。親Membershipが削除されてNULLとなっても、再認可の代わりに
  サーバー由来受付IDとクラブで照合する。Actionの任意IDで呼ばせない。
- 純粋なDB transactionの競合だけを既存方針に沿って限定再試行する。メール送信はtransaction外。

**必要時だけ確認**：SQL競合やPrismaコードに差が出た場合に当該Prisma型・既存transaction試験、
FK差異が出た場合に既存migrationを確認する。生成済みClient全文は読まない。

**この粒度では変更しない**：schema・migration・共有client・既存Repository、メール・Service・Action・画面。

**完了条件・テスト**：4ロール、失効・別クラブ・別人・利用不可プラン、snapshotのnull・最新role、
再送/同時作成/内容差、通知保存の対象境界・許可列・0件更新・rollbackを新規Repository試験で確認する。
実FK・競合をmockで実証済みとはせず、実DBは粒度7へ分ける。

### 粒度3：共通Resendによる運営者通知

**目的**：受付後の通知を、固定結果を返す小さなメールadapterとして独立させる。

**調査開始ファイル**

| 既存ファイル | 確認対象・理由 |
| --- | --- |
| `lib/mail/resend.ts` | resend・adminEmail・buildMailFrom、読込時例外 |
| `lib/mail/club-invitation-mail.ts`、`lib/mail/club-invitation-mail.test.ts` | SDK結果・例外の安全化、idempotencyKey、mock方法 |
| `lib/mail/notification-recipients.ts`、`prisma/schema.prisma` | HP用FormTypeへSUPPORTを追加しない確認 |
| `scripts/validate-env.mjs` | ADMIN_EMAILが任意である現状、既存の本番設定要件。実行しない |
| `package.json`、`package-lock.json`、`vitest.config.mts` | SDK版・型の入口・メールなし試験 |

**先行粒度適用後に確認**：粒度1のSupportReport型・通知結果契約。

**変更予定の既存ファイル**：なし。

**新規ファイル案**

- `lib/mail/support-report-mail.ts`
- `lib/mail/support-report-mail.test.ts`

**内容**

- 提案の `sendSupportReportEmail` を新規実装する。入力は保存済み受付DTOだけ。
- 共通Resendモジュールを送信関数内で遅延取得し、初期化失敗も固定の通知失敗へ変換する。
  Serviceのimport時点でメール設定例外がDB受付を妨げる依存にしない。
- 宛先は検証したADMIN_EMAIL、FromはbuildMailFrom。未設定・不正宛先は固定の設定不備結果とする。
- 固定subjectとtext本文を基本とし、報告ID・クラブ・category・保存済み本文・snapshot・安全なmetadataを通知する。
  reporterEmailを使う場合も検証後のreplyToに限定し、null/不正なら省略する。
- HTMLを追加する必要がある場合だけescapeを確認する。入力をHTMLやヘッダーへ直結しない。
- `data.id` がありerrorがない場合だけSDK受付成功。notifiedAtは配送完了の証明ではない。
- 設定不足・明確な拒否・timeout等の結果不明を固定コードで返す。error.message・headers・causeは返さない。
- providerのidempotencyKeyは保存済みreport.idから構築する。自動再送・履歴基盤は作らない。

**必要時だけ確認**：SDKの型でsend結果やオプションが解決しない場合だけ
`node_modules/resend/dist/index.d.mts` の該当定義、なお不明な仕様だけ公式資料を確認する。

**この粒度では変更しない**：lib/mail/resend.ts、HPメール・通知設定、env schema、DB、Service、Action・画面。

**完了条件・テスト**：宛先/From、保存済みデータだけの本文、replyTo、未設定・初期化例外・API error・
不明結果・秘密値非出力・安定したidempotencyKeyを新規メール試験で確認。SDKは必ずmockする。

### 粒度4：DBを正本とするApplication Service

**目的**：DB保存、補助通知、通知結果保存を順序付け、保存後の例外で受付失敗へ戻さない。

**調査開始ファイル**

| 既存ファイル | 確認対象・理由 |
| --- | --- |
| `app/(club-app)/club/club-membership-authorization.ts` | ClubAccessContextの入力境界 |
| `src/application/club/account/update-club-account.ts`、`src/application/club/account/update-club-account.test.ts` | contextと許可入力の分離、固定結果の既存例 |
| `src/infrastructure/logging/sanitize-log-context.ts`、`src/infrastructure/logging/sanitize-log-context.test.ts` | ログの許可項目、errorCode、requestId |
| `domain/shared/request-id.ts` | ログ識別子と認証・認可を混同しない |
| `vitest.config.mts` | 外部通信なし試験 |

**先行粒度適用後に確認**：粒度1契約、粒度2Repositoryと試験、粒度3メールadapterと試験。

**変更予定の既存ファイル**：なし。

**新規ファイル案**

- `src/application/club/support/create-support-report.ts`
- `src/application/club/support/create-support-report.test.ts`

**内容**

- 提案の `createSupportReport` を新規実装。context、検証済みrequestId、許可入力、サーバーmetadataを受ける。
- Repositoryを呼ぶ前にも純粋な入力検証を行う。対象IDとsnapshotはRepositoryで最新照合する。
- DB失敗/拒否なら通知しない。CREATEDが確定してからメールを1回試行する。
- ALREADY_ACCEPTEDは成功へ統一し、通知を再送しない。重複受付を補助通知の再試行手段にしない。
- 通知成功はnotifiedAt・notifyError=null、失敗/不明は固定notifyErrorを保存する。
- メール例外も通知結果保存の例外も受付成功を維持する。結果保存不能時は安全なログを残す。
  DB自体が更新不能ならnotifyErrorの永続化は保証できないことを手順書へ明記する。
- ログは固定operation/result/errorCodeと、受付IDとしてのrequestId等の許可項目だけ。
  raw errorを渡さず、本文・氏名・email・URL・UA・SDKレスポンスをログに含めない。
- 公開結果へ保存済み報告DTOや内部通知状態を返さない。

**必要時だけ確認**：通知結果更新0件や競合で判断できない場合に粒度2の条件・試験を追う。
共通loggerの変更が必要かを推測せず、既存sanitizeLogContextだけで固定コードを記録する。

**この粒度では変更しない**：既存Service、ログ共通関数、Repositoryの契約外変更、Action・画面、再送worker。

**完了条件・テスト**：DB失敗で未通知、DB→通知→結果更新の順序、通知の例外/拒否/不明/設定不足、
結果保存失敗、重複受付で未通知、秘密値を含む例外でも安全なログ、すべての保存後経路の成功維持を確認する。

### 粒度5：全ロール向けServer Action

**目的**：直接呼出しも含めて、認可済みcontextとサーバーmetadataだけを受付Serviceへ渡す。

**調査開始ファイル**

| 既存ファイル | 確認対象・理由 |
| --- | --- |
| `app/(club-app)/club/club-membership-authorization.ts` | requireActiveClubMembershipと制御例外 |
| `domain/club/plan-features.ts`、`domain/club/plan-features.test.ts` | requireClubFeature。現在の利用可能プランを維持 |
| `app/(club-app)/club/[clubSlug]/account/actions.ts`、`tests/club-account-actions.test.ts` | requestId・prevState・限定FormData・固定エラーの既存例 |
| `domain/shared/action-state.ts`、`domain/shared/request-id.ts` | 成功/エラーstate、requestIdの更新 |
| `lib/security/request.ts` | await headersの既存例。IPや不要情報をF08へ取り込まない |
| `tests/club-membership-authorization.test.ts`、`vitest.config.mts` | 認可回帰とmock境界 |
| `package.json`、`package-lock.json` | Next版確認 |

**先行粒度適用後に確認**：粒度1のparse・metadata・state、粒度4のServiceと試験。

**変更予定の既存ファイル**：なし。既存account/actions.tsへF07操作と混在させない。

**新規ファイル案**

- `app/(club-app)/club/[clubSlug]/account/support-actions.ts`
- `tests/support-report-actions.test.ts`

**内容**

- 新規 `createSupportReportAction(clubSlug, previousState, formData)`。
- Action内でrequireActiveClubMembershipを実行し、requireClubFeature(context.club, "CLUB_APP")を確認する。
  OWNER限定の関数は使わない。認可・Next制御例外を固定フォームエラーへ握りつぶさない。
- 単一UUID v4のrequestIdとprevStateの一致を確認する。識別子は権限の根拠にしない。
- category・messageだけをparse。clubId、membershipId、reporterName/Email/Role、status、
  notifiedAt、notifyError、userAgent、pageUrl、任意returnToはFormDataから採用しない。
- 現在accountパスは認可済みslugから構築してallowlistでsanitizeする。query・fragmentをコピーしない。
- UAはawait headersから取り、512文字へ正規化する。欠損はnull。
- Service失敗は限定valuesと固定エラーを返す。受付成功は空の本文・BUG・新requestIdでsuccessを返す。
- 通知結果は公開しない。F08の報告一覧はないため新しいキャッシュ・共通revalidationは追加しない。
  page全体のredirectやrouter.refreshでF07の入力をresetしない。

**必要時だけ確認**：Nextの制御例外・APIの型が不明なら上記ローカルdocsの該当箇所。
HTTP Origin検査は関数直接試験と別に粒度8で確認し、next.config.tsを緩和しない。

**この粒度では変更しない**：既存認可・プラン表、F07 Actions、layout、proxy、再検証関数、DB・通知adapter。

**完了条件・テスト**：4ロール・失効・未ログイン・他クラブ・利用不可プラン、requestId改ざん、
category/messageの不正、hiddenやヘッダーの境界、危険URLの不採用、制御例外、固定success/errorを確認する。
通知失敗時も同じsuccessとなること、返すvaluesに個人情報snapshotやmetadataを混ぜないことを検証する。

### 粒度6：マイページの報告フォームと成功reset

**目的**：確認して送信でき、他フォームの入力を壊さず受付トーストと報告フォームresetを実現する。

**調査開始ファイル**

| 既存ファイル | 確認対象・理由 |
| --- | --- |
| `app/(club-app)/club/[clubSlug]/account/page.tsx` | ClubAccountPageの認可・フォーム配置・既存toastを維持 |
| `app/(club-app)/club/[clubSlug]/account/AccountNameForm.tsx` | 既存の確認付き入力、独立state・IDの参考 |
| `app/(club-app)/club/[clubSlug]/account/AccountConfirmDialog.tsx` | useConfirmedAccountForm、AccountConfirmDialogの再利用。共通化し直さない |
| `app/(club-app)/club/admin/_components/FieldErrorList.tsx`、`app/(club-app)/club/admin/_components/FormErrorAlert.tsx` | エラーの表示と関連付け |
| `app/(club-app)/club/admin/_hooks/useScrollToFormError.ts`、`app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard.ts` | エラーfocus、未保存入力の扱い |
| `components/admin/ToastMessage.tsx` | 固定文言とrequestIdのkey |
| `tests/club-account-pages.test.ts`、`tests/club-account-forms.test.ts` | Pageのpropsと既存フォームの回帰。hook試験の限界を維持 |
| `package.json`、`vitest.config.mts` | Next/React版・DOMなし試験 |

**先行粒度適用後に確認**：粒度1フォーム契約、粒度5Actionと試験。

**変更予定の既存ファイル**

- `app/(club-app)/club/[clubSlug]/account/page.tsx`：認可済みslug・独立初期stateと新規フォームの接続だけ。
- `tests/club-account-pages.test.ts`：新Client Component・Actionのmockとprops接続確認。

**新規ファイル案**

- `app/(club-app)/club/[clubSlug]/account/SupportReportForm.tsx`
- `tests/support-report-form.test.ts`

**内容**

- category選択と2000文字以内のtextarea、パスワード・個人情報を入力しない補足文。
- フォームは既存account表示DTOの取得成功を前提にしない。認可済みcontextから必要なslugだけを渡す。
  accountのFETCH_FAILED時も既存の非開示エラーを維持しつつ報告フォームを出せるようにする。
  UNAVAILABLEのnotFoundや未ログイン時の遷移は維持する。追加の本人情報取得をPageへ増やさない。
- useConfirmedAccountForm・AccountConfirmDialogで確認後だけ送信。useId・requestId・stateは他フォームから独立。
- pending中の二重送信・閉じる操作を抑止。確認キャンセル・エラーでは報告内容を保持する。
- 成功時だけ内側の入力部分を新requestIdのkeyで再マウントし、本文を空、categoryをBUGへ戻す。
  外側で固定成功トーストを表示する。successのたびにToastMessageへ新keyを渡す。
- トースト文言は全体設計の受付完了文を定数化して使用する。入力・例外を表示文へ埋め込まない。
- 氏名・Childフォームの入力・stateはresetしない。URLを書き換えるeffectも追加しない。
- reporter情報・生URL・UAをClient propsやhiddenへ渡さない。pageUrlのための履歴管理を作らない。

**必要時だけ確認**：再マウントでdirty guardや入力保持が合わない場合に、該当hook・呼出し元だけを確認する。
共通hookの変更が必要なら影響先のテストを示し計画変更を報告し、黙って変更しない。

**この粒度では変更しない**：F07フォーム・Actions、AccountNavigation、共通modal/hooks、Header/Footer、
layout、履歴管理、Platform画面、共通Toastの挙動。

**完了条件・テスト**：表示・入力上限・エラーの関連付け、確認前未送信、キャンセル保持、pending、
成功時の新key/reset/固定toast、通知失敗も成功表示、他フォームとの独立を新規試験・Page試験で確認する。
既存account DTOの取得失敗時でも、認可済みの場合だけF08フォームを接続できることをPage試験へ加える。
node試験をfocus・native dialog・実DOM保持の実証にせず、ブラウザー確認は粒度8へ分ける。

### 粒度7：ガード付きDB統合試験と専用コマンド

**目的**：既存DB制約、snapshot、重複受付、DB保存後の通知失敗を実DBの永続化と照合する。

**調査開始ファイル**

| 既存ファイル | 確認対象・理由 |
| --- | --- |
| `tests/club-account.flow.integration.test.ts` | enabled・localConfiguration・safeCheck・専用client注入・UUID cleanup |
| `tests/club-id-integrity.integration.test.ts` | SupportReport FK・SetNullの既存実DB試験。共有clientの読込に注意 |
| `prisma/schema.prisma`、`prisma/migrations/20260926084449_f01_enforce_club_scope_integrity/migration.sql`、`prisma/migrations/20260927011826_f01_fix_same_club_set_null_trigger/migration.sql` | 正本の制約。実DBとの差は報告し勝手に変更しない |
| `src/infrastructure/prisma/client.ts` | dotenvと共有clientを専用試験から初期化しない |
| `package.json`、`vitest.config.mts` | 単独script追加と通常試験の非接続 |

**先行粒度適用後に確認**：粒度1〜5の対象と試験。6適用後はPageとの接続試験も回帰対象にする。

**変更予定の既存ファイル**：`package.json` の専用script追加だけ。既存script・依存関係・lockは変更しない。

**新規ファイル案**：`tests/support-report.flow.integration.test.ts`。

**内容・完了条件**

- 専用flag `RUN_SUPPORT_REPORT_TESTS=1` と `RUN_DB_INTEGRATION_TESTS=1`、
  `SUPPORT_REPORT_DISPOSABLE=1`、非production、使い捨てloopback DB確認をすべて要求する案。
- 専用script案 `test:support-report:local` は当該ファイルだけを実行し、dotenvを自動読込しない。
- 通常npm testは接続ガード試験だけを動かし、実DBケースはskipする。SDKは常にmockして実メールを送らない。
- ガード後だけ専用Prisma clientを構築・注入。共有clientのトップレベルimportを避ける。
- fixtureのUUIDを作成前に登録し、対象UUIDだけをcleanup。全件削除・migration・実Auth操作は行わない。
- 4ロール、A/Bクラブと他人、失効した親Membership、利用不可プラン、snapshotの最新値とnullを確認。
- 同じIDの再送・同時作成は1受付。別人の既存IDや内容差を成功扱いしない。
- DB保存失敗では通知なし。通知失敗/不明でも報告が残り、固定notifyError、Action受付成功を確認。
- 成功時notifiedAt、結果更新失敗時の受付保持・安全なログ、受付後のMembership削除とsnapshot保持を確認。
- DBとSDKの原文や設定値を失敗出力へ含めない。実行条件がなければskipと理由を記録する。

**必要時だけ確認**：接続や制約に差が出た場合に対象migration・実SDK型を確認する。
本番設定や実ログの秘密値を取得せず、外部資料は型で解決しない仕様だけに限定する。

**この粒度では変更しない**：schema・migration・共通client・共通test設定・実DB・実Auth・実メール、既存test:db。

**実行するテスト**：新規ガード試験、許可条件が揃った場合だけ専用DB試験、
既存 `tests/club-membership-authorization.test.ts` と各F08単体試験。実DB未実行を成功扱いしない。

### 粒度8：運用手順と統合受入

**目的**：DBを正本とする運用、補助通知の限界、ブラウザー・HTTPの受入を具体的に記録する。

**調査開始ファイル**

| 既存ファイル | 確認対象・理由 |
| --- | --- |
| `docs/implementation/phases/F08.md` | 10項目と受入条件の漏れを照合 |
| `docs/runbooks/club-account.md` | 既存の結果記録、実DB・ブラウザー・HTTPを分ける手順 |
| `lib/mail/resend.ts`、`scripts/validate-env.mjs` | 設定不足・読込時失敗・既存本番要件の説明。実設定は読まない |
| `next.config.ts` | bodySizeLimitと既存設定。変更せず前提として記録 |
| `tests/club-membership-authorization.test.ts`、`tests/club-account-pages.test.ts`、`tests/club-account-forms.test.ts` | 既存認可・F07フォームの回帰対象 |
| `vitest.config.mts`、`package.json` | 実行コマンド・通常試験・専用試験の区別 |

**先行粒度適用後に確認**：各F08実装・全関連テスト・専用DB script。

**変更予定の既存ファイル**：なし。

**新規ファイル案**：`docs/runbooks/support-report.md`。

**内容・完了条件**

- ADMIN_EMAIL・共通From・APIキーの責任者と設定方法を説明する。値や本文を運用ログへ載せない。
- 通知失敗を利用者の再送依頼へ変換しない。DB受付IDで調査する。
- DB保存直後のプロセス停止や通知結果保存不能では、未通知/結果不明が残り得ることを明記する。
  notifiedAtはprovider受付の印。配送完了や重複配送の完全防止を保証しない。
- 再送queue、通知復旧worker、Platform管理・対応操作はF08へ追加しない。手動DB更新を標準手順にしない。
- ブラウザーで全ロール、利用不可プラン、確認・Esc/focus・pending、入力保持、送信後reset・toast、
  氏名/Childの未保存入力との独立、戻る/再読込/連打、通知障害時の受付成功を確認する。
- HTTPのforeign Origin拒否と直接Actionを分け、hidden改ざん・不正requestId・失効後送信・
  危険query/fragment不保存・サーバーUA上限を確認する。認証CookieやAction IDを公開資料へ保存しない。
- 通常単体、mockフロー、実DB、ブラウザー、実配送を分けてpass/fail/skipと理由を記録する。
  実メール試験は別途認められたローカル/検証環境だけ。patch作成では送信しない。

**必要時だけ確認**：ログ連携や運用上の通知先に疑問が出た場合に該当設定定義・コードを追う。
実値を表示しない。SDKの配送保証やtimeout条件を断定する必要がある場合だけ公式仕様を確認する。

**この粒度では変更しない**：実装本体・既存runbook・既存ログ基盤・本番設定・管理画面・他フェーズ。

**実行するテスト**：各F08単体・専用ガード、既存認可、`domain/club/plan-features.test.ts`、
`src/infrastructure/logging/sanitize-log-context.test.ts`、`lib/mail/club-invitation-mail.test.ts`、
`tests/club-account-pages.test.ts`・`tests/club-account-forms.test.ts`。
実DB・ブラウザーは条件を満たす場合だけ行い、未実施は受入完了にしない。

## 7. DB・Prisma変更

新規schema・migration・Prisma生成は不要という計画。
根拠：SupportReportにF08の全保存項目があり、id主キーで同一requestIdの重複を抑止できる。
既存のFK・triggerはクラブ一致を守るが、本人・ACTIVE・プラン・snapshotの正しさはRepositoryで確認する。

- nullable membershipId・ON DELETE SET NULLとsnapshot保持を維持する。
- SupportReport_club_id_immutableを回避しない。別クラブへ報告を移す操作は実装しない。
- 通知結果は既存notifiedAt・notifyErrorを使う。notifyErrorへ任意例外原文を保存しない。
- statusはOPEN固定で作成。ON_HOLDを含む既存enumを変更しない。
- 別requestIdによる任意連続投稿の頻度制限は、同一requestIdの重複対策とは異なる。
  既存HPのFormSubmissionLog/FormTypeを拡張せず、閾値未定の新しい制限基盤を先回りしない。
- 実DB差異が判明した場合はこの前提を再評価し、必要な計画変更を報告する。

## 8. ユーザー操作からDBまでの処理フロー

表の新規関数は上記粒度で作成する案。現在は未接続。

| 段階 | ファイル・関数、受け取る値→返す値 | DB変更・接続粒度 |
| --- | --- | --- |
| Page | `account/page.tsx / ClubAccountPage`：slug→認可済みcontext、独立した初期stateと束縛Action | 読取のみ、接続は6 |
| フォーム | 新規 `account/SupportReportForm.tsx / SupportReportForm`：category・message→確認後のFormData | なし、6 |
| Action | 新規 `account/support-actions.ts / createSupportReportAction`：slug・prevState・FormData→限定ActionState | 5。ACTIVE・プラン再認可、headersからUA、現在accountパスを導出 |
| Domain | 新規 `domain/club/support/` のparse・validation・sanitize：許可入力→正規化入力・安全なmetadata/エラー | なし、1 |
| Service | 新規 `src/application/club/support/create-support-report.ts / createSupportReport`：context・requestId・許可値→受付結果 | 受付と通知の順序付け、4 |
| Repository | 新規 `support-report-repository.ts / createSupportReportForMember`：scope・受付ID・許可値→CREATEDまたは同一受付/拒否/失敗 | 最新Membership/AppUserからsnapshot付きSupportReportをINSERT、2 |
| 通知 | 新規 `lib/mail/support-report-mail.ts / sendSupportReportEmail`：保存済みDTO→固定通知結果 | DB変更なし、3。共通ResendでADMIN_EMAILへ通知 |
| 通知記録 | 新規Repositoryの `recordSupportReportNotification`：受付由来reportId・clubId・固定結果→記録結果 | 既存notifiedAt・notifyErrorだけ更新、2・4 |
| 完了 | Actionは新requestId・空message・BUGのsuccess→フォーム内側のkey更新、固定トースト | 再INSERTなし、5・6。通知失敗も同じ受付成功 |

受付snapshotは現在のAppUser.name/emailとMembership.role。利用者が後日変更しても上書きしない。
再送は保存済み本文/categoryの一致を確認し、再度メール送信しない。

## 9. 危険箇所と確認方法

| 危険箇所 | 方針と根拠 |
| --- | --- |
| UIだけの認可 | requireActiveClubMembershipをActionで再実行し、Repositoryもscope・ACTIVE・プランを再確認。既存認可関数・PLAN_FEATURESが根拠 |
| hiddenの報告者情報 | 許可するのはcategory・message・requestIdだけ。DBのAppUser・Membershipからsnapshotを取得 |
| 別クラブ操作 | INSERT時scope照合、通知更新は受付ID＋clubId。DB triggerだけでは本人を守れない |
| 読込時メール設定例外 | lib/mail/resend.tsのトップレベル検査を確認済み。通知関数内の遅延取得で受付後の失敗へ隔離 |
| DB保存前のメール | ServiceがCREATEDを受けた後だけ送信。DB失敗時のメールなしを順序assertする |
| メール成功と配送完了の混同 | SDK data.idはprovider受付。notifiedAtを配送完了と説明しない |
| 結果保存の二次障害 | notifyErrorの更新失敗でも受付成功。固定ログで確認し、DB永続化を保証したと報告しない |
| 秘密URL・UA | pageUrlはサーバー導出のallowlistパスのみ、UAは512文字へ制限。本文・URL・UAをログに渡さない |
| DB/SDK例外の漏えい | notifyErrorは固定コード、sanitizeLogContextへraw errorを渡さない。試験の例外にも原文を含めない |
| 重複送信 | 同一requestIdを既存PKへ使用、本人と内容を照合。ALREADY_ACCEPTEDでは通知しない |
| 任意IDでの投稿連打 | 同一送信の重複対策で頻度制限は保証しない。運用上の閾値・必要性は未確定 |
| 大きいリクエスト | Next共通bodySizeLimitは12mb。F08の2000文字検証と同一ではない。共通設定を勝手に狭めない |
| 表示DTO取得への過剰な依存 | F08フォームの入力に本人DTOは不要。認可済みのFETCH_FAILED画面からも送信できるようにし、UNAVAILABLEの拒否は維持 |
| 成功後の入力消失 | 報告内側だけresetし、既存F07フォームへ状態を共有しない。ブラウザーで未保存入力を確認 |
| importによる実接続 | 共有Prismaはdotenv/configを持つ。単体・統合とも境界を置換し、専用DB試験はガード後注入 |

## 10. 設計書との差・未確認事項・F08外の依存

### 設計書との差と解決方針

1. **利用範囲**：F08.mdの全ACTIVEと現行STANDARD制限は、今回の回答で利用可能プラン内の全ロールと確定。
   共通layoutやプラン表を変更しない。粒度1で仕様を補足する。
2. **pageUrl**：全体設計は報告直前ページだが、今回の回答で送信時マイページへ確定。
   履歴管理・Referer依存を追加せず、認可済みslugからcanonicalパスを導出する。
3. **成功処理**：全体設計6-5はaccount?sent=1へredirect。
   F08.mdは成功トースト/resetだけを要求するため、既存の複数フォームを維持するActionState方式を採用する案。
   粒度1で明記し、F07のtoastや再検証の契約を変更しない。
4. **status**：全体設計の保存方針説明は3状態だが、同じ資料のモデルと現在schemaはON_HOLDを含む4状態。
   F08はOPENで作成するだけ。管理状態の整理・変更は含めない。
5. **通知失敗の記録**：全体設計はnotifyError「または」ログ、F08.mdはnotifyError「と」安全なログ。
   F08.mdに合わせて両方を試み、DB更新不能の場合だけ固定ログに残る限界を説明する。

### 未確認事項

- ADMIN_EMAILの運営者宛先・担当者、共通Fromの実設定、実配送は未確認。秘密値は取得していない。
- DB snapshotをAppUser.emailとする案。Auth emailとの不一致はF07同様に同期・修復しない。
- 512文字のUA上限、requestId重複方針、ActionState成功方式はこの計画の実装判断。既存実装済みとはしない。
- 実DBの適用済みmigration、FK/trigger・transaction競合、通知結果更新不能、ブラウザー・HTTP保護は未実行。
- 安全なnotifyErrorの固定コード名と公開結果の最終型名は粒度1で確定する。
- 押下から完了までの同期通知がサーバー実行時間を超える場合や、受付直後にプロセスが停止する場合、
  DBには受付が残るが補助通知が未実施/結果不明となり得る。F08はworker・自動復旧を作らない。
- 個人情報の保管期間・運用者の閲覧運用は未確認。F08で勝手な自動削除や新しい管理権限を追加しない。

### F08外の依存

- 既存Auth・Membership・プラン認可が前提。新しいAuth管理やプラン開放は行わない。
- 共通Resend基盤・本番環境検証は既存実装を使用する。全アプリの設定不足による起動失敗までF08で解消しない。
- Platformのサポート一覧・状態変更・内部メモ・復旧送信は別範囲。存在未確認の画面へ依存する通知リンクを作らない。
- F07の規約・プライバシーURLやPlatform遷移先の保留は引き継ぐが、今回の計画で解決しない。
- HP問い合わせ・体験見学通知、FormType、クラブ別通知先設定、LINE通知は変更しない。

## 11. patchごとの検証と受入の区別

- 各粒度は対象ファイルだけの型チェック・ESLint・関連単体試験を実行し、必要な既存回帰を加える。
- 新規ファイルはGitのdiffへ必ず含める。元ソースへpatchを適用せず、git apply --check・--statで確認する。
- 調査開始時の未コミット変更を上書きしない。開始時dirtyならpatch作成を止めて報告する。
- 実DB・Auth・メール・ブラウザーが未実施なら、mockが通っても受入完了としない。
- 本計画作成時はテスト・型チェック・DB接続・メール送信を実行していない。
  上記は実装patch作成時の確認対象であり、試験成功の報告ではない。

## 12. 自己確認

- [x] F08の受付と補助通知に限定し、管理画面・HP・他フェーズを実装計画へ混入させていない。
- [x] 既存DBモデル・認可・Resend・フォーム共通部品を再実装する計画にしていない。
- [x] 既存の変更予定4ファイル（F08.md、account/page.tsx、club-account-pages.test.ts、package.json）を実際に確認した。
- [x] Action・Repository・メール・Pageの既存参照と関連テストを確認し、未実装経路を区別した。
- [x] 新規ファイル・関数は案、先行粒度の成果物は適用後確認として区別した。
- [x] ユーザー回答、設計判断、未確認事項を混同せず、不明点を現在コードの事実として補っていない。
