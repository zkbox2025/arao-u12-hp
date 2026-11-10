<!-- docs/implementation/phases/F13-granular-plan.md -->

# F13 粒度別計画：本番初期化・リリース準備・本番確認

仕様は[F13仕様]、残課題の正本は[運用書第12節]とする。
本書は計画案であり、「要判断」と書いた事項は決定事項ではない。決定後に本書と運用書へ反映する。
F12の記録（`F12_MVP_PASSED 11`、619件成功など）は過去の実行記録であり、F13の本番確認の代用にしない。

## 1. 共通の境界

- 既存HPを壊さない。`WEBSITE_ADMIN_USER_IDS` を維持し、HP管理認可をDB方式へ切り替えない。
- ローカルseedと本番初期化を分ける。
- 本番Authのuser.id・emailとの一致を確認せず初期化しない。
- 初期化は再実行可能とし、意図しない既存データ変更は拒否する。
- ARAOは公開前STARTER、公開時STANDARDとする。
- 外部サービスの受付成功と、実際の配送完了を区別する。
- 本番DB・Auth・Storageへの書込み、migration適用、実メール／LINE送信、deploy、外部設定変更、
  プラン変更、release tag、commit・pushは、具体的な操作ごとの明示承認を得てから行う。
- F12で許可された使い捨て環境への操作は、F13の本番操作や新しい検証環境への包括的な許可ではない。
- dryRunは書込みや実送信を行わない。
- 資格情報・本文・個人情報・Cookie・署名URL・生のエラーレポートを表示・保存・コミットしない。

## 2. 残課題5件の対応表

公開可否への影響は提案であり、すべて「要判断」とする。

| ID | 対応粒度 | 受入条件 | 担当 | 実施時期 | 未対応時の公開可否（要判断） |
| --- | --- | --- | --- | --- | --- |
| F13-LINE-RECLAIM | G2 | 処理権の取得は1配信につき合計3回まで（初回1回＋再claim最大2回）。3回目も結果未記録で期限切れなら、4回目を送らず専用errorCodeのFAILEDで終端化する。並列でも超えないことを実DBで確認する。一回の取得limitとFAILEDの自動再送なしは変えない。 | Claude実装、人間がレビュー（方針は決定済み） | 公開前 | LINE通知を本番で有効化する場合は止める案。LINEを無効のままなら、リスクを記録して公開できる案。 |
| F13-LINE-TIMEOUT | G3 | LINE APIの1リクエストを10秒で打ち切る。記録できたtimeoutは「送信結果不明」のFAILEDとし、自動再送せず、管理画面の通常の再送操作の対象にもしない。期限切れPROCESSINGの再送は同じretry keyで、公式仕様の有効期間内と確認できる場合に限る。TimeoutError注入試験だけを根拠にしない。 | Claude実装、人間がレビューとLINE公式仕様の確認（方針は決定済み、有効期間は未確認） | 公開前（G2の後） | G2と同じ。実通信のtimeoutが未実装のまま、LINEを本番有効化しない案。 |
| F13-ENV-REPRO | G1 | CLI・Node・DBの版と、運用書に従うfresh環境での通し結果が記録されている。package.json・lockfileは無断更新しない。 | 人間が実行、Claudeは手順の読み合わせ | 本番操作の前 | 公開を止める条件にはしない案。ただし、再現できない場合は判断記録を必須とする。 |
| F13-RELEASE | G4〜G9 | 各粒度の受入条件に従う。 | Claude（コード・手順・dryRun）、人間（本番実行・確認） | 公開直前〜公開当日 | 未達の項目は止める案。 |
| MANUAL-ACCEPTANCE | G10 | 実機のキーボード・フォーカス・読み上げ・狭い画面、本番Proxy／Origin条件に、実施結果か保留理由が付いている。 | 人間 | 公開前後 | Proxy／Origin条件と主要導線は止める案。他は理由付きで保留できる案。 |

## 3. 粒度一覧

### G0. 資料整備（文書のみ変更）

