<!-- docs/implementation/phases/F11-granular-plan.md -->

# F11 定期練習予定の一括作成：粒度別実装計画

## 1. 調査基準と資料の位置付け

- ブランチ：`feat/club-app-foundation`。
- 基準commit：`4ada4e0cc3bddaf0f32cf7713f51697a06dab31d`。
- 調査開始時の `git status --short` は空。既存の本計画書は0行だった。
- 本作業で変更するのはこの計画書だけ。ソース・Git index・feature.patch・環境ファイルは変更しない。
- `AGENTS.md`を最優先とし、`CLAUDE.md`はその参照だけであることを確認した。
  目標は `docs/implementation/phases/F11.md`。背景は `docs/proposals2.md` の
  イベント管理、管理者月別一覧、日時、実行Membershipの記述に限定した。
- 本文の「既存」は基準commitで本文を確認したもの。
  「新規案」は未作成の予定パスで、実装済みシンボルではない。
  F11の新関数名は実装時に定義とテストを合わせて確定し、既存関数のようには扱わない。
- 将来のpatchでは、基準commit以降の差分が今回の粒度に影響する場合だけ追加調査する。
  各粒度の調査開始ファイルから読み、依存成果物と必要な参照元だけ追う。

## 2. 現在の実装状況

| 区分 | 実装状況・根拠 | F11での扱い |
| --- | --- | --- |
| 認証・認可 | 実装済み。`app/(club-app)/club/club-membership-authorization.ts / requireActiveClubMembership / requireClubAdminMembership / ClubAccessContext`、`club-app-authorization.ts / requireClubAppAdminAccess` | Page・preview Action・実行Actionで再利用。Repositoryでも最新所属を照合 |
| 管理ロール・プラン | 実装済み。`domain/club/club-member-role.ts / isClubAdminRole`、`domain/club/plan-features.ts / PLAN_FEATURES / hasClubFeature` | ACTIVEなOWNER・COACH・OFFICERかつCLUB_APP。現在はSTANDARDのみ。MEMBER・STARTER・PROへの開放はしない |
| 単件作成 | 実装済み。`app/(club-app)/club/[clubSlug]/admin/events/new/actions.ts / createClubEventAction`、`src/infrastructure/prisma/repositories/club-event-repository.ts / createClubEvent` | PDF・LINE・単件transactionを含むため、日付ごとの繰り返し呼出しには使わない |
| 共通入力・公開対象 | 実装済み。`domain/club/event/event-form.ts / ClubEventInput / validateClubEventFormValues`、`domain/club/content/content-policy.ts / buildContentTargetRoles` | 文字数定数・OWNER常時包含の規約を再利用。単件フォーム全体の流用はしない |
| 通常の日時変換 | 実装済み。`domain/shared/date-time/club-date-time.ts / convertClubLocalDateTimeToUtc`、`domain/club/event/event-date-times.ts / convertEventInputToUtc` | 日時・終日・エラー契約の確認先。任意日付の曜日列挙やF11の同日終了の入力契約は未実装 |
| 厳密な現地時刻解決 | 一部再利用可能。`domain/club/event/event-month-copy-date-times.ts / localParts / utcCandidates / isValidTimeZone`はF10内部関数 | 実際にF10・F11で使う部分だけを抽出。月送り・月末補正はF10に残す |
| 完全一致比較 | 一部再利用可能。`domain/club/event/event-month-copy-policy.ts / pickEventMonthCopyEvent / buildEventMonthCopyKey`、`event-month-copy-read-repository.ts / duplicateWhere` | コピー列の比較と同じ実データ列で照合。DB検索部分だけ小さく共有する |
| 一括完了記録 | モデル・制約は実装済み。`prisma/schema.prisma / ClubEventBatchOperation`とF10 migration | テーブル・unique・FK・SetNull・RLSを再利用。ただしoperation CHECKはCOPY_PREVIOUS_MONTH専用で、そのままF11を保存できない |
| 冪等な一括保存 | F10のみ実装済み。`src/infrastructure/prisma/repositories/event-month-copy-mutation-repository.ts / createEventMonthCopyBatch / existingResult / isCurrentActor` | 処理順・Serializable・有限retryを参照。F10の公開関数へF11入力を流し込まず専用Repositoryを作る |
| 管理者月別一覧・toast | 実装済み。`app/(club-app)/club/[clubSlug]/admin/events/page.tsx / AdminEventsMonthPage`、`domain/club/event/event-toast.ts / getClubEventToastMessage` | 新規作成・F10入口等を維持してF11入口・固定成功コードだけを追加 |
| F11専用一式 | 未実装。全体検索でF11専用のDomain・Service・Repository・Action・route・試験は見つからない | 本計画の新規案で追加 |
| ホームページの練習予定PDF | 別機能。`lib/storage/monthly-practice-plan-storage.ts`等が検索に出る | F11のClubEvent一括作成へ混入させない。本文の追加調査対象にしない |

F10が実装済みであることと、F11が部分的に動作することを混同しない。
F11.mdの受入条件を満たす接続はまだない。実DB・Auth・ブラウザーの実施結果は本作業では未確認。

## 3. 確定事項と設計提案

### ユーザー確定事項（今回の回答）

1. 対象期間は管理者一覧で選んだ対象月内の開始日〜終了日に限定する。
   初期値は対象月全体。月を跨ぐ任意の31日間にはしない。
2. 終了時刻は必須で、同日の開始時刻より後だけを許可する。
   翌日終了は一括作成後の通常編集で対応する。
3. 既存の完全一致は初期未選択とし、明示選択された場合は作成を許可する。

F11.mdの固定要件は、最大31件、PRACTICE、DRAFT、PDF・LINE通知なし、
firstPublishedAt・readRequiredAt=null、作成者・更新者は実行Membership、preview先行、
同requestIdの一回処理、一transaction、MEMBERの直接Action拒否である。

### 実装のための採用提案（ユーザー回答とは区別する）

以下は既存コードとF11の規模からの提案。粒度1で仕様に明記し、曖昧なまま実装を始めない。
提案の修正が必要なら影響する粒度だけを更新する。

- 業務入力案：`targetMonth`、`periodStart`、`periodEnd`、`weekdays`、`title`、
  `startTime`、`endTime`、`location`、`meetingTime`、`meetingLocation`、`targetRoles`。
  実行時は `selectedDates`、`requestId`、`previewFingerprint`を追加する。
- 日付は実在するYYYY-MM-DD、時刻はHH:mm、曜日は0=日曜〜6=土曜で1〜7種類。
  期間は両端を含める。曜日は重複除去・昇順、選択日は重複拒否・昇順に正規化する。
  不正な月・配列query・余分な空白を現在月へfallbackしない。
- 通常の時刻付き練習に限定し、`isAllDay=false`。F11.mdで入力指定されていない
  content・belongings・notesはnullとして、必要なら通常編集を使う。
  終日・本文等の共通入力の追加を、暗黙の範囲拡大として行わない。
- 集合時刻は任意で各発生日の同日、未入力はnull。集合場所は任意。
  開始後の集合は背景仕様に従い警告する案で、同日終了の必須検証とは分ける。
  前日集合・「開始の何分前」といった別入力は含めない。
- 文字数は `event-form.ts` の120／200等の既存定数を使う。
  新規入力の任意文字列はtrim・空欄nullへ正規化し、超過を切り捨てない。
  不正roleは拒否した後、`buildContentTargetRoles`でOWNERを必ず含める。
  OWNERだけの公開対象も有効。不正roleをhelper任せで黙って消さない。
