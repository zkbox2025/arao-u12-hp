<!-- docs/implementation/phases/F06-granular-plan.md -->

# F06実装粒度計画

## 1. 前提と今回の調査結果

調査基準はブランチ `feat/club-app-foundation`、コミット `d40cdaf`（`feat:F06準備`）。
調査開始時の `git status --short` は空だった。この作業では計画書だけを編集し、
ソース、Git index、依存関係、DB、Auth、メールは変更しない。

優先順位は `AGENTS.md`、`docs/implementation/phases/F06.md`、現在のコードの順に考慮する。
`CLAUDE.md` の内容は `@AGENTS.md` であり、別の開発規則はなかった。

指定された `docs/proposal2.md` は存在しない。
代わりに、ファイル名検索で見つかった `docs/proposals2.md` の招待、ログイン、初回設定、
INVITEDの扱いだけを背景資料として参照した。指定資料と同一であるかは未確認であり、
古い記述を現行仕様として採用しない。

### 今回確定した仕様

ユーザー確認により、**既存アカウントはパスワードを再設定せず、ログインして承諾する**。
新規アカウントは `/welcome` で初回パスワードを設定してから承諾する。
`F06.md` の「パスワード更新後にDB承諾」は新規アカウントに適用し、粒度1で明文化する。

ただし、現在のDBには「初回パスワード設定済み」を示す項目がない。
AppUserは新規招待の準備でも作成されるため、AppUserの存在では区別できない。
また、invite認証後にはメール確認済みになるので、`email_confirmed_at` だけでも区別できない。
根拠は `send-club-invitation.ts` の招待準備処理、`club-invitation-auth.ts` の
`ClubInvitationAuthUser`、`schema.prisma` の `AppUser`。

既存アカウントの承諾では、検証済みのパスワード認証セッションを根拠にする方針とする。
既存SDKの `getClaims()` と `JwtPayload.amr` が候補である。
JWTの単純なdecode、未検証の `getSession().user`、URL、cookie内の自己申告モードは使わない。
実際のローカルAuthが返すAMRを粒度5で確認し、確認できないセッションはログインへ案内する。
AMRで安全に判定できない場合は、実装を進める前に代替の本人認証契約を報告する。
初回設定済みフラグや署名鍵を推測で追加する計画にはしない。

### 実装済み・一部実装・未実装

| 区分 | 現在の状態 | 根拠 |
| --- | --- | --- |
| 実装済み | OWNERによる招待・再送・取消・PREPARING復旧、Authリンク生成、Resend配送 | `src/application/club/invitation/send-club-invitation.ts`、`cancel-club-invitation.ts`、`recover-club-invitation.ts` |
| 実装済み | 新規向け `/welcome?clubSlug=...&token=...`、既存向け `/club-invitations/accept?clubSlug=...&token=...` のURL契約 | `app/(club-app)/club/[clubSlug]/admin/members/invitation-actions.ts` の `buildClubInvitationLinks`、`tests/club-invitation-actions.test.ts` |
| 実装済み | token生成・SHA-256ハッシュ、24時間のアプリ招待期限 | `src/infrastructure/security/token.ts` の `createSecureToken` / `hashToken`、`domain/club/invitation/invitation-policy.ts` |
| 一部実装 | 本人ID・クラブ・hash・状態・期限・INVITEDの照合 | `club-invitation-repository.ts` の `findUsableClubInvitationByTokenHash`。現在のAuth email照合と理由別結果がなく、承諾更新もしない |
| 一部実装 | 承諾可否の状態判定 | `isUsableClubInvitation`。READY_TO_SEND / SENT / EMAIL_FAILEDを許可するが、本人照合まで保証する関数ではない |
| 一部実装 | Auth confirmとセッション更新 | `app/(club-app)/auth/confirm/route.ts` の `GET` はrecovery専用。`proxy.ts` のmatcherに `/welcome` と `/club-invitations` がない |
| 一部実装 | パスワード入力の既存UI・共通エラー表示 | `club-login/reset-password/ResetPasswordForm.tsx`。既存Actionは最小8文字のみで、更新後global signOutするため初回設定には流用できない |
| 実装済み | 通常ログイン、ACTIVE所属のみ取得、クラブ件数別の遷移、クラブ内認可 | `loginAction`、`findActiveClubMemberships`、`getClubLoginDestination`、`requireActiveClubMembership` |
| 未実装 | `/welcome` と `/club-invitations/accept` のPage・フォーム・Action、招待セッションの受け渡し、ログイン後の招待再開 | ファイル名・URL・呼び出し元を `rg` で追跡。既存の受入画面・Actionは見つからなかった |
| 未実装 | パスワード設定と承諾を調整するService、InvitationとMembershipの原子的な承諾更新 | ApplicationとRepositoryのexport・参照を確認。受取人用の書込APIは見つからなかった |
| 未実装 | F06専用の単体・Route・Action・DB承諾・ブラウザ受入テスト | 既存F05テストは送信・復旧・照合まで。login / reset / confirmの専用テストも検索では見つからなかった |

## 2. 調査した主要ファイルと確認した記号

以下は実在を確認して関連箇所を読んだファイル。新規作成候補は各粒度で別記する。

