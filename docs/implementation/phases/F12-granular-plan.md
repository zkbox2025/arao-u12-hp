<!-- docs/implementation/phases/F12-granular-plan.md -->

# F12 DB統合・E2E・テナント越境・障害テスト：粒度別計画

## 1. 基準・今回の範囲

- 調査基準：`feat/club-app-foundation` / `a01d9e8de4789f2abd14cd1ae161386f1e2f9006`。
- 開始時の `git status --short` は出力なし。既存の本ファイルは空であった。
- 優先順位はAGENTS.md、F12.md、実装、背景設計proposals2.md。
- 今回は本計画だけを作成する。ソース、schema、migration、Git index、依存、feature.patchは変更しない。
- 実DB・Auth・Storage・メール・LINE・browserの操作やmigration実行は行っていない。既存試験の存在と実行成功を混同しない。
- ユーザー確定：E2Eは使い捨てローカルSupabaseのDB・Auth・Storageを使い、Resend・LINEは送信しない。
- ユーザー確定：F12の専用粒度で `@playwright/test` のdevDependency追加を許可する。AGENTS.mdの通常のパッケージ追加禁止への例外はこの範囲だけ。今回は導入しない。
- 以下の新規パスはすべて「新規案」。既存ファイル・既存関数と取り違えない。新規helperの関数名は実装時に契約とコードで確定する。

## 2. 現在の実装状況と重複しない方針

| 分野 | 状態 | 実際の根拠・今回残す仕事 |
| --- | --- | --- |
| Vitest基盤 | 実装済み | `vitest.config.mts` のnode環境・alias・include。unit／integration用の新しい分類と集約を追加し、既存testを再設計しない |
| DB統合試験 | 一部実装 | `package.json / test:db` は8本。F06〜F11等には専用flowが別途ある。共通安全境界と必須実行manifestが不足 |
| 同クラブDB制約・RLS | 実装済みの制約と試験あり | `prisma/schema.prisma`、F01 migration、`tests/club-id-integrity.integration.test.ts`。新しいDB制約をF12で追加しない |
| 最後のOWNER | 実装・DB試験あり | `club-membership-repository.ts / updateClubMembershipForOwner` と同名integration test。2 OWNERの並列降格は再利用 |
| 招待二重承諾・競合 | 実装・DB／Auth試験あり | `club-invitation-repository.ts / acceptClubInvitationForUser`、acceptance-repository.integration、acceptance.flow、auth.local.integration。二重実装しない |
| Storage lease復旧 | 実装・DB試験あり | `storage-deletion-job-repository.ts / claimStorageDeletionJob` と `tests/storage-deletion-jobs.integration.test.ts`。並列claim・期限切れ再取得・失敗後完了を再利用 |
| LINE設定・webhook | 実装・試験あり | `club-line-setting-repository.ts`、`handle-club-line-webhook.ts`、設定integrationとRoute unit。DBをつないだwebhookKey横断試験を追加 |
| LINE worker | 実装済み、専用DB送信試験は未発見 | `send-pending-line-deliveries.ts / claimDelivery / finishDelivery` はPROCESSING・lease・claimTokenあり。workerの実並列と故障状態を追加 |
| アカウント・子ども・サポート・Platform | 実装・unit／専用flowあり | club-account.flow、support-report.flow、platform-support.flow。現行DB試験は再利用し、実ブラウザーとHTTP境界を追加 |
| イベント・お知らせ一般操作 | 実装済み、横断する自動試験は一部 | `club-event-repository.ts`・`club-notice-repository.ts`、各Action、添付Route。公開対象・既読・個人メモ・添付・ID混在のDB／E2Eを追加 |
| F10・F11 | 実装・専用DB／mock試験あり | event-month-copy.flow、event-practice-batch.flow、各forms／actions試験。残る実ブラウザー受入を追加し、本体機能を作り直さない |
| テストseed | 一部実装 | `prisma/seed-app-local.ts / main` は既存OWNER AuthとPlatformAdmin向け。A/B全role・複数所属・試験資源cleanupの専用seedは未実装 |
| 空DB／既存データへのmigration自動試験 | 未実装 | migration履歴と既存テーブル上の制約試験はあるが、履歴を空／旧データからdeployするsuiteは未発見 |
| Playwright／E2E | 未実装 | package／lockに `node_modules/@playwright/test` なし。Nextのoptional peer記載は導入済みを意味しない。playwright config・E2E spec未発見 |
| 3つの集約script | 未実装 | `test:integration`・`test:e2e`・`verify:mvp` はpackage.jsonに存在しない |

### 実解決バージョンとNextの根拠

`package.json` と `package-lock.json / packages` を確認した。
Node実行環境は24.12.0。Next 16.2.6、React 19.2.4、Vitest 4.1.10、TypeScript 5.9.3、
Prisma CLI 7.9.1、Client／adapter-pg 7.8.0、Supabase JS 2.112.3／SSR 0.10.3、
Supabase CLI 2.101.0、Resend 6.12.4、pg 8.21.0。
CLIとClientの版差は確認できたが、互換性の実行結果は未確認。F12で無断追従更新しない。

導入済み `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` と `vitest.md` を必要箇所だけ確認した。
前者はproduction codeでのE2Eを推奨し、後者はasync Server Componentの検証にE2Eを推奨する。
既存のPageを関数として直接呼ぶunit試験を、実Next・Cookie・HTTPの証明にはしない。
新しいPlaywrightの版・APIは実装時の依存と型で確定し、記憶で指定しない。

## 3. 共通の実装・調査ルール

各patchは1粒度だけとし、前提粒度を適用済みにしてから作る。
AGENTS.mdの日本語import説明、本文の関数／型行末説明、日本語JSDocは新規・機能変更ソース／テストに適用する。
コードや過去SQLをテスト都合で広く整形しない。テスト用の認可bypassや公開reset APIは作らない。

各粒度の「調査開始」は現時点で実在を確認したファイルである。
共通で `package.json` と `vitest.config.mts` の実行設定・aliasも確認する。
依存粒度の新規helper／fixture／configは「前提成果物」として適用後に読み、まだ存在しないものを既存扱いしない。
変更予定の既存ファイルは調査開始ファイルと別に示す。
「変更しない」は読取禁止ではなく、互換性・認可・セキュリティの追跡には必要な対象外コードを読める。
対象外の修正が必要と判明した場合は、実装せず理由・最小再現・計画変更案を報告する。

DBやE2Eを実行する必要がある粒度も、patch作成時のAGENTS.mdの実DB変更禁止を優先する。
その場ではガード単体・型・lint・静的確認を行い、実DB／実Auth／E2Eを未実行として報告する。
専用環境で利用者が実行した証跡が揃うまで、MVP受入済みにしない。

## 4. 調査した主要ファイルと確認対象

各パス・関数・モデル・設定は現在のコードから確認した。ここに挙げた対象を全部のpatchで読み直す必要はない。

