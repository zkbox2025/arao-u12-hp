<!-- docs/runbooks/production-migration.md -->

# 本番migration：バックアップ・復元確認・適用・戻し方（F13粒度4）

## 1. この手順書の範囲と状態

本番DB（SupabaseのPostgreSQL）へ、今回のリリースのmigrationを適用するための手順を定める。
バックアップの取得、別環境での復元確認、適用履歴・スキーマの確認、中止条件、戻し方を扱う。

- **状態：作成のみ。未実行。** 本書の作成では、本番DB・Auth・Storageへ接続していない。
  利用者が、管理画面で、Proの日次バックアップの一覧を確認した（第4.7節）。**復元の操作と、別環境での復元確認は、未実施。**
  コマンドは `--help`・ローカルのファイルで確認できた範囲で書いた。未確認の事項は「要確認」と書く。
- **範囲外：** 本番の初期化データ（G5）、Cron・Storage制限・Resendの確認（G6）、
  本番smoke test・Webhook切替（G7）、既存DBの履歴整備（baseline）が必要になった場合の設計。
- 実行は人間が行う。Claudeは本番へ接続せず、実行もしない。
- 本番へ接続するコマンドは、すべて操作ごとの明示承認（第3章）を得てから実行する。
  F12で許可された使い捨て環境への操作は、本書の本番操作の許可ではない。

### 1.1 前提（利用者が共有した現状、2026-11-11）

| 項目 | 内容 |
| --- | --- |
| 本番DB（現在の構成） | SupabaseのPostgreSQL。**Pro・日次バックアップ一覧確認済み**（**利用者が管理画面で確認した結果**、2026-11-11。詳細は第4.7節）。Claudeは、管理画面を見ておらず、本番へ接続していない |
| 本番DB（以前の記録） | 2026-11-11の最初の共有では、契約は**Freeプラン（$0/月）**で、PITRと自動バックアップは使っていなかった。その後、組織をProへ変更した（第4.7節）。**Free時点の記録は、現在の構成と区別する** |
| バックアップ方針（確定、2026-11-11） | **Supabase Proの日次バックアップを利用する。PITRは追加料金のため、今回は導入しない。** 日次バックアップとは別に、**本番migration直前の手動バックアップと、別の検証環境での復元確認**を行う。プランの変更（Free→Pro）は、本書の範囲外で、利用者が実施した（第4.7節。利用者の報告） |
| 利用状況 | 既存HPが利用中。今後は1つの本番DBをマルチテナント構成で使う方針 |
| 今回のmigration | 本番に未適用。**過去の適用履歴の有無、本番スキーマとリポジトリの整合は未確認** |
| 適用方法 | 本番では、適用対象と接続先を確認してから、手元のターミナルで `npx dotenv-cli -e .env.prod -- npx prisma migrate deploy`。本番で `migrate dev` は使わない |
| 適用済みmigration | 編集しない |

PITR（時点復元）は使わないため、復元できる時点は、**日次バックアップの時点**と、**自分で取得した手動バックアップの時点**だけである。
**バックアップ時点より後のDBへの書込みは、DB全体を復元すると、失われる可能性がある**（第9.3節・第9.6節）。
日次バックアップと手動バックアップは、役割が違う（第4.6節）。**日次バックアップを、手動バックアップの代わりにしない。**

### 1.2 dry-runの定義

本書のdry-runは、**書込み・実送信を行わない確認**をいう。
本番に対するdry-runは、読取りだけを行う（第5章）。接続の時点で本番の個人情報に触れ得るため、
読取りも承認を得て行う。リハーサル（第7.4節）は、本番ではなく、復元した使い捨てDBへ書き込む。

## 2. 全体の流れ

| 段階 | 内容 | 場所 | 承認地点 | 通過条件 |
| --- | --- | --- | --- | --- |
| 準備 | 道具・接続情報・保管場所・体制の確認。**日次バックアップの確認（管理画面、第4.6節）** | 手元・管理画面（閲覧のみ） | なし（設定は変更しない） | 第4章を満たす |
| B-0 | 本番の適用履歴・未適用・スキーマ整合の確認（読取りのみ） | 本番（読取り） | B | 第5.4節の中止条件に当たらない |
| B-1 | 手動バックアップの取得（DB・Storage本体・その他） | 本番（読取り） | B | 第6.5節の確認がすべて済む |
| B-2 | 別の検証用DBへ復元し、予行（リハーサル）を行う | 使い捨てDB | B | 第7.5節の合格条件を満たす |
| 戻しSQL | 戻しの手順と、必要なSQLを作り、検証用DBで確認する | 使い捨てDB | B | 第9.5節を満たす |
| C | 本番への適用 | 本番（書込み） | C | 第8.1節の前提がすべて満たされている |
| 事後 | 適用後の確認と記録 | 本番（読取り） | C | 第8.4節 |

**B-2（別環境で復元できること）が合格するまで、Cへ進まない。**

## 3. 承認地点

承認は、操作ごとに取る。承認を求めるときは、対象環境、変更内容、バックアップ・復元確認、
dry-run結果、戻し方を、レビューできる形で示す。

| 地点 | 操作 | 本番への作用 |
| --- | --- | --- |
| B-0 | `migrate status`、`migrate diff`、読取りSQL | 読取りのみ |
| B-1 | `pg_dump`、Storage本体の取得 | 読取りのみ（個人情報を含むファイルが手元に作られる） |
| B-2 | 検証用DBへの復元・リハーサル | 本番には触れない。**手元に本番データの複製ができる** |
| C | `prisma migrate deploy` | **書込み（スキーマ変更）** |

## 4. 準備

### 4.1 体制・時間帯

- 実施者と、承認者（C）を決める。実施日時は、HPの申込み・管理画面の更新が少ない時間帯にする。
- 取得から適用までの間に、HPへの書込み（フォーム申込み、管理画面の編集）が起きる。
  **適用の直前に取得する**（取得から適用までを、当日中にする）。時間が空いた場合は、再取得するか、
  失われる書込みを許容するかを、Cの承認者が決める。
- 実施中は、他のデプロイ、他のmigration、本番DBへの手動書込みをしない。

### 4.2 道具

| 道具 | 要件 |
| --- | --- |
| `pg_dump`・`pg_restore`・`psql` | **メジャー版が、本番のサーバー版以上**であること（`pg_dump --version`。サーバー版はB-0の `show server_version` で確認）。**未導入の場合（2026-11-11のB-0の準備で、利用者のMacに未導入だった）：** Homebrewの `libpq`（`brew install libpq`）を入れ、`export PATH="$(brew --prefix libpq)/bin:$PATH"` で、そのターミナルのPATHへ足す。手元の道具であり、プロジェクトの依存関係（package.json・lockfile）は変わらない。`libpq` は通常、最新のメジャー版が入るため、本番のサーバー版が古くても使える |
| Docker | 検証用DBに使う（第7章） |
| `npx prisma` | リポジトリの導入済みの版（package.json・lockfileは変更しない） |

### 4.3 ターミナルを2つに分ける（誤爆防止）

- **本番用ターミナル：** 本番への読取り・適用だけに使う。プロンプトの先頭に `PROD` と表示するなど、一目で分かるようにする。
- **検証用ターミナル：** 検証用DBへの復元・リハーサルだけに使う。**本番の接続情報を読み込まない。**
- 復元・リハーサルのコマンドを、本番用ターミナルで実行しない。逆も同じ。

### 4.4 接続情報の扱い

- `.env.prod` の内容を、画面・ファイル・チャット・Gitへ出さない。
- 本書の接続用の関数は、値を画面へ出さずに、環境変数 `PG*` へ入れる。実行後に `unset` する。
- `prisma` の出力には、接続先のホスト名が含まれることがある。**出力をそのまま共有しない。**
- 接続先の確認は、ポート番号と「poolerを含むか」だけを見る（下の関数）。

```bash
# 本番用ターミナルで、リポジトリのルートから実行する。値は画面に出さない。
f13_prod_env() {
  eval "$(npx dotenv-cli -e .env.prod -- node - <<'JS'
const u = new URL(process.env.DATABASE_URL);
const q = (v) => "'" + String(v).replace(/'/g, "'\\''") + "'";
const pairs = {
  PGHOST: u.hostname,
  PGPORT: u.port || "5432",
  PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  PGSSLMODE: "require",
  PGOPTIONS: "-c default_transaction_read_only=on",
};
for (const [k, v] of Object.entries(pairs)) console.log(`export ${k}=${q(v)}`);
JS
)"
}

f13_prod_env
printf 'ポート: %s / poolerを含む: %s\n' "$PGPORT" "$([[ "$PGHOST" == *pooler* ]] && echo はい || echo いいえ)"
```

