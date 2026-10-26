# F10 前月予定の複製：粒度別実装計画

調査日：2026-10-26（Asia/Tokyo）。ソースコードの実装・patch生成は行っていない。

## 1. 基準・範囲・読み方

- 基準ブランチ：`feat/club-app-foundation`。
- 基準コミット：`5b9813f396cc460d504e8db2de0bc596e215a28e`（`feat:前月予定の複製の準備`）。
- 開始時の `git status --short` は空。計画書は開始時に存在する空ファイルだった。
- 優先順位：`AGENTS.md` → `docs/implementation/phases/F10.md` → 現在のコード。
  `CLAUDE.md` は `@AGENTS.md` の参照のみ。
  `docs/proposals2.md` はイベント・クラブ分離・Membership監査の背景として参照した。
- 対象は前月イベントから対象月への下書き一括作成のみ。
  一般の定期予定、任意期間コピー、公開、PDFコピー、通知、他フェーズの改善は含めない。
- 以下の「新規」「案」のパス・関数・型・モデルは設計上の提案であり、既存実装ではない。
  先行粒度で新設するファイルも、調査時点の既存ファイルと区別する。
- 各粒度の「変更しない」は読取禁止ではない。整合性・認可の確認に必要なら読取り可能。
  対象外の変更が必要になった場合は、理由と最小の計画変更案を報告し、黙って拡張しない。
- 各patch作成時は基準との差を確認し、指定粒度だけを一時環境で実装する。
  元のソース・Git index・依存関係を変更せず、Git diffで新規ファイルも含める。
  元のワークツリーでは `git apply --check` と `--stat` までとし、適用しない。

## 2. 確定事項と提案事項

### ユーザー確定事項

1. 複製元は、クラブ現地時刻で「対象月の前月に開始したイベント」だけ。
   前々月開始で前月にも継続している予定は含めない。
2. 完全一致は、日時変換後のコピー対象項目で判定する。
   既存イベントのDRAFT／PUBLISHEDは問わない。
   作成者・公開日時・PDF等は比較対象外。
3. 前月の候補が101件以上あればpreview段階で拒否する。
   日付不正・重複の除外や選択件数の削減によって、この上限を回避しない。

### F10.mdから直接採用する事項

- 対象月は1か月、元の日付をクラブtimezone上で1か月進め、存在しない日は月末へ補正する。
- previewに対象・除外・補正を表示し、完全一致する既存イベントは初期選択から外す。
- 生成行はDRAFT、`firstPublishedAt`／`readRequiredAt`はnull。
  作成者・更新者は実行Membership。PDF・LINE配送・既読・個人メモ等は作らない。
- `clubId + requestId` の一意性を持つ操作記録とイベント群を同じtransactionで保存する。

### 計画上の提案（ユーザー確定事項とは区別）

粒度1でF10.mdに補足する候補。実装前に仕様として確認し、変更があれば依存粒度へ反映する。

- 複製元はDRAFTとPUBLISHEDの両方。元画面のstatus・genreフィルターは引き継がない。
- 完全一致の既存行があっても、previewで利用者が明示選択すれば複製できる。
  月末補正によって候補同士が完全一致した場合も注意表示し、安定順で先頭だけを初期選択する。
  後者は「既存イベントとの重複」と区別し、勝手に候補自体を削除しない。
- 開始日時だけを対象月内とする。終了・集合日時はそれぞれの現地日付を1か月進めるため、
  対象月の前後に跨る場合がある。期間を対象月へ切り詰めず、期間の長さの固定もしない。
- 月末補正後に終了が開始以下となる、DSTの存在しない時刻へ移る、元データが不正、といった
  候補は理由付きで選択不可にする。時刻や所要時間を黙って変更しない。
- DST終了時の重複時刻は、導入済みTZDateの構築結果を使い、UTC offsetもpreviewで示す。
  秒・ミリ秒は保持する。これらは既存フォームの分単位変換へ往復させない。
- 0件選択では実行しない。失敗時は同じrequestIdと同じ入力で再送する。
  初回送信前の選択変更ではrequestIdを維持する。
  送信後に選択を変更する場合は、サーバーで再previewして新しいrequestIdを発行・bindする。
  通信結果が不明な場合は、選択変更より先に同じ入力で結果を確認する導線を用意する。
- preview後に元データ・timezone・重複状態が変化した場合は、黙って別内容を保存せず再確認を求める。

## 3. 現在の実装状況と根拠

| 判定 | 対象 | 実際に確認した根拠・判断 |
| --- | --- | --- |
| 実装済み | 管理者認可・プラン制御 | `app/(club-app)/club/club-app-authorization.ts` の `requireClubAppAdminAccess` → `club-membership-authorization.ts` の `requireClubAdminMembership`／`requireActiveClubMembership`。Auth本人とACTIVE所属を照合し、OWNER・COACH・OFFICERを許可。`domain/club/plan-features.ts` の `hasClubFeature`／`PLAN_FEATURES` ではCLUB_APPは現在STANDARDだけ。 |
| 実装済み | 月別一覧・単件作成 | `app/(club-app)/club/[clubSlug]/admin/events/page.tsx` の `AdminEventsMonthPage`、`src/infrastructure/prisma/repositories/club-event-repository.ts` の `findAdminClubEventsInRange`／`createClubEvent`。F10専用導線・一括処理はない。 |
| 一部利用可能 | 期間取得 | 同Repositoryの `buildEventOverlapWhere` は月との重なりを取得する。確定した「前月に開始」と異なるので、一覧を変更せずF10専用queryを新設する。既存一覧selectには本文・集合日時等も揃わない。 |
| 一部利用可能 | 日時・終日境界 | `domain/shared/date-time/club-date-time.ts` の `getClubMonthUtcRange`／`getClubDayUtcRange`／`convertClubLocalDateTimeToUtc`、`domain/club/event/event-date-times.ts` の `convertEventInputToUtc`、`event-form.ts` の `buildClubEventInitialValues`。timezone変換と終日終了境界はあるが、月送り・補正一覧はない。 |
| 一部利用可能 | 入力・結果・識別子 | `domain/shared/action-state.ts` の `ActionState`／`createInitialActionState`、`request-id.ts` の `createRequestId`／`isRequestId`、`domain-error.ts` の `DomainError`。requestIdは識別子であり、イベント作成の冪等性保存は未実装。 |
| 実装済み | 再検証 | `app/(club-app)/club/revalidate-club-paths.ts` の `revalidateClubEventPaths`、`domain/club/club-revalidation-paths.ts` の `getClubEventRevalidationPaths`。eventIdなしで会員／管理者の月別・日別一覧4経路を再検証できる。変更せず再利用。 |
| 実装済み | イベント・関連モデル | `prisma/schema.prisma` の `ClubEvent`、`ClubEventAttachment`、`ClubLineDelivery`、`ClubEventRead`、`ClubEventMemo`。既存イベントの列・関連先はある。 |
| 未実装 | 一括操作記録 | schemaとDomain／Application／Repository／Action／テストを検索し、`ClubEventBatchOperation`や前月複製用のinput hash・処理を確認できなかった。追加が必要。 |
| 未実装 | F10専用機能一式 | preview、月末補正、重複比較、選択送信、再送照合、関連データ非作成のF10テスト・runbookは未実装。既存の単件作成に混ぜない。 |

### 単件作成を一括処理へそのまま流用しない理由

`admin/events/new/actions.ts` の `createClubEventAction` は入力検証・添付差分・LINE配送準備を行う。
`club-event-repository.ts` の `createClubEvent` は自身のtransaction内でイベント・添付・配送行を作る。
これを100回呼ぶと操作全体を一体としてrollbackできず、F10で不要な外部処理も混入する。
既存処理は変更せず、F10専用の有限件数queryと一括保存Repositoryを追加する。

## 4. 調査した主要ファイル・シンボル