- 目的：F13-granular-plan.mdの作成、残課題の正本の一本化、リンクの整理。
- 対象：F13.md、本書、運用書（mvp-verification.md）。
- 調査開始：F13.md、運用書第12節。
- 変更しない：コード、設定、Git index、依存関係、運用書内のF12の検証結果・証跡・制限。
- 依存：なし。
- テスト：リンク先の存在確認（読み取りのみ）。
- 受入：5件が本書に対応付けられている。削除済みF12文書へのリンクが整理されている。
  正しい参照先を確定できないリンクは未解決として明記されている。
- 担当：Claude（文書編集）、人間（内容確認・commit）。

### G1. 再現性確認と環境の版

- 目的：F13-ENV-REPROの解消。
- 調査開始：運用書第4〜6章、`supabase/config.toml`、`scripts/verify-mvp.mjs`、package.jsonのsupabase指定。
- 変更しない：package.json、lockfile、既存のguard・manifest・runner。
- 依存：G0。
- テスト：人間がfresh環境で運用書どおりに実行する。
- 受入：版と結果が運用書第12節の台帳へ記録されている。
- 担当：人間が実行、Claudeは記録欄の整備。

### G2. LINE再claim回数の上限

- 目的：F13-LINE-RECLAIMの解消。
- 対象：`src/application/club/line/send-pending-line-deliveries.ts`（`claimDelivery`、`finishDelivery`、
  `sendClaimableLineDeliveries`）。
- 調査開始：同ファイル、`prisma/schema.prisma`のClubLineDelivery、`tests/mvp/line-delivery.integration.test.ts`。
- 変更しない：一回の取得limit、FAILEDを自動再送しない仕様。

決定事項（利用者の方針。実装は後続）：
- 1配信につき、初回1回＋期限切れPROCESSINGの再claim最大2回とし、処理権の取得は合計3回までとする。
- 3回目の処理も結果が記録されないまま期限切れになった場合は、4回目の送信を行わず、
  既存のFAILEDへ終端化する。errorCodeは「送信結果不明・上限到達」を表す専用の値とし、
  既存のFAILED（`LINE_HTTP_*`、`LINE_NETWORK_ERROR`など）と区別できるようにする。
- 1回の取得limitと、FAILEDを自動再送しない仕様は変更しない。

現行コードの確認結果（2026-11-10、読み取りのみ）：
- `claimDelivery`は、PENDINGとPROCESSING（期限切れ）のどちらの取得でも`attemptCount`を1増やす。
  このため`attemptCount`は「LINEへの送信回数」ではなく「処理権の取得回数」である。
  初回取得で1、再claimで2・3となり、決定事項の「合計3回」と同じ数え方で使える。
- 取得は`updateMany`の`where`で状態を絞る1文で行われる。
  上限は同じ`where`へ`attemptCount`の条件として入れる必要がある（アプリ側の事前読取りだけでは
  並列処理で超過し得る）。
- 現行の`where`には上限がなく、期限切れPROCESSINGは何度でも再claimされる。
- `finishDelivery`は`claimToken`と`PROCESSING`で絞って更新し、FAILEDでは自動再送しない。
- `retryKey`は現行でも`delivery.id`であり、再claimでも同じ値が使われる。

実装時の確認事項：
- 上限到達後の期限切れPROCESSINGは、再claimされない配信として残るため、
  誰がFAILED（結果不明・上限到達）へ終端化するかを設計する。
  `sendClaimableLineDeliveries`の取得条件や、終端化の処理で、残り続けたり
  毎回の取得対象になったりしないことを確認する。
- errorCodeは文字列のため、専用値の追加でマイグレーションが必要かは未確認。
  実装前に`prisma/schema.prisma`と画面側の表示（`ContentLineDeliveryHistory.tsx`）を確認する。

- 依存：なし。
- テスト：unit、実DB統合（1〜3回目の取得、4回目の拒否、終端化、並列claim）。
- 受入：
  - 同一配信の処理権の取得が3回を超えない。並列にclaimしても超えない（実DBで確認する）。
  - 3回目も結果未記録で期限切れになった配信は、4回目の送信をせず、専用のerrorCodeのFAILEDになる。
  - 専用のerrorCodeを、既存のFAILEDと区別して判定・表示できる。
  - 一回の取得limitとFAILEDの自動再送なしの仕様が変わっていない。
  - 終端状態と運用上の見方が文書化されている。