- `PGOPTIONS` で、セッションを**読取り専用**にする。`pg_dump`・`psql` の確認用SQLが、誤って書き込めなくなる。
  接続先がpoolerで、`options` が拒否される場合は、`PGOPTIONS` を外し、SELECTだけを実行する。
- **接続先の種別（要確認、Supabaseの現行仕様）：**
  `migrate deploy`・`pg_dump` は、**直接接続、またはsession modeのpooler**を使う。
  transaction mode（ポート6543）は使わない。直接接続のホストがIPv6のみで、手元から接続できない場合は、
  session poolerを使う。`.env.prod` の `DATABASE_URL` が何を指すかを、上の出力で確認する。
- `pg_dump` は、libpqが解釈できない接続パラメーター（`pgbouncer=true` など）を受け付けない。
  本書の関数は、URLのqueryを使わず、`PG*` に分解している。

### 4.5 バックアップの保管

- 保管先：暗号化されたディスク上の、Git管理外のディレクトリ（例：`~/f13-backups/<日付>/`、権限700）。
- **バックアップには個人情報が含まれる。** リポジトリへ入れない。チャット・クラウドの共有フォルダへ置かない。
- 保持：migration適用後の安定確認（G9）が済むまで保持し、その後に削除する。削除日を台帳へ記録する。
- ファイル名・サイズ・SHA-256だけを台帳へ記録する（第10章）。ファイルの中身は記録しない。

### 4.6 Supabaseの日次バックアップの確認（管理画面）

方針（Supabase Proの日次バックアップ）が、**実際に使える状態か**を、管理画面で確認し、記録する。
**確認は、画面の閲覧だけで行う。本番DBには接続しない。** プランの変更・購入・復元ボタンの操作は、しない。
画面の名称・場所は、Supabaseの更新で変わり得る。画面の現行の表示に従う。

| 確認項目 | 確認の内容 | 判断 |
| --- | --- | --- |
| プラン | Organizationの請求（Billing）の画面で、現在のプランがProか | **Freeのままなら、日次バックアップはない。** Proへの変更（別の承認）を先に行うか、手動バックアップだけで進めるかを、Cの承認者が判断する |
| 日次バックアップの一覧 | Databaseのバックアップの画面に、取得済みのバックアップが、日時つきで表示されるか。**最新の取得日時** | 一覧がない・最新が古い場合は、原因を確認する（有効化の直後は、最初の取得を待つ必要があるかもしれない。**要確認**） |
| 復元できる期間 | 一覧の、最も古い日時から最新の日時まで。保持日数は、画面と公式資料で確認する | **数値は、本書で断定しない。** 確認した値を記録する |
| PITR | 無効であること（今回は導入しない） | 有効になっていたら、追加料金が発生している。意図を確認する |
| 復元の仕様 | 画面の説明で、復元が「同じプロジェクトへの上書き」か、復元中の停止（ダウンタイム）、復元後に何が失われるか | **復元は実行しない。説明を読み、記録する**（要確認） |
| ダウンロード | 日次バックアップを、ファイルとして取得できるか | 取得できる場合も、手動バックアップを省略しない |
| 対象外のもの | Storageのファイル本体が含まれるか | **含まれない前提で扱う**（公式資料で確認する。要確認）。第6.4節で、別に保全する |

**日次バックアップの限界（このため、migration直前の手動バックアップと、別環境での復元確認を省略しない）：**

1. **取得する時刻を選べない。** migration直前の状態を、持っていない可能性がある。
2. **復元は、別の検証環境で確認できない可能性がある**（同じプロジェクトへの上書き復元の場合）。別環境での復元確認は、手動バックアップ（`pg_dump`）で行う。
3. **バックアップ時点より後の書込みは、復元で失われる。**
4. **Storageのファイル本体は、含まれない。**

記録する項目：確認の日時・確認者、プラン、最新の取得日時、最も古い日時（復元できる期間）、PITRの有無、ダウンロードの可否、復元の仕様の要点。
スクリーンショットを保管する場合は、個人情報・秘密が写らないようにする。

### 4.7 日次バックアップの確認結果（利用者が管理画面で確認、2026-11-11）

**これは、利用者が管理画面で確認し、報告した結果である。Claudeが検証した結果ではない。**
Claudeは、管理画面を見ておらず、本番へ接続していない。第4.6節の手順の、初回の実施結果にあたる。

**現在の構成：Pro・日次バックアップ一覧確認済み。** 以前のFree時点の記録（第1.1節の「以前の記録」）とは区別する。

| 確認項目（4.6） | 利用者の報告 |
| --- | --- |
| プラン | 本番プロジェクトが所属する**組織を、Supabase Proへ変更した**（プラン変更は、利用者が実施。承認の記録は、利用者側） |
| 日次バックアップの一覧 | 「スケジュールされたバックアップ」に、**2026年11月4日〜11月10日（UTC）の7件**が表示されている |
| バックアップの種類・操作 | 各バックアップは「**物理的なバックアップ**」と表示され、「**復元する**」ボタンがある |
| 最新の取得日時 | **UTC 2026年11月10日 16:25:47（日本時間 2026年11月11日 01:25:47）** |
| 対象外のもの | **Storageのファイル本体はDBバックアップに含まれない旨が、画面に表示されている** |
| PITR | **導入しない**（方針）。画面での有効・無効の確認は、報告に含まれていない |
| 復元できる期間（保持日数） | 一覧は7件（11月4日〜10日）。**保持日数としては断定しない**（管理画面・公式資料で確認する。要確認） |
| 復元の仕様（上書きか、停止時間など） | 報告に含まれていない。**要確認**（復元は実行しない） |
| ダウンロードの可否 | 報告に含まれていない。**要確認** |

**未実施（記録しない・実証済みとしない）：**

- **復元の操作は、行っていない。** 「復元可能なことを実証済み」とは、記録しない。「復元する」ボタンが表示されていることは、
  復元できることの証明ではない。
- **別環境での復元確認（B-2）は、行っていない。**
- migration直前の手動バックアップ（B-1）は、取得していない。
- 本番のmigrationは、実行していない。
- 一覧の最新の取得日時は、確認した時点のもの。**適用（C）の直前に、最新の取得日時を、もう一度確認する**（8.1）。

**日次バックアップがあっても、必要なこと（変わらない）：** migration直前の手動バックアップ、別の検証環境での復元確認、
Storageのファイル本体の別の保全（4.6の限界、6.4）。PITRは、導入しない。

## 5. B-0：本番の適用履歴・未適用・スキーマ整合の確認（読取りのみ）

承認地点B-0。本番用ターミナルで、`f13_prod_env` の実行後に行う。

### 5.1 適用履歴の確認

```bash
# 履歴の名前だけを出す（接続先や内容は出さない）
psql -X -At -c "select migration_name, finished_at is not null as finished, rolled_back_at is not null as rolled_back from _prisma_migrations order by started_at"
```

リポジトリ側の一覧（`ls prisma/migrations | grep -v migration_lock`）と、名前を突き合わせる。

| 結果 | 判断 |
| --- | --- |
| 本番に `_prisma_migrations` がない | **中止。** Prisma Migrateで管理されていない既存DB。履歴整備（baseline）が必要かを、別に判断する |
| 本番にあり、リポジトリにない migration がある | **中止。** 本番がリポジトリより進んでいる。原因を調べる |
| `finished` が false、または `rolled_back` が true の行がある | **中止。** 失敗した適用が残っている。原因を調べ、解消してから再開する |
| 履歴が、リポジトリの先頭から途中まで一致し、残りが未適用 | 続行。未適用の一覧が、今回の適用対象になる |
| 履歴が飛んでいる（途中が抜けている） | **中止。** 履歴整備の要否を、別に判断する |

```bash
# 公式の状態確認（読取りのみ）。出力の接続先の行は共有しない。
npx dotenv-cli -e .env.prod -- npx prisma migrate status
```

`migrate status` の終了コードが1でも、「未適用がある」場合と「失敗・不一致・管理外」の場合がある。
**終了コードで判断せず、出力の内容を、上の表で判断する。**

### 5.2 本番スキーマとリポジトリの差分（Prismaの範囲）

```bash
# 本番の実スキーマを、schema.prisma へ合わせるために必要なSQLを出す（読取りのみ、書き込まない）
npx dotenv-cli -e .env.prod -- npx prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --script > /tmp/f13-prod-diff.sql
wc -l /tmp/f13-prod-diff.sql
```

（Prisma 7の `--help` で確認した構文。`--from-url` ではなく `--from-config-datasource` を使う。）

- 履歴が整合していれば、この差分は、**未適用のmigrationの内容と一致**する。
  差分に、未適用のmigrationにない変更（既存HPのテーブルの列・型・制約など）が含まれていたら、
  **本番のスキーマが、履歴と食い違っている（drift）**。**中止。**