| ファイル | 確認した関数・型・モデル・設定と判断への影響 |
| --- | --- |
| `AGENTS.md`、`CLAUDE.md` | 認証・認可の再確認、クラブ条件、ログ、patchの一時環境検証、Next.jsローカル資料優先 |
| `docs/implementation/phases/F06.md` | invite認証、raw token除去、三者照合、一回限り更新、受入条件 |
| `docs/proposals2.md` | 7-18初回設定、既存ユーザー招待、ログイン、INVITEDのactivation限定。背景に限定 |
| `prisma/schema.prisma` | `Club`、`AppUser`、`ClubInvitation`、`ClubMembership`、各status enum、uniqueとrelation |
| `types/prisma.ts` | Prismaモデル・enumの型だけの再export。生成済みClientは本文調査しない |
| `prisma/migrations/20260817214524_add_club_invitation_active_email_unique/migration.sql` | 有効な招待状態に対する `(clubId, lower(email))` 部分unique |
| `prisma/migrations/20260926084449_f01_enforce_club_scope_integrity/migration.sql` | 招待と所属の同一クラブ制約、clubId不変のtrigger |
| `prisma/migrations/20261009000000_f05_invitation_processing_lease/migration.sql` | `claimToken` / `leaseExpiresAt` のnull組合せCHECK、claim unique、email正規化の事前確認 |
| `src/infrastructure/prisma/repositories/club-invitation-repository.ts` | `findUsableClubInvitationByTokenHash`、`ownerTransaction`、`claimClubInvitationResend`、`cancelClubInvitation`、送信結果記録。OWNER専用transactionを受取人向けに弱めない |
| `src/infrastructure/prisma/repositories/club-membership-repository.ts` | `findClubMembershipsForOwner`、`updateClubMembershipForOwner`。招待承諾としてのactivationはない |
| `domain/club/invitation/invitation-policy.ts` と同 `.test.ts` | `isUsableClubInvitation`、TTL、再送間隔。既存の承諾可能状態を再定義しない |
| `domain/club/invitation/invitation-form.ts` | 招待入力と役割。パスワード入力とは別の契約 |
| `domain/club/member/member-update-policy.ts` | `evaluateClubMembershipUpdate`、`isActiveClubOwner`。通常の会員編集でINVITEDをACTIVE化しない |
| `src/application/club/invitation/send-club-invitation.ts` | `inviteClubMember` / `resendClubInvitation`、`ClubInvitationLinkBuilder`、`SendClubInvitationResult`、新規・既存の送信分岐 |
| `app/(club-app)/club/[clubSlug]/admin/members/invitation-actions.ts` | `buildClubInvitationLinks`、`inviteClubMemberAction`、`resendClubInvitationAction`、`cancelClubInvitationAction` |
| `src/infrastructure/supabase/club-invitation-auth.ts` と同 `.test.ts` | `generateClubInvitationAuthLink`、`getClubInvitationAuthUserById`、`ClubInvitationAuthUser`。管理APIのリンク生成と受取人セッション確立を区別 |
| `app/(club-app)/auth/confirm/route.ts` | `GET`、`createSafeRedirect`。recoveryを維持しながらinvite対応を追加する必要がある |
| `src/infrastructure/supabase/server.ts` | `createClient`。RSC向けにcookie書込失敗をcatchするので、inviteのcookie確立成功をこれだけで判断しない |
| `src/infrastructure/supabase/client.ts` | browser用 `createClient`。呼び出し元検索では実利用が見つからなかった。暗黙のURL認証処理を前提にしない |
| `src/infrastructure/supabase/middleware.ts`、`proxy.ts` | `updateSession`、`proxy`、matcher、request/responseへのcookie反映。redirectでSupaのSet-Cookieを落とさない |
| `app/(club-app)/club-login/actions.ts`、同 `page.tsx` / `LoginForm.tsx` | `loginAction`、`LoginActionState`、`LoginForm`。招待再開は未対応。ログイン済みPageも通常の所属先へ直ちに遷移する |
| `app/(club-app)/club-login/reset-password/actions.ts`、同 `page.tsx` / `ResetPasswordForm.tsx` | `resetPasswordAction`、入力・エラー・表示切替のパターン。初回設定でglobal signOutしない |
| `app/(club-app)/club/find-active-club-memberships.ts` | `findActiveClubMemberships`。取得対象をINVITEDまで広げる変更はしない |
| `domain/club/club-login-destination.ts` と同 `.test.ts` | `getClubLoginDestination`、`ClubLoginMembership`。通常の0 / 1 / 複数所属、プラン判定を維持 |
| `app/(club-app)/club/club-membership-authorization.ts` | `requireActiveClubMembership`、管理者・OWNER認可。招待受取人の認可とは異なる |
| `app/(club-app)/club/[clubSlug]/layout.tsx`、`app/(club-app)/club/select/page.tsx` | ACTIVE・プラン条件、共通フッター、ログイン済み選択画面。初回設定をACTIVE必須layout配下に置かない |
| `app/(club-app)/club/revalidate-club-paths.ts` | `revalidateClubMemberPaths`。既存のメンバー管理・アカウント再検証を呼べる |
| `domain/club/club-revalidation-paths.ts` と同 `.test.ts` | `getClubMemberRevalidationPaths` はadmin/membersとaccount。club/selectは含まない |
| `domain/shared/action-state.ts`、`request-id.ts`、`email.ts`、`domain-error.ts` | `ActionState`、`createInitialActionState`、`createRequestId` / `isRequestId`、`normalizeEmail`、`DomainError`。requestIdは認証でもDBの一回限り保証でもない |
| `src/infrastructure/security/token.ts` と同 `.test.ts` | `createSecureToken` / `hashToken`。raw tokenを保存せず照合する |
| `src/infrastructure/logging/sanitize-log-context.ts` | 許可キー方式。ただし許可キーへ秘密の文字列を渡せば漏れるため、固定operation / result等だけを渡す |
| `app/(club-app)/club/admin/_components/FieldErrorList.tsx`、`FormErrorAlert.tsx` | `FieldErrorList`、`FormErrorAlert` のprops。新フォームで再利用可能 |
| `app/(club-app)/club/admin/_hooks/useScrollToFormError.ts` | `useScrollToFormError` のstate契約とエラー後フォーカス |
| `tests/club-invitation-actions.test.ts` | 実認可とmock境界、URL契約、Next.js制御例外、秘密を含むエラーの試験 |
| `tests/club-invitation-repository.integration.test.ts` | 実transaction、並行再送・取消、照合、rollback、fixtureの作成・後片付け |
| `tests/club-invitation-schema.integration.test.ts` | DB制約・同一クラブtrigger・RLS・lease CHECK・部分uniqueの確認 |
| `tests/club-membership-authorization.test.ts` | session / ACTIVE / role境界を差し替える認可テストのパターン |
| `tests/club-invitation-auth.local.integration.test.ts` | 実SDK・loopback限定・明示flag、invite tokenの再発行 / 使用済み拒否。ブラウザのCookie往復は未検証 |
| `docs/runbooks/club-member-invitations.md` | F05の到達点、確定URL、Auth期限との差、F06が未接続である旨 |
| `package.json`、`package-lock.json`、`vitest.config.mts`、`next.config.ts` | scripts・実解決版・Vitest node / server-only alias・既存Next設定 |
| `supabase/config.toml` | ローカルwelcome許可URL、OTP期限3600秒、minimum_password_length=6、password_requirements空。秘密ファイルは読んでいない |

### バージョンとローカルAPI資料

package.jsonの範囲指定だけでなく、lockとインストール済みメタ情報を照合した。

| パッケージ | 確認した解決版 |
| --- | --- |
| Next.js / React | 16.2.6 / 19.2.4 |
| `@supabase/ssr` / `@supabase/supabase-js` | 0.10.3 / 2.112.3 |
| `@prisma/client` / Prisma CLI | 7.8.0 / 7.9.1。package.jsonはいずれも `^7.8.0` |
| Zod / Vitest | 4.4.3 / 4.1.10 |

Prisma CLIとClientの版差は記録し、F06でパッケージを更新しない。
生成・実DBでの互換性は未実行のため未確認。

`node_modules/next/dist/docs/` は存在した。必要なcookies / proxy / headers / redirectの資料を参照した。
各patchでも変更APIに対応する箇所だけ確認する。

- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`：
  `await cookies()`、RSC描画中のset/delete禁止、streaming前にRoute Handler / Server Functionで書く。
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`：
  ProxyはNode.js runtimeが既定。runtime設定を追加しない。Server Function自身の認証・認可が必要。
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md`：
  Referrer-Policyと応答ヘッダー。実応答のCache-Controlも確認する。
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`：
  redirectの制御例外を一般エラーとして握り潰さない。

SDKの例外的な追加調査は次の関連箇所だけとした。
`@supabase/auth-js` の `GenerateLinkProperties`、`JwtPayload`、`AMREntry`、
`getClaims` / `getUser` / `setSession` / `refreshSession` / `exchangeCodeForSession` の型と、
SSR clientのflowType / detectSessionInUrl設定を確認した。
SSR clientはPKCE既定であり、admin.generateLinkの戻りをそのまま自動処理できるとは判断しない。
implicitのfragmentとPKCEのcodeを混同せず、実ブラウザでの戻り形式は粒度5・10の確認対象とする。

## 3. 共通の実装境界

1. F05の送信・再送・取消・復旧・確定URLを作り直さない。配送APIも追加しない。
2. クライアントのclubId、userId、role、invitationId、status、戻り先URLを認可根拠にしない。
   `clubSlug` とhashも未信頼の検索入力であり、DBのクラブ・招待・所属と本人を照合する。
3. Pageでの検査だけでなく、各Actionと書込直前のRepositoryでも再確認する。
4. 正当な本人だけに詳しい失効理由を返す。他人には招待の有無、招待email、氏名を開示しない。
5. raw token、hash、Auth token、Cookie、パスワード、メール本文・アドレス、SDK生エラーをログへ出さない。
6. パスワード・Auth tokenはActionStateやClient propsへ返さない。
7. DB承諾は一つのtransaction。Authの更新はその外であり、両者を一つのtransactionとは表現しない。
8. OWNER用transactionや既存ACTIVE認可を緩めず、受取人向けの小さな処理を追加する。
9. 変更予定ファイルと調査開始ファイルは別物。新規候補名はすべて**新設案**で、既存関数名ではない。
10. 「この粒度では変更しない」は読み取り禁止ではない。整合性確認で追加調査してよい。
    対象外の変更が必要なら理由と計画変更案を報告してから範囲を確定する。

## 4. 粒度一覧と依存関係

| 粒度 | 目的 | 先行粒度 | 適用直後の到達点 |
| --- | --- | --- | --- |
| 1 | 新規・既存の契約、入力・本人照合・結果型 | なし | Domainと仕様が確定。画面は未接続 |
| 2 | 受取人向けの理由別読取Repository | 1 | 本人に限定した表示用情報を取得可能 |
| 3 | 条件付き更新によるDB承諾 | 1・2 | 実DBで一回限り保証。外部へ未接続 |
| 4 | 招待context cookie、URL除去、Proxy・応答保護 | 1 | raw tokenを画面処理へ持ち回らない入口 |
| 5 | inviteセッション確立・認証方法判定 | 2・4 | recoveryを維持したAuth confirmと専用bridge |
| 6 | 読取・初回設定・既存承諾のApplication Service | 2・3・5 | AuthとDBの順序・失敗結果が確定 |
| 7 | 再認証・再照合を行う承諾Server Action | 4・6 | 直接呼び出しも保護された操作境界 |
| 8 | ログイン前後の招待再開 | 4・5・6 | 既存アカウントが通常の所属先へ逸れず戻れる |
| 9 | `/welcome` と既存アカウント承諾のPage・フォーム | 5・7・8 | ユーザー操作から承諾まで接続 |
| 10 | ローカル統合受入・運用手順 | 1〜9 | F06全体の検証手順・結果・制約が揃う |

