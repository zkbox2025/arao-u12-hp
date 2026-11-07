<!-- docs/runbooks/event-month-copy.md -->

# F10 前月予定の複製：運用手順と受入確認表

F10粒度12の運用書です。調査基準はコミット `c8a999c` です。
文書の作成・patch適用だけで、DB試験や実ブラウザーでの受入を完了にしません。
今回の文書作成では実DB・Auth・Storage・LINE・メールを操作しません。
過去の実行結果はこの調査では未確認のため、結果欄は証跡を確認した担当者が更新します。

仕様の根拠は [F10.md](../implementation/phases/F10.md)、
対象範囲は [粒度12の計画](../implementation/phases/F10-granular-plan.md) です。
F10.md末尾の「未確定事項」は粒度1時点の記録です。
以下は、その後のユーザー確定事項と基準コミットの実装で採用済みの挙動です。
既存仕様書・既存runbook・ソースは、この文書の追加では変更しません。

## 利用権限と複製する範囲

- Auth本人に対応する、同クラブのACTIVEな所属が必要です。
  ロールはOWNER・COACH・OFFICER、プランは現在の設定でCLUB_APPを持つSTANDARDです。
  MEMBER、所属失効、他クラブ、STARTER・PROは拒否します。
  Page・Actionに加え、Repositoryも新規作成とreplayの前に最新の権限を確認します。
- 対象月は単一の `YYYY-MM` です。例えば `2026-02` を表示して実行すると、
  クラブtimezone上で2026年1月に開始したイベントを複製します。
  前々月に開始して前月にも継続する予定は含みません。
- 元予定は公開済み・下書きの両方、全ジャンルが対象です。
  管理者月別一覧の公開状態・ジャンルの絞込みは、複製候補の条件へ引き継ぎません。
- 除外前の前月候補が101件以上なら、previewで拒否します。
  選択を100件以下に減らしたり、不正・重複候補を除いたりして上限を回避できません。
  0件は空表示、実行する選択は1〜100件です。
- コピー列は `title`、`content`、`genre`、`targetRoles`、`startAt`、`endAt`、
  `isAllDay`、`location`、`meetingAt`、`meetingLocation`、`belongings`、`notes` です。
  日時以外の正常な値・nullを保持します。不正な元データを黙って修復して保存しません。
- 生成行はすべてDRAFTです。`firstPublishedAt`・`readRequiredAt`はnull、
  作成者・更新者は実行したMembershipです。元予定は変更しません。
  PDF添付、既読、個人メモ、LINE履歴はコピーせず、LINE通知も作成しません。
  公開や通知が必要なら、生成後に既存の別操作で確認・実行します。

根拠：`app/(club-app)/club/club-app-authorization.ts / requireClubAppAdminAccess`、
`domain/club/plan-features.ts / hasClubFeature`、
`src/infrastructure/prisma/repositories/event-month-copy-read-repository.ts / findEventMonthCopyPreviewData`、
`src/infrastructure/prisma/repositories/event-month-copy-mutation-repository.ts / isCurrentActor / eventData`。

## 日時・重複候補の読み方

| 項目 | 現行の扱い |
| --- | --- |
| 月送り | UTCの月ではなく、クラブtimezoneの現地日時を1か月進める。存在しない日付は移動先の月末へ補正する |
| 終了・集合 | 開始と同様にそれぞれ1か月進める。対象月の外へ跨っても、対象月内へ切り詰めない。nullは保持する |
| 終日 | 終了日時はその時点を含まない境界。表示上の最終日を月送りしてから翌日境界を作り直す。UTCで常に24時間とは限らない |
| 精度・表示 | 秒・ミリ秒を保持し、新旧日時・クラブtimezone・UTC offset・補正項目をpreviewで確認する |
| DST・不正な期間 | 存在しない現地時刻、UTC候補が2つある曖昧な現地時刻、終了が開始以下になる期間等は選択不可。foldで片方のUTCを自動選択しない |
| 既存予定との完全一致 | 変換後のコピー列と対象ロール集合で比較。既存側のDRAFT／PUBLISHED、作成者・公開日時・添付等は比較条件にしない |
| 既存一致の初期選択 | 初期未選択。選択可能な候補は明示選択すれば複製できるため、意図した重複かを確認する |
| 候補同士の完全一致 | 元の開始日時・ID順で先頭の代表だけ初期選択する。既存予定とも一致する代表は初期未選択。同じ内容になる候補の複数選択はUI・保存時とも拒否し、片方だけの選択は許す |
| 不正な元予定 | OWNERを対象に含まない等の不正値や変換不能は除外する。理由を確認し、必要な元予定の修正後に再previewする |