- 現地のカレンダー日付を列挙して曜日を決め、各日の開始・終了・集合をUTCへ変換する。
  UTCで24時間ずつ進めたり、ホストtimezoneのgetDayを使ったりしない。
- DST gap／foldはF10と同様に自動補正・片方の時刻選択をせず、日付ごとに理由付きで選択不可。
  timezoneそのものの不正はpreview失敗。全候補と除外数を表示し、候補を黙って落とさない。
  生成候補上限は除外・選択前の31件。保存は有効な選択1〜31件だけ。
- 完全一致はF10と同じ12列・ロール集合で比較し、既存側のstatusを問わない。
  候補日が1日1件なので通常は候補間一致しないが、重複日や同じ作成値は保存時も拒否する。
- targetMonthの西暦範囲は1〜9999年を案とする。F11は前月を使わないため、
  0001-01を許す場合は粒度5でtarget_month CHECKをoperation別にする。
  現行F10の0001-01拒否は維持する。月範囲をより狭くする場合は粒度1・5を合わせて変更する。

### 画面・入力・hashの契約案

- route新規案：`/club/[clubSlug]/admin/events/create-practice-batch?month=YYYY-MM`。
  Pageは対象月・初期入力・preview Action・実行Actionを渡すだけで保存しない。
- 共通入力からpreviewを作るActionと、選択日を保存するActionを分ける。
  previewは書込みなし。preview成功後のサーバー発行requestIdをClient stateへ返す。
  実行ActionをPageでbindするのはslug・対象月で、Client stateを信頼の根拠にしない。
- preview後に共通入力を編集したら、そのpreviewを無効化し、再previewまで保存不可にする。
  保存に送る共通入力はpreview時の正規化値。初回保存送信後はpayloadを固定する。
- F11専用のpreviewFingerprintは、用途・版・operation・scope・対象月・正規化共通入力・
  DBの最新timezone・生成日とUTC値・除外・既存一致状態をサーバーでハッシュ化する。
  F10のhash関数は用途・元ID・更新日時・月送りに固定されているため、そのまま呼ばない。
- ledgerのinputHashは、用途・版・scope・正規化共通入力・選択日・送信されたfingerprintから計算する。
  replay時に最新timezoneや現在の重複状態を素材へ混ぜて、正当な再送を別入力にしない。
  F10のdigestや既存の保存済みhashの意味は変更しない。
- 同じrequestIdの照合は最新認可→既存ledger→operation・actor・inputHash等の一致を先に行う。
  新規操作だけ現状を再previewする。生成イベントの変更・削除後もreplayで増やさない。
- 同じclubId・requestIdをF10とF11で使えばCONFLICTとする。
  uniqueをoperation込みに変更しない。別requestIdは意図した別操作として扱う。
- fingerprintはサーバーでの再計算用の比較値で、認可やpreview閲覧の証明にはしない。
  requestId単体・previousStateのsuccess・ClientのUTC値を信用しない。
- Client preview DTOは入力の表示に必要な値、日付、UTC ISO日時、件数、選択可否、理由、
  重複フラグ・最小識別情報、fingerprintに限定する。他イベントの本文・全モデルを返さない。
- 保存結果案はCREATED／ALREADY_COMPLETED／VALIDATION_FAILED／FORBIDDEN／
  PREVIEW_CHANGED／CONFLICT／CREATE_FAILED／RESULT_UNKNOWN。
  成功receiptはtargetMonth・createdCountだけ。保存後の通常の再検証失敗はneedsReloadで保存済みを示す。
- 結果不明時は同じpayload・requestIdで確認し、新しいpreviewへ誘導しない。
  新しい入力・選択に変える再previewは別操作。初回送信前の選択変更では同じIDを維持する。
  失ったタブのpayloadを復元する機能、専用の結果照会APIは追加しない。

## 4. 確認した主要ファイル・シンボルと依存

| ファイル | 確認したもの・判断への利用 |
| --- | --- |
| `AGENTS.md`、`CLAUDE.md` | 粒度限定、実ファイル確認、対象内の日本語JSDoc・import説明・関数／型の行末説明、一時環境patch、秘密情報禁止 |
| `docs/implementation/phases/F11.md` | 固定要件・受入条件。今回の回答をまだ追記していない原仕様 |
| `docs/proposals2.md` | 管理者一覧の一括作成入口、targetRoles、現地日時、実行Membershipの背景。一般の定期イベント複製・PDF予定表と区別 |
| `prisma/schema.prisma` | ClubEventの12列・status・公開日時・作成者、ClubEventBatchOperationのoperation・targetMonth・hash・count・unique・FK |
| `prisma/migrations/20261027000000_f10_event_month_copy/migration.sql` | operation固定、件数1〜100、対象月CHECK、同クラブ・clubId不変trigger、RLS／revoke。適用済みSQLは変更しない |
| `domain/club/event/event-form.ts` | 文字数定数、ClubEventFormValues／ClubEventInput、buildClubEventFormValues／validateClubEventFormValues。単一項目重複・FileをF11専用parserで扱う必要 |
| `domain/club/content/content-policy.ts` | buildContentTargetRolesのOWNER補完・不正値除去。F11は先にroleを検証 |
| `domain/club/club-member-role.ts` | isClubAdminRole、TARGET_ROLE_OPTIONS、CLUB_MEMBER_ROLE_LABELS |
| `domain/club/plan-features.ts` | hasClubFeature、requireClubFeature、PLAN_FEATURES。PROは現在CLUB_APPなし |
| `domain/club/event/event-date-times.ts` | EventUtcDateTimes、convertEventInputToUtc、EventDateTimeInputError。F11向け曜日列挙ではない |
| `domain/shared/date-time/club-date-time.ts` | parseMonthSearchParamのfallback、getClubMonthUtcRange、getClubDayUtcRange、convertClubLocalDateTimeToUtc、privateなcreateUtcFromClubLocal。既存の表示取得は変更しない |
| `domain/club/event/event-month-copy-date-times.ts` | LocalDateTime、isValidTimeZone、localParts、utcCandidates、convertEventMonthCopyDateTimes。厳密なUTC候補列挙だけ共有候補 |
| `domain/club/event/event-month-copy-policy.ts` | pickEventMonthCopyEvent、buildEventMonthCopyKey、EVENT_MONTH_COPY_FIELDS、findEventMonthCopyCandidateDuplicates。source IDを必要とする最後の関数はF11へ流用しない |
| `src/infrastructure/security/event-month-copy-fingerprint.ts` | buildEventMonthCopyFingerprint、buildEventMonthCopyInputHash、digestのF10用途・FORMAT_VERSION。新しい用途のハッシュは別ファイル |
| `src/infrastructure/prisma/repositories/event-month-copy-read-repository.ts` | duplicateWhere、findEventMonthCopyPreviewData、Prisma.TransactionClient注入、31件へ流用できない前月開始取得。共有するのは完全一致検索部分だけ |
| `src/infrastructure/prisma/repositories/event-month-copy-mutation-repository.ts` | isCurrentActor、existingResult、eventData、createEventMonthCopyBatch、Serializable、P2034初回後3retry、P2002後の記録照合 |
| `src/application/club/event/get-event-month-copy.ts`、`src/application/club/event/copy-event-month.ts` | getEventMonthCopyPreview／copyPreviousMonthEvents、限定DTO・scope検証・固定結果・最小receipt。F11への汎用化はしない |
| `src/infrastructure/prisma/repositories/club-event-repository.ts` | findAdminClubEventsInRange／countAdminClubEventsInRangeByStatus、createClubEvent／CreateClubEventInput。単件作成のPDF・LINE・transaction境界を確認 |
| `app/(club-app)/club/[clubSlug]/admin/events/new/actions.ts` | createClubEventActionの認可・role整形・日時変換・PDF／LINE依存。F11で経由しない |
| `app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/actions.ts` | copyPreviousMonthEventsAction、bound値の構造検証、previousState非依存、unstable_rethrow、保存後再検証と固定redirect |
| `app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/page.tsx`、`app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/EventMonthCopyForm.tsx` | EventMonthCopyPage／EventMonthCopyForm、Promise props、選択固定、snapshot・inFlight・結果不明時の再preview抑止。F11は入力付きの2段階UIとして別作成 |
| `app/(club-app)/club/[clubSlug]/admin/events/page.tsx` | AdminEventsMonthPage、表示月・status・genre、既存の新規・F10入口、カレンダー・toast |
| `domain/club/event/event-toast.ts` | ClubEventToastCode、getClubEventToastMessage。固定成功コード追加位置 |
| `app/(club-app)/club/club-app-authorization.ts`、`app/(club-app)/club/club-membership-authorization.ts` | requireClubAppAdminAccess、requireActiveClubMembership、ClubAccessContext、Auth本人→同slugのACTIVE所属。変更せず利用 |
| `app/(club-app)/club/revalidate-club-paths.ts`、`domain/club/club-revalidation-paths.ts` | revalidateClubEventPaths／getClubEventRevalidationPaths。会員・管理者の月別／日別4一覧。F11で新キャッシュ層を作らない |
| `app/(club-app)/club/admin/_components/FieldErrorList.tsx`、`app/(club-app)/club/admin/_components/FormErrorAlert.tsx` | 項目IDとerrors／messageの表示。変更せず再利用 |
| `domain/shared/action-state.ts`、`domain/shared/request-id.ts` | ActionState／FieldErrors、createRequestId／isRequestId。IDを認可の代わりにしない |
| `src/infrastructure/logging/sanitize-log-context.ts` | sanitizeLogContextの許可項目。タイトル・本文・hash素材・raw Errorを渡さない |
| `src/infrastructure/prisma/client.ts` | dotenvと接続poolの即時評価、log=[]。mock・DB試験ではガード前のimportを避ける |
| `package.json`、`package-lock.json`、`vitest.config.mts` | 既存のCLI・SDK版、node環境、alias、server-only置換、試験対象、専用DBコマンド分離 |
| `tests/event-month-copy*.test.ts` | form／date-times／policy／fingerprint／read・mutation Repository／Service／Action／Page／forms／navigation／専用flowの既存パターン。新規F11試験の根拠と共有部分の回帰対象 |
| `domain/shared/date-time/club-date-time.test.ts`、`domain/club/event/event-toast.test.ts`、`domain/club/club-revalidation-paths.test.ts`、`domain/shared/request-id.test.ts`、`tests/club-membership-authorization.test.ts` | 日時・toast・再検証・ID・共通認可の既存試験。存在と関連箇所を確認 |

