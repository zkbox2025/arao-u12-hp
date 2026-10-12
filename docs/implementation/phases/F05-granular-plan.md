//docs/implementation/phases/F05-granular-plan.md
F05実装粒度計画

patch単位の実装計画
以下の順序で進めます。

粒度5：新規招待・再送のApplication Service
コミット例：feat: add recoverable invitation sending
変更予定ファイル一覧
元計画の区分	ファイル	現在の区分
当初の新規対象	src/application/club/invitation/send-club-invitation.ts	新規作成予定。最新添付に内容なし。
当初の新規対象	src/application/club/invitation/send-club-invitation.test.ts	新規作成予定。最新添付に内容なし。


未作成の新規予定ファイルは上表の「新規作成予定」の行。これらは既存の調査開始ファイルには含めない。
実装内容・確認するテスト
主な関数
inviteClubMember()
resendClubInvitation()
新規と再送で実際に共通する準備・配送処理は、このファイル内で共有します。汎用的なワークフローエンジンは作りません。
新規招待の処理順序
1. メール送信・URL設定が利用可能か確認。
2. 正規化emailと既存Membership・招待を確認。
3. DBへPREPARINGを作成し、処理権を取得。
4. 新規・既存・準備途中のAuth状態を判定。
5. 必要な場合だけ認証リンクを生成。
6. 取得したAuthユーザーIDをDBへ記録。
7. transactionでAppUser・Membership・Invitationを紐付け。
8. READY_TO_SENDへ変更。
9. transaction外でResendへ送信。
10. 条件付き更新でSENTまたはEMAIL_FAILEDへ変更。
Auth作成直後にauthUserIdを記録するのは、その後のDB保存に失敗した場合の復旧地点を作るためです。
ただし、その記録自体も失敗し得るため、粒度9の手動復旧も用意します。
再送時
- 未承諾で、関連MembershipがINVITEDであることを再確認。
- 一定の再送間隔を設ける。
- tokenを入れ替える。
- 必要な認証リンクも再生成。
- 既存のAppUser・Membershipを重複作成しない。
- Auth確認済みユーザーへ無条件にtype: "invite"を使わない。
障害テスト
最低限、次の位置で失敗させます。
- PREPARING保存前。
- Authリンク生成時。
- Auth成功後のID記録時。
- AppUser・Membershipのtransaction時。
- Resend送信時。
- Resend成功後のSENT更新時。
それぞれについて、残るDB状態と次に可能な操作を確認します。
1. 調査開始ファイル
既存ファイルのパス	確認する関数・型・設定	確認理由
src/infrastructure/prisma/repositories/club-invitation-repository.ts	予約・再送claim・Auth記録・準備完了・メール結果・claim解除の関数とClubInvitationProcessing	外部処理の前後で使用する現在の引数・outcomeを確認する。
tests/club-invitation-repository.integration.test.ts	RESERVED/CLAIMED/PREPARED、Auth不一致、rollback、古いclaim、既存ユーザーの保持	Serviceのmockを実Repositoryの契約と一致させる。
src/infrastructure/supabase/club-invitation-auth.ts	generateClubInvitationAuthLink()、getClubInvitationAuthUserById()、isEmailConfirmed	新規・準備途中・確認済みAuthを同じinvite処理へ流さない。
src/infrastructure/supabase/club-invitation-auth.test.ts	確認済みユーザー拒否、既知Auth IDの照合、リンク検証	新規と再送で許されるAuth呼出しを確認する。
lib/mail/club-invitation-mail.ts	ClubInvitationEmailInput、sendClubInvitationEmail()の3種類のoutcome	ACCEPTEDをメール到達と混同せず、UNKNOWNを通常の拒否と同一視しない。
lib/mail/club-invitation-mail.test.ts	同じ試行のpayload/key、新しい試行のkey、UNKNOWN	再試行に必要な送信試行番号とpayloadの条件を把握する。
domain/club/invitation/invitation-form.ts	ValidClubMemberInviteInput・検証規則	Serviceの入力を既存の検証済み型へ合わせる。
domain/club/invitation/invitation-policy.ts	期限、再送間隔、PREPARING・INVITED・leaseの条件	処理中・復旧待ちの扱いを確認する。
src/infrastructure/security/token.ts	createSecureToken()、hashToken()	平文はメモリ中のリンク作成だけに使い、DBへhashを渡す。
src/infrastructure/security/token.test.ts	生成形式とhashの既存テスト	独自のtoken生成処理を増やさない。
lib/mail/resend.ts	RESEND_API_KEY・MAIL_FROM_ADDRESSの読み込みとbuildMailFrom()	送信前の利用可否確認を実際の設定と合わせる。
prisma/schema.prisma	Club.appBaseUrl・name・timezone、AppUser、ClubInvitation、Membership	URL・文面に必要なデータとユーザー紐付けの根拠を確認する。
domain/shared/domain-error.ts	DomainErrorの固定code/publicMessage	Service結果・例外に外部原文や秘密値を混ぜない。
package.json	test、型チェックと依存指定	この粒度で新しい依存を追加せずテストを検出できることを確認する。
vitest.config.mts	environment: node、include、@ alias、server-only alias	対象テストの検出・モック条件を確認する。