順番に適用するpatchを想定し、各patchは適用済み先行粒度を基準に作成する。
新規Pageの公開接続は粒度9。途中の粒度をF06完了とは扱わない。

## 5. 各粒度の実装計画

### 粒度1：仕様・入力・結果契約

**目的**：既存アカウントの再設定不要を明文化し、責務ごとの型を先に揃える。

**調査開始ファイル**

| 既存ファイル | 確認対象と理由 |
| --- | --- |
| `docs/implementation/phases/F06.md` | パスワード設定の適用対象と受入条件。今回のユーザー回答を反映 |
| `domain/club/invitation/invitation-policy.ts` | `isUsableClubInvitation`。既存の承諾可能状態を再利用 |
| `domain/club/invitation/invitation-policy.test.ts` | 状態・期限境界の既存テストを重複させない |
| `domain/club/invitation/invitation-form.ts` | 既存招待入力の役割・メール制約との区別 |
| `domain/shared/action-state.ts`、`domain/shared/email.ts` | `ActionState`、`normalizeEmail`。秘密の値をstateに保持しない契約 |
| `prisma/schema.prisma`、`types/prisma.ts` | 実際のstatus型、nullableなauthUserId / membershipId、AppUserに初回設定フラグがないこと |
| `vitest.config.mts` | node環境、Domainテストの検出設定 |

**変更予定の既存ファイル**：`docs/implementation/phases/F06.md`。
既存ユーザーはログイン後に承諾し、初回設定だけにパスワード更新条件を適用する旨を追記する。

**新規ファイル案**

- `domain/club/invitation/acceptance-form.ts`
- `domain/club/invitation/acceptance-form.test.ts`
- `domain/club/invitation/acceptance-policy.ts`
- `domain/club/invitation/acceptance-policy.test.ts`

新設案の `WelcomeActionState` は `values: {}` とし、password / confirmationは保持しない。
passwordは8文字以上で英字・数字を各1文字以上含み、確認値と完全一致を検査する。
記号は禁止しない解釈案とし、全角変換・trimなどでパスワード自体を変更しない。
「英数字のみ」という制限を意図する場合は実装前に仕様を訂正する。

新設案の受取人判定・結果型は、有効、期限切れ、取消、承諾済み、本人不一致、
所属不整合、処理失敗を区別する。状態の可否は既存 `isUsableClubInvitation` を利用する。
Auth user ID・正規化email・Membership.userIdの照合は別の条件として明示する。

**必要時だけ確認**：エラー型を既存Serviceと共通化する場合だけ
`domain/shared/domain-error.ts` と呼び出し元を追う。
認証方法の判断に必要なSDK型は粒度5で確認し、この粒度でSDKをDomainへimportしない。

**この粒度では変更しない**：既存の招待入力、送信・復旧、PW再設定、DB、Auth、Page。

**完了条件・テスト**：新規PWの境界、不一致、非文字列、英字のみ・数字のみ、記号を含む値、
メール正規化、本人IDの不一致、状態境界の追加部分を単体試験する。
既存 `invitation-policy.test.ts` も実行し、F05の状態契約を維持する。
後続へ渡すDTO・結果型と新規／既存の認証根拠を文書化する。

### 粒度2：受取人向け読取Repository

**目的**：照合結果と画面用最小DTOを取得する。単なるnullを失効理由と推測しない。

**調査開始ファイル**

| 既存ファイル | 確認対象と理由 |
| --- | --- |
| `src/infrastructure/prisma/repositories/club-invitation-repository.ts` | `findUsableClubInvitationByTokenHash`、`assertTokenHash`、安全なDBエラー変換。既存APIの互換性を維持 |
| `prisma/schema.prisma`、`types/prisma.ts` | Club.slug、招待・所属・AppUserのrelation、selectできる実在項目 |
| `domain/shared/email.ts` | Auth emailとInvitation.emailの正規化 |
| `tests/club-invitation-repository.integration.test.ts` | 同関数の既存呼出し、wrong club / Auth、fixture・cleanup・flag |
| `tests/club-invitation-schema.integration.test.ts` | 同一クラブ・unique制約の前提 |
| `package.json`、`vitest.config.mts` | 新規DBテストを通常実行時skipし、専用実行へ登録する場所 |

**変更予定の既存ファイル**

- `src/infrastructure/prisma/repositories/club-invitation-repository.ts`
- `package.json`：`test:db` の対象追加だけ。依存パッケージとlockは変更しない。

**新規ファイル案**：`tests/club-invitation-acceptance-repository.integration.test.ts`。
このファイルを粒度3でも拡張する。

新設案の `findClubInvitationAcceptanceForUser` は、slug・hash・検証済みAuth ID/emailを受け取る。
DBのClub、Invitation、Membershipの同一クラブ・同一userを確認し、現在のAuth emailと招待emailを照合する。
表示用DTOはクラブ名・正規のslug・表示状態など必要最小限とする。
Action用内部IDとブラウザへ渡すDTOを分け、hashやAuth IDをClientへ露出しない。
AppUserのemail欠損・不整合を見つけても、本人情報を自動修復しない。

理由別判定で、他Authユーザーに招待の状態やemailを返さない。
一致した本人に限り、取消・期限切れ・承諾済みを区別する。
本人照合後に終端状態を判定し、それから所属を検査する。
取消済みはmembershipが削除され得るため、所属欠損だけを先に見て理由を取り違えない。
既存の `findUsableClubInvitationByTokenHash` はF05テストの契約を維持し、意味を変更しない。
調査時点ではこの関数の呼び出しはRepository統合テストにあり、Applicationからの呼び出しは見つからなかった。

**必要時だけ確認**：relation条件やemail制約が判断できない場合だけ、該当migrationと
`src/infrastructure/prisma/prisma-error.ts` の `convertPrismaError` を追う。
`findUsableClubInvitationByTokenHash` の参照をrgで再確認し、追加の利用者があれば互換性を検査する。

**この粒度では変更しない**：承諾更新、Auth、cookie、OWNER用処理、Prismaモデル・migration。

**完了条件・テスト**：有効3状態、PREPARING拒否、期限ちょうどの拒否、hash / slug / Auth ID / email違い、
email欠損、membership欠損・他クラブ・他user・非INVITED、本人にだけ理由が返ること。
読取でDBを書き換えない。通常のVitest実行でDB接続しない。
DB実行は専用環境が許可されたときだけ行う。

### 粒度3：DBの一回限り承諾

**目的**：InvitationのACCEPTED化とMembershipのACTIVE化を一つのtransactionで確定する。

**調査開始ファイル**

| 既存ファイル | 確認対象と理由 |
| --- | --- |
| `src/infrastructure/prisma/repositories/club-invitation-repository.ts` | `ownerTransaction`、`cancelClubInvitation`、`claimClubInvitationResend`、`markClubInvitationEmailSent`、粒度2の受取人読取API |
| `prisma/schema.prisma` | `acceptedAt`、status、membershipId、claimToken / leaseExpiresAt、uniqueとrelation |
| `domain/club/invitation/invitation-policy.ts` | 承諾可能状態と期限の共通定義 |
| `tests/club-invitation-repository.integration.test.ts` | 並行実行、失敗注入、rollback、既存leaseとの競合の試験方法 |
| `tests/club-invitation-schema.integration.test.ts` | CHECK、同一クラブtrigger、既存制約を破らないこと |
| `vitest.config.mts`、`package.json` | DB試験の明示実行・通常時skip |

先行粒度で新設する読取API・DBテストも、この粒度の開始時に読む。

**変更予定の既存ファイル**

- `src/infrastructure/prisma/repositories/club-invitation-repository.ts`
- 粒度2で新設した `tests/club-invitation-acceptance-repository.integration.test.ts`

**この粒度での新規ファイル案**：なし。schema / migrationも追加しない。

新設案の `acceptClubInvitationForUser` は、本人ID/email、hash、slugと現在時刻を受け取る。
transaction内で招待と所属の関係を再照合し、両方を条件付き更新する。
本番の判定時刻はDB更新直前に取得し、Auth更新前に保存した時刻を使い続けない。
時刻注入は境界テスト用とし、クライアントからは受け取らない。

- Invitation：本人・クラブ・hash・未承諾・期限内・承諾可能状態を条件にし、
  `status=ACCEPTED`、`acceptedAt=now` へ更新する。
