F05実装粒度計画

F05は、9つのpatch単位に分けて実装するのがよいです。添付の現行コードを確認したうえで、F04・既存HP・LINE通知を維持する構成にします。
今回は計画のみです。コードやDBは変更していません。

2. 実装前に固定する方針
2-1. 招待する権限と在籍状態
招待時に指定できるroleは次の3つに限定します。
* COACH
* OFFICER
* MEMBER
OWNERでは招待できません。参加完了後、必要ならF04からOWNERへ変更します。
Membershipの作成時は、フォームの値に関係なくサーバー側で必ずINVITEDにします。
同じクラブのMembershipが既にある場合は、次の扱いにします。
既存Membership	新規招待
なし	招待可能
INVITED	新規作成しない。既存招待の再送・復旧へ案内
ACTIVE	招待しない
SUSPENDED	招待しない。F04の状態変更で対応
WITHDRAWN	招待しない。F04の状態変更で対応
これにより、招待を使って利用停止や退会状態を迂回できなくします。
2-2. 新規ユーザーと既存ユーザーの判定
基本方針は、ご提示の仕様どおりです。
* 新規ユーザー：Supabaseで認証リンクを生成し、Resendで送信。
* 既存AppUser：Authユーザーを新規作成せず、クラブ参加案内をResendで送信。
ただし、「AppUserが存在する＝初回設定まで完了している」とは限りません。
初回招待でAppUser・Membershipまで保存でき、メール送信だけ失敗した場合もAppUserは存在するからです。
そのため、再送・復旧では以下を区別します。
状態	対応
Auth・AppUserとも未作成	generateLink(type: "invite")で準備
Auth作成済み・DBへの紐付け未完了	同じAuthユーザーを確認してDB保存を復旧
招待途中でAuth未確認	既存Authユーザーに対する招待リンクを再生成
既存アカウントとして利用可能	通常のクラブ参加案内を送る
Supabaseの招待は、確認済みの既存ユーザーへ同じように実行できるものではありません。この分岐はAuthの実際の状態を確認して扱います。
2-3. 再送は同じInvitationを使う
未承諾の招待の再送では、原則として同じClubInvitation.idを使います。
再送開始時に、次を更新します。
* 新しいtokenHash
* 新しいexpiresAt
* attemptCount
* lastAttemptAt
* 処理権を表すclaimTokenとその期限
古い招待tokenは、この更新時点で無効になります。
期限切れでもMembershipがINVITEDのままであれば、同じ招待から再発行できるようにします。ただし、同じメールアドレスに別の有効な招待がないことも確認します。
2-4. 取消時はInvitationの履歴を残す
添付の旧設計書にはInvitationも削除する記述がありますが、今回はご提示のCANCELLEDを使う仕様を優先します。
取消時は、同じDB transaction内で次を行います。
1. OWNER・clubId・対象Invitationを確認。
2. 未承諾か確認。
3. 関連MembershipがINVITEDか確認。
4. InvitationをCANCELLEDに変更。
5. そのINVITED Membershipだけを削除。
6. InvitationのmembershipIdは既存のSetNullで解除。
次は削除しません。
* ClubInvitationの履歴
* AppUser
* Supabase Authユーザー
Membership未作成のPREPARINGには通常の「招待取消」を出さず、準備の再試行・復旧対象として表示します。
2-5. 期限切れ処理ではCronを増やさない
最初は次のタイミングで、対象クラブの期限切れInvitationをEXPIREDへ更新します。
* OWNERがメンバー管理ページを開くとき。
* 新規招待・再送を実行するとき。
ただし、一覧取得関数の内部へ更新処理を隠しません。Application Serviceで「期限切れ更新→一覧取得」を明示します。
また、token検証時は必ずexpiresAt > nowを確認します。一覧を開かなければ期限切れtokenが有効なまま、という実装にはしません。
2-6. F04の権限変更を上書きしない
F04では、招待中のメンバーもroleを変更できます。
そのため、Membership作成後はClubMembership.roleを現在の権限として扱います。
* 再送メールも現在のMembershipのroleを参照。
* 将来の承諾処理で、古いClubInvitation.roleをMembershipへ戻さない。
* 既存AppUserの氏名・メールを、別クラブのOWNERが招待フォームから上書きしない。

