<!-- docs/implementation/phases/F07-granular-plan.md -->

# F07実装粒度計画

## 1. 基準・確定事項

- 調査基準：`feat/club-app-foundation`、`d1ed9ab`。
  `git status --short` は空。計画作成前のワークツリーはクリーンだった。
- 優先順位は `AGENTS.md`、`docs/implementation/phases/F07.md`、現在コード。
  `docs/proposals2.md` は「７-13」「6. マイページ 詳細設計」と関連モデル・共通認可だけを参照した。
- 今回の作業は調査・計画だけ。ソース、Git index、依存関係、DB、Authは変更しない。
- この文書の新規ファイル名・新規シンボル名は**実装案**であり、現在存在するという意味ではない。
  各粒度の「調査開始」は現在存在するファイルだけ。「先行粒度適用後」は区別している。
- 以降のpatch作成は、元のワークツリーを変更せず、一時環境のGit diffから指定粒度だけを生成する。
  新規ファイルを含め、元の環境では `git apply --check` までとする。

ユーザー回答で確定した扱い：

| 項目 | 決定 | 根拠・影響 |
| --- | --- | --- |
| 学年 | 未設定を許可する | `Child.grade Grade?` に合わせる。入力の未選択をnullへ変換し、不正なenumを未設定へ丸めない |
| 所属の再有効化 | WITHDRAWNだけをACTIVEへ戻す | SUSPENDED・INVITEDを本人操作でACTIVEにしない。既にACTIVEなら二重所属を作らない |
| クラブ切替 | アプリ利用可能なACTIVE所属が2件以上 | `findActiveClubMemberships` → `getAppEnabledMemberships` の既存判定を維持する |
| 規約・プライバシー | 公開URL・文面は未確定 | 要確定の外部依存。仮URL、空リンク、HPのフォーム用文面の流用で完了扱いしない |

現在クラブの子ども一覧は、自分のChildで、現在クラブのACTIVEなChildClubMembershipがあるものを対象とする。
所属のない既存Childは、利用者が「登録済みの子どもを追加」を開いた場合の選択候補として分ける。
別クラブの子どもを現在所属一覧へ混ぜたり、別クラブの所属情報を候補に付けて表示したりしない。
SUSPENDED・INVITEDの自動解除や、親のMembership状態との自動同期は実装しない。
この表示の整理は、F07の現在クラブ表示と既存Child再利用を両立させる実装方針である。

## 2. 現在の実装状況

| 区分 | 状態 | 根拠・確認した記号 |
| --- | --- | --- |
| AppUserと複数Child | モデル実装済み | `prisma/schema.prisma` の `AppUser.children`、`Child.parentId`。Childの氏名・学年はグローバル |
| 子どものクラブ所属 | モデル・制約実装済み | 同schemaの `ChildClubMembership`。`@@unique([clubId, childId])`、親Child・親Membershipの複合FK |
| Gradeの型 | 実装済み | 同schemaの `Grade` はYOUJIとELEMENTARY_1〜6。`types/prisma.ts` が型を再export |
| 現在会員の認可 | 実装済み | `club-membership-authorization.ts` の `requireActiveClubMembership` がAuth ID・ACTIVE・slugを照合 |
| アプリ利用権 | 実装済み | `club-app-authorization.ts` の `requireClubAppAccess`。layoutも同じ判定を実行 |
| ロール判定・管理画面 | 実装済み | `domain/club/club-member-role.ts` の `isClubAdminRole`。admin/events・noticeはAdmin、members・lineはOwner認可 |
| クラブ選択・ヘッダー切替 | 実装済み | `findActiveClubMemberships`、`getAppEnabledMemberships`、`ClubAppLayout`、`ClubSelectPage` |
| マイページ導線 | 一部実装 | `ClubFooter` のaccount項目は存在するが、`account/page.tsx` は存在しない |
| ログアウト | 処理実装済み | `app/(club-app)/club/actions.ts` の `logoutAction`。`signOut({ scope: "local" })` と `/club-login` 遷移 |
| PlatformAdmin認可 | 一部実装 | `platform/require-platform-admin.ts` の `requirePlatformAdmin` は存在。本人向け表示判定・support画面は未実装 |
| マイページの読取・本人氏名更新 | 未実装 | account用Repository・Service・Action・Pageは検索で該当なし。既存AppUser更新は招待準備等の別用途 |
| 子どもの作成・編集・所属操作 | 未実装 | 対応するRepository・Service・Action・フォーム・専用テストは存在しない |
| 法的文書・外部リンク | 一部／未実装 | ClubにwebsiteUrl・instagramUrlはある。アプリ向け規約・privacyの公開先はない |
| 子どものDB制約テスト | 未実装 | `tests/club-id-integrity.integration.test.ts` は他のクラブ境界を検証するが、Childのケースはない |

既存機能は再実装しない。特にクラブ選択画面、Authメール変更、会員ロール更新、招待、
ログアウト本体、共通フッター、PlatformAdmin認可本体、DBの既存制約は対象外とする。

## 3. 調査した主要ファイルと参照関係

以下の `app/(club-app)/` 配下という表記はパスの省略であり、実ファイルの存在を確認済み。