- Membership：対象id・clubId・userId・`status=INVITED` を条件に `status=ACTIVE` へ更新する。
- 各更新件数が1でなければthrowして全体をrollbackする。
  Membershipを更新してから失敗しても、ACTIVEだけが残らない。
- terminalな招待に送信claimが残らないよう、既存CHECKを守ってclaim / leaseを両方解除する。
  旧送信処理がACCEPTEDをSENTへ戻せないことも確認する。
- role・他クラブ所属・AppUser・既存Authユーザーは変更しない。

Serializable競合を再試行する場合は、既存方針に合わせた回数制限を付ける。
**再試行対象はDB処理だけ**。Auth更新をtransactionの再試行内へ入れない。
OWNER認可用の `ownerTransaction` を流用して認可を弱めず、受取人条件を明示する。

**必要時だけ確認**：Prismaの更新条件・エラーコードが不明な場合だけ、既存の型と
エラー変換先を追う。DB制約が足りないと判明したら、migrationの理由と影響を報告して計画を改訂する。

**この粒度では変更しない**：Auth password、送信lease設計、会員編集の状態遷移、画面・Action。
受取人用lease・キュー・汎用transaction基盤を将来用に追加しない。

**完了条件・テスト**：同一招待2並行で成功1件、使用済み拒否、途中失敗のrollback、
取消・再送・期限切れ・送信結果記録との競合、Auth ID/email・クラブ違いを実DBで試験する。
別クラブ所属のstatus / roleが変わらないことを確認する。
既存F05 Repositoryテストも回帰実行する。

### 粒度4：URLから一時contextへの交換

**目的**：F05の確定URLを受け、raw tokenを繰り返しURLへ載せずに認証・ログインへ渡す。

**調査開始ファイル**

| 既存ファイル | 確認対象と理由 |
| --- | --- |
| `proxy.ts` | `proxy`、matcher。新しい入口のGETだけを処理する |
| `src/infrastructure/supabase/middleware.ts` | `updateSession`。返すresponse cookieを維持する |
| `src/infrastructure/security/token.ts`、同 `.test.ts` | raw token形式と既存 `hashToken` の利用 |
| `next.config.ts` | 招待関連パスだけにReferrer-Policy等を追加する場所 |
| `app/(club-app)/club/[clubSlug]/admin/members/invitation-actions.ts` | `buildClubInvitationLinks` のクエリ名・URL契約を読むだけ |
| `tests/club-invitation-actions.test.ts`、`vitest.config.mts` | 既存URLテスト、NextResponse等のnode試験方法 |
| `package.json`、`package-lock.json` | 実版を再確認して対応するNextローカル資料を読む |

**変更予定の既存ファイル**：`proxy.ts`、`next.config.ts`。

**新規ファイル案**

- `src/infrastructure/security/club-invitation-context.ts`
- `src/infrastructure/security/club-invitation-context.test.ts`
- `tests/club-invitation-entry.test.ts`

新設案のcontext codec / cookie処理で、raw tokenとslugの型・長さ・形式・重複queryを検査する。
既存 `hashToken` を利用し、hash・slug・ランダムなcontextIdを短時間のhost限定HttpOnly cookieに格納する。
SameSite=Lax、productionではSecure、Pathを必要な認証・招待導線で読めるよう設定する。
有効期間は15分を初期案とし、期限後は元メールから入り直す。

contextIdは別タブで別招待を開いたときの取り違え防止用で、認証の証明ではない。
表示時に渡したcontextIdと送信時cookieのcontextIdが違えば、別招待を承諾せず再表示を求める。
token/hashや本人IDをhiddenに入れる代わりに、この非秘密の識別子で表示との対応だけを確認する。

このcookieは未信頼の検索contextであり、本人確認・DBの有効期限判定を代行しない。
署名なしの値を認可根拠にせず、改変・延長されてもDBとAuthの照合で拒否できる設計にする。
「初回設定済み」などの権限・証明を格納しない。新しい秘密鍵や環境変数も追加しない。

Proxyは対象GETのqueryを検査・交換し、tokenなしの固定した同一路線へredirectする。
元のcookie更新を全て引き継ぐ。認証が必要な最終的な招待有効性は粒度2・6で判定する。
不正なqueryは値を反射せず固定のエラー導線にする。POSTをGET入口と同様にredirectしない。
GETでMembershipのACTIVE化やパスワード更新を行わない。

`/welcome`、`/club-invitations/accept` の初回応答・遷移後とconfirm応答を
no-store / no-referrerで保護する。Page側の動的描画は粒度9で接続する。
Authのfragmentはサーバーに届かないため、この粒度では処理せず粒度5へ渡す。

**必要時だけ確認**：cookie引継ぎやmatcherの仕様が不明な場合は、
Nextローカルのproxy / cookies / headers資料の該当箇所だけ読む。
redirectを挟んだfragment保持は粒度5・10で実ブラウザ確認する。

**この粒度では変更しない**：F05のURL生成・メール、Authの本人認証、DB、Page、共有Supabase middleware。
middlewareの変更が不可避なら、共有のHP認証への影響と最小変更案を先に報告する。

**完了条件・テスト**：正規query・不正形式・多重query・cookie改変・期限切れ・異常サイズ、
固定遷移先、matcher、POST非転送、Supabase複数cookieの保持、応答ヘッダーを試験する。
別タブの新しい入口でcontextIdが変わり、古い表示を識別できることも試験する。
raw値をLocation・レスポンス本文・例外・ログへ返さない。
メールアクセス元の最初のURLをインフラログから消せる保証はせず、粒度10の運用確認に残す。

### 粒度5：invite認証セッションと認証方法の確認

**目的**：既存メールの認証結果をサーバーのSupabase cookieへ安全に反映し、
初回invite認証と既存のパスワードログインを区別する。

**調査開始ファイル**

| 既存ファイル | 確認対象と理由 |
| --- | --- |
| `app/(club-app)/auth/confirm/route.ts` | `GET`、`createSafeRedirect`。recoveryの成功・失敗先を維持 |
| `src/infrastructure/supabase/server.ts`、`client.ts`、`middleware.ts` | SSR cookie書込、既存clientのflow、session refresh。RSCで書けない点を確認 |
| `src/infrastructure/supabase/club-invitation-auth.ts` | `generateClubInvitationAuthLink`。メールがアプリconfirmへ直接来るとは仮定しない |
| `tests/club-invitation-auth.local.integration.test.ts` | 明示flag・loopback、実invite token確認の前提 |
| `src/infrastructure/supabase/club-invitation-auth.test.ts` | ID/email照合・安全なエラー処理の既存パターン |
| `vitest.config.mts`、`package.json`、`package-lock.json` | 型・SDK版、専用実Auth試験の実行条件 |
| `supabase/config.toml` | welcome redirect許可、ローカル設定。秘密ファイルを読まない |

粒度2の読取APIと粒度4のcontextも開始時に読む。

**変更予定の既存ファイル**

- `app/(club-app)/auth/confirm/route.ts`
- `tests/club-invitation-auth.local.integration.test.ts`：招待セッション・AMRの実SDK確認を追加

**新規ファイル案**

- `src/infrastructure/supabase/club-invitation-session.ts`
- `src/infrastructure/supabase/club-invitation-session.test.ts`
- `app/(club-app)/welcome/InvitationAuthBridge.tsx`
- `tests/club-invitation-confirm.test.ts`

先にローカルAuthの戻り形式を確かめる。現在のF05メールはSupabase actionLinkで認証して
`/welcome` へ戻るため、confirmのGETに `type=invite` を足すだけでは接続が成立しない。
基本案は、welcomeの専用bridgeがfragmentを読み、即座に `history.replaceState` で除去し、
必要なaccess / refresh tokenを同一originのconfirm POSTのbodyだけに渡す構成とする。
Auth tokenをquery、localStorage、ActionState、DOM表示へ保存しない。
bridgeのPage接続は粒度9。ブラウザclientの暗黙のURL検出に依存しない。

confirm POSTはinvite専用の処理として追加し、既存recovery GETは維持する。
Originと送信形式を制限し、context・Auth本人・DB招待の一致を確認してからcookieを確定する。
既存sessionが別ユーザーの場合、黙ってそのアカウントを置き換えず、切替の案内を返す。
受け取ったaccess tokenとrefresh後のuserが同一であることも検査する。
検査中のcookie変更は一旦保持し、失敗時に認証cookieを付けた成功応答を返さない。
既存のRSC用catchをcookie書込成功の根拠にしない。