- 差分のSQLには、スキーマの情報だけが入る（データは入らない）。ファイルはGitへ入れない。

### 5.3 Prismaが見ないオブジェクトの確認

CHECK制約・トリガー・関数・RLS・権限・Storageのポリシーは、`schema.prisma` に出ないため、
5.2では分からない。次の読取りSQLで、本番の状態を控える（名前と件数だけで、データは出ない）。

```bash
# publicのテーブル名の一覧（アプリのテーブルが、すでに本番にあるかの判断に使う。名前のみ）
psql -X -At -c "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"
# RLSが有効なテーブル
psql -X -At -c "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1"
# publicのトリガー（名前のみ）
psql -X -At -c "select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by 1"
# anon・authenticatedに付いている権限の件数
psql -X -At -c "select grantee, count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') group by 1 order by 1"
# storage.objectsのポリシー名
psql -X -At -c "select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' order by 1"
# バケットと公開設定
psql -X -At -c "select id, public from storage.buckets order by 1"
# Cron（定義の文は出さない。文には秘密が含まれ得る）
psql -X -At -c "select jobid, jobname, schedule from cron.job order by jobid"
```

### 5.4 今回のmigrationの内容と、既存HP・同じDBの利用者への影響（人が読む）

適用前に、未適用のmigrationの `migration.sql` を**人が読む**。次は、リポジトリの内容から、文の種類を集計して作った**確認の出発点**であり、
レビューの代わりではない。どのmigrationが適用対象かは、5.1の結果で決まる。

| migration（日付・名前） | 性質 | 確認すること |
| --- | --- | --- |
| 20260529〜20260713（init〜staff） | 既存HPのテーブル・RLS。HPのテーブルへの変更は、`PageContent`・`Staff` への**NULL許容の列の追加**（20260609・20260617・20260713）と、ENUM型名の変更（20260624011222 `SubmissionResult`→`FormSubmissionResult`） | 本番に適用済みのはず。5.1で確認する |
| 20260816221153 `add_club_app_schema` | アプリの新規テーブル群（既存HPのテーブルへのALTERなし） | 追加のみ。HPには影響しない見込み |
| 20260816223753 `enable_rls_for_club_app` | アプリのテーブルのRLS | 追加のみ |
| **20260816224901 `revoke_public_data_api_access`** | **`public` の全テーブルとシーケンスから `anon`・`authenticated` の権限を剥奪し、既定の権限も変更する** | **既存HPのテーブルも対象。** HPが、Supabase Data API（anonキー）で `public` のテーブルを読んでいないことを確認する。コードでは、HPの表のデータ取得は `supabase.from(...)` ではなくPrismaを使っている（検索で確認）。**本番側（他のクライアント・ダッシュボード）は未確認** |
| **20260817003046 `remove_club_images_storage_policies`** | **`storage.objects` の、`club-images` を含むポリシーをすべて削除する** | **既存HPの画像（スタッフ・ページ内容）が使うバケットと同名。** HPは `getPublicUrl` で取得し、アップロードは `@supabase/supabase-js` を使う（キーの種別は要確認）。公開バケットで、アップロードがservice roleなら影響しない見込み。5.3の「ポリシー名」「バケット」の結果で確認する |
| 20260817214524, 20260826034205 | 一意制約・重複排除の追加 | 既存データが制約に違反しないか（重複・NULL）を、予行で確認する |
| **20260926084449 `f01_enforce_club_scope_integrity`** | **トリガー・関数・CHECK制約（556行）。トリガーを `DROP TRIGGER IF EXISTS` で作り直す** | 新規テーブルのみが対象のはず。HPのテーブルに触れないことを読んで確認する |
| 20260927011826, 20261009000000, 20261027000000, 20261031000000 | トリガーの修正、列の追加、CHECK制約の作り直し（`DROP CONSTRAINT`→再作成） | 新規テーブル内。作り直しの間の制約の空白は、適用中の一瞬 |

- 列の削除・テーブルの削除・データの更新（`UPDATE`・`DELETE`）は、**既存HPのテーブルに対しては含まれていない**（文の集計で確認）。
  ただし、集計は文の種類の数であり、対象の表の確認は人が行う。
- 既存HPのテーブルへのALTER（NULL許容の列の追加）は、20260609・20260617・20260713のmigrationで、すでに適用済みのはず（内容を読んで確認した）。

### 5.5 中止条件（B-0）

次のいずれかに当たったら、**以降へ進まず、適用を止める**。既存DBの履歴整備が必要かは、別に判断する。

- 5.1の表で「中止」とした状態（履歴なし・本番が先行・失敗が残る・履歴が飛ぶ）
- 5.2の差分が、未適用のmigrationの内容と一致しない（drift）
- 5.3・5.4で、既存HPが依存するオブジェクト（権限・ポリシー）に、予期しない状態がある
- サーバー版が、手元の `pg_dump` のメジャー版より新しい
- 接続先が、transaction pooler（6543）である

## 6. B-1：手動バックアップの取得

承認地点B-1。本番用ターミナルで、`f13_prod_env` の実行後に行う。作業用のディレクトリを作る。

```bash
F13_BACKUP="$HOME/f13-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$F13_BACKUP" && chmod 700 "$F13_BACKUP"
printf '保管先: %s\n' "$F13_BACKUP"
```

### 6.1 何が、どこに含まれるか

| 保全するもの | `pg_dump` に含まれる | 別に保全する方法 |
| --- | --- | --- |
| **Supabaseの日次バックアップ（管理画面、Pro）** | `pg_dump` とは別の仕組み。DB内のデータを、Supabaseが取得した時刻に保持する | 第4.6節で確認する。**取得時刻を選べず、Storageのファイル本体を含まない（要確認）。手動バックアップの代わりにしない**（migration直前の状態と、別環境での復元確認のため） |
| `public` スキーマ（既存HPと、アプリの全テーブル・列挙型・関数・トリガー・RLS・権限・`_prisma_migrations`） | **含まれる**（6.3の1） | — |
| `auth` スキーマ（Supabase Authのユーザー。`AppUser.id` が、`auth.users` のIDと一致する前提） | データは含める（6.3の2） | Authの設定（下記） |
| `storage` スキーマ（バケット・ファイルのメタデータ行・ポリシー） | 含める（6.3の2・3） | — |
| **Storageのファイル本体**（`club-images`・`club-documents`・`club-app-attachments`） | **含まれない** | 6.4 |
| **LINE資格情報の暗号鍵（`LINE_CREDENTIAL_ENCRYPTION_KEY`）** | 含まれない | **別に保全する。** `ClubLineSetting` の暗号文は、鍵がないと復号できない。鍵は、バックアップのファイルとは別の場所（パスワードマネージャーなど）へ保管する |
| Supabase Authの設定（Site URL・Redirect URL・SMTP・プロバイダー・メールのテンプレート） | 含まれない | ダッシュボードの設定を、画面で控える（スクリーンショットの保管にも個人情報・秘密が写らないよう注意する） |
| Cronの定義（`cron.job`） | `cron` スキーマは対象外 | 名前とスケジュールだけを5.3で控える。**コマンドの文には秘密が含まれ得るので、保存しない**（再作成の手順で別に管理する） |
| Vercelの環境変数 | 含まれない | 変数名と用途の一覧を台帳へ（値は、パスワードマネージャーへ） |
| DBのロール・パスワード、拡張機能の設定 | 含まれない | 復元先の検証用DBでは、拡張機能が必要な場合に、手動で有効にする |
| LINE・Resend側の設定、`WEBSITE_ADMIN_USER_IDS` | 含まれない | 各サービスの設定と、環境変数を控える（G6・G7で確認する） |

### 6.2 取得前の記録

これらは、復元後の突き合わせに使う。**数値と名前だけで、個人情報は出ない。**

```bash
psql -X -At -c "show server_version" > "$F13_BACKUP/server-version.txt"
psql -X -At -F $'\t' -c "
select table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name" > "$F13_BACKUP/counts-before.tsv"
psql -X -At -c "select migration_name, finished_at is not null from _prisma_migrations order by started_at" > "$F13_BACKUP/migrations-before.txt"
psql -X -At -c "select count(*) from auth.users" > "$F13_BACKUP/auth-users-count.txt"
psql -X -At -F $'\t' -c "select bucket_id, count(*), coalesce(sum((metadata->>'size')::bigint),0) from storage.objects group by 1 order by 1" > "$F13_BACKUP/storage-objects-before.tsv"
wc -l "$F13_BACKUP"/*.tsv "$F13_BACKUP"/*.txt
```

### 6.3 DBのバックアップ（`pg_dump`、読取りのみ）

