<!-- docs/runbooks/event-practice-batch.md -->

# F11 定期練習予定の一括作成：適用・再送・受入手順

F11粒度14の運用書です。調査基準はコミット `ed0869f` です。
仕様は [F11.md](../implementation/phases/F11.md)、
対象範囲は [粒度14の計画](../implementation/phases/F11-granular-plan.md) を参照します。
共通の完了記録と前月複製の運用は [F10運用書](event-month-copy.md) を参照します。
F11.mdの粒度1にある「後続」「未接続」は、その時点の記録です。
本書は基準コミットに接続済みの処理を説明します。

この文書patchだけではDB・Client・アプリの変更は発生しません。
粒度1〜13を適用済みの環境で、この文書追加だけを理由にmigrationを再生成しません。
文書の追加完了、実DB試験の完了、実ブラウザー・HTTP受入の完了は分けて記録します。
本書作成では実DB・Auth・Storage・LINE・メールを操作せず、過去の受入結果も未確認です。

## 利用条件と生成する範囲

- 同クラブのACTIVE所属と管理者ロールOWNER・COACH・OFFICERが必要です。
  現行の `CLUB_APP` 対応プランはSTANDARDです。MEMBER、所属失効、他クラブ、STARTER・PROは拒否します。
  Pageと両Actionで認可し、Repositoryも新規保存・replayの前に最新の所属・ロール・プランを確認します。
- 対象月は西暦1〜9999年の単一 `YYYY-MM` です。
  作成Pageは月の未指定・不正値・配列queryを現在月に置き換えず、入力エラーを表示します。
  管理者一覧からは、その一覧で解決した表示月を渡します。
- 期間は同じ対象月の開始日〜終了日で、両端を含みます。初期値はその月全体です。
  月を跨ぐ任意31日間ではありません。曜日は日曜0〜土曜6から複数選択します。
  曜日未選択は入力エラー、有効な条件で該当日がなければ候補0件です。
- 除外前の候補上限は31件、保存する選択は1〜31件です。
  同月内の実在日付では最大31件ですが、改変入力・上限超過の内部結果も拒否します。
  チェックを減らして上限を回避する運用にはしません。
- 共通入力は対象月・期間・曜日・タイトル・開始／終了時刻・場所・集合時刻／場所・公開対象です。
  終了は必須で、同日の開始より後だけを許可します。同時刻・逆転・翌日送りは認めません。
  集合時刻は発生日の同日内の任意入力です。開始後の集合は警告付きで許可します。
- 公開対象 `targetRoles` はOWNERを必ず含み、COACH・OFFICER・MEMBERを追加できます。
  これは生成イベントの公開対象ロールです。LINEの送信先を選ぶ項目ではありません。
- 保存行は `genre=PRACTICE`、`status=DRAFT`、`isAllDay=false` に固定します。
  `content`・`belongings`・`notes`・`firstPublishedAt`・`readRequiredAt` はnullです。
  作成者・更新者は実行したMembershipです。
  PDF添付・既読・個人メモ・LINE履歴を作らず、公開・LINE通知も行いません。
  内容確認後の公開は既存の通常編集による別操作です。この機能に一括公開は含みません。

根拠：`app/(club-app)/club/club-app-authorization.ts / requireClubAppAdminAccess`、
`domain/club/plan-features.ts / hasClubFeature`、
`domain/club/event/event-practice-batch-form.ts / validateEventPracticeBatchPreviewInput`、
`src/infrastructure/prisma/repositories/event-practice-batch-mutation-repository.ts / isCurrentActor / eventData`。

## 日時・既存一致・除外の確認