各粒度の調査開始欄に加え、以下の定義・参照関係を確認した。

| パス | 確認対象・理由 |
| --- | --- |
| `AGENTS.md`、`CLAUDE.md` | 共通ルール、変更対象内の日本語JSDoc・import説明・関数／型の行末説明、Next同梱資料優先。 |
| `docs/implementation/phases/F10.md` | 前月限定・DRAFT・100件・冪等性・関連行非複製・受入条件。 |
| `docs/proposals2.md` | MVP範囲、clubId前提の取得、Membership単位の作成者／更新者、月別期間重複取得、管理者向けイベント作成。 |
| `prisma/schema.prisma` | `Club`、`ClubMembership`、`ClubEvent`と添付・配送・既読・メモ、`ContentStatus`／`ClubEventGenre`。新記録の逆relation追加箇所も確認。 |
| `src/infrastructure/prisma/repositories/club-event-repository.ts` | `buildEventOverlapWhere`、`findAdminClubEventsInRange`、`findClubEventForAdmin`、`CreateClubEventInput`／`createClubEvent`。詳細取得は添付・配送も取得するためF10用の軽量selectが必要。 |
| `app/(club-app)/club/[clubSlug]/admin/events/page.tsx` | `AdminEventsMonthPage`、`Props`、`buildMonthHref`／`buildDayHref`、status・genre・monthと固定toast。 |
| `app/(club-app)/club/[clubSlug]/admin/events/new/actions.ts` | `createClubEventAction`、日時変換、`buildContentTargetRoles`使用、添付・LINE・保存後再検証・redirect。 |
| `app/(club-app)/club/[clubSlug]/admin/events/actions.ts` | `deleteClubEventAction`、requestId照合と保存後の固定toast遷移。F10で削除処理は変更しない。 |
| `app/(club-app)/club/[clubSlug]/admin/events/new/ClubEventCreateForm.tsx` | `ClubEventCreateForm`／props、既存フォームとAction stateの接続例。PDF等を含む共通フォームはF10で流用しない。 |
| `domain/club/event/event-form.ts` | `ClubEventFormValues`／`ClubEventInput`、`validateClubEventFormValues`、`buildClubEventInitialValues`、入力長と終日のendAt−1ms。コピー本文をtrim→nullへ変えない。 |
| `domain/club/event/event-date-times.ts` | `EventDateTimeInputError`／`EventUtcDateTimes`／`convertEventInputToUtc`。終日endExclusiveと終了>開始の検証。 |
| `domain/shared/date-time/club-date-time.ts` | `UtcRange`、月／日範囲、local→UTC、日付／時刻表示。month不正値の現在月fallbackと分精度の制約。 |
| `domain/club/event/event-calendar-navigation.ts` | `shiftYearMonth`／`shiftDateOnly`。月末clamp・入力境界の保証とは別機能であり変更しない。 |
| `domain/club/content/content-policy.ts` | `buildContentTargetRoles`がOWNERを必須として重複除去すること。比較ではロールの集合を正規化し、元の不正データを黙って補修しない。 |
| `domain/club/event/event-policy.ts` | `buildEventCreatePublishTimestamps`のDRAFT時null。F10では保存列を明示して同じ不変条件を満たす。 |
| `app/(club-app)/club/club-app-authorization.ts`、`club-membership-authorization.ts` | `requireClubAppAdminAccess`、`ClubAccessContext`、`requireActiveClubMembership`／`requireClubAdminMembership`。画面とActionの双方で必要。 |
| `domain/club/club-member-role.ts`、`domain/club/plan-features.ts` | `isClubAdminRole`／`hasClubFeature`、ロール・プランの最新DB照合への再利用。 |
| `src/application/club/integrity/assert-club-scoped-references.ts` | `assertClubScopedReferences`は同クラブ参照の照合。ACTIVE・ロール・プラン確認の代用にはならない。 |
| `src/infrastructure/prisma/repositories/support-report-repository.ts` | Serializable、P2034の有限再試行、P2002後の既存結果照合という既存例。サポート受付自体は変更しない。 |
| `domain/shared/action-state.ts`、`request-id.ts`、`domain-error.ts` | 共通state、UUID v4検証、既存のVALIDATION／CONFLICT等のエラー分類。共通型の拡張を先回りしない。 |
| `src/infrastructure/logging/sanitize-log-context.ts` | `sanitizeLogContext`／`SanitizedLogContext`。固定operation・resultと識別子だけを渡し、本文・生Errorを渡さない。 |
| `app/(club-app)/club/revalidate-club-paths.ts`、`domain/club/club-revalidation-paths.ts` | `revalidateClubEventPaths`／`getClubEventRevalidationPaths`。1回の一覧再検証で足りる。 |
| `domain/club/event/event-toast.ts`、`event-toast.test.ts` | `ClubEventToastCode`／`getClubEventToastMessage`。新成功識別子も固定文言へ限定する。 |
| `app/(club-app)/club/admin/_components/FieldErrorList.tsx`、`FormErrorAlert.tsx` | 項目エラーとform全体のエラー表示を変更せず再利用。 |
| `tests/club-membership-authorization.test.ts`、`domain/club/plan-features.test.ts` | 認可境界のmockと現在のプラン表。既存試験を複製せずF10入口の認可条件を新試験で確認。 |
| `domain/shared/date-time/club-date-time.test.ts`、`domain/club/event/event-calendar-navigation.test.ts`、`event-policy.test.ts` | 東京の月境界、DSTの23時間日・不存在時刻、月移動、公開日時。F10固有のテストは未存在。 |
| `domain/shared/request-id.test.ts`、`action-state.test.ts` | UUIDの大文字許容、生成・初期stateの既存試験。F10ではcanonicalなUUID表記へ統一する。 |
| `tests/club-account-actions.test.ts` | 直接Action呼出し、制御例外・保存後処理・機密情報抑止のmock例。HTTP Origin検証とは別。 |
| `tests/platform-support-pages.test.ts`、`platform-support-forms.test.ts`、`club-account-forms.test.ts` | Server Pageの静的描画、hook・Action境界テストの既存例。実DOMやReact schedulerの保証ではない。 |
| `tests/platform-support.flow.integration.test.ts` | `enabled`／`localConfiguration`／`safeCheck`、専用flag・固定loopback・使い捨てDB確認後のclient生成、Auth／外部処理のmockとcleanup。 |
| `tests/club-id-integrity.integration.test.ts` | 同クラブ制約・Membership削除時SetNull・trigger検査。共有clientを先にimportする旧ガードは新試験へ持ち込まない。 |
| `src/infrastructure/prisma/client.ts`、`prisma.config.ts` | dotenv読込とDB初期化がある。単体試験・ガード前の試験で実評価しない。設定内容だけ確認し、環境変数ファイルは未読。 |
| `package.json`、`package-lock.json`、`vitest.config.mts`、`tsconfig.json`、`next.config.ts` | 専用コマンド、実解決版、node環境・server-only alias・試験glob・strict、既存Action body上限12mb。新機能のために上限を広げない。 |

### バージョンとNext資料

- lock解決値：Next **16.2.6**、React **19.2.4**、Prisma CLI **7.9.1**、
  `@prisma/client`／`@prisma/adapter-pg` **7.8.0**、`@date-fns/tz` **1.5.0**、
  date-fns **4.3.0**、Zod **4.4.3**、Vitest **4.1.10**。
  package.jsonのPrisma指定は`^7.8.0`であり、CLIとClientの解決版は同一ではない。
  この差をF10で依存更新して直す計画にはしない。生成・検証に支障がある場合だけ報告する。