- 担当：Claude実装、人間がレビュー。

### G3. LINE実通信のtimeout

- 目的：F13-LINE-TIMEOUTの解消。
- 対象：`src/infrastructure/line/line-messaging-api.ts`、`send-pending-line-deliveries.ts`。
  管理画面の再送操作の対象判定は、後述の確認事項を調べてから対象ファイルを確定する。
- 調査開始：`sendLinePushMessage`の呼び出し元、`tests/mvp/line-delivery.integration.test.ts`、
  `app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/actions.ts`（FAILEDを対象に再送する処理）、
  `app/(club-app)/club/admin/_components/ContentLineDeliveryHistory.tsx`（FAILEDの表示）。
- 変更しない：retryKeyの仕組み、通常のエラー分類、Service Roleキーの渡し先。

決定事項（利用者の方針。実装は後続）：
- LINE APIの1リクエストを10秒で打ち切る。
- タイムアウトを検知して記録できた配信は、通常の失敗と区別できる「送信結果不明」としてFAILEDに記録し、
  自動再送しない。管理画面でも通常の再送操作の対象にしない。
- G2で期限切れPROCESSINGを引き継ぐ場合は、同じretry keyを使う。
  公式仕様上の有効期間内と確認できる場合に限って再送する。

現行コードの確認結果（2026-11-10、読み取りのみ）：
- `sendLinePushMessage`の`fetch`に打ち切り時間はない。通信例外は`LINE_NETWORK_ERROR`になり、
  timeoutを区別できない。
- `retryKey`は`delivery.id`で、再claimでも同じ値になる。
  ただし、管理者の再送は新しいDeliveryを作るため、retry keyは別の値になり、
  結果不明の配信を再送すると重複し得る。これが「通常の再送操作の対象にしない」理由に当たる。
  再送操作側の現行の絞り込み条件は、実装前に確認する（未確認）。

LINE公式仕様の確認結果（2026-11-10、公式ドキュメント「Retrying an API request」を読み取りで確認）：
- retry keyは「最初のリクエストから24時間」有効で、24時間以内に再試行する設計とする。
- 受付済みのkeyで再試行すると409が返る（既存実装はこれを受付成功として扱う）。
- 通信失敗・時間切れは再試行の対象で、「エラーでもメッセージが届いている可能性がある」と記載されている。
- 再試行は同じ内容・同じ宛先にする。keyのない要求は再試行できない。
- 公式ドキュメントに記載がない事項：24時間を過ぎたkeyの挙動、最初のリクエストが処理中のときの挙動。
  このため、24時間を過ぎた再送は行わない。

決定した設計（実装済み。2026-11-10の追加決定を含め、実DBのintegration（22 suites・624件、3回成功）と
`verify:mvp` 全11段階（`F12_MVP_PASSED 11`）で確認済み。運用書第12.3・12.4節を参照）：
- 時間切れ：`AbortSignal.timeout(10秒)`。検知できたら `LINE_RESULT_UNKNOWN_TIMEOUT` のFAILEDに記録し、
  自動再送しない。
- 通信エラー（利用者の決定、2026-11-10）：LINE APIから応答を確認できなかった `LINE_NETWORK_ERROR` も、
  タイムアウトと同じ結果不明として扱う。errorCodeは既存の `LINE_NETWORK_ERROR` を維持し、
  説明文は「LINEへの送信結果を確認できませんでした。」にする（送信失敗と断定しない）。
  LINEへ通信する前に失敗したと確認できるもの（`LINE_TARGET_DISABLED`・`LINE_SETTING_INCOMPLETE`・
  `LINE_CREDENTIAL_ERROR`）と、LINEが拒否した `LINE_HTTP_*` は、結果不明に変更しない（再送できる）。
  `fetch` の例外は、送信前の不正な入力（例：不正なヘッダー値）でも同じ通信エラーとして捕まえるため、
  区別できず、結果不明に含まれる（安全側）。