2. 必要時だけ確認
追加調査する条件	確認するファイル・情報	確認する内容
サーバー側URLの取得・検証・優先順位を確定する場合	.env.example、scripts/validate-env.mjs、Club.appBaseUrlの必要な参照元	APP_BASE_URLとクラブ別URLのどちらを招待リンクに使うかは未確定。値をクライアント入力から受け取らない設計を確定する。
新規・既存ユーザーのリンクの到着先を組み立てる場合	app/(club-app)/auth/confirm/route.ts、実際の招待承諾ルート（未確認）	既存GETはrecovery専用。invite受入れ・承諾画面のパスを推測しない。未実装なら後続機能との接続条件・計画変更案を報告する。
Auth作成後の障害やUNKNOWN後の再試行に必要なAPIが足りない場合	src/infrastructure/prisma/repositories/club-invitation-repository.ts、src/infrastructure/supabase/club-invitation-auth.ts、lib/mail/club-invitation-mail.ts の該当型・関数とテスト	同じtoken/payloadを再試行できる範囲、Auth ID記録失敗後の復旧境界を明らかにする。不足する既存APIはこの粒度で勝手に増やさない。
共通ログ整形を再利用する場合	src/infrastructure/logging/sanitize-log-context.ts、src/infrastructure/logging/sanitize-log-context.test.ts	sanitizeLogContext()の許可項目を確認する。メールやリンク等を入力しない。
外部エラーの型がアダプターの契約だけで確定できない場合	インストール済みSDKの型（実パス未確認）	原則はアダプターの結果を使用し、ServiceへSDK依存を漏らさない。


3. この粒度では変更しない
- 粒度1〜4のDomain・Repository・DB・Auth/Mailアダプター・共通クライアントの変更。
- Action、画面、取消Service、管理一覧Service、復旧スクリプト、認証/招待承諾ルート。
- 環境変数・package.jsonの変更、実メール送信、実Auth操作。汎用ワークフローエンジンは追加しない。
対象外でも互換性・セキュリティ確認のための読み取りは可能。変更が必要なら、理由・影響・対象追加を含む計画変更案を先に報告する。

粒度6：取消・期限切れ・復旧・管理画面用取得
コミット例：feat: add invitation lifecycle recovery
変更予定ファイル一覧
元計画の区分	ファイル	現在の区分
当初の新規対象	src/application/club/invitation/cancel-club-invitation.ts	新規作成予定。最新添付に内容なし。
当初の新規対象	src/application/club/invitation/cancel-club-invitation.test.ts	新規作成予定。最新添付に内容なし。
当初の新規対象	src/application/club/invitation/recover-club-invitation.ts	新規作成予定。最新添付に内容なし。
当初の新規対象	src/application/club/invitation/recover-club-invitation.test.ts	新規作成予定。最新添付に内容なし。
当初の新規対象	src/application/club/invitation/get-club-member-management.ts	新規作成予定。最新添付に内容なし。
当初の新規対象	src/application/club/invitation/get-club-member-management.test.ts	新規作成予定。最新添付に内容なし。