- `package.json`：scripts・dependencies・devDependencies。既存コマンドと新コマンドを分ける。
- `package-lock.json`：packagesの実解決バージョン。Playwrightの未導入と導入差分を確認する。
- `vitest.config.mts`：resolve.alias、test.include／exclude、node環境。既存試験の分類と互換性。
- `.gitignore`：既存の.env・生成物除外。認証状態・trace・reportを追跡しない。
- `next.config.ts`：headers、allowedDevOrigins、serverActions.bodySizeLimit。HTTPと添付の試験条件。
- `prisma/schema.prisma`：Club・AppUser・ClubMembership・Child・ChildClubMembership・ClubInvitation・ClubEvent／Noticeと関連行・ClubLineSetting／Target／Delivery・StorageDeletionJob・SupportReport・PlatformAdmin。実在する列と制約。
- `prisma.config.ts`：defineConfigのmigrations.path・datasource.url、dotenv/config。CLIの評価前に接続先を確定する。
- `src/infrastructure/prisma/client.ts`：prisma、Pool、dotenv/configのトップレベル初期化。skip前の副作用に注意する。
- `supabase/config.toml`：api=54321、db=54322、inbucket=54324、storage・auth、redirect allowlist。ローカルサービスの契約。
- `prisma/seed-app-local.ts`：main・assertLocalUrl。既存Auth OWNERとPlatformAdminを再利用する開発seedで、F12 fixtureとは目的が異なる。
- `tests/event-practice-batch.flow.integration.test.ts`：enabled・localConfiguration・safeCheck・database・synchronize。flag前のURL未評価、専用client、fixture限定cleanup、自然競合と障害注入を分ける先例。
- `tests/club-id-integrity.integration.test.ts`：describeDatabase、beforeAll／afterAll、prismaの静的import。同クラブFK・triggerの既存DB試験。
- `tests/storage-deletion-jobs.integration.test.ts`：storageMocks、describeDatabase、並列claim・期限切れPROCESSING再取得・失敗後COMPLETEDのケース。重複実装を避ける。
- `tests/club-membership-repository.integration.test.ts`：createClubFixture、最後のACTIVE OWNERの拒否、2 OWNER並列降格。既存の実DB保証。
- `tests/club-invitation-acceptance-repository.integration.test.ts`：mockの試験群と実DB群、同一招待2並行、取消・再送・期限処理との競合。ファイル名だけでmock／DBを混同しない。
- `tests/club-invitation-auth.local.integration.test.ts`：describeLocalAuth・safeCheck・verificationClient、generateLink／verifyOtp／SSR Cookie契約。実Authの既存試験。
- `tests/club-invitation-acceptance.flow.integration.test.ts`：enabled・localConfiguration、DB＋ローカルAuthのflow、複数flag。既存の承諾フローを再利用する。
- `tests/club-account.flow.integration.test.ts`：enabled・localConfiguration・databaseCase、複数クラブ・本人／子ども・最新所属とfixture限定cleanup。
- `tests/support-report.flow.integration.test.ts`：enabled・localConfiguration・databaseCase。受付をDB保存してから通知する既存flow。
- `tests/platform-support.flow.integration.test.ts`：enabled・localConfiguration、PlatformAdmin再認可と管理操作の既存flow。
- `tests/event-month-copy.flow.integration.test.ts`：enabled・localConfiguration・safeCheck。100件、replay、実並列、rollback、RLS等の既存F10試験。
- `scripts/validate-env.mjs`：loadEnvConfig・envSchema、本番HTTPS・Resend・CRON必須検証。実行cwdの.env読込みとNODE_ENVを追跡する。
- `app/(club-app)/club/club-membership-authorization.ts`：ClubAccessContext・requireActiveClubMembership・requireClubAdminMembership・requireClubOwner。Auth本人＋slug＋ACTIVEからscopeを確定する。
- `app/(club-app)/club/club-app-authorization.ts`：requireClubAppAccess・requireClubAppAdminAccess・requireClubAppOwnerAccess。認可後に利用プランを確認する。
- `domain/club/plan-features.ts`：PLAN_FEATURES・hasClubFeature・requireClubFeature。STANDARDのみCLUB_APP、PROは未有効。
- `app/(club-app)/club-login/actions.ts`：loginAction。実Cookie・本人確認・招待再開・所属先への遷移の起点。
- `domain/club/club-login-destination.ts`：getAppEnabledMemberships・getClubLoginDestination。0／複数件は/club/select、1件はそのクラブへ。
- `app/(club-app)/platform/require-platform-admin.ts`：PlatformAdminAccessContext・requirePlatformAdmin。クラブ所属から独立した有効な運営者の境界。
- `src/infrastructure/prisma/repositories/platform-admin-repository.ts`：findActivePlatformAdminByUserId。isActiveとDEVELOPER／SUPPORTの最新DB照合。
- `src/infrastructure/supabase/server.ts`：createClient。cookiesを使う実SSRセッション。
- `src/infrastructure/supabase/admin.ts`：createSupabaseAdminClient。Service Roleをクライアントや成果物に出さない。
- `proxy.ts`：proxy・config、招待contextのCookie化とセッション更新。正規入口のセキュリティ境界。
- `src/infrastructure/prisma/repositories/club-event-repository.ts`：findClubEventForAdmin・findPublishedClubEventDetail・createClubEvent・updateClubEvent・deleteClubEvent・markClubEventRead・saveClubEventMemo・findClubEventAttachmentForMember／Admin。clubId・公開対象・関連行を追跡する。
- `src/infrastructure/prisma/repositories/club-notice-repository.ts`：findClubNoticeForAdmin／Member・createClubNotice・updateClubNotice・deleteClubNotice・markClubNoticeRead・findClubNoticeAttachmentForMember／Admin。event側と異なる既読仕様も確認する。
- `app/(club-app)/club/[clubSlug]/admin/events/new/actions.ts`：createClubEventAction。再認可→添付準備→DB保存→worker予約→再検証。
- `app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/actions.ts`：updateClubEventAction・retryClubEventLineDeliveryAction。eventId・削除attachmentId・targetId・deliveryIdのscope。
- `app/(club-app)/club/[clubSlug]/admin/events/actions.ts`：deleteClubEventAction。clubId条件付き削除とStorage削除Job、固定ログ・一覧遷移。
- `app/(club-app)/club/[clubSlug]/events/[eventId]/actions.ts`：markClubEventReadAction・saveClubEventMemoAction。公開対象を再取得してから本人の既読・メモを更新する。
- `app/(club-app)/club/[clubSlug]/admin/notice/new/actions.ts`：createClubNoticeAction。お知らせの作成・添付・通知・再検証。
- `app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/actions.ts`：updateClubNoticeAction・retryClubNoticeLineDeliveryAction。noticeIdと関連IDを再確認する。
- `app/(club-app)/club/[clubSlug]/notice/[noticeId]/actions.ts`：markClubNoticeReadAction。公開対象・本人所属を確認して既読更新。
- `app/(club-app)/club/[clubSlug]/attachments/event/[attachmentId]/route.ts`：GET。requireClubAppAccess→findClubEventAttachmentForMember→createClubAttachmentSignedUrl。拒否時は署名しない。
- `app/(club-app)/club/[clubSlug]/admin/attachments/event/[attachmentId]/route.ts`：GET。管理権限とclubIdで署名URL発行の対象を制限する。
- `app/(club-app)/club/[clubSlug]/attachments/notice/[attachmentId]/route.ts`：GET。会員用お知らせ添付の公開対象とclubIdを確認する。
- `app/(club-app)/club/[clubSlug]/admin/attachments/notice/[attachmentId]/route.ts`：GET。管理者用お知らせ添付のclubIdを確認する。
- `src/infrastructure/storage/club-content-attachment-storage.ts`：uploadClubContentAttachments・createClubAttachmentSignedUrl・deleteClubStorageObject。ローカルStorageと部分アップロード失敗。
- `src/application/club/attachment/resolve-attachment-changes.ts`：resolveAttachmentChanges。既存添付・削除指定・追加ファイルを照合する共通境界。
- `src/infrastructure/prisma/repositories/club-child-repository.ts`：findChildActor・createChildForUser・updateChildForUser・addChildToClubForUser・withdrawChildFromClubForUser。parentIdと最新所属を照合する。
- `src/infrastructure/prisma/repositories/club-account-repository.ts`：ClubAccountReadScope・findClubAccountForUser・findAttachableChildrenForUser・updateAccountNameForUser。本人のグローバル情報とクラブ所属の区別。
- `app/(club-app)/club/[clubSlug]/account/actions.ts`：updateAccountNameAction・createChildAction・updateChildAction・addChildToClubAction・withdrawChildFromClubAction。hidden clubId・childId改変を確認する。
- `src/infrastructure/prisma/repositories/club-membership-repository.ts`：updateClubMembershipForOwner、Serializable・最大3回retry、最新actorとACTIVE OWNER数。
- `app/(club-app)/club/[clubSlug]/admin/members/actions.ts`：updateClubMembershipAction。OWNER再認可と対象membershipId。
- `src/infrastructure/prisma/repositories/club-invitation-repository.ts`：reserveClubInvitation・claimClubInvitationResend・acceptClubInvitationForUser・findClubInvitationAcceptanceForUser・markClubInvitationEmailSent／Failed。本人・slug・hashと状態を照合。
- `src/application/club/invitation/send-club-invitation.ts`：inviteClubMember・resendClubInvitation・prepareAndSend。Auth作成・リンク生成・メール・DB記録の途中失敗。
- `src/application/club/invitation/accept-club-invitation.ts`：acceptClubInvitation。OTP／passwordのAMR、パスワード更新後の承諾失敗・結果不明を区別する。
- `app/(club-app)/club/[clubSlug]/admin/members/invitation-actions.ts`：inviteClubMemberAction・resendClubInvitationAction・cancelClubInvitationAction。OWNER限定操作。
- `app/(club-app)/club-invitations/accept/actions.ts`：acceptExistingClubInvitationAction。既存アカウントの正規承諾経路。
- `app/(club-app)/welcome/actions.ts`：completeClubInvitationAction。新規招待のパスワード設定と承諾。
- `src/infrastructure/prisma/repositories/club-line-setting-repository.ts`：findClubLineSettingsForOwner・updateClubLineTargetForOwner・replaceClubLineRegistrationToken・findClubLineSettingForWebhook・consumeClubLineRegistrationTokenAndUpsertTarget。
- `app/(club-app)/club/[clubSlug]/admin/settings/line/actions.ts`：updateClubLineTargetAction・createClubLineRegistrationCodeAction。OWNERとtargetId・登録コード境界。
- `tests/club-line-setting.integration.test.ts`：通知先のclubId・登録tokenの並列消費と期限の既存DB試験。
- `app/api/line/webhook/[webhookKey]/route.ts`：POST・writeSafeWebhookLog。未加工本文の署名検証と限定した応答・ログ。
- `src/application/club/line/handle-club-line-webhook.ts`：handleClubLineWebhook。webhookKeyで設定を選び、署名・destination・登録コードを同じクラブへ束縛。
- `src/application/club/line/send-pending-line-deliveries.ts`：claimDelivery・processDelivery・finishDelivery・sendPendingLineDeliveries・sendClaimableLineDeliveries。PROCESSING・lease・claimToken・試行回数と固定retry key。
- `src/infrastructure/line/line-messaging-api.ts`：sendLinePushMessage・LinePushResult。固定LINE endpoint、409受理扱い、固定エラー。
- `src/infrastructure/security/line-credential-crypto.ts`：encryptLineCredential・decryptLineCredential。クラブに束縛した偽credential fixtureを作る。
- `src/application/club/storage/run-storage-deletion-worker.ts`：runStorageDeletionJobs・processStorageDeletionJob。削除失敗・再試行とclaimTokenによる終端更新。
- `src/infrastructure/prisma/repositories/storage-deletion-job-repository.ts`：claimStorageDeletionJob・completeStorageDeletionJob・failStorageDeletionJob・failExhaustedStorageDeletionJobs。旧claimが新claimを上書きできない。
- `lib/mail/resend.ts`：resend・buildMailFrom。トップレベルSDK生成、production時の必須値、秘密を読み込まない実行環境。
- `lib/mail/club-invitation-mail.ts`：sendClubInvitationEmail。4xx拒否とtimeout／409／5xxの結果不明、試行別idempotencyKey。
- `lib/mail/support-report-mail.ts`：sendSupportReportEmail。ACCEPTED／FAILED／UNKNOWN、report単位のidempotencyKey。
- `src/application/club/support/create-support-report.ts`：createSupportReport・notifySavedReport・logSupportReportFailure。通知失敗でも受付を保持し、原文をログに出さない。
- `app/(club-app)/platform/support/actions.ts`：updateSupportReportStatusAction・updateSupportReportNoteAction。PlatformAdmin再認可と更新競合。
- `app/(club-app)/club/revalidate-club-paths.ts`：revalidateClubEventPaths・revalidateClubNoticePaths・revalidateClubAccountPaths等。commit後のキャッシュ境界。
- `lib/axiom/server.ts`：logInfo・logWarn・logError・flushLogs。外部ログ送信をテスト環境から遮断する。
- `app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/actions.ts`：copyPreviousMonthEventsAction。F10の既存保存・再検証・固定管理者遷移。
- `app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/actions.ts`：previewEventPracticeBatchAction・createEventPracticeBatchAction。F11の既存preview／保存契約。
- `app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchForm.tsx`：EventPracticeBatchForm・SelectionForm・beginSave。入力変更・再送snapshot・needsReload。

## 5. 粒度一覧と依存関係

| 粒度 | 目的 | 依存 |
| --- | --- | --- |
| 1 | 実行環境ガード・対象manifestの契約 | なし |
| 2 | DB fixture・テナント／ロールの最小seed | 1 |
| 3 | ローカルAuth・Storage fixtureと後片付け | 1・2 |
| 4 | 既存DB試験を安全に集約するintegration runner | 1・2・3 |
| 5 | 空DB・既存データDBへのmigration試験 | 1・4 |
| 6 | イベント・お知らせのDB越境と本人関連行 | 1・2・4 |
| 7 | 添付Route・実Storage・途中失敗 | 1・2・3・4 |
| 8 | LINE設定・webhookKey・targetIdのDB接続境界 | 1・2・4 |
| 9 | LINE workerの実DB並列・障害試験 | 1・2・4 |
| 10 | Resend障害とDB状態・機密非出力 | 1・2・3・4 |
| 11 | Playwright依存・設定・成果物境界 | 1 |
| 12 | E2E起動・ローカル送信stub・外向き通信遮断 | 1・3・11 |
| 13 | 認証・ロール・プラン・複数所属のE2E | 2・3・11・12 |
| 14 | イベント・お知らせ・PDF・キャッシュのE2E | 6・7・13 |
| 15 | OWNER招待・子ども／アカウントのE2E | 13・10 |
| 16 | LINE設定・Webhook・サポート／PlatformのE2E | 8・9・10・13 |
| 17 | F10・F11の実ブラウザー受入を自動化 | 13・14 |
| 18 | 直接Action POST・Origin・機密非出力 | 14・15・16・17 |
| 19 | verify:mvp・必須suiteと失敗伝播 | 4〜18 |
| 20 | 運用書・受入matrix・未解決事項 | 19 |

1→2→3→4を共通基盤とする。5〜10は基盤適用後に対象別に実装できる。
11は依存追加だけを先行でき、12が起動・送信遮断を実証してから13以降のE2Eを接続する。
19が全必須suiteを集約し、20が結果と未確認事項を運用へ落とす。
全体を一つの巨大patchにせず、中間粒度は対象のガード・単体／静的確認でreview可能にする。

## 6. 各粒度のpatch計画

### 粒度1：実行環境ガード・対象manifestの契約

**目的**：接続・副作用の初期化より先に、F12専用環境と実行対象を固定する。

**調査開始ファイル（既存）**

- `tests/event-practice-batch.flow.integration.test.ts`：enabled・localConfiguration・safeCheck・database・synchronize。flag前のURL未評価、専用client、fixture限定cleanup、自然競合と障害注入を分ける先例。
- `tests/club-id-integrity.integration.test.ts`：describeDatabase、beforeAll／afterAll、prismaの静的import。同クラブFK・triggerの既存DB試験。
- `src/infrastructure/prisma/client.ts`：prisma、Pool、dotenv/configのトップレベル初期化。skip前の副作用に注意する。
- `prisma.config.ts`：defineConfigのmigrations.path・datasource.url、dotenv/config。CLIの評価前に接続先を確定する。
- `supabase/config.toml`：api=54321、db=54322、inbucket=54324、storage・auth、redirect allowlist。ローカルサービスの契約。
- `scripts/validate-env.mjs`：loadEnvConfig・envSchema、本番HTTPS・Resend・CRON必須検証。実行cwdの.env読込みとNODE_ENVを追跡する。

**依存・前提成果物**：なし。