- 結果不明のerrorCode（4種）：`LINE_RESULT_UNKNOWN_TIMEOUT`、`LINE_NETWORK_ERROR`、
  `LINE_RESULT_UNKNOWN_CLAIM_LIMIT`（G2）、`LINE_RESULT_UNKNOWN_RETRY_KEY_EXPIRED`。
  定義は `domain/club/line/line-delivery-result.ts`。
- 管理画面：結果不明のFAILEDは、状態を「送信結果不明」と表示し（「送信失敗」と断定しない）、再送ボタンを出さず、
  「LINEに届いている可能性があるため、再送はできません。LINEグループで届いているかをご確認ください。」と表示する。
  再送対象の取得（お知らせ・イベントのRepository）も結果不明のerrorCodeを除外し、再送Actionは
  対象が取得できないため `notFound()` で拒否する（ボタンを出さないだけでなくサーバー側でも拒否する）。
- 再送期限（利用者の決定、2026-11-10）：期限切れPROCESSINGの再claimは、依頼日時から数えた期限内に限る。
  期限は、公式仕様の24時間から安全余裕10分を引いた期間。期限に達した配信、判定できない配信は送信せず、
  `LINE_RESULT_UNKNOWN_RETRY_KEY_EXPIRED` で終端化する。新しいretry keyへの切替、最初の送信時刻の列の追加
  （Prismaスキーマ変更・migration）は行わない。G2の「初回1回＋再claim最大2回」の上限は維持する。
  依頼日時が安全側になる根拠（コードで確認済み）：
  - 依頼日時（`requestedAt`）は、配信の作成時に1回だけ記録される（作成時の `new Date()`、またはスキーマの既定値）。
    `requestedAt` を更新するコードは、claim・終端更新・再送のいずれにもない。
  - 最初の送信は配信の作成後に行うため、最初の送信時刻は依頼日時以降である。
  - 公式仕様は「最初のリクエストから24時間」なので、依頼日時から数えた期限は実際の期限より早く来る。
  - 管理者の再送は新しい配信（新しいretry keyと依頼日時）を作るため、元の配信の期限には影響しない。
  - 依頼日時は、DBの既定値またはアプリの時計で付く。時計のずれは、安全余裕10分で吸収する。
- 公式仕様（2026-11-10確認）：retry keyは最初のリクエストから24時間有効。期限後の挙動と、
  最初のリクエストが処理中のときの挙動は、公式資料に記載がない。このため、期限に達した配信は送信しない。

残る制約：
- 管理者の再送は新しい配信（新しいretry key）を作るため、結果不明でない失敗でも重複し得る。
- 最初の送信が依頼日時より大きく遅れる配信（長時間の送信待ち後に最初の送信をした配信）は、
  期限が実際より早く来る。期限切れPROCESSINGは、再送されず結果不明で終端化される（安全側）。

- 依存：G2（終端化の扱いと整合させる）。
- テスト：unit（10秒で打ち切る動作。fake timer等）、実DB統合（timeout結果のFAILED記録、自動再送されないこと）。
  TimeoutError注入試験だけを実timeoutの根拠にしない。
- 受入：
  - LINE APIの1リクエストが10秒で打ち切られる。
  - タイムアウトを記録できた配信は、通常の失敗と区別できる「送信結果不明」のFAILEDになり、自動再送されない。
  - 管理画面の通常の再送操作の対象にならない。
  - 期限切れPROCESSINGの再送は、同じretry keyで、公式仕様の有効期間内と確認できる場合に限られる。
  - 重複送信を防げる範囲と防げない範囲が文書化されている。
- 担当：Claude実装、人間がレビューと公式仕様の確認。

### G4. バックアップ・migration・rollback手順

- 目的：F13.md の1・2。
- 対象：新規の運用書 [本番migration手順書](../../runbooks/production-migration.md)。
- 調査開始：`prisma/migrations/`、`prisma.config.ts`。
- 変更しない：migration本体、既存HPのテーブル。
- 依存：G0。
- テスト：静的レビューのみ。
- 受入：バックアップ、復元確認、rollback判断基準、戻し方がレビュー可能。
- 担当：Claude（手順書）、人間（本番バックアップと復元確認。承認地点B）。
- 状態：**手順書を作成した（2026-11-11）。本番の確認・バックアップ・復元は、すべて未実施。**
  この手順書のレビューと、承認地点Bの承認が済むまで、本番へは接続しない。