buildContentTargetRolesとsanitizeLogContextの直接の専用testは今回の検索では見つからない。
存在しない `content-policy.test.ts` 等を調査開始ファイルに追加しない。
F11新試験で公開境界から検証し、必要なら実在する参照元を追加確認する。

### パッケージとNext.js

package.jsonの宣言・lockと対象パッケージのpackage.jsonを確認した。
Next 16.2.6、React 19.2.4、@date-fns/tz 1.5.0、date-fns 4.3.0、zod 4.4.3、
Vitest 4.1.10、Prisma Client／adapter-pg 7.8.0、Prisma CLI 7.9.1。
CLIの宣言は^7.8.0だがlock・導入済みは7.9.1。バージョンを揃える更新はF11へ混ぜない。
新しいSDK APIが必要なら既存の型を先に調べ、それで判断できない仕様だけ公式資料を確認する。

`node_modules/next/dist/docs/`は存在した。以下の関係箇所を確認した。

- `01-app/03-api-reference/03-file-conventions/page.md`：params・searchParamsはPromise。
- `01-app/02-guides/forms.md`：Action内認可、bind、useActionStateとpending。
- `01-app/03-api-reference/04-functions/revalidatePath.md`：Server側で再検証。

Page・Action・UIを実装する粒度では導入版に変更がないか確認し、該当箇所だけ追う。
古い同期props・独自のHTTP保存route・不要なcache directiveを導入しない。

## 5. patch単位と依存関係

| 粒度 | 目的 | 前提 |
| --- | --- | --- |
| 1 | 仕様補足・入力・preview／結果契約 | なし |
| 2 | 厳密な現地日時解決の最小抽出 | 1の日時方針 |
| 3 | 曜日による現地発生日列挙とUTC生成 | 1・2 |
| 4 | F11比較・previewFingerprint・実行inputHash | 1・3 |
| 5 | BatchOperationの操作別DB制約 | 1 |
| 6 | 完全一致検索の共有とF11 preview読取Repository | 1・3・4 |
| 7 | 冪等なF11一括作成Repository | 1・3・4・5・6 |
| 8 | preview・保存Application Service | 6・7 |
| 9 | preview／実行Server Action | 8 |
| 10 | 共通入力フィールドComponent | 1・9 |
| 11 | Page・preview・選択・同一payload再送UI | 9・10 |
| 12 | 既存月別一覧の入口・固定成功toast | 9・11 |
| 13 | ガード付きDB統合試験・専用コマンド | 5〜12 |
| 14 | 適用・再送・受入の運用書 | 1〜13 |

適用順は1→2→3→4→5→6→7→8→9→10→11→12→13→14を標準にする。
モデル構造を既に持つことだけで粒度5を省略しない。
各patchの途中段階で使えない入口は公開せず、導線はPage・Action接続後に追加する。

### 全粒度に適用する確認

- 各粒度の「調査開始ファイル」は基準時点で実在するものだけ。
  下記の新規案は、先行粒度を適用した後に依存成果物として必ず追加で読む。
  「新規案」を実在する調査開始ファイルと取り違えない。
- 既存変更一覧と新規一覧を分ける。対象外でも互換性・セキュリティに必要な読取は可能。
  対象外の変更が必要なら理由と計画変更案を報告し、勝手に範囲を広げない。
- ソース・testを変更する粒度ではAGENTS.mdのJSDoc・import説明・本文行末説明・改行を併用。
  対象外のファイルをコメントの追加だけのために変更しない。
- 変更したソースは型チェック・対象ESLint・関連する新規testを実行する。
  共有部分を変更した粒度は記載した既存回帰testも実行する。
  DBのCHECK・実並列・rollback・HTTP Origin拒否をmock成功だけで保証済みにしない。
- patch作成時は一時環境で実装・検証し、元のワークツリーでgit apply --check・--statを確認。
  実DB・Auth・配送・秘密情報・依存更新は操作しない。
  DB試験を実行できない場合はskipと未検証を明記し、利用者の実施手順を残す。

## 6. 各粒度の詳細

### 粒度1：仕様補足・入力・preview／結果契約

**目的**：第3節の確定事項と提案を仕様へ落とし、後続の信頼境界を固定する。

**調査開始ファイル（既存）**

- `docs/implementation/phases/F11.md`：受入条件・同日終了の推奨と今回の回答の差分。
- `domain/club/event/event-form.ts`：文字数定数・任意文字列のnull・通常イベントとの差。
- `domain/club/content/content-policy.ts`：buildContentTargetRolesとOWNERの規約。
- `domain/club/event/event-month-copy-form.ts`、`domain/club/event/event-month-copy-types.ts`：厳密parser・結果契約の参照。元UUIDと選択日の違い。
- `domain/shared/action-state.ts`、`domain/shared/request-id.ts`：ActionState・UUID v4。
- `tests/event-month-copy-form.test.ts`、`domain/shared/request-id.test.ts`、`vitest.config.mts`：FormDataの境界と設定。