- `node_modules/next/dist/docs/` は存在。次の必要箇所を確認した。
  - `01-app/03-api-reference/03-file-conventions/page.md`：params／searchParamsはPromise。
  - `01-app/02-guides/forms.md`：bind、useActionState、pending、Actionごとの再認可。
  - `01-app/02-guides/data-security.md`：Actionは直接POST可能な入口、限定DTO、認可。
  - `01-app/03-api-reference/04-functions/redirect.md`：redirectはtry/catchの外。
  - `01-app/03-api-reference/04-functions/unstable_rethrow.md`：必要なcatch先頭で制御例外を再送出。
  - `01-app/03-api-reference/04-functions/revalidatePath.md`：サーバー側での一覧再検証。
  - `01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`：Originとbody上限。
- SDK型は `node_modules/@date-fns/tz/date/index.d.ts` の秒・ミリ秒付き`TZDate.tz`を確認。
  読取専用のNode試行ではNYの2026-03-08 02:30が03:30へ正規化され、
  2026-11-01 01:30は−04:00になった。単に構築するだけではDST gapを検出できない。
  この試行はF10実装の検証や、あらゆるtimezoneに対する保証ではない。

## 5. 共通設計と処理フロー

### コピー対象・比較・preview

- コピー対象：`title`、`content`、`genre`、`targetRoles`、`startAt`、`endAt`、
  `isAllDay`、`location`、`meetingAt`、`meetingLocation`、`belongings`、`notes`。
  日時以外は元の値を保持し、nullと空文字を勝手に同一視しない。
- 比較は上記の変換後値だけ。ロールは順序ではなく集合として比較する。
  ID・status・作成／更新日時・実行者・公開日時・関連行は比較しない。
- 前月範囲は、現在DBのtimezoneで算出した `startAt >= start AND startAt < endExclusive`。
  `clubId`を必須にし、`startAt, id`の安定順、`take: 101`で上限を判定する。
  101件なら本文変換・重複検索・選択画面の前に拒否する。
- 重複照合は同じclubIdで、各変換候補の全コピー列と一致する既存行の有無を調べる。
  取得するのは代表IDだけとし、候補の同一内容はまとめて最大100回の`findFirst`に制限する案。
  role集合の比較は`hasEvery`と対象外roleがない条件等で集合一致を担保する。
  単なる配列equalsや、全体にtakeをかけたOR検索で他候補の一致を見落とさない。
  長いtransactionにならないか100件で測定し、問題時は同じ意味の一括query案を報告する。
- previewの完全なDB入力はサーバーだけに保持・再取得する。
  Clientへ渡すのはsource ID、必要な見出し・新旧日時・補正／除外理由・初期選択等の限定DTO。
  本文全体や関連データをbind値・HTML hidden・ログへ流さない。

### 日時変換

- UTC instantからクラブ現地の年・月・日・時・分・秒・ミリ秒を取得し、
  現地の年月を1か月進め、日だけを移動先月末でclampしてUTCへ戻す。
  UTCへの固定日数加算やホストのローカルtimezoneには依存しない。
- 再構築後の現地成分を比較してDST gap等を検出する。
  0000年・5桁年・前月が表現範囲外になる入力や、年0〜99のDate構築特例も試験対象。
- 終日はstartの現地日付と、`endAt - 1ms`の現地最終日を補正する。
  補正後最終日の翌日0時をendExclusiveに戻す。単日の1月31日→2月末が翌月へ伸びないこと。
  元の終日境界が不正な行は理由付き除外とし、誤った境界を正常化して隠さない。
- `convertEventInputToUtc`／`buildClubEventInitialValues`は既存仕様の根拠として使う。
  分精度・trim等があるので、F10でそのままフォーム入力に往復させない。

### 冪等性・同時更新

- Page生成時にrequestIdとpreview fingerprintを用意し、Actionへ固定値としてbindする案。
  hiddenやpreviousState、bound値の存在だけで認可・内容を信用しない。
- fingerprintはtimezone・元候補ID／更新版／コピー値・変換結果・重複状態等から
  決定的に作る。別途input hashには操作版・認可済みclub／実行Membership・対象月・
  昇順にした選択ID・preview fingerprintを含める。UUID表記や入力順だけでは別操作にならない。
  Node cryptoはserver-onlyの新モジュールに閉じ、Client向けDomainへ混入させない。
- 実行transactionでは最新の本人userId・Membership ID・clubId・ACTIVE・管理role・
  利用可能プランを確認する。その後、**完了済み記録を先に照合する**。
  同一actor／operation／hashなら元の作成件数を返し、違えばCONFLICT。
  再送より先にpreviewを再計算すると、自分が作った行が重複になり正当な再送を拒否してしまう。
- 新規操作に限り、同じtransactionで元候補・重複状態・timezoneを再取得してfingerprintを照合。
  選択IDが全て同じクラブの前月候補・選択可能項目に含まれることを確認する。
  変化時は再preview、検証失敗時は0件作成。
- 検証後に操作記録と全DRAFT行を一体で保存。`createMany`等へコピー列を明示し、
  clientからのstatus・clubId・作成者・日時・関連データを展開しない。
- Serializableと一意制約を用い、P2034のみ有限再試行する案。
  P2002は何でも成功扱いせず、別transactionで再認可したうえで該当記録の内容一致を照合する。
  回数・transaction時間の上限を局所的に決め、上限超過は同じrequestIdで再確認できる結果にする。
- 完了記録はイベントの削除後も残す。F10ではTTL掃除やイベント削除とのcascadeを作らない。
  同じrequestIdで削除済みの予定を再生成してはいけない。

### ユーザー操作からDBまで（新規名はすべて案）

| 段階 | ファイル・関数 | 受け取る値 → 返す値／DB変更 |
| --- | --- | --- |
| 1. 月別一覧 | 既存`admin/events/page.tsx`の`AdminEventsMonthPage` | 認可済みslug・表示月 → 前月複製previewへのリンク。DB変更なし。導線は粒度10。 |
| 2. preview Page | 新`admin/events/copy-previous-month/page.tsx`の`EventMonthCopyPage` | params／厳密なmonth → `requireClubAppAdminAccess`、preview Service、限定DTO・bound Action・初期state。DB変更なし。粒度9。 |
| 3. preview取得 | 新`src/application/club/event/get-event-month-copy.ts`の`getEventMonthCopyPreview` → 新read Repository | 認可context・対象月 → 最大100候補、補正・除外・重複、fingerprint。DBは読取だけ。粒度5・7。 |
| 4. 選択・送信 | 新`EventMonthCopyForm.tsx` | 限定DTO・選択ID → requestId付きFormData。変換値・本文・clubIdを入力にしない。pendingで再送を抑止。粒度9。 |
| 5. Action | 新同route`actions.ts`の`copyPreviousMonthEventsAction` | bound期待値・previousState・FormData → 再認可、件数／重複field検証、Serviceへ。失敗stateか保存済み成功。粒度8。 |
| 6. 保存Service | 新`copy-event-month.ts`の`copyPreviousMonthEvents` | サーバーで得たscope・月・選択・requestId・fingerprint → typed結果。Next／Storage／LINEには依存しない。粒度7。 |
| 7. DB保存 | 新mutation Repositoryの`createEventMonthCopyBatch` | 最新権限・完了記録・preview再照合 → 操作記録1件とDRAFT最大100件、または既存結果／0件rollback。粒度6。 |
| 8. 保存後表示 | 新Action → 既存`revalidateClubEventPaths` | 保存成功 → 4一覧を再検証し、対象月・status=ALLの管理一覧へ固定toast付き遷移。普通の再検証失敗は「保存済み・再読込」の成功state。粒度8・10。 |

各粒度の実装時は、この表でまだ接続しない段階を「後続粒度」と明記して報告する。

## 6. DB・Prisma変更

**モデル名案：`ClubEventBatchOperation`。** 既存モデルではない。