| 項目 | 現行の扱い |
| --- | --- |
| 発生日・曜日 | クラブtimezone上の現地カレンダーで日付と曜日を決める。UTC日付や端末のtimezoneで曜日を選ばない |
| UTC変換と表示 | 各発生日の開始・終了・任意集合を厳密にUTCへ変換。previewは使用timezoneとUTC offset付きの現地日時を表示する |
| DST gap／fold | 不存在時刻はNONEXISTENT_LOCAL_TIME、候補UTCが複数の曖昧時刻はAMBIGUOUS_LOCAL_TIMEとして選択不可。自動補正・片方のUTCの自動採用はしない |
| 開始・終了・集合 | いずれかが変換不能ならその日の候補を除外する。UTC変換後に終了が開始以下の場合もINVALID_INTERVALとして除外する |
| その他の除外 | INVALID_DATE_TIME・OUT_OF_RANGEも理由を表示する。全候補と除外理由を残し、除外日は選択・保存できない |
| 開始後の集合 | MEETING_AFTER_STARTの警告を表示する。警告だけなら選択できるため、日時の意図を確認する |
| 既存イベントとの完全一致 | 同クラブの生成後の12列と対象ロール集合で比較。既存の公開／下書き状態を問わず、作成者・公開日時・PDF等は比較しない |
| 一致した候補 | 初期未選択。生成可能な候補は、利用者が意図した重複として明示選択すれば保存できる。除外候補は明示選択でも保存できない |

12列は `title`・`content`・`genre`・`targetRoles`・`startAt`・`endAt`・
`isAllDay`・`location`・`meetingAt`・`meetingLocation`・`belongings`・`notes` です。
既存一致は重複を禁止するDB unique制約ではありません。
新しい操作IDで既存一致を明示選択すると、同じ内容が追加作成されます。

根拠：`domain/club/event/event-practice-batch-date-times.ts / generateEventPracticeBatchDateTimes`、
`domain/club/event/event-practice-batch-policy.ts / buildEventPracticeBatchEvent`、
`src/infrastructure/prisma/repositories/club-event-exact-duplicate-repository.ts / findClubEventExactDuplicateId`、
`src/application/club/event/get-event-practice-batch.ts / getEventPracticeBatchPreview`。

## DB・Client・アプリの適用順

新しい環境への導入や、粒度5のmigrationが未適用の場合の手順です。
以下のDB・環境ファイルを使うコマンドは、担当者が対象を確認して手動実行します。
本書作成では実行しません。接続URLや環境ファイルの値を受入記録・チャットへ転記しません。

1. 接続先・用途・復旧担当を確認する。専用DB試験には破棄可能なローカルDBを用意する。
   localhostであることだけでは、使い捨てDBである保証にはならない。
2. F11コードとschema、先行分を含む既存migration履歴を用意する。
   `prisma/migrations/20261027000000_f10_event_month_copy/migration.sql` がledgerを作成し、
   `prisma/migrations/20261031000000_f11_event_practice_batch/migration.sql` が操作別CHECKを更新する。
   適用済みSQLは編集しない。
3. F11アプリを稼働させる前に、対象DBでstatusを確認し、未適用の既存migrationをdeployする。
4. 同じコードのschemaをvalidateし、Prisma Clientをgenerateする。
   DBとClientを整えてから、そのコードのアプリをビルドし起動・再起動する。
5. コード試験、専用DB試験、実ブラウザー・HTTP受入をそれぞれ実施し、結果を記録する。

確認済みの `.env.local` が対象ローカルDBを指している場合の手動コマンドです。
実行シェルの既存環境変数も接続先へ影響するため、ファイル名だけで判断しません。

```sh
npx dotenv-cli -e .env.local -- npx prisma migrate status
```

未適用の履歴がある場合だけ、既存SQLを適用します。

```sh
npx dotenv-cli -e .env.local -- npx prisma migrate deploy
```

```sh
npx dotenv-cli -e .env.local -- npx prisma validate
npx dotenv-cli -e .env.local -- npx prisma generate
```

既存SQLを適用するための新しいmigration生成、`db push`、`migrate reset`、seedは不要です。
Prisma schemaの列構造はF11で増やしていませんが、SQLの操作別CHECKの適用が必要です。
F11 migrationはoperationの許可、対象月、件数の3つのCHECKを同一transactionで更新します。
F11は1〜31件・0001-01可、F10は1〜100件・0001-01不可です。
既存F10行、UUID・hashのCHECK、unique・FK・trigger・RLS・Data API権限は維持します。