未作成の新規予定ファイルは上表の「新規作成予定」の行。これらは既存の調査開始ファイルには含めない。
実装内容・確認するテスト
主な関数
cancelClubMemberInvitation()
recoverClubInvitationPreparation()
getClubMemberManagement()
管理画面用取得
getClubMemberManagement()は次の順に処理します。
1. 対象クラブの期限切れ招待を更新。
2. 既存のfindClubMembershipsForOwner()でメンバー取得。
3. findClubInvitationsForOwner()で招待状況取得。
4. 画面用の安全な結果を返す。
Auth APIを1人ずつ問い合わせて一覧を作ることはしません。DBの一括取得で構成します。
復旧方針
- authUserIdが記録済みなら、そのIDをAuthで確認して復旧。
- ID・email・clubId・Invitationの状態が一致しなければ中止。
- Authユーザーを削除してやり直す処理は作らない。
- ID未記録の障害は、運営者が粒度9の手順で復旧。
取消・期限切れ・再送と古い送信処理が競合しても、古い処理がSENTへ戻せないことをテストします。
1. 調査開始ファイル
既存ファイルのパス	確認する関数・型・設定	確認理由
src/infrastructure/prisma/repositories/club-invitation-repository.ts	cancelClubInvitation()、expireClubInvitations()、findClubInvitationsForOwner()、claim/準備関連関数	OwnerInputのactorMembershipId、FOUND/EXPIRED/認可失敗等の結果を扱う。
tests/club-invitation-repository.integration.test.ts	取消のINVITED削除・履歴保持、失敗rollback、期限切れ、古いclaim、最小DTO	既存の取消/期限切れ契約をServiceから崩さない。
src/infrastructure/prisma/repositories/club-membership-repository.ts	findClubMembershipsForOwner()、ClubMembershipForOwner	DBの一括取得で表示名・メール・Membershipと招待状態を得る。
tests/club-membership-repository.integration.test.ts	一覧の安全なselect・表示用DTO	AuthをN+1で問い合わせる一覧取得へ置き換えない。
src/infrastructure/supabase/club-invitation-auth.ts	getClubInvitationAuthUserById()、ClubInvitationAuthUser	記録済みAuth IDとemailを確認して復旧する。
src/infrastructure/supabase/club-invitation-auth.test.ts	ID/email不一致、user_not_found、確認済みAuthのケース	不一致や欠損を新規ユーザー作成で穴埋めしない。
domain/club/invitation/invitation-policy.ts	取消・再送・利用可否、PREPARING未紐付けとEXPIREDの違い	期限切れ更新と復旧を別の操作として扱う。
prisma/schema.prisma	Invitation.authUserId・membershipId・claim、ClubMembership.status、SetNull	復旧できる状態と履歴保持を確認する。
domain/shared/domain-error.ts	安全なエラーcode/publicMessage	取得や復旧の障害を個人情報・秘密のない結果に変換する。
package.json	test、既存DBテスト登録	新しいService unit testの検出と既存テストとの切分けを確認する。
vitest.config.mts	environment: node、include、@ alias、server-only alias	対象テストの検出・モック条件を確認する。


着手時に確認する前提粒度の成果物（最新添付に未収録・実際の定義は未確認）
予定パス	確認する予定の関数・型・テスト	前提	理由・現在の確認状態
src/application/club/invitation/send-club-invitation.ts	予定: inviteClubMember()・resendClubInvitation()、結果型	粒度5	準備・配送の実際の共通処理を再利用する。最新添付に未収録・実際の定義は未確認。
src/application/club/invitation/send-club-invitation.test.ts	予定: Auth/DB/メールの障害テスト	粒度5	実際に残る状態を確認し、復旧テストに接続する。最新添付に未収録・実際の定義は未確認。


該当の前提粒度を適用した後に実ファイルを読む。まだ存在しない場合は依存条件を報告し、前提機能をこの粒度へ混ぜて実装しない。
2. 必要時だけ確認
追加調査する条件	確認するファイル・情報	確認する内容
画面へ返すDTO・日時・エラー結果の形式を決める場合	app/(club-app)/club/[clubSlug]/admin/members/page.tsx、domain/club/member/member-labels.ts	既存表示の要求を読むだけにとどめる。ComponentへProcessing DTOを渡さない。
復旧に必要な秘密情報が画面用DTOにない場合	src/infrastructure/prisma/repositories/club-invitation-repository.ts のclaim取得時のClubInvitationProcessingと既存の更新API	画面用DTOへauthUserId/claimTokenを足す方法は採らない。内部APIが不足なら計画変更案を報告する。
取消・期限切れ中の配送競合の期待値を判断する場合	tests/club-invitation-repository.integration.test.ts、lib/mail/club-invitation-mail.test.ts	既に外部配送されたメール自体は取り消せないため、token失効と古いDB更新拒否を検証する。
Auth SDK側の動作が既存アダプターの契約では不明な場合	インストール済みSDKの型・対応する公式資料（型の実パス未確認）	取得だけで足りるかを確認する。Auth削除を復旧手順へ追加しない。


3. この粒度では変更しない
- Domain・Repository・schema・migration・Auth/Mailアダプター・粒度5のServiceの変更。
- Action・Page・Component・共通認可・package.json・環境変数。
- Auth ID未記録の手動復旧スクリプト、Authユーザー削除、Supabase Authを使った一覧取得。
対象外でも互換性・セキュリティ確認のための読み取りは可能。変更が必要なら、理由・影響・対象追加を含む計画変更案を先に報告する。


粒度7：Server Action・認可・結果表示
コミット例：feat: add owner invitation actions
変更予定ファイル一覧
元計画の区分	ファイル	現在の区分
当初の新規対象	app/(club-app)/club/[clubSlug]/admin/members/invitation-actions.ts	新規作成予定。最新添付に内容なし。
当初の新規対象	tests/club-invitation-actions.test.ts	新規作成予定。最新添付に内容なし。