**必要時だけ確認**：Supabase側も接続前に初期化される疑いがある時は `src/infrastructure/supabase/admin.ts / createSupabaseAdminClient`、既存flagの許可条件を合わせる時は `tests/event-month-copy.flow.integration.test.ts / localConfiguration` を追加確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `tests/mvp/environment.ts`
- `tests/mvp/environment.test.ts`
- `tests/mvp/suite-manifest.ts`

**実装内容・境界**

- F12専用flagと使い捨て確認、非productionのlauncher、DB postgres@loopback:54322／Supabase http:54321／アプリ http:3000を検証する。URLのquery・fragment・前後空白・PG系上書き・外向きURLは拒否する。
- 同じ作業dirの.env・.env.local・.env.test・.env.production系等、自動読込対象による再読込みを防ぐため、それらを置かない専用checkoutでのみ実行する。.env.exampleは自動読込対象ではなく、この検証で読む必要もない。接続設定は許可した環境変数で渡す。既存作業ツリーの.envを読んだり消したりしない。
- migration用DBは同じ使い捨てcluster内でrunnerが作成するmvp_f12_<runId>_接頭辞のDBだけを例外許可。一般のDATABASE_URLへこの例外を広げない。実行runIdと作成資源を記録する。
- 必須suiteの既存実在パス、flag、DB／Auth要否をmanifestへ列挙する。ケース数0・必須suite欠落・必須DB群skipを完成扱いにしない。新規suiteは各粒度適用時に実在を確認し、最終集約で必須化する。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- vitest.config.mtsでenvironment.test.tsのみ。架空URLで拒否、flag不足時URL getter／SDK未評価、固定エラー、環境ファイル存在、接続先の正規化迂回、manifest重複を確認。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：guardの成功前にdotenv・Prisma・Supabaseをimportしない。実接続を伴わずガードの試験が通る。

### 粒度2：DB fixture・テナント／ロールの最小seed

**目的**：F12用の二クラブ・権限・公開対象・関連IDを再利用できるようにする。

**調査開始ファイル（既存）**

- `prisma/schema.prisma`：Club・AppUser・ClubMembership・Child・ChildClubMembership・ClubInvitation・ClubEvent／Noticeと関連行・ClubLineSetting／Target／Delivery・StorageDeletionJob・SupportReport・PlatformAdmin。実在する列と制約。
- `prisma/seed-app-local.ts`：main・assertLocalUrl。既存Auth OWNERとPlatformAdminを再利用する開発seedで、F12 fixtureとは目的が異なる。
- `tests/club-membership-repository.integration.test.ts`：createClubFixture、最後のACTIVE OWNERの拒否、2 OWNER並列降格。既存の実DB保証。
- `tests/club-account.flow.integration.test.ts`：enabled・localConfiguration・databaseCase、複数クラブ・本人／子ども・最新所属とfixture限定cleanup。
- `tests/event-practice-batch.flow.integration.test.ts`：enabled・localConfiguration・safeCheck・database・synchronize。flag前のURL未評価、専用client、fixture限定cleanup、自然競合と障害注入を分ける先例。

**依存・前提成果物**：粒度1。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/environment.ts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：fixtureの型・nullable・削除順が判断できない時は `types/prisma.ts` の型exportと `prisma/schema.prisma` の該当model、F01の同クラブtriggerだけを確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `tests/mvp/database-fixture.ts`
- `tests/mvp/database-fixture.integration.test.ts`

**実装内容・境界**

- テナントA OWNER／COACH／OFFICER／MEMBER、B OWNER／MEMBER、A OWNERだがB MEMBERの複数所属者、独立したPlatformAdminを用意。STARTER／PRO・失効所属はケース専用に追加する。
- DBだけの試験はAppUserを作成し、Auth fixtureとの接続時はAuth user.idと一致させる。Childは本人所有と他保護者所有を分ける。
- イベント／お知らせはDRAFT・対象MEMBER・対象外roleを用意し、添付・既読・メモ・LINE設定／通知先／偽暗号化credential・サポート報告・F10／F11用元予定を必要なケースだけ作る。
- 作成前にUUIDを登録。cleanupは登録範囲だけで、ClubLineDeliveryのRestrictとStorageDeletionJobのSetNullも処理する。test自体のDB失敗でも他クラブを削除しない。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 新規fixture統合試験は専用DBでだけ実行。全role／状態／unique、親子の所有、独立run、途中失敗cleanupを照合。既存seedは実行しない。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：新規seedを2回実行しても他runに触れず、認可用の実在IDを返し、広域deleteMany／truncateを含まない。

### 粒度3：ローカルAuth・Storage fixtureと後片付け

**目的**：実Cookieと非公開PDFを使うE2Eの土台を用意する。

**調査開始ファイル（既存）**

- `tests/club-invitation-auth.local.integration.test.ts`：describeLocalAuth・safeCheck・verificationClient、generateLink／verifyOtp／SSR Cookie契約。実Authの既存試験。
- `tests/club-invitation-acceptance.flow.integration.test.ts`：enabled・localConfiguration、DB＋ローカルAuthのflow、複数flag。既存の承諾フローを再利用する。
- `src/infrastructure/supabase/admin.ts`：createSupabaseAdminClient。Service Roleをクライアントや成果物に出さない。
- `src/infrastructure/supabase/server.ts`：createClient。cookiesを使う実SSRセッション。
- `src/infrastructure/storage/club-content-attachment-storage.ts`：uploadClubContentAttachments・createClubAttachmentSignedUrl・deleteClubStorageObject。ローカルStorageと部分アップロード失敗。
- `supabase/config.toml`：api=54321、db=54322、inbucket=54324、storage・auth、redirect allowlist。ローカルサービスの契約。

**依存・前提成果物**：粒度1・2。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/environment.ts`、`tests/mvp/database-fixture.ts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：Cookie確立の契約が判断できない時は `src/infrastructure/supabase/club-invitation-session.ts` と `tests/club-invitation-auth.local.integration.test.ts` のSSR Cookieケース、API型が必要な時だけ導入済みSupabase SDK／SSRのtypes解決先を確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `tests/mvp/local-services-fixture.ts`
- `tests/mvp/local-services-fixture.integration.test.ts`

**実装内容・境界**

- 粒度2の登録済みIDをローカルAuth admin.createUserの戻りIDと連携し、検証済みpasswordログイン用のテストユーザーを作る。アカウント名・メール・passwordはrunごとの検証専用値。
- club-app-attachmentsのprivate設定を検証し、未作成時だけテスト所有のバケットを作る。小さなPDF fixtureをrun専用prefixへ保存し、署名URLを実ローカルStorageで検証する。
- Authユーザー・Storage object・DB行の作成順と補償cleanupを記録する。既存Auth契約試験にはAuthユーザーを削除しないものがあるため、その残存は専用サービスの廃棄／残存報告と分ける。既存アカウントを検索して削除しない。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 専用Supabaseで新規作成→実password認証→DB同一ID→private objectの署名付き取得→fixtureだけ削除。失敗時の残存一覧は値を伏せたrun識別で記録する。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：実Auth・Storageの接続先をguardし、ローカル以外へアクセスしない。実メール配送を使わずAuthを準備できる。

### 粒度4：既存DB試験を安全に集約するintegration runner

**目的**：既存のDBケースを複製せず、import前ガードと必須実行を与える。

**調査開始ファイル（既存）**

- `package.json`：scripts・dependencies・devDependencies。既存コマンドと新コマンドを分ける。
- `vitest.config.mts`：resolve.alias、test.include／exclude、node環境。既存試験の分類と互換性。
- `tests/club-id-integrity.integration.test.ts`：describeDatabase、beforeAll／afterAll、prismaの静的import。同クラブFK・triggerの既存DB試験。
- `tests/club-invitation-acceptance-repository.integration.test.ts`：mockの試験群と実DB群、同一招待2並行、取消・再送・期限処理との競合。ファイル名だけでmock／DBを混同しない。
- `tests/club-invitation-acceptance.flow.integration.test.ts`：enabled・localConfiguration、DB＋ローカルAuthのflow、複数flag。既存の承諾フローを再利用する。
- `tests/storage-deletion-jobs.integration.test.ts`：storageMocks、describeDatabase、並列claim・期限切れPROCESSING再取得・失敗後COMPLETEDのケース。重複実装を避ける。
- `tests/club-membership-repository.integration.test.ts`：createClubFixture、最後のACTIVE OWNERの拒否、2 OWNER並列降格。既存の実DB保証。
- `tests/support-report.flow.integration.test.ts`：enabled・localConfiguration・databaseCase。受付をDB保存してから通知する既存flow。

**依存・前提成果物**：粒度1・2・3。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/environment.ts`、`tests/mvp/suite-manifest.ts`、`tests/mvp/local-services-fixture.ts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：既存ファイル内のmock群とDB群の実行順が衝突した場合だけ `tests/club-invitation-acceptance-repository.integration.test.ts` のmock解除・遅延importと、各専用flowのflag判定箇所を追加確認する。

**変更予定の既存ファイル**

- `package.json`

**新規ファイル案（調査開始ファイルではない）**

- `vitest.mvp-unit.config.mts`
- `vitest.integration.config.mts`
- `scripts/test-integration.mjs`
- `tests/mvp/integration-runner.test.ts`

**実装内容・境界**

- 新しいtest:integrationだけを追加し、既存test／test:db／verify:localは維持する。runnerが環境を検証してからVitest subprocessを起動する。
- unit設定は既存設定を使い、DB／Auth integration名を除外。F06の同一ファイル内mock群はintegration側で一緒に実行し、既存ケースを削除しない。
- integration設定はmanifestの既存8本のtest:db対象、F06〜F11のflow、既存ローカルAuth契約、新規F12 suiteを選択する。必要な既存flag・disposableを確認済み環境内でのみ設定する。
- rootの.envや共有clientへ手を加えず、.envを持ち込まない検証checkout＋import前launcher guardで古い静的importを囲む。DB試験はfileParallelism=false相当・worker1でファイル間を直列にし、明示したPromise.all等の自然並列ケースは維持する。最終JSON結果を読み、必須suiteとDB群のskipを検出。期限・異常終了・後片付けを失敗として返す。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- runnerは子プロセス起動をstubした単体試験で順序、flag・危険env拒否、test未発見・skip・終了コード伝播を検証。実integrationは利用者が専用環境で実施。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：ガード失敗時はVitestを起動せず、既存DB試験の同じケースがmanifestで一度だけ実行される。

### 粒度5：空DB・既存データDBへのmigration試験

**目的**：適用成功と履歴・制約・データ保持を自動照合する。

**調査開始ファイル（既存）**

- `prisma.config.ts`：defineConfigのmigrations.path・datasource.url、dotenv/config。CLIの評価前に接続先を確定する。
- `prisma/schema.prisma`：Club・AppUser・ClubMembership・Child・ChildClubMembership・ClubInvitation・ClubEvent／Noticeと関連行・ClubLineSetting／Target／Delivery・StorageDeletionJob・SupportReport・PlatformAdmin。実在する列と制約。
- `tests/club-id-integrity.integration.test.ts`：describeDatabase、beforeAll／afterAll、prismaの静的import。同クラブFK・triggerの既存DB試験。
- `tests/event-practice-batch.flow.integration.test.ts`：enabled・localConfiguration・safeCheck・database・synchronize。flag前のURL未評価、専用client、fixture限定cleanup、自然競合と障害注入を分ける先例。

**依存・前提成果物**：粒度1・4。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/environment.ts`、`vitest.integration.config.mts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：prefix適用で失敗した時は、そのmigration.sqlと直前のschemaだけを読む。DBロールやDDL APIが不明なら `supabase/config.toml` と導入済みpg／Prismaの該当型を確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `tests/mvp/migration-databases.ts`
- `tests/mvp/migrations.integration.test.ts`

**実装内容・境界**