| ファイル | 確認した関数・型・モデルと、計画への影響 |
| --- | --- |
| `AGENTS.md`、`CLAUDE.md` | CLAUDEはAGENTS参照。粒度限定、Repositoryのclub条件、秘密の非出力、一時環境でのpatch作成 |
| `docs/implementation/phases/F07.md` | Child方針、10項目の範囲、本人・他クラブ保護の受入条件 |
| `docs/proposals2.md` | マイページ、Child/ChildClubMembership、権限リンク。サポート送信等は今回の範囲から除外 |
| `prisma/schema.prisma` | AppUser、Child、ChildClubMembership、ClubMembership、Club、PlatformAdmin、Grade、ClubMembershipStatus |
| `prisma/migrations/20260816221153_add_club_app_schema/migration.sql` | Childのnullable grade、所有者複合FK、同一クラブ・Childのuniqueが既に定義済み |
| `prisma/migrations/20260816223753_enable_rls_for_club_app/migration.sql` | AppUser・Child・ChildClubMembership等のRLS有効化。アプリ条件の代用にはしない |
| `prisma/migrations/20260926084449_f01_enforce_club_scope_integrity/migration.sql` | F01の他モデル整合性。F07で既存制約を再作成しない |
| `types/prisma.ts` | AppUser、Child、ChildClubMembership、Grade等は既に型export済み。再export追加は不要 |
| `app/(club-app)/club/club-membership-authorization.ts` | ClubAccessContext、requireActiveClubMembership、requireClubAdminMembership、requireClubOwner。contextにAuth emailは含まれない |
| `app/(club-app)/club/club-app-authorization.ts` | requireClubAppAccess／AdminAccess／OwnerAccess。Pageだけでなく全Actionでも使用 |
| `domain/club/plan-features.ts`、`domain/club/plan-features.test.ts` | hasClubFeature、requireClubFeature。CLUB_APPは現在STANDARDだけ |
| `app/(club-app)/club/[clubSlug]/layout.tsx` | ClubAppLayout。ACTIVE認可と利用可能所属件数からヘッダーを構成 |
| `app/(club-app)/club/[clubSlug]/_components/ClubHeader.tsx` | ClubHeader。canSwitchClub表示、既存logoutActionへのform |
| `app/(club-app)/club/[clubSlug]/_components/ClubFooter.tsx` | ClubFooter。accountへの既存リンク・選択状態。編集不要 |
| `app/(club-app)/club/find-active-club-memberships.ts` | findActiveClubMemberships。userId・status=ACTIVEを条件とする |
| `domain/club/club-login-destination.ts`、`domain/club/club-login-destination.test.ts` | ClubLoginMembership、getAppEnabledMemberships、getClubLoginDestination |
| `app/(club-app)/club/select/page.tsx` | ClubSelectPage。利用可能0・1・複数の分岐。再実装しない |
| `app/(club-app)/club/actions.ts` | logoutAction。現在ブラウザのセッションだけを終了 |
| `app/(club-app)/platform/require-platform-admin.ts` | requirePlatformAdmin。Auth user.idとPlatformAdmin.id、isActiveの照合。表示用には拒否型guardをそのまま使わない |
| `domain/club/club-member-role.ts`、`domain/club/club-member-role.test.ts` | isClubAdminRole、getClubMemberRoleLabel。新しいロール体系は作らない |
| `src/infrastructure/prisma/repositories/club-membership-repository.ts` | findClubMembershipsForOwner、updateClubMembershipForOwner。氏名表示の優先はAppUser.name、SerializableとP2034限定再試行 |
| `src/application/club/invitation/get-club-member-management.ts` | getClubMemberManagement。氏名変更の影響先となるOWNER会員一覧への取得経路 |
| `app/(club-app)/club/[clubSlug]/admin/members/page.tsx`、`actions.ts` | ClubMembersPage、updateClubMembershipAction。OWNER認可と会員更新。新規本人操作を混在させない |
| `app/(club-app)/club/[clubSlug]/admin/events/page.tsx`、`admin/notice/page.tsx` | 管理リンクの実在先とrequireClubAppAdminAccessの呼出しを確認 |
| `app/(club-app)/club/[clubSlug]/admin/settings/line/page.tsx` | ClubLineSettingsPage。現在backHrefがadmin/eventsで、account実装後の差替え予定が明記されている |
| `domain/club/club-revalidation-paths.ts`、`domain/club/club-revalidation-paths.test.ts` | getClubMemberRevalidationPathsが会員管理とaccountを生成。グローバル氏名更新に使う |
| `app/(club-app)/club/revalidate-club-paths.ts` | revalidateClubMemberPaths。現在クラブだけの呼出しでは氏名の横断反映に不足 |
| `domain/shared/action-state.ts`、`domain/shared/request-id.ts`、`domain/shared/action-state.test.ts`、`domain/shared/request-id.test.ts` | ActionState、FieldErrors、createInitialActionState、createRequestId、isRequestId |
| `domain/club/invitation/invitation-form.ts` | 氏名trim・上限100文字という既存例。F07の入力契約自体は専用Domainで定義 |
| `lib/forms/form-data.ts`、`lib/forms/zod-field-errors.ts` | getStringValue、getZodFieldErrors。前者は重複fieldやFileの区別に不足するため、そのままで十分とはしない |
| `src/infrastructure/prisma/prisma-error.ts`、`domain/shared/domain-error.ts` | convertPrismaError、DomainError。任意の既存DomainErrorやcauseの公開・ログ出力は避ける |
| `src/infrastructure/prisma/client.ts` | 共有client初期化はdotenvをimport。新規DBテストは遅延専用client注入とし、通常試験で評価しない |
| `src/infrastructure/supabase/server.ts` | createClient、await cookies、Auth.getUser。Auth email表示は新たな本人照合が必要 |
| `app/(club-app)/club/admin/_components/FieldErrorList.tsx`、`FormErrorAlert.tsx` | 既存propsとrole=alert。新規フォームから再利用 |
| `app/(club-app)/club/admin/_hooks/useScrollToFormError.ts` | useScrollToFormError。ActionState互換のフォームrefとエラーフォーカス |
| `app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard.ts` | pending・dirty・遷移警告。必要なフォームに限定して再利用を検討 |
| `app/(club-app)/club/[clubSlug]/admin/members/ClubMemberEditDialog.tsx` | useActionState、useId、フォーカス制御。メンバー専用なので流用のための改造はしない |
| `app/(club-app)/club/admin/_components/ContentDeleteDialog.tsx` | コンテンツ削除専用。Child物理削除へ流用しない |
| `components/admin/modal/ConfirmModal.tsx`、`components/modal/BaseModal.tsx` | ConfirmModalは独立formで入力・hidden fieldの受渡しが必要。BaseModalにpending時の閉じる制御・focus trapはない |
| `components/admin/ToastMessage.tsx` | ToastMessageは固定文言の短時間表示に利用可能。URLに入力値を入れない |
| `components/form/PrivacyPolicyModal.tsx` | お問い合わせ・体験フォーム用文面。アプリの規約・privacyとは別物 |
| `tests/club-membership-authorization.test.ts` | ACTIVE・Auth ID・slug条件、停止・退会済み拒否、OWNER認可のmock試験 |
| `tests/club-members-actions.test.ts` | updateClubMembershipActionの認可・フォーム・再検証・固定遷移の既存例 |
| `tests/club-membership-repository.integration.test.ts` | 同一クラブの実DB更新・競合・既存AppUserを壊さない試験の例。Child専用試験は別途必要 |
| `tests/club-id-integrity.integration.test.ts` | 他モデルのDB制約回帰。Childは未カバー。共有Prismaをトップレベルimportしているので無条件に実行しない |
| `tests/club-line-settings-actions.test.ts` | LINE設定Actionの既存回帰。戻るリンク変更時は新規Page試験も追加 |
| `package.json`、`package-lock.json`、`vitest.config.mts`、`next.config.ts` | test:dbとnode環境、alias、Next設定。新しいDOM/E2Eパッケージは導入しない |

### バージョンとNext.jsの前提

package.jsonの指定に加え、lockfileで次を確認した。
Next 16.2.6、React/React DOM 19.2.4、Zod 4.4.3、Prisma Client 7.8.0、Prisma CLI 7.9.1、
Supabase SSR 0.10.3、supabase-js 2.112.3、Vitest 4.1.10、TypeScript 5.9.3。
Prisma CLIとClientのlock版の差は既存状態であり、F07でパッケージ更新して解消しない。

インストール済みNextも16.2.6で、以下のローカル資料が存在する。
`node_modules/next/dist/docs/` 以下の必要箇所だけを確認した。

- `01-app/03-api-reference/03-file-conventions/page.md`：params・searchParamsはPromise。
- `01-app/03-api-reference/04-functions/cookies.md`：cookiesはasync、Pageで書込み不可。
- `01-app/01-getting-started/07-mutating-data.md`：useActionStateとpending。
- `01-app/03-api-reference/04-functions/revalidatePath.md`：共有データでも対象path以外は自動更新されない。
- `01-app/03-api-reference/04-functions/unstable_rethrow.md`：制御例外を通常エラーへ変換しない。

cacheComponentsは現在のnext.config.tsで有効化されていない。
accountをユーザー間で共有キャッシュせず、既存の動的Pageに合わせる。
将来patch作成時にNext・SDKの利用箇所が変わる場合だけ、その版の型・ローカル資料を追加確認する。

## 4. 共通の実装境界

- accountのPageと新規公開Actionで `requireClubAppAccess(clubSlug)` を使う。layout認可だけに依存しない。
- clubId・actorMembershipId・親のuserIdは認可結果から得る。
  bind引数、hiddenのchildId、membershipId、requestIdも入力として検証し、所有者の証明にしない。
- Repositoryにも同じclubId・actorMembershipId・userId・ACTIVE条件を入れる。
  書込はtransaction内で操作者を再確認し、対象条件付き更新と件数検査で競合を扱う。
- Child本体の更新は、親本人かつ現在クラブのACTIVEな所属を持つChildに限定する。
  parentIdだけで更新する経路を設けない。所属解除は現在clubIdのChildClubMembershipだけ。
- 既存Childの所属追加は、自分のChild本体を照合した後、現在クラブの所属を作成するかWITHDRAWNだけ再有効化。
  ACTIVEは重複扱い、SUSPENDED・INVITEDは変更不可。氏名を使って同一人物と推測しない。