| 列・制約案 | 意味 |
| --- | --- |
| id、createdAt | 操作記録ID・記録時刻。 |
| clubId → Club | 必須。`@@unique([clubId, requestId])`。クラブ自体を削除する場合はCascade可。 |
| requestId | UUID v4を検証して小文字に正規化。新操作の識別子。認証には使わない。 |
| operation | F10の固定値`COPY_PREVIOUS_MONTH`案。SQL CHECK等で限定し、汎用ジョブ機構を作らない。 |
| targetMonth | 検証済みYYYY-MM。完了結果・監査の対象月を保持。 |
| inputHash | 正規化済み入力のSHA-256。本文の原文を記録しない。 |
| executedByMembershipId | nullableの単一FK、Membership削除時SetNull。新規保存時は必ず認可済み実行者を設定。 |
| createdCount、completedAt | 完了した作成件数と時刻。作成件数はSQL CHECKで1〜100。途中状態を別commitしない。 |

- `Club`／`ClubMembership`へ必要な逆relationだけ追加。既存`ClubEvent`の列・公開仕様は変えない。
- 新migrationでtable・unique・FK・CHECK・RLSを追加する。
  ファイル名は`prisma/migrations/<実装時に採番>_f10_event_month_copy/migration.sql`案。
  これは未存在の新規ファイルで、既存migrationを編集しない。
- 実行者とclubIdの整合性はF01の`enforce_same_club_reference`を利用するtriggerで保証する。
  `prevent_club_id_change`を利用して記録のclubIdも不変にする。
  nullable FKと必須clubIdをまとめた複合SetNullでclubIdまでnullにする設計は採らない。
- `ENABLE ROW LEVEL SECURITY`とanon／authenticated等からの権限剥奪を明示する。
  public policyやブラウザーData APIを追加せず、既存のサーバーDB経由だけで使用する。
  default privilegesは作成roleに依存するため、それだけを安全性の根拠にしない。
- 根拠：以下の実在migrationを確認済み。新migrationの前提として調査開始に含める。
  - `prisma/migrations/20260926084449_f01_enforce_club_scope_integrity/migration.sql`
  - `prisma/migrations/20260927011826_f01_fix_same_club_set_null_trigger/migration.sql`
  - `prisma/migrations/20260816223753_enable_rls_for_club_app/migration.sql`
  - `prisma/migrations/20260816224901_revoke_public_data_api_access/migration.sql`
- Client生成物・依存更新はpatch対象外。生成・schema検証は将来の実装用一時環境で行う。
  migrate deploy／実DB反映はpatch作成作業に含めない。

## 7. 粒度一覧・順序

| 粒度 | 目的 | 直接依存 |
| --- | --- | --- |
| 1 | 仕様補足・入力・preview／結果契約 | なし |
| 2 | timezone上の月送り・終日・補正理由 | 1 |
| 3 | 完全一致比較・候補間重複・fingerprint | 1・2 |
| 4 | 一括操作モデル・migration・DB制約 | 1 |
| 5 | 上限付きpreview読取Repository | 1・2・3 |
| 6 | 冪等・一体保存Repository | 3・4・5 |
| 7 | preview／実行Application Service | 5・6 |
| 8 | 専用Server Action・保存後処理 | 7 |
| 9 | preview Page・選択フォーム | 8 |
| 10 | 既存月別一覧の導線・固定成功toast | 9 |
| 11 | ガード付きDB統合試験・専用コマンド | 4〜10 |
| 12 | F10運用手順・受入確認表 | 10・11 |

実装は1→12の番号順を推奨。既存経路への導線は機能完成後に接続する。
新規モジュールは接続前でも単体でtypecheck・試験可能にし、途中粒度で既存画面を壊さない。

## 8. 各粒度の実装範囲

### 全粒度共通の確認・検証

- 毎回`git status --short`、ブランチ／HEAD、`AGENTS.md`と対象粒度だけを確認する。
  既存未コミット変更は上書きしない。
- 共通の実在テスト設定：`vitest.config.mts`（node環境、server-only alias、include）、
  `tsconfig.json`（strict・パスalias）、`package.json`（test／typecheck）。
  設定を変更するのは粒度11の専用script追加だけ。
- 以下のコマンドは将来の各patch検証用。今回の計画作成では実行していない。
  DBを使わない試験は共有client・Auth・配送をimport評価前にmockする。
  ファイル名案の確定後にその対象だけを`npm test -- <パス>`で実行する。
  TS変更は一時環境で`npm run typecheck -- --incremental false`と対象lintを行う。
- 各対象内でAGENTS.mdのJSDoc・import説明・関数／型の行末説明を併用する。
  既存ファイルでは該当行全体が対象になるためpatch量に注意する。
  コメントだけのために対象外ファイルを増やさず、JSXでは有効なコメント構文を使う。
- 最後に元のtreeで`git apply --check feature.patch`、`git apply --stat feature.patch`、
  `git status --short`。元のtreeへ適用しない。パッケージ追加・更新も行わない。

### 粒度1：仕様補足・入力・preview／結果契約

**目的**：確定した境界と残る提案を整理し、後続が同じ最小契約を使えるようにする。

**調査開始ファイル**

- `docs/implementation/phases/F10.md`：対象月・100件・重複初期除外・requestIdの仕様。
- `domain/shared/action-state.ts`／`request-id.ts`／`domain-error.ts`：`ActionState`、UUID v4、既存エラー分類。
- `prisma/schema.prisma`：`ClubEvent`のコピー列・nullable列・role／genre enum。
- `domain/club/event/event-form.ts`：`ClubEventFormValues`と入力長。コピー値と編集フォームを混同しないため。
- 関連試験：`domain/shared/request-id.test.ts`、`domain/shared/action-state.test.ts`、共通設定。

**必要時だけ確認**：仕様補足が全体設計と矛盾する場合に`docs/proposals2.md`の前月複製・イベント作成箇所。
型exportの衝突がある場合だけ`types/prisma.ts`等の参照元をrgで追う。

**変更予定の既存ファイル**：`docs/implementation/phases/F10.md`（確定事項と採用する補足だけ）。

**新規ファイル案**：
`domain/club/event/event-month-copy-types.ts`、`domain/club/event/event-month-copy-form.ts`、
`tests/event-month-copy-form.test.ts`。
型名案は`EventMonthCopyInput`／`EventMonthCopyPreview`／`EventMonthCopyResult`／`EventMonthCopyActionState`。

**内容・完了条件**：対象月は厳密な単一YYYY-MM、選択IDはUUID配列1〜100、重複IDを拒否。
requestIdはUUID v4をcanonical化する。単一fieldの複数指定・File値・巨大配列等を拒否。
preview超過、変更あり、禁止、既存結果、保存済み等を判別でき、本文や生Errorを結果へ含めない。
提案をユーザー確定扱いせず、採用仕様と未決事項をF10.mdで区別できること。

**変更しない**：DB・Repository・Action・画面・共有ActionState／DomainError、F10以外の設計書。

**テスト**：新form試験と既存request-id試験。正しい月、配列月、不正月、0000年、前月範囲外、
0／1／100／101選択、同一ID重複、UUID大小文字、余分な信頼禁止fieldへの対応を確認。

### 粒度2：timezone上の月送り・終日・補正理由

**目的**：副作用なしでコピー先日時と表示用の補正／除外理由を作る。

**調査開始ファイル**

- `domain/shared/date-time/club-date-time.ts`：`getClubMonthUtcRange`／`getClubDayUtcRange`、DST roundtripの既存実装。
- `domain/club/event/event-date-times.ts`：`convertEventInputToUtc`の終日endExclusiveと終了順序。
- `domain/club/event/event-form.ts`：`buildClubEventInitialValues`の終日endAt−1msと分精度。
- `domain/club/event/event-calendar-navigation.ts`：`shiftYearMonth`の境界と月送りの違い。
- 関連試験：`domain/shared/date-time/club-date-time.test.ts`、
  `domain/club/event/event-calendar-navigation.test.ts`、共通設定。