**必要時だけ確認**：roleの表示値が不明なら `domain/club/club-member-role.ts / TARGET_ROLE_OPTIONS`。
validatorのSDK型が不足する場合だけ導入済みzodの該当型を確認する。

**変更予定の既存ファイル**：`docs/implementation/phases/F11.md`。

**新規案**：`domain/club/event/event-practice-batch-types.ts`、
`domain/club/event/event-practice-batch-form.ts`、`tests/event-practice-batch-form.test.ts`。

**内容・完了条件**：共通入力とpreview／実行入力を別契約にする。
選択日は実在日かつ期間・曜日の候補内かを後続で再照合する契約。
単一項目重複・File・未許可field・status／genre／clubId／実行者／UTC値の混入を拒否。
`$ACTION_`輸送項目を業務値にしない。曜日・role・選択日・空欄の正規化をhash計算前に固定する。
previewは0件、31件、超過、権限、取得失敗を区別し、receipt・needsReload・結果不明を型で分離。

**変更しない**：DB・日時生成・hash・認可共通関数・既存単件入力の挙動。

**テスト**：新規form testで不正実在日、月跨ぎ、逆期間、同値単一field重複、File、
0／7／8曜日、不正role、終了未入力・同時刻・逆転、選択0／31／32・重複日・範囲外、
UUID／fingerprint、固定値改変、入力を例外原文へ出さないことを確認。
候補所属の実質照合・認可がこの粒度だけで完了したと説明しない。

### 粒度2：厳密な現地日時解決の最小抽出

**目的**：F10で検証済みのUTC候補列挙を、F11でも使う小さな関数として共有する。

**調査開始ファイル（既存）**

- `domain/club/event/event-month-copy-date-times.ts`：LocalDateTime・isValidTimeZone・localParts・utcCandidatesと呼出し箇所。
- `domain/shared/date-time/club-date-time.ts`：既存の通常日時関数と責務が異なることを確認。
- `tests/event-month-copy-date-times.test.ts`、`domain/shared/date-time/club-date-time.test.ts`：DST・月末・歴史的offset等の期待値。
- `package.json`、`package-lock.json`、`vitest.config.mts`：SDK版・ホストtimezone変更試験の実行条件。

**必要時だけ確認**：`node_modules/@date-fns/tz/tzOffset/index.d.ts`等の該当SDK型。
抽出シンボルの参照増加があればrgでその呼出し元だけ確認する。

**変更予定の既存ファイル**：`domain/club/event/event-month-copy-date-times.ts`。

**新規案**：`domain/shared/date-time/club-local-date-time.ts`、
`domain/shared/date-time/club-local-date-time.test.ts`。

**内容・完了条件**：現地成分の型・timezone検証・成分取得・UTC候補解決だけを移し、F10から利用する。
年0〜99のDate特例、成分roundtrip、秒・ミリ秒、gap／foldの判別を維持する。
F10のexport・返却値・月末補正・終日exclusive・入力不変性は変えない。

**変更しない**：F10の月送り仕様、通常イベントの日時関数、DB、F11列挙、SDKの版。

**テスト**：新規共有testと既存date-times testを、TZ=UTCとAsia/Tokyo等で実行。
通常・1時間／30分DST・消失日・曖昧時刻・秒offset・年境界を照合する。
内部関数を移したことだけを検査するtestにはしない。

### 粒度3：曜日による現地発生日列挙とUTC生成

**目的**：正規化したF11入力から、DBに依存せず候補日・UTC日時・除外理由を生成する。

**調査開始ファイル（既存）**

- `docs/implementation/phases/F11.md`：同月期間・曜日・31件・同日終了。
- `domain/club/event/event-date-times.ts / EventUtcDateTimes`：既存の日時表現。
- `domain/shared/date-time/club-date-time.ts`：現地日・日付検証の既存規約。
- `tests/event-month-copy-date-times.test.ts`、`domain/shared/date-time/club-date-time.test.ts`：固定期待値とtimezoneの回帰例。

**依存成果物**：粒度1の入力型と粒度2の共有resolverを先に読む。

**必要時だけ確認**：timezoneデータ差で期待値が変わった場合だけIntl／TZDateの該当挙動を調べる。

**変更予定の既存ファイル**：なし。

**新規案**：`domain/club/event/event-practice-batch-date-times.ts`、
`tests/event-practice-batch-date-times.test.ts`。

**内容・完了条件**：カレンダー日を最大31日だけ走査し、選択曜日に一致する日を順序固定で返す。
候補IDは現地YYYY-MM-DDで、ランダムID・元イベントUUIDを必要としない。
開始・終了・任意集合を共通resolverで変換し、UTCでも期間が正しいことを再確認する。
除外日もDTOへ渡せる結果とし、0件・全件除外・上限違反を区別する。

**変更しない**：DB・既存イベント取得・F10変換・UI・通知・一般の繰返しルール。

**テスト**：全曜日で31日、2月28／29日、月初末・単日・曜日0件、UTCでは前日になる日、
DSTによる23／25時間日・gap／fold・消失日・集合の変換失敗、year 1／99／9999、
32日・別月・不正日を拒否しホストtimezoneで曜日が変わらないこと。

### 粒度4：F11比較・previewFingerprint・実行inputHash

**目的**：入力・preview・選択の正規化と用途を揃え、表示内容と保存内容を照合できるようにする。

**調査開始ファイル（既存）**

- `domain/club/event/event-month-copy-policy.ts / buildEventMonthCopyKey / pickEventMonthCopyEvent`：比較する12列・role集合。
- `src/infrastructure/security/event-month-copy-fingerprint.ts / digest / buildEventMonthCopyInputHash`：F10固有の用途・版・scope。
- `tests/event-month-copy-policy.test.ts`、`tests/event-month-copy-fingerprint.test.ts`：並び順・scope・機密非返却の試験例。

**依存成果物**：粒度1・3の型と候補生成。

**必要時だけ確認**：hash素材の型が不足する場合だけ `domain/club/event/event-month-copy-types.ts` のEventMonthCopyEventを確認する。
SDK追加は不要。Node cryptoの新APIが必要になった場合だけ導入済み型を追う。

**変更予定の既存ファイル**：なし。

**新規案**：`domain/club/event/event-practice-batch-policy.ts`、
`src/infrastructure/security/event-practice-batch-fingerprint.ts`、
`tests/event-practice-batch-policy.test.ts`、`tests/event-practice-batch-fingerprint.test.ts`。

**内容・完了条件**：既存の12列比較関数を値だけで再利用し、F10の候補型に偽のsource IDを作らない。
genre=PRACTICE・isAllDay=false・null列をサーバーで組み立てる。
F11専用の用途・版を付け、previewとinputのhashを区別する。正規化入力・候補順・role順で決定的。
同じ操作のreplayでは送信済みfingerprintを用い、後から変わったDB値でinputHashを変えない。

**変更しない**：F10のhash・FORMAT_VERSION・保存済みledger、DB、汎用バッチエンジン。

**テスト**：順序差の等価性、各共通field・選択・scope・timezone・既存一致・除外の変更検出、
F10とF11・PREVIEWとINPUTの用途分離、重複日拒否、raw入力やkey素材を結果・ログへ出さないこと。