`prisma.config.ts` はdotenvを評価します。上記は接続先を確認して行う運用操作であり、
統合試験ファイルがガード前に.envを読むことを許可する説明ではありません。
既存方針は [docs/ops2.md](../ops2.md) のPrisma適用・Client生成箇所も参照します。
本番反映の実施は本書追加の範囲外です。コードを戻す場合も、新規操作を止めて保存結果を確認し、
復旧担当へ引き継ぎます。適用済みmigrationやledgerを削除して復旧を試みません。

## 通常の操作

1. 管理者月別一覧 `/club/{clubSlug}/admin/events?month=YYYY-MM` を開く。
   表示月を確認して「定期練習を一括作成」から
   `/club/{clubSlug}/admin/events/create-practice-batch?month=YYYY-MM` へ進む。
   一覧の公開状態・ジャンルの絞込みは生成条件に引き継がない。
2. 同月内の期間、曜日、共通内容、時間、公開対象を入力し、「作成予定をpreviewする」を押す。
   この段階は読取だけ。preview成功ごとにサーバーが新しいrequestIdを発行する。
   Page表示だけでは操作IDを発行しない。
3. 全候補の日付・件数・timezone・日時・警告・除外・既存一致を確認して選択する。
   候補0件・全件除外・選択0件では保存できない。
   初回保存前の共通入力変更は古いpreviewを無効にするため、現在の条件で再previewする。
   入力変更前に送ったpreview応答が遅れて到着しても、それを保存に使わない。
4. 「選択した予定を下書き作成」を押す。共通入力と選択を固定し、処理中の連打を止める。
   正常成功・replay成功は、同クラブの対象月の管理者一覧へ戻る。
5. 遷移先は `/club/{clubSlug}/admin/events?month=YYYY-MM&status=ALL` に
   `toast=event-practice-batch-created` と `toastId={requestId}` を付けた固定経路。
   文言は「定期練習の予定を下書きとして作成しました。」で、任意の件数をURLから表示しない。
   選択件数分の下書きと生成列を確認する。toastのURLだけを保存成功の証拠にしない。

根拠：`app/(club-app)/club/[clubSlug]/admin/events/page.tsx / AdminEventsMonthPage`、
`app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/page.tsx / EventPracticeBatchPage`、
同ディレクトリの `EventPracticeBatchForm.tsx / EventPracticeBatchForm / SelectionForm` と
`actions.ts / previewEventPracticeBatchAction / createEventPracticeBatchAction`、
`domain/club/event/event-toast.ts / getClubEventToastMessage`。

## 初回送信後の再確認・再preview

フォームは初回保存時の共通入力・selectedDates・requestId・previewFingerprintをメモリに保持します。
「同じ選択・操作IDで再確認する」は、その値を変えず新しいFormDataへ詰めて再送する操作です。
現在も同じ本人・所属に権限があることが必要です。自動で別の操作IDに置き換えません。
保存エラーの区別にはstateのoutcomeを使います。固定文言の一致で分岐する契約ではありません。

| 状態・結果 | 行うこと |
| --- | --- |
| CREATED／ALREADY_COMPLETED | 保存済み。対象月の一覧で確認する。同じ入力のreplayでは追加作成しない |
| previewのVALIDATION_FAILED／TOO_MANY／FORBIDDEN／PREVIEW_FAILED | 候補を保存しない。項目エラー、期間・曜日・権限等を確認し、条件を整えてpreviewを再試行する |
| 保存のVALIDATION_FAILED／PREVIEW_CHANGED | この送信で新規作成しない。選択日、timezone、既存一致などを確認し、「入力を変更してpreviewを作成し直す」を使う |
| CONFLICT | 操作IDが別入力・実行所属・操作種別等で使用されている。元操作の結果を確認し、必要な別操作だけ新しいpreviewで開始する |
| FORBIDDEN・認証／所属拒否 | 現在のログイン・ACTIVE所属・管理ロール・プランを確認する。新しいIDで認可を回避しない |
| CREATE_FAILED | 同じフォームから同じpayloadで再確認できる。条件を変える必要がある場合は、明示的にpreviewを作り直して別操作にする |
| RESULT_UNKNOWN・保存の通常通信例外 | 保存の成否が未確定。同じタブ・payload・操作IDを保ち、再確認する。新previewや新しい操作を始めない |
| 保存済みsuccessでneedsReload=true | commit後の一覧再検証だけが失敗。保存ボタンは出さず「作成済み」を表示する。「対象月の管理一覧を開く」で一覧を確認し、再保存しない |
| タブを閉じた／再読込などでpayloadを失った | メモリから復元できない。新しい操作の前に、権限ある担当者が元のクラブ・操作ID・実行所属・対象月・完了記録と生成結果を確認する。判断不能なら保留する |