- 先行粒度の入力・preview契約（粒度1で新設、現在未存在）。

**必要時だけ確認**：DST・年0〜99・秒精度の変換を判断できない場合だけ、
導入済み`node_modules/@date-fns/tz/date/index.d.ts`と該当構築処理、
`node_modules/date-fns/addMonths.d.ts`等。現行型・実装で不足するAPI仕様のみ公式資料へ進む。

**変更予定の既存ファイル**：なし。

**新規ファイル案**：`domain/club/event/event-month-copy-date-times.ts`、
`tests/event-month-copy-date-times.test.ts`。
関数名案`convertEventMonthCopyDateTimes`。既存共有日時helperは変更しない。

**内容・完了条件**：第5節の変換を実装し、新旧日時・補正対象を返す。
不正timezone、終日不正境界、DST gap、補正後の終了<=開始を理由付きで区別する。
nullの終了・集合を勝手に生成せず、秒・ミリ秒を保持する。

**変更しない**：既存フォーム・一覧の日付仕様、Prisma、Next、Repository、一般の繰返し予定。

**テスト**：新日時試験＋既存club-date-time試験。
東京のUTC日付跨ぎ、1/31→2/28、閏年2/29、12→1、30・31日が同日に丸まるケース、
単日／複数日の終日、終了が翌月にあるケース、集合日時、null、秒精度、
NYのDST gap／fold・終日23／25時間、終了順序反転、年境界を固定値で確認。

### 粒度3：完全一致比較・候補間重複・fingerprint

**目的**：コピー列の定義を一箇所へ置き、重複判定とpreview改変・陳腐化検出を一致させる。

**調査開始ファイル**

- `prisma/schema.prisma`：`ClubEvent`のnullable列・配列・日時列。
- `domain/club/content/content-policy.ts`：`buildContentTargetRoles`のOWNER・集合正規化の既存規約。
- `domain/club/event/event-form.ts`：trim／空文字→nullの影響を避けるための確認。
- `package.json`／`tsconfig.json`：Node crypto利用とClient境界。共通テスト設定。
- 先行粒度1・2の新規契約・日時変換と新試験。

**必要時だけ確認**：公開対象ロールの扱いが変わる時だけ`domain/club/club-member-role.ts`と
`admin/events/new/actions.ts`の`buildContentTargetRoles`呼出し。
Prisma配列queryの意味が不明な場合だけ、導入済み型の必要部分を調べる。

**変更予定の既存ファイル**：なし。

**新規ファイル案**：`domain/club/event/event-month-copy-policy.ts`、
`src/infrastructure/security/event-month-copy-fingerprint.ts`、
`tests/event-month-copy-policy.test.ts`、`tests/event-month-copy-fingerprint.test.ts`。
関数名案`buildEventMonthCopyKey`／`buildEventMonthCopyFingerprint`。

**内容・完了条件**：コピー列のallowlist、全列の決定的比較、role集合、候補同士の注意表示。
preview用と実行入力用のハッシュを区別し、schema版・対象クラブ／actorを含める。
preview内容に更新があればハッシュが変わり、順序・UUID表記だけの違いでは変わらないこと。
hash化しても本文をログへ出してよいわけではない。Clientからcryptoへ到達しないこと。

**変更しない**：既存role規約の修正、既存イベントへのfingerprint列追加、DB・画面、秘密鍵の新設。

**テスト**：新policy／fingerprint試験。
コピー各列の差、null対空文字、role順序、status・PDF・作者等の無視、月末による候補間一致、
source更新・timezone・対象月・actor変更、選択順序、異なるクラブ、同一入力の再現性を確認。

### 粒度4：一括操作モデル・migration・DB制約

**目的**：イベント作成と一体で保存できる完了記録を用意する。

**調査開始ファイル**

- `prisma/schema.prisma`：`Club`／`ClubMembership`のrelation、`ClubEvent`の実行者FK。
- 第6節に列挙した4つの実在migration：`enforce_same_club_reference`、
  `prevent_club_id_change`、SetNull修正、RLS／revokeの前提。
- `tests/club-id-integrity.integration.test.ts`：同クラブ・SetNull・trigger検査の既存試験。
- `prisma.config.ts`／`package.json`／`package-lock.json`：CLI・schema位置・生成方法の確認。
- 粒度1の入力・結果契約。

**必要時だけ確認**：同クラブtriggerの前提が変わっている場合だけ該当migration履歴。
DDL生成エラー時だけ導入済みPrisma型・CLIの該当仕様。生成済みClientを無条件に全文読込しない。

**変更予定の既存ファイル**：`prisma/schema.prisma`。

**新規ファイル案**：第6節の新migrationのみ。

**内容・完了条件**：第6節のmodel・unique・FK・CHECK・同クラブtrigger・RLS／権限を揃える。
既存migrationを変更せず、生成差分にF10以外を含めない。
ソースに新modelの呼出しをまだ接続しない。実DBによる制約確認は粒度11へ残す。

**変更しない**：既存ClubEvent列、既存migration、seed、DB接続設定、生成物、依存・lock更新、DB適用。

**テスト**：一時環境で秘密情報を用いないschema検証・Client生成・typecheck。
新DDLのunique・FK・CHECK・RLS・revokeをレビューし、制約の実動作は粒度11で確認する。
DDLの文字列をなぞるだけのテストは追加しない。
コマンドがdotenvや既存DB設定を読む場合は実行せず安全な一時設定で検証する。
生成不能なら依存更新で回避せず原因を報告する。

### 粒度5：上限付きpreview読取Repository

**目的**：現在の権限・timezoneを確認し、前月候補と重複を有限件数で取得する。

**調査開始ファイル**

- `src/infrastructure/prisma/repositories/club-event-repository.ts`：
  `buildEventOverlapWhere`／`findAdminClubEventsInRange`／`findClubEventForAdmin`の対象・selectの違い。
- `app/(club-app)/club/club-membership-authorization.ts`：`ClubAccessContext`の本人・所属・clubの関係。
- `domain/club/club-member-role.ts`／`domain/club/plan-features.ts`：`isClubAdminRole`／`hasClubFeature`。
- `src/infrastructure/prisma/client.ts`：単体試験でmock必須の初期化境界。
- 関連試験：`tests/club-membership-authorization.test.ts`、`domain/club/plan-features.test.ts`、共通設定。
- 粒度1〜3の新規モジュール・試験。

**必要時だけ確認**：whereの配列／nullable条件が型で表現できない場合にだけ導入済みPrisma型。
性能上の問題が出た時だけ既存ClubEvent indexとquery計画を使い捨てDBで確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案**：
`src/infrastructure/prisma/repositories/event-month-copy-read-repository.ts`、
`tests/event-month-copy-read-repository.test.ts`。
関数名案`findEventMonthCopyPreviewData`。
commitで同じqueryを使えるようtransaction clientも受けられる局所的な内部関数にする。

**内容・完了条件**：actorの最新条件、現在timezone、前月開始範囲、take101、コピー列限定select。
既存status不問の完全一致をclubId付きで調べる。
0件／超過／変換除外／既存重複を区別し、サーバー用の検証材料を返す。
source全件や関連行を取得しない。query回数・結果件数の上限を新試験で確認する。

**変更しない**：既存一覧query・詳細select、既存Repositoryの公開API、Event行への書込、Next・外部SDK。

**テスト**：新read Repository試験。
前月開始のgte/lt、前々月開始の除外、clubId必須、DRAFT／PUBLISHEDの一致、role集合、
0／100／101、失効actor・他club・禁止プラン、最大query数と不要relationを確認。

### 粒度6：冪等・一体保存Repository

**目的**：二重送信でも同じ予定群を増やさず、全件成功か全件rollbackにする。

**調査開始ファイル**