```bash
# 1. public：スキーマ＋データ（既存HPとアプリの全テーブル、_prisma_migrations を含む）
pg_dump --format=custom --no-owner --schema=public --file="$F13_BACKUP/public.dump"
printf 'public.dump 終了コード: %s\n' "$?"

# 2. auth・storage：データのみ（復元先の検証用DBは、スキーマを持っている前提）
pg_dump --format=custom --data-only --no-owner --schema=auth --schema=storage --file="$F13_BACKUP/auth-storage-data.dump"
printf 'auth-storage-data.dump 終了コード: %s\n' "$?"

# 3. 参照用：public・auth・storageのスキーマ定義（権限・ポリシー・トリガーの比較に使う）
pg_dump --schema-only --no-owner --schema=public --schema=auth --schema=storage --file="$F13_BACKUP/schema-reference.sql"
printf 'schema-reference.sql 終了コード: %s\n' "$?"
```

- 終了コードがすべて0であること。0以外なら、原因（バージョン不一致・権限・接続）を調べ、**続けない**。
- `pg_dump` は一貫したスナップショットから取るため、取得中の書込みで内容が壊れることはない。
  ただし、**取得時点より後の書込みは含まれない**。
- `auth` スキーマのデータは、復元先のAuthのスキーマの版と一致しないと戻せないことがある（7.3）。

### 6.4 Storageのファイル本体の取得

ファイル本体は、`pg_dump` に含まれない。3つのバケットを、バケットごとに別の場所へ取得する。

| バケット | 内容 | 公開設定 |
| --- | --- | --- |
| `club-images` | 既存HP（スタッフ画像・ページ内容の画像） | 5.3で確認（`getPublicUrl` の使用から、公開の見込み） |
| `club-documents` | 既存HP（月間練習計画のファイル） | 同上 |
| `club-app-attachments` | アプリ（お知らせ・イベントのPDF添付）。非公開 | 非公開（署名URLで取得） |

取得方法は、実行前に、各ツールの `--help` と公式資料で、構文を確認する（**要確認**）。

- **方法1：** Supabase CLIの `storage` コマンドで、バケットを再帰的にダウンロードする（ログインとプロジェクトの紐付けが必要。実験的な機能の可能性）。
- **方法2：** SupabaseのS3互換エンドポイントと、S3互換のCLIで同期する（S3用のアクセスキーを、ダッシュボードで作る。作成したキーは、取得後に削除する）。
- **方法3：** 件数が少ない場合に、手作業・小さなスクリプトで取得する（その場合は、別の変更として依頼する）。

取得後の確認（バケットごと）：

- ファイル数と合計サイズが、6.2の `storage-objects-before.tsv` と一致する。
- ファイルごとのSHA-256の一覧を作り、保管する（`shasum -a 256`）。後で、壊れていないことを確認できる。
- **非公開バケット（`club-app-attachments`）のファイル名には、個人名が含まれ得る。** 一覧の共有に注意する。
- `club-app-attachments` は、削除ジョブ（`storage-deletions` のCron）で、ファイルが削除され得る。取得中に、削除ジョブが動いていないか（Cronの実行時刻、毎時02分起点）を確認する。

#### Storageのファイル本体の復元（DBの復元とは別に行う）

- **DBを復元しても、Storageのファイル本体は戻らない。** `storage.objects` の行（メタデータ）だけが戻り、
  本体が欠けた状態になり得る。日次バックアップでも、同じである（本体を含まない前提）。
- 復元は、次の順に行う。方法の構文は、実行前に確認する（**要確認**）。
  1. **バケットの存在と設定の確認：** 3つのバケットが存在し、公開・非公開、サイズの上限、許可するファイル形式が、
     バックアップ時の記録（6.3の `schema-reference.sql` と、5.3のバケットの出力）と同じか。違う場合は、先に設定を戻す。
     `club-app-attachments` は非公開のまま保つ（公開にしない）。
  2. **本体を、同じバケット・同じパスへ戻す：** 6.4で取得したファイルから戻す。既存の `storage.objects` の行がある場合の、
     上書き（upsert）の挙動は、**検証用の環境で先に確認する**（本番で初めて試さない）。
  3. **整合の確認：** DBが持つファイルのパス（アプリの添付ファイル、HPの画像・月間練習計画のファイルのパスの列）と、
     バケット内のファイルの存在を、突き合わせる。**欠けているファイルの一覧**を作り、記録する（件数と、どのバケットか）。
- **復元後のCron：** DBを復元すると、古い時点の `StorageDeletionJob`（削除ジョブ）と、LINEの配信行が戻る。
  確認が済むまで、**`storage-deletions` と `club-line-deliveries` のCronを止める**（9.3）。
- この復元の手順は、B-2の検証用の環境で、**ローカルの検証用Storageに対して、一度行う**（本番のStorageへは行わない）。

### 6.5 取得後の確認（B-1の通過条件）

- 6.3の3つの終了コードがすべて0、ファイルが存在し、サイズが0でない。
- `pg_restore --list "$F13_BACKUP/public.dump" | wc -l` が成功する（ファイルが読める）。
- `shasum -a 256 "$F13_BACKUP"/*` を保存した。
- 6.4のStorage本体の件数・サイズが、6.2と一致した。
- 暗号鍵・Authの設定・環境変数の一覧を、別の場所へ控えた。
- 取得の開始時刻・終了時刻を、台帳へ記録した（取得後〜適用までの書込みの範囲を、後で判断する）。

終わったら、本番の接続情報を消す。

```bash
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE PGOPTIONS
```

## 7. B-2：別の検証用DBでの復元確認とリハーサル

承認地点B-2。**検証用ターミナル**で行う。本番の接続情報を、このターミナルへ入れない。

### 7.1 検証用DBの選択

| 選択肢 | 評価 |
| --- | --- |
| **ローカルDockerの使い捨てSupabase（推奨）** | 本番とは完全に分離される。運用書 `mvp-verification.md` の第5章と同じ方法で作る |
| 別のSupabaseプロジェクト | 本番の個人情報を外部サービスへ複製することになる。プランによるプロジェクト数の上限・費用もある。推奨しない |
| 日常の開発用ローカルDB（`.env.local`） | **使わない。** 開発データを上書きする |

- **ローカルDBの `major_version`（専用の `config.toml`）を、本番のサーバー版のメジャー版（`server-version.txt`）に合わせる。**
- 検証用DBのproject IDは、通常のprojectや、F12の専用projectと別にする（例：`f13-restore-<ランダム>`）。
- **本番データを含む検証用DBには、`verify:mvp`・`test:integration`・E2Eを実行しない。** F12の検証は、架空データだけを使う契約である。
- 手元のPCに、本番の個人情報の複製ができる。ディスクの暗号化を確認し、検証後に、検証用DBと復元ファイルを削除する。画面共有・スクリーンショットに注意する。

### 7.2 誤爆防止の確認

復元のコマンドを実行する前に、接続先が**ローカルであること**を確認する。

```bash
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE PGOPTIONS
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
f13_assert_local() {
  case "$PGHOST" in
    127.0.0.1|localhost) ;;
    *) echo "接続先がローカルではありません。中止します。"; return 1 ;;
  esac
}
f13_assert_local && printf '接続先: ローカル(%s:%s)\n' "$PGHOST" "$PGPORT"
```

`pg_restore`・`psql`・リハーサルは、`f13_assert_local &&` でつないで実行する（接続先がローカルでなければ実行されない）。ポートは、専用の `config.toml` の値に合わせる。

### 7.3 復元

```bash
# 1. public：スキーマ＋データ（検証用DBの public が空であること）。接続先がローカルでなければ実行されない
f13_assert_local && pg_restore --no-owner --dbname="$PGDATABASE" "$F13_BACKUP/public.dump" 2> "$F13_BACKUP/restore-public.err"
printf 'public 復元 終了コード: %s / エラー行数: %s\n' "$?" "$(wc -l < "$F13_BACKUP/restore-public.err")"
```

- エラーの**内容は共有しない**（データの一部が含まれ得る）。件数と、種類の分類（拡張機能がない、権限など）だけを記録する。
- 拡張機能（例：`pgcrypto`）が原因なら、検証用DBで有効にしてから再実行する。
- `auth`・`storage` のデータは、検証用DBのスキーマの版と本番の版が違うと、戻せないことがある。
  戻せない場合は、**「取得できていること（`pg_restore --list` と件数）」の確認にとどめる**。
  この場合も、`public` の復元が成功していれば、既存HPのデータと `_prisma_migrations` の確認はできる。

```bash
# 2. auth・storage：データのみ（ベストエフォート。失敗した場合は件数の確認にとどめる）
f13_assert_local && pg_restore --no-owner --data-only --dbname="$PGDATABASE" "$F13_BACKUP/auth-storage-data.dump" 2> "$F13_BACKUP/restore-auth-storage.err"
printf 'auth/storage 復元 終了コード: %s\n' "$?"
```