### 粒度5：BatchOperationの操作別DB制約

**目的**：既存の完了記録を、F10互換性を保ってF11でも保存できるようにする。

**調査開始ファイル（既存）**

- `prisma/schema.prisma / ClubEventBatchOperation`：列・FK・uniqueは既にある。
- `prisma/migrations/20261027000000_f10_event_month_copy/migration.sql`：現行CHECK名・RLS・trigger。
- `src/infrastructure/prisma/repositories/event-month-copy-mutation-repository.ts / existingResult`：F10のoperation検証と最大100件。
- `tests/event-month-copy.flow.integration.test.ts`：現行CHECK・FK・RLSの実DB確認項目。

**必要時だけ確認**：同クラブtriggerの依存に変更があった時だけ
`prisma/migrations/20260927011826_f01_fix_same_club_set_null_trigger/migration.sql`等を読む。
Prismaコマンドの設定確認が必要なら `prisma.config.ts`。秘密情報は読まない。

**変更予定の既存ファイル**：`prisma/schema.prisma`の操作・件数に関する説明だけを新制約へ整合させる。
モデル構造や生成Clientの型は変える必要がない。無関係なコメント変更はしない。

**新規案**：`prisma/migrations/<実装時に採番>_f11_event_practice_batch/migration.sql`。
ディレクトリの正確な時刻は未確定。既存migrationは修正しない。

**内容・完了条件**：operation新規案 `CREATE_PRACTICE_BATCH`を許可。
operation別にF10は1〜100、F11は1〜31件をCHECKする。
第3節の月範囲案を採用するなら、F10の0001-01拒否を保ってF11だけ許す対象月CHECKへ変更。
既存行を消さず、同一clubId＋requestIdのunique、hash・UUID CHECK、FK・SetNull・
clubId不変、RLS・revokeを維持する。新テーブル・シリーズID・テンプレートは追加しない。

**変更しない**：実DB適用、seed、Client自動生成、既存migration、F10 Repositoryの保存仕様。

**テスト**：SQLの対象制約・既存行への互換性をレビューし、適用可能性を確認する。
実DBでのF11 31可／32不可・F10 100可・operation別月境界・権限は粒度13で検証。
patch作成時の未実行を隠さない。schemaコメント整合はDB制約変更に付随する必須修正として扱う。

### 粒度6：完全一致検索の共有とF11 preview読取Repository

**目的**：最新認可・timezoneと最大31候補の既存一致状態を、全件取得せず得る。

**調査開始ファイル（既存）**

- `src/infrastructure/prisma/repositories/event-month-copy-read-repository.ts / duplicateWhere / findEventMonthCopyPreviewData`：完全一致・role集合・status不問・transaction注入。
- `domain/club/event/event-month-copy-policy.ts / pickEventMonthCopyEvent`：比較列の抽出。
- `domain/club/club-member-role.ts`、`domain/club/plan-features.ts`：最新権限。
- `tests/event-month-copy-read-repository.test.ts`、`vitest.config.mts`：DB評価前mockと既存のquery回帰。

**依存成果物**：粒度1・3・4。

**必要時だけ確認**：Prismaの入力型で判別できない時だけ導入済みSDK型、
新しい利用先が増えた場合だけ抽出関数の参照元をrgする。

**変更予定の既存ファイル**：`src/infrastructure/prisma/repositories/event-month-copy-read-repository.ts`。
完全一致検索を下記の小さな共有関数へ委譲するだけ。前月取得・上限・memo化・DTOは維持。

**新規案**：`src/infrastructure/prisma/repositories/club-event-exact-duplicate-repository.ts`、
`src/infrastructure/prisma/repositories/event-practice-batch-read-repository.ts`、
`tests/club-event-exact-duplicate-repository.test.ts`、`tests/event-practice-batch-read-repository.test.ts`。

**内容・完了条件**：共有helperはclubIdと作成予定値、同一transaction clientを受け、
12列と過不足のないrole集合のfindFirst・idだけを返す。status・targetRoles閲覧制限を混ぜない。
F11読取はscopeに対応するACTIVE所属・管理ロール・CLUB_APP・最新timezoneを取得し、
純粋生成結果に一致情報を付ける。最大31回の限定一致検索で、月全体・関連行を全取得しない。
通常clientと呼出し元transaction clientの両方に対応し、書込みを行わない。

**変更しない**：既存の管理者一覧query・月送りquery・一般イベントのRepository、DB制約、汎用Repository基盤。

**テスト**：新規helper／read test、既存 `tests/event-month-copy-read-repository.test.ts`。
club条件、role余分・順序・重複、null／空文字、status不問、31件の検索上限、他club、
最新所属・プラン・timezone、本文・関連行の非取得、既存F10の上限101と前月取得の回帰を検証。

### 粒度7：冪等なF11一括作成Repository

**目的**：最新権限・ledger照合・再preview・全件保存を一transactionで実行する。

**調査開始ファイル（既存）**

- `src/infrastructure/prisma/repositories/event-month-copy-mutation-repository.ts / isCurrentActor / existingResult / createEventMonthCopyBatch`：先行記録照合・Serializable・P2034／P2002。
- `prisma/schema.prisma / ClubEvent / ClubEventBatchOperation`：固定保存列・成功記録。
- `tests/event-month-copy-mutation-repository.test.ts`：応答喪失・rollback・再試行を分けたstore mock。

**依存成果物**：粒度1・3〜6、特に新operationのmigration。

**必要時だけ確認**：参照整合性が不明なら実在する同クラブtrigger、
Prisma error型が変わった時だけ導入済み型を読む。

**変更予定の既存ファイル**：なし。

**新規案**：`src/infrastructure/prisma/repositories/event-practice-batch-mutation-repository.ts`、
`tests/event-practice-batch-mutation-repository.test.ts`。

**内容・完了条件**：最新認可→既存ledger照合→新規だけ再生成・fingerprint照合→選択所属・
有効性・重複日・1〜31件確認→ClubEvent群と成功ledgerを保存。
PRACTICE・DRAFT・isAllDay=false・公開日時null・実行Membership・null列を明示する。
添付・既読・メモ・LINE・workerを作らない。単件createClubEventのloopは使わない。
件数不一致・途中エラーは全件rollback。P2034は初回後最大3回の有限retry案、
P2002後は再認可して記録照合だけ。同じIDの別入力・actor・operationはCONFLICT。
保存後の返答喪失はRESULT_UNKNOWNで、再確認時に書込みを増やさない。

**変更しない**：F10 mutation・一般イベントRepository、共通認可の実装、配送・添付・ledgerの削除機能。

**テスト**：新規mutation testで31件成功、32／0・範囲外／除外日・入力改変拒否、
実行順、正常replay、生成行の変更／削除後、timezone／既存一致の変化、最新権限、
F10との同ID衝突、P2034上限、P2002確認、rollback／commit後応答喪失、機密非出力。
実並列・DB制約・rollbackの実動作は粒度13で確認する。

### 粒度8：preview・保存Application Service

**目的**：scope・正規化入力をRepositoryへ渡し、限定DTOと固定の結果契約を返す。

**調査開始ファイル（既存）**

- `src/application/club/event/get-event-month-copy.ts / getEventMonthCopyPreview`：限定DTO化。
- `src/application/club/event/copy-event-month.ts / copyPreviousMonthEvents`：再検証・receipt検査・固定エラー。
- `app/(club-app)/club/club-membership-authorization.ts / ClubAccessContext`：本人scope。
- `tests/event-month-copy-services.test.ts`：Repository mock・異常receipt・非公開値混入の検証。