PKCEのcodeが実際に返る構成なら、code_verifierの成立を確認してから専用処理を選ぶ。
codeがないのに `exchangeCodeForSession` を呼ぶ、またはPKCE clientがimplicitを
自動処理すると推測する実装はしない。現行F05契約では接続できないと分かった場合、
送信側を書き換える前に理由・必要な最小変更・粒度変更案を報告する。

新設案の `getVerifiedClubInvitationSession` は、Authの `getUser` で現本人emailを取得し、
同じsessionの検証済みclaimsとsubを照合する。
`getClaims()` の `amr` がpasswordを証明すれば、既存アカウントの再設定不要ルートへ進める。
invite認証だけではパスワード設定済みと判断しない。
AMR欠損・未知形式は安全側へ倒し、既存ユーザーにはパスワードログインを案内する。
SDKが許容する `string[]` と `AMREntry[]` の双方を検討し、未検証JWTのdecodeで代用しない。

**必要時だけ確認**：インストール済みSDKの該当メソッド型・flow設定を確認する。
型と実SDK試験で解決できないAPI仕様だけ公式Supabase資料を読む。
Nextはローカルcookies / Route Handler / redirectの必要箇所を読む。

**この粒度では変更しない**：パスワード更新、承諾DB更新、F05メール・管理Auth生成API、
共有のPW再設定Action、HPの認証設定、依存パッケージ。

**完了条件・テスト**：invite成功、別人、偽token、access / refresh不一致、期限切れ、
origin不一致、cookie保存失敗、秘密を含むSDKエラー、固定遷移、recovery回帰。
password AMRあり／なし／欠損／型違いとsub不一致を単体試験する。
実AMRと実戻り形式の確認を後続の認証分岐を公開する前の必須条件とする。
実Auth試験は許可された使い捨てローカルだけで実行し、実メールは送らない。

### 粒度6：承諾Application Service

**目的**：入力・本人・招待状態を確認し、新規だけAuth passwordを更新してDB承諾へ進める。

**調査開始ファイル**

| 既存ファイル | 確認対象と理由 |
| --- | --- |
| `src/application/club/invitation/send-club-invitation.ts`、同 `.test.ts` | typed result・外部依存境界の既存パターン。送信機能は変更しない |
| `src/infrastructure/prisma/repositories/club-invitation-repository.ts` | 粒度2・3の読取・一回限り更新、DB失敗の返し方 |
| `src/infrastructure/supabase/server.ts` | ユーザーのsessionで更新し、admin権限で任意ユーザーを操作しないこと |
| `domain/shared/domain-error.ts` | 安全な公開メッセージと外部エラーの分離 |
| `src/infrastructure/logging/sanitize-log-context.ts` | 固定のoperation / resultだけを記録する境界 |
| `vitest.config.mts` | Service単体試験の設定 |

粒度1のDomain、粒度5の認証adapterとテストも開始時に読む。

**変更予定の既存ファイル**：粒度5で新設した
`src/infrastructure/supabase/club-invitation-session.ts` と同テスト。
認証済み本人の `auth.updateUser({ password })` を行う小さなadapterを追加する。

**新規ファイル案**

- `src/application/club/invitation/get-club-invitation-acceptance.ts`
- `src/application/club/invitation/get-club-invitation-acceptance.test.ts`
- `src/application/club/invitation/accept-club-invitation.ts`
- `src/application/club/invitation/accept-club-invitation.test.ts`

新設案の `getClubInvitationAcceptance` は、認証済み本人とcontextから読取DTOを組み立てる。
新設案の `acceptClubInvitation` は以下を調整する。

1. 本人の現在のID/emailと認証方法、context、Domain入力を検査する。
2. 最新の招待を読んでから外部操作へ進む。無効な招待ではpasswordを更新しない。
3. 新規の初回設定だけpasswordをAuthへ更新する。既存のpassword認証済み利用者では呼ばない。
4. 粒度3のRepositoryで、書込時点の期限・状態・本人を再確認して承諾する。
5. 成功ならDB由来の正規clubSlugを返し、失敗なら型付きの安全な結果を返す。

Auth成功・DB失敗は部分成功として区別する。DBがrollbackしてもpasswordは戻らない。
再試行の案内を返し、既に設定できたpasswordによるログイン後の再承諾を可能にする。
タイムアウトでAuth結果が不明な場合も成功・失敗を断定せず、勝手に自動更新を繰り返さない。
パスワードは結果・ログ・例外contextに含めない。

**必要時だけ確認**：Authのpassword更新が再認証を要求した場合だけSDK型と公式仕様を確認する。
共有reset-passwordのActionを呼ぶ方法には変更しない。

**この粒度では変更しない**：UI、Action、ログイン、送信・会員編集、DBスキーマ、
外部サービスを含む汎用transaction / リトライ基盤。

**完了条件・テスト**：新規はAuth→DBの順序、既存ではAuth更新0回、
入力不正・本人不一致・失効では更新0回、Auth失敗でDB更新0回、
Auth成功DB失敗、結果不明、同時承諾でDB成功1回、秘密を含む例外の非公開を試験する。
Auth更新の全体一回限り性まではDBの条件付き更新で保証できない点を残余リスクとして明記する。

### 粒度7：Server Action

**目的**：画面を経由しない直接呼び出しでも同じ認証・招待照合を実行する。

**調査開始ファイル**

| 既存ファイル | 確認対象と理由 |
| --- | --- |
| `app/(club-app)/club/[clubSlug]/admin/members/invitation-actions.ts` | requestId、既知エラー、安全なcatch、redirect制御の既存流儀 |
| `tests/club-invitation-actions.test.ts` | 実認可を残すmock、直接呼び出し、制御例外・秘密の試験 |
| `app/(club-app)/club-login/reset-password/actions.ts` | PWをActionStateに残さないパターン。global signOutは流用しない |
| `domain/shared/action-state.ts`、`domain/shared/request-id.ts` | state、UUID検査。追跡IDを認証根拠にしない |
| `app/(club-app)/club/revalidate-club-paths.ts` | `revalidateClubMemberPaths` の呼出し |
| `domain/club/club-revalidation-paths.ts`、同 `.test.ts` | 既存再検証先とslug検査の確認 |
| `vitest.config.mts` | server-only / Next mock境界 |

先行粒度のcontext、認証adapter、Service、Domainを開始時に読む。

**変更予定の既存ファイル**：なし。既存の再検証関数は呼び出すだけ。

**新規ファイル案**

- `app/(club-app)/welcome/actions.ts`
- `app/(club-app)/club-invitations/accept/actions.ts`
- `tests/club-invitation-acceptance-actions.test.ts`

新設案の `completeClubInvitationAction` と `acceptExistingClubInvitationAction` は、
毎回Authで本人を再取得し、cookieを再検査してServiceへ渡す。
新規／既存の分岐は検証済みsessionを根拠にし、別Actionを直接選んで初回設定を迂回できないようにする。
入力はFormDataの型を検査し、Fileを `String()` で文字列化して受理しない。
hiddenのclubId・role・userId・invitationId・任意のredirect先は受け取らない。
表示時のcontextIdだけを未信頼の入力として受け、cookieとの不一致なら処理を中止する。
一致は認証・認可の代わりにはせず、その後に本人・DB・期限を再検査する。

成功後にcontextを削除し、既存 `revalidateClubMemberPaths` と必要な `/club/select` の
再検証を実行する。DB由来の正規slugによる `/club/[clubSlug]/events` へ固定遷移する。
通常の失敗では再試行に必要なcontextを残し、終端状態は安全な再開案内にする。
redirect / notFound等の制御例外をcatchで失敗stateへ変換しない。

**必要時だけ確認**：Nextのcookies / redirect / revalidatePathの該当ローカル資料。
既存stateで表せない必要がある場合だけDomain型へ最小変更し、粒度1との契約差を報告する。

**この粒度では変更しない**：OWNER Action、共有のACTIVE認可、会員編集、ログイン、Page。

**完了条件・テスト**：sessionなし、他人、email違い、cookie欠損・改変、
PWなし新規の既存承諾Action直呼び、偽ID・File入力、requestId不正、状態の変化、
別タブでのcontext差替え、二重送信、成功時のcookie削除・再検証・固定遷移、
失敗時の秘密非返却を試験する。
UIのdisabledやProxyだけで認可していないことを確認する。

### 粒度8：既存アカウントのログインと招待再開

**目的**：既存ユーザーがパスワードを再設定せず、対象の招待へ戻れるようにする。

**調査開始ファイル**