前提（利用者が共有、2026-11-11）：
- 本番DBはSupabase。既存HPが利用中で、今後は1つの本番DBをマルチテナント構成で使う。
- **以前の記録（2026-11-11の最初の共有）：** 契約はFreeプランで、PITRと自動バックアップは使っていなかった。
- **現在の構成：Pro・日次バックアップ一覧確認済み**（**利用者が管理画面で確認し、報告した結果**、2026-11-11。
  Claudeが検証した結果ではない。手順書の第4.7節）：
  - 本番プロジェクトが所属する組織を、Supabase Proへ変更した。
  - 「スケジュールされたバックアップ」に、2026年11月4日〜11月10日（UTC）の7件が表示されている。
    各バックアップは「物理的なバックアップ」で、「復元する」ボタンがある。
  - 最新は、UTC 2026年11月10日 16:25:47（日本時間 2026年11月11日 01:25:47）。
  - Storageのファイル本体はDBバックアップに含まれない旨が、画面に表示されている。
- **未実施（実証済みとしない）：** 復元の操作、別環境での復元確認（B-2）、migration直前の手動バックアップ（B-1）、
  本番migrationの適用。保持日数・復元の仕様・ダウンロードの可否は、未確認。
- バックアップ方針（利用者の決定、2026-11-11）：**Supabase Proの日次バックアップを利用する。PITRは導入しない。**
  日次バックアップとは別に、本番migration直前の手動バックアップと、別の検証環境での復元確認を行う。
  プランの変更（Free→Pro）は、利用者が実施した（上の「現在の構成」）。
- 今回のmigrationは本番に未適用。過去の適用履歴の有無と、本番スキーマとリポジトリの整合は未確認。
- 本番では、人間が、適用対象と接続先を確認してから、`npx dotenv-cli -e .env.prod -- npx prisma migrate deploy` を実行する。
  本番で `migrate dev` は使わない。

手順書で決めた方針：
- 本番適用へ進む条件は、**バックアップを別環境（使い捨てのローカルDB）で復元でき、リハーサル（復元DBへの `migrate deploy`）が
  成功すること**（承認地点B-2）。
- 履歴がない・整合しない場合は、適用を止める。既存DBの履歴整備（baseline）が必要かは、別に判断する。
- 戻しは、前方修正を優先し、個別の戻しSQL（事前に作り、検証用DBで確認する）、最終手段としてDB全体の復元とする。
  DB全体の復元は、同じDBを使う既存HP・他テナントに影響し、**バックアップ時点より後の書込みが失われる可能性がある**
  （PITRなし。復元できる時点は、日次バックアップと手動バックアップの時点だけ）。
- Storageのファイル本体は、日次バックアップにも手動バックアップ（DB）にも含まれない。手順書の第6.4節で、別に保全し、
  復元の手順（バケットの設定・本体の戻し・DBの参照との突合）を定める。
- 日次バックアップは、取得時刻を選べず、別の検証環境での復元確認に使えない可能性があるため、手動バックアップを省略しない。

手順書の作成中に見つかった、本番の既存HPへの影響の可能性（本番側は未確認）：
- `20260816224901 revoke_public_data_api_access` は、`public` の全テーブルから `anon`・`authenticated` の権限を剥奪する。
- `20260817003046 remove_club_images_storage_policies` は、`storage.objects` の `club-images` を含むポリシーを削除する。
  `club-images` は、既存HPの画像（スタッフ・ページ内容）が使うバケットと同名。
- Prismaは、CHECK制約・トリガー・RLS・権限・Storageのポリシーを `schema.prisma` に持たないため、`migrate diff` だけでは
  整合を確認しきれない。手順書は、読取りSQLと、復元DBでのリハーサルで補う。

### G5. 本番初期化スクリプト（dryRun既定）