根拠：`domain/club/event/event-month-copy-date-times.ts / convertEventMonthCopyDateTimes`、
`domain/club/event/event-month-copy-policy.ts / findEventMonthCopyCandidateDuplicates`、
`src/application/club/event/get-event-month-copy.ts / getEventMonthCopyPreview`。
画面の除外区分はINVALID_SOURCE・INVALID_DATE_TIME・INVALID_INTERVALです。
内部のDST詳細理由が、そのまま同じコード名で画面へ表示されるとは限りません。

## 適用順とローカル試験の準備

この文書patch自体にはschema・migration・アプリの変更はありません。
F10を新しい環境へ導入する場合は、以下の順で準備します。
本番反映・接続先変更・DB初期化は、本手順を読むだけで実行済みにはしません。

1. 対象環境、バックアップ・復旧担当、DB接続先を確認する。
   DB統合試験は、破棄可能なローカルSupabase相当の環境だけで行う。
   接続先がlocalhostでも使い捨てである保証にはならないため、担当者が用途を確認する。
2. `prisma/schema.prisma`と既存のmigration履歴を含むF10のコードを用意する。
   `prisma/migrations/20261027000000_f10_event_month_copy/migration.sql`は、
   先行する同クラブ参照・SetNull補正・clubId不変の共通関数に依存する。
   適用済みmigrationを編集しない。
3. 新しいF10アプリを稼働させる前に、既存migrationをDBへ適用する。
   ローカルDBを起動し、下記のstatusを確認して、未適用分がある場合だけdeployする。
4. schemaを検証し、同じコードからPrisma Clientを生成する。
   生成済みClient・DBの両方を整えてからアプリを起動・再起動する。
5. 接続ガード・コード試験・専用DB試験を実施し、後述の実ブラウザー・HTTP受入を記録する。

`.env.local`が確認済みのローカルDBを指している場合の手動コマンドです。
この文書作成では実行しません。読込ファイルと、実行シェルの既存の環境変数が
意図したDBを指すことを確認します。環境ファイルの値・接続URLをチャットや受入記録へ転記しません。

```sh
npx dotenv-cli -e .env.local -- npx prisma migrate status
```

未適用migrationがある場合だけ実行します。

```sh
npx dotenv-cli -e .env.local -- npx prisma migrate deploy
```

```sh
npx dotenv-cli -e .env.local -- npx prisma validate
npx dotenv-cli -e .env.local -- npx prisma generate
```

既存SQLを適用するために、新しいmigrationの生成、`db push`、`migrate reset`は不要です。
この試験のためのseedも不要です。試験自身が専用fixtureを作成・削除します。
`prisma.config.ts`はdotenvを評価するため、上記は対象環境を確認して行う運用操作です。
後述の試験ファイルが、ガード前に.envを自動読込みするという意味ではありません。
適用時の既存手順は [docs/ops2.md](../ops2.md) のmigration・Client生成の記述も参照します。

復旧でコードを戻す場合も、適用済みmigrationや完了記録を安易に削除しません。
まず新しい複製操作を止め、対象環境・保存結果を確認して復旧担当へ引き継ぎます。

## 通常の操作

1. 管理者の月別一覧 `/club/{clubSlug}/admin/events?month=YYYY-MM` を開く。
   対象月を確認し、「前月の予定を複製」から
   `/club/{clubSlug}/admin/events/copy-previous-month?month=YYYY-MM` を開く。