| 既存ファイル | 確認対象と理由 |
| --- | --- |
| `app/(club-app)/club-login/actions.ts` | `loginAction`。signInWithPassword成功後、通常遷移前にpending招待を扱う |
| `app/(club-app)/club-login/page.tsx` | 既ログイン時の即redirectが招待再開を妨げる箇所 |
| `app/(club-app)/club-login/LoginForm.tsx` | props・入力・state契約を維持できるか確認 |
| `app/(club-app)/club/find-active-club-memberships.ts` | `findActiveClubMemberships` のACTIVE限定を維持 |
| `domain/club/club-login-destination.ts`、同 `.test.ts` | 招待contextなしの0 / 1 / 複数・プラン判定を維持 |
| `tests/club-membership-authorization.test.ts`、`vitest.config.mts` | auth / DB境界のmock方法 |

先行粒度のcontext、認証方法判定、読取Serviceも開始時に読む。

**変更予定の既存ファイル**

- `app/(club-app)/club-login/actions.ts`
- `app/(club-app)/club-login/page.tsx`

**新規ファイル案**：`tests/club-invitation-login-resume.test.ts`。

ログイン済みPageとログインAction成功時に、pending contextがあれば本人照合を行う。
有効な本人の招待だけ固定の承諾先へ戻す。password認証の証拠が足りない既存sessionでは
再ログインフォームを表示できるようにし、自動redirectとのループを防ぐ。
異なるアカウントでは他人の情報を表示せず、アカウントを切り替える案内をする。
自動で他アカウントに置換したり、global signOutしたりしない。

有効なpending招待がない場合は、既存の通常ログイン先判定を維持する。
任意の `next` URLを追加せず、cookieに書かれた戻り先も信用しない。
期限切れのpending cookieだけで通常ログインを無限に妨げない。

**必要時だけ確認**：表示に変更が不可避なら `LoginForm.tsx` の最小変更案と理由を報告する。
通常の所属判定が変わる場合は、既存呼び出し元をrgで追い、今回の変更を招待再開に限定する。

**この粒度では変更しない**：`LoginForm.tsx`、通常のログイン先Domain、ACTIVE所属取得、
PW再設定、クラブ選択画面、共有Auth policy。必要なら読み取りは行う。

**完了条件・テスト**：未ログイン→passwordログイン→同じ招待、既ログイン→同じ招待、
AMR不明→再ログイン、他人→非開示、pending欠損・期限切れ・改変→安全な通常導線、
0 / 1 / 複数クラブの既存動作、任意戻り先拒否、ループなしを試験する。

### 粒度9：初回設定と既存承諾のPage・フォーム

**目的**：先行粒度をユーザー操作へ接続し、期限切れ等を安全に案内する。

**調査開始ファイル**

| 既存ファイル | 確認対象と理由 |
| --- | --- |
| `app/(club-app)/club-login/reset-password/page.tsx`、`ResetPasswordForm.tsx` | Promise系API、初期state、useActionState、PW表示切替と秘密を保持しないフォーム |
| `app/(club-app)/club/[clubSlug]/layout.tsx` | ACTIVE必須のlayout外に置く理由、フッターを持ち込まないこと |
| `app/(club-app)/club/admin/_components/FieldErrorList.tsx`、`FormErrorAlert.tsx` | 再利用するprops・アクセシビリティ |
| `app/(club-app)/club/admin/_hooks/useScrollToFormError.ts` | `useScrollToFormError` のstate契約 |
| `tests/club-membership-authorization.test.ts`、`vitest.config.mts` | Pageのauth境界・node試験の前提。DOM用環境はない |
| `next.config.ts`、`package.json`、`package-lock.json` | privacy応答、cacheComponents等の現設定、ローカルNext資料の版 |

粒度5のbridge、粒度6の読取Service、粒度7のActionsとDomain型も開始時に読む。

**変更予定の既存ファイル**：粒度5で新設した
`app/(club-app)/welcome/InvitationAuthBridge.tsx`。Pageとの接続に必要な部分だけ。

**新規ファイル案**

- `app/(club-app)/welcome/page.tsx`
- `app/(club-app)/welcome/WelcomeForm.tsx`
- `app/(club-app)/club-invitations/accept/page.tsx`
- `app/(club-app)/club-invitations/accept/AcceptInvitationForm.tsx`
- `tests/club-invitation-acceptance-pages.test.ts`

両PageはACTIVE必須layoutの外に配置し、動的に本人・招待を照合する。
Page描画中にcookieを書かない。inviteのAuth戻りだけbridgeを表示し、セッション確立後に再読取する。
既存passwordログイン済みなら再設定フォームを出さず既存承諾へ案内する。
無認証では個人情報を出さず、必要な本人認証・ログインへの案内を返す。

新規フォームはPWと確認、8文字以上・英字と数字の説明、pending時の操作抑止を持つ。
PWをdefaultValueやstateへ戻さない。既存フォームには承諾ボタンだけを置き、PW再設定を要求しない。
両フォームに表示時のcontextIdを渡し、別タブのcookie差替えで別の招待へ操作が向かないようにする。
期限切れ、取消、承諾済み、本人不一致を、安全なDTOの範囲で区別する。
承諾済みでは再更新せず通常のクラブ利用案内へ進める。

招待専用画面に第三者スクリプト・解析・外部画像を追加しない。
no-store / no-referrerの実応答と、raw token / fragmentが操作・履歴に残らないことを確認する。
完了遷移以外のevents画面・共通トーストの拡張は、F06の必須仕様ではないため含めない。

**必要時だけ確認**：共有layoutにスクリプト等が追加されていればその参照先だけ確認する。
UIのNext APIはインストール済みcookies / server-client-components等の必要資料だけを読む。

**この粒度では変更しない**：共通UI部品、会員管理画面、events、フッター、PW再設定、
Repository / Serviceの認可契約。新しいUIテストパッケージも追加しない。

**完了条件・テスト**：nodeでPageの分岐・Clientに渡すDTO・認証未完了時の非開示を試験する。
実ブラウザでPW表示切替、エラーフォーカス、キーボード操作、二重押下抑止、
新規・既存の正しい画面、戻る／再読み込み、URL・cookie・ヘッダーを確認する。
ブラウザ試験をnodeのmock試験で代替済みとは報告しない。

### 粒度10：統合受入と運用手順

**目的**：F06受入条件を端から確認し、部分成功・再開・期限差の扱いを残す。

**調査開始ファイル**

| 既存ファイル | 確認対象と理由 |
| --- | --- |
| `tests/club-invitation-auth.local.integration.test.ts` | ローカル実Auth・明示flag、生成リンクと再利用拒否 |
| `tests/club-invitation-repository.integration.test.ts`、`tests/club-invitation-schema.integration.test.ts` | 実DBのfixture・分離・制約とF05回帰 |
| `tests/club-invitation-actions.test.ts` | 元の送信URL・OWNER認可・例外処理の回帰 |
| `docs/runbooks/club-member-invitations.md` | F06未接続の記述だけ更新し、F05運用は維持 |
| `package.json`、`vitest.config.mts` | 専用統合scriptと通常テストの分離 |
| `supabase/config.toml` | ローカル許可URLとAuth期限。共有policyは勝手に変更しない |
| `docs/implementation/phases/F06.md` | F06受入条件との最終対応 |

先行粒度の受取人Repositoryテスト、Service・Route・Action・Pageテストも開始時に読む。

**変更予定の既存ファイル**

- `package.json`：ローカル専用F06統合scriptの追加だけ
- `docs/runbooks/club-member-invitations.md`：到達点・confirm invite対応・F06手順へのリンクだけ

**新規ファイル案**

- `tests/club-invitation-acceptance.flow.integration.test.ts`
- `docs/runbooks/club-invitation-acceptance.md`

統合テストは使い捨てのloopback環境と、DB・Auth両方の明示flagを要求する。
通常の `npm test` でDB・Authへ接続しない。実メールは使わず、テスト用リンク生成までとする。
既存F05の実AuthテストはブラウザCookieの代替にしない。
追加テストの実行に必要なローカル環境がなければskipと理由を記録し、成功とは報告しない。

最低限、次の受入を新規アカウント・既存アカウント双方で確認する。