**依存成果物**：粒度1・3・4・6・7。

**必要時だけ確認**：ログの追加が必要な場合だけ
`src/infrastructure/logging/sanitize-log-context.ts / sanitizeLogContext`の許可項目を確認する。

**変更予定の既存ファイル**：なし。

**新規案**：`src/application/club/event/get-event-practice-batch.ts`、
`src/application/club/event/create-event-practice-batch.ts`、`tests/event-practice-batch-services.test.ts`。

**内容・完了条件**：認可contextのUUID・共通入力を検証し、previewは生成日・理由・重複・
初期選択・件数と照合値だけを返す。保存は1回だけRepositoryへ委譲しreceiptを検証。
想定外の例外・不正な件数・対象月不一致・未知outcomeを安全な固定結果へ限定する。

**変更しない**：Next依存・Auth SDK通信・DB直書き・既存F10 Service・通知。

**テスト**：新規service test。previewの0／31／超過、除外・重複の初期off、
実行値とpreviewの正規化一致、最小DTO、他イベント情報・raw Error・hash素材の非返却。

### 粒度9：preview／実行Server Action

**目的**：2つのActionで認可・入力・Service・保存後処理を接続する。

**調査開始ファイル（既存）**

- `app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/actions.ts / copyPreviousMonthEventsAction`：認可・bound値・Next制御例外・保存後処理。
- `app/(club-app)/club/club-app-authorization.ts / requireClubAppAdminAccess`、`app/(club-app)/club/revalidate-club-paths.ts / revalidateClubEventPaths`：既存接続。
- `domain/shared/request-id.ts / createRequestId / isRequestId`：サーバー発行ID。
- `tests/event-month-copy-actions.test.ts`、`tests/club-membership-authorization.test.ts`：実共通認可と通信mock。
- Next同梱 `forms.md`・`revalidatePath.md` の該当節。

**依存成果物**：粒度1・8。

**必要時だけ確認**：redirect／unstable_rethrowの利用方法が不明になった場合だけ同梱API資料。
認可を変える必要がある場合は変更せず理由を報告する。

**変更予定の既存ファイル**：なし。

**新規案**：`app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/actions.ts`、
`tests/event-practice-batch-actions.test.ts`。

**内容・完了条件**：previewも実行もAuth本人・slug・ACTIVE・管理role・プランを確認。
boundのslug・対象月を構造検証し、FormDataと認可contextを照合する。
preview成功後に新IDを発行する。実行は前stateの成功・改変された共通値・任意returnToを信頼しない。
F11の保存成功／replay成功後だけ既存4一覧を再検証し、tryの外で同クラブ対象月の管理者一覧へ遷移。
固定toast案は `event-practice-batch-created`。粒度12で表示対応を追加する。
通常の再検証失敗は保存済みneedsReload。Nextの制御例外は再送出する。

**変更しない**：認可・再検証共通関数、F10 Action、ログイン・Proxy・Origin許可設定。

**テスト**：新規Action test。previewで保存しないこと、未ログイン・MEMBER・失効・他club・
STARTER／PRO、単一field重複・File・未許可項目・不正bound、common入力改変、
同ID再送・結果不明・再検証失敗・固定遷移・制御例外の再送出を検証。
HTTPでのOrigin拒否はmockの保証対象外として粒度14の手動受入へ。

### 粒度10：共通入力フィールドComponent

**目的**：月内期間・曜日・共通内容を、既存の入力部品とアクセシビリティ規約で表示する。

**調査開始ファイル（既存）**

- `app/(club-app)/club/[clubSlug]/admin/events/_components/ClubEventForm.tsx`：一般イベントの入力・label・エラー接続を必要な項目だけ確認。
- `app/(club-app)/club/admin/_components/FieldErrorList.tsx`、`app/(club-app)/club/admin/_components/FormErrorAlert.tsx`：id・errors・message。
- `domain/club/club-member-role.ts / TARGET_ROLE_OPTIONS`：OWNER常時対象と任意role。
- `tests/event-month-copy-forms.test.ts`：静的描画とhook mockのパターン、`vitest.config.mts`：node環境。

**依存成果物**：粒度1・9のpropsとAction契約。

**必要時だけ確認**：一般イベントUIと差異がある場合だけ
`domain/club/event/event-form.ts`の該当定数や入力規約を追う。

**変更予定の既存ファイル**：なし。

**新規案**：`app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchInputFields.tsx`、
`tests/event-practice-batch-input-fields.test.ts`。

**内容・完了条件**：既存の単件フォーム全体を複製せず、F11の限定fieldだけを持つ。
同月の日付境界・複数曜日・必須終了・任意集合・roleを表示し、入力とFieldErrorListを関連付ける。
この粒度はleaf Componentで、preview成功の有効性・保存後の状態制御は次粒度が担当する。

**変更しない**：Page・保存UI・単件フォーム本体・PDF・公開／未読／LINE設定・新UIパッケージ。

**テスト**：新規input-fields test。初期月全体、値保持、曜日fieldset・label、必須・範囲、
OWNER説明、項目エラー・disabled、XSS風文字列を文字として表示すること。
実フォーカス・読み上げは手動確認へ残す。

### 粒度11：Page・preview・選択・同一payload再送UI

**目的**：共通入力→preview→選択保存を1routeで接続し、入力を変えたまま古いpreviewで保存させない。

**調査開始ファイル（既存）**

- `app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/page.tsx / EventMonthCopyPage`：Promise props・再認可・固定リンク。
- `app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/EventMonthCopyForm.tsx / EventMonthCopyForm`：snapshot・inFlight・入力固定・結果不明。
- `tests/event-month-copy-pages.test.ts`、`tests/event-month-copy-forms.test.ts`：限定props・bound・queue境界・保存済み表示。
- Next同梱 `page.md`・`forms.md` の該当節。

**依存成果物**：粒度9・10、preview／実行の結果型。

**必要時だけ確認**：Clientへ返す値が曖昧なら粒度8のDTO変換だけを追加確認する。

**変更予定の既存ファイル**：なし。

**新規案**：`app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/page.tsx`、
`app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchForm.tsx`、
`tests/event-practice-batch-pages.test.ts`、`tests/event-practice-batch-forms.test.ts`。

**内容・完了条件**：Pageは厳密な対象月・認可・初期値・Actionを渡し、URLへ共通本文等を載せない。
フォームは入力が変わればpreviewを無効化し、古い非同期preview応答も保存に使わない。
previewに全日・件数・重複・除外・timezoneを表示し、選択0件・除外日・上限超過の保存を抑止。
初回保存送信で正規化common＋選択日＋操作ID＋fingerprintを固定し、以後は同payloadだけ再送。
結果不明の間は新操作へ誘導せず、保存済みneedsReloadでは保存ボタンを出さない。
再previewを許す状態と同一入力の再確認が必要な状態を、F11の結果型で区別する。

**変更しない**：F10 Formのエラー文言判定、既存カレンダー・レイアウト、共通認可・Auth、UI依存追加。

**テスト**：新規Page／forms test。Promise・不正月・直接アクセス、入力後preview・
入力変更と遅延応答・重複初期off／明示on、31／0件、preview pendingと保存pending、
連打・失敗後の同payload・再previewの新ID・通信断・保存後再検証失敗・XSS・label／エラー関連付け。
ブラウザーの通信断・フォーカス復帰・読み上げはmockで完了扱いにしない。

### 粒度12：既存月別一覧の入口・固定成功toast

**目的**：既存管理者月別一覧の表示月からF11へ進み、保存後の結果を確認できるようにする。