保存後のRESULT_UNKNOWNでは再previewボタンを表示しません。
CREATE_FAILEDでは同payloadの再送と明示的な再previewの両方を許可します。
その他の既知の保存エラーでは、権限等を確認してから新しいpreviewへ戻ります。
これらは `EventPracticeBatchForm.tsx / SelectionForm / beginSave / restartPreview` と
`EventPracticeBatchForm / invalidate / beginPreview` の現行制御に基づきます。

previewFingerprintは現在の候補を照合する値、inputHashは送信入力を照合する値です。
両者を混同しません。inputHashは正規化共通入力・選択日・previewFingerprintと認可scopeから作ります。
同じrequestIdでも共通入力・選択・照合値・実行所属が異なればCONFLICTになります。
新しいpreviewは新しい操作IDになるため、結果不明な操作の照会の代用にはしません。
保存結果照会専用APIや、失ったフォームを復元する機能はありません。

根拠：`src/infrastructure/security/event-practice-batch-fingerprint.ts / buildEventPracticeBatchFingerprint / buildEventPracticeBatchInputHash`、
`src/infrastructure/prisma/repositories/event-practice-batch-mutation-repository.ts / existingResult / createEventPracticeBatch`。

## 完了記録とF10との共存

`ClubEventBatchOperation` は成功した操作の完了記録です。未完了の記録を先に作りません。
同クラブ・requestIdに加え、operation・inputHash・実行所属・対象月・件数・完了日時を照合します。
生成後にイベントを編集・削除しても記録を残し、同じ入力のreplayで復元・再作成はしません。
実行Membership削除時は実行者参照がSetNull、クラブ削除時はそのクラブの記録がcascade削除されます。
実行所属を失った操作者のreplayを許可する保証ではありません。認可は常に先に確認します。

一意性は `clubId + requestId` です。operationはuniqueへ追加していません。
同じクラブでF10のCOPY_PREVIOUS_MONTHとF11のCREATE_PRACTICE_BATCHに同じIDを流用すると、
どちらの順序でも後の操作はCONFLICTです。別クラブの同じIDは独立して扱います。
F10は元イベント選択、F11は現地日付選択です。入力・IDを使い回さないでください。

ledger削除、requestId変更、別管理者への引継ぎで結果不明の再送を通しません。
記録の照会は権限ある担当者が必要最小限のメタデータで行います。
本文・個人情報・Cookie・トークン・接続URL・生SQL例外・hash素材をログや共有資料へ出しません。
UIの照合値も認証・認可の代用ではありません。

根拠：`prisma/schema.prisma / ClubEventBatchOperation`、
`src/infrastructure/prisma/repositories/event-practice-batch-mutation-repository.ts / isCurrentActor / existingResult`。
P2034は初回の後に最大3回再試行し、上限ではRESULT_UNKNOWNです。
P2002後は別transactionで再認可し、成功記録だけを再照合します。
同ファイルの `existingOnly` はこの照合専用モードであり、「既存の公開イベントだけ」の意味ではありません。
`skipDuplicates: false` も重複を黙って除外する設定ではありません。
既存コメントの意味の不整合は、コードを変更せず、実際の制御に従って説明しています。

## ユーザー操作からDBまでの確認箇所

以下はリポジトリルートからのパスです。同じディレクトリのファイル名も併記します。