- `src/infrastructure/prisma/repositories/club-event-repository.ts`：`createClubEvent`の明示列とtransaction境界。
- `src/infrastructure/prisma/repositories/support-report-repository.ts`：Serializable、P2034／P2002後の照合例。
- `src/application/club/integrity/assert-club-scoped-references.ts`：参照スコープと権限再確認の区別。
- `prisma/schema.prisma`：既存ClubEventの必須列、実行者FK、粒度4適用後の操作記録。
- `tests/club-id-integrity.integration.test.ts`：同クラブ参照の既存期待値、共通設定。
- 先行粒度3〜5のhash・query・migration・新試験。

**必要時だけ確認**：transactionのエラー型を絞れない場合だけ導入済みPrismaの既知Error型。
所要時間が問題なら該当queryとtransaction timeoutを確認し、共有client設定は変更しない。

**変更予定の既存ファイル**：なし。

**新規ファイル案**：
`src/infrastructure/prisma/repositories/event-month-copy-mutation-repository.ts`、
`tests/event-month-copy-mutation-repository.test.ts`。
関数名案`createEventMonthCopyBatch`。

**内容・完了条件**：第5節の再認可→既存結果先行照合→preview再検証→一体保存。
各Eventのstatus・公開日時・clubId・作成者／更新者をサーバー値で明示。
複製元の削除・改変、選択対象外ID、同requestId異入力／異actor、0／101件を拒否。
再試行は有限、制約Errorを一括成功扱いしない。
モデルの作成件数は実際のinsert件数と一致し、途中例外では記録も残らない。

**変更しない**：通常の新規作成・編集・削除、PDF／Storage／LINE／メールworker、共有transaction抽象化。

**テスト**：新mutation Repository試験。
保存dataのallowlist、DRAFT／null／実行者、ledger先行照合、変更時rollback、P2034上限、
P2002後の同一結果／衝突／失効actor、replay時のイベント非insertを確認。
実並列とFK・rollbackの保証はmockだけで済ませず粒度11に接続する。

### 粒度7：preview／実行Application Service

**目的**：Page／ActionからDB処理を分離し、限定DTOと安全な結果を返す。

**調査開始ファイル**

- `domain/shared/domain-error.ts`／`action-state.ts`：公開可能な分類・結果の扱い。
- `src/infrastructure/logging/sanitize-log-context.ts`：`sanitizeLogContext`のallowlist。
- `app/(club-app)/club/club-membership-authorization.ts`：本人contextの由来。
- 関連試験：`src/infrastructure/logging/sanitize-log-context.test.ts`、共通設定。
- 先行粒度のread／mutation Repository・DTO・hashモジュールと新試験。

**必要時だけ確認**：既存の結果mappingと整合しない場合だけ
`src/application/club/account/update-club-account.ts`の`runAccountMutation`。
共有ログhelperを新規拡張する必要があるかは、まずF10で渡す固定値を減らして判断する。

**変更予定の既存ファイル**：なし。

**新規ファイル案**：`src/application/club/event/get-event-month-copy.ts`、
`src/application/club/event/copy-event-month.ts`、`tests/event-month-copy-services.test.ts`。
関数名案`getEventMonthCopyPreview`／`copyPreviousMonthEvents`。

**内容・完了条件**：入力を再検証し、Repositoryの結果をtyped outcomeへ限定。
previewのserver内部データをClient DTOへ写し、hash・実行入力の役割を分離。
Next・Storage・配送を呼ばない。想定外Errorも本文・SQL・causeを出さず固定の失敗結果へ変換。
ログを出す場合は固定operation／result・妥当なrequestId等のみ。

**変更しない**：共通DomainErrorのコード追加、共有logger再設計、再検証、認証SDK、画面。

**テスト**：新Service試験。
入力不正時のDB非呼出し、preview超過・空・除外、変化時CONFLICT、作成／replayの最小結果、
機密文字列を含むErrorの抑止、外部処理の非呼出しを確認。

### 粒度8：専用Server Action・保存後処理

**目的**：直接呼出しにも再認可・厳密な入力検証を行い、保存後の再実行事故を防ぐ。

**調査開始ファイル**

- `app/(club-app)/club/[clubSlug]/admin/events/new/actions.ts`：`createClubEventAction`の既存接続。
- `app/(club-app)/club/[clubSlug]/admin/events/actions.ts`：`deleteClubEventAction`の識別子検証・redirect。
- `app/(club-app)/club/club-app-authorization.ts`：`requireClubAppAdminAccess`。
- `app/(club-app)/club/revalidate-club-paths.ts`／`domain/club/club-revalidation-paths.ts`：一覧再検証。
- `tests/club-account-actions.test.ts`：直接呼出し・制御例外・保存後障害の試験方式、共通設定。
- 第4節のNext forms／data-security／redirect／unstable_rethrow／revalidatePath資料。
- 先行粒度1・7の契約・Serviceと新試験。

**必要時だけ確認**：API型が合わない場合だけ導入済みNext／Reactの対応型。
HTTP body・Originを確認する場合にだけ`next.config.ts`の既存設定とserverActions同梱資料。

**変更予定の既存ファイル**：なし。

**新規ファイル案**：`app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/actions.ts`、
`tests/event-month-copy-actions.test.ts`。Action名案`copyPreviousMonthEventsAction`。

**内容・完了条件**：bound slug／month／requestId／fingerprintと送信値を厳密に照合。
previousStateの成功・club・選択結果を信用しない。認可済みcontextだけでServiceを呼ぶ。
成功／replay後は既存一覧再検証を1回呼ぶ。普通の再検証失敗は保存済みsuccess＋再読込案内にする。
redirect等の制御例外を握り潰さず、必要なcatchに`unstable_rethrow`を使う。
遷移は同クラブの対象月・status=ALL固定。任意returnToを受け取らない。

**変更しない**：既存Action・共通認可・再検証helper・Proxy・next.config・ログのallowlist。

**テスト**：新Action試験。
未ログイン／MEMBER／失効／他club／禁止プラン、field重複・File・101件・UUID偽装、
bound月と改変月、source選択の改変、直接呼出し、制御例外再送出、失敗時再検証なし、
replay・保存後再検証失敗時も再insert要求しないことを確認。
mock直接呼出しをHTTP Origin／CSRFの実証とは扱わない。

### 粒度9：preview Page・選択フォーム

**目的**：操作前に新旧日付・補正・除外を確認し、選択した予定だけを送れるようにする。

**調査開始ファイル**

- `app/(club-app)/club/[clubSlug]/admin/events/page.tsx`：`AdminEventsMonthPage`のPromise props・表示月。
- `app/(club-app)/club/[clubSlug]/admin/events/new/ClubEventCreateForm.tsx`：Action／初期stateのprops例。
- `app/(club-app)/club/admin/_components/FieldErrorList.tsx`／`FormErrorAlert.tsx`：既存表示部品。
- `domain/shared/action-state.ts`／`request-id.ts`：初期値生成と固定requestId。
- 関連試験：`tests/platform-support-pages.test.ts`、`tests/platform-support-forms.test.ts`、共通設定。
- Next同梱page／forms資料、先行粒度7・8のService／Actionと新試験。

**必要時だけ確認**：確認modalを追加すると決めた場合だけ既存
`app/(club-app)/club/[clubSlug]/account/AccountConfirmDialog.tsx`と呼出し元・試験。
この計画ではpreview自体を実行前確認にし、modalや汎用一括操作基盤は必須にしない。
離脱guardを追加する必要が生じた場合だけ`club/admin/_hooks/useUnsavedChangesGuard.ts`を確認する。

**変更予定の既存ファイル**：なし。

**新規ファイル案**：
`app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/page.tsx`、
`app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/EventMonthCopyForm.tsx`、
`tests/event-month-copy-pages.test.ts`、`tests/event-month-copy-forms.test.ts`。
Page名案`EventMonthCopyPage`。ルート自体も新規案である。