3. DB変更
新しいジョブテーブルは作らず、既存のClubInvitationを拡張します。
追加予定
項目	用途
claimToken String? @unique	現在の準備・送信処理を識別する
leaseExpiresAt DateTime?	処理停止後に再試行できる期限
clubId・status・expiresAtの複合index	クラブ別の招待一覧・期限切れ更新
claim項目のCHECK制約	claimTokenと期限が片方だけ設定される状態を防ぐ
既存の次の項目は再利用します。
* authUserId
* attemptCount
* lastAttemptAt
* emailSentAt
* emailSendError
emailSendErrorにはResendのエラー原文を保存せず、固定の安全なエラー識別子だけを保存します。
Auth準備失敗はPREPARINGに残し、処理権が解除済み・期限切れなら「準備の再試行が必要」と判断します。メール送信失敗と混同しません。
維持する制約
* ClubInvitation_active_email_key
* ClubInvitation.tokenHashのunique
* ClubInvitation.membershipIdのunique
* MembershipのclubId + userIdのunique
* F01の同一クラブ検証trigger
* 既存のRLS・公開Data API制限
既存migrationは編集せず、追加migrationを作ります。
なお、現在の部分unique indexはstatusを見ています。時刻が過ぎただけでは対象から外れないため、新規招待の予約transaction内でも期限切れ更新を行う必要があります。

4. 状態遷移
操作・結果	遷移
新規招待の予約	新規作成→PREPARING
Auth・DBの準備完了	PREPARING→READY_TO_SEND
Resend送信受付成功	READY_TO_SEND→SENT
明確なメール送信失敗	READY_TO_SEND→EMAIL_FAILED
再送・期限切れからの再発行	対象状態→PREPARING→READY_TO_SEND→送信結果
招待取消	条件を満たす未承諾状態→CANCELLED
有効期限到達	未承諾状態→EXPIRED
将来の承諾処理	有効な招待→ACCEPTED
補足として、SENTは「メールサービスが送信を受け付けた」という記録です。受信箱への到着まで保証する状態ではありません。
また、Resendが受け付けた後にDB更新だけ失敗するケースがあります。これを「確実に未送信」と扱わず、送信結果の記録未完了として復旧できるようにします。

5. patch単位の実装計画
以下の順序で進めます。
粒度1：Domainルール・フォーム型
コミット例：

feat: add invitation domain rules

新規ファイル

domain/club/invitation/invitation-form.ts
domain/club/invitation/invitation-form.test.ts
domain/club/invitation/invitation-policy.ts
domain/club/invitation/invitation-policy.test.ts

変更ファイル

domain/club/member/member-toast.ts
domain/club/member/member-toast.test.ts

実装内容
主な関数：

buildClubMemberInviteFormValues()
validateClubMemberInviteFormValues()
buildClubInvitationExpiresAt()
evaluateClubInvitationResend()
evaluateClubInvitationCancellation()
isUsableClubInvitation()

ルール：
* normalizeEmail()を再利用。
* 氏名をtrimし、未入力・長すぎる値を拒否。
* emailの形式・長さを検証。
* roleはCOACH・OFFICER・MEMBERだけ。
* 不正なroleを勝手にMEMBERへ変更しない。
* 再送・取消・期限切れの条件を純粋関数にする。
* URLのtoastは許可した識別子から固定文言へ変換。
* DomainからDB・Auth・Resendを呼ばない。
この段階では画面やDBに接続しません。

粒度2：DB拡張と制約テスト
コミット例：

feat: add invitation processing lease

新規ファイル

prisma/migrations/<作成日時>_f05_invitation_processing_lease/migration.sql
tests/club-invitation-schema.integration.test.ts

変更ファイル

prisma/schema.prisma
package.json

実装内容
* 前述のclaim項目・CHECK・indexを追加。
* test:dbへ新しいDBテストを追加。
* 既存の部分unique indexと同一クラブtriggerが残っていることを検証。
* 既存データにemail正規化の不整合がないか事前確認。
types/prisma.tsは既にClubInvitationとenumを公開しているため、現時点では変更不要です。
重要なテスト
* 有効な同一クラブ・同一email招待を重複作成できない。
* 別クラブへの招待は作成できる。
* CANCELLED・EXPIREDの履歴が、新規招待を不必要に妨げない。
* claim項目の片方だけの設定を拒否する。
* Membership削除時にInvitation履歴が残る。

粒度3：Repository・transaction・処理権の取得
コミット例：

feat: add invitation persistence

新規ファイル

src/infrastructure/prisma/repositories/club-invitation-repository.ts
tests/club-invitation-repository.integration.test.ts

変更ファイル

package.json

主な関数