- 新規Childと初回所属は同一transaction。二重送信対策はUIのpendingとDB制約の両方で行う。
  requestId単体に冪等性はない。新規フォームの同じ作成識別子をChild.idへ結び付ける案を粒度4で具体化し、
  同じ送信によるChild本体の重複も防ぐ。別送信で同姓同名の兄弟を登録することは禁止しない。
- email、parentId、status、roleを更新payloadへspreadしない。許可した項目だけでdataを組む。
- Auth emailとAppUser.emailは別項目として表示のみ。取得中にAuth本人が変わればDTOを返さない。
  不一致を自動同期する機能、Authメール変更、PW変更はF07外。
- PlatformAdminの表示判定は本人idとisActive=trueの存在確認だけ。一般会員にguardのnotFoundを投げない。
  ロールを見せるだけの判定をPlatform画面の認可の代わりにしない。
- 戻り値は表示DTO／固定outcomeを基本とし、DBレコード全体・Auth User全体をClientへ渡さない。
  氏名・子ども情報・email・入力値・DB原文・causeをログに出さない。
- 予期する競合・権限失効・不在は安全な結果へ変換する。Nextのredirect/notFoundをcatchした場合は再送出。
  成功redirectはcatch外。DB保存後の再検証失敗を「未保存なので再登録」と案内しない。
- 共通Component、認可体系、F05/F06、既存管理機能は改造しない。
  対象外の変更が必要と判明した場合は、その理由と最小の計画変更案を報告してから扱う。

## 5. 粒度一覧と依存関係

| 粒度 | 目的 | 依存 | 到達点 |
| --- | --- | --- | --- |
| 1 | 仕様・入力・表示・結果の契約 | なし | 純粋関数と型。DB/UIは未接続 |
| 2 | 本人向け読取Repository | 1 | 現在所属・追加候補・本人データの取得 |
| 3 | 本人氏名の更新Repository | 1、2 | 認可付きAppUser.name更新 |
| 4 | Child作成・グローバル編集Repository | 1、2 | Childと初回所属のatomic作成、本人Child編集 |
| 5 | 既存Childの所属追加・解除Repository | 1、2、4 | WITHDRAWN再有効化と現在クラブ限定解除 |
| 6 | Application Serviceと横断再検証 | 2〜5 | 取得・更新結果・影響クラブを安全に整理 |
| 7 | Server Action | 1、6 | 全操作の直接呼出しにも認証・認可・入力検証 |
| 8 | Pageと権限別導線 | 2、6 | 読取画面と既存導線への接続。編集フォームは後続 |
| 9 | 氏名・複数Childのフォーム | 7、8 | 確認・pending・エラーを含む操作UI |
| 10 | 統合受入・運用手順 | 1〜9 | 実DB制約・横断反映・本人保護の受入記録 |

各patchは直前まで適用済みのワークツリーを基準にする。
3・4の処理は分離可能だが、同じファイルを触るpatchの順序は上表どおりとする。
Pageがフォーム未接続、ActionがUI未接続という途中段階を、完了したF07とは報告しない。

### F07仕様との対応

| F07.mdの実装範囲 | 担当粒度・根拠 |
| --- | --- |
| 1. account Page追加 | 8。既存ClubFooterとClubAppLayoutへ接続 |
| 2. AppUser氏名更新 | 1・3・6・7・9。AppUser.nameのみ更新 |
| 3. Auth／DB email表示のみ | 6・8・9。ClubAccessContextにはemailがないため現在Authを別途確認 |
| 4. Child追加・編集・所属追加・解除 | 1・4・5・6・7・9。Child本体とCCMを分離 |
| 5. 所有者・clubIdの全Action確認 | 2〜7。requireClubAppAccessとRepository内の条件を併用 |
| 6. 複数Child UI | 9。Child単位のstate・ID・対象操作 |
| 7. ロール別リンク | 8。既存isClubAdminRoleと実在する管理画面 |
| 8. 複数ACTIVEのクラブ切替 | 8。ユーザー回答と既存getAppEnabledMembershipsに一致 |
| 9. 規約・privacy・HP・Instagram・logout | 8・9。規約URLは未確定依存、ログアウト本体は既存を使用 |
| 10. PlatformAdmin本人限定リンク | 2・8。本人idとisActive。遷移先実装はF07外 |
| 受入条件の実証 | 10と各粒度の専用試験。実DB・ブラウザの未実施を分離 |

## 6. 各粒度の計画

### 粒度1：仕様・入力・表示・結果契約

**目的・内容**：既存GradeとActionStateを使い、氏名、Child作成・編集、所属操作、
読取DTO、固定結果を定義する。学年null許可と再有効化の制限をF07仕様へ反映する。
氏名はtrim、空欄拒否、上限100文字を既存招待入力に合わせる案とする。
AppUserの既存null氏名は未登録表示とし、氏名だけを変える操作でChild入力を必須にしない。

**調査開始ファイル**

| 既存ファイル | 対象・理由 |
| --- | --- |
| `docs/implementation/phases/F07.md` | Child方針と受入条件。今回の回答を意味のある仕様追記として反映 |
| `prisma/schema.prisma`、`types/prisma.ts` | Grade、nullable、既存ID・状態型を確認 |
| `domain/shared/action-state.ts`、`domain/shared/request-id.ts`、`domain/shared/action-state.test.ts`、`domain/shared/request-id.test.ts` | ActionState、FieldErrors、UUID契約 |
| `domain/club/invitation/invitation-form.ts`、`domain/club/invitation/invitation-form.test.ts` | trim・氏名100文字・許可項目の既存例 |
| `lib/forms/form-data.ts`、`lib/forms/zod-field-errors.ts` | File・重複fieldを拒否する必要がある箇所を判断 |
| `vitest.config.mts` | node試験とalias |

**変更予定の既存ファイル**：`docs/implementation/phases/F07.md` だけ。

**新規案**

- `domain/club/account/account-types.ts`：表示DTOと更新結果。現実装のレコード型とは分離。
- `domain/club/account/account-form.ts`、`domain/club/account/account-form.test.ts`：本人氏名・安全なstate・固定フィードバック。
- `domain/club/account/child-form.ts`、`domain/club/account/child-form.test.ts`：Grade選択肢、null変換、Child入力、ID検証。
- `domain/club/account/child-membership-policy.ts`、`domain/club/account/child-membership-policy.test.ts`：既存所属の状態遷移。

新規シンボル案は `validateAccountNameInput`、`validateChildInput`、
`evaluateChildMembershipAddition`。既存関数として引用しているものではない。

**必要時だけ確認**：Zodを使う場合だけインストール済みZodの型を確認。
共通関数が重複field・Fileを取りこぼす場合も、既存共通処理を全体改造せずF07内で補う。

**この粒度では変更しない**：schema、migration、types/prisma.ts、Repository、Action、Page、既存フォーム。

**完了条件・テスト**：未選択→null、7種類のGrade、不正enum・空白・上限・File・重複field・不正IDを試験。
WITHDRAWNだけ再有効化、ACTIVE重複、SUSPENDED・INVITED拒否を純粋関数で確認。
メール・所有者・clubId・roleを更新入力やstateへ取り込まないことを確認。DB認可の保証とは区別する。

### 粒度2：本人向け読取Repository

**目的・内容**：現在クラブの本人・子ども一覧と、明示的に要求した既存Child追加候補を別取得にする。
クラブ・親・Child・ChildClubMembership・現在の親Membershipを照合してから、必要項目だけを返す。

**調査開始ファイル**