未作成の新規予定ファイルは上表の「新規作成予定」の行。これらは既存の調査開始ファイルには含めない。
実装内容・確認するテスト
F04の権限・状態変更用actions.tsへ、招待処理を大量に追加しない構成です。
主なAction
inviteClubMemberAction()
resendClubInvitationAction()
cancelClubInvitationAction()
全Actionの共通ルール
1. 最初にrequireClubAppOwnerAccess(clubSlug)。
2. requestId検証。
3. 入力値の検証。
4. 認可結果のclubId・actorMembershipIdをServiceへ渡す。
5. 結果を安全な入力エラー・固定メッセージへ変換。
6. 必要に応じてrevalidateClubMemberPaths()。
7. 固定toast付きでメンバー管理へredirect。
次はクライアントから受け取りません。
- clubId
- 招待者Membership ID
- authUserId
- tokenHash
- 送信先URL
- Membershipの初期status
メール送信に失敗してもDBに招待が残った場合は、一覧を更新して「送信失敗・再送可能」と表示します。「作成自体がなかった」ようには見せません。
テスト
- MEMBER・COACH・OFFICERから直接呼ばれても処理しない。
- role改ざん・requestId不正を拒否。
- 他クラブのInvitationを変更できない。
- キャンセル済み・承諾済みへの再送を拒否。
- DB保存済み／メール失敗の結果を正しく表示。
- ログ・ActionStateに秘密情報が含まれない。
- redirect()・notFound()を一般的なcatchで捕捉しない。
1. 調査開始ファイル
既存ファイルのパス	確認する関数・型・設定	確認理由
app/(club-app)/club/[clubSlug]/admin/members/actions.ts	updateClubMembershipAction()の認可・requestId・例外・redirectの順序	F04のActionに招待処理を混ぜず、同じ安全な入口の方式を使う。
tests/club-members-actions.test.ts	認可拒否、改ざん、DB失敗、再検証・redirectのmock	実績のあるActionテスト形式と認可順を再利用する。
app/(club-app)/club/club-app-authorization.ts	requireClubAppOwnerAccess()、返却するclub・membership	URLのslugに基づくOWNER認可結果からIDを得る。
app/(club-app)/club/club-membership-authorization.ts	requireActiveClubMembership()・requireClubOwner()・ClubAccessContext	現在のACTIVE確認とOWNER確認を把握する。
tests/club-membership-authorization.test.ts	既存セッション・SUSPENDED/WITHDRAWN・MEMBER拒否	招待Actionでも失効した所属を許可しない。
domain/shared/request-id.ts	isRequestId()	送信IDの形式とpreviousStateとの一致検証に使う。
domain/shared/action-state.ts	ActionState、FieldErrors	入力エラー時に送信値を安全に戻す。
domain/club/invitation/invitation-form.ts	build/validate関数、ClubMemberInviteActionState	既存のフォーム型とrole制限を入口で使う。
domain/club/member/member-toast.ts	getClubMembersToastMessage()、招待用の固定識別子	メール失敗・復旧待ちを安全な結果表示に変換する。
app/(club-app)/club/revalidate-club-paths.ts	revalidateClubMemberPaths()	成功・DB保存済みのメール失敗後に一覧を再取得する。
src/infrastructure/prisma/prisma-error.ts	convertPrismaError()	既存の安全なDBエラー変換との整合を確認する。
package.json	Next.js、test、typecheck	実装・検証の対応版を確認する。
vitest.config.mts	environment: node、include、@ alias、server-only alias	対象テストの検出・モック条件を確認する。


着手時に確認する前提粒度の成果物（最新添付に未収録・実際の定義は未確認）
予定パス	確認する予定の関数・型・テスト	前提	理由・現在の確認状態
src/application/club/invitation/send-club-invitation.ts	予定: inviteClubMember()・resendClubInvitation()、結果型	粒度5	実際のService結果を固定文言へ変換する。最新添付に未収録・実際の定義は未確認。
src/application/club/invitation/send-club-invitation.test.ts	予定: 途中失敗・DB保存済み/送信不明のテスト	粒度5	Actionの結果を障害後のDB状態に一致させる。最新添付に未収録・実際の定義は未確認。
src/application/club/invitation/cancel-club-invitation.ts	予定: cancelClubMemberInvitation()、結果型	粒度6	取消のID・認可情報・結果契約を確認する。最新添付に未収録・実際の定義は未確認。
src/application/club/invitation/cancel-club-invitation.test.ts	予定: 拒否・競合・取消結果のテスト	粒度6	Serviceの拒否をActionが正しく扱う。最新添付に未収録・実際の定義は未確認。