findClubInvitationsForOwner()
reserveClubInvitation()
claimClubInvitationResend()
recordClubInvitationAuthUser()
completeClubInvitationPreparation()
markClubInvitationEmailSent()
markClubInvitationEmailFailed()
releaseClubInvitationClaim()
cancelClubInvitation()
expireClubInvitations()
findUsableClubInvitationByTokenHash()

責務
一覧取得
OWNER画面用には次だけを返します。
* Invitation ID
* 氏名・メール
* role・status
* Membershipとの紐付け有無
* 発行日時・期限・送信日時
* 再送・取消・復旧が可能か判断するための最小情報
次は画面用DTOに含めません。
* tokenHash
* authUserId
* claimToken
* 外部サービスのエラー原文
* 認証リンク
更新処理
* clubId・Invitation IDを必ず組み合わせる。
* transaction内でも操作者がACTIVE OWNERか確認。
* AppUser・Membership・Invitationの紐付けをtransactionで保存。
* 外部APIは呼ばない。
* P2034だけを限定回数再試行。
* unique違反は対象制約を判別して業務上の重複結果へ変換。
* 途中停止した古い処理は、claimToken不一致により更新できない。
重要なテスト
* 並列新規招待でも有効な招待が1件だけ。
* 並列再送で処理権を取得できるのは1件だけ。
* lease期限切れ後に再取得できる。
* 古い処理が新しい送信状態を上書きできない。
* 別クラブのInvitation・Membershipを混ぜられない。
* 取消・期限切れ・旧tokenが利用不可。
* 複数テーブルの保存失敗で中途半端な紐付けを残さない。
* OWNER画面用DTOに秘密情報が含まれない。

粒度4：Supabase Auth・Resendの接続部
コミット例：

feat: add invitation auth and mail adapters

新規ファイル

src/infrastructure/supabase/club-invitation-auth.ts
src/infrastructure/supabase/club-invitation-auth.test.ts
lib/mail/club-invitation-mail.ts
lib/mail/club-invitation-mail.test.ts

変更ファイル

src/infrastructure/supabase/admin.ts
src/infrastructure/prisma/client.ts

Auth側
主な関数：

generateClubInvitationAuthLink()
getClubInvitationAuthUserById()

* 既存のcreateSupabaseAdminClient()を再利用。
* Storage専用と書かれたコメント・エラーメッセージを用途に合わせて修正。
* Service Roleはサーバー専用。
* SDKの返却値を必要な項目へ絞る。
* AuthユーザーID・正規化emailが期待する対象と一致するか検証。
* エラー原文やAuthレスポンス全体を返さない・記録しない。
generateLink()は独自メールサービスへ渡す認証リンクを生成するAPIなので、配送はResendに一本化できます。
Mail側
主な関数：

buildClubInvitationEmail()
sendClubInvitationEmail()

* lib/mail/resend.tsのresendとbuildMailFrom()を再利用。
* 新規ユーザー向けと既存ユーザー向けの文面を分ける。
* 宛先は招待対象のemail。
* FromのアドレスはMAIL_FROM_ADDRESS。
* HTMLに埋める氏名・クラブ名をエスケープ。
* 同じ送信試行の再試行には同じResend idempotency keyを使う。
* 新tokenを発行する再送は、新しい送信試行として別のkeyにする。
Resendのidempotency keyの保持期間は24時間です。永続的な重複防止をこれだけに任せず、DB側の重複制約・claimと組み合わせます。
Prismaログの確認
現在のprisma/client.tsはlog: ["error", "warn"]です。
Action側で安全なログにしても、ORM側の出力が別に残る可能性があるため、Prismaのエラー原文を自動出力しない設定に整理します。既存HPの処理や認可は変更しません。

粒度5：新規招待・再送のApplication Service
コミット例：

feat: add recoverable invitation sending

新規ファイル

src/application/club/invitation/send-club-invitation.ts
src/application/club/invitation/send-club-invitation.test.ts

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
Auth作成直後にauthUserIdを記録するのは、その後のDB保存に失敗した場合の復旧地点を作るためです。ただし、その記録自体も失敗し得るため、粒度9の手動復旧も用意します。
再送時
* 未承諾で、関連MembershipがINVITEDであることを再確認。
* 一定の再送間隔を設ける。
* tokenを入れ替える。
* 必要な認証リンクも再生成。
* 既存のAppUser・Membershipを重複作成しない。
* Auth確認済みユーザーへ無条件にtype: "invite"を使わない。
障害テスト
最低限、次の位置で失敗させます。
* PREPARING保存前。
* Authリンク生成時。
* Auth成功後のID記録時。
* AppUser・Membershipのtransaction時。
* Resend送信時。
* Resend成功後のSENT更新時。
それぞれについて、残るDB状態と次に可能な操作を確認します。