- 有効な招待、別Authがtokenだけ所持、現在emailの変更、期限境界、取消、使用済み。
- 既存所属を残した別クラブ追加、新規だけPW更新、既存ではPWが変わらないこと。
- 2並行でDB承諾1件、取消・再送との競合、旧token、Auth成功DB失敗後の再開。
- 別タブで別クラブの招待を開いた後、古いフォームから他方の招待を承諾しないこと。
- メールURL→Auth→welcomeの実戻り形式、fragment除去、Set-Cookieとrefresh、再読込。
- pending招待→ログイン→承諾、Cookie改変、直接Action、foreign Origin拒否、任意戻り先拒否。
- ブラウザの戻る操作、履歴、URL、Referer、アプリログに秘密を追加していないこと。

**必要時だけ確認**：本番のAuth allowlist、JWT hook、cookie domain、
インフラのURL/bodyログ設定は運用担当に確認する。秘密値の表示・取得は行わない。
Auth期限や共通password policyの変更が必要なら、HPへの影響を別途報告する。

**この粒度では変更しない**：本番設定・実DB・実メール・HP・共通Auth policy、
新しいE2Eフレームワーク、F05復旧CLI、他フェーズの画面やモデル。

**完了条件・テスト**：単体、既存回帰、許可されたローカルDB / Auth統合、
実ブラウザ確認の結果と未実施項目を区別する。受入条件の未達があればF06完了と扱わない。

## 6. DB・Prisma変更の整理

標準計画では **schema・migration・enum・生成Clientの変更なし**。
根拠は `prisma/schema.prisma` の既存 `ClubInvitation.status` / `acceptedAt` / `expiresAt` /
`tokenHash` / `authUserId` / `membershipId` と、`ClubMembership.status` / `clubId` / `userId`。

| 操作 | DB変更 |
| --- | --- |
| URL交換・Auth確認・Page読取・ログイン | アプリDBの更新なし。contextIdで別タブの取り違えも検出 |
| 新規password設定 | Supabase Authだけ更新。アプリDBのtransactionとは別 |
| 既存アカウント承諾 | Auth password更新なし |
| 粒度3の成功transaction | 対象InvitationをACCEPTED・acceptedAt設定・claim/lease両解除、対象MembershipをINVITED→ACTIVE |
| 競合・本人不一致・無効な招待 | アプリDB更新なし。途中まで実行した更新もrollback |

既存の部分uniqueはACCEPTEDを対象にしない。一回限り性をこのindexだけで説明せず、
status・acceptedAt・INVITEDの条件付き更新とtransactionで保証する。
同一クラブtrigger・RLS・既存unique・lease CHECKは維持する。

「初回設定済み」の判定にDB項目が必須と判明した場合は、標準計画を止めて改訂する。
追加columnだけでなく既存ユーザーへの値設定とF05準備時の記録も必要になり得るため、
未検証のmigrationをこの計画へ紛れ込ませない。

## 7. ユーザー操作からDBまでの処理フロー

以下の「新設案」は現時点では未実装。各粒度を適用するまでは後続粒度である。

### 新規アカウント

| 段階 | ファイル・関数 | 受け取る値 → 返す値 | DB・Auth変更 / 接続粒度 |
| --- | --- | --- | --- |
| メールのリンクを押す | 既存 `generateClubInvitationAuthLink` とSupabase actionLink | invite認証リンク → `/welcome` への認証結果 | Supabase本人確認。F05のリンク生成は変更しない |
| アプリqueryを除去 | `proxy.ts` の `proxy`、新設context処理 | raw token・slug → 短期hash context、clean URL | アプリDB更新なし。粒度4 |
| サーバーsessionを確立 | 新設 `InvitationAuthBridge` → `auth/confirm/route.ts` のinvite POST → 新設session adapter | Auth戻りtoken、context → 検証済みsession cookie、固定welcome | Auth sessionだけ。粒度5、Page接続は粒度9 |
| 招待と本人を表示前確認 | 新設welcome Page → `getClubInvitationAcceptance` → `findClubInvitationAcceptanceForUser` | session ID/email、slug/hash → 最小DTOまたは安全な理由 | 読取のみ。粒度2・6・9 |
| PWを設定して開始 | 新設 `WelcomeForm` → `completeClubInvitationAction` | password・confirmation・requestId、server cookie → 型付き結果 | Actionで再認証・再検査。粒度7・9 |
| Auth passwordを更新 | 新設 `acceptClubInvitation` → session adapterのupdate処理 | 本人session、検証済みpassword → 成功 / 失敗 / 結果不明 | Authのみ。粒度6 |
| DB承諾を確定 | 新設 `acceptClubInvitationForUser` | 検証済み本人、slug/hash → 成功と正規clubSlug / 拒否 | InvitationとMembershipを一つのtransactionで更新。粒度3 |
| 利用画面へ遷移 | 新設Action → 既存 `revalidateClubMemberPaths` → 既存クラブlayout | 正規clubSlug → events | context削除、再検証、既存ACTIVE認可。粒度7 |

### 既存アカウント

| 段階 | ファイル・関数 | 受け取る値 → 返す値 | DB・Auth変更 / 接続粒度 |
| --- | --- | --- | --- |
| アプリ参加リンクを押す | 既存 `buildClubInvitationLinks` のaccept URL → Proxy | raw token・slug → clean accept URL、短期context | アプリDB更新なし。粒度4 |
| 本人認証 | 既存 `loginAction`、変更するlogin Page、新設session adapter | email/passwordまたは既存session → password認証済み本人、固定accept先 | Supabaseログイン。password更新なし。粒度5・8 |
| 招待表示 | 新設accept Page → 読取Service / Repository | 本人ID/email、context → 最小DTOまたは安全な理由 | 読取のみ。粒度2・6・9 |
| 承諾ボタン | 新設 `AcceptInvitationForm` → `acceptExistingClubInvitationAction` → `acceptClubInvitation` | requestId、server context / session → DB承諾結果 | Authを再確認。password更新は0回。粒度6・7・9 |
| 確定・遷移 | 新設 `acceptClubInvitationForUser` → Action → 既存layout | 正規clubSlug → events | 対象クラブだけACTIVE化、既存所属維持。粒度3・7 |

## 8. 危険箇所と対策・限界

| 危険箇所 | 対策・残る限界 | 根拠 |
| --- | --- | --- |
| tokenだけで承諾できる | hashに加えAuth ID・現在email・同一クラブMembership.userIdを読取と書込で照合 | `findUsableClubInvitationByTokenHash` の既存条件、F06受入条件 |
| 別のActionを直接選び初回設定を迂回 | password認証の証拠をserverで検証。クライアントのmodeやcookieのフラグを信用しない | `AppUser`に設定完了情報なし、SDK `JwtPayload.amr` |
| 二重・並行承諾で片方だけ更新 | 条件付き更新2件とtransaction、競合テスト。UI抑止は補助 | Invitation / Membershipの現在モデル |
| 別タブでcookieが上書きされる | 表示時と送信時のcontextIdを照合し、違えば再表示。本人照合に加え操作対象の取り違えを防ぐ | F05が複数クラブの招待URLを発行できること、F06の複数所属条件 |
| Auth更新とDB更新の間に取消・再送 | DBで再検査して承諾を拒否。Auth側のpassword更新は取り消せないことを案内 | F06がAuthとDBを別処理として要求 |
| 並行した異なるPW設定 | DBの成功は1回にできるが、Auth password更新が2回起きる可能性は残る。自動再試行はしない。Authまで全体一回限りを求める場合は専用の排他契約を別途設計し計画改訂する | 外部AuthとPrismaに共通transactionがない |
| 送信中に承諾する | READY_TO_SENDも既存許可。ACCEPTED化で送信claimを解除し、古い送信結果記録が上書きしないことを回帰確認 | `isUsableClubInvitation`、`markClubInvitationEmailSent` |
| cookieを設定できたと思い込む | 書込可能なRoute / Actionで厳格に反映し、redirectへ全cookieを保持 | `server.ts` のsetAll catch、Next cookies資料 |
| 既存sessionを他人に置換・login CSRF | confirm POSTのOrigin・本人・contextを検査し、異なる既存本人の黙示置換を避ける | 新設session境界、既存confirmはrecovery専用 |
| 詳しいエラーで招待を探索 | 不一致相手には非開示。本人だけに安全な理由。queryやSDKメッセージを反射しない | `DomainError`、最小DTO方針 |
| URL / Referer / ログへの漏洩 | clean URL、fragment即除去、no-store / no-referrer、固定ログ。最初のリクエストURLはインフラ側の記録設定も必要 | F05確定URL、`sanitizeLogContext`の許可キー方式 |
| inviteとPW再設定の混線 | recovery GETと既存reset Actionを維持。新規設定でglobal signOutしない | `auth/confirm/route.ts`、`reset-password/actions.ts` |
| 認可とProxyを混同 | ActionとRepositoryで再確認。matcher対象外の直接Actionも拒否 | AGENTS、Next proxy資料 |
| 誤ったキャッシュ | Pageを動的にし、privacyヘッダーを実応答で検証。成功後は対象メンバー表示を再検証 | `next.config.ts`、`revalidateClubMemberPaths` |
| 不適切なAppUser・role更新 | 受入では既存user・名前・email・roleや他所属を上書きしない。不整合は拒否・報告 | `schema.prisma`、F05の既存ユーザー再利用方針 |