- ローカルSupabase clusterの既存anon／authenticated／postgresロールを確認し、runner所有の新規DBを空DB用とupgrade用に作る。既存postgres DBのschema resetは行わない。
- 空DBへ現在の全migrationをmigrate deployし、_prisma_migrations、主要テーブル・unique・FK・CHECK・trigger・RLS／権限を照合する。storage.objectsへの既存policy削除SQLは対象policyがある時だけ動く点も確認する。
- upgrade用は20260816221153_add_club_app_schemaまでの変更なしコピーを一時migrationディレクトリへ用意しdeploy。最低限の旧形式A/BデータをSQLで投入し、F10まで適用して保持・テナント制約を確認する。current Prismaを古い列へ無理に使わない。
- F10まで到達したupgrade DBへ正当な100件のCOPY_PREVIOUS_MONTH記録を追加し、F11 migrationを適用して既存記録維持・F11 31件上限・操作別対象月を確認する。過去SQLを編集／migrate resolveで適用済み偽装しない。
- 専用clientをdisconnectしてから、接続・権限・prefix・所有manifestが揃ったDBだけをcleanup。他接続を一括terminateせず、解放できない場合は残存を報告する。status確認の期待される未適用終了と本当のエラーを区別する。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 新規DB2つで空→最新、旧データ→F10→F11を実行し、checksum／履歴／行保持／制約拒否を確認。失敗注入で作成DBの範囲外をdropしないこともguard単体で確認。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：既存環境の全件初期化なしに両経路を再現し、migrationのskipや単なるSQL文字列検索を成功扱いにしない。

### 粒度6：イベント・お知らせのDB越境と本人関連行

**目的**：不足するcontent Repositoryの実DB境界を追加する。

**調査開始ファイル（既存）**

- `src/infrastructure/prisma/repositories/club-event-repository.ts`：findClubEventForAdmin・findPublishedClubEventDetail・createClubEvent・updateClubEvent・deleteClubEvent・markClubEventRead・saveClubEventMemo・findClubEventAttachmentForMember／Admin。clubId・公開対象・関連行を追跡する。
- `src/infrastructure/prisma/repositories/club-notice-repository.ts`：findClubNoticeForAdmin／Member・createClubNotice・updateClubNotice・deleteClubNotice・markClubNoticeRead・findClubNoticeAttachmentForMember／Admin。event側と異なる既読仕様も確認する。
- `app/(club-app)/club/[clubSlug]/events/[eventId]/actions.ts`：markClubEventReadAction・saveClubEventMemoAction。公開対象を再取得してから本人の既読・メモを更新する。
- `app/(club-app)/club/[clubSlug]/notice/[noticeId]/actions.ts`：markClubNoticeReadAction。公開対象・本人所属を確認して既読更新。
- `prisma/schema.prisma`：Club・AppUser・ClubMembership・Child・ChildClubMembership・ClubInvitation・ClubEvent／Noticeと関連行・ClubLineSetting／Target／Delivery・StorageDeletionJob・SupportReport・PlatformAdmin。実在する列と制約。
- `tests/club-id-integrity.integration.test.ts`：describeDatabase、beforeAll／afterAll、prismaの静的import。同クラブFK・triggerの既存DB試験。

**依存・前提成果物**：粒度1・2・4。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/database-fixture.ts`、`vitest.integration.config.mts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：既読基準が判断できない時は `domain/club/event/event-policy.ts` と会員側Action、添付IDの変換は `src/application/club/attachment/resolve-attachment-changes.ts` の該当関数、再検証は `domain/club/club-revalidation-paths.ts` を確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `tests/mvp/content-tenancy.integration.test.ts`
- `tests/mvp/content-actions.test.ts`

**実装内容・境界**

- A-only利用者／scopeでBのeventId・noticeIdの取得、編集、削除、既読、メモ、関連ID置換を試し、Bの行・関連行・updatedAtが不変か確認。正常なA操作も対照として成功させる。
- DRAFT、targetRoles対象外、未読OFF／ON、既読基準更新、本人以外のメモを区別。RepositoryのmarkRead／memoはscope契約、Actionは直前の公開対象再取得を担当するため層を混同しない。
- Action直接呼出しはAuth・Next制御の境界だけをstubし、MEMBERの管理Action拒否、hidden clubId混入を確認。HTTP直接POSTの保証は粒度18に残す。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 新規DB suite、unitのAction境界。既存domain/club/event/event-policy.test.ts、src/application/club/attachment/resolve-attachment-changes.test.tsを回帰確認。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：event／notice両方でBの全行非更新、本文・件数・IDの非漏洩、公開対象と本人メモの分離を確認。

### 粒度7：添付Route・実Storage・途中失敗

**目的**：attachmentId越境、署名URL発行前拒否、部分アップロード／削除失敗の状態を検証する。

**調査開始ファイル（既存）**

- `app/(club-app)/club/[clubSlug]/attachments/event/[attachmentId]/route.ts`：GET。requireClubAppAccess→findClubEventAttachmentForMember→createClubAttachmentSignedUrl。拒否時は署名しない。
- `app/(club-app)/club/[clubSlug]/admin/attachments/event/[attachmentId]/route.ts`：GET。管理権限とclubIdで署名URL発行の対象を制限する。
- `app/(club-app)/club/[clubSlug]/attachments/notice/[attachmentId]/route.ts`：GET。会員用お知らせ添付の公開対象とclubIdを確認する。
- `app/(club-app)/club/[clubSlug]/admin/attachments/notice/[attachmentId]/route.ts`：GET。管理者用お知らせ添付のclubIdを確認する。
- `src/infrastructure/storage/club-content-attachment-storage.ts`：uploadClubContentAttachments・createClubAttachmentSignedUrl・deleteClubStorageObject。ローカルStorageと部分アップロード失敗。
- `src/application/club/attachment/resolve-attachment-changes.ts`：resolveAttachmentChanges。既存添付・削除指定・追加ファイルを照合する共通境界。
- `tests/storage-deletion-jobs.integration.test.ts`：storageMocks、describeDatabase、並列claim・期限切れPROCESSING再取得・失敗後COMPLETEDのケース。重複実装を避ける。
- `src/application/club/storage/run-storage-deletion-worker.ts`：runStorageDeletionJobs・processStorageDeletionJob。削除失敗・再試行とclaimTokenによる終端更新。
- `src/infrastructure/prisma/repositories/storage-deletion-job-repository.ts`：claimStorageDeletionJob・completeStorageDeletionJob・failStorageDeletionJob・failExhaustedStorageDeletionJobs。旧claimが新claimを上書きできない。

**依存・前提成果物**：粒度1・2・3・4。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/local-services-fixture.ts`、`vitest.integration.config.mts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：Storage API契約が不明なら導入済みSupabase Storageのtypes解決先、補償pathが不明ならイベント／お知らせのnew・edit ActionのcatchとStorage削除関数だけを追加確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `tests/mvp/attachment-routes.test.ts`
- `tests/mvp/attachment-storage.integration.test.ts`

**実装内容・境界**

- 4つのGET Routeを実際に呼び、認可成功／MEMBER管理URL／他クラブattachmentId／DRAFT／対象外roleを確認。拒否時は署名関数を呼ばない。
- ローカルStorageでprivate PDFのアップロード・署名取得・削除を確認し、unit側の署名stubだけをStorage安全性の証明にしない。
- ネットワーク境界またはStorage SDK境界だけへ途中失敗を注入。保存前の部分アップロード補償、削除失敗Job、元DB transactionのrollbackを照合する。既存並列claim・lease復旧ケースは再利用し、同じ試験を作り直さない。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 4 Routeのunit、専用Storage＋DBの新規suite、既存storage-deletion-jobs.integration.test.ts・pdf-file-validation.test.ts・resolve-attachment-changes.test.ts。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：拒否時にsigned URL・storagePath・B本文を返さず、削除失敗でもJobと元データの状態が期待通りになる。

### 粒度8：LINE設定・webhookKey・targetIdのDB接続境界

**目的**：既存の設定DB／Route mockをつなぐ不足分を検証する。

**調査開始ファイル（既存）**

- `src/infrastructure/prisma/repositories/club-line-setting-repository.ts`：findClubLineSettingsForOwner・updateClubLineTargetForOwner・replaceClubLineRegistrationToken・findClubLineSettingForWebhook・consumeClubLineRegistrationTokenAndUpsertTarget。
- `app/(club-app)/club/[clubSlug]/admin/settings/line/actions.ts`：updateClubLineTargetAction・createClubLineRegistrationCodeAction。OWNERとtargetId・登録コード境界。
- `app/api/line/webhook/[webhookKey]/route.ts`：POST・writeSafeWebhookLog。未加工本文の署名検証と限定した応答・ログ。
- `src/application/club/line/handle-club-line-webhook.ts`：handleClubLineWebhook。webhookKeyで設定を選び、署名・destination・登録コードを同じクラブへ束縛。
- `tests/club-line-setting.integration.test.ts`：通知先のclubId・登録tokenの並列消費と期限の既存DB試験。
- `src/infrastructure/security/line-credential-crypto.ts`：encryptLineCredential・decryptLineCredential。クラブに束縛した偽credential fixtureを作る。

**依存・前提成果物**：粒度1・2・4。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/database-fixture.ts`、`vitest.integration.config.mts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：署名・destination拒否を切り分ける時だけ `src/infrastructure/line/line-webhook.ts` と `src/infrastructure/security/line-credential-crypto.ts` の対象定義、最新targetの検索元を確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `tests/mvp/line-webhook-tenancy.integration.test.ts`

**実装内容・境界**

- A scopeでB targetIdを更新できず、B webhookKeyにA署名／A destination／A登録コードを混ぜてもB通知先を作らない。B keyだけを持つことは権限の代用にならない。
- 有効なB署名＋B登録コードはBへ作成する対照ケースを用意する。登録直後は無効の通知先であり、送信したことにはしない。
- 同じ登録token並列消費・期限・再登録の既存ケースはclub-line-setting.integration.test.tsを再利用。実LINEへ接続せず偽secretで署名を計算する。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 新規DB接続suite、既存tests/club-line-settings-actions.test.ts・tests/club-line-webhook-route.test.ts・src/infrastructure/line/line-webhook.test.ts。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：URL／署名／destination／登録tokenのclub束縛とtargetId更新の非越境を実DBで照合。

### 粒度9：LINE workerの実DB並列・障害試験

**目的**：既存claim実装に不足する実並列・送信失敗・旧claimの試験を追加する。

**調査開始ファイル（既存）**

- `src/application/club/line/send-pending-line-deliveries.ts`：claimDelivery・processDelivery・finishDelivery・sendPendingLineDeliveries・sendClaimableLineDeliveries。PROCESSING・lease・claimToken・試行回数と固定retry key。
- `src/infrastructure/line/line-messaging-api.ts`：sendLinePushMessage・LinePushResult。固定LINE endpoint、409受理扱い、固定エラー。
- `src/infrastructure/security/line-credential-crypto.ts`：encryptLineCredential・decryptLineCredential。クラブに束縛した偽credential fixtureを作る。
- `src/infrastructure/prisma/repositories/club-line-setting-repository.ts`：findClubLineSettingsForOwner・updateClubLineTargetForOwner・replaceClubLineRegistrationToken・findClubLineSettingForWebhook・consumeClubLineRegistrationTokenAndUpsertTarget。
- `prisma/schema.prisma`：Club・AppUser・ClubMembership・Child・ChildClubMembership・ClubInvitation・ClubEvent／Noticeと関連行・ClubLineSetting／Target／Delivery・StorageDeletionJob・SupportReport・PlatformAdmin。実在する列と制約。

**依存・前提成果物**：粒度1・2・4。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/database-fixture.ts`、`vitest.integration.config.mts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：送信結果のstatusやclaim上限が不明なら `src/application/club/line/send-pending-line-deliveries.ts` のclaim／finish、cron呼出し元 `app/api/cron/club-line-deliveries/route.ts` と `tests/cron-routes.test.ts` を追う。LINE worker専用の既存DB試験は未発見である。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `tests/mvp/line-delivery.integration.test.ts`