2. コピー元の月、クラブtimezone、新旧日時、終日、月末補正、除外・重複を確認する。
   初期選択は必要に応じて変更できる。選択0件・同内容候補の複数選択では送信できない。
3. 「選択した予定を下書きで複製」を押す。初回送信後は選択を固定する。
   処理中の連打はUIで抑止し、サーバーでも同じ操作を照合する。
4. 通常成功と同一操作のreplay成功は、同クラブの対象月の管理者一覧へ戻る。
   遷移先は `/club/{clubSlug}/admin/events?month=YYYY-MM&status=ALL` に
   `toast=event-month-copied`・`toastId={requestId}`を付けた固定の経路。
   成功文言は「前月の予定を下書きとして複製しました。」で、任意の件数をURLから表示しない。
5. 一覧の総件数ではなく、今回の下書きが選択件数分作成されたことを確認する。
   自動公開・添付コピー・外部通知は行われない。toastのURLだけを保存成功の証拠にしない。

## 再送・再preview・障害時の判断

初回送信後のフォームは、最初のpayloadをメモリに保持します。
同じ選択・requestId・previewFingerprint・対象月を、同じ本人・所属で再送するのが結果確認です。
Pageを再取得すると新しいrequestIdが発行され、別操作になります。
同じrequestIdでも異なる入力・実行者はCONFLICTで、現在の権限が失効していればreplayも拒否します。

| 状況・結果 | 行うこと |
| --- | --- |
| CREATED／ALREADY_COMPLETED | 保存済み。対象月の管理者一覧で確認する。同じ操作のreplayでは追加作成しない |
| READYで0件 | 元の開始月・クラブ・timezoneを確認する。保存は行えない |
| TOO_MANY | 除外前の前月候補が101件以上。チェック数を減らして回避せず、一括複製を中止する |
| 不正source・変換不能 | 理由を確認し、必要なら既存の編集機能で元予定を修正して再previewする |
| VALIDATION_FAILED／PREVIEW_CHANGED | 現在の送信は保存しない。元予定・timezone・既存一致状態等を再確認し、表示されたリンクで再previewして選び直す |
| CONFLICT | その操作IDは別の内容等で使用されている。先の操作の結果を確認したうえで、必要な別操作だけ再previewする |
| FORBIDDEN・ログイン／所属拒否 | 現在のログイン、ACTIVE所属、管理ロール、プランを確認する。IDを変えて認可を回避しない |
| CREATE_FAILED | 同じフォーム・操作のまま再送できる。選び直す場合は画面の再previewリンクで新しい操作にする |
| RESULT_UNKNOWN・通常の通信例外 | 同じタブ・選択・操作IDのまま「同じ選択・操作IDで再送して確認」を使う。結果が不明な間は新しい操作を始めない |
| 保存後の通常の再検証失敗 | successとneedsReload=trueを返し、「保存済みです（件数）。」を表示する。保存ボタンは出ない。管理者一覧を再読込して確認する |
| タブを閉じた／ページを再読込して最初のpayloadを失った | フォームのメモリは復元できない。新しい操作を送る前に、担当者が元のクラブ・操作ID・実行者・対象月等で完了記録と保存結果を確認する。不明なら保留する |

結果不明のとき、フォームは再previewリンクを表示せず、同じ入力での確認を案内します。
エラーの種類に応じた再preview可否は
`EventMonthCopyForm.tsx / REPREVIEW_ERRORS / canRepreview`を根拠とします。
この判定は固定エラーメッセージに依存するため、将来文言を変える場合はActionとフォームを揃えて検証します。
結果照会専用の公開APIや、失ったフォームを復元する機能は追加していません。