## 9. テストとpatch作成時の確認コマンド

今回行ったのは読み取り調査と計画書作成。アプリテスト、DB、実Auth、実ブラウザは実行していない。
各粒度では新規テストと上記の関連回帰を選び、無関係な試験を繰り返さない。

通常の確認は `npm run lint`、`npm run typecheck`、
`npm test -- <対象テストのパス>`。テストパスは各粒度に列挙したものを指定する。
一時環境へ既存依存関係を安全に参照させ、元ワークツリーのソース・indexを変更しない。
Domain単体は粒度1、DBは粒度2・3、入口とcookieは粒度4、Route・sessionは粒度5、
Serviceは粒度6、Actionは粒度7、loginは粒度8、Pageは粒度9、全体受入は粒度10で確認する。

DB関連粒度は、許可されたローカル専用DBがある場合だけ、
`RUN_DB_INTEGRATION_TESTS=1` を指定して新規DBテストと関連F05テストを実行する。
通常の `npm test` ではDB系をskipする現行ルールを維持する。
`npm run test:db` は他フェーズのDB試験も含むため、変更範囲の確認後の総合確認として扱う。

実Auth確認は既存 `npm run test:club-invitation:auth:local` と、
粒度10で追加する専用統合scriptを使う。明示的な許可とloopback条件を満たす環境だけで実行する。
通常テストの暗黙の副作用としてAuthユーザーを作らない。

`verify:local` は秘密の環境ファイルを読み、実DBも操作するため、この計画作成では実行しない。
`build` / `verify` の前処理にもenv検証があるので、未実行なのに成功と報告しない。
最終的な動的Page・ヘッダー・cookieは、許可されたローカル環境でbuild / 起動とブラウザ確認を行う。

各patch作成では、最初に `git status --short`、ブランチ・最新commitを確認し、
AGENTSに従い一時環境で実装・検証する。新規ファイルもGit diffへ含める。
元ワークツリーでは `git apply --check feature.patch` と `git apply --stat feature.patch` を実行し、
`git status --short` でpatch以外の変更がないことを確認する。実適用は行わない。
次の粒度は先行patchの適用・commit後の実コードを改めて基準にする。

計画書作成時に実行した主な読み取り・確認コマンドと結果は次のとおり。

| コマンド・確認 | 結果 |
| --- | --- |
| `git status --short`（開始時） | 変更なし |
| `git branch --show-current`、`git log -1 --oneline` | `feat/club-app-foundation`、`d40cdaf feat:F06準備` |
| `rg --files` とモデル・URL・関数名の `rg -n` | 関連ファイルを限定。F06のPage・Action・Serviceと専用テストが未実装であることを確認 |
| package / lock / 関連SDK型・Nextローカル資料の照合 | 本書のバージョン表・API制約を確認 |
| 計画書中のファイルパスと実ファイルの照合 | 不在の背景資料と新規候補を区別し、既存変更対象の存在を確認 |
| `git diff --check` | 空白等のエラーなし |
| `git diff --stat`、`git status --short`（作成後） | 変更はこの計画書1ファイルのみ |

この作業の成果物は計画書であり、`feature.patch` は作成していない。
`git apply --check` は各粒度のpatch作成時に実行する確認で、今回は実行していない。

## 10. 設計書とコードの相違・未確認事項

| 項目 | 確認結果・扱い |
| --- | --- |
| 指定背景資料名 | `docs/proposal2.md` 不在。`docs/proposals2.md` を代替参照。同一性は未確認 |
| 既存ユーザーにもPW更新か | F06の一律記載と背景の既存ログイン方針に差。ユーザー回答により既存は更新しないと確定。粒度1でF06を明文化 |
| 既存アカウント判定 | DBのAppUser有無・メール確認だけでは不可。検証済みpassword AMRを使う案。実AuthのAMR・JWT hookは未確認で粒度5の確認条件 |
| Auth confirmの経路 | F06はconfirm invite対応を要求するが、現F05リンクはSupabase認証後に直接welcome。GET type追加だけでは不足。bridge→confirm POST案を粒度5で実証する |
| implicit / PKCE | SDK型と既定flowは確認。実ブラウザの戻り、code_verifier、fragment保持、Cookie往復は未実行 |
| 有効期限 | アプリ24h、ローカルAuth OTP3600秒。背景の「双方24h」と相違。F05 runbookは差と再送を明記。共有OTP設定はF06で自動変更しない |
| password policy | F06は8文字・英字数字。既存reset Actionは最小8のみ、ローカルAuth設定は最小6・追加要件なし。今回の初回設定入力で検査し、共有policyの変更は別途影響確認 |
| 招待取消 | 古い背景の削除表現に対し、現F05はCANCELLED履歴・AppUserを保持。F06で削除へ戻さない |
| 承諾可状態 | 現コードはREADY_TO_SEND / SENT / EMAIL_FAILED。F06の「承諾可能」はこの既存定義を使い、SENT限定へ狭めない |
| `/welcome`の利用者 | 背景は未ログインと記す一方、初回PW更新には認証済みsessionが必要。Auth未完了はbridge、完了後の本人にフォームを出す |
| 初期設定後のトースト | 背景に記載、F06必須範囲に記載なし。events共通UIの拡張は計画に入れない |
| プラン制限 | 既存クラブlayout / 通常ログインはCLUB_APP利用可否を判定。受取先が利用不可プランの場合の案内は実装前に確認し、課金機能やプラン変更を追加しない |
| Prisma版差 | CLI7.9.1 / Client7.8.0。互換性は未実行。問題が出たらF06外の依存事項として報告 |
| 本番設定 | Supabase redirect allowlist、JWT hook、Cookie domain、Auth期限、ログ保存、実DBのmigration適用状況は未確認 |
| 実行検証 | DB競合、実Auth、実ブラウザ、build、配送はこの計画作成では未実施。ファイルの存在や型の確認と区別する |

## 11. F06外の依存事項と対象外

- **F05への依存**：既存の安全な招待作成、Auth ID / INVITED Membership紐付け、
  有効token、確定URLが前提。欠損は既存の復旧・再送へ案内し、F06で別の復旧機能を作らない。
- **F01のDB整合性への依存**：既存migration・同一クラブtrigger・RLS・uniqueが適用済みであること。
  F06からF01制約を再設計・再配布しない。
- **F04の会員編集への依存**：INVITEDの通常編集でactivationしない制限を維持する。
  承諾後の一般的な会員編集・権限変更はF06に含めない。
- **共用Authへの依存**：既存HP、PW再設定、SMTP、OTP期限、共通password policyへの影響がある。
  F06のためだけに既存許可URLを削除・全面開放したり、共用設定を変更したりしない。
- **運用への依存**：本番の許可URL・origin・ログ秘匿・Cookie属性を運用環境で確認する。
  構築・デプロイ・実配送・秘密の取得はこの計画にもpatch作成にも含めない。
- **他フェーズは対象外**：課金、LINE、イベント、通知、HPマルチテナント化、Authユーザー削除、
  一般的なプロフィール編集、汎用認証基盤の置換を追加しない。

## 12. 自己確認

- [x] F06の認証・受入・一回限り承諾に必要な変更だけに限定した。
- [x] F05の送信・再送・取消・復旧、既存ACTIVE認可を重複実装する計画にしていない。
- [x] 既存の変更予定ファイルを実際に確認した。新設候補は既存ファイルと分けて表示した。
- [x] 定義・呼び出し元・Domain・schema・Repository・Action・Page・再検証・ログ・関連テストを追った。
- [x] 既存テストが見つからない箇所を明記し、新規候補を実在するテストとして扱っていない。
- [x] 各粒度に調査開始、条件付き追加調査、変更対象、新規、対象外、完了条件、テストを記載した。
- [x] SDKの実版・型とNextローカル資料を確認し、未実行のAuth / DB / ブラウザを推測で埋めていない。
- [x] ソース・index・依存関係・DB・Auth・メール・秘密ファイルを変更していない。