該当の前提粒度を適用した後に実ファイルを読む。まだ存在しない場合は依存条件を報告し、前提機能をこの粒度へ混ぜて実装しない。
2. 必要時だけ確認
追加調査する条件	確認するファイル・情報	確認する内容
再検証されるURLの範囲が不明な場合	domain/club/club-revalidation-paths.ts、domain/club/club-revalidation-paths.test.ts	getClubMemberRevalidationPaths()の一覧を確認する。変更が必要なら対象拡張を報告する。
フォーム初期値・引数bindの形を決める場合	app/(club-app)/club/[clubSlug]/admin/members/page.tsx	現在のcreateInitialActionState()/bind()の使い方だけ確認する。Pageはまだ変更しない。
Next.jsのAction・redirect・notFoundの契約を確認する場合	インストール済みNext.jsの関連資料。node_modules/next/dist/docs/の存在は未確認	存在すれば必要箇所を検索し、なければ対応版の公式資料を確認する。
ログ整形・DomainErrorの扱いを追加する場合	domain/shared/domain-error.ts、src/infrastructure/logging/sanitize-log-context.ts、src/infrastructure/logging/sanitize-log-context.test.ts	固定codeと許可された識別子だけをログへ渡す。
旧Actionとの互換性や再送結果型に疑義がある場合	変更するシンボルをrgで特定した呼出し元・テスト	まだ存在しない画面のコードは推測せず、粒度8で接続する予定を残す。


3. この粒度では変更しない
- F04のmembers/actions.ts、共通認可・再検証関数の変更。
- Domain・Repository・DB・Auth/Mailアダプター・Application Serviceの変更。
- Page・Component、ブラウザから任意Auth IDを指定する復旧Action、package.json・環境変数の変更。
対象外でも互換性・セキュリティ確認のための読み取りは可能。変更が必要なら、理由・影響・対象追加を含む計画変更案を先に報告する。


粒度8：メンバー管理画面への組み込み
コミット例：feat: add member invitation management UI
変更予定ファイル一覧
元計画の区分	ファイル	現在の区分
当初の新規対象	app/(club-app)/club/[clubSlug]/admin/members/ClubMemberInviteForm.tsx	新規作成予定。最新添付に内容なし。
当初の新規対象	app/(club-app)/club/[clubSlug]/admin/members/ClubInvitationOperations.tsx	新規作成予定。最新添付に内容なし。
変更対象	app/(club-app)/club/[clubSlug]/admin/members/page.tsx	添付では既存。現在との差分だけを対象とする。
変更対象	app/(club-app)/club/[clubSlug]/admin/members/loading.tsx	添付では既存。現在との差分だけを対象とする。


未作成の新規予定ファイルは上表の「新規作成予定」の行。これらは既存の調査開始ファイルには含めない。
実装内容・確認するテスト
表示内容
既存メンバー一覧を残し、次を追加します。
新規招待フォーム
- メールアドレス
- 氏名
- role
- 招待メール送信ボタン
招待状況
- 氏名・メール
- 招待状態
- 有効期限
- 最終送信日時
- 再送／準備の再試行
- 招待取消
- 運営者による復旧が必要な場合の固定案内
Membership未作成のPREPARINGも、この招待状況に表示します。
UI上の注意
- pending中は対象の操作ボタンを無効化。
- エラー時は送信した入力値を保持。
- FieldErrorList・FormErrorAlert・useScrollToFormErrorを再利用。
- 招待フォームではuseUnsavedChangesGuardを再利用。
- 取消確認は既存F04と同じPortal方式。
- 入力中に定期的なrouter.refresh()でフォームを初期化しない。
- force-dynamicを維持し、個人情報を共有キャッシュへ保存しない。
- フッター・既存の権限変更モーダルは変更しない。
1. 調査開始ファイル
既存ファイルのパス	確認する関数・型・設定	確認理由
app/(club-app)/club/[clubSlug]/admin/members/page.tsx	ClubMembersPage()、OWNER認可、force-dynamic、既存メンバー一覧・toast・初期値	既存一覧を維持して招待フォームと招待状況を加える。
app/(club-app)/club/[clubSlug]/admin/members/loading.tsx	既存のloading表示	追加される画面領域の読み込み表示を合わせる。
app/(club-app)/club/[clubSlug]/admin/members/ClubMemberEditDialog.tsx	ClubMemberEditDialog()、OpenDialog()、createPortal、pending、フォーカス・キャンセル	取消確認をスマホ中央に表示する既存の方式を確認する。読み取りのみ。
app/(club-app)/club/admin/_components/FieldErrorList.tsx	FieldErrorListとprops	フィールドエラー表示を再利用する。
app/(club-app)/club/admin/_components/FormErrorAlert.tsx	FormErrorAlertとprops	フォーム全体エラーの既存契約を使う。
app/(club-app)/club/admin/_hooks/useScrollToFormError.ts	useScrollToFormError()と要求するref・属性	エラー後の移動が既存hookと一致するようにする。
app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard.ts	useUnsavedChangesGuard()と引数・pendingの扱い	招待フォームの未保存変更を保護する。
domain/club/invitation/invitation-form.ts	ClubMemberInviteFormValues・ActionState・role定数	入力保持、role選択、送信の型を一致させる。
domain/shared/action-state.ts	createInitialActionState()	新規招待フォームの初期値・requestIdを作る。
domain/club/member/member-labels.ts	getClubInvitationStatusLabel()、getClubMembershipStatusLabel()	招待状態と在籍状態を別々に表示する。
domain/club/member/member-toast.ts	固定識別子とメール失敗・復旧待ちの文言	全てを成功色にせず、失敗/要確認を区別して表示する。
domain/shared/date-time/club-date-time.ts	formatClubDateTime()	有効期限と送信日時をクラブのtimezoneに合わせる。
app/(club-app)/club/club-app-authorization.ts	requireClubAppOwnerAccess()	データ取得前のOWNER認可を維持する。
tests/club-members-actions.test.ts	既存の権限変更Actionの契約	既存の編集モーダルを新しい招待処理と混線させない。
package.json	React・Next.js・test・build	既存UI環境を使う。ブラウザ用テスト環境を勝手に導入しない。
vitest.config.mts	environment: node、include、@ alias、server-only alias	対象テストの検出・モック条件を確認する。


