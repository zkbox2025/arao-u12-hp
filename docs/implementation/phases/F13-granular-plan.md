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
| F13-LINE-RECLAIM | G2 | 期限切れPROCESSINGの再claim回数に数値上限があり、超過後の状態が定義されている。FAILEDを自動再送しない現行仕様と、一回の取得limitは変えない。境界を実DBで確認する。 | Claude実装、人間が上限値・終端状態を判断 | 公開前 | LINE通知を本番で有効化する場合は止める案。LINEを無効のままなら、リスクを記録して公開できる案。 |
| F13-LINE-TIMEOUT | G3 | 実LINE通信に打ち切り時間がある。打ち切り後は結果不明として扱い、重複送信を防ぐ範囲と防げない範囲が文書化されている。TimeoutError注入試験だけを根拠にしない。 | Claude実装、人間が方針判断 | 公開前（G2の後） | G2と同じ。実通信のtimeoutが未実装のまま、LINEを本番有効化しない案。 |
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
- 対象：`src/application/club/line/send-pending-line-deliveries.ts`（`claimDelivery`）。
- 調査開始：同ファイル、`prisma/schema.prisma`のClubLineDelivery、`tests/mvp/line-delivery.integration.test.ts`。
- 変更しない：一回の取得limit、FAILEDを自動再送しない仕様。
- 依存：なし。
- テスト：unit、実DB統合（上限前後の境界、並列claim）。
- 受入：上限超過のPROCESSINGは再claimされず、終端状態と運用上の見方が文書化されている。
- 要判断：上限値、上限超過時の状態（既存statusの再利用かマイグレーションか）。
- 担当：Claude実装、人間が判断。

### G3. LINE実通信のtimeout

- 目的：F13-LINE-TIMEOUTの解消。
- 対象：`src/infrastructure/line/line-messaging-api.ts`。
- 調査開始：`sendLinePushMessage`の呼び出し元、`tests/mvp/line-delivery.integration.test.ts`。
- 変更しない：retryKeyの仕組み、通常のエラー分類、Service Roleキーの渡し先。
- 依存：G2（終端化の扱いと整合させる）。
- テスト：unit（打ち切りの動作）。実DB側の注入試験は実timeoutの根拠にしない。
- 受入：timeout後は結果不明として扱われ、重複送信を防げる範囲が文書化されている。
- 要判断：timeout値、retryKey有効期間を超えた再送の可否。
- 担当：Claude実装、人間が判断。

### G4. バックアップ・migration・rollback手順

- 目的：F13.md の1・2。
- 対象：新規の運用書。
- 調査開始：`prisma/migrations/`、`prisma.config.ts`。
- 変更しない：migration本体、既存HPのテーブル。
- 依存：G0。
- テスト：静的レビューのみ。
- 受入：バックアップ、復元確認、rollback判断基準、戻し方がレビュー可能。
- 担当：Claude（手順書）、人間（本番バックアップと復元確認。承認地点B）。

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
- 未確定：Cronの起動元（要判断）。`vercel.json`に登録があるのは`delete-old-security-logs`だけで、
  `club-line-deliveries`と`storage-deletions`はrouteが存在する。起動元をVercel Cronと
  外部スケジューラのどちらにするかを決める。
- 担当：Claude（手順書）、人間（各サービス側の設定確認）。

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
| B | 本番バックアップ取得と復元確認 |
| C | migration適用 |
| D | 初期化スクリプトの本番dryRun |
| E | 初期化のapply |
| F | LINE Webhook URL切替、LINE・Resendの実送信 |
| G | STARTERからSTANDARDへの切替 |
| H | release tag |

## 5. 公開を止める条件（要判断）

- バックアップの復元確認ができていない。
- Authのuser.id・emailが一致しない。
- dryRunが意図しない既存データ変更を報告している。
- Cronが認証なしで実行できる。
- Storageが非公開でない、または制限が確認できていない。
- 既存HP管理画面に回帰がある。
- `WEBSITE_ADMIN_USER_IDS`が無効、またはDB認可へ切り替わっている。
- LINEを有効化する場合に、G2・G3が未対応。

## 6. 未解決・要判断

1. G2：再claim回数の上限値と、超過時の状態。
2. G3：timeout値と、結果不明時の再送の扱い。
3. G6：Cronの起動元（Vercel Cronか外部スケジューラか）。
4. 第5節の各停止条件を、公開を止める条件として確定するか。
5. 削除済みF12仕様書・粒度別計画に相当する現行資料は無い。参照は削除した。
   「F13-granular-plan」自体が今後の計画の入口になる。

[F13仕様]: F13.md
[運用書第12節]: ../../runbooks/mvp-verification.md#12-結果台帳と引継ぎ