**調査開始ファイル（既存）**

- `app/(club-app)/club/[clubSlug]/admin/events/page.tsx / AdminEventsMonthPage`：表示月・既存filter・F10入口・カレンダーprops。
- `domain/club/event/event-toast.ts / ClubEventToastCode / getClubEventToastMessage`：固定成功文言。
- `domain/club/event/event-toast.test.ts`、`tests/event-month-copy-navigation.test.ts`：既存のURL境界・F10回帰。

**依存成果物**：粒度9・11。

**必要時だけ確認**：共有statusタブ・カレンダーのpropsに影響するなら実際のimport先だけ確認し、変更を広げない。

**変更予定の既存ファイル**：`app/(club-app)/club/[clubSlug]/admin/events/page.tsx`、
`domain/club/event/event-toast.ts`、`domain/club/event/event-toast.test.ts`。

**新規案**：`tests/event-practice-batch-navigation.test.ts`。

**内容・完了条件**：「定期練習を一括作成」入口は表示月だけを渡す。
既存のstatus・genre・新規／F10導線・件数・カレンダーの挙動を維持する。
F11の固定成功コードだけを認識し、任意件数・任意message・returnToをqueryから表示しない。
成功先は同クラブ対象月の管理者一覧＋status=ALL。

**変更しない**：一覧取得query、会員画面・カレンダー・ContentStatusTabs、共通ナビゲーション、F10成功コード。

**テスト**：新規navigation、既存toastと `tests/event-month-copy-navigation.test.ts`。
表示月・slug符号化・GET非保存、固定成功文言・不正／配列toast、既存filter・カレンダー値・F10遷移を確認。

### 粒度13：ガード付きDB統合試験・専用コマンド

**目的**：mockで保証できない操作種別の共存・実並列・全件rollback・DB制約を実DBで照合する。

**調査開始ファイル（既存）**

- `tests/event-month-copy.flow.integration.test.ts / enabled / localConfiguration / safeCheck`：ガード前評価禁止・専用client遅延生成・fixture限定cleanup。
- `prisma/schema.prisma`とF10 migration：共存するledgerの基礎。
- `src/infrastructure/prisma/client.ts`、`prisma.config.ts`：dotenv・共有clientの即時評価防止。
- `package.json`、`vitest.config.mts`：専用コマンドと通常test:db・verify:localの区別。

**依存成果物**：粒度5の新migration、F11のRepository・Service・関連test。

**必要時だけ確認**：fixture列やFKが変わった時だけ該当schema・migration。
ガードで安全性を判断できない時は接続せず報告する。

**変更予定の既存ファイル**：`package.json`の専用script1つだけ。

**新規案**：`tests/event-practice-batch.flow.integration.test.ts`。
コマンド案 `test:event-practice-batch:local`。
flag案 `RUN_EVENT_PRACTICE_BATCH_TESTS=1`＋`RUN_DB_INTEGRATION_TESTS=1`、
別途 `EVENT_PRACTICE_BATCH_DISPOSABLE=1`、非production、固定loopback・54322・DB名postgres。
正確な許可条件は既存ガードと現在の使い捨て運用に合わせて確認する。

**内容・完了条件**：ガード前に.env・共有client・Auth SDKを評価せず、専用clientを遅延生成。
flagなしはDBケースをskip、ガード自体は架空設定でtestする。
登録済みfixtureの範囲だけを削除。実Auth・PDF・Storage・LINE・メールは使わない。
通常test:dbやverify:localへ専用DB実行を追加しない。依存・lockを変更しない。

**変更しない**：実DBの自動migration／seed、既存DB試験の再設計、接続先・環境ファイル・配送。

**テスト**：31件一体保存／32件拒否、PRACTICE／DRAFT／実行Membership／公開日時null、
添付・既読・メモ・LINE行なし、同IDの逐次／実並列、異ID並列の変更検出、
途中エラーrollback、P2034注入で有限retryと上限後の確認、生成後の編集／削除後replay、
最新role／所属／プラン、timezone／既存一致の変更、他club拒否、SetNull・unique・CHECK・RLS。
F10の100件保存、同club同requestIdのF10↔F11双方CONFLICT、別club同IDは独立も検証する。
自然の並列競合と、P2034等の障害注入を区別して報告。
patch作成時はDB操作禁止を優先し、skipを成功扱いにせず利用者の手動実施へ残す。

### 粒度14：適用・再送・受入の運用書

**目的**：migration／Client／アプリの順序と、結果不明・再preview・受入残件を明文化する。

**調査開始ファイル（既存）**

- `docs/implementation/phases/F11.md`と本計画：確定仕様・受入条件。
- `docs/runbooks/event-month-copy.md`：共存する完了記録、再送と別操作の区別、専用DBの既存運用。
- `package.json`、F10のAction・Page／Form・専用flow test：共通境界の確認。

**依存成果物**：F11の追加コード・migration・専用test・scriptを先に読む。

**必要時だけ確認**：適用手順と現行運用が食い違う時だけ `docs/ops2.md`のPrisma関係箇所。
既存runbookは変更しない。

**変更予定の既存ファイル**：なし。

**新規案**：`docs/runbooks/event-practice-batch.md`。

**内容・完了条件**：当月内入力・31件・同日終了・重複明示選択、入力変更時の再preview、
初回送信後の同payload・同ID確認、保存済みneedsReload、ledger削除禁止、F10との操作種別衝突を記載。
DB・Client・アプリ適用順、専用ガード・手順、実DB未実行と実ブラウザー未確認を区別する。
role／プラン・timezone／曜日／DST・連打・通信断・再送・フォーカス・label・読み上げ・
HTTP直接POST／Origin拒否の受入表と、F11.md各受入条件への対応を用意する。

**変更しない**：ソース、F10 runbook、他フェーズの仕様、実DB・Auth・配送操作。

**テスト**：文書の参照パス・関数・コマンドと実装の一致、git diff --check、
受入条件と単体／DB／手動項目の対応を静的確認。不要なコードtestを追加しない。

## 7. DB・Prismaの変更まとめ

- 再利用モデルは `ClubEventBatchOperation`と`ClubEvent`。新シリーズ・テンプレート・preview保存テーブルなし。
- 必要なDDLは成功ledgerのoperation許可、操作別件数CHECK、採用する年範囲に応じた対象月CHECK。
  既存F10行、COPY_PREVIOUS_MONTHの1〜100件、UUID・hash形式、uniqueを維持する。
- `ClubEvent`自体のDB制約をF11専用に強化しない。既存の通常イベント・F10には終日・任意終了等がある。
  PRACTICE・DRAFT・同日終了・31件・関連行非作成はF11の入力／Repositoryと専用試験で保証する。
- actorのnullable FK・削除時SetNull、club削除時cascade、同クラブtrigger・clubId不変、RLS・revokeを維持。
  operationをuniqueへ加えず、F10とF11のID流用は衝突として拒否する。
- Prisma schemaの列構造変更は不要。粒度5でコメント整合を行う。
  適用済みSQLの編集、DB push／reset、実DBへの自動反映は行わない。

## 8. ユーザー操作からDBまで（完成後の予定フロー）

現状未接続であり、下表の新規案は各粒度適用後に成立する。