| 既存ファイル | 対象・理由 |
| --- | --- |
| `prisma/schema.prisma` | AppUser、Child、ChildClubMembership、ClubMembership、PlatformAdmin、Clubのrelation |
| `src/infrastructure/prisma/repositories/club-membership-repository.ts` | findClubMembershipsForOwnerのselectと、氏名表示への影響 |
| `app/(club-app)/club/club-membership-authorization.ts` | ClubAccessContextのID・現在クラブの確定方法 |
| `app/(club-app)/platform/require-platform-admin.ts` | isActiveと本人IDの条件。一般会員へguardを呼ばない理由 |
| `app/(club-app)/club/find-active-club-memberships.ts` | 既存所属の取得を重複実装しない |
| `tests/club-membership-authorization.test.ts`、`vitest.config.mts` | 認可境界とnode mockの構成 |
| `src/infrastructure/prisma/client.ts` | 通常試験でdotenv初期化を評価しないための注入境界 |

**先行粒度適用後に確認**：粒度1のaccount-types.tsとポリシー・テスト。

**変更予定の既存ファイル**：なし。

**新規案**

- `src/infrastructure/prisma/repositories/club-account-repository.ts`
- `tests/club-account-repository.test.ts`

関数案は `findClubAccountForUser`、`findAttachableChildrenForUser`。
前者は現在のACTIVE所属Childだけ、後者は自分のChildのうち現在クラブに未所属またはWITHDRAWNの候補だけ。
候補には他クラブ名・他クラブMembershipを含めない。所有者を照合できない対象は存在詳細を隠す。
PlatformAdminの有無は本人id・isActive=trueのboolとする。
クラブのwebsiteUrl・instagramUrlは読取のみ。Auth emailはDBから捏造せず粒度6で補う。

**必要時だけ確認**：Prismaのrelation filter・select型で不明点が出たときだけ対応する既存型を確認。
AppUser不在や所属不整合があってもupsert・修復はせず、固定の取得失敗へ扱う。

**この粒度では変更しない**：共通認可、PlatformAdmin guard、クラブ選択、書込Repository、Page、schema。

**完了条件・テスト**：本人A／本人B、クラブA／B、親の非ACTIVE、Childの親不一致、所属状態4種、
複数Child、0件、候補取得、PlatformAdmin inactive、必要最小selectと秘密非出力をDBなしで試験。
実DBの複合FK・実接続試験は粒度10。現在のDB制約をmock試験で確認済みとはしない。

### 粒度3：本人氏名更新Repository

**目的・内容**：現在会員の本人がAppUser.nameだけを更新し、影響するクラブslugを取得する。

**調査開始ファイル**

| 既存ファイル | 対象・理由 |
| --- | --- |
| `prisma/schema.prisma` | AppUser.nameのnullableとMembershipのuserId・status |
| `src/infrastructure/prisma/repositories/club-membership-repository.ts` | updateClubMembershipForOwnerのtransaction・P2034限定再試行、一覧のAppUser.name優先 |
| `src/infrastructure/prisma/prisma-error.ts`、`domain/shared/domain-error.ts` | 固定結果への変換、任意message・causeを反射しない境界 |
| `tests/club-membership-repository.integration.test.ts` | 既存会員更新とAppUser維持の回帰例 |
| `vitest.config.mts` | 新規mock試験の設定 |

**先行粒度適用後に確認**：粒度1・2の入力型、club-account-repository.ts、専用試験。

**変更予定ファイル**：粒度2で追加済みとなるclub-account-repository.tsと専用試験。
現在ワークツリーに存在するファイルの変更はなし。
**新規ファイル案**：なし。

関数案は `updateAccountNameForUser`。
actorMembershipId・clubId・userId・ACTIVE・利用プランをtransaction内で再照合し、
AppUser.nameだけを条件付き更新。emailやChild、所属、Authを変更しない。
影響クラブは本人の既存ClubMembershipからサーバーで取得する。
他クラブOWNERの会員一覧にも氏名が出るので、ACTIVE所属だけに絞って影響先を落とさない。

**必要時だけ確認**：P2034の扱いは既存Repositoryに合わせて有限回とし、P2002や不明エラーを自動再試行しない。
認可失効との競合で条件が不足する場合は、その試験結果を根拠に必要最小の行ロック等の案を報告する。

**この粒度では変更しない**：Auth、AppUser.email、招待、管理画面、Child、再検証、共通Repositoryの改造。

**完了条件・テスト**：本人更新、他人・別クラブ・親Membership失効で0更新、許可フィールドだけのdata、
対象なし・更新0件・transaction rollback・P2034上限・全影響slugの取得を試験。
氏名上限はアプリ契約で、既存DBが100文字制約を持つとは説明しない。

### 粒度4：Childの新規作成とグローバル編集Repository

**目的・内容**：Childと現在クラブの初回所属を一体で作成し、所属中の自分のChildだけを編集する。

**調査開始ファイル**

| 既存ファイル | 対象・理由 |
| --- | --- |
| `prisma/schema.prisma` | Childの親・Grade、ChildClubMembershipのFK・unique・status |
| `prisma/migrations/20260816221153_add_club_app_schema/migration.sql` | 所有者の複合制約を既存のまま使う |
| `src/infrastructure/prisma/repositories/club-membership-repository.ts` | transaction・条件付き更新・競合処理の現行例 |
| `domain/shared/request-id.ts`、`domain/shared/request-id.test.ts` | UUID作成識別子。認可の証明ではない |
| `tests/club-membership-repository.integration.test.ts`、`vitest.config.mts` | rollback・並行操作の試験構造 |

**先行粒度適用後に確認**：粒度1のChild入力・型、粒度2・3の本人照合方法と結果契約。

**変更予定の既存ファイル**：なし。

**新規案**

- `src/infrastructure/prisma/repositories/club-child-repository.ts`
- `tests/club-child-repository.test.ts`

関数案は `createChildForUser`、`updateChildForUser`。
新規はChildとACTIVEな現在クラブ所属を同一transactionで作る。
同じ作成フォームでは同じUUID作成識別子をChild.idとして使う案とし、
同時の再送は一意制約で一件にする。既存Child IDを指定して新規作成を装っても更新へ切り替えない。
P2002は固定の競合・再読取案内とし、別人の存在や入力値を返さない。

編集は `Child.id + parentId` に加え、現在クラブ・親・ACTIVEなChildClubMembershipを条件にする。
name・gradeだけを更新し、Child本体の変更が他クラブにも見えることを結果・UIへ引き渡す。
Childを別クラブ用に複製しない。物理削除、親付替え、学年自動繰上げは提供しない。

**必要時だけ確認**：作成識別子のstate受渡しが先行契約に足りなければ粒度1の最小追加案を示す。
Prismaの条件付き更新型は実装時のインストール済み型で確認する。生成済みClient全体は読まない。

**この粒度では変更しない**：ChildClubMembershipの既存所属再有効化・解除、schema、物理削除、Auth、フォーム。

**完了条件・テスト**：親・club一致、grade null、他人Child・未所属・非ACTIVE所属の編集拒否、
同一作成識別子の2送信でChild一件、初回所属失敗時にChildが残らないこと、他クラブ所属が変わらないこと。
DBなし試験と、粒度10で行う実unique・rollbackの試験を区別する。

### 粒度5：既存Childの所属追加・現在クラブからの解除

**目的・内容**：グローバルChildの再利用と、現在クラブ所属だけのWITHDRAWN化。

**調査開始ファイル**

| 既存ファイル | 対象・理由 |
| --- | --- |
| `prisma/schema.prisma` | clubId・childId unique、parentUserIdの複合FK、ClubMembershipStatus |
| `src/infrastructure/prisma/repositories/club-membership-repository.ts` | transactionでの操作者再確認と状態を含む更新条件 |
| `tests/club-membership-repository.integration.test.ts` | 並行処理・状態遷移の既存試験例 |
| `vitest.config.mts` | node試験 |