| 段階 | ファイル・関数、入力→出力 | DB変更 |
| --- | --- | --- |
| 入口・初期表示 | `app/(club-app)/club/[clubSlug]/admin/events/page.tsx / AdminEventsMonthPage` → `create-practice-batch/page.tsx / EventPracticeBatchPage`。slug・表示月→同月全体の初期値とAction | 一覧・認可の読取のみ |
| 入力とpreview要求 | `app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchInputFields.tsx / EventPracticeBatchInputFields` と `EventPracticeBatchForm.tsx / EventPracticeBatchForm` → `actions.ts / previewEventPracticeBatchAction`。共通入力FormData→再認可・構造検証済み入力 | 保存なし |
| preview生成 | `src/application/club/event/get-event-practice-batch.ts / getEventPracticeBatchPreview` → `src/infrastructure/prisma/repositories/event-practice-batch-read-repository.ts / findEventPracticeBatchPreviewData`。context・共通入力→最新timezone、候補日時、一致情報→限定DTOとfingerprint。Actionが成功時にrequestIdを発行 | 最新所属・プラン・一致イベントの読取。preview保存テーブルはない |
| 日時と一致 | `domain/club/event/event-practice-batch-date-times.ts / generateEventPracticeBatchDateTimes` が現地日とUTC候補を列挙。`src/infrastructure/prisma/repositories/club-event-exact-duplicate-repository.ts / findClubEventExactDuplicateId` が同クラブの代表IDだけを返す | 日時列挙は純粋処理。一致検索は読取のみ。既存ID・本文をClientへ返さない |
| 選択と保存要求 | `app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchForm.tsx / SelectionForm / beginSave` → `actions.ts / createEventPracticeBatchAction`。共通入力・選択日・操作ID・照合値を固定→再認可・bound値照合 | ここまで保存なし。clubId・実行者・UTC値・固定保存列をClientから採用しない |
| 一体保存 | `src/application/club/event/create-event-practice-batch.ts / createEventPracticeBatch` → `src/infrastructure/prisma/repositories/event-practice-batch-mutation-repository.ts / createEventPracticeBatch`。contextのscope・正規化入力→最新認可、完了記録の先行照合、新規時の再previewとfingerprint照合→固定outcomeと最小receipt | Serializable transactionでClubEventのDRAFT群とClubEventBatchOperationを一体保存。途中失敗でrollback。replayは追加作成なし |
| 完了表示 | Action → `app/(club-app)/club/revalidate-club-paths.ts / revalidateClubEventPaths` → 固定管理者一覧。`domain/club/event/event-toast.ts / getClubEventToastMessage` が固定文言を返す | commitの外で再検証・遷移。再検証失敗で保存を呼び直さない |

本体の接続に後続粒度待ちはありません。実環境の受入は以下で別に確認します。

## コード試験・専用DB試験

### DBへ接続しない確認

既存の依存を使い、環境ファイルを読み込まずに実行します。

```sh
npm run typecheck
npm run lint
RUN_EVENT_PRACTICE_BATCH_TESTS=0 RUN_DB_INTEGRATION_TESTS=0 \
  npx vitest run tests/event-practice-batch*.test.ts
```

このコマンドではDBケースはskipです。ガードの単体試験成功とDBの保証を区別します。
通常の `test:db` はF11専用flowを列挙していません。
`verify:local` もF11専用script・flagを設定せず、flag未指定なら内部の `npm test` でもDBケースはskipです。
この説明を、環境ファイルを読む `verify:local` 全体がDB未接続という保証には使いません。