- 目的：F13.md の3・4・5。
- 対象：`scripts/`配下の新規ファイル。
- 調査開始：`prisma/seed-app-local.ts`、`scripts/initialize-club-line-setting.ts`（dry-run／applyの分離）。
- 対象データ：Club（ARAO）、AppUser、Membership（OWNER／ACTIVE／canManageWebsite=true）、
  PlatformAdmin、ClubEmailSetting、暗号化済みClubLineSetting。
- 変更しない：`seed-app-local.ts`、`WEBSITE_ADMIN_USER_IDS`と`lib/auth/admin.ts`、既存HPのデータ。
- 依存：G4。
- テスト：使い捨てDBでの統合試験（冪等性、Auth不一致の拒否、既存データ差分の拒否、他クラブ非接触）。
- 受入：dryRunが書込みなしで差分を報告する。ARAOはSTARTERで作成される。
- 担当：Claude実装、人間がAuthのuser.id・email確認とapply実行（承認地点D・E）。

### G6. Storage・環境変数・Cron・Resendの確認手順

- 目的：F13.md の6・7・8・10。
- 対象：運用書、必要に応じて確認用の文書。
- 調査開始：`scripts/validate-env.mjs`、`app/api/cron/*`、`src/application/cron/cron-authorization.ts`、
  `src/infrastructure/storage/club-content-attachment-storage.ts`、`vercel.json`。
- 変更しない：既存HPのCron（`delete-old-security-logs`）の仕様。
- 依存：G0。
- 受入：変数名・用途・設定先・有無の一覧（値は含めない）、非公開bucketと制限の確認手順、
  Cronが認証なしで拒否される確認手順がある。
決定事項（利用者の方針。変更・実行は後続）：
- 既存HPのログ削除CronはVercelでの運用を維持する。
- `club-line-deliveries`と`storage-deletions`は、登録済みの本番Supabase Cronを維持する。
  どちらも5分間隔で、LINEは毎時00分起点、Storageは毎時02分起点（利用者の確認。本書では未検証）。
  二重起動を避けるため、この2件は`vercel.json`へ追加しない。
- 本番でのSupabase Cronの登録は、利用者が確認済み。

ログ削除Cronの照合結果（利用者がVercelの本番デプロイのSourceで確認。本書では再検証していない）：
- 現在の本番デプロイでは、Vercelの Cron一覧に`/api/cron/delete-old-submission-logs`が表示されている。
- 同じ本番デプロイの`vercel.json`も、旧パス`/api/cron/delete-old-submission-logs`を指定している。
- 一方、実際のルートは`app/api/cron/delete-old-security-logs/route.ts`である。
  現在の本番デプロイ内で、Cronの設定とルートが一致していない。
- 旧パスへのリクエストが404だったか、削除処理が成功していたかは未確認。
  本番ログの確認で分かるかは未確認。
- 今回のリリース対象コードでは、`vercel.json`のpathと実際のルートが、
  ともに`/api/cron/delete-old-security-logs`に対応している（リポジトリを読み取りで確認、2026-11-10）。
  このためのパス変更は不要とする。コードと`vercel.json`は変更しない。
- 現在の本番では、ログ削除が実際には動いていなかった可能性がある。
  この間の削除漏れの有無と扱いは、未確認・要判断とする。

G6で残す確認（本番デプロイ後。デプロイは承認後に人間が行う）：
- Vercelの Cron一覧で、新パス`/api/cron/delete-old-security-logs`が有効で、
  旧パス`/api/cron/delete-old-submission-logs`が残っていないことを確認する。
- 定刻の本番ログで、新パスへの呼び出しとHTTP応答を確認する。ジョブの手動起動はしない。

Supabase Cronについて：
- 5分間隔と起動時刻（LINEは毎時00分起点、Storageは毎時02分起点）は、利用者が管理画面で確認済み。
- Supabase Cronの認証付きでの正常実行は未確認。既存の実行履歴・本番ログを照合し、
  呼び出し先・時刻・HTTP応答を確認する。ジョブの手動起動はしない。
  ログに認証情報（CRON_SECRET等）やレスポンス本文が含まれる場合は、記録に写さない。
- Cronの認証（`CRON_SECRET`、`src/application/cron/cron-authorization.ts`）が、
  3つのCronで同じ方式で働くことを、routeごとに確認する。