**先行粒度適用後に確認**：粒度1の状態ポリシー、粒度2の候補取得、粒度4のclub-child-repository.tsと試験。

**変更予定ファイル**：粒度4で追加済みとなるclub-child-repository.tsと専用試験。
**新規ファイル案**：なし。現在存在するファイルの変更もなし。

関数案は `addChildToClubForUser`、`withdrawChildFromClubForUser`。
未所属ならcreate、WITHDRAWNなら所有者・現在clubId・旧状態を含むupdate。
ACTIVEなら重複、SUSPENDED・INVITEDなら変更不可。無条件upsertでACTIVEへ戻さない。
解除は現在クラブのACTIVEな該当所属だけをWITHDRAWNへ更新する。
再解除は安全な既解除／競合として扱い、Child本体と他クラブ所属を残す。

**必要時だけ確認**：同時追加はunique、再有効化・解除の競合は旧状態条件・更新件数・transactionで扱う。
親の失効と同時操作の整合性が不足する場合は、テストを根拠に最小の計画変更を示す。

**この粒度では変更しない**：Child.name・grade・parentId、Child物理削除、他クラブ所属、親Membershipの状態。

**完了条件・テスト**：未所属追加、WITHDRAWN再有効化、ACTIVE重複、2状態拒否、
他人Child・別clubId・他人parentUserId拒否、追加／解除の競合、他クラブとChild本体が残ること。

### 粒度6：Application Serviceとクラブ横断の再検証

**目的・内容**：本人向けの取得・変更結果を整理し、保存後の影響先をサーバーで決める。

**調査開始ファイル**

| 既存ファイル | 対象・理由 |
| --- | --- |
| `src/infrastructure/supabase/server.ts` | createClientとAuth.getUser。現在Auth emailを表示するための取得 |
| `app/(club-app)/club/club-membership-authorization.ts` | contextにAuth emailがないこと、本人idの一致確認 |
| `src/application/club/invitation/get-club-member-management.ts` | 固定outcomeと取得失敗の例。F07へ招待処理を持ち込まない |
| `domain/club/club-revalidation-paths.ts`、`domain/club/club-revalidation-paths.test.ts` | 現在の会員管理・accountのパス生成 |
| `app/(club-app)/club/revalidate-club-paths.ts` | revalidateClubMemberPathsの実呼出し |
| `src/infrastructure/prisma/repositories/club-membership-repository.ts` | 他クラブOWNER一覧の氏名表示に影響すること |
| `vitest.config.mts` | ServiceとNext境界のmock試験 |

**先行粒度適用後に確認**：粒度1〜5の契約・Repository・試験。

**変更予定の既存ファイル**

- `domain/club/club-revalidation-paths.ts`、`domain/club/club-revalidation-paths.test.ts`：account単独の対象パス生成を必要最小限追加。
- `app/(club-app)/club/revalidate-club-paths.ts`：影響slug群を受けるF07用関数を追加。

**新規案**

- `src/application/club/account/get-club-account.ts`、`src/application/club/account/get-club-account.test.ts`
- `src/application/club/account/update-club-account.ts`、`src/application/club/account/update-club-account.test.ts`
- `tests/club-account-revalidation.test.ts`

関数案は `getClubAccount`、`getAttachableClubChildren`、`updateClubAccountName`、
`createClubChild`、`updateClubChild`、`addClubChild`、`withdrawClubChild`。
不要なRepository interface・DIコンテナ・汎用command frameworkは作らない。

読取時はAuth.getUserの本人idを認可済みidと照合し、Auth emailとDB emailを別のreadonly表示項目へ整理。
認可後の独立取得だけを並列化し、無関係な会員一覧全件取得やグローバルキャッシュは使わない。
書込Serviceは既に検証された本人contextと入力からRepositoryへ渡す値を限定し、
成功時の影響クラブslugは内部結果として返す。Clientから受けたslug一覧で再検証しない。

氏名更新は本人が所属する全クラブの会員管理・accountを再検証。
Childグローバル編集は本人の関連クラブaccount、所属追加・解除は現在accountを対象にする。
この段階ではイベント・通知・サポート等へ不要な再検証を広げない。

**必要時だけ確認**：追加の表示先が実際にChild情報を参照していると分かった場合だけ、その参照先を追跡。
再検証対象を増やす前に理由を示す。共有タグキャッシュの新規導入は行わない。

**この粒度では変更しない**：共通認可、Authメール同期、会員ロール更新、既存管理画面、UI。

**完了条件・テスト**：Auth本人差替え・AppUser欠損・取得例外の安全な結果、DTOのwhitelist、
各操作のRepository呼出し値、氏名／Child／所属で異なる再検証対象、重複slug排除を確認。
他人や他クラブの入力値をServiceの成功結果へ取り込まないことを試験する。

### 粒度7：全操作のServer Action

**目的・内容**：Pageの表示を経由しない呼出しにも、本人認証・現在クラブ認可・入力検証を適用する。

**調査開始ファイル**

| 既存ファイル | 対象・理由 |
| --- | --- |
| `app/(club-app)/club/club-app-authorization.ts` | requireClubAppAccessを全Actionで実行 |
| `app/(club-app)/club/[clubSlug]/admin/members/actions.ts` | bind引数・認可由来ID・requestId・再検証・成功遷移の既存例 |
| `domain/shared/action-state.ts`、`domain/shared/request-id.ts` | 安全な状態構築。previousState全体を信用しない |
| `lib/forms/form-data.ts` | 単純getでは重複fieldを見落とす点 |
| `tests/club-members-actions.test.ts`、`tests/club-membership-authorization.test.ts` | 直接呼出し・認可失効の試験例 |
| `vitest.config.mts` | Nextの制御例外を保持したmock試験 |

**先行粒度適用後に確認**：粒度1・6の型・入力・Service・再検証・試験。

**変更予定の既存ファイル**：なし。

**新規案**

- `app/(club-app)/club/[clubSlug]/account/actions.ts`
- `tests/club-account-actions.test.ts`

公開async関数案は `updateAccountNameAction`、`createChildAction`、`updateChildAction`、
`addChildToClubAction`、`withdrawChildFromClubAction`、`getAttachableChildrenAction`。
最後は追加UIを開いたときだけ本人の選択候補を読むActionであり、書込はしない。
全てclubSlugから認可し、clubId・userId・actorMembershipIdは認可結果を使う。
表示時のtarget IDや作成識別子は形式と所有者を再検証。任意の戻り先は受け付けない。

requestIdは単一・UUID・前stateとの一致を確認。対象fieldはFile・重複・欠損を扱い、
stateには許可した入力と固定エラーだけを返す。子どもごとのstateを混ぜない。
成功後は再検証と固定のaccount遷移／安全な完了stateを使う。
保存済みの後処理失敗では保存済みと案内し、再作成を促さない。

**必要時だけ確認**：NextのAPIを使う箇所だけインストール済みローカル資料を参照。
catch範囲に制御例外が入るならunstable_rethrowを最初に呼び、原文エラーの公開やログ出力をしない。

**この粒度では変更しない**：logoutAction、共通認可、F05/F06 Action、Page、Client Component、package。

**完了条件・テスト**：未ログイン、別クラブ、非ACTIVE、プラン不可、別親Child、
親MembershipとChildClubMembershipの不一致、File・重複・不正ID、改ざんpreviousState、
直接呼出し、保存成功後の例外、制御例外伝播、ログへの氏名等の非出力を試験。
関数直接呼出しの試験を、HTTP Origin保護の実証としては報告しない。

### 粒度8：マイページと権限別導線

**目的・内容**：現在クラブの本人情報・所属Childを表示し、権限と利用可能所属数に応じた導線を接続する。