| 実行対象 | 主な確認 | 限界 |
| --- | --- | --- |
| `tests/event-practice-batch-form.test.ts` | 対象月内・期間・同日終了・共通入力・選択1〜31件・未許可項目の拒否 | DB認可・実HTTPは行わない |
| `tests/event-practice-batch-date-times.test.ts` | 現地曜日・月末・閏年・UTC前日・DST gap／fold・除外・集合警告 | 実ブラウザーの表示・端末差は別途確認 |
| `tests/event-practice-batch-policy.test.ts`・`tests/event-practice-batch-fingerprint.test.ts` | 固定12列、ロール集合、scope・共通入力・選択・timezone・既存一致の照合 | 実並列の証明ではない |
| `tests/event-practice-batch-read-repository.test.ts`・`tests/event-practice-batch-mutation-repository.test.ts` | 最新認可、上限付き一致検索、replay・有限retry・一体保存境界 | DB呼出しはmock。実rollback・unique・FK・CHECKは専用DBで確認 |
| `tests/event-practice-batch-services.test.ts` | 限定DTO・初期未選択・結果契約・最小receipt・機密非返却 | Repositoryをmock |
| `tests/event-practice-batch-actions.test.ts` | 両Actionの直接呼出し、共通認可、改変・多重項目・File拒否、再検証・固定遷移 | Auth・DB境界はmock。実HTTP POST／Origin拒否は別途確認 |
| `tests/event-practice-batch-input-fields.test.ts`・`tests/event-practice-batch-pages.test.ts` | 初期値・月の厳密性・label・エラーID・認可とAction接続 | 静的描画・認可境界のmock |
| `tests/event-practice-batch-forms.test.ts`・`tests/event-practice-batch-navigation.test.ts` | 古いpreview無効化、連打、同入力再送、outcome別操作、入口・固定toast | hook・Action queue等を置換。実フォーカス・通信・読み上げは別途確認 |
| `tests/event-practice-batch.flow.integration.test.ts` のガード | 架空設定で接続前の拒否、flag不足時のURL未評価、例外原文抑止 | flagなしでDBケースは実行しない |

### 専用の使い捨てDBだけで行う確認

対象は `tests/event-practice-batch.flow.integration.test.ts` です。
同ファイルの `enabled`・`localConfiguration` を接続条件の正本とします。

- `RUN_EVENT_PRACTICE_BATCH_TESTS=1` と `RUN_DB_INTEGRATION_TESTS=1` の両方が必要。
  専用script `test:event-practice-batch:local` が設定します。
- 別途 `EVENT_PRACTICE_BATCH_DISPOSABLE=1` が必要。scriptでは自動同意しません。
- `NODE_ENV`・`VERCEL_ENV` はproduction以外。
- DATABASE_URLはpostgres／postgresql、hostはlocalhost／127.0.0.1、portは54322、DB名はpostgres。
  user・password必須、前後空白・query・fragmentは禁止。空の `?`・`#` も拒否します。
- 値のある `PG` 接頭辞の環境変数は拒否します。URL以外の接続設定の混入を避けます。
- F11までのmigration・Client生成が済み、接続roleにfixture作成・削除とmetadata読取の権限が必要。
  専用試験がmigration・seed・接続先の変更を自動実行することはありません。

両flagが揃うまでURLを評価せず、全ガード通過後に専用PrismaPg clientを遅延生成します。
共有Prisma client・dotenv・実Auth・Next・メールの評価はmock境界で拒否します。
実Storage・PDF・LINE・メールは使いません。fixtureのAppUserはAuthログインアカウントではありません。

確認済みの使い捨てローカルDBを指す `.env.local` を用いる場合の手動コマンドです。
外側のdotenvによる読込みは担当者が行う準備であり、試験のガード前自動読込みではありません。

```sh
npx dotenv-cli -e .env.local -- env EVENT_PRACTICE_BATCH_DISPOSABLE=1 \
  npm run test:event-practice-batch:local
```

ガード・DBケースとも失敗0・skip 0で成功したことを確認します。skipを合格に数えません。
中断後は登録済みfixtureのUUID・クラブ範囲を確認し、担当者へ引き継ぎます。
cleanupは書込み前に登録したfixtureクラブ・ユーザーの範囲に限定し、全件削除は行いません。