### 7.4 復元後の確認とリハーサル

**復元の確認（必須）：**

| 確認 | 方法 | 合格 |
| --- | --- | --- |
| 件数 | 6.2と同じSQLを検証用DBで実行し、`counts-before.tsv` と比べる（`diff`） | **全テーブルで一致** |
| migration履歴 | 6.2の `_prisma_migrations` の一覧を、`migrations-before.txt` と比べる | 一致（件数・名前・finished） |
| **既存HPのデータ** | HPのテーブル（`SessionApplication`・`Contact`・`PageContent`・`Notice`・`Faq`・`FormSubmissionLog`・`FormNotificationSetting`・`LoginSubmissionLog`・`MonthlyPracticePlan`・`Staff`・`StaffPageSetting`）の件数が、上と一致している。加えて、公開状態の件数（`PageContent`・`Faq`・`Notice` の公開・下書き）を、本番と検証用DBで比べる | 一致 |
| スキーマ・権限・ポリシー | 検証用DBから `pg_dump --schema-only`（public）を取り、`schema-reference.sql` のpublic部分と比べる | 差分なし（所有者・拡張機能の違いだけ許容） |
| `auth`・`storage` | 戻せた場合は、`auth.users` の件数、バケット別のオブジェクト件数を比べる。戻せなかった場合は、`pg_restore --list` で、含まれていることを確認する | 一致、または理由を記録 |
| Storage本体 | 6.4で取得したファイル数・合計サイズ・SHA-256を、`storage-objects-before.tsv` と比べる | 一致 |
| HP画面の表示（任意） | 検証用DBへ向けたアプリで、公開ページの表示を確認する。**外部送信・本番のSupabase（Auth・Storage）へ接続しない設定にする** | 表示できる |

**リハーサル（必須）：** 検証用DBへ、`migrate deploy` を実行する。リリース対象のcommitの専用コピー
（運用書 `mvp-verification.md` の第4章）で行う。接続先は、**`.env.prod` を使わず、環境変数で指定**する。

```bash
# 専用コピー（.env を持たない）で実行する。.env.prod を読み込まない。接続先がローカルでなければ実行されない
f13_assert_local && {
  cd "$F12_CHECKOUT"
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" ./node_modules/.bin/prisma migrate status --config ./prisma.config.ts
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" ./node_modules/.bin/prisma migrate deploy --config ./prisma.config.ts
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" ./node_modules/.bin/prisma migrate status --config ./prisma.config.ts
}
```

- **確認する点：** 適用が成功する。所要時間（本番での停止時間の目安）。ロックで待たされる文がない。
  適用後の `migrate status` が「最新」。適用後の `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` が空。
- 適用前後で、HPのテーブルの件数が変わらない（6.2のSQL）。
- 適用後の権限・ポリシーが、5.4の想定どおり（`anon`・`authenticated` の権限、`storage.objects` のポリシー）である。
- **適用に失敗したら、本番へ進まない。** 原因を調べ、修正してから、**もう一度、復元からやり直す**。

### 7.5 B-2の合格条件（本番適用へ進む条件）

次の**すべて**を満たすこと。

1. バックアップ（`public.dump`）を、**別環境で復元できた**（7.3、エラー行数と種類の記録）。
2. 7.4の復元の確認が、すべて合格（件数・migration履歴・既存HPのデータ・スキーマ）。
3. リハーサルの `migrate deploy` が成功し、7.4の確認点を満たした。
4. 所要時間と、ロックの有無を記録した。
5. 戻しのSQL（9.5）を作り、検証用DBで動くことを確認した。

## 8. C：本番への適用

承認地点C。**本番用ターミナル**で行う。

### 8.1 適用前の確認（すべて満たすこと）

- [ ] B-0：履歴が整合し、適用対象のmigrationの一覧が確定している
- [ ] B-1：バックアップが完了し、第6.5節を満たしている。**取得時刻を、記録した**
- [ ] 日次バックアップ（2026-11-11の方針）：管理画面で、プラン・直近の取得日時・復元できる期間を確認し、台帳へ記録した（第4.6節）。
  初回の確認結果は第4.7節（利用者の報告）。**適用の直前に、最新の取得日時を、もう一度確認する。**
  **確認できない場合（Freeのまま・取得履歴がない）は、Cへ進まず、Cの承認者が判断する**
- [ ] B-2：第7.5節をすべて満たしている
- [ ] 適用対象の `migration.sql` を、人が読み終えている（5.4）
- [ ] 戻しのSQLと、DB全体の復元の手順を、承認者が確認した
- [ ] 実施の日時・体制・連絡の手段が決まっている。他のデプロイ・書込みが止まっている
- [ ] 実行するリポジトリのcommitが、B-2のリハーサルと同じ（`git rev-parse HEAD` を、台帳と比べる）
- [ ] 接続先が、5.3で確認した本番である（ポートとpoolerの種別。**transaction pooler（6543）でない**）
- [ ] 実行する端末に、他の接続先の `DATABASE_URL` が残っていない
  ```bash
  [ -z "${DATABASE_URL:-}" ] && echo "DATABASE_URL: 未設定(OK)" || echo "DATABASE_URL が設定されています。新しいターミナルで行ってください"
  ls -a | grep -E '^\.env($|\.)' || echo ".env系: なし"
  ```
  （`prisma.config.ts` は `dotenv/config` を読む。`.env` があると、dotenv-cliの値と食い違う可能性がある。）
- [ ] **アプリのデプロイとの順序：** migrationは追加的（新規テーブル・制約）で、既存HPのコードは新しいテーブルを参照しないため、
  **DB（migration）を先に適用し、アプリを後にデプロイ**する。順序をCの承認者が確認する。

### 8.2 適用

```bash
# 1. 直前の再確認（読取り）
npx dotenv-cli -e .env.prod -- npx prisma migrate status
# 2. 適用（書込み）。未適用のmigrationだけを、順に適用する
npx dotenv-cli -e .env.prod -- npx prisma migrate deploy
printf 'migrate deploy 終了コード: %s\n' "$?"
# 3. 適用後の確認（読取り）
npx dotenv-cli -e .env.prod -- npx prisma migrate status
```

- `migrate deploy` は、未適用のmigrationを順に適用する。各migrationは、PostgreSQLのトランザクションで適用される。
  失敗したmigrationは、そのmigration全体が戻り、`_prisma_migrations` に「失敗」の行が残る。**それより前に成功したmigrationは残る。**
- **失敗しても、再実行しない。** 第9章で判断する。
- 出力に、接続先のホスト名が含まれることがある。**共有しない。** 終了コードと、migrationの名前だけを記録する。

### 8.3 適用直後の確認（読取り）

承認地点Cの範囲。`f13_prod_env` を実行して行う。

- `migrate status` が「最新」。
- 6.2と同じSQLで、**既存HPのテーブルの件数が、取得前から変わっていない**（適用の間に、HPへの申込みがあった場合は、その増加分だけ）。
- 5.3のSQLで、RLS・トリガー・権限・ポリシーが、5.4の想定どおり。
- 既存HPの公開ページが表示され、管理画面へログインできる。`WEBSITE_ADMIN_USER_IDS` は有効なまま（DB方式の認可へ切り替えない）。
- **`club-images` のポリシー削除（20260817003046）の影響の確認：** HPの公開ページで、スタッフ画像・ページ内容の画像が表示される。
  管理画面から、画像のアップロード・差替え・削除ができる（これらは、`SERVICE_ROLE_KEY` のサーバー側の処理で、ポリシーに依存しない見込み）。
  月間練習計画のPDF（`club-documents`）の表示・アップロードも確認する。**テストのデータを使い、実データを壊さない。**

### 8.4 事後

- 適用結果を、第10章の項目で台帳へ記録する。
- 安定確認（G9）が済むまで、バックアップを保持する。
- 続く作業：初期化（G5）、Cron・Storage・Resendの確認（G6）、smoke test（G7）。

## 9. 中止と戻し方

### 9.1 中止条件（適用の前後）

| 時点 | 中止する条件 | 対処 |
| --- | --- | --- |
| B-0 | 第5.5節 | 適用しない。履歴整備の要否を、別に判断する |
| B-1 | `pg_dump` の失敗、ファイルが読めない、Storage本体の件数・サイズの不一致、暗号鍵を控えていない | 取得し直す。原因が解決するまで、Cへ進まない |
| B-2 | 復元できない、件数・履歴・既存HPのデータの不一致、リハーサルの失敗 | 原因を調べて直し、復元からやり直す。**本番へ進まない** |
| C直前 | バックアップの取得後に、HPの書込みが多い／承認者が許容しない、5.3の本番の状態が変わった、他のデプロイが入った | 再取得、または延期 |
| C実行中 | `migrate deploy` が失敗、予想外に長い（リハーサルの所要時間の数倍）、HPで異常（エラー・申込みの失敗）を検知 | 中断する前に、状況を記録する。9.2へ |
| C直後 | 8.3の確認に不合格 | 9.2へ |