**調査開始ファイル**

| 既存ファイル | 対象・理由 |
| --- | --- |
| `app/(club-app)/club/[clubSlug]/layout.tsx` | ClubAppLayoutの認可・既存Header/Footerをそのまま使う |
| `app/(club-app)/club/[clubSlug]/_components/ClubFooter.tsx` | accountリンクは既存。再実装不要 |
| `app/(club-app)/club/club-app-authorization.ts` | Page自身でもrequireClubAppAccess |
| `app/(club-app)/club/find-active-club-memberships.ts`、`domain/club/club-login-destination.ts` | 利用可能ACTIVE件数を既存関数で判定 |
| `domain/club/club-member-role.ts` | isClubAdminRole、既存ラベル |
| `app/(club-app)/platform/require-platform-admin.ts` | 本人id・isActive。一般会員のリンク判定にguardを流用しない |
| `app/(club-app)/club/[clubSlug]/admin/events/page.tsx`、`admin/notice/page.tsx`、`admin/members/page.tsx` | 実在する管理リンク先と認可 |
| `app/(club-app)/club/[clubSlug]/admin/settings/line/page.tsx` | backHrefをaccountへ接続する予定箇所と表示ラベル |
| `components/form/PrivacyPolicyModal.tsx` | 既存文面はフォーム用で、アプリへ流用しない |
| `tests/club-membership-authorization.test.ts`、`domain/club/club-login-destination.test.ts`、`vitest.config.mts` | 認可・件数の回帰とDOMなしの前提 |
| `next.config.ts`、`package.json`、`package-lock.json` | 動的Page・Promise系APIの版確認 |

**先行粒度適用後に確認**：粒度1・6の表示DTOと読取Service。

**変更予定の既存ファイル**：`app/(club-app)/club/[clubSlug]/admin/settings/line/page.tsx` の戻り先とラベルだけ。

**新規案**

- `app/(club-app)/club/[clubSlug]/account/page.tsx`
- `app/(club-app)/club/[clubSlug]/account/AccountNavigation.tsx`
- `domain/club/account/account-links.ts`、`domain/club/account/account-links.test.ts`：確定した法的URLと安全な外部URLの扱い。
- `tests/club-account-pages.test.ts`
- `tests/club-account-navigation.test.ts`

params・searchParamsはPromiseとして解決。表示DTOは安全な必要項目だけをClientへ渡す。
OWNERはLINE・会員・イベント・お知らせ、COACH/OFFICERはイベント・お知らせ、MEMBERは管理リンクなし。
activeなPlatformAdmin本人だけに設計書の `/platform/support` 導線を表示する。
その遷移先自体は現在未実装で、F07外の依存として動作確認を分ける。
club切替は既存の利用可能ACTIVE件数で2件以上。共通Headerやselectの判定は変更しない。

公式HP・Instagramは現在クラブの設定値から、安全なhttp/httpsの絶対URLだけを表示。
javascript等のscheme、相対URL、資格情報入りURLを拒否し、別タブにはnoopener/noreferrerを付ける。
URL不正・未設定はリンクを隠す。プレビュー取得などサーバーからの外部通信は行わない。
規約・privacyはユーザーが確定した公開先だけを設定し、本文の新規作成や法的判断はこの計画で代行しない。
URL未確定のまま粒度8のリンク要件まで完了したとは扱わない。

**必要時だけ確認**：共通layoutにスクリプトや取得追加がある場合だけ参照先を確認。
法的URLやPlatform画面の提供状況を確認し、仮リンクで取り繕わない。

**この粒度では変更しない**：Header/Footer、select、Platform画面、規約本文、HP、サポート送信、入力フォーム。

**完了条件・テスト**：認可前の情報非開示、ロール4種、PlatformAdmin active/inactive/なし、
利用可能ACTIVE 0・1・2件、emailのreadonly表示、Child0・複数、取得失敗、URL安全性、LINEの戻り先。
確定URLの規約・privacy導線は受入時に必ず確認。粒度9までは編集操作未接続と報告する。

### 粒度9：本人氏名・複数Childのフォーム

**目的・内容**：独立したフォームstateで、氏名更新と各Childの追加・編集・所属操作を接続する。

**調査開始ファイル**

| 既存ファイル | 対象・理由 |
| --- | --- |
| `app/(club-app)/club/admin/_components/FieldErrorList.tsx`、`FormErrorAlert.tsx` | エラー表示propsとアクセシビリティ |
| `app/(club-app)/club/admin/_hooks/useScrollToFormError.ts` | ActionStateのエラーへフォーカス |
| `app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard.ts` | 必要なフォームだけdirty/pending連携 |
| `components/admin/modal/ConfirmModal.tsx`、`components/modal/BaseModal.tsx` | 独立form・hidden field・pending閉じる制御の制約を理解する |
| `app/(club-app)/club/[clubSlug]/admin/members/ClubMemberEditDialog.tsx` | useId、フォーカス復帰、pending時の閉じる抑止の実例 |
| `components/admin/ToastMessage.tsx` | 保存の固定文言と再マウントkey。入力をURLへ埋めない |
| `app/(club-app)/club/actions.ts`、`_components/ClubHeader.tsx` | 実際のlogoutActionと既存ヘッダー導線 |
| `vitest.config.mts` | node環境。DOM試験済みと主張しない |

上表 `_components/ClubHeader.tsx` のフルパスは
`app/(club-app)/club/[clubSlug]/_components/ClubHeader.tsx`。

**先行粒度適用後に確認**：粒度1・7・8の入力型、Action、Page、表示DTO、専用試験。

**変更予定ファイル**：粒度8で追加済みとなるaccount/page.tsx、必要なaccount専用Page試験。
現在存在するソースファイルの変更はなし。

**新規案（UIは `app/(club-app)/club/[clubSlug]/account/` 配下）**

- `AccountNameForm.tsx`
- `ChildForm.tsx`：新規・編集の項目を現在の規模に必要な範囲で共有。
- `ChildMembershipOperations.tsx`：所属解除と、明示要求時の既存Child候補・追加。
- `AccountConfirmDialog.tsx`：account内だけの確認UI。入力の持越し、pending、focusを扱う。
- `AccountLogoutButton.tsx`：確認後に既存logoutActionへ接続。

追加するテストの新規案：`tests/club-account-forms.test.ts`。

emailは入力欄にしない。Childごとに一意なkey・useId・requestIdを持たせ、
他の子の変更やエラーが混ざらないようにする。学年未設定を表示・保存できるようにする。
子どもの追加フォームは成功後に新しい作成識別子へ切り替える。
既存Childの追加候補は利用者が操作を開始してからActionで取得する。

AppUser氏名とChild編集には「他クラブにも反映」を表示し、保存前に確認。
解除ボタンは「現在クラブから外す」とし、Child本体や他クラブ所属が残る旨を表示する。
物理削除の表現・APIを設けない。pending時は連打・閉じる・別操作を適切に抑止する。
共通BaseModal全体の改修はせず、account限定の確認UIに必要なfocus・Esc・復帰を持たせる。
再取得された古い候補・stateは必ずAction／Repositoryで再確認する。

**必要時だけ確認**：ReactのuseActionState/useFormStatusの型、Nextローカル資料。
未保存警告を使う場合だけ既存hookの戻り値・イベント処理を追加確認。
フォーム確認用のFormDataを誤ってDOMへ表示・ログ出力しない。

**この粒度では変更しない**：共通Modal、Header/Footer、logoutAction本体、Repository、法的文書、サポートフォーム。

**完了条件・テスト**：入力とActionの接続、複数Childの独立state、null grade、確認前の未送信、
確認後の単一送信、解除の文言、影響範囲の注意、pending・エラー表示、readonly emailをnodeで検証。
focus trap・Esc・入力保持・ブラウザの戻る／再読込・ログアウトは実ブラウザで別確認する。