着手時に確認する前提粒度の成果物（最新添付に未収録・実際の定義は未確認）
予定パス	確認する予定の関数・型・テスト	前提	理由・現在の確認状態
src/application/club/invitation/get-club-member-management.ts	予定: getClubMemberManagement()、画面用戻り値	粒度6	実際の安全なDTOと取得順序を確認する。最新添付に未収録・実際の定義は未確認。
src/application/club/invitation/get-club-member-management.test.ts	予定: 期限切れ更新・メンバーと招待の一括取得	粒度6	PREPARING未紐付けも一覧に出る契約を確認する。最新添付に未収録・実際の定義は未確認。
app/(club-app)/club/[clubSlug]/admin/members/invitation-actions.ts	予定: inviteClubMemberAction()/resendClubInvitationAction()/cancelClubInvitationAction()	粒度7	実際の引数・bind・ActionState・redirectを確認する。最新添付に未収録・実際の定義は未確認。
tests/club-invitation-actions.test.ts	予定: 認可・入力保持・DB保存済みメール失敗	粒度7	ボタン状態・エラー表示をActionの実結果へ合わせる。最新添付に未収録・実際の定義は未確認。


該当の前提粒度を適用した後に実ファイルを読む。まだ存在しない場合は依存条件を報告し、前提機能をこの粒度へ混ぜて実装しない。
2. 必要時だけ確認
追加調査する条件	確認するファイル・情報	確認する内容
共通hookの制約で入力保持・pending・スクロールが成立しない場合	app/(club-app)/club/admin/_hooks/useScrollToFormError.ts、app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard.ts の参照元をrgで検索	同じ共通hookを使うフォームの必要箇所だけ確認し、共通修正が必要なら対象拡張を報告する。
Portalの配置・スクロールロック・アクセシビリティに疑義がある場合	app/(club-app)/club/[clubSlug]/admin/members/ClubMemberEditDialog.tsx、実ワークツリーで検索した該当CSS	transform等の祖先条件、フォーカス復帰、キーボード操作を確認する。CSSパスは検索で確定する。
フッターやレイアウトが新フォームの操作を妨げる場合	app/(club-app)/club/[clubSlug]/_components/ClubFooter.tsx とその必要な参照元	互換性のため読み取り可能。変更はこの粒度の対象へ勝手に加えない。
Node環境では確認できないPortal・hookの操作を検証する場合	実ブラウザ・スマートフォンでの確認手順。既存UIテストの専用ファイルは未確認	コードにないUIテストファイル名を作らない。ライブラリ/環境追加が必要なら別案を報告する。
React/Next.jsのAPI・型が既存実装だけでは判断できない場合	インストール済みReact/Next.jsの型・対応版資料（型の実パス未確認）	useActionState、Portal、Server/Client間の値の境界だけ確認する。


3. この粒度では変更しない
- ClubFooter.tsx、ClubMemberEditDialog.tsx、members/actions.ts、共通フォーム部品・hook。
- 共通認可、Domain・Repository・DB・Service・招待Action・Auth/Mailアダプター。
- package.json・Vitest設定・環境変数、新規UIテスト基盤、定期router.refresh()によるフォーム初期化。
対象外でも互換性・セキュリティ確認のための読み取りは可能。変更が必要なら、理由・影響・対象追加を含む計画変更案を先に報告する。