### 9.2 状況別の戻し方

Prisma Migrateには、`down`（戻し）がない。適用済みのmigration.sqlは編集しない。戻しは、次のいずれかで行う。

| 状況 | 方針 | 注意 |
| --- | --- | --- |
| **`migrate deploy` が途中で失敗した** | 失敗したmigrationは、全体が戻っている（トランザクション）。何も適用されていないことを確認したうえで、`prisma migrate resolve --rolled-back <migration名>` で、履歴の「失敗」の記録を整理する。原因を直し、リハーサルからやり直す | `resolve` は、履歴の記録だけを変える（スキーマは変えない）。**実際にスキーマに何も残っていないことを、先に確認する。** 成功済みの前段のmigrationは残る |
| 適用は成功したが、**既存HPに影響**（権限・ポリシー） | 影響したmigrationだけを戻す**個別の戻しSQL**を、本番に実行する（9.5）。承認者の確認を得る | 例：`GRANT` の再付与、`CREATE POLICY` の再作成。バックアップの `schema-reference.sql` から、元の定義を取り出す |
| 適用は成功したが、**アプリの不具合** | アプリを、前のデプロイへ戻す（Vercelのロールバック） | migrationは追加的なため、前のアプリと互換の見込み。DBは戻さない |
| 新しいテーブルに**まだデータが入っていない**（公開前）。かつ、新しいテーブルを戻したい | 個別の戻しSQL（新規テーブルの削除など）で戻せる | 既存HPのテーブルには触れない |
| 新しいテーブルに**データが入った後**（公開後） | **前方修正（新しいmigrationを追加）を優先する** | 削除すると、そのデータが失われる |
| データの破損・広い範囲の不具合 | **DB全体の復元（最終手段、9.3）** | 9.3の影響を、承認者が承知する |

### 9.3 DB全体の復元（最終手段）

**DB全体を復元すると、次の影響がある。承認者は、これを承知したうえで判断する。**

- **同じDBを使う、既存HPと、他のテナント（今後）にも影響する。** 復元の間、HPと、アプリのすべてが止まる。
- **バックアップ取得後の書込みが、すべて失われる。** HPのフォーム申込み、管理画面の編集、アプリの全操作、Authのユーザー登録、Storageのアップロード、LINE配信の履歴。
- **PITR（時点復元）は導入しない（2026-11-11の方針）。** 戻せる時点は、**日次バックアップの時点**と、**手動バックアップの時点**だけで、
  それ以外の時点には戻せない。日次バックアップの復元は、取得時刻を選べない。
- **Auth・Storageとの不整合：** DBを戻しても、Authの実体やStorageのファイル本体は戻らない。DBにだけある記録（`AppUser` など）と、Auth・Storageが食い違う。
  Storageのファイル本体の復元は、6.4の手順で別に行う。
- **復元直後のCron（重複・誤削除の防止）：** 復元で、バックアップ時点の配信行・削除ジョブに戻る。**復元の後、確認が済むまで、
  `club-line-deliveries`（LINE配信）と `storage-deletions`（Storage削除）のCronを止める。** 止めないと、復元時点より後に
  送信済みの配信が `PENDING` に戻って再送される（重複送信）、すでに処理した削除ジョブが再実行される、おそれがある。
  再開は、配信行・削除ジョブの状態を確認してから行う。
- **復元の方法は2つで、どちらも影響が大きい：**
  1. **同じプロジェクトへ上書きして復元：** 破壊的。失敗すると、現在のデータと、バックアップの両方を失い得る。**実行の直前に、現状を、もう一度 `pg_dump` で保存する。**
  2. **新しいプロジェクトへ復元し、接続先を切り替える：** Vercelの環境変数（DB・Supabaseの接続情報とキー）、Authの設定（Site URL・SMTP）、Storage、LINE Webhook、Cronなど、すべてを新しいプロジェクトへ向ける。Authのキーが変わるため、既存のセッションが無効になる。工数が大きい。

復元の手順は、判断した時点で、別に作る（本書の範囲外）。必ず、先に、現状のバックアップを取る。

### 9.4 戻すか、前に進むかの判断

- 戻す前に、**何が、いつから、誰に影響しているか**を記録する。
- 個別の戻し・前方修正で直せるなら、DB全体の復元を選ばない。
- 判断者は、Cの承認者とする。判断の理由と時刻を、台帳へ記録する。

### 9.5 戻しSQLの準備（適用へ進む条件）

適用の前に、migrationごとに戻しのSQLを用意し、**B-2の検証用DBで、適用→戻し→確認**を行う。

| migrationの種類 | 戻しの方針 |
| --- | --- |
| 新規テーブル・列・制約の追加 | `DROP TABLE` / `DROP CONSTRAINT` など。**データが入った後は、失われる**（9.2） |
| 権限の剥奪（`REVOKE`） | 剥奪前の権限を、`schema-reference.sql` から取り出して `GRANT` する |
| ポリシーの削除（`DROP POLICY`） | 削除前の定義を、`schema-reference.sql` から取り出して `CREATE POLICY` する |
| トリガー・関数の作り直し | 削除前の定義を、バックアップから戻す |
| ENUMへの値の追加 | PostgreSQLでは、値を削除できない。**戻せない。** 前方修正で扱う |

**20260817003046（`club-images` のStorageポリシーの削除）の戻しの材料**（B-0で確認した、本番の4件の定義。適用前に、取得した `schema-reference.sql` と照合して確定する）：

```sql
CREATE POLICY "Allow public read access to all users dipc33_0" ON storage.objects FOR SELECT TO public USING (bucket_id = 'club-images');
CREATE POLICY "Give users authenticated access to folder dipc33_0" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'club-images');
CREATE POLICY "Give users authenticated access to update dipc33_0" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'club-images');
CREATE POLICY "Give users authenticated access to update dipc33_1" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'club-images');
```

（本番の `pg_policies` の表示から起こしたもの。`roles` と条件式は報告のとおり。ポリシーが許可型（PERMISSIVE）かは、`schema-reference.sql` で確認する。**この戻しSQLは、検証用DBで動くことを確認してから使う。**）

**20260816224901（権限の剥奪）の戻しの材料：** 本番では、`anon`・`authenticated` に、`public` の12テーブルへの `REFERENCES`・`TRIGGER`・`TRUNCATE` だけが付いていた（B-0）。
戻す場合も、これを `GRANT` するだけでよい。ただし、**戻す必要は、通常ない**（これらの権限は、HPの動作に使われていない）。

- 戻しSQLは、リポジトリのmigrationには入れない（適用済みmigrationの編集を避ける）。レビュー用の別ファイルとして保管する。
- 戻しSQLに、本番の接続情報・データを書かない。

### 9.6 公開判断の注意事項

次は、公開（MVP 1.0の公開、クラブが実際に使い始めること）の判断者が、承知しておく事項である。

1. **バックアップ時点より後のDBへの書込みは、復元で失われる可能性がある。** 公開後は、クラブの利用（お知らせ・イベント・出欠・LINE配信・
   問い合わせ・Authのユーザー登録）が、すべて対象になる。公開前より、失われる範囲が広い。
2. **PITRは導入しない。** 復元できる時点は、日次バックアップ（取得時刻を選べない）と、手動バックアップ（migration直前など、自分で取った時点）だけ。
   復元できる時点の間隔は、粗い。
3. **日次バックアップも、手動バックアップ（DB）も、Storageのファイル本体を含まない。** 添付ファイル・画像は、第6.4節で、別に保全する。
   本体の保全が無い状態で公開しない。
4. **公開後にmigrationを適用すると、書込み損失の影響が大きい。** 可能な限り、公開前に、今回のmigrationの適用と確認を済ませる。
   公開後のmigrationは、毎回、直前の手動バックアップと、別環境での復元確認を省略しない。
5. **公開の前に、次が済んでいること：** 日次バックアップの確認（4.6）、手動バックアップと別環境での復元確認（B-1・B-2）、
   Storage本体の保全と復元手順の確認（6.4）、LINE資格情報の暗号鍵の保全（6.1）。
6. DB全体の復元は、既存HPと、同じDBを使うすべてのテナントを、一時的に止める。復元の判断者は、これを承知する（9.3）。

## 10. 台帳へ記録する項目

記録先は、運用書 `mvp-verification.md` の第12節と同じ形式（件数・revision・終了コード）。
**URL・資格情報・個人情報・生のログ・バックアップの中身は、記録しない。**