### 粒度10：統合受入と運用手順

**目的・内容**：DBの既存制約、本人・クラブの境界、グローバル編集、非削除を一連の操作で確認する。

**調査開始ファイル**

| 既存ファイル | 対象・理由 |
| --- | --- |
| `prisma/schema.prisma`、`prisma/migrations/20260816221153_add_club_app_schema/migration.sql` | Child所有者・クラブ・unique・FKの実制約 |
| `tests/club-id-integrity.integration.test.ts` | Childは未カバー、トップレベル共有client importに注意 |
| `tests/club-membership-repository.integration.test.ts` | UUID fixture、rollback、競合の既存例 |
| `tests/club-membership-authorization.test.ts`、`tests/club-members-actions.test.ts` | 既存認可・会員管理を壊さない回帰 |
| `domain/club/club-login-destination.test.ts`、`domain/club/club-revalidation-paths.test.ts` | クラブ切替と既存パス生成の回帰 |
| `package.json`、`vitest.config.mts`、`src/infrastructure/prisma/client.ts` | DB試験の明示flag・node設定・dotenv初期化を避ける注入 |

**先行粒度適用後に確認**：粒度1〜9の関連テストと実装、確認したDB・Action・Page間の参照だけ。

**変更予定の既存ファイル**：`package.json` の専用ローカルDB script追加だけ。
既存test:dbを含む他script・依存関係は変更しない。

**新規案**

- `tests/club-account.flow.integration.test.ts`
- `docs/runbooks/club-account.md`

F07専用flagとDB用flag、loopbackの使い捨てDB確認を要求し、通常のnpm testは実DBへ接続しない。
共有clientをトップレベルimportせず、専用clientをガード後に注入する。
fixtureは作成したUUIDだけを片付け、migration・実Auth変更・実メールは行わない。
F07はAuthメール・PWを更新しないため、実Authへの書込を受入試験へ混ぜない。

最低限の実DB確認：

- 自分と他人、クラブA/BのChild・親Membershipを用意し、親やクラブが食い違う複合FKの拒否。
- 同一Child・同一クラブの二重所属拒否、同じ作成識別子による新規送信一回限り。
- Childと初回所属のrollback。WITHDRAWN再有効化と、SUSPENDED・INVITED拒否。
- 解除で現在所属だけがWITHDRAWNとなり、Childと他クラブ所属が残ること。
- 別クラブから編集しても同じChild本体が更新され、複製されないこと。
- 氏名だけの更新でemail、子ども、所属が変わらないこと。
- 直接Action、失効した親Membership、作成・編集・解除・再有効化の競合。
- 氏名・Child更新後の他クラブ再読取と、サーバーで導出した対象への再検証。

実ブラウザではロール・PlatformAdmin・利用可能ACTIVE件数の導線、複数Child、確認UI、
focus、pending、再読込、ログアウト、readonly email、外部リンク、規約公開先を確認する。
HTTPのforeign Origin拒否や任意戻り先拒否は、関数直接試験とは分けて確認する。

**必要時だけ確認**：migration未適用や実DB制約の相違、インフラログの扱い。
本番設定・ログ内容の秘密値は取得・表示しない。SDK差が出た場合だけ当該型・公式仕様を確認。

**この粒度では変更しない**：実DB、schema、migration、共通テスト設定、Auth、メール、他フェーズ、E2Eパッケージ。

**完了条件・テスト**：単体・既存回帰・許可された使い捨てDB統合・実ブラウザの結果を区別して記録。
実行条件がなければskipと理由を記録し、実DB成功やF07受入完了と報告しない。
法的URL・Platform遷移先の未提供を、テストが通ったという理由で解消済みにしない。

## 7. DB・Prisma変更

**現時点ではschema変更・新規migration・型再export・パッケージ更新は不要。**

| 既存の根拠 | F07での利用 |
| --- | --- |
| `AppUser.id`、`AppUser.name`、`AppUser.email` | 本人nameだけを更新、emailは表示のみ |
| `Child.parentId`、`@@unique([id, parentId])` | 親本人のChildに限定するための所有者整合性 |
| `Child.grade Grade?` | ユーザー回答どおり未設定許可 |
| `ChildClubMembership(childId, parentUserId)` → `Child(id, parentId)` | 別親Childへの所属をDBでも拒否 |
| `ChildClubMembership(clubId, parentUserId)` → `ClubMembership(clubId, userId)` | 親の同一クラブ所属をDBでも要求 |
| `@@unique([clubId, childId])` | 同一Childの二重所属防止。再所属時は既存rowの状態変更 |
| `ClubMembershipStatus` | ACTIVE・WITHDRAWNの限定遷移。INVITED・SUSPENDEDを自己解除しない |

FKは親MembershipのACTIVE状態までは保証しない。本人認証、状態、利用プラン、操作権はアプリ側で確認する。
DBのnameはTextで、空白・100文字上限はDB制約ではない。Domain入力とRepositoryの条件を区別する。
既存migrationの本番適用状況は未確認。問題が判明しても別フェーズのDB修復をこの粒度へ混ぜない。

## 8. ユーザー操作からDBまでの処理フロー

ここに挙げるaccount用関数は前述の新規案。既存関数はそのまま利用する。

| 段階 | ファイル・関数 | 受け取る値 → 返す値 | DB変更 |
| --- | --- | --- | --- |
| ページ表示 | account/page.tsx → requireClubAppAccess → getClubAccount | Promise paramsのslug → 本人・クラブ確定 → readonly表示DTO | SELECTだけ |
| 本人照合 | club-membership-authorization.ts のrequireActiveClubMembership | Auth user.idとslug → ClubAccessContext | ACTIVE Membership・ClubをSELECT |
| データ読取 | club-account-repository.ts のfindClubAccountForUser | 認可済clubId・membershipId・userId → AppUser、現在ACTIVE Child、リンク用bool・設定 | SELECTだけ |
| 候補表示 | getAttachableChildrenAction → getAttachableClubChildren → findAttachableChildrenForUser | 現在slug → 親本人の追加可能Child DTO | SELECTだけ |
| 氏名保存 | AccountNameForm → updateAccountNameAction → updateClubAccountName → updateAccountNameForUser | name・requestId → 固定結果＋サーバー由来影響slug | AppUser.nameだけUPDATE |
| Child新規 | ChildForm → createChildAction → createClubChild → createChildForUser | name・grade・作成識別子 → 固定結果 | Child INSERTと現在CCM ACTIVE INSERTを同一transaction |
| Child編集 | ChildForm → updateChildAction → updateClubChild → updateChildForUser | childId・name・grade → 固定結果 | 所有者・現在ACTIVE所属を照合してChildだけUPDATE |
| 既存を追加 | ChildMembershipOperations → addChildToClubAction → addClubChild → addChildToClubForUser | 選択childId → 固定結果 | 現在CCM INSERTまたはWITHDRAWN→ACTIVE |
| 現在から外す | 同UI → withdrawChildFromClubAction → withdrawClubChild → withdrawChildFromClubForUser | 対象childId／所属ID → 固定結果 | 現在CCM ACTIVE→WITHDRAWN。Childと他クラブは無変更 |
| 完了 | Action → F07用再検証 → 固定のaccount遷移／完了state | 内部成功結果 → 固定メッセージ | DB再更新なし |
| ログアウト | AccountLogoutButton → 既存logoutAction | 確認操作 → /club-login | アプリDB変更なし、現在Auth sessionだけ終了 |