**内容・完了条件**：Pageでも管理者再認可し、厳密な対象月でServiceを呼ぶ。
候補0／101以上／全除外の表示、補正・除外理由、重複初期off、選択件数、DRAFT作成・PDF等なしを明示。
日付とtimezone／offsetを必要に応じて表示し、本文をHTMLとして解釈しない。
フォームはcheckboxのID・label・エラー参照を接続し、pending中の選択／連打を抑止。
通常失敗は同じ操作を再送でき、PREVIEW_CHANGEDは再取得へ案内。
初回送信前は選択を変えても同じrequestIdを保持する。
送信後の選択変更はサーバー再previewで新しいbound Actionを得てから行う。
通信結果不明時は、先に保持した同一入力・同一requestIdで結果を確認する。

**変更しない**：既存フォーム・一覧UI、layout、一般ユーザー画面、共通部品・hook、パッケージ追加。

**テスト**：新Page／フォーム試験。
Promise props、不正／配列月、Page拒否時Service非呼出し、DTO限定、重複off・補正理由、
0／100／超過、checkbox選択、同一requestId再送、入力変更後の操作分離、pending、エラー表示、XSS文字列。
静的描画とhook mockの限界を明記し、実ブラウザーでのフォーカス・連打・通信断は粒度12の手動受入へ。

### 粒度10：既存月別一覧の導線・固定成功toast

**目的**：完成した複製機能へ、現在表示している対象月から移動できるようにする。

**調査開始ファイル**

- `app/(club-app)/club/[clubSlug]/admin/events/page.tsx`：`AdminEventsMonthPage`、month、status／genre、toast処理。
- `domain/club/event/event-toast.ts`／`domain/club/event/event-toast.test.ts`：固定コード→固定文言の変換。
- Next同梱page／forms資料と共通設定。
- 粒度9の新Page・新Page試験、粒度8の成功遷移。

**必要時だけ確認**：新toastの既存呼出し元を`rg getClubEventToastMessage`で調べ、
固定文言追加が他の月／日別表示と互換かを確認する。互換性に必要な読取だけに留める。

**変更予定の既存ファイル**：
`app/(club-app)/club/[clubSlug]/admin/events/page.tsx`、
`domain/club/event/event-toast.ts`、`domain/club/event/event-toast.test.ts`。

**新規ファイル案**：`tests/event-month-copy-navigation.test.ts`。

**内容・完了条件**：管理月別一覧へ対象月だけを渡す導線を追加。
元画面のgenre／statusで候補を絞るように見える説明にしない。
成功toastコード案`events-month-copied`を固定文言へ追加。
件数等の任意URL文字列を文言へ埋め込まない。既存カレンダー・query・他の導線を維持。

**変更しない**：既存一覧取得条件・カレンダーComponent・メンバー向け取得、他のtoast仕様。

**テスト**：新navigation試験＋既存event-toast試験。
表示月・encode済みslugのリンク、status／genreをコピー条件にしないこと、
既存toast、未知／配列toastのnull、新固定成功文言、成功後対象月の確認。

### 粒度11：ガード付きDB統合試験・専用コマンド

**目的**：mockで保証できない一意性・全件rollback・実並列・FK／RLSと、非複製を実DBで照合する。

**調査開始ファイル**

- `tests/platform-support.flow.integration.test.ts`：`enabled`／`localConfiguration`／`safeCheck`、
  専用client遅延生成、Auth／Next等のmock、fixture登録・限定cleanup。
- `tests/club-id-integrity.integration.test.ts`：実DBの同クラブ・SetNull・trigger検査。
- `src/infrastructure/prisma/client.ts`／`prisma.config.ts`：dotenv・共有clientの実評価防止。
- `package.json`：`test:platform-support:local`等と通常`test:db`の分離。
- `prisma/schema.prisma`と粒度4の新migration、粒度5〜10の追加コード・新試験、共通設定。

**必要時だけ確認**：関連fixture列が変化している場合だけschemaの
`ClubEventAttachment`／`ClubLineDelivery`／`ClubEventRead`／`ClubEventMemo`の該当定義。
ガードで安全性を確認できない場合は接続せず報告する。URLや接続例外の原文を出力しない。

**変更予定の既存ファイル**：`package.json`（専用test script1つだけ。依存・lockは変更しない）。

**新規ファイル案**：`tests/event-month-copy.flow.integration.test.ts`。
専用コマンド案`test:event-month-copy:local`。
flag案`RUN_EVENT_MONTH_COPY_TESTS=1`＋`RUN_DB_INTEGRATION_TESTS=1`、
別途`EVENT_MONTH_COPY_DISPOSABLE=1`、非production、固定loopback・port54322・DB名postgres等を確認する。
ガードの正確な許可条件は既存の使い捨てローカルDB運用に合わせて実装時に検証する。

**内容・完了条件**：ガード前に.env・共有client・実Authを評価しない。
明示flagがなければDBケースはskip、ガード自体は架空の設定で単体試験する。
Clientは`PrismaPg`等の既存パッケージでガード後生成。実Auth・Storage・LINE・メールは使わない。
事前登録したfixture IDだけをcleanupし、通常`test:db`や`verify:local`へ混入させない。

**変更しない**：実DBへの自動migration・seed、既存統合試験の再設計、配送処理、依存・lock・環境ファイル。

**テスト**：専用新試験で以下を確認する。

- 100件成功／101件preview拒否、他club・前々月開始の混入なし、元予定が不変。
- DRAFT・公開日時null・実行者、本文等のコピー値と補正日時がpreviewに一致。
- 元予定に添付・既読・メモ・LINE履歴があっても、生成行の関連行はすべて0件。
  fixtureはDBメタデータだけで作り、実PDF・外部配送は不要。
- 同requestIdの逐次／並列送信が1記録・1群だけ。同じrequestId異入力／異actorは拒否。
  複製後に元予定や生成予定を変更・削除しても、同一操作のreplayで増えない。
- 途中エラーでledgerと全イベントがrollback。P2034再試行・上限後の結果確認。
- preview後のsource／timezone／重複変更、他requestIdの同時操作で黙った内容変更がない。
- 実行直前のMembership失効・role変更・プラン変更、同クラブFK・clubId不変化、
  Membership削除時の履歴保持・SetNull、unique／件数CHECK・RLS／権限metadata。

DBケース未実行・ガードskipを成功扱いしない。patch作成時は実DBを操作しない制約を優先し、
未実行理由と、利用者が専用使い捨て環境で行う手順を報告する。

### 粒度12：F10運用手順・受入確認表

**目的**：安全な適用順・再送／再preview・失敗時の判断と、未実行の受入項目を明文化する。

**調査開始ファイル**

- `docs/implementation/phases/F10.md`：受入条件と粒度1で確定した仕様。
- `package.json`：粒度11で追加した専用コマンド、通常コマンドとの区別。
- 本計画、先行粒度の新migration・専用統合試験・Action・Page／フォーム。

**必要時だけ確認**：導入手順が現在の運用と矛盾する時だけ、既存runbookをrgで絞り、
使い捨てDB・Prismaの関係箇所を確認する。既存runbookの変更はこの粒度に含めない。

**変更予定の既存ファイル**：なし。

**新規ファイル案**：`docs/runbooks/event-month-copy.md`。

**内容・完了条件**：schema／Client／アプリ適用順、対応する専用試験、
同一requestIdの再確認と別操作の区別、変更検出・超過・無効候補・保存後再検証失敗への対処を記載。
イベント削除でledgerを消さないこと、全予定の自動公開や外部送信がないことを説明する。
手動受入は認可role／プラン、DST・月末・終日、重複初期除外、連打・通信断・再送、
フォーカス・label・読み上げ、HTTP直接POST／Origin拒否を含む。
コードmock／DB試験／実ブラウザー確認を分け、未実施を隠さない。

**変更しない**：ソース、F10以外の仕様書、既存運用手順、DB反映・実Auth／配送の操作。