| 項目 | 記録する内容 |
| --- | --- |
| 承認 | B-0・B-1・B-2・C の各承認の日時・承認者 |
| 対象 | リリースのcommit、適用対象のmigration名、サーバー版、`pg_dump` の版 |
| B-0 | `migrate status` の結果の種類（表5.1）、差分の有無（5.2）、中止条件の有無 |
| 日次バックアップ（4.6） | 確認の日時・確認者、プラン、最新の取得日時、復元できる期間、PITRの有無、ダウンロードの可否、復元の仕様の要点 |
| B-1 | 取得の開始・終了時刻、ファイル名・サイズ・SHA-256、Storage本体の件数・サイズ、暗号鍵・設定の保全の有無 |
| B-2 | 復元の終了コードとエラー行数、7.4の各確認の結果、リハーサルの所要時間と結果 |
| 戻しSQL | 作成の有無と、検証用DBでの確認結果 |
| C | 適用の日時・実施者・終了コード、適用後の確認（8.3）の結果 |
| 後始末 | 検証用DB・復元ファイルの削除日、バックアップの保持期限 |

## 11. 要判断・未確認

1. **既存の本番DBの履歴の有無**（B-0で確認。履歴がない・整合しない場合は、履歴整備を別に設計する）
2. 本番の `DATABASE_URL` が指す接続先の種別（直接接続／session pooler／transaction pooler）
3. 本番のサーバー版と、手元の `pg_dump` の版
4. Storage本体の取得方法（方法1〜3のどれを使うか）と、その構文（実行前に確認）
5. 既存HPが、Supabase Data API（anonキー）で `public` のテーブルを読んでいないか、`club-images` のStorageのポリシーに依存していないか
   （コードでは、Prismaで取得し、`getPublicUrl` を使っている。本番側は未確認）
6. `auth`・`storage` のデータを、検証用DBへ復元できるか（スキーマの版の差。できない場合の確認の範囲）
7. DB全体の復元の詳細な手順（9.3）。判断した時点で別に作る
8. 実施日時・体制・承認者
9. ~~Supabase Proへのプラン変更~~ **実施済み**（利用者が、組織をProへ変更し、管理画面で一覧を確認したと報告。2026-11-11、第4.7節）。承認の記録は、利用者側
10. 日次バックアップの**保持日数**（一覧は7件。断定しない）、**復元の仕様**（上書きか、ダウンタイムの長さ）、**ダウンロードの可否**、PITRが画面で無効であること（4.6・4.7。管理画面と公式資料で確認する）
11. Storage本体の復元の方法と、既存のオブジェクト行がある場合の上書きの挙動（6.4。検証用の環境で先に確認する）
12. 日次バックアップの確認を、適用（C）の必須条件とすること（8.1に、2026-11-11の方針として入れた。外す・緩める場合は、利用者の判断）

## 12. 実施記録

実施するたびに、該当の行を埋める。**URL・資格情報・個人情報・生のログ・接続先のホスト名は、記録しない。**
結果の欄が空の行は、**未実施**である（空欄を「問題なし」と読まない）。

| 地点 | 承認 | 実施者 | 実施日時 | 結果 |
| --- | --- | --- | --- | --- |
| B-0（読取り確認） | 2026-11-11、利用者（右田和也）が承認 | 右田和也 | 2026-11-11〜12（利用者が実行し、出力を報告） | **実施済み・通過**（履歴は整合、中止条件なし、追加確認2点も完了。第12.1・12.2節）。残る注意は、第12.2節の「残るリスク」 |
| B-1（手動バックアップ） | 未 | — | — | 未実施 |
| B-2（復元確認・リハーサル） | 未 | — | — | 未実施 |
| C（本番適用） | 未 | — | — | 未実施 |

### 12.1 B-0の実施結果（利用者が実行・報告）

**これは、利用者が本番に対して実行し、報告した出力の記録である。** Claudeは、本番へ接続しておらず、出力を読んで解釈した。
接続先のホスト名・URL・資格情報・データは、報告されていない（記録しない）。

| 項目 | 結果 |
| --- | --- |
| 道具 | `psql` 18.6・`pg_dump` 18.6（Homebrewの `libpq` を導入）。本番のサーバー版は **17.6**。`pg_dump` のメジャー版が、サーバー以上である |
| 接続 | ポート **5432**、**poolerを含まない**（transaction poolerではない）。`PGOPTIONS` で読取り専用にして接続できた。実行したのはSELECTと `migrate status`・`migrate diff` のみ |
| 適用履歴 | `_prisma_migrations` は**15行**。すべて `finished`、`rolled_back` なし。**本番にあってリポジトリにないmigrationはない**。失敗・ロールバックの行はない |
| 未適用 | **11件**：`20260816221153_add_club_app_schema` 〜 `20261031000000_f11_event_practice_batch`（第5.4節の、アプリ側のmigration）。先頭の15件（`20260529012549_init` 〜 `20260713001709_add_external_role_to_staff`）が適用済みで、**履歴は連続している**。第5.1節の「先頭から途中まで一致し、残りが未適用」に該当する |
| `migrate status` | 26件を検出し、未適用の11件を表示。失敗・不整合の表示はない |
| `migrate diff`（Prismaの範囲） | 終了コード0、800行。**報告された範囲（上位60行）は、`CREATE TABLE`・`CREATE TYPE`・`CREATE UNIQUE INDEX` のみ**（アプリのテーブル・型・一意制約）。**全体（既存HPのテーブルへの `ALTER`・`DROP` の有無）は、未確認** |
| 本番の `public` | 既存HPの11テーブルと `_prisma_migrations` のみ。**アプリのテーブルは、まだない**（未適用の11件と整合する） |
| RLS | 上の12テーブルすべてで有効 |
| トリガー | `public` にトリガーはない |
| 権限 | `anon` に36件、`authenticated` に36件（`public` のテーブルへの権限）。第5.4節の `revoke_public_data_api_access` で剥奪される予定 |
| `storage.objects` のポリシー | 4件（名前と操作のみ確認）：`Allow public read access to all users dipc33_0`（SELECT）、`Give users authenticated access to folder dipc33_0`（INSERT）、`Give users authenticated access to update dipc33_0`（UPDATE）、`Give users authenticated access to update dipc33_1`（SELECT）。**定義（対象のバケット）は、未確認**。第5.4節の `remove_club_images_storage_policies` が、`club-images` を含むものを削除する |
| バケット | `club-app-attachments`（非公開）、`club-documents`（公開）、`club-images`（公開） |
| Cron | 2件：`club-line-deliveries-every-5-minutes`（`*/5 * * * *`）、`storage-deletions-every-5-minutes`（`2-59/5 * * * *`）。登録済み |

**Claudeがコードで確認したこと：** 既存HPの3つのStorageのモジュール（スタッフ画像・ページ内容の画像・月間練習計画）は、
すべて `SUPABASE_SERVICE_ROLE_KEY` を使うサーバー専用で、Storageのポリシーに依存しない見込み。ブラウザ側のStorage使用は、検索で見つからなかった。
**本番の他のクライアント（外部のアプリ・ダッシュボードなど）の依存は、未確認。**

**判定：** 第5.5節の中止条件には、**当てはまらない**（履歴なし・本番が先行・失敗が残る・履歴が飛ぶ・接続先が6543、のいずれでもない。
サーバー版と `pg_dump` の版も問題ない）。**ただし、次の追加確認2点が済むまで、B-0を「通過」としない**（→ 追加確認は完了。第12.2節）。

1. `migrate diff` の全体の確認：既存HPのテーブルへの `ALTER`・`DROP` が、含まれていないこと
2. `storage.objects` のポリシーの定義（どのバケットを対象にしているか）と、`public` のRLSのポリシーの有無

**参考（Cron）：** Cronのジョブは、本番にすでに登録されている。アプリのテーブルが本番にない間（migration適用前）に、
Cronが呼ぶエンドポイントを含むアプリがデプロイされていると、エラーになり得る。第8.1節の「DBを先に適用し、アプリを後にデプロイ」を守る。
Cronの認証付きの正常実行の確認は、G6で行う。

### 12.2 B-0の追加確認の結果と判定（利用者が実行・報告）

**利用者が本番に対して実行し、報告した出力の記録である。** Claudeは、出力を読んで解釈した。