`ClubEventBatchOperation`は成功した操作の完了記録です。
同一クラブ・requestIdに加え、operation・inputHash・実行者・対象月・件数・完了日時を照合します。
記録照会は権限のある担当者が必要なメタデータに限定して行い、
本文、個人情報、Cookie、token、生SQL例外、ハッシュ作成素材をログやチャットへ出しません。
生成イベントを編集・削除しても完了記録は残り、同じ入力のreplayで復元・再作成はしません。
Membership削除時は実行者参照だけSetNull、クラブ削除時はそのクラブの記録がcascade削除されます。
記録を削除して再送を通す運用はしません。

一意性の単位は `clubId + requestId` です。
別requestIdで既存一致候補を明示選択すれば、同じ内容を再作成できます。
別の管理者への引継ぎ・新しいpreviewを、結果不明の同一操作の代替にしないでください。

## ユーザー操作からDBまでの確認箇所

以下はリポジトリルートからのパスです。

| 段階 | ファイル・関数、入力と出力 | DB変更 |
| --- | --- | --- |
| 管理者入口 | `app/(club-app)/club/[clubSlug]/admin/events/page.tsx / AdminEventsMonthPage`。表示月から複製previewへのリンクを作る | 既存一覧の読取。複製はしない |
| 認可 | `app/(club-app)/club/club-app-authorization.ts / requireClubAppAdminAccess`。slugとAuth本人からクラブ・所属のcontextを得る | 本人・所属・プランの確認。権限を作成しない |
| preview | `app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/page.tsx / EventMonthCopyPage` → `src/application/club/event/get-event-month-copy.ts / getEventMonthCopyPreview`。contextと対象月から限定DTO・fingerprintを得て、新しいrequestIdとbound Actionを渡す | 読取のみ |
| 候補取得・変換 | `src/infrastructure/prisma/repositories/event-month-copy-read-repository.ts / findEventMonthCopyPreviewData` → `domain/club/event/event-month-copy-date-times.ts / convertEventMonthCopyDateTimes`。最新クラブ・所属、前月開始の最大101行、コピー列一致を取得し、新旧日時・補正・除外を返す | 読取のみ |
| 選択と送信 | `app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/EventMonthCopyForm.tsx / EventMonthCopyForm` → 同ディレクトリの `actions.ts / copyPreviousMonthEventsAction`。対象月・選択元ID・requestId・previewFingerprintを再認可・構造検証・bound値照合する | ここまで複製なし。clubId・実行者・本文をclient入力から採用しない |
| 一括保存 | `src/application/club/event/copy-event-month.ts / copyPreviousMonthEvents` → `src/infrastructure/prisma/repositories/event-month-copy-mutation-repository.ts / createEventMonthCopyBatch`。contextのscopeと正規化入力を渡す。最新認可、完了記録の先行照合、新規だけ再previewとfingerprint照合を行い、固定outcomeと最小receiptを返す | Serializable transactionでClubEventのDRAFT群とClubEventBatchOperationを一体保存。途中失敗でrollback。replayは追加書込みなし |
| 完了表示 | Action → `app/(club-app)/club/revalidate-club-paths.ts / revalidateClubEventPaths` → 固定管理者一覧。`domain/club/event/event-toast.ts / getClubEventToastMessage`が固定文言を返す | 再検証・遷移はcommitの外。再保存しない |

本体の接続に後続粒度待ちはありません。実環境での受入結果は別に記録します。
P2034は初回の後に最大3回再試行し、上限ではRESULT_UNKNOWNです。
P2002後は別transactionで再認可し、完了記録の照合だけを行います。
該当処理の`existingOnly`は「公開済みイベントだけ」の意味ではありません。
`skipDuplicates: false`は重複を黙ってスキップする設定でもありません。
既存コメントのこれらの不整合は、コードを変更せず実装の制御に合わせて説明しています。

## コード試験・専用DB試験

### DBへ接続しない試験

先に型・Lintを確認します。下記は既存の依存を使用します。

```sh
npm run typecheck
npm run lint
```

F10の単体・mock試験と、ガードの単体試験を実行します。

```sh
RUN_EVENT_MONTH_COPY_TESTS=0 RUN_DB_INTEGRATION_TESTS=0 \
  npx vitest run tests/event-month-copy*.test.ts
```