- 担当：Claude（手順書・照合項目の整理）、人間（Vercel・Supabase側の設定・ログの確認）。

### G7. 本番smoke testとWebhook切替の手順

- 目的：F13.md の9・11・12。
- 調査開始：`app/api/line/webhook`、`e2e/smoke.spec.ts`。
- 変更しない：既存HP管理画面の動作。
- 依存：G5、G6。
- 受入：OWNER・MEMBER・PlatformAdminの最小smoke範囲、Webhook URL切替手順、
  既存HP管理画面の回帰確認項目がある。LINE・Resendは最小疎通のみで、
  受付成功と配送完了を区別して記録する。
- 担当：Claude（手順書）、人間（実行。承認地点F）。

### G8. プラン切替運用

- 目的：F13.md の5。
- 変更しない：プラン変更の実行。
- 依存：G5。
- 受入：公開前STARTER、公開時STANDARDの手順と戻し方がある。
- 担当：Claude（手順書）、人間（実行。承認地点G）。

### G9. 公開判断・release tag

- 目的：F13.md の13・14。
- 変更しない：HP管理認可（DB方式へ切り替えない）。
- 依存：G1〜G8、G10。
- 受入：障害時にどこまで戻すかが文書化されている。release tagは安定確認後に人間が判断する。
- 担当：人間（承認地点H）。

### G10. 手動受入（実機・アクセシビリティ・Proxy）

- 目的：MANUAL-ACCEPTANCEの解消。
- 対象：運用書第10.5節、F10／F11運用書の手動表。
- 変更しない：手動表の未確認欄の一括更新。
- 依存：G7と並行できる。
- 受入：各項目に実施結果か保留理由がある。
- 担当：人間。

## 4. 本番操作前の承認地点

承認は操作ごとに取る。対象環境、変更内容、バックアップ／復元確認、dryRun結果、戻し方を
レビュー可能にしてから求める。

| 地点 | 操作 |
| --- | --- |
| A | 新しい使い捨て環境での統合試験の実行 |
| B | 本番バックアップ取得と復元確認。手順書は、B-0（本番の履歴・スキーマの読取り確認）、B-1（バックアップの取得）、B-2（使い捨てDBでの復元とリハーサル）に分けて、操作ごとに承認を取る |
| P | Supabaseのプラン変更（Free→Pro）。外部設定・プランの変更として、操作ごとの明示承認を得る。G4の手順書の範囲外。**利用者が実施済みと報告（2026-11-11）。承認の記録は、利用者側** |
| C | migration適用 |
| D | 初期化スクリプトの本番dryRun |
| E | 初期化のapply |
| F | LINE Webhook URL切替、LINE・Resendの実送信 |
| G | STARTERからSTANDARDへの切替 |
| H | release tag |

## 5. 公開を止める条件（確定。利用者の決定、2026-11-10）

以下のいずれかに当てはまる間は、公開しない。

- バックアップの復元確認ができていない。
- Authのuser.id・emailが一致しない。
- dryRunが意図しない既存データ変更を報告している。
- Cronが認証なしで実行できる。
- Storageが非公開でない、または制限が確認できていない。
- 既存HP管理画面に回帰がある。
- `WEBSITE_ADMIN_USER_IDS`が無効、またはDB認可へ切り替わっている。
- G2・G3が未完了のまま、LINEを有効化する（G2・G3の完了は、実装・ローカルの検証に加え、利用者の確認が済んだ状態をいう）。

公開判断の注意事項（2026-11-11追記。詳細は手順書の第9.6節）：

- **バックアップ時点より後のDBへの書込みは、復元で失われる可能性がある。** 公開後は、クラブの利用のすべてが対象になる。
- PITRは導入しない。復元できる時点は、日次バックアップ（取得時刻を選べない）と、手動バックアップの時点だけで、間隔が粗い。
- 日次バックアップも、手動バックアップ（DB）も、Storageのファイル本体を含まない。本体は、別に保全する。
- 公開後のmigrationは、書込み損失の影響が大きい。可能な限り、公開前に適用と確認を済ませる。
- 日次バックアップの確認（プラン・取得状況・復元できる期間）を、停止条件に加えるかは、要判断
  （migrationの適用の前提としては、手順書の第8.1節に入れた）。