accountのUI・Actionパスは `app/(club-app)/club/[clubSlug]/account/`、
Serviceは `src/application/club/account/`、Repositoryは `src/infrastructure/prisma/repositories/`。
粒度1〜7ではUIが未接続、粒度8では編集フォームが後続粒度9であることを各完了報告へ明記する。

## 9. 危険箇所・設計上の判断

| 危険箇所 | 対応・根拠 |
| --- | --- |
| 他親Child・他クラブ所属の操作 | 認可由来userId・clubIdと対象IDをRepositoryでも併用。schemaの複合FKだけには依存しない |
| 「外す」をdeleteと誤解 | 現在のCCMをWITHDRAWNにする。F07にChild.delete APIを作らない |
| グローバル編集の見落とし | 保存前の横断反映注意、内部導出slugに対する再検証。AppUser.nameはOWNER会員一覧も対象 |
| 自己停止解除 | SUSPENDED・INVITEDは本人が再有効化しない。状態ポリシーと条件付き更新 |
| 認可後の状態失効 | Repositoryのtransaction内再照合。競合・更新0件・rollbackを試験する |
| 連打・並行送信 | pendingに加えunique・状態条件。新規Childは同一作成識別子を使うcreate-only方式 |
| 同姓同名を重複と決めつける | Child.idで識別。nameとgradeで既存Childを自動特定・マージしない |
| グローバル項目の同時編集 | F07で楽観ロック基盤を増やさない。最後の書込が反映され得る点を受入時に確認し、必要性が出たら別途検討 |
| 隠すだけの権限制御 | Page・Action・Repositoryを分担。Platformリンク非表示はPlatform画面の認可の代わりにならない |
| 読取で他クラブ情報まで収集 | 現在一覧と明示要求の本人候補を分離。候補に他クラブ名・Membership詳細を含めない |
| email変更の混入 | Auth/DBのreadonly表示だけ。更新payloadにemailを含めない。値が不一致でも自動修復しない |
| 古い共通フォーム処理の模倣 | getStringValueだけでは重複fieldの拒否にならない。F07の入力契約と直接Action試験で補う |
| 例外・ログへの個人情報 | fixed outcome／固定文言。DomainErrorの任意publicMessageやcauseをそのまま反射しない |
| 外部URLの不正scheme | http/https絶対URLだけ。URLをサーバーfetchしない。資格情報入り・不正・未設定は非表示 |
| 保存後に再検証だけ失敗 | 保存済みの案内と再読取。Childの再作成を促さない |
| shared Modalの制約 | 既存全体を改造せずaccount用の確認UIで対応。フォーカス・pendingは実ブラウザも確認 |
| 将来の利用規模 | 取得は親本人と現在クラブの範囲に絞る。無制限の全会員取得、将来専用の抽象化や一覧基盤は作らない |

## 10. テスト・patch作成時の共通確認

- 各粒度では、その粒度の新規・変更テストと、変更した既存シンボルの関連回帰だけを先に実行する。
- Domainの純粋関数、RepositoryのDBなし境界、Service、Action、Pageの責務を分けて試験する。
  実装をそのままなぞるだけのテストや、存在しないブラウザ確認結果は増やさない。
- node環境のまま、Pageの分岐・Clientへ渡すprops・固定リンクを試験可能。
  新しいDOM/E2Eパッケージを追加しない。focus・modal・連打・戻る操作は実ブラウザ結果を別記する。
- `tests/club-id-integrity.integration.test.ts` のように共有clientをimportする既存DB試験は、
  .envを読まない調査／通常試験のために無条件で起動しない。
- 粒度10の専用DBテストは明示flag、loopback、使い捨て確認、UUID限定cleanupを要求する。
  本番接続、実Auth書込、実メール、migration適用は行わない。
- 変更箇所のESLint・型チェックを実施。全体check/buildを実行していないなら実行済みと報告しない。
- patch作成時は `git status --short`、ブランチ・HEAD確認、指定粒度のdiff生成、
  `git apply --check feature.patch`、`git apply --stat feature.patch`、最後のstatus確認を行う。
  元のソース・indexへpatchを適用しない。

今回の計画作成ではテスト・build・DB接続は実行していない。
検索、指定箇所の読取、package/lockの版照合、ローカルNext資料確認だけを実施した。

## 11. 設計書との差・未確認事項・F07外の依存

| 項目 | 判断・必要な追加確認 |
| --- | --- |
| F07はaccount「追加」 | 現在もPageはないため追加が必要。Footerリンクとlayoutは既にあるので再実装しない |
| 学年 | 背景の選択UIを必須と解釈しない。ユーザー回答によりnull許可で確定 |
| 既存所属の再有効化 | 背景に詳細状態の記載が薄い。ユーザー回答によりWITHDRAWNだけで確定 |
| クラブ切替件数 | F07のACTIVE件数はユーザー回答によりアプリ利用可能件数とする。既存コードと一致 |
| 背景の関数名 | findClubAccountPageData等は設計案で、実コードにはない。上記新規案と実装済み関数を混同しない |
| 背景の単一account更新フォーム | F07の複数Child・追加／解除を安全に扱うため、本人氏名とChild単位の操作へ分離。全件置換保存はしない |
| 規約・privacy | 公開URLとアプリ用文面が未確定。内容・公開先の提供は担当者依存。F07で法的文面を創作しない |
| PlatformAdmin導線 | `/platform/support` は背景設計のURL。現在はguardのみで遷移先Pageがない。F07は本人限定リンク判定、画面本体は他フェーズ |
| Platformログイン | requirePlatformAdminは `/platform-admin/login` へredirectするが実在ページは未確認。F07で新設・修正しない |
| サポート報告 | 背景には送信フォーム・userAgent等があるが、F07の実装範囲には含めない。別フェーズへ切り出す |
| HPのprivacyモーダル | 問い合わせ・体験用途の文面であり、アプリ用の公開先として流用しない |
| name上限・空欄 | trim・空欄拒否・100文字を既存招待に合わせる実装案。F07仕様の明文化は粒度1で行う |
| 所属一覧の状態 | ACTIVEを現在所属一覧、WITHDRAWNは明示追加候補、他2状態は自己操作不可という方針を粒度1で明文化 |
| DB・RLS・接続権限 | schema/migrationは確認済みだが、実環境での適用と実際のDB権限・RLSの動作は未確認 |
| Prismaの版 | lockのCLI 7.9.1とClient 7.8.0の差は既存。実装時の型・検証に問題があればF07へ更新を混ぜず報告 |
| 同時認可失効 | transaction再照合だけで必要な競合条件を満たすか実DB試験が必要。満たさなければ最小のロック等の変更案を示す |
| 本番ログ・外部URL設定 | 内容・個人情報を取得せず、運用担当が安全な設定・公開先を確認 |
| 現在のテスト成功状況 | 今回は未実行。過去フェーズの成功件数をF07の成功として流用しない |

規約URL、Platform遷移先、許可された実DB・ブラウザの受入環境は、F07の完了判断に残る外部依存。
それらを実装済み・確認済みと推測せず、各patchと最終受入で状態を明記する。

## 12. 自己確認

- [x] F07以外の機能実装を計画へ混ぜていない。既存機能の参照・回帰は実装範囲と分けた。
- [x] DB制約、クラブ選択、共通認可、ログアウト、フッター、ロール判定を重複実装しない。
- [x] 変更予定の現在存在するファイルは実際に確認し、新規案・先行粒度後のファイルと区別した。
- [x] 呼出し元、認可、Repository、Action、再検証、関連テスト、テスト設定を追跡した。
- [x] 子どもの本人・現在クラブ境界、グローバル反映、非削除、学年null、状態限定を明記した。
- [x] ユーザー回答を反映し、公開URL・実環境・未実施試験を推測で埋めていない。
- [x] ソース・Git index・依存関係・実DB・Authを変更していない。変更対象はこの計画書だけ。