この実行では専用DBの20ケースがskipされます。DBの保証を得た結果として扱いません。
通常の `test:db` の列挙対象には、この専用試験を含めていません。
`verify:local`もF10専用script・flagを設定しません。flag未指定では、
内部の `npm test` でもF10のDBケースはskipです。

| 実行対象 | 確認するもの | 保証範囲の限界 |
| --- | --- | --- |
| `tests/event-month-copy-form.test.ts`・`tests/event-month-copy-policy.test.ts` | 入力境界、コピー列、完全一致・候補間一致 | 実DB制約や認証通信を行わない |
| `tests/event-month-copy-date-times.test.ts` | 月末・閏年・終日・DST gap／fold・秒精度・期間逆転 | ブラウザーの実表示は別途確認 |
| `tests/event-month-copy-fingerprint.test.ts` | scope・元予定・timezone・一致状態の変更検出、正規化 | 実並列の保証ではない |
| `tests/event-month-copy-read-repository.test.ts`・`tests/event-month-copy-mutation-repository.test.ts` | 上限付きquery、再認可、replay、有限retry、保存境界 | DB呼出しをmock。実rollback・unique・FKは専用DB試験で確認 |
| `tests/event-month-copy-services.test.ts` | 最小DTO、初期選択、結果契約、機密情報の非返却 | Repositoryをmock |
| `tests/event-month-copy-actions.test.ts` | 共通認可、直接呼出し、入力改変、再検証・固定遷移 | 実Auth通信・HTTP Origin拒否の証明にはならない |
| `tests/event-month-copy-pages.test.ts`・`tests/event-month-copy-forms.test.ts`・`tests/event-month-copy-navigation.test.ts` | Page引数、bound値、表示、同一入力の再送、導線・toast | 静的描画・hook等のmock。実フォーカス・通信断・読み上げは手動 |

### 専用の使い捨てDBだけで行う試験

対象は `tests/event-month-copy.flow.integration.test.ts` です。
ガードを通過後に専用PrismaPg clientを生成し、Service・Repositoryと実DBを接続します。
実Auth・Storage・LINE・メールは使いません。fixtureのAppUserはログイン用Authアカウントではありません。

接続条件は同ファイルの `enabled`・`localConfiguration` を正本とします。

- `RUN_EVENT_MONTH_COPY_TESTS=1`・`RUN_DB_INTEGRATION_TESTS=1`の両方が必要。
  専用scriptがこの2つを設定する。
- 別途 `EVENT_MONTH_COPY_DISPOSABLE=1` が必要。scriptで自動同意はしない。
- `NODE_ENV`・`VERCEL_ENV`がproductionではないこと。
- `DATABASE_URL`はpostgres／postgresql、hostはlocalhost／127.0.0.1、portは54322、DBはpostgres。
  ユーザー名・パスワードがあり、前後空白・query・fragmentを含まないこと。
- 値が空でない `PG*` 環境変数を拒否する。ドライバーの接続先上書きを持ち込まない。
- F10までのmigrationとClient生成が完了し、専用clientの接続roleに必要なDB権限があること。
  anon・authenticatedのData API権限を緩めて通す試験ではない。

既存のdotenv-cliを外側から使う場合の例です。担当者が接続先を確認してから実行します。

```sh
npx dotenv-cli -e .env.local -- env EVENT_MONTH_COPY_DISPOSABLE=1 \
  npm run test:event-month-copy:local
```

期待結果はガード22件と実DB20ケースの **42件成功・失敗0・skip 0** です。
ガード違反や固定エラーは成功扱いせず、接続設定・migration・該当ケースを確認します。
SQL・接続エラーの原文を共有せず、ケース名と機密情報を除いた結果を担当者へ伝えます。
試験は登録済みfixtureのclubId・userIdに限定してcleanupします。
中断等で残存した場合も、登録されたfixture範囲を確認して担当者へ引き継ぎ、全件削除は行いません。