## 6. 未解決・要判断

決定済み（利用者の決定。2026-11-10）：
- G2：処理権の取得は合計3回まで。超過時は `LINE_RESULT_UNKNOWN_CLAIM_LIMIT` のFAILEDで終端化する。
  画面では「送信結果を確認できませんでした」と伝え、結果不明の配信は通常の再送操作の対象にしない。
- G3：LINE APIの1リクエストは10秒で打ち切る。結果不明はFAILEDで自動再送せず、通常の再送操作の対象外。
- G3：通信エラー（`LINE_NETWORK_ERROR`）も結果不明として扱う。再送期限は依頼日時から判定し、
  最初の送信時刻の列は追加しない。お知らせの再送対象を確認する実DB試験を1件追加する。
- G2の追加2件の試験は、必須とする。
- 第5節を公開停止条件として確定する。G2・G3が未完了のままLINEを有効化しない。
- G6：ログ削除CronはVercel、`club-line-deliveries`と`storage-deletions`は本番Supabase Cron。
  Supabaseの2件は`vercel.json`へ追加しない。

未確認・要判断：
1. G2・G3の追加試験の必須化：`tests/mvp/suite-manifest.ts` の `MVP_CONCURRENCY_CASES` に登録した
   （natural 1→2、injected 3→7）。実DBで `passed=31 natural=2 injected=7` と数えられたことを確認済み
   （運用書第12.4節）。
2. F13-ENV-REPRO：G1の受入条件の記録が揃ったため、解消済み（DB版17.6を運用書第12.2節に記録）。
   DB版は別実行で取得した値。別マシン・空のキャッシュでの確認は未実施。
3. 依存関係の警告（`npm audit`、allowScripts）：対象・影響・公開への影響・最小の対処案を、完了報告で提示した。
   依存関係・lockfileは変更していない。対処の採否は要判断。
4. G3：決定済みの3点（通信エラー・再送期限・お知らせの実DB試験）の実装と、実DB・全体実行での確認は済み。
   G3の完了（LINE有効化の条件）の確認は、利用者の判断。実LINE APIへの実通信での打ち切りは未確認
   （本番の最小疎通で確認する）。
5. G6：ログ削除Cron。現在の本番デプロイでは、`vercel.json`が旧パス
   `delete-old-submission-logs`を指し、実ルートは`delete-old-security-logs`で不一致（確認済み）。
   リリース対象コードでは両方が`delete-old-security-logs`で一致しているため、パス変更は不要。
   未確認：旧パスへのリクエストが404だったか、削除が成功していたか。
   デプロイ後の確認：新パスが有効で旧パスが残っていないこと、定刻の本番ログのHTTP応答。
   不一致の間の削除漏れの有無と扱いは要判断。
6. G6：Supabase Cron（LINE配信・Storage削除）の認証付き正常実行
   （呼び出し先・時刻・HTTP応答）は未確認。
7. G4：Supabase Proへの変更は実施済み（利用者の報告）。日次バックアップの**保持日数**（一覧は7件。断定しない）・
   **復元の仕様**・**ダウンロードの可否**・PITRが画面で無効であることは、未確認（手順書の第4.6・4.7節）。
   **復元の操作と、別環境での復元確認は未実施**で、復元可能なことは実証されていない。
   Storage本体の復元方法は、検証用の環境で先に確認する（第6.4節）。
8. G4：本番migrationの手順書の要判断・未確認は、手順書の第11章に列挙した（既存の本番DBの履歴の有無、接続先の種別、
   本番とpg_dumpの版、Storage本体の取得方法、既存HPのData API・Storageポリシーへの依存、auth・storageデータの復元の可否、
   実施日時・体制・承認者）。
9. 削除済みF12仕様書・粒度別計画に相当する現行資料は無い。参照は削除した。
   「F13-granular-plan」自体が今後の計画の入口になる。

[F13仕様]: F13.md
[運用書第12節]: ../../runbooks/mvp-verification.md#12-結果台帳と引継ぎ