**実装内容・境界**

- 同じdeliveryIdを2 workerへ同時に渡し、PROCESSINGへの原子的claimでstub送信が1回だけになることを確認。DB成功だけで配送完了とは呼ばない。
- 失敗・timeout・LINE 409、無効target・暗号化credential不一致、lease期限切れ再claim、旧claimTokenの終端更新拒否、有限retry上限を照合。5分sleepせずfixture時刻で期限切れを作る。
- clubId付き送信APIへB deliveryIdを渡すケースとcronの全club処理を分ける。送信中クラッシュは外部exactly-onceを保証せず、同じdelivery.idのretryKeyを維持する契約を検証。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 実Prisma／DB＋sendLinePushMessage境界stub、新規suite。故障は明示注入、自然並列は別ケース。既存tests/cron-routes.test.tsを回帰確認。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：同時claim時1回、再claim時key不変、失敗後DB status・attemptCount・nextAttemptAt・claim解除と他club不変を検証。

### 粒度10：Resend障害とDB状態・機密非出力

**目的**：メール関数の上位stubで未検証なSDK受付境界まで確認する。

**調査開始ファイル（既存）**

- `src/application/club/invitation/send-club-invitation.ts`：inviteClubMember・resendClubInvitation・prepareAndSend。Auth作成・リンク生成・メール・DB記録の途中失敗。
- `src/infrastructure/prisma/repositories/club-invitation-repository.ts`：reserveClubInvitation・claimClubInvitationResend・acceptClubInvitationForUser・findClubInvitationAcceptanceForUser・markClubInvitationEmailSent／Failed。本人・slug・hashと状態を照合。
- `lib/mail/club-invitation-mail.ts`：sendClubInvitationEmail。4xx拒否とtimeout／409／5xxの結果不明、試行別idempotencyKey。
- `src/application/club/support/create-support-report.ts`：createSupportReport・notifySavedReport・logSupportReportFailure。通知失敗でも受付を保持し、原文をログに出さない。
- `lib/mail/support-report-mail.ts`：sendSupportReportEmail。ACCEPTED／FAILED／UNKNOWN、report単位のidempotencyKey。
- `lib/mail/resend.ts`：resend・buildMailFrom。トップレベルSDK生成、production時の必須値、秘密を読み込まない実行環境。
- `tests/club-invitation-acceptance.flow.integration.test.ts`：enabled・localConfiguration、DB＋ローカルAuthのflow、複数flag。既存の承諾フローを再利用する。
- `tests/support-report.flow.integration.test.ts`：enabled・localConfiguration・databaseCase。受付をDB保存してから通知する既存flow。

**依存・前提成果物**：粒度1・2・3・4。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/local-services-fixture.ts`、`vitest.integration.config.mts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：Auth作成後の資源保持が不明なら `src/infrastructure/supabase/club-invitation-auth.ts`、SDK送信型が不明なら導入済みResend 6.12.4のtypesとfetch実装の該当箇所だけを追加確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `tests/mvp/mail-failures.integration.test.ts`

**実装内容・境界**

- 実メール構築・SDK呼出しを使い、fetch等の送信境界だけで成功／明確な4xx拒否／timeout／409／5xxを返す。実Resend APIへ送らない。
- 招待はAuth作成後失敗・SEND_FAILED／SEND_UNKNOWNとclaim解除、サポートは受付保存済みのまま通知失敗／不明を保持する。無条件再送・Authユーザーの安易な削除を行わない。
- 原文・メール・本文・token・URL・Cookie・credentialを固定sentinelで注入し、DBの許可列・結果DTO・loggerを照合。既存F05〜F09の同じ上位stubケースを複製しない。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 新規SDK境界＋実DB suite、既存lib/mail/club-invitation-mail.test.ts・lib/mail/support-report-mail.test.ts・src/application/club/invitation/send-club-invitation.test.ts・src/application/club/support/create-support-report.test.ts。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：4xx拒否と結果不明の分類、DBの保存済み状態、上位自動再送なし、機密非反射を確認。

### 粒度11：Playwright依存・設定・成果物境界

**目的**：承認済みの依存追加を1つのpatchへ限定する。

**調査開始ファイル（既存）**

- `package.json`：scripts・dependencies・devDependencies。既存コマンドと新コマンドを分ける。
- `package-lock.json`：packagesの実解決バージョン。Playwrightの未導入と導入差分を確認する。
- `.gitignore`：既存の.env・生成物除外。認証状態・trace・reportを追跡しない。
- `vitest.config.mts`：resolve.alias、test.include／exclude、node環境。既存試験の分類と互換性。
- `next.config.ts`：headers、allowedDevOrigins、serverActions.bodySizeLimit。HTTPと添付の試験条件。

**依存・前提成果物**：粒度1。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/environment.ts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：導入するPlaywright API・互換性を確定する時だけ導入済みNextのtesting/playwright.md、Playwright公式資料と導入後の型を確認する。既存Playwright関連testは存在しない。

**変更予定の既存ファイル**

- `package.json`
- `package-lock.json`
- `.gitignore`

**新規ファイル案（調査開始ファイルではない）**

- `playwright.config.ts`
- `e2e/smoke.spec.ts`

**実装内容・境界**