| 専用DBの確認 | 内容 |
| --- | --- |
| 件数・コピー値 | 100件一体保存／101件preview拒否。他club・前々月開始の除外、元予定不変、DRAFT・実行者・公開日時null・previewと日時一致 |
| 関連行 | 元のPDF添付metadata・既読・個人メモ・LINE履歴が生成行へコピーされない。実PDF・配送を使わない |
| 冪等性 | 同requestIdの逐次／実並列、異入力／異actorの衝突、元・生成予定の変更／削除後のreplay |
| rollbackと再試行 | 件数不一致・CHECK違反後の全体rollback。P2034をcommit前へ注入して有限retry・上限・同一入力での確認を検証 |
| 変更・最新権限 | preview後の元予定・timezone・既存一致変更、異requestIdの実並列。Membership失効・role・プラン変更で拒否 |
| DB制約と権限 | unique・同クラブFK・clubId不変・CHECK・Membership削除時のSetNull。RLS有効・policyなし・PUBLIC／anon／authenticated権限metadata |

P2034と件数不一致は試験側の障害注入です。自然発生した競合の再現結果とは区別します。
実並列・CHECK違反・transaction rollback・権限metadataは、専用DB実行で確認する項目です。
100件の所要時間も実行環境と併せて記録し、本作業で性能測定済みとはしません。

## 実ブラウザー・HTTP受入確認表

使い捨てクラブ、既存の承認済み手順で用意したテスト用Authアカウント、対象月を使用します。
実DB試験のfixtureをAuthログインに流用しません。
本番アカウント・実PDF・外部配送は使わず、コードmockの成功をこの表へ転記しません。
各行は結果、実施日、担当、環境、機密情報を除いた証跡・未実施理由を記録します。

| ID | 操作・条件 | 期待結果 | 結果 |
| --- | --- | --- | --- |
| M01 | STANDARDのOWNER・COACH・OFFICERで一覧→preview→保存 | 各ロールが同クラブで実行できる。対象月・全ジャンルの候補とDRAFT作成を確認 | 未確認 |
| M02 | 未ログイン、MEMBER、失効所属、他クラブ、STARTER・PROでURLへ直接アクセス | ログイン遷移・認可拒否。別クラブの内容表示や保存を行わない | 未確認 |
| M03 | 月未指定、不正月、配列query、前月開始0件・100件・101件 | 不正月を現在月へfallbackしない。0件送信不可、100件可、101件は選択前に拒否 | 未確認 |
| M04 | 公開済み・下書き、前々月開始で前月にも継続する予定を用意 | 前月開始の両状態だけ候補。元予定は変更しない | 未確認 |
| M05 | Asia/Tokyoで1月31日→2月、閏年、UTCでは前日の日時 | クラブ現地日で月末補正。新旧日時と補正対象が正しい | 未確認 |
| M06 | 単日・複数日終日、終了・集合が対象月を跨ぐ予定 | 終日の排他的終了を保持し、終了・集合を対象月へ切り詰めない | 未確認 |
| M07 | DSTを跨ぐ通常日時、gap／foldとなる日時 | 通常日時の現地時刻・offset・秒精度を保持。gap／foldは選択不可 | 未確認 |
| M08 | DRAFT／PUBLISHEDの既存完全一致、候補同士の一致 | 既存一致は初期off・明示選択可。候補間一致は代表だけ初期on、複数選択は拒否 | 未確認 |
| M09 | 不正source、期間逆転、見出しにHTMLに見える文字列 | 不正候補は理由付きで選択不可。見出しは文字として表示され、スクリプト等を実行しない | 未確認 |
| M10 | 保存直前にテスト環境の元予定・timezone・既存一致を変更 | PREVIEW_CHANGEDで保存を止め、再previewして最新内容を確認できる | 未確認 |
| M11 | 保存を連打・Enter連続、同payloadを再送 | 処理中の操作を抑止し、同requestIdで1群・1記録。別requestIdは別操作と区別 | 未確認 |
| M12 | テスト環境で送信後に通信を遮断し復帰、応答喪失も確認 | 同じタブとpayloadで再送確認。結果不明で新操作を案内せず、保存済みなら追加しない | 未確認 |
| M13 | 保存後の再検証だけが失敗する条件を再現 | 保存済み表示と一覧再読込リンク。再実行ボタンを出さず、保存を再度呼ばない | 未確認 |
| M14 | 成功後の管理者月別一覧、フィルター、toastと下書き | 対象月・status=ALLへ戻り固定toast。作成件数・非コピー列・自動公開／通知なしを確認 | 未確認 |
| M15 | キーボードのみで選択・送信・再確認、読み上げ・狭い画面 | labelとcheckboxが対応し、補正・除外・エラー・pending・保存済みが認識できる。フォーカス位置と復帰を実機確認 | 未確認 |
| H01 | 正規画面の実際のNext Actionリクエストを、正当なセッションで直接再送 | UIを経由しなくても再認可・入力照合。同payloadのreplayで増えない | 未確認 |
| H02 | テスト用リクエストで他club元ID・未許可field・bound値・所属／権限失効を検証 | 有効な形式でも改変・越境・失効を拒否し、別クラブの情報や生例外を返さない | 未確認 |
| H03 | 実際のNext ActionリクエストでHostと一致しない外部Originを指定 | frameworkのOrigin検証で拒否され、保存が起きない。実環境のProxy経路でも確認 | 未確認 |