粒度9：安全な復旧スクリプト・実サービス確認・運用手順
コミット例：test: add invitation recovery checks and runbook
変更予定ファイル一覧
元計画の区分	ファイル	現在の区分
当初の新規対象	scripts/recover-club-invitation.ts	新規作成予定。最新添付に内容なし。
当初の新規対象	tests/club-invitation-recovery.integration.test.ts	新規作成予定。最新添付に内容なし。
当初の新規対象	tests/club-invitation-auth.local.integration.test.ts	新規作成予定。最新添付に内容なし。
当初の新規対象	docs/runbooks/club-member-invitations.md	新規作成予定。最新添付に内容なし。
変更対象	package.json	添付では既存。現在との差分だけを対象とする。
変更対象	supabase/config.toml	添付では既存。現在との差分だけを対象とする。
変更対象	.env.example	添付では既存。現在との差分だけを対象とする。


未作成の新規予定ファイルは上表の「新規作成予定」の行。これらは既存の調査開始ファイルには含めない。
実装内容・確認するテスト
復旧スクリプト
対象を次の組合せで確認します。
- clubSlug
- 確認用clubId
- Invitation ID
- 確認用Auth user ID
--dry-runと--applyを分けます。
スクリプト内部でAuthのID・emailを照合し、一致する場合だけDBの紐付けを復旧します。ブラウザから任意のAuth user IDを指定できるActionは作りません。
出力はクラブ・Invitation ID・処理結果などに限定し、email全文・認証リンク・tokenは表示しません。
1. 調査開始ファイル
既存ファイルのパス	確認する関数・型・設定	確認理由
scripts/initialize-club-line-setting.ts	parseInitializerOptions()、main()、clubSlug/clubId照合、dry-run/apply、終了処理	既存の安全な運営者用スクリプト方式を参考にする。LINE処理自体は変更しない。
src/infrastructure/prisma/repositories/club-invitation-repository.ts	OwnerInput、claim・Auth記録・準備完了・失敗結果	確認済みAuth IDをどの既存APIへ渡せるかと処理権の条件を確認する。
tests/club-invitation-repository.integration.test.ts	復旧、ID/email不一致、lease・古いclaim、fixture/cleanup	復旧テストを実DBの制約と一致させる。
tests/club-invitation-schema.integration.test.ts	対象DBの正規化・CHECK・index/triggerと安全な検証	運用手順で前提制約を確認できるようにする。
src/infrastructure/supabase/club-invitation-auth.ts	getClubInvitationAuthUserById()/generateClubInvitationAuthLink()、返却型	Auth確認と実リンク生成の確認範囲を決める。
src/infrastructure/supabase/club-invitation-auth.test.ts	mockの返却形・URL照合・確認済みAuth・user_not_found	ローカル実SDKで検証すべき差を特定する。
src/infrastructure/supabase/admin.ts	createSupabaseAdminClient()のURL/Service Roleとserver-only	本番へ接続しない実Authテストの前提を確認する。
src/infrastructure/prisma/client.ts	接続URL、PrismaPg、クライアント終了、log: []	復旧スクリプトの接続先と秘密を出さない終了処理を確認する。
supabase/config.toml	auth.site_url、additional_redirect_urls、auth.email.otp_expiry、enable_confirmations等	ローカルリンクの到着先と有効期限の設定を確認する。
domain/club/invitation/invitation-policy.ts	24時間期限・再送・取消・利用可否	Authリンクとアプリ側tokenの期限の関係を確認する。
lib/mail/club-invitation-mail.ts	メールのNEW_USER/EXISTING_USER文面と送信結果	runbookに確認する画面・メール・DB状態を対応付ける。
lib/mail/club-invitation-mail.test.ts	宛先、idempotency、UNKNOWN・拒否	実配送確認の受入条件を固定する。
prisma/schema.prisma	Club・Invitation・AppUser・Membershipの対応とclaim	4種類の確認用IDを混同せず紐付ける。
.env.example	既存のAPP_BASE_URL・Supabase・RESEND_API_KEY・MAIL_FROM_ADDRESS等の名前	新しい秘密値を記載せず、必要な説明だけ更新する。
scripts/validate-env.mjs	既存の必須/開発/本番の変数検証	追加予定のテスト実行条件と必須変数が矛盾しないか読む。変更は対象外。
package.json	club:line:init、test:db、verify:local、tsx・dotenv-cli	既存の実行方式に合わせてスクリプトと対象テストを登録する。
vitest.config.mts	environment: node、include、@ alias、server-only alias	対象テストの検出・モック条件を確認する。