**テスト**：文書中のファイル名・scriptと実装の一致、`git diff --check`、
F10受入条件と各単体／DB／手動項目の対応を確認。文書粒度のため不要なコード試験を追加しない。

## 9. 危険箇所・整合性・設計上の判断

| 危険箇所 | 根拠と対応 |
| --- | --- |
| 前月一覧の重なりをコピー元にしてしまう | `buildEventOverlapWhere`は月と重なる予定を取る。F10は専用の開始範囲queryを使用。既存一覧は変更しない。 |
| 間違った月への大量作成 | `parseMonthSearchParam`は不正値を現在月へfallbackする。F10では厳密な入力検証で拒否し、Actionでも固定対象月と照合。 |
| 終日が1日伸びる／期間が反転する | `buildClubEventInitialValues`のendAt−1msと`convertEventInputToUtc`のendExclusiveを根拠に変換。補正後に再検証。 |
| DST・秒精度の黙った変更 | 既存の分表示やTZDateの自動正規化だけに依存しない。成分roundtripと秒保持、新旧offsetを確認。 |
| 本文やroleのコピー値が変わる | `event-form.ts`のtrim→null、`buildContentTargetRoles`のOWNER補完に注意。F10では正常値を保持、不正sourceは明示除外。 |
| 複数ユーザー・別クラブからの直接呼出し | `requireClubAppAdminAccess`に加え、Repositoryで最新userId・membershipId・clubId・ACTIVE・管理role・CLUB_APPを照合。source／target／ledger全queryにclubId。 |
| pendingだけで二重作成を防ごうとする | F10.mdのunique＋transaction。異入力の再送は衝突とし、保存済み記録の先行照合で正当な再送を救済。 |
| 別requestIdまで冪等性で防げると思い込む | 一意性はclubId＋requestId単位。明示的に重複を選んだ別操作は作成できる。通信結果不明時に新しいIDへ切り替えず、先に同じ入力で結果確認する。 |
| previewと実行内容の不一致 | 元予定・timezone・重複状態をtransactionで再取得し、fingerprint比較。変化時は再preview。 |
| 重複判定の取りこぼし | コピー列全体・role集合・status不問。複数の一致行でtake上限を使い切って別候補を見落とさないquery。 |
| 100件の重複queryで時間切れ | 候補同一内容をまとめ上限を固定。100件の実測を行い、局所timeoutと有限retryを決める。共有DB設定の変更や無制限取得に逃げない。 |
| 一部だけ保存／履歴削除で再生成 | ledger＋イベント群は同一transaction。生成イベントとledgerの削除cascadeは作らない。 |
| サーバー内部データの漏洩 | `findClubEventForAdmin`の全relationを流用しない。Client DTOを限定し、`sanitizeLogContext`へも本文・入力hash素材・生Errorを渡さない。 |
| 新tableのData API公開 | 過去migrationのRLS／revokeを継承し、新tableにも明示。roleに依存するdefault privilegesだけに頼らない。 |
| 保存後再検証の失敗を作成失敗と扱う | `revalidateClubEventPaths`はDB commit外。保存済み結果を維持し、同じ操作の再確認や再読込へ案内。 |
| 作成者履歴のSetNullとclubIdの破壊 | F01の修正済み`enforce_same_club_reference`を使い、nullable単一FKと必須clubIdを分離。実DB試験で確認。 |
| 全体の過剰設計 | 新規はF10契約・純粋変換・専用Repository／Service／1route・ledgerに限定。汎用バッチ基盤・preview保存table・queue・新しいキャッシュ層は作らない。 |

## 10. 設計書と現在コードの相違

1. **月別取得条件**：全体設計と既存`findAdminClubEventsInRange`は重なり取得。
   F10のコピー元はユーザー確定により前月開始だけ。既存表示のバグ扱いはせずqueryを分ける。
2. **100件の数え方**：F10.mdの「1回100件」は選択前後が未記載だった。
   ユーザー確定により、除外前の元候補101件でpreview拒否と粒度1で補足する。
3. **完全一致の定義**：F10.mdは比較列・既存statusを明記していない。
   ユーザー確定により公開状態不問、コピー列比較とし、非コピー列を除く。
4. **日時境界**：F10.mdは終日exclusive終了・DST・補正での逆転を未記載。
   現在コードの終日仕様を保ち、第2節の提案を粒度1で整理する。
5. **利用権限**：F10.mdの「管理者」はロール・プランの具体値が未記載。
   現在の`requireClubAppAdminAccess`に従う計画で、STARTER・PROの解放は含めない。
6. **永続化**：F10の操作記録は現在schemaに存在しない。新modelとmigrationが必要。
   単件作成へのrequestId追加だけでは要件を満たさない。
7. **全体設計の定期予定**：`docs/proposals2.md`に定期予定への言及はあるが、
   F10.mdの明示範囲を優先し、一般の繰返し予定は対象外に残す。

## 11. 未確定・未確認事項とF10外の依存

### 実装前に確認・具体化する事項

- 第2節の提案はユーザー確定事項ではない。元DRAFTの対象可否、重複の明示再選択、
  候補同士の一致、跨月の終了／集合、DST fold、不正sourceの除外、操作変更時のnonce運用を粒度1で整理する。
- 専用ルート・新ファイル／関数／型／model名、migrationの採番は案。
  実装時のrgで衝突があれば同じ責務・範囲内で命名を確定する。
- hashの正規化仕様・version、transactionの時間上限・P2034 retry回数は粒度3・6で具体化する。
  実際の最大100件の所要時間は未測定。新機能がないため現時点の性能保証はしない。
- Prisma CLI7.9.1とClient7.8.0で新model生成・型検証できるかは未実行。
  依存更新が必要になった場合はF10へ混入させず、原因と別対応を報告する。
- すべてのtimezoneの歴史的変更、特殊な現地0時消失等は未網羅。
  成分検証で勝手な補正を避け、対応しない候補の表示とテスト範囲を明記する。
- 実DBのmigration適用状況・DB実行role／権限は未確認。ローカルschemaとmigrationが根拠。
  接続情報・.envは確認していない。
- 新規のmock／DB／ブラウザー試験は未作成・未実行。既存試験も今回実行していない。
  調査用Node試行は日時SDKの挙動確認に限る。

### F10外の依存（変更計画に含めない）

- 現在のAuth・ACTIVE Membership・CLUB_APP・管理role制御。
  PlatformAdminだけでクラブ管理権限を与える例外は作らない。
- F01の同クラブtrigger・SetNull修正・既存RLS／権限剥奪、現在のイベント日付・公開規約。
- 既存の単件イベント作成・編集・削除、添付・LINE・既読・メモ機能。
  F10ではそれらが生成されないことを境界試験で確認するだけ。
- 専用使い捨てローカルDBと既存パッケージの準備、利用者によるmigration適用。
  依存更新・本番データ修復・実Auth／Storage／メール／LINE確認は別作業。

## 12. 自己確認

- [x] F10以外の実装を含めず、一般の定期予定・公開・外部配送を対象外にした。
- [x] 既存の認可・プラン・一覧・単件作成・共有日時・再検証を重複実装する計画にしていない。
      F10固有の開始範囲query・月送り・冪等性だけを追加する。
- [x] 変更予定の既存ファイルは実際に確認した。
      `F10.md`、`schema.prisma`、管理月別`page.tsx`、`event-toast.ts`／試験、`package.json`。
- [x] 呼出し元・Domain・Repository・Action・Pageと関連テスト／設定を追跡した。
      F10固有の呼出し元・試験は未存在であることを明記した。
- [x] 新規案と実在ファイル、ユーザー確定と提案、静的確認と実行確認を区別し、不明点を推測で埋めていない。
- [x] 今回は計画書だけを作成し、ソース・Git index・依存・feature.patch・実DB・Auth・配送は変更しない。