- @playwright/testのdevDependency・lock差分だけを追加する。具体バージョンは実装時にNext 16.2.6の導入済みガイドと対応公開資料で確認し固定する。無関係な依存更新を含めない。
- 最初はChromiumの1 project・worker1とし、ケース間でstub故障設定・資源が干渉しないようにする。testDirはe2eで既存Vitestのtests/**と分離し、専用localhost:3000の既存serverを再利用しない。ブラウザーbinary取得は明示したセットアップとして分離する。
- 保存した認証状態・test-results・playwright-report・trace・HARをGit除外。token／Cookieを含む自動trace／動画／スクリーンショットは初期無効、機密が映る失敗artifactを無条件に残さない。
- この時点のsmokeはローカル公開ログイン入口用の最小ケース定義に限定。実起動は粒度12のguard付きrunner適用後とし、それまではtest list／型だけを確認する。

**この粒度では変更しない**：既存パッケージの一括更新、アプリのRoute／認可、ブラウザーbinaryの無断導入。

**実行する確認・テスト**

- lock差分、Vitestがe2e specを収集しないこと、Playwright list、設定型チェック。導入済みNext docs/01-app/02-guides/testing/playwright.md・vitest.mdの必要箇所を参照。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：Playwrightだけの追加としてreviewでき、unitの収集・型と成果物の非追跡が保たれる。

### 粒度12：E2E起動・ローカル送信stub・外向き通信遮断

**目的**：実アプリのサーバー側送信も外部へ出さずにE2Eできるようにする。

**調査開始ファイル（既存）**

- `scripts/validate-env.mjs`：loadEnvConfig・envSchema、本番HTTPS・Resend・CRON必須検証。実行cwdの.env読込みとNODE_ENVを追跡する。
- `supabase/config.toml`：api=54321、db=54322、inbucket=54324、storage・auth、redirect allowlist。ローカルサービスの契約。
- `src/infrastructure/prisma/client.ts`：prisma、Pool、dotenv/configのトップレベル初期化。skip前の副作用に注意する。
- `src/infrastructure/supabase/server.ts`：createClient。cookiesを使う実SSRセッション。
- `lib/mail/resend.ts`：resend・buildMailFrom。トップレベルSDK生成、production時の必須値、秘密を読み込まない実行環境。
- `src/infrastructure/line/line-messaging-api.ts`：sendLinePushMessage・LinePushResult。固定LINE endpoint、409受理扱い、固定エラー。
- `lib/axiom/server.ts`：logInfo・logWarn・logError・flushLogs。外部ログ送信をテスト環境から遮断する。
- `next.config.ts`：headers、allowedDevOrigins、serverActions.bodySizeLimit。HTTPと添付の試験条件。

**依存・前提成果物**：粒度1・3・11。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/environment.ts`、`tests/mvp/local-services-fixture.ts`、`playwright.config.ts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：セッション通信・Next子プロセスで遮断が効かない時は `src/infrastructure/supabase/middleware.ts` と導入済みResend／Supabaseのtransport実装だけを追う。外向き通信を許可して回避しない。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `scripts/test-e2e.mjs`
- `tests/mvp/outbound-preload.mjs`
- `tests/mvp/outbound-stub.mjs`
- `tests/mvp/outbound-harness.test.ts`

**実装内容・境界**

- アプリソースへテスト用HTTP入口や認可bypassを追加せず、runnerが起動した専用Nodeプロセスへpreloaderを明示適用する。ブラウザーのpage.routeだけではサーバーのResend／LINEを止められない。
- 既存Resend SDKとLINEはglobal fetchを利用しているため、正確な送信先だけをローカルstubへ渡す最小境界を作る。未知の外向き送信は拒否し、HTTP非fetch経路を含め実際のSDKで遮断を試験する。検証できなければ安全だと扱わず方式変更案を報告する。
- Supabase Auth／Storageはguard済みloopbackへ通し、Storageの失敗注入は対象runのpath・HTTP操作に限定する。ログ送信credentialを継承せず、stub制御と一時メモリのtokenはloopback・run専用secretで隔離。通常アプリに制御Routeを生やさない。
- 起動するコードはproduction build＋next start。launcherは非productionの検証環境でguardし、Next子プロセスはNODE_ENV=testを渡さずNext標準productionで起動する。既存prebuild／prestartのenv検証を迂回せず、.envなし・許可環境だけで成立することを確認する。
- APP_BASE_URLの既存本番HTTPS制約とローカルHTTPの違いを明記。もし通常のbuild／start手順で成立しない場合は本番検証を緩和せず、TLSの検証用入口等の最小変更案を報告して当粒度を完了にしない。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 架空設定のunit、ローカルstub自己試験、実SDKの送信遮断、child起動失敗・timeout時の停止、秘密を除いたログ、localhost以外のアクセス拒否。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：実Auth／Storageを保ち、実メール・LINE・外部ログを送らずに専用アプリが起動する。guard不成立なら起動しない。

### 粒度13：認証・ロール・プラン・複数所属のE2E

**目的**：mockで未保証な実Cookie・最新認可・role分離を確認する。

**調査開始ファイル（既存）**

- `app/(club-app)/club-login/actions.ts`：loginAction。実Cookie・本人確認・招待再開・所属先への遷移の起点。
- `domain/club/club-login-destination.ts`：getAppEnabledMemberships・getClubLoginDestination。0／複数件は/club/select、1件はそのクラブへ。
- `app/(club-app)/club/club-membership-authorization.ts`：ClubAccessContext・requireActiveClubMembership・requireClubAdminMembership・requireClubOwner。Auth本人＋slug＋ACTIVEからscopeを確定する。
- `app/(club-app)/club/club-app-authorization.ts`：requireClubAppAccess・requireClubAppAdminAccess・requireClubAppOwnerAccess。認可後に利用プランを確認する。
- `domain/club/plan-features.ts`：PLAN_FEATURES・hasClubFeature・requireClubFeature。STANDARDのみCLUB_APP、PROは未有効。
- `app/(club-app)/platform/require-platform-admin.ts`：PlatformAdminAccessContext・requirePlatformAdmin。クラブ所属から独立した有効な運営者の境界。
- `src/infrastructure/prisma/repositories/platform-admin-repository.ts`：findActivePlatformAdminByUserId。isActiveとDEVELOPER／SUPPORTの最新DB照合。
- `proxy.ts`：proxy・config、招待contextのCookie化とセッション更新。正規入口のセキュリティ境界。
- `tests/club-invitation-auth.local.integration.test.ts`：describeLocalAuth・safeCheck・verificationClient、generateLink／verifyOtp／SSR Cookie契約。実Authの既存試験。

**依存・前提成果物**：粒度2・3・11・12。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`scripts/test-e2e.mjs`、`playwright.config.ts`、`tests/mvp/local-services-fixture.ts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：所属分岐やPlatform遷移が期待と異なる時だけ `app/(club-app)/club/select/page.tsx / ClubSelectPage`、`app/(club-app)/platform-login/actions.ts / platformLoginAction`、`proxy.ts` のmatcherを追加確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `e2e/fixtures.ts`
- `e2e/authorization.spec.ts`

**実装内容・境界**

- 実passwordログインから、A全role・B2role、失効／INVITED、未ログイン、STARTER／STANDARD／PROをURL直接アクセスと正常導線で確認する。
- A OWNER／B MEMBERの同一本人はBの公開対象のみ閲覧可能で、B管理権限を持たない。複数所属の/club/selectと所属のないslugを区別する。
- 独立PlatformAdmin、無効PlatformAdmin、一般OWNERを分ける。Platformの意図した複数クラブのサポート閲覧を越境バグ扱いしない。認証stateはシナリオ間で共有して書き換えず、権限変更後の既存Cookieでも最新DBを確認する。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 実ローカルAuth＋Next production serverのE2E。既存tests/club-membership-authorization.test.ts・tests/platform-authorization.test.ts・domain/club/plan-features.test.tsも参照。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：未認証・role・plan・複数所属・Platformの境界をHTTP応答とDB非更新で確認する。

### 粒度14：イベント・お知らせ・PDF・キャッシュのE2E

**目的**：利用者操作とDB・Storage・再検証をつなぎ、content全体を検証する。

**調査開始ファイル（既存）**

- `app/(club-app)/club/[clubSlug]/admin/events/new/actions.ts`：createClubEventAction。再認可→添付準備→DB保存→worker予約→再検証。
- `app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/actions.ts`：updateClubEventAction・retryClubEventLineDeliveryAction。eventId・削除attachmentId・targetId・deliveryIdのscope。
- `app/(club-app)/club/[clubSlug]/admin/events/actions.ts`：deleteClubEventAction。clubId条件付き削除とStorage削除Job、固定ログ・一覧遷移。
- `app/(club-app)/club/[clubSlug]/events/[eventId]/actions.ts`：markClubEventReadAction・saveClubEventMemoAction。公開対象を再取得してから本人の既読・メモを更新する。
- `app/(club-app)/club/[clubSlug]/admin/notice/new/actions.ts`：createClubNoticeAction。お知らせの作成・添付・通知・再検証。
- `app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/actions.ts`：updateClubNoticeAction・retryClubNoticeLineDeliveryAction。noticeIdと関連IDを再確認する。
- `app/(club-app)/club/[clubSlug]/notice/[noticeId]/actions.ts`：markClubNoticeReadAction。公開対象・本人所属を確認して既読更新。
- `app/(club-app)/club/[clubSlug]/attachments/event/[attachmentId]/route.ts`：GET。requireClubAppAccess→findClubEventAttachmentForMember→createClubAttachmentSignedUrl。拒否時は署名しない。
- `app/(club-app)/club/[clubSlug]/attachments/notice/[attachmentId]/route.ts`：GET。会員用お知らせ添付の公開対象とclubIdを確認する。
- `app/(club-app)/club/revalidate-club-paths.ts`：revalidateClubEventPaths・revalidateClubNoticePaths・revalidateClubAccountPaths等。commit後のキャッシュ境界。

**依存・前提成果物**：粒度6・7・13。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`e2e/fixtures.ts`、`tests/mvp/outbound-stub.mjs`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：キャッシュ表示が不明なら `domain/club/club-revalidation-paths.ts` と一覧／詳細Pageの取得元、入力名が不明なら `app/(club-app)/club/[clubSlug]/admin/events/_components/ClubEventForm.tsx` と通知・添付共通Componentだけを確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `e2e/events.spec.ts`
- `e2e/notices.spec.ts`

**実装内容・境界**

- 管理者の下書き→公開→編集→削除とMEMBER表示、対象外role、既読基準の更新、個人メモの本人性、private PDF取得を実ブラウザーで確認する。
- AのslugにBのeventId／noticeId／attachmentIdを混ぜ、管理・会員双方で本文・署名URL・更新を許さない。正常系も同じfixtureで確認する。
- member/admin二つのブラウザーcontextを使い、保存後の一覧・詳細・未読表示更新を再ナビゲーションで照合。Clientの古いDOMだけでcache合格にしない。
- Storage upload失敗・PDF取得失敗・削除Jobの残存をローカル失敗設定で確認する。公開時LINEを選ぶケースも実送信stubで止め、DBとstub受付の境界を分ける。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 新規2 spec、既存domain/club/event/event-policy.test.ts・src/application/club/attachment/resolve-attachment-changes.test.ts、粒度6・7のDB試験を対応付ける。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：画面・HTTP・DB・Storageが一致し、ID混在拒否と再検証が実ブラウザーで成立する。

### 粒度15：OWNER招待・子ども／アカウントのE2E

**目的**：既存DB試験を繰り返さず、実Cookieと操作UIの未接続範囲を確認する。

**調査開始ファイル（既存）**

- `app/(club-app)/club/[clubSlug]/admin/members/actions.ts`：updateClubMembershipAction。OWNER再認可と対象membershipId。
- `src/infrastructure/prisma/repositories/club-membership-repository.ts`：updateClubMembershipForOwner、Serializable・最大3回retry、最新actorとACTIVE OWNER数。
- `tests/club-membership-repository.integration.test.ts`：createClubFixture、最後のACTIVE OWNERの拒否、2 OWNER並列降格。既存の実DB保証。
- `app/(club-app)/club/[clubSlug]/admin/members/invitation-actions.ts`：inviteClubMemberAction・resendClubInvitationAction・cancelClubInvitationAction。OWNER限定操作。
- `src/application/club/invitation/accept-club-invitation.ts`：acceptClubInvitation。OTP／passwordのAMR、パスワード更新後の承諾失敗・結果不明を区別する。
- `app/(club-app)/club-invitations/accept/actions.ts`：acceptExistingClubInvitationAction。既存アカウントの正規承諾経路。
- `app/(club-app)/welcome/actions.ts`：completeClubInvitationAction。新規招待のパスワード設定と承諾。
- `tests/club-invitation-acceptance-repository.integration.test.ts`：mockの試験群と実DB群、同一招待2並行、取消・再送・期限処理との競合。ファイル名だけでmock／DBを混同しない。
- `app/(club-app)/club/[clubSlug]/account/actions.ts`：updateAccountNameAction・createChildAction・updateChildAction・addChildToClubAction・withdrawChildFromClubAction。hidden clubId・childId改変を確認する。
- `src/infrastructure/prisma/repositories/club-child-repository.ts`：findChildActor・createChildForUser・updateChildForUser・addChildToClubForUser・withdrawChildFromClubForUser。parentIdと最新所属を照合する。
- `tests/club-account.flow.integration.test.ts`：enabled・localConfiguration・databaseCase、複数クラブ・本人／子ども・最新所属とfixture限定cleanup。

**依存・前提成果物**：粒度13・10。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`e2e/fixtures.ts`、`tests/mvp/outbound-stub.mjs`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：子どもの所属状態の許否が不明なら `domain/club/account/child-membership-policy.ts`、招待AMRが不明なら `src/infrastructure/supabase/club-invitation-session.ts` と対応する既存Auth testを確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `e2e/members-invitations.spec.ts`
- `e2e/account-children.spec.ts`

**実装内容・境界**

- OWNERの招待→ローカルAuthリンク→新規／既存ユーザーの承諾と、MEMBERによるOWNER管理画面拒否。最後のOWNERをUI操作でも失わせない。DB並列降格・二重承諾は既存suiteを再利用する。
- A招待token＋B slug、他人Cookie、旧token、既存ユーザーの複数所属を確認。tokenはメモリだけで受け渡し、trace・URLログへ保存しない。
- 本人の子どもの作成・編集・クラブ追加／退会と、他保護者childId・B membershipId・hidden clubId混入を拒否。正当にAB所属する同じ子の追加は許可し、全B子を一律拒否という誤った期待値にしない。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 新規2 spec、既存tests/club-members-actions.test.ts・tests/club-invitation-acceptance-actions.test.ts・tests/club-account-actions.test.ts・tests/club-child-repository.test.ts。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：本人／保護者／OWNERの実操作だけが成功し、Bまたは他保護者の行が変わらない。

### 粒度16：LINE設定・Webhook・サポート／PlatformのE2E

**目的**：targetId・webhookKey・運営者権限を実HTTPで確認する。

**調査開始ファイル（既存）**

- `app/(club-app)/club/[clubSlug]/admin/settings/line/actions.ts`：updateClubLineTargetAction・createClubLineRegistrationCodeAction。OWNERとtargetId・登録コード境界。
- `app/api/line/webhook/[webhookKey]/route.ts`：POST・writeSafeWebhookLog。未加工本文の署名検証と限定した応答・ログ。
- `src/application/club/line/handle-club-line-webhook.ts`：handleClubLineWebhook。webhookKeyで設定を選び、署名・destination・登録コードを同じクラブへ束縛。
- `tests/club-line-setting.integration.test.ts`：通知先のclubId・登録tokenの並列消費と期限の既存DB試験。
- `src/application/club/support/create-support-report.ts`：createSupportReport・notifySavedReport・logSupportReportFailure。通知失敗でも受付を保持し、原文をログに出さない。
- `app/(club-app)/platform/support/actions.ts`：updateSupportReportStatusAction・updateSupportReportNoteAction。PlatformAdmin再認可と更新競合。
- `app/(club-app)/platform/require-platform-admin.ts`：PlatformAdminAccessContext・requirePlatformAdmin。クラブ所属から独立した有効な運営者の境界。
- `tests/support-report.flow.integration.test.ts`：enabled・localConfiguration・databaseCase。受付をDB保存してから通知する既存flow。
- `tests/platform-support.flow.integration.test.ts`：enabled・localConfiguration、PlatformAdmin再認可と管理操作の既存flow。

**依存・前提成果物**：粒度8・9・10・13。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`e2e/fixtures.ts`、`tests/mvp/outbound-stub.mjs`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：Platformの意図した横断範囲・更新競合が不明なら `src/infrastructure/prisma/repositories/platform-support-report-mutation-repository.ts`、通知先の選択は `src/infrastructure/prisma/repositories/club-line-target-repository.ts` を追う。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `e2e/line-settings.spec.ts`
- `e2e/support-platform.spec.ts`

**実装内容・境界**

- OWNERの登録コード発行、偽LINE署名による正規webhook登録、通知先の有効化と他クラブtargetId拒否を確認。実LINEのjoinや配送を必要条件にしない。
- A/Bのkey・secret・destination・登録tokenの入替をAPIRequestContextで試し、公開応答とDB非更新を照合。PlatformAdminにLINE設定権限が暗黙に付くと想定しない。
- 会員のサポート受付、Resend失敗でも受付保持、運営者のみ一覧・状態／メモ更新、一般OWNER拒否を確認。報告者の機密と内部メモの会員非表示を確認する。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 新規2 spec、粒度8・9・10のDB結果、既存tests/club-line-webhook-route.test.ts・tests/platform-support-actions.test.ts。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：通知のstub受付とDB状態を分け、一般所属とPlatformの権限を実HTTPで照合する。

### 粒度17：F10・F11の実ブラウザー受入を自動化

**目的**：既存実装とDB試験を維持したまま、残っているUI受入を埋める。

**調査開始ファイル（既存）**

- `app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/actions.ts`：copyPreviousMonthEventsAction。F10の既存保存・再検証・固定管理者遷移。
- `app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/actions.ts`：previewEventPracticeBatchAction・createEventPracticeBatchAction。F11の既存preview／保存契約。
- `app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchForm.tsx`：EventPracticeBatchForm・SelectionForm・beginSave。入力変更・再送snapshot・needsReload。
- `tests/event-month-copy.flow.integration.test.ts`：enabled・localConfiguration・safeCheck。100件、replay、実並列、rollback、RLS等の既存F10試験。
- `tests/event-practice-batch.flow.integration.test.ts`：enabled・localConfiguration・safeCheck・database・synchronize。flag前のURL未評価、専用client、fixture限定cleanup、自然競合と障害注入を分ける先例。
- `app/(club-app)/club/revalidate-club-paths.ts`：revalidateClubEventPaths・revalidateClubNoticePaths・revalidateClubAccountPaths等。commit後のキャッシュ境界。

**依存・前提成果物**：粒度13・14。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`e2e/fixtures.ts`、`tests/mvp/outbound-stub.mjs`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：期待する表示・再送の意味が不明なら `docs/runbooks/event-month-copy.md`・`docs/runbooks/event-practice-batch.md` の対応表と、各forms.test.tsの同じシナリオだけを追加確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `e2e/event-month-copy.spec.ts`
- `e2e/event-practice-batch.spec.ts`

**実装内容・境界**

- 表示月の入口→preview→明示選択→DRAFT作成→管理者status=ALL・固定toastを確認。自動公開・PDF・LINE・既読なし、timezone表示・除外・既存一致を照合する。
- 連打・入力変更直後の旧preview禁止、通信断後同payload／requestId確認、保存済みneedsReloadを実ブラウザーのイベントで確認。結果不明時は新previewを使わない。
- 100件／31件のDB上限、replay・F10↔F11のID衝突・rollback・自然並列は既存flowのまま実行し、同じDBシナリオを再実装しない。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 新規2 spec、既存tests/event-month-copy-forms.test.ts・tests/event-practice-batch-forms.test.ts・各flow統合試験。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：F10・F11の既存運用書の該当UI受入を自動ケースへ対応付け、skipを成功扱いにしない。

### 粒度18：直接Action POST・Origin・機密非出力

**目的**：画面の非表示やVitest直接呼出しだけでは不足する攻撃境界を検証する。

**調査開始ファイル（既存）**

- `app/(club-app)/club/club-membership-authorization.ts`：ClubAccessContext・requireActiveClubMembership・requireClubAdminMembership・requireClubOwner。Auth本人＋slug＋ACTIVEからscopeを確定する。
- `app/(club-app)/club/[clubSlug]/admin/events/new/actions.ts`：createClubEventAction。再認可→添付準備→DB保存→worker予約→再検証。
- `app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/actions.ts`：updateClubEventAction・retryClubEventLineDeliveryAction。eventId・削除attachmentId・targetId・deliveryIdのscope。
- `app/(club-app)/club/[clubSlug]/admin/notice/new/actions.ts`：createClubNoticeAction。お知らせの作成・添付・通知・再検証。
- `app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/actions.ts`：updateClubNoticeAction・retryClubNoticeLineDeliveryAction。noticeIdと関連IDを再確認する。
- `app/(club-app)/club/[clubSlug]/admin/members/actions.ts`：updateClubMembershipAction。OWNER再認可と対象membershipId。
- `app/(club-app)/club/[clubSlug]/admin/settings/line/actions.ts`：updateClubLineTargetAction・createClubLineRegistrationCodeAction。OWNERとtargetId・登録コード境界。
- `app/(club-app)/club/[clubSlug]/account/actions.ts`：updateAccountNameAction・createChildAction・updateChildAction・addChildToClubAction・withdrawChildFromClubAction。hidden clubId・childId改変を確認する。
- `next.config.ts`：headers、allowedDevOrigins、serverActions.bodySizeLimit。HTTPと添付の試験条件。
- `proxy.ts`：proxy・config、招待contextのCookie化とセッション更新。正規入口のセキュリティ境界。
- `lib/axiom/server.ts`：logInfo・logWarn・logError・flushLogs。外部ログ送信をテスト環境から遮断する。

**依存・前提成果物**：粒度14・15・16・17。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`e2e/fixtures.ts`、`tests/mvp/outbound-preload.mjs`、`tests/mvp/outbound-stub.mjs`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：実POSTのwire形式・Origin拒否を実証できない時は、導入済みNextのdata-security・更新処理に関する該当ガイドとインストール済み実装／型、実際に捕捉した要求を必要範囲だけ確認する。秘密を含む要求をログに出さない。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `e2e/action-requests.ts`
- `e2e/action-boundaries.spec.ts`
- `e2e/failure-observability.spec.ts`

**実装内容・境界**

- 正規画面から得た実Next Action要求をメモリで捕捉し、MEMBERのCookieや他クラブのCookieで直接POST。Next-Action IDや暗号化bind payloadをハードコードしない。
- eventId・noticeId・attachmentId・membershipId・childId・targetId・招待context／token・hidden clubIdの改変を、各正当な操作との対照付きで確認する。署名済みbind自体の改変拒否と、アプリのscope拒否を別に記録。
- 不正Originの拒否応答だけでなくDB／Storage／送信stubの非更新を確認。allowedDevOriginsをServer Action受入試験の代用にしない。
- Resend・LINE・Storageの故障時sentinelをDTO・HTML／RSC・stdout／stderr・logger・許可DB列で点検。トークン付き要求を含むPlaywright標準失敗表示・trace・添付をそのまま保存しない。
- 対策不足を見つけたら赤い試験を弱めない。既存ソース修正を勝手に混ぜず、最小再現・影響範囲・別patch案を報告する。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 新規HTTP／故障spec、tests/club-line-settings-actions.test.ts・tests/club-members-actions.test.ts・tests/club-account-actions.test.ts・tests/event-practice-batch-actions.test.ts・tests/platform-support-actions.test.tsを役割別に参照。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：主要IDの攻撃を実HTTPで拒否し、Origin拒否と機密非反射の証跡を秘密なしで残す。

### 粒度19：verify:mvp・必須suiteと失敗伝播

**目的**：全検証を一度の明示コマンドで完了判定する。

**調査開始ファイル（既存）**

- `package.json`：scripts・dependencies・devDependencies。既存コマンドと新コマンドを分ける。
- `scripts/validate-env.mjs`：loadEnvConfig・envSchema、本番HTTPS・Resend・CRON必須検証。実行cwdの.env読込みとNODE_ENVを追跡する。
- `vitest.config.mts`：resolve.alias、test.include／exclude、node環境。既存試験の分類と互換性。
- `prisma.config.ts`：defineConfigのmigrations.path・datasource.url、dotenv/config。CLIの評価前に接続先を確定する。
- `tests/event-practice-batch.flow.integration.test.ts`：enabled・localConfiguration・safeCheck・database・synchronize。flag前のURL未評価、専用client、fixture限定cleanup、自然競合と障害注入を分ける先例。
- `tests/club-invitation-auth.local.integration.test.ts`：describeLocalAuth・safeCheck・verificationClient、generateLink／verifyOtp／SSR Cookie契約。実Authの既存試験。

**依存・前提成果物**：粒度4〜18。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`tests/mvp/suite-manifest.ts`、`scripts/test-integration.mjs`、`scripts/test-e2e.mjs`、`vitest.mvp-unit.config.mts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：前提粒度のmanifest／runnerの実exportと起動契約、scripts/validate-env.mjsの実行cwdやNODE_ENVで挙動が変わった場合だけ追加確認する。まだない関数名を仮定して接続しない。

**変更予定の既存ファイル**

- `package.json`

**前提適用後に変更するファイル**：`tests/mvp/suite-manifest.ts`（粒度1の新規案。各suiteを実在確認後に必須化する）。

**新規ファイル案（調査開始ファイルではない）**

- `scripts/verify-mvp.mjs`
- `tests/mvp/verify-mvp.test.ts`

**実装内容・境界**

- packageへtest:e2e・verify:mvpを追加。test:integrationは粒度4の入口を再利用し、全コマンドをF12ガードの配下に置く。
- 仕様順の環境変数→Prisma→migration→lint→typecheck→unit→integration→E2E→production buildを実行。E2Eはproduction buildを要するためE2E内部で事前buildし、末尾buildも維持する。初期MVPでは二度のbuildを許容し、認可やHTTPS検証を緩める最適化はしない。
- Prisma Client生成はschema検証後・型チェック前。migrationの空／upgrade試験は粒度5の別DBで行い、E2E fixture用DBは既存履歴を非破壊deployしてから使う。
- case0・必須suite未発見・必須DB／E2E skip・失敗・タイムアウト・cleanup失敗はnonzero。既存F10／F11のguardを通った事実だけでDB合格にしない。
- 環境・ビルド・suite毎の成否と件数、自然競合／注入故障の区別を記録。秘密やDB URLを出さず、子プロセスを終了しfixtureと所有資源だけをcleanupする。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- runnerをstubしたverify-mvp.test.tsで順序、各段階nonzero停止、skip／欠落、build二段階、cleanup、signalを検証。最終フル実行は専用環境で実施。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：一つの必須検証でも未実施ならverify:mvp成功にならず、全必須suiteとproduction build成功を集約できる。

### 粒度20：運用書・受入matrix・未解決事項

**目的**：適用可能なpatchとMVP全受入完了を区別して記録する。

**調査開始ファイル（既存）**

- `package.json`：scripts・dependencies・devDependencies。既存コマンドと新コマンドを分ける。
- `supabase/config.toml`：api=54321、db=54322、inbucket=54324、storage・auth、redirect allowlist。ローカルサービスの契約。
- `tests/event-practice-batch.flow.integration.test.ts`：enabled・localConfiguration・safeCheck・database・synchronize。flag前のURL未評価、専用client、fixture限定cleanup、自然競合と障害注入を分ける先例。
- `tests/club-membership-repository.integration.test.ts`：createClubFixture、最後のACTIVE OWNERの拒否、2 OWNER並列降格。既存の実DB保証。
- `tests/club-invitation-acceptance-repository.integration.test.ts`：mockの試験群と実DB群、同一招待2並行、取消・再送・期限処理との競合。ファイル名だけでmock／DBを混同しない。
- `tests/storage-deletion-jobs.integration.test.ts`：storageMocks、describeDatabase、並列claim・期限切れPROCESSING再取得・失敗後COMPLETEDのケース。重複実装を避ける。
- `tests/event-month-copy.flow.integration.test.ts`：enabled・localConfiguration・safeCheck。100件、replay、実並列、rollback、RLS等の既存F10試験。

**依存・前提成果物**：粒度19。依存粒度で作成した実在ファイルとexport・fixture契約を適用後に確認する。


**前提適用後に追加で読むファイル（現在は新規案）**：`scripts/verify-mvp.mjs`、`tests/mvp/suite-manifest.ts`。その実装のexport・fixture契約・関連testを確認する。

**必要時だけ確認**：既存の受入表との対応が不明な時だけ `docs/runbooks/event-practice-batch.md`・`docs/runbooks/event-month-copy.md`・該当フェーズのrunbookと、実際のsuite manifestを確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案（調査開始ファイルではない）**

- `docs/runbooks/mvp-verification.md`

**実装内容・境界**

- セットアップ、Playwright例外承認、専用checkout・ローカルSupabase・browser準備、migration／fixture／cleanup順、3コマンドの実行条件と終了コードを記載。
- F12.mdの全実装範囲・受入条件→既存／新規unit・DB・E2E suiteの対応、10種の越境IDとrole／plan、並列・外部障害・機密非出力を受入表にする。
- 本番データ／本番配送／本番Auth削除を使わず、テスト環境であっても専用資源以外を消さない。失敗や中断時の保留・残存報告、未確認SDK／ブラウザー／DBを区別する。
- 既存F10・F11等のrunbookの手動受入項目を参照し、既存仕様書をまとめて書き換えない。調査で見つかった不具合は別patch／F12外依存として追跡する。

**この粒度では変更しない**：本番ソース、Prisma schema・過去migration、実環境・配送。

**実行する確認・テスト**

- 参照パス・関数・manifest・package script・受入matrixを静的照合、git diff --check。新しいコードtestは追加しない。

- 共通：新規ソース／テストの型・対象lint、ガード単体、git diff --check。実DB・E2Eは実行許可された使い捨て環境で行い、patch作成時の未実行を明記する。

**完了条件**：全受入項目の根拠と実行結果／未実行が追跡でき、テスト追加だけでMVP完成と宣言しない。

## 7. DB・Prismaの変更

アプリのschema列・enum・業務DB制約の追加は計画しない。
既存の同クラブ整合・SetNull・unique・CHECK・RLS／revoke・ledgerを再利用する。
F12のDDLは、明示的な専用cluster内でrunnerが所有するmigration試験用DBの作成・削除に限定する。
既存のpostgres DB、Auth schema、Storage schemaをresetしない。過去migrationの編集は禁止する。

空DB試験は、ローカルSupabaseが備えるclusterロールと、アプリテーブルが空であることを分ける。
単に現在schemaで作ったDBへqueryが通ることを「空DBからmigration成功」とは扱わない。
upgrade試験は旧prefixをdeployし、旧形式データ投入後に未適用履歴を実際にdeployする。
既存migrationには `storage.objects` policy探索やpostgresロール向けdefault privilege変更があるため、
汎用PostgreSQLへSupabase前提を省略して適用できるとは断定しない。
根拠：`prisma/migrations/20260817003046_remove_club_images_storage_policies/migration.sql`、
`20260816224901_revoke_public_data_api_access/migration.sql`、F01・F10・F11 migration。

## 8. ユーザー操作からDBまでの実際の検証対象

| 操作 | 現在のファイル・関数、入力→出力 | DB・外部副作用／F12の検証 |
| --- | --- | --- |
| ログイン・クラブ選択 | `app/(club-app)/club-login/actions.ts / loginAction` → `find-active-club-memberships.ts / findActiveClubMemberships` → `domain/club/club-login-destination.ts / getClubLoginDestination`。メール・password→実Auth本人・Cookie・所属先 | Authセッション。DB所属を読取。E2Eは実Cookieと所属分岐を確認 |
| 認可 | `club-membership-authorization.ts / requireActiveClubMembership` → `club-app-authorization.ts / requireClubAppAccess／requireClubAppAdminAccess／requireClubAppOwnerAccess`。slug・Auth本人→ClubAccessContext | 最新ACTIVE所属・role・plan読取。UI以外にAction／Route直接アクセスでも確認 |
| イベント・お知らせ管理 | `admin/events/new/actions.ts / createClubEventAction`・`admin/notice/new/actions.ts / createClubNoticeAction` → 添付解決 → `club-event-repository.ts / createClubEvent`・`club-notice-repository.ts / createClubNotice`。共通入力・File・選択ID→保存結果・固定遷移 | 本体／添付／LINE予約をtransaction、Storageは外部。失敗時の補償とJob、commit後の再検証を照合 |
| 会員の詳細・既読・メモ | `events/[eventId]/actions.ts / markClubEventReadAction／saveClubEventMemoAction`・`notice/[noticeId]/actions.ts / markClubNoticeReadAction`。IDと認可context→公開対象の再取得・本人操作結果 | ClubEventRead／ClubNoticeRead／ClubEventMemo。Bや他人の行を更新しない |
| PDF取得 | 4つのattachments RouteのGET → findClubEventAttachmentForMember／findClubEventAttachmentForAdmin／findClubNoticeAttachmentForMember／findClubNoticeAttachmentForAdmin → `club-content-attachment-storage.ts / createClubAttachmentSignedUrl`。attachmentId・認可context→短期署名URL | DB読取→ローカルStorage署名。拒否時に署名なし、公開URL化なし |
| メンバー・招待 | `admin/members/actions.ts / updateClubMembershipAction` → updateClubMembershipForOwner。招待はinvitation-actions→inviteClubMember／resendClubInvitation、承諾はacceptClubInvitation→acceptClubInvitationForUser | OWNER不変条件、招待claim、実Auth・メール受付・DBの非原子的境界。最後OWNER・二重承諾は既存DB試験も使用 |
| 本人・子ども | `account/actions.ts` → `src/application/club/account/update-club-account.ts / updateClubAccountName／createClubChild／updateClubChild／addClubChild／withdrawClubChild` → `club-child-repository.ts / updateChildForUser／addChildToClubForUser／withdrawChildFromClubForUser`。childIdと本人scope→限定結果 | 他保護者childIdを拒否。本人のAB所属は正当に扱う。ChildはclubIdを持つテーブルではない |
| LINE登録・配信 | `api/line/webhook/[webhookKey]/route.ts / POST` → handleClubLineWebhook → consumeClubLineRegistrationTokenAndUpsertTarget。送信はsendPendingLineDeliveries→claimDelivery→sendLinePushMessage→finishDelivery | club束縛tokenとtarget、PROCESSING lease、retryKey、SENT／FAILED等。外部LINEはstub、DBは実接続 |
| Storage復旧 | `run-storage-deletion-worker.ts / runStorageDeletionJobs` → claimStorageDeletionJob → deleteClubStorageObject → completeStorageDeletionJob／failStorageDeletionJob | Jobのlease・旧claim・再試行、objectの実ローカル削除。既存DBケースを再利用 |
| サポート・運営者 | createSupportReport→保存→sendSupportReportEmail。PlatformはrequirePlatformAdmin→管理Service／Repository | 通知失敗で受付保持。Platformの意図した横断管理と、一般会員の越権を区別 |
| F10・F11 | copyPreviousMonthEventsAction／createEventPracticeBatchAction → 各Service／Repository | DRAFT群＋ClubEventBatchOperationの一体保存。既存DB試験は再利用し、browser未確認分をE2Eで追加 |

上表の短縮パスの完全なパスは調査一覧・各粒度に記載した。
F12自体は業務操作を新設しない。試験基盤とfixtureは後続粒度で接続する。

## 9. テナント越境・roleの受入matrix

全ケースで、正常なA操作／正当なB操作を対照として成功させ、拒否が単なる壊れたfixtureでないことを確認する。
拒否は特定HTTP statusだけで判定せず、本文・限定DTO・署名URLの非漏洩とDB／Storage／送信の非更新を照合する。

| 対象 | 攻撃・対照 | 主担当粒度・既存根拠 |
| --- | --- | --- |
| clubSlug | A-only CookieでBへ。A OWNER／B MEMBERの本人はBの管理権限を継承しない | 13・18、requireActiveClubMembership |
| eventId | A slug＋B IDで管理編集／削除・会員詳細／既読／メモ | 6・14・18、club-event-repositoryのclubId条件 |
| noticeId | A slug＋B IDで管理編集／削除・詳細／既読 | 6・14・18、club-notice-repositoryのclubId条件 |
| attachmentId | event／notice・member／adminの4 Routeと添付削除指定でB ID | 7・14・18、4 GETとresolveAttachmentChanges |
| membershipId | A OWNERからB所属の更新、一般MEMBERから管理Action直接POST | 15・18、updateClubMembershipForOwner、既存owner integration |
| childId | 他保護者のIDで編集／追加／退会。本人の合法なAB所属は成功 | 15・18、findChildActor＋parentId、既存account flow |
| targetId | A OWNERのLINE設定・通知選択にB targetを混入 | 8・9・16・18、updateClubLineTargetForOwner、配信scope |
| invitation token | B slug＋A token、別Auth本人、旧token、改変context | 15・18、acceptClubInvitationForUser、既存acceptance suite |
| webhookKey | B keyへA signature／destination／登録tokenを混入 | 8・16、handleClubLineWebhook |
| hidden clubId | 正常フォームにB clubIdを追加・書換え、previousState／bindも改変 | 6・15・18、各Actionの認可context由来scope |
| role・status・plan | OWNER／COACH／OFFICER／MEMBER、ACTIVE以外、STARTER／STANDARD／PRO、認可後のDB変更 | 13・18、PLAN_FEATURESと最新DB認可 |
| PlatformAdmin | 一般OWNERは不可、独立PlatformAdminは意図したサポート横断管理のみ可 | 13・16・18、requirePlatformAdmin |

## 10. 設計書との相違・危険箇所・F12外の依存

- F12.mdの「DB integration基盤を追加」は基盤ゼロの意味ではない。既存Vitest・DB／Auth／flow試験を使い、不足する共通guard・集約・横断試験を追加する。
- proposals2.mdのLINEはMVPのclaim機構を将来扱いにしている箇所があるが、現コードのclaimDeliveryはPROCESSING・claimToken・leaseを既に実装。SENDINGや新キューをF12で追加しない。
- ClubEvent／Notice本体の通常作成に厳密なAction全体の冪等性を保証する仕様ではない。一般保存の連打で必ず1件という新要件を作らず、LINE／PDFとF10／F11の既存契約を区別する。
- RLSはPrisma接続roleによってbypassされる。anon／authenticatedの権限metadataと、アプリのclubId／本人認可を別に試験する。管理clientのquery成功だけでRLS合格にしない。
- 古いintegrationの静的共有client importとdotenvはskip前に評価される。安全な専用cwd・launcher guardなしで通常のnpm testを「副作用なし」と断定しない。
- Playwrightのbrowser側routingだけではNext serverのResend／LINEをstubできない。粒度12で実SDKを含む遮断を先に実証する。実秘密値を渡さない、外向き通信を許可しない。
- ローカルAuthの現在site_urlはLANアドレスだが、additional_redirect_urlsにはloopbackの3000／welcomeがある。メールリンクのhostが外向きへfallbackしないことをlocal fixtureで確認する。既存supabase/config.tomlを勝手に変更しない。
- 現行env validatorのproduction HTTPS必須と、ローカルE2EのHTTPは区別が必要。Node／Nextの標準NODE_ENVを歪めず、起動可否を粒度12で検証する。成立しない場合は設定変更の理由と最小案を報告する。
- production E2Eはbuildが前提。F12.mdのbuild末尾という順序を維持するため事前build＋末尾buildを初期案とした。未確認の既存ビルドの再利用はしない。
- CLI 7.9.1／Client 7.8.0の互換、Docker／local Supabase稼働、CREATE DATABASE権限、browser binary／OS依存は未確認。Playwright以外の依存追従更新はF12の例外承認範囲に含まれない。
- 通知のACCEPTED／SENTは外部APIの受付を示す。実受信者への配送確認や外部SLAをstub結果から保証しない。
- 本体の不具合や機密ログが試験で見つかっても、本計画の新規testと混ぜて既存機能を広く修正しない。再現と最小修正案を別途報告する。
- 性能改善、HPの新テナント移行、課金／PRO有効化、LINE新キュー、一括公開等はF12外。

## 11. 実行状況・未確認事項

今回の調査ではファイル名・参照・該当本文・型／モデル・package／lock・導入済みNext docsを確認した。
.env・実秘密値・生成済みPrisma Clientは読んでいない。
実DB・Auth・Storage・外部送信・migration・browserは操作していない。
unit／DB／E2E／buildの成功証跡は今回取得していない。過去の試験の存在を成功と書かない。

新規helperの具体export、Playwrightの採用版・ブラウザーbinary、Next Action要求の実形式、
production serverでのpreloader遮断、local Auth redirect・Storage bucket、migration各prefixの実適用は、
それぞれ該当粒度で実コード／型／専用環境により確定する。関数名や実行成功を推測で埋めない。

### 自己確認

- F12の基盤・検証に限定し、別フェーズの本体機能は変更予定に含めていない。
- OWNER・招待・Storage・F10／F11等の既存DBケースはmanifestで再利用し、同じ試験を新設しない。
- 現時点で実在する変更予定ファイルはpackage.json・package-lock.json・.gitignoreで、いずれも実際に読んだ。粒度19のmanifest更新は粒度1の新規案を適用後に読む前提とした。
- 新規案を既存の調査開始ファイルと分け、前提成果物は適用後の確認対象として明記した。
- 呼び出し元、認可、Repository、schema、Storage／メール／LINE境界、再検証、関連テストを追跡した。
- 不明点・相違・F12外依存を未確認または別提案とし、推測した既存ファイル名・関数名で補っていない。