着手時に確認する前提粒度の成果物（最新添付に未収録・実際の定義は未確認）
予定パス	確認する予定の関数・型・テスト	前提	理由・現在の確認状態
src/application/club/invitation/send-club-invitation.ts	予定: inviteClubMember()/resendClubInvitation()、障害結果	粒度5	実配送とDB状態の対応を運用手順へ反映する。最新添付に未収録・実際の定義は未確認。
src/application/club/invitation/send-club-invitation.test.ts	予定: 各障害地点のテスト	粒度5	実サービス確認とmockテストで補う範囲を区別する。最新添付に未収録・実際の定義は未確認。
src/application/club/invitation/recover-club-invitation.ts	予定: recoverClubInvitationPreparation()、入力・結果	粒度6	実際の復旧ロジックをスクリプトから再利用する。最新添付に未収録・実際の定義は未確認。
src/application/club/invitation/recover-club-invitation.test.ts	予定: ID/email/状態の不一致・競合のテスト	粒度6	運営者用処理でも同じ拒否条件を維持する。最新添付に未収録・実際の定義は未確認。


該当の前提粒度を適用した後に実ファイルを読む。まだ存在しない場合は依存条件を報告し、前提機能をこの粒度へ混ぜて実装しない。
2. 必要時だけ確認
追加調査する条件	確認するファイル・情報	確認する内容
Auth ID未記録の復旧に既存Service/Repositoryが対応していない場合	src/infrastructure/prisma/repositories/club-invitation-repository.ts と粒度6の実際の復旧Service	ブラウザに任意Auth IDを渡す入口を足さず、必要な内部API・認可根拠・追加テストを計画変更として報告する。
CLIでRepositoryに渡すactorMembershipIdを確定する場合	app/(club-app)/club/club-membership-authorization.ts、prisma/schema.prisma のOWNER条件と運用要件	運営者用操作の操作者・監査根拠を明確にする。OWNER再認可を黙って省略しない。
ローカルAuthの設定やリンク寿命を実装だけで確定できない場合	インストール済みSupabase SDK/CLIの型・対応公式資料（実パス未確認）	otp_expiryがinviteに適用される範囲、旧リンク失効、既知ユーザーへのgenerateLinkを実挙動と照合する。
参加リンクの到着先・Cookie生成の整合を確認する場合	app/(club-app)/auth/confirm/route.ts、src/infrastructure/supabase/server.ts、src/infrastructure/supabase/middleware.ts、実際の招待承諾ルート（未確認）	recovery専用の既存ルートをinvite対応済みとみなさない。受入側の不足は別の計画として報告する。
環境変数検証・Vitest設定の変更が必要と判明した場合	scripts/validate-env.mjs、vitest.config.mts と関連テスト	変更理由・必要ファイル・影響を報告する。既存のこの粒度の対象へ無断で追加しない。
本番への反映手順・実配送条件を決める場合	利用者が確認する本番設定と対応する公式資料（本番の設定・状態は未確認）	既存HPとの共用Auth設定・送信ドメインへの影響を記載する。本番DB・Auth・メールをpatch作成中に操作しない。


3. この粒度では変更しない
- Domain・Repository・DBスキーマ・既存migration・粒度5/6 Service・Auth/Mailアダプター。
- Page・Component・Action・共通認可・既存HP・LINE・Storage・初期化スクリプト。
- scripts/validate-env.mjs・vitest.config.mtsの変更、Supabase Authユーザー削除、本番サービスへの自動実行。
- 通常のnpm testで実Auth/実メールを呼ぶ設定。専用ローカル実Authテストは明示的に実行する。
対象外でも互換性・セキュリティ確認のための読み取りは可能。変更が必要なら、理由・影響・対象追加を含む計画変更案を先に報告する。
patch作成時の最終確認
- 差分に含まれるファイルが、選択した粒度の変更予定ファイル一覧と一致することを確認する。
- 新規ファイルが抜けていないこと、既存ファイルを誤ってnew fileとして再作成していないことを確認する。
- 対象外の修正が必要だった場合は、黙ってpatchへ入れず報告する。
- コード調査を拡張した場合は、そのファイル・関数・確認理由を短く報告する。
- 実行できたテストと、依存パッケージ・DB・外部サービス不足等で未実行の確認を区別する。
- git apply --checkの確認対象が実ワークツリーか、添付から作った複製かを明記する。
- 認証リンク・raw token・tokenHash・claimToken・メールアドレス全文・外部エラー原文をログや完了報告へ出さない。
この計画書の更新だけでは、アプリコード・DB・環境変数・サービス設定は変更されない。