| 段階 | ファイル・既存関数／新規責務、入力→出力 | DB変更 |
| --- | --- | --- |
| 入口：粒度12 | `app/(club-app)/club/[clubSlug]/admin/events/page.tsx / AdminEventsMonthPage`。表示月→F11固定route | なし。既存一覧読取のみ |
| 初期画面：粒度11 | 新規案 `app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/page.tsx`。Promise propsを解決し、`requireClubAppAdminAccess`で得たcontextと対象月→初期入力・2つのAction | 権限読取のみ |
| 共通入力：粒度10・11 | 新規InputFields／Form。期間・曜日・共通内容→preview要求 | なし |
| preview：粒度9・8・6・3 | 新規Action→Service→read Repository。認可scope・正規化入力＋DB最新timezone→現地候補・UTC日時・既存一致・限定DTO・fingerprint・サーバー発行requestId | 読取のみ。発生日の純粋列挙はDBに依存しない |
| 選択保存：粒度11・9 | 新規Formがpreviewの正規化入力＋selectedDates＋requestId＋fingerprintを固定。実行Actionが再認可・bound月・構造検証→保存Service | ここまで一括作成なし。ClientのclubId・日時・固定列は採用しない |
| 一体保存：粒度8・7 | 新規Service→mutation Repository。scope・入力hash→最新認可、既存ledger照合、新規だけ再preview／選択照合→固定outcome＋receipt | SerializableでDRAFT群と成功ledgerを一体作成。replayは追加作成なし |
| 完了：粒度9・12 | Actionが`revalidateClubEventPaths`→同clubの対象月管理者一覧・status=ALL・F11固定toast | commit外の再検証・遷移。通常の再検証失敗は保存済みneedsReload |

## 9. 危険箇所と対策

| 観点 | 根拠と計画上の対策 |
| --- | --- |
| UTC日で曜日を決める | `club-date-time.ts`の現地成分、F10のutcCandidatesを参照。現地日で曜日列挙してからUTCに変換 |
| DST foldをSDK任せで選ぶ | F10の厳密resolverだけを抽出し、UTC候補0／複数を区別。F10と共有部分の回帰testを必須化 |
| 入力変更後に古いpreviewで保存 | 共通入力をfingerprintへ含め、UI無効化とサーバー再計算の両方で拒否。遅延preview応答も無効化 |
| 正規化がpreviewと保存で異なる | trim・空欄null・role・曜日・選択日を同一Domainで正規化してhash化。入力hashとpreviewhashの用途を分離 |
| 別clubや別actorへhashを流用 | scopeをhashへ含めるだけに頼らず、Auth→同slugのACTIVE所属→Repository最新認可を実施 |
| 31件制限のすり抜け | 期間・候補・選択・作成直前・DB操作別CHECKで確認。現実の同月候補は最大31だが32選択やDDL直接保存も拒否 |
| 一部だけ保存される | createClubEventのloop禁止。イベント群とledgerを同一transactionで保存、実DBでrollback検証 |
| 他操作の成功記録を使う | 既存uniqueはclubId＋requestIdのまま、operation・actor・inputHash・対象月・件数・完了日時を照合 |
| replayで現在の重複判定に阻まれる | 最新認可の後、ledgerを先行照合する。元の入力hashへ後から変わったDB値を混ぜない |
| 既存一致を全件取得する | 同じ12列・role集合、status不問で最大31回のfindFirst。全モデル・関連行・月全体取得を避ける |
| pendingだけの二重送信防止 | UI refとpayload固定に加え、unique・Serializable・有限retry・同一操作の再確認を実装 |
| 保存後再検証を保存失敗とする | 既存Actionの成功済みneedsReloadを参照。revalidate／redirectはDB commit外 |
| 機密ログ | sanitizeLogContextの許可項目を確認。入力・見出し・本文・Cookie・token・hash素材・raw Errorをログへ渡さない |
| DB制約とF11の契約のずれ | F10専用のoperation・targetMonthと1〜100件CHECKを粒度5で整理。F10互換性を粒度13で実測 |
| 過剰共通化 | 共有は認可・role・既存値比較・厳密時刻解決・完全一致検索・ledgerモデルだけ。汎用queue／バッチ基盤なし |
| 既存コメントの不整合 | F10 mutationのexistingOnlyは公開済み限定ではなく記録照合モード、skipDuplicates:falseは黙ってスキップする指定ではない。コメントを転載せず実装の制御で判断し、この調査だけで無関係な修正をしない |

## 10. 設計書と現在コードの相違・未確認事項

1. F11.mdは入力期間を「1か月以内」とするだけだった。今回の回答で対象月内に確定。
   「翌日終了」は推奨の選択肢から同日必須終了に確定。既存一致の再選択も今回許可で確定した。
2. proposals2.mdは終日endAt=null等の初期設計を含むが、現在の通常入力・F10はexclusive終了を使う。
   F11で終日を追加しない案とし、この違いを通常イベントへ遡って修正しない。
3. ClubEventBatchOperationは既にあるが、F10のCHECKがそのままF11を許可するわけではない。
   新モデル作成を重複計画に入れず、既存モデルの制約拡張だけを粒度5へ含める。
4. F10のhashは元イベントUUID・updatedAt・月送りに依存する。F11にはその入力がない。
   再利用する部分を分け、偽sourceやF10 FORMAT_VERSION変更で吸収しない。
5. 一覧のparseMonthSearchParamは不正値を現在月へfallbackする。F11の生成対象では拒否する。
   既存一覧の仕様を変える修正は計画しない。
6. 公開対象はOWNER常時包含、PROは現在CLUB_APPなし。背景の抽象的な「管理者」を根拠に緩めない。
7. 提案のまま残る事項は、第3節の終日・追加本文なし、集合日の扱い・警告、
   DSTを日別除外する扱い、0001-01の許容、正確なroute・operation・新規関数名・成功文言。
   粒度1の仕様化と該当粒度の実装時に確認する。ユーザー確定済みと偽らない。
8. 実DBのmigration状態、実Auth、Origin拒否、ブラウザーのフォーカス・通信断、
   31件の実測性能は未確認。本作業で接続・操作・コードtestの再実行は行っていない。
9. 新しい日時SDK・UI・E2Eパッケージは不要な計画。型で判断できない新APIが生じた場合だけ追加調査する。

## 11. F11外の依存事項・対象外

- F01の同クラブ参照・SetNull補正・clubId不変trigger、F10の完了記録migrationが適用済みであることが前提。
  依存する既存制約をこの計画で再実装しない。
- 共通Auth・ACTIVE所属・プラン、既存Prisma接続、既存4一覧再検証を利用する。認可拡張や新プラン対応は別作業。
- 通常編集・公開・通知は既存機能。F11で全予定自動公開・LINE配送・PDF・既読・メモ作成はしない。
- ホームページの月間練習PDF、一般の定期イベント／テンプレート、シリーズ編集、定期queue、
  複数月・任意繰返し・祝日自動除外・外部カレンダー連携は対象外。
- 共通ファイルの抽出はF11の実利用に必要な範囲だけ。F10の大規模リファクタリングはしない。

## 12. 自己確認

- F11以外の機能実装を計画へ混入させていない。F10変更は具体的な共通処理の抽出と互換性検証に限定。
- 実装済みのモデル・認可・role・再検証・単件作成・日時／比較を重複実装しない方針を明記。
- 変更予定の既存ファイルは本文を確認。未作成ファイル・未定のmigration時刻・新関数は新規案として区別。
- 関連する定義・呼出し元・import先・Prisma・Repository・Action・Page・ログ・test設定を追跡。
- 各粒度に調査開始、必要時の確認、既存変更、新規案、対象外、依存、完了条件、testを記載。
- 不明点を推測で埋めず、確定した3回答・設計提案・未確認の実施結果を分けた。
- 今回の変更は本計画書だけ。ソース・feature.patch・Git index・依存・秘密情報・実DBは変更していない。