M13の再現環境・既存の障害注入手段は、この調査では未確認です。
コードmockでの保証と分け、再現できなければ理由を付けて保留します。
HTTP確認は正規画面のリクエスト形式を利用し、Action ID・Cookie・payloadを公開資料へ保存しません。
H03は実際の拒否応答とDB非更新を確認し、特定のHTTPステータスだけで合格にしません。
`next.config.ts`の `allowedDevOrigins` はServer ActionのOrigin受入試験の代わりにはなりません。
Origin拒否や認可を通すために設定を緩める変更は、この粒度の対象外です。

## F10受入条件との対応と完了記録

| F10.mdの受入条件 | コード・mock | 専用DB | 手動 |
| --- | --- | --- | --- |
| 別クラブのイベントを複製できない | read／mutation Repository・Service・Action試験 | 他club候補除外・他club所属の拒否・同クラブFK | M02・H01・H02・H03 |
| 二重送信で同じイベント群が増えない | mutation Repository・Action・フォーム試験 | 逐次／並列replay、異入力衝突、変更／削除後replay | M11・M12 |
| timezone込みで月末補正が正しい | date-times・policy・Service・フォーム試験 | 保存日時とpreviewの一致 | M05・M06・M07 |
| 生成はDRAFTでPDF・LINE・既読情報なし | mutation Repository・Service・フォーム試験 | コピー列・公開日時null・関連行0・元予定不変 | M01・M04・M14 |
| 100件超を実行前に拒否 | 入力・read Repository・Service・Page試験 | 100件保存・101件拒否 | M03 |

| 記録する区分 | 文書作成時点の状態 | 担当者が残す証跡 |
| --- | --- | --- |
| 文書と実装・コマンドの一致 | 本粒度の静的確認対象 | 基準commit、確認したパス・script、patchのcheck結果 |
| 単体・mock・接続ガード | 本作業では未実行・過去結果未確認 | 実行commit、コマンド、成功／失敗／skip件数 |
| 実DBの20ケース | 本作業では未実行・過去結果未確認 | 専用使い捨て環境、42件の結果、所要時間、cleanup結果 |
| 実Auth・ブラウザー・HTTP | 本作業では未実施・過去結果未確認 | M01〜M15・H01〜H03の結果、担当・日付・環境・残課題 |

結果は「成功」「失敗」「未実施」「保留」を区別します。
必要な受入が未実施なら、文書の追加完了とF10全体の受入完了を分けて報告します。
この粒度では試験コード、認証・認可、DB制約、キャッシュ、配送、他フェーズを追加変更しません。