| 専用DBの確認 | 内容 |
| --- | --- |
| 上限・保存列 | 31件一体保存／32件入力拒否。PRACTICE・DRAFT・実行Membership・公開日時null、添付・既読・メモ・LINE行なし |
| 冪等性 | 同ID逐次／実並列、異なるIDの実並列によるPREVIEW_CHANGED、異入力・実行所属のCONFLICT、編集・削除後のreplay |
| rollback・retry | 実書込み後の件数不一致・完了記録CHECK違反で全件rollback。注入P2034の有限retry・上限後の同payload確認 |
| 最新設定・クラブ境界 | role・所属・プラン変更、timezone・公開／下書きの既存一致変更、他クラブscope拒否、明示選択許可 |
| DB制約と権限 | SetNull・同クラブunique・実行所属参照・clubId不変・操作別CHECK。RLS有効、policyなし、PUBLIC／anon／authenticated権限metadata |
| F10との共存 | F10の100件一体保存、同クラブ同IDのF10→F11／F11→F10双方CONFLICT、別クラブ同IDの独立保存 |

自然な実並列は `synchronize` で2本のDB読取を同期し、P2034を注入せず競合させます。
`transaction` のP2034、`transactionProxy` の件数不一致・CHECK違反は明示した障害注入です。
実DBのrollback結果と、競合の発生方法を区別して記録します。
RLS項目は権限metadata確認であり、実ブラウザーのData API通信を実行した結果ではありません。
F10の独立した受入も必要な場合は、F10運用書の別flag・別専用コマンドで確認します。
このF11専用コマンドだけでF10全受入の完了にはしません。

## 実ブラウザー・HTTP受入表

実Authを伴う確認は、許可された検証環境・検証アカウントで担当者が実施します。
専用DB試験のfixtureをログインに流用しません。結果は証跡確認後に更新します。

| ID | 操作・条件 | 期待結果 | 結果 |
| --- | --- | --- | --- |
| M01 | OWNER・COACH・OFFICER／STANDARDで表示月から入る | 同月全体が初期期間。曜日・時間は利用者が指定し、previewまでDB作成なし | 未確認 |
| M02 | 未ログイン、MEMBER、失効所属、他クラブ、STARTER・PROでPageと両Actionへアクセス | ログイン遷移または拒否。他クラブの候補表示・保存なし | 未確認 |
| M03 | 月未指定・配列・不正月、期間の月跨ぎ、終了同時刻／逆転、未選択曜日を送る | 不正値をfallback・翌日補正せず拒否。有効な0候補は空表示、0件保存不可 | 未確認 |
| M04 | Asia/Tokyoの月初0時、複数曜日、月末、閏年を指定する | UTC前日でも現地日・曜日と件数が一致。月初末の対象日を落とさない | 未確認 |
| M05 | NYの2026-03-08 02:30、2026-11-01 01:30を開始・終了・集合で試す | gap／foldの理由を表示し選択不可。通常のDST日も現地日時・offsetが正しい | 未確認 |
| M06 | 開始後の集合、集合未設定、不正timezone、全件除外を試す | 警告のみの候補は選択可、未設定は保持。不正timezoneで保存せず、全件除外も保存不可 | 未確認 |
| M07 | 既存の公開・下書きイベントと完全一致する候補を作る | 両状態とも初期未選択。意図した明示選択は保存可能。既存ID・本文をClientへ返さない | 未確認 |
| M08 | preview後に共通入力を変更し、遅い旧応答も到着させる | 変更直後も旧previewから保存不可。現在入力で作り直す。保存後の入力・選択は固定 | 未確認 |
| M09 | preview後にtimezone・一致状態・権限を別操作で変える | 保存時に最新状態でPREVIEW_CHANGEDまたはFORBIDDEN。失効後のreplayも拒否 | 未確認 |
| M10 | 31候補を保存し、32件選択等の改変も試す | 31件は全件と完了記録が一体保存、32件は拒否。保存列・公開日時null・関連行なしを照合 | 未確認 |
| M11 | preview・保存の連打、Enter連続、同payloadの並列再送 | UIで重複送信を抑止。同IDで1群・1記録。別IDの同previewは変更検出と区別する | 未確認 |
| M12 | 保存送信後に通信断・応答喪失を再現して復帰する | RESULT_UNKNOWNでは新操作を作らず同payload・同IDで再確認。完了済みなら追加しない | 未確認 |
| M13 | 保存後の一覧再検証だけを失敗させる | 作成済み件数・再読込案内を表示し保存ボタンなし。needsReloadを保存失敗と扱わない | 未確認 |
| M14 | 成功後の一覧、状態フィルター、toast、生成下書きを確認する | 対象月・status=ALLへ固定遷移。固定toast、任意URL件数を不採用。自動公開・通知なし | 未確認 |
| M15 | キーボードだけで入力・候補選択・エラー修正・再確認する。読み上げも確認する | label・fieldset・説明／エラーの関連付け、操作順・フォーカス可視性・移動、件数・pending・成功・失敗の認識を確認。未達は受入残件にする | 未確認 |
| H01 | 正規画面の実際のNext Action POSTを同一セッション・同payloadで直接再送する | UIを経由しても省略しても再認可・入力照合。保存済みreplayで増えない | 未確認 |
| H02 | 検証環境でMEMBER・他クラブ・失効所属の両Action POST、bound値・選択日・固定列を改変する | 認可・構造・bound照合で拒否しDB非更新。clientのclubIdやpreviousStateを信用しない | 未確認 |
| H03 | 実稼働形式の検証環境で不正OriginのAction POSTを送る | Next側の拒否応答とDB非更新を確認。Serviceを直接呼ぶ単体試験の成功では代替しない | 未確認 |