| 確認 | 結果 | 判断 |
| --- | --- | --- |
| `migrate diff`（全体） | 終了コード0、800行。`CREATE TABLE` 22、`CREATE TYPE` 13、`CREATE INDEX` 51、`CREATE UNIQUE INDEX` 31、`ALTER TABLE` 46。**`DROP` は0件。既存HPの11テーブルへの `ALTER` は「なし」** | 差分は、**アプリの新規オブジェクトだけ**。`schema.prisma` のアプリのモデル22個、列挙型13個と一致する。既存HPのテーブルへの変更・drift は、ない |
| `CREATE TABLE` の一覧 | `AppUser`・`Child`・`ChildClubMembership`・`Club`・`ClubEmailSetting`・`ClubEvent`・`ClubEventAttachment`・`ClubEventBatchOperation`・`ClubEventMemo`・`ClubEventRead`・`ClubInvitation`・`ClubLineDelivery`・`ClubLineRegistrationToken`・`ClubLineSetting`・`ClubLineTarget`・`ClubMembership`・`ClubNotice`・`ClubNoticeAttachment`・`ClubNoticeRead`・`PlatformAdmin`・`StorageDeletionJob`・`SupportReport`（22個） | すべてアプリのテーブル |
| `storage.objects` のポリシーの定義 | 4件**すべて `bucket_id = 'club-images'` が対象**：公開の読取り（SELECT、`public`）、認証ユーザーの INSERT・UPDATE・SELECT（`authenticated`） | 20260817003046 は、この4件を**すべて削除する**（条件に `club-images` を含む） |
| `public` のRLSのポリシー | **なし**（RLSは全テーブルで有効） | 既存HPのテーブルは、`anon`・`authenticated` から、すでに行へアクセスできない |
| `anon`・`authenticated` の権限 | 各ロールで `REFERENCES`・`TRIGGER`・`TRUNCATE` が12件ずつ（計36件）。**`SELECT`・`INSERT`・`UPDATE`・`DELETE` の権限は、すでにない** | 20260816224901 が剥奪するのは、この3種類だけで、既存HPの動作（Prisma経由）には影響しない見込み |
| バケット | `club-app-attachments`：非公開、サイズ上限 3,145,728 バイト（3 MiB）、許可は `application/pdf` のみ。`club-documents`・`club-images`：公開、サイズ上限・許可形式の指定なし | G6の材料（下記） |

**判定：B-0は通過。** 第5.5節の中止条件に当たらず、第12.1節の追加確認2点も、問題がなかった。

**第5.4節の確認事項への回答：**

- 20260816224901（権限の剥奪）：既存HPのテーブルには、すでにDMLの権限も、RLSのポリシーもない。**HPの動作（Prisma経由）への影響は、ない見込み。**
- 20260817003046（Storageのポリシーの削除）：削除されるのは、`club-images` を対象にした4件。
  - **公開の読取り**は、バケットが公開（`public = true`）で、HPが `getPublicUrl` の公開URLを使うため、ポリシーなしでも動く見込み。
  - **認証ユーザーの INSERT・UPDATE・SELECT** は、HPの3つのStorageのモジュールが `SUPABASE_SERVICE_ROLE_KEY` のサーバー専用で、ポリシーに依存しない見込み（コードで確認）。
  - **適用後に、実際に確認する**（第8.3節）。

**残るリスク（未確認）：**

- 本番の**他のクライアント**（外部のアプリ・スクリプト・ダッシュボードなど）が、`club-images` の認証ユーザーのポリシー、または `public` のData APIを使っていないか。コードと、B-0の読取りでは、確認できない。適用後の確認（HPの画像表示・管理画面のアップロード）で補う。
- アプリのテーブルは、まだ本番にない。Cron（`club-line-deliveries`・`storage-deletions`）は、すでに登録されている。適用前後の挙動は、G6で確認する。

**G6への引き継ぎ（Storage制限の観測、B-0）：**

- `club-app-attachments` は、**すでに本番に存在**し、非公開・3 MiB・PDFのみ。アプリのPDF検証は「合計3MBまで」（`pdf-file-validation.ts`）で、バケットの上限と整合して見える（MBとMiBの単位の違いは、G6で確認する）。
- `club-images`・`club-documents` は、サイズ上限・許可形式が未設定。HPのコードの上限は、スタッフ画像・ページ画像が5MiB、月間練習計画のPDFが10MiB。バケット側の制限を設定するかは、G6で判断する（HPの既存の動作を変えない範囲で）。

次は、B-1（手動バックアップの取得）の承認の判断である。

### 12.3 B-1の事前確認結果（利用者の報告、2026-11-12）

**B-1の実行は、まだ承認されていない。** 本節は、利用者が報告した事前確認の記録である。Claudeは、本番へ接続しておらず、
鍵の生成・本番設定の変更・バックアップの取得・復元を行っていない。以下は、利用者の報告であり、Claudeが検証した結果ではない。

**保管先（方針）**

- MacのFileVaultは有効（利用者の報告）。
- 保管先は、Git管理外・クラウド同期対象外の `~/f13-backups/<実施日時>/`。ディレクトリの権限は700にする方針（未作成）。

**本番Storage（利用者がSQL Editorで確認）**

| バケット | 件数 | 合計サイズ |
| --- | --- | --- |
| `club-documents` | 5件 | 246,213バイト |
| `club-images` | 10件 | 10,487,033バイト |
| `club-app-attachments` | 0件（バケットあり） | 0バイト |

- `club-app-attachments` の確認日時は 2026-11-12 09:19:52.489743 JST。**件数の確認日時であり、バックアップの取得日時ではない。**
- 件数が少ないため、第6.4節の**方法3（手動ダウンロード）**を採用する方針。実施直前に件数を再確認し、バケット名と元のフォルダ階層を保持する。
  取得後に、バケット別の件数と合計サイズを照合する。`club-app-attachments` は、実施時点でも0件なら、本体の取得は不要。
- 注意：`club-images` の本体は約10MBで、HPの公開画像。個人情報（顔写真など）を含み得るため、保管先の扱いは同じにする。

**暗号鍵・環境変数の保全（項目ごと）**

| 項目 | 状況 |
| --- | --- |
| LINE暗号鍵（ローカル・Vercel Preview） | 同じ鍵を使用。Macの「パスワード」アプリに保全済み（利用者の報告） |
| LINE暗号鍵（本番、`.env.prod`） | **空欄。未設定・未保全として扱う。** VercelのProduction設定と、既存の暗号化済みデータの有無を確認してから、本番用の鍵を用意する方針。**鍵は、まだ生成していない** |
| その他の本番環境変数・秘密値 | **項目ごとに確認する。この報告だけで、保全済みとは記録しない。** 保管先はパスワードマネージャー（値は共有しない） |

- 補足：本番DBに `ClubLineSetting` はまだない（B-0：アプリのテーブルは未適用）。したがって、現時点で、復号できない暗号文は存在しない。
  本番用の鍵は、G5（本番初期化）でLINE設定を暗号化して保存する**前**に決め、保全する必要がある。鍵を失う・取り違えると、保存済みの暗号文は復号できない。
  ローカル・Previewと本番で同じ鍵を使い回すかは、利用者が判断する（第6.1節の方針：鍵はバックアップとは別の場所に保管）。

**本番Supabase Authの設定（利用者が画面で確認、2026-11-12）**

| 項目 | 確認結果 |
| --- | --- |
| Site URL | `http://localhost:3000` |
| Redirect URLs | 登録なし |
| 認証プロバイダー | Emailのみ有効。Third-Party Authの登録なし |
| 新規ユーザー登録・メール確認 | ともにオン |
| 認証メールテンプレート | 6件の件名と本文を画面で確認済み |
| カスタムSMTP | オフ |
| セキュリティ通知メール | すべてオフ |

- テンプレートは**画面で確認したもので、復元用の控えを保存済みとは記録しない。** 必要な設定の控えは、非公開の運用メモに保管する（未保存）。
- Auth設定は、変更していない。
- **気づき（要判断）：** 本番のSite URLが `http://localhost:3000` で、Redirect URLsが未登録。招待メール・パスワード再設定のリンクの宛先に影響し得る。
  本番ドメイン・招待・パスワード再設定への影響確認は、**G6/G7に残す**（今回は変更しない）。

**実施日時と承認**

- 実施日時は**未定**。リハーサル用を先に取得し、**本番migration直前に改めて取得する**方針。
- 利用者が、取得対象・保管先・手順・取得後の照合方法を確認したうえで、**実施日時と実施者を明記して、それぞれ承認する**（B-1、B-2、C）。

**B-1の承認前に残る事項**

- [ ] 保管先ディレクトリの作成（権限700。クラウド同期の対象外であること）
- [ ] 実施直前のStorage件数・サイズの再確認（`club-documents`・`club-images`・`club-app-attachments`）
- [ ] 本番用LINE暗号鍵の扱いの決定（B-1のバックアップの前提ではないが、G5の前に必要）
- [ ] その他の本番環境変数・秘密値の保全状況（項目ごと）
- [ ] Authの設定の控え（非公開の運用メモ）
- [ ] 実施日時と実施者の明記（B-1の承認時）