粒度6：取消・期限切れ・復旧・管理画面用取得
コミット例：

feat: add invitation lifecycle recovery

新規ファイル

src/application/club/invitation/cancel-club-invitation.ts
src/application/club/invitation/cancel-club-invitation.test.ts
src/application/club/invitation/recover-club-invitation.ts
src/application/club/invitation/recover-club-invitation.test.ts
src/application/club/invitation/get-club-member-management.ts
src/application/club/invitation/get-club-member-management.test.ts

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
* authUserIdが記録済みなら、そのIDをAuthで確認して復旧。
* ID・email・clubId・Invitationの状態が一致しなければ中止。
* Authユーザーを削除してやり直す処理は作らない。
* ID未記録の障害は、運営者が粒度9の手順で復旧。
取消・期限切れ・再送と古い送信処理が競合しても、古い処理がSENTへ戻せないことをテストします。

粒度7：Server Action・認可・結果表示
コミット例：

feat: add owner invitation actions

新規ファイル

app/(club-app)/club/[clubSlug]/admin/members/invitation-actions.ts
tests/club-invitation-actions.test.ts

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
* clubId
* 招待者Membership ID
* authUserId
* tokenHash
* 送信先URL
* Membershipの初期status
メール送信に失敗してもDBに招待が残った場合は、一覧を更新して「送信失敗・再送可能」と表示します。「作成自体がなかった」ようには見せません。
テスト
* MEMBER・COACH・OFFICERから直接呼ばれても処理しない。
* role改ざん・requestId不正を拒否。
* 他クラブのInvitationを変更できない。
* キャンセル済み・承諾済みへの再送を拒否。
* DB保存済み／メール失敗の結果を正しく表示。
* ログ・ActionStateに秘密情報が含まれない。
* redirect()・notFound()を一般的なcatchで捕捉しない。

粒度8：メンバー管理画面への組み込み
コミット例：

feat: add member invitation management UI

新規ファイル

app/(club-app)/club/[clubSlug]/admin/members/ClubMemberInviteForm.tsx
app/(club-app)/club/[clubSlug]/admin/members/ClubInvitationOperations.tsx

変更ファイル

app/(club-app)/club/[clubSlug]/admin/members/page.tsx
app/(club-app)/club/[clubSlug]/admin/members/loading.tsx

表示内容
既存メンバー一覧を残し、次を追加します。
新規招待フォーム
* メールアドレス
* 氏名
* role
* 招待メール送信ボタン
招待状況
* 氏名・メール
* 招待状態
* 有効期限
* 最終送信日時
* 再送／準備の再試行
* 招待取消
* 運営者による復旧が必要な場合の固定案内
Membership未作成のPREPARINGも、この招待状況に表示します。
UI上の注意
* pending中は対象の操作ボタンを無効化。
* エラー時は送信した入力値を保持。
* FieldErrorList・FormErrorAlert・useScrollToFormErrorを再利用。
* 招待フォームではuseUnsavedChangesGuardを再利用。
* 取消確認は既存F04と同じPortal方式。
* 入力中に定期的なrouter.refresh()でフォームを初期化しない。
* force-dynamicを維持し、個人情報を共有キャッシュへ保存しない。
* フッター・既存の権限変更モーダルは変更しない。

粒度9：安全な復旧スクリプト・実サービス確認・運用手順
コミット例：

test: add invitation recovery checks and runbook

新規ファイル

scripts/recover-club-invitation.ts
tests/club-invitation-recovery.integration.test.ts
tests/club-invitation-auth.local.integration.test.ts
docs/runbooks/club-member-invitations.md

変更ファイル

package.json
supabase/config.toml
.env.example

復旧スクリプト
対象を次の組合せで確認します。
* clubSlug
* 確認用clubId
* Invitation ID
* 確認用Auth user ID
--dry-runと--applyを分けます。
スクリプト内部でAuthのID・emailを照合し、一致する場合だけDBの紐付けを復旧します。ブラウザから任意のAuth user IDを指定できるActionは作りません。
出力はクラブ・Invitation ID・処理結果などに限定し、email全文・認証リンク・tokenは表示しません。