M15は実フォーカスの移動や通知を保証済みとする記載ではありません。実際の操作・読み上げで確認します。
HTTP確認は正規画面のリクエスト形式を利用し、Action ID・Cookie・payloadを公開資料へ保存しません。
H03は特定のHTTPステータスだけで合格にせず、拒否とDB非更新の両方を確認します。
`allowedDevOrigins` の設定だけではServer ActionのOrigin拒否の証明にはなりません。

## F11.md受入条件との対応・完了記録

| F11.mdの受入条件 | 単体・mockの根拠 | 専用DBの確認 | 手動の対応 |
| --- | --- | --- | --- |
| timezoneと曜日がずれない | date-times・read Repository・Service・フォーム試験 | previewと保存日時の一致、timezone変更検出 | M04・M05・M06・M09 |
| 同じ操作の二重送信で重複しない | fingerprint・mutation Repository・Action・forms試験 | 逐次／実並列・replay・異入力／異操作種別の衝突 | M08・M11・M12・M13・H01 |
| 31件超を拒否する | form・date-times・read／mutation Repository・Service・Action・forms試験 | 31件保存／32件拒否、操作別CHECK | M03・M10・H02 |
| 全件DRAFT、LINE・PDF・既読を作らない | policy・mutation Repository・Service・Action・forms試験 | 固定列・公開日時null・関連行0 | M10・M14 |
| MEMBERはAction直接呼出しでも実行できない | 両Action・Page・Repositoryの認可試験 | 最新role・所属・プラン、他クラブscope拒否 | M02・M09・H02 |

上表の短縮した試験名は「DBへ接続しない確認」の具体的なファイルに対応します。
以下は本書作成時の状態です。過去の実行結果を推測して完了にはしません。

| 確認対象 | 状態 | 担当者が残す証跡 |
| --- | --- | --- |
| 文書と現行実装の照合 | 作成時に静的確認。コマンドは実行結果ではない | 基準commit・変更文書・参照照合・patch check結果 |
| 型・lint・単体／mock・接続ガード | 本粒度では未実行。過去結果は未確認 | 実行commit・コマンド・成功／失敗／skip件数 |
| 実DBの並列・rollback・制約・権限 | 本粒度では未実行。過去結果は未確認 | 使い捨て環境の確認、全DBケース結果・所要時間・cleanup結果 |
| 実ブラウザー・HTTP・アクセシビリティ | 本粒度では未確認 | M01〜M15・H01〜H03ごとの結果、ブラウザー・端末・担当者・日時 |

必要な受入が未実施・不合格なら、文書追加の完了とF11全体の受入完了を分けて報告します。
本粒度ではソース、試験コード、認可、DB制約、Next設定、F10運用書、配送を追加変更しません。
