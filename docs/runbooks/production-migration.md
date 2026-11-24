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

**【追加：2026-11-13】 権限剥奪（20260816224901）と `club-images` のポリシー削除（20260817003046）の影響の整理**

11本のmigration（20260816221153〜20261031000000）を読んだ。HPの10テーブル（`Contact`・`Faq`・`FormSubmissionLog`・`LoginSubmissionLog`・
`MonthlyPracticePlan`・`Notice`・`PageContent`・`SessionApplication`・`Staff`・`StaffPageSetting`）の名前は、どのmigrationにも出てこない。
`DROP TABLE`・`TRUNCATE`・`DELETE`・`UPDATE`・`INSERT`・`CREATE EXTENSION` は、この2本以外に含まれない。
`ALTER TYPE ... ADD VALUE`（20260817214524）は取り消せないが、対象のENUMは20260816221153で新設されるため、全体を戻す場合は `DROP TYPE` で消せる（B-2で確認）。

| | 権限剥奪（20260816224901） | ポリシー削除（20260817003046） |
| --- | --- | --- |
| 影響し得るHPの操作 | なし（コード・本番の状態・ログから） | スタッフ画像・ページ内容の画像の表示・保存・削除は、見込みでは影響なし |
| 根拠1：コード | データ取得・更新はPrismaのみ。`supabase.from(...)`・`.rpc(...)` は、`app`・`lib`・`src`・`components`・`proxy.ts` のどこにもない。anonキーのクライアントは、Auth用のみ | 保存・削除は `SUPABASE_SERVICE_ROLE_KEY` のクライアント（RLSをバイパス）。表示は `getPublicUrl`。`list`・`createSignedUrl`・`move`・`copy` の呼び出しは、`club-images` にない |
| 根拠2：デプロイ済みコード | 本番のVercelのデプロイは、`main` のコミット `8e70038`（利用者の報告、デプロイ作成日時 2026-09-27 09:22:05 JST）。そのコミットの `lib/storage` の3ファイルは、Service Roleを使い、anonキーは使わない。現在のHEADと内容が同じ（差分0）。ブラウザ側クライアントは `client.ts` のみで、Auth用。そのコミットのmigrationは15本で、本番の適用済み15件と一致 | 同左 |
| 根拠3：本番の状態 | B-0：`anon`・`authenticated` に付いていたのは `REFERENCES`・`TRIGGER`・`TRUNCATE`（PG17では `MAINTAIN`）のみ。`SELECT`・`INSERT`・`UPDATE`・`DELETE` はなく、Data APIでHPのテーブルを読み書きできない状態。剥奪しても、読み書きの能力は変わらない | `club-images` は公開バケット（`public = true`、利用者が確認、2026-11-13）。公開バケットの公開URLは、ポリシーなしで配信される |
| 根拠4：ログ | 本番のSupabase Logs（API Gateway → Postgrest）、2026-11-06 11:22〜11-13 11:22（画面表示）。フィルター後13件のうち、`/rest/v1/` のパスは0件（利用者の報告） | — |
| B-2の結果 | 適用後、`anon`・`authenticated` の権限0件 | ポリシー4件→0件 |
| 未確認 | 下記 | 下記 |

未確認：（1）ログは、指定期間・フィルターの範囲のみ。GraphQL（`/graphql/v1`）と、7日より前は未確認。
（2）Prismaの接続ロール。直接接続（5432）であることはB-1で確認済み。ロール名は、C直前の読取りで `select current_user` を1回実行して確認する（承認後）。
SQL Editorの `current_user` は、Prismaの接続ロールを示さない。（3）シーケンスの既定権限の、本番の適用前の状態（第11節の15）。
（4）`DROP POLICY` の実行権限（第11節の13）。失敗した場合は、そのmigration全体が戻る。（5）適用後の画像の表示は8.3で、保存・削除は8.3.1（別の承認⑥）で確認する。

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
# 【追加：2026-11-13、B-1の実績を取り込み】Storageのパスとサイズの一覧（6.4・6.5のパス単位の突き合わせに使う）
psql -X -At -F $'\t' -c "select bucket_id, name, coalesce(metadata->>'size','') from storage.objects order by bucket_id, name" > "$F13_BACKUP/storage-list-before.tsv"
chmod 600 "$F13_BACKUP/storage-list-before.tsv"
wc -l "$F13_BACKUP"/*.tsv "$F13_BACKUP"/*.txt
```

- **`storage-list-before.tsv` には、ファイルのパス（個人名が含まれ得る）が入る。** 保管先から出さず、チャットにも台帳にも貼らない。件数と差の数だけを共有する。
- 取得の直前に、Storageの件数を再集計する（`storage-objects-before.tsv`）。直前の値と、事前の報告がずれていれば、原因を確認してから進める。

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
- **方法3：** 件数が少ない場合に、手作業・小さなスクリプトで取得する（B-1では、件数が少ない15ファイルだったため、この方法で手動ダウンロードした）。
  手動ダウンロードの場合は、`$F13_BACKUP/storage/<バケット名>/` の下に、バケット内と同じ相対パスで置く。

取得後の確認（バケットごと）：

- ファイル数と合計サイズが、6.2の `storage-objects-before.tsv` と一致する。
- ファイルごとのSHA-256の一覧を作り、保管する（`shasum -a 256`）。後で、壊れていないことを確認できる。
- **非公開バケット（`club-app-attachments`）のファイル名には、個人名が含まれ得る。** 一覧の共有に注意する。
- `club-app-attachments` は、削除ジョブ（`storage-deletions` のCron）で、ファイルが削除され得る。取得中に、削除ジョブが動いていないか（Cronの実行時刻、毎時02分起点）を確認する。
- **【追加：2026-11-13、B-1の実績を取り込み】余分なファイルがないこと：** `.DS_Store` や、未完了のダウンロード（`.crdownload`・`.download` など）が混ざっていない。

```bash
find "$F13_BACKUP/storage" \( -name '.DS_Store' -o -name '*.crdownload' -o -name '*.download' -o -name '*.part' \) | wc -l
```

  期待は `0`。
- **【追加：2026-11-13、B-1の実績を取り込み】パス単位の突き合わせ（NFC正規化つき）：** macOSは、日本語のファイル名を分解形（NFD）で保存することがある。
バケット内のパスは結合形（NFC）で記録されているため、**両方をNFCに揃えて**から、`storage-list-before.tsv` と比べる。件数・サイズ・欠け・余りの数だけを出す。

```bash
env -i PATH="$PATH" HOME="$HOME" F13_BACKUP="$F13_BACKUP" node --input-type=module <<'JS'
import { readdir, readFile, stat } from "node:fs/promises";
import { join, sep } from "node:path";

const backup = process.env.F13_BACKUP;
const buckets = ["club-documents", "club-images", "club-app-attachments"];
const norm = (value) => value.normalize("NFC");

async function walk(dir, base = "") {
  const entries = await readdir(join(dir, base), { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const rel = base ? join(base, entry.name) : entry.name;
    if (entry.isDirectory()) found.push(...(await walk(dir, rel)));
    else found.push(rel);
  }
  return found;
}

const text = await readFile(join(backup, "storage-list-before.tsv"), "utf8");
const expected = new Map();
for (const line of text.split("\n").filter(Boolean)) {
  const [bucket, name, size] = line.split("\t");
  expected.set(`${bucket}/${norm(name)}`, Number(size));
}

const actual = new Map();
for (const bucket of buckets) {
  let files = [];
  try {
    files = await walk(join(backup, "storage", bucket));
  } catch {
    files = [];
  }
  for (const rel of files) {
    const full = join(backup, "storage", bucket, rel);
    actual.set(`${bucket}/${norm(rel.split(sep).join("/"))}`, (await stat(full)).size);
  }
}

let missing = 0;
let sizeDiff = 0;
for (const [key, size] of expected) {
  if (!actual.has(key)) missing += 1;
  else if (actual.get(key) !== size) sizeDiff += 1;
}
let extra = 0;
for (const key of actual.keys()) if (!expected.has(key)) extra += 1;
console.log(`期待${expected.size} 実際${actual.size} 欠け${missing} 余り${extra} サイズ違い${sizeDiff}`);
JS
```

  期待は、`欠け0 余り0 サイズ違い0`（B-1では、15行対15行で差0だった）。パスは出力しない。

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
- **【追加：2026-11-13、B-1の実績を取り込み】取得中に書込みがなかったこと：** 取得後に、6.2の件数をもう一度取り、取得前と比べる。

  ```bash
  psql -X -At -F $'\t' -c "select bucket_id, count(*), coalesce(sum((metadata->>'size')::bigint),0) from storage.objects group by 1 order by 1" > "$F13_BACKUP/storage-objects-after.tsv"
  psql -X -At -c "select count(*) from auth.users" > "$F13_BACKUP/auth-users-count-after.txt"
  # counts-after.tsv は、6.2の counts-before.tsv と同じSQLで取る
  diff "$F13_BACKUP/storage-objects-before.tsv" "$F13_BACKUP/storage-objects-after.tsv" | wc -l
  diff "$F13_BACKUP/auth-users-count.txt" "$F13_BACKUP/auth-users-count-after.txt" | wc -l
  diff "$F13_BACKUP/counts-before.tsv" "$F13_BACKUP/counts-after.tsv" | wc -l
  ```

  期待は、すべて `0`。差があれば、取得中に書込みがあった。差の内容（どのテーブルか）を確認し、取り直すか判断する。
- **【追加：2026-11-13、B-1の実績を取り込み】SHA-256の一覧：** 上記の `*-after` ファイルを作ってから、`SHA256SUMS.txt` を作る（`storage/` の下も含める）。
  ファイルの権限は600（B-1では28項目）。作成後、`shasum -a 256 -c` で不一致が0であること。

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

- **【追加：2026-11-13、B-2の実績】** B-2では、`public.dump` の復元は終了コード1・エラー4件（検証用の環境差。`public` スキーマが既にある、`supabase_admin` の既定権限への権限不足）で、
  件数と履歴は一致した。接続先のポートが通常のローカル環境と重なる場合は、通常環境を止めず、独立したプロジェクト（別のproject ID・別のポート）を使う。

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
| スキーマ・権限・ポリシー | 検証用DBから `pg_dump --schema-only`（public）を取り、`schema-reference.sql` のpublic部分と比べる | 差分なし（所有者・拡張機能の違いだけ許容）。**【追加】ローカルのSupabaseは、新しいテーブルに `anon`・`authenticated` へ全権限を既定で付けるため、権限（ACL）は本番と異なる。権限は、DDLの比較から外して別に確認する**（B-2の実績） |
| `auth`・`storage` | 戻せた場合は、`auth.users` の件数、バケット別のオブジェクト件数を比べる。戻せなかった場合は、`pg_restore --list` で、含まれていることを確認する | 一致、または理由を記録 |
| Storage本体 | 6.4で取得したファイル数・合計サイズ・SHA-256を、`storage-objects-before.tsv` と比べる。**【追加】検証用のローカルStorageへ戻して照合する（下の「Storage本体の復元確認」）** | 一致 |
| HP画面の表示（任意） | 検証用DBへ向けたアプリで、公開ページの表示を確認する。**外部送信・本番のSupabase（Auth・Storage）へ接続しない設定にする** | 表示できる |

**【追加：2026-11-13、B-2の実績を取り込み】Storage本体の復元確認（検証用のローカルStorageのみ）**

目的：6.4で取得したファイル本体を、検証用のローカルStorageへ戻し、SHA-256で一致することを確認する。**本番のStorageには接続しない。**

1. 検証用のSupabaseから、APIのURLとService Roleキーを、**メモリ内の変数へ**取る（画面にもファイルにも出さない。使い終わったら `unset`）。
   接続先が `http://127.0.0.1:<検証用のAPIのポート>` でなければ、スクリプトは中止する。
2. 次のスクリプトを、検証用のチェックアウト（`@supabase/supabase-js` がある場所）に `f13-storage-check.mjs` として保存する。
3. **1回目**（`F13_UPSERT=0`）：バケットを作り、本番と同じ設定にして、全ファイルを保存し、ダウンロードしてSHA-256を照合する。
   `club-documents`・`club-images` は公開、`club-app-attachments` は非公開・3MiB・PDFのみ。**設定は、5.3のバケットの出力に合わせる**（B-2では、この3つ）。
4. 検証用DBで、`storage.objects` の件数・バイト数を、`storage-objects-before.tsv` と比べる（差0）。バケットの設定（公開・上限・MIME）も確認する。
5. **2回目**（`F13_UPSERT=1`）：同じファイルを上書きで保存する。失敗0、不一致0、`storage.objects` の行が増えない（差0）ことを確認する（**既存の行がある場合の上書きの挙動の確認**）。

```bash
# 例：APIのポートが 55321 の場合（検証用のSupabaseの設定に合わせて変える）
env -i PATH="$PATH" HOME="$HOME" F13_API_URL="$F13_API_URL" F13_SERVICE_KEY="$F13_SERVICE_KEY" \
  F13_API_PORT=55321 F13_STORAGE_DIR="$F13_BACKUP/storage" F13_UPSERT=0 node f13-storage-check.mjs
```

```js
// f13-storage-check.mjs（検証用のチェックアウトに保存する。件数と結果だけを出力し、パス・キーは出さない）
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, extname, sep } from "node:path";

const url = process.env.F13_API_URL;
const key = process.env.F13_SERVICE_KEY;
const root = process.env.F13_STORAGE_DIR;
const port = process.env.F13_API_PORT;
const upsert = process.env.F13_UPSERT === "1";

const allowed = new RegExp(`^http://(127\\.0\\.0\\.1|localhost):${port}$`);
if (!port || !allowed.test(url ?? "") || !key || !root) {
  console.log("中止: 接続先が検証用ではありません");
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });
const types = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const settings = {
  "club-documents": { public: true },
  "club-images": { public: true },
  "club-app-attachments": {
    public: false,
    fileSizeLimit: 3145728,
    allowedMimeTypes: ["application/pdf"],
  },
};
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function walk(dir, base = "") {
  const entries = await readdir(join(dir, base), { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const rel = base ? join(base, entry.name) : entry.name;
    if (entry.isDirectory()) found.push(...(await walk(dir, rel)));
    else found.push(rel);
  }
  return found;
}

for (const [bucket, options] of Object.entries(settings)) {
  let bucketFailed = 0;
  if (!upsert) {
    const created = await client.storage.createBucket(bucket, options);
    if (created.error) bucketFailed = 1;
  }
  const files = await walk(join(root, bucket));
  let saved = 0;
  let failed = 0;
  let ok = 0;
  let bad = 0;
  const codes = new Set();
  for (const rel of files) {
    const body = await readFile(join(root, bucket, rel));
    const path = rel.split(sep).join("/").normalize("NFC");
    const contentType = types[extname(rel).toLowerCase()] ?? "application/octet-stream";
    const up = await client.storage.from(bucket).upload(path, body, { upsert, contentType });
    if (up.error) {
      failed += 1;
      codes.add(String(up.error.statusCode ?? up.error.status ?? "?"));
      continue;
    }
    saved += 1;
    const dl = await client.storage.from(bucket).download(path);
    if (dl.error) {
      failed += 1;
      continue;
    }
    const got = Buffer.from(await dl.data.arrayBuffer());
    if (sha(got) === sha(body)) ok += 1;
    else bad += 1;
  }
  console.log(
    `${bucket}\tファイル${files.length}\t保存${saved}\t失敗${failed}\t一致${ok}\t不一致${bad}` +
      `\tバケット作成失敗${bucketFailed}\t失敗コード[${[...codes].join(",")}]`,
  );
}
```

- 期待は、全バケットで失敗0・不一致0・バケット作成失敗0。失敗コードが出た場合（日本語のファイル名が拒否される400系など）は、**本番への復元でも起こり得る問題として記録する。**
- 終わったら、`f13-storage-check.mjs` は検証用のチェックアウトごと削除する。キーの変数は `unset` する。
- この確認は、**ローカルの検証用Storageに対するものであり、本番のStorageの復元の実行ではない。**

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
  **【追加：2026-11-13、利用者の方針】** 第一案は「DB適用 → 既存HPの確認（8.3）→ 新アプリのデプロイ」。
  DB適用後も現行HPが動くことを、8.3で確認できた場合に限り、新アプリをデプロイする。
  **確認できない場合は、新アプリをデプロイせず、Cを保留して**、対処案（9.2。個別の戻しSQL、前方修正など）を提示する。
  **【追加：2026-11-13、利用者の方針】** 8.3で確認するのは、読取りと表示までである。画像・PDFの**書込み**（アップロード・差替え・削除）と
  新規ログイン操作は、Cに含めず、8.3.1の別の承認（⑥）で行う。**8.3の表示確認の合格を、書込みの確認済みとして扱わない。**
  新アプリのデプロイ（④）の判断では、⑥を実施したか、未実施かを、承認者が承知して判断する（未実施でデプロイするかは、④の承認者が決める）。
  なお、B-2では、現行HPのコードを復元後のDBに対して動かしていない（個人情報を含むため）。適用前の互換性の根拠は、
  コードの確認（Prismaを使い、Data APIを使わない）にとどまる。本番での確認は、適用後の8.3で初めて行われる（第11節の21）。
- **【追加：2026-11-13、利用者の方針】** 実施者・中止判断者は利用者。実施日時は、準備完了後に決める。
  クラブ代表への連絡は、既存のLINE個別トークで行う。

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
**【修正：2026-11-13、利用者の方針】** 8.3は、読取りと表示の確認だけである。書込み（Storageのアップロード・差替え・削除）と、新規ログイン操作は、8.3.1へ分けた。

- `migrate status` が「最新」。
- 6.2と同じSQLで、**既存HPのテーブルの件数が、取得前から変わっていない**（適用の間に、HPへの申込みがあった場合は、その増加分だけ）。
- 5.3のSQLで、RLS・トリガー・権限・ポリシーが、5.4の想定どおり。
- **【追加：2026-11-13、B-2の結果に基づく】** 次を、読取りのSQLで確認する（件数のみ）。
  - `public` のテーブルのRLSが、**全テーブルで有効**（想定は34/34）。`StorageDeletionJob` は、migrationにRLSの有効化がなく、
    本番のイベントトリガー（`ensure_rls`）による自動有効化に依存する見込み。**本番で確認する**（第11節の14）。
  - `storage.objects` の `club-images` のポリシーが **0件**（適用前は4件）。
  - `anon`・`authenticated` に付いている `public` のテーブル権限が **0件**。
  - `_prisma_migrations` が **26件**、すべて完了、未完了0件。
- **【修正：2026-11-13】** 既存HPの**公開ページが表示される**。スタッフ画像・ページ内容の画像が表示される。月間練習計画のPDF（`club-documents`）が表示される。
  いずれもブラウザでの表示の確認で、書込みはしない。
- **この表示確認が通ったことは、画像・PDFの書込み（アップロード・差替え・削除）が動くことの確認ではない。**
  書込みが `SERVICE_ROLE_KEY` のサーバー側の処理で、ポリシーに依存しないという見込みは、コードの確認に基づく見込みであり、**検証結果ではない**。
  書込みの確認は、8.3.1（別の承認）で行う。実施しない間は、「書込みは未確認」と記録する。

### 8.3.1 既存HPの動作確認（書込み・ログインを伴う。Cとは別の承認⑥）

**【追加：2026-11-13、利用者の方針】** Cの承認に含めない。実施する場合は、承認の前に、次を承認者へ示す（テスト対象・影響・後片付けが必須。ほかは運用上の補足）。

| 示すもの | 内容（【修正：2026-11-13】最小限の案。<実施前に記入> の欄は、実施前に埋める） |
| --- | --- |
| テスト対象 | 利用者が指定（2026-11-13）。個人情報を含まないダミーの画像・PDFを使う。差替えは行わない。アカウントは新規作成しない。<br>① 画像：ADMIN スタッフ紹介管理。ファイル名：本番適用テスト用画像.jpg（`club-images`）。<br>② PDF：ADMIN 月別練習計画設定。ファイル名：本番適用テスト用PDF.pdf（`club-documents`）。<br>③ ログイン：ADMIN 管理者ログイン。既存の管理者アカウントで、未ログインの状態からログインし、管理画面を開けることを確認する。 |
| **【追加】操作の限定（コードの確認に基づく）** | **①** スタッフ紹介管理には、既存のスタッフの画像・トップ画像の更新（`updateStaff`・`updateStaffPageSetting`）がある。これらは**既存の画像を削除して置き換える**ため使わない。**新規スタッフとして、テスト用の画像つきで作成し（`createStaff`）、そのスタッフを削除する（`deleteStaff`。画像も削除される）**。作成時の状態は**非公開（下書き）**にする（初期値は公開中）。<br>**②** 月別練習計画の作成（`createMonthlyPracticePlan`）の初期値は**公開中**で、公開トップページは、年月が最新の公開中の1件を表示する。**状態を必ず「下書き」にして**作成し、すぐ削除する。年月は**2099年7月**（利用者の判断、2026-11-13）。**実施前に、管理画面の一覧で、2099年7月の計画がないことを確認し、結果を記録する**（あれば、別の年月にする）。既存の計画は変更・削除しない。 |
| 影響 | 本番の `club-images`・`club-documents` に、テスト用ファイルが一時的に存在する。`Staff`・`MonthlyPracticePlan` に、テスト用の行が一時的にできる（下書きのため、公開ページには出ない見込み。**これは見込みで、実施時に公開ページで確認する**）。ログイン記録の行が増える可能性がある。実データは変更・削除しない。Claudeは本番へ接続せず、利用者が操作する |
| 後片付け | テスト用のスタッフ行、月別練習計画の行、画像、PDFを削除する。`club-images`・`club-documents` のファイル数が、実施前の値に戻ったことを確認する。`Staff`・`MonthlyPracticePlan` のテスト行が残っていないことを確認する。公開ページに、テスト用の内容が出ていないことを確認する。失敗した場合は、残ったものの名前（パスは共有しない）を記録し、承認者が扱いを決める |
| 実施の位置 | 手順8（表示確認）のあと、手順9の判定の前。8.3の表示確認と、結果を分けて記録する |
| 中止条件 | アップロード・削除のエラー、テスト画像が削除できない、実データに影響が出た場合。続けず、状況を記録し、9.2で判断する |

- `WEBSITE_ADMIN_USER_IDS` は有効なまま（DB方式の認可へ切り替えない）。ログインの確認は、既存の管理者のアカウントで行う。
- 範囲は、示した対象に限る。承認がない間は実施しない。結果は、8.3の表示確認と区別して記録する。

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

#### 9.3.1 手動バックアップの別環境での復元確認と、本番を戻す手順は、別のものである（2026-11-13）

| | 別環境での復元確認 | 本番を戻す手順 |
| --- | --- | --- |
| 目的 | バックアップが**読めて、復元できる**ことを、本番と切り離して確認する | 事故の後に、**本番を元の状態へ近づける** |
| 対象 | 使い捨てのローカルDB（空の `public`） | 本番のプロジェクト（データが入っている） |
| 状態 | **B-2で実施済み**（第12.5節） | **未実施・未リハーサル。実行は、操作ごとの明示承認を得てから** |
| 証明できること | `public.dump` が空のDBへ復元でき、件数・履歴が一致すること | 上記の確認は、**本番のデータが入ったDBへの上書き復元が成功することの証明ではない** |

- B-2で確認できていないこと：データが入った `public` への上書き復元、`auth`・`storage` の完全な復元（スキーマの版の差で14件のエラー、第12.5節）、
  日次バックアップの「復元する」の挙動。**「復元できる」とは、「空のDBへ `public` を復元できる」の意味でだけ記録する。**
- **本番復元の前提：** 本書の手順を実行するのは、利用者（中止判断者）のみ。Claudeは、案内と記録のみで、本番へ接続しない。
  復元・Cron停止・接続先切替・設定変更は、**操作ごとに明示承認**を得る。過去のローカル操作や、B-2の承認は流用しない。

#### 9.3.2 本番を戻す場合の手順（実行しない。承認前に、承認者がレビューするための案）

**手順0：判断と記録（中止判断者）**

- DB全体の復元に進む前に、9.2の他の方法（個別の戻しSQL、前方修正、アプリのロールバック）で直らないことを確認する。
- 戻す時点（日次バックアップのどれか／migration直前の手動バックアップ）、判断の理由、時刻を記録する。**失われる書込みの範囲**（9.3の影響）を、承知して判断する。
- クラブ代表への連絡は、既存のLINE個別トークで行う（利用者の方針、2026-11-13）。連絡する内容は、停止の時間帯と、失われ得る操作の範囲。

**手順1：書込みを止める（本番の設定変更のため、承認が必要）**

- 既存HPと、アプリの書込みを止める（方法は、デプロイの状況に合わせて承認者が決める）。
- `club-line-deliveries`・`storage-deletions` のCronを止める（9.3の注意）。Supabase Cron（Integrations → Cron）の各ジョブのActiveスイッチをオフにする（第11節の19。**本番の設定変更のため、操作ごとに承認**）。
  止められない場合は、復元に進まない。**日次バックアップの復元（方法B）では、復元の前にスイッチをオフにしても、復元後のCronの定義がバックアップ時点（Active）に戻る可能性がある**（要確認）。
  その場合、復元の直後にオフにするまでの間、Cronが動く。バックアップ時点より後に送信した配信が `PENDING` に戻っている場合は、重複送信のおそれがある。

**手順2：現状の保存（上書きの前に必ず行う）**

- 現在の本番の状態を、B-1と同じ手順（第6.3・6.4節）で、別のディレクトリへ `pg_dump` する。Storage本体の件数・サイズも控える。
- これが無い状態で、同じプロジェクトへの上書き復元を行わない（失敗すると、現在のデータとバックアップの両方を失い得る）。

**手順3：復元の方法を選ぶ（承認者）**

| 方法 | 内容 | 状態・注意 |
| --- | --- | --- |
| A. 個別の戻しSQL | 9.5の一式（B-2で、検証用DBで動作確認済み）を、本番に実行する | 新しいテーブルに、データが入っていない場合に限る。入っている場合は失われる（9.2）。**第一の選択肢** |
| B. 日次バックアップの復元 | 管理画面の「Restore」。復元できる時点は、日次の取得時刻のみ（直近7件） | 画面の表示：**取り消せない**、復元中はプロジェクトがオフライン（所要時間の目安なし）、バックアップ後のDBデータは失われる。Storage本体は含まれない（第11節の20）。migration直前の状態を、持っていない可能性がある |
| C. 手動バックアップから新しいプロジェクトへ復元して切り替える | `public.dump` を新しいプロジェクトへ復元し、接続先を切り替える | 工数が大きい。Vercelの環境変数・Auth設定・Storage・LINE Webhook・Cronをすべて切り替える。セッションが無効になる。**リハーサルは未実施** |
| D. 手動バックアップを、本番の既存プロジェクトへ上書き復元 | 手順書の範囲外 | **未検証のため、採用しない。** 必要になった場合は、別に設計し、検証用DBで先にリハーサルする |

**手順4：復元後の確認（読取り）**

- `public` の各テーブルの件数が、バックアップの `counts-before.tsv` と一致する（復元の時点が手動バックアップの場合）。
- `_prisma_migrations` が、復元した時点の件数・状態（migration適用前なら15件、すべて完了）。
- `auth.users` の件数と、アプリ側のユーザー記録の整合。Storageのファイル本体の件数・サイズを、保全した値と比べる（差があれば、6.4の手順で戻す）。
- RLS・トリガー・権限・ポリシーを、`schema-reference.sql` と比べる（5.3のSQL）。
- 既存HPの公開ページ、管理画面へのログイン（`WEBSITE_ADMIN_USER_IDS` は有効なまま）、フォーム申込みの導線（テストデータで）。

**手順5：再開（承認が必要）**

- 書込みの停止を解除する。Cronは、配信行・削除ジョブの状態（`PENDING` の行、処理済みの削除ジョブ）を確認してから、1つずつ再開する。
- 記録：復元の方法・時刻・戻した時点・失われた範囲・確認の結果・再開の時刻。クラブ代表へ、結果を連絡する（LINE個別トーク）。

**適用前に、承認者が確認すること：** 手順1のCron停止の方法（第11節の19）と、日次バックアップの復元の仕様（第11節の20）は、2026-11-13に画面で確認した（第12.8節）。
残る未確認は、実際のダウンタイムの長さと、復元後のCronの状態。**公開前（アプリのテーブルにクラブのデータがない間）は、Cronの重複送信の影響は小さい。公開後は、復元の前に、承認者がこの点を承知する。**

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
**【修正：2026-11-13】** B-2で、`anon`・`authenticated` への付与は、`REFERENCES`・`TRIGGER`・`TRUNCATE`・`MAINTAIN` の4種だった（PostgreSQL 17の `pg_dump` の出力に基づく）。
戻しでは、`MAINTAIN` も含める。

**B-2の検証用DBで動作を確認した戻しSQLの一式**（2026-11-13、第12.5節。**本番では未実行**）：

1. 追加した22テーブル：`DROP TABLE public."<テーブル名>" CASCADE`。
2. 関数3つ：`enforce_same_club_reference()`・`prevent_club_id_change()`・`require_line_delivery_source_on_insert()` を `DROP FUNCTION`。
3. ENUM 13個：`ClubEventGenre`・`ClubInvitationStatus`・`ClubMemberRole`・`ClubMembershipStatus`・`ClubNoticeGenre`・
   `LineDeliveryContentType`・`LineDeliveryStatus`・`PlanType`・`PlatformAdminRole`・`StorageDeletionSourceType`・`StorageDeletionStatus`・
   `SupportReportCategory`・`SupportReportStatus` を `DROP TYPE`。
4. 履歴：`delete from _prisma_migrations where migration_name >= '20260816221153_add_club_app_schema'`（11行）。
5. `club-images` のポリシー4件の `CREATE POLICY`（上の4文）。
6. 権限：元の12テーブルへ、`GRANT REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ... TO anon, authenticated`。

- 戻し後、スキーマの差は、権限（ACL）と環境差を除いて0件だった。
- **データが入った後の `DROP TABLE` は、データを失う（9.2）。** 本番で使う前に、承認者が確認する。
- ENUMの値の追加を含むmigrationは戻せない、という方針（上の表）は変わらない。

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
5. ~~既存HPが、Supabase Data API（anonキー）で `public` のテーブルを読んでいないか、`club-images` のStorageのポリシーに依存していないか~~
   **確認済み（2026-11-13、第5.4節）。** デプロイ済みコード `8e70038` はService Roleと `getPublicUrl` を使い、Data APIのログは7日間で0件、`club-images` は公開バケット。
   残る限界は、第5.4節の未確認（1）〜（5）。
6. `auth`・`storage` のデータを、検証用DBへ復元できるか（スキーマの版の差。できない場合の確認の範囲）
7. ~~DB全体の復元の詳細な手順（9.3）~~ **下書き作成済み**（9.3.1〜9.3.2、2026-11-13）。ただし、第11節の19・20が未確認の間は、実行できる手順として扱わない
8. 実施日時：準備完了後に決める。実施者・中止判断者：利用者。クラブ代表への連絡：既存のLINE個別トーク（2026-11-13、利用者の方針）。承認者の記録は、利用者側
9. ~~Supabase Proへのプラン変更~~ **実施済み**（利用者が、組織をProへ変更し、管理画面で一覧を確認したと報告。2026-11-11、第4.7節）。承認の記録は、利用者側
10. 日次バックアップの**保持日数**（一覧は7件。断定しない）、**復元の仕様**（上書きか、ダウンタイムの長さ）、**ダウンロードの可否**、PITRが画面で無効であること（4.6・4.7。管理画面と公式資料で確認する）
11. Storage本体の復元の方法と、既存のオブジェクト行がある場合の上書きの挙動（6.4。検証用の環境で先に確認する）
12. 日次バックアップの確認を、適用（C）の必須条件とすること（8.1に、2026-11-11の方針として入れた。外す・緩める場合は、利用者の判断）
13. **本番での `DROP POLICY`（20260817003046）の権限：** `storage.objects` の所有者・実行ロールの権限は、本番では未確認。
    ローカルでは成功した。失敗した場合は、そのmigration全体が戻る（8.2）。実行ロールの権限の確認は、Cの承認者が判断する。
14. **`ensure_rls` と `rls_auto_enable` の関係：** 本番に有効なイベントトリガー `ensure_rls` があることは、管理画面のSQLで確認した（2026-11-13）。
    ただし、新しい `public` のテーブルを自動でRLS有効にするかは、未確認。ローカルでは `StorageDeletionJob` が33/34だった。
    適用後に34/34を確認し、満たさない場合は前方修正で扱う（8.3）。
15. **シーケンスの既定の権限：** migration 20260816224901 は、シーケンスの既定権限から `USAGE`・`SELECT` を剥奪するが、`UPDATE` が
    `anon`・`authenticated` の既定ACLに残る（ローカルでの観察）。本番の適用前の状態は未確認。適用後に、本番の既定ACLを確認する。
16. **権限の剥奪が、同じDBを使う他のクライアントに影響しないか：** `anon`・`authenticated` の権限が0件になる（Data APIの利用者）。
    既存HPは、Prismaを使う前提（コードで確認）。本番側で、他のクライアントがData APIでテーブルを読んでいないかは、未確認。
17. **ローカルの検証の限界：** 本番の `auth`・`storage` のスキーマは、ローカルのSupabaseイメージより新しく、`storage.buckets`・`storage.objects`
    や一部の `auth` のテーブルは、データを復元できなかった（第12.5節）。ローカルの既定の権限は、本番と異なる。
    これらの差に依存する結果は、本番で確認する。
18. ~~B-1の追加確認の取り込み~~ **取り込み済み**（2026-11-13）。第6.2・6.4・6.5・7.3・7.4節に、パス一覧・余分なファイルの確認・NFC突き合わせ・取得後の再確認・SHA-256・Storage本体の復元確認の手順を反映した。
19. ~~Cronの停止方法~~ **確認済み（2026-11-13、利用者の報告、第12.8節）。** 呼び出し元は、Supabase Cron（`club-line-deliveries-every-5-minutes`・`storage-deletions-every-5-minutes`）。各ジョブにActiveの切替スイッチがあり、停止はこのスイッチで行える見込み（本番の設定変更のため、操作ごとに承認が必要）。
    未確認：Cronの呼び出し先のHTTPステータスと、認証付きの処理の成否（G6）。**復元でCronの定義がバックアップ時点の状態（Active）に戻る場合、復元の直後から動き出す可能性がある**（要確認）。
20. ~~日次バックアップの復元の仕様~~ **画面で確認済み（2026-11-13、利用者の報告、第12.8節）。** 「同じプロジェクトを上書きする」という明記はないが、現在のDBを選んだ時点に戻す説明で、**操作は取り消せない**と表示。復元中はプロジェクトがオフライン。所要時間の目安の表示なし。バックアップ後のDBデータは失われる。Storage本体は含まれず、バックアップ後に削除したファイル本体は復元されない。ダウンロードのボタンなし。PITRは無効。
    未確認：実際のダウンタイムの長さ。復元は実行しない。
21. **DB適用後の現行HPの互換性：** B-2で、現行HPのコードを復元後のDBに対して動かしていない。
    適用前の根拠は、デプロイ済みコード `8e70038` の確認（Service Role・`getPublicUrl`・Data API不使用）、B-0の権限の状態、Logs（7日間、`/rest/v1/` 0件）。
    **2026-11-13：適用前の確認としては、問題なし**（第5.4節）。適用後の実動作のうち、表示は8.3で確認する。書込みは8.3.1（別の承認）で、実施するまで未確認。確認できない場合は、Cを保留する（8.1の方針）。
22. **参考（今回の範囲外）：** `8e70038` の `vercel.json` のCronは `/api/cron/delete-old-submission-logs` だが、そのコミットの `app/api` に、このパスのルートが見当たらない
    （`delete-old-security-logs` のみ）。本番のCronが404になっている可能性がある。今回のmigrationとは無関係。G6で確認する。
    **VercelのCron Jobs（Legacy）に、このパスがActiveで表示されている**（毎日03:00 UTC、利用者の報告、2026-11-13）。

## 12. 実施記録

実施するたびに、該当の行を埋める。**URL・資格情報・個人情報・生のログ・接続先のホスト名は、記録しない。**
結果の欄が空の行は、**未実施**である（空欄を「問題なし」と読まない）。

| 地点 | 承認 | 実施者 | 実施日時 | 結果 |
| --- | --- | --- | --- | --- |
| B-0（読取り確認） | 2026-11-11、利用者（右田和也）が承認 | 右田和也 | 2026-11-11〜12（利用者が実行し、出力を報告） | **実施済み・通過**（履歴は整合、中止条件なし、追加確認2点も完了。第12.1・12.2節）。残る注意は、第12.2節の「残るリスク」 |
| B-1（手動バックアップ） | 2026-11-12、利用者が承認（復元リハーサル用の取得のみ） | 右田和也 | 2026-11-12 14:56〜15:32（JST） | **実施済み**（第12.4節）。migration直前の再取得は未承認・未実施 |
| B-2（復元確認・リハーサル） | 2026-11-13 07:05:54（JST）、利用者が承認（ローカル使い捨て環境での復元・照合・後片付けのみ） | 右田和也 | 2026-11-13 07:05〜10:34（JST） | **実施済み・条件付きで通過**（第12.5節）。本番での未確認事項は第11節の13〜17 |
| C（本番適用） | 2026-11-16 13:22、利用者（右田和也）が承認 | 右田和也 | 2026-11-16 13:22〜13:23（JST） | **【修正：2026-11-17】実施済み・通過**（終了コード0、26件、第12.11節） |
| ④（新アプリのデプロイ） | 2026-11-17 11:30、利用者が承認（事後の記録。第12.12節） | 右田和也 | 2026-11-17 11:30（JST） | **【追加：2026-11-17】実施済み・通過**（第12.12節） |

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
  - **適用後に、実際に確認する**（表示は第8.3節、保存・削除は第8.3.1節の別の承認）。上の「ない見込み」は、検証結果ではない。

**残るリスク（未確認）：**

- 本番の**他のクライアント**（外部のアプリ・スクリプト・ダッシュボードなど）が、`club-images` の認証ユーザーのポリシー、または `public` のData APIを使っていないか。コードと、B-0の読取りでは、確認できない。適用後の確認（HPの画像表示は8.3、管理画面のアップロードは8.3.1の別の承認）で補う。
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

### 12.4 B-1（復元リハーサル用バックアップ）の実施結果（利用者が実行・報告、2026-11-12）

**承認範囲：** 復元リハーサル用のバックアップ取得のみ（対象は第6.2〜6.5節、Storageは方法3）。B-2の復元、migration直前の再取得、本番migration、Cronの停止・設定変更は含まない。
実施者は利用者（手元のMac）。Claudeは本番へ接続しておらず、案内と記録のみを行った。以下は利用者の報告である。

**時刻（JST）**

- 開始時刻（利用者の控え）：14:56:07
- 保管先ディレクトリの作成：15:01（ディレクトリ名の時刻は15:01:14）
- `pg_dump` の出力ファイル：15:04〜15:05
- 終了時刻：15:32:44
- 取得後〜本番migrationまでの書込みは、このバックアップに含まれない。本番migration直前に、改めて取得する。

**接続・環境**

- 接続先：ポート5432、poolerを含まない（直接接続）。サーバー 17.6、`default_transaction_read_only` は `on`。
- クライアント：`pg_dump` 18.6（libpq）。

**取得前の記録（第6.2節）**

- `_prisma_migrations`：15件、すべて完了、未完了0件。
- `public` のテーブル：12件（`counts-before.tsv` は12行）。
- `auth.users`：5件。
- Storage：`club-documents` 5件/246,213バイト、`club-images` 10件/10,487,033バイト、`club-app-attachments` 0件（行なし）。2026-11-12の事前報告と一致。

**DBバックアップ（第6.3節）**

- `public.dump`、`auth-storage-data.dump`、`schema-reference.sql`：終了コードはすべて0。
- ファイルサイズ：約57KB、約29KB、約209KB（いずれも0バイトではない）。
- `pg_restore --list`：`public.dump` 103行、`auth-storage-data.dump` 53行（読み取り成功）。

**Storage本体（第6.4節、方法3）**

- 手動ダウンロード後、バケット別の件数・バイト数が取得前と一致（5/246,213、10/10,487,033、0/0）。
- 余分なファイル（`.DS_Store`、未完了のダウンロード）なし。
- パス・サイズを、取得前の一覧とUnicode正規化（NFC）後に突き合わせ：15行対15行、差0。

**取得後の確認（第6.5節）**

- `counts-before` と `counts-after`、`auth.users` の件数、`storage.objects` の集計：いずれも差0。取得中に、確認した範囲の本番データは変化していない。
- `SHA256SUMS.txt`：28件。`shasum -c` の不一致は0件。権限は600。
- 本番の接続情報（`PG*`）は `unset` 済み。
- ファイル名・SHA-256の値・ファイルの内容は、チャットにも本書にも記録しない（保管先のみ）。

**実施時に追加した確認（手順書の第6.2〜6.5節にはない）**

- `storage-list-before.tsv`（パスとサイズの一覧）による、パス単位の突き合わせ（NFC正規化つき）。
- `counts-after.tsv` などによる、取得後の書込み確認。
- 取り込むかは未決。取り込む場合は、第6.2・6.4・6.5節へ反映する（別の変更として依頼）。

**判定**

- 第6.5節の通過条件のうち、暗号鍵・環境変数の一覧の控えは、本取得の対象外（第12.3節のとおり、項目ごとに確認）。
- それ以外の条件は満たした。**復元リハーサル用のバックアップ取得は完了。**
- **復元できることは、未確認。** B-2（別の検証用DBでの復元確認）が済むまで、「復元できる」とは記録しない。
- 保管先：`~/f13-backups/<実施日時>/`（Git管理外、権限700）。G9の安定確認後に削除し、削除日を台帳へ記録する。

**未了**

- B-2（復元確認とリハーサル）、migration直前の再取得、本番migration（C）は、いずれも未承認。

### 12.5 B-2（別の検証用DBでの復元確認とリハーサル）の実施結果（利用者が実行・報告、2026-11-13）

**承認範囲：** 2026-11-13 07:05:54（JST）。B-1のバックアップを、ローカルDocker上の使い捨てSupabaseへ復元し、読取り専用で照合し、後片付けまで。
`verify:mvp`・`test:integration`・E2Eは、本番の個人情報を含むため実行しない。本番DBへの接続・復元、通常環境・F12用環境の変更、本番migration、
実メール・LINE送信は含まない。実施者は利用者（手元のMac）。Claudeは本番へ接続しておらず、案内と記録のみを行った。

**検証用環境**

- 独立したSupabaseのプロジェクト（`f13-restore-<ランダム>`）。`major_version` 17、実際のPostgreSQLも17を確認。
- ポートは通常環境（54321・54322）と分け、通常環境（11コンテナ）は停止・変更せず、最後まで11個のままだった。
- 接続先がローカルの検証用DB（ポート55322）であることを、各操作の前に自動で確認した。

**結果（第7.5節の条件との対応）**

| 条件 | 結果 |
| --- | --- |
| 1. `public.dump` を別環境で復元できた | **満たした。** 終了コード1・エラー4件。いずれも検証用の環境差（スキーマの既存、`supabase_admin` の既定権限への権限不足）。テーブルの件数と `_prisma_migrations` の履歴は、取得前と一致 |
| 2. 復元の確認が合格 | **満たした。** 件数・履歴（15件、すべて完了）・スキーマ。 |
| 3. リハーサルの `migrate deploy` が成功 | **満たした。** 終了コード0、`migrate status` は最新（26件）、`migrate diff` は空。適用後、`anon`・`authenticated` のテーブル権限は0件、`public` のポリシーは0件、`club-images` のポリシーは4件から0件 |
| 4. 所要時間とロックの記録 | `migrate deploy` は約1秒。ロックの待ちは計測していない（ローカルで接続が他にないため、本番の同時接続による待ちは未検証） |
| 5. 戻しSQLが検証用DBで動く | **満たした。** 9.5の一式。戻し後のスキーマの差は、権限（ACL）と環境差を除いて0件 |

**`auth`・`storage` のデータ復元（ベストエフォート、第7.3節）**

- エラー14件。本番の `auth`・`storage` のスキーマが、ローカルのイメージより新しく、一部のテーブルは復元できなかった。
- `auth.users` は5件を復元。`storage.buckets`・`storage.objects` は、ダンプ内の件数を `pg_restore --list` で確認するにとどめた。
- Storageの行の復元は、この環境では確認できていない（第11節の17）。

**Storage本体の復元の確認（第6.4節）**

- 検証用のローカルStorageに、`club-documents`（公開）・`club-images`（公開）・`club-app-attachments`（非公開、3MiB、PDFのみ）を作成。
- B-1の15ファイルを、元の相対パス（NFC正規化）で保存し、ダウンロードしてSHA-256を照合：5/10/0、失敗0、不一致0。日本語のファイル名による失敗はなかった。
- 上書き（`upsert`）での再保存も、同じ結果（失敗0、不一致0）。`storage.objects` の件数・バイト数は、取得前の記録と差0で、行は増えなかった。
- 本番のStorageの復元（本番へ戻す手順）は、別に行う。バケット設定（公開・上限・MIME）は、バックアップに含まれないため、別に控える必要がある。

**ローカルの観察（本番との差。第11節の13〜17）**

- ローカルのSupabaseは、新しいテーブルに `anon`・`authenticated` へ全権限を既定で付ける。復元後の権限は、本番と異なる。
- シーケンスの既定ACLに、`UPDATE` が残った（第11節の15）。
- `StorageDeletionJob` はmigrationにRLSの有効化がなく、ローカルでは33/34だった（第11節の14）。

**後片付け**

- 検証用のコンテナ（6）・ボリューム（2）・ネットワーク（1）：`supabase stop --no-backup` で削除。残り0。通常環境は11個のまま。
- 作業ディレクトリ：2026-11-13 10:32:24（JST）に削除。B-2の開始直後（07:13）に作られていた空の残り（前の試行によるものと推測）（`checkout` は空、worktreeではない）も、10:34:13 に削除。
- 元のバックアップ（`~/f13-backups/20261112-150114`、権限700）：残した。`shasum -c` の不一致0件。
- 本番へは、一切接続していない。

**判定**

- 第7.5節の1〜5を、ローカルの検証用DBで満たした。**B-2は通過。**
- ただし、第11節の13〜17は、本番で初めて確認できる事項である。これらを承知した上で、Cの承認者が判断する。
- 「本番に適用して問題ない」とは記録しない。適用（C）、migration直前の再取得、Cronの停止・設定変更は、いずれも未承認・未実施。

### 12.6 C前の影響確認の結果（利用者の報告と、Claudeのコード確認、2026-11-13）

本番へは、Claudeは接続していない。次の（1）〜（3）は、利用者が管理画面で確認し、報告した結果である。（4）はClaudeがGit履歴を読んだ結果である。

1. **デプロイ済みコード：** Vercelの本番デプロイは、作成日時 2026-09-27 09:22:05 JST、ソースのコミット `8e70038`（短縮SHA）。
2. **Data APIのログ：** Supabase Logs（API Gateway → Postgrest）、2026-11-06 11:22〜11-13 11:22（画面表示）。フィルター後13件のうち、`/rest/v1/` のパスは0件。ロール別の照合は、該当なしのため未実施。
3. **`club-images`：** `id = club-images`、`public = true`。
4. **コミットの照合（Claude）：** `8e70038` は `main` にあり、HEADの祖先ではない。そのコミットに `lib/storage` の3ファイルがあり、Service Roleを使い、anonキーを使わない。HEADと内容が同じ。
   migrationは15本で、本番の適用済み15件と一致。アプリ用のmigrationは含まれない。

判定：権限剥奪とポリシー削除は、適用前の確認としては問題なし（第5.4節）。DB先・アプリ後の第一案を維持できる。
限界は、第5.4節の未確認（1）〜（5）。


## 13. C（本番適用）の承認依頼の材料（2026-11-13時点。承認は未取得）

**これは承認の依頼用の材料である。承認ではない。** Cの実行は、承認されていない。第3章のとおり、承認は操作ごとに取り、過去の承認（B-0・B-1・B-2）は流用しない。
実施日時は、準備完了後に決める。実施者・中止判断者は利用者。クラブ代表への連絡は、既存のLINE個別トークで行う。

### 13.1 対象環境

- 本番のSupabase（Pro、PostgreSQL 17.6）。接続は直接接続（ポート5432、pooler なし、B-1で確認）。接続先のホスト名は記録しない。
- 本番のデプロイ済みアプリ：`main` のコミット `8e70038`（第12.6節）。**新アプリのデプロイは、Cの承認に含めない。**

### 13.2 変更内容（`prisma migrate deploy` が適用する、未適用の11本）

| 区分 | 内容 |
| --- | --- |
| 追加 | アプリ用の新規テーブル22個、ENUM13個、関数3つ、トリガー・CHECK・一意制約。適用後、`public` のテーブルは全34個でRLS有効の想定 |
| 変更（Data API） | `public` の全テーブル・シーケンスから、`anon`・`authenticated` の権限を剥奪。今後作られるテーブル・関数の既定権限も変更（20260816224901） |
| 変更（Storage） | `storage.objects` の、`club-images` を含むポリシー4件を削除（20260817003046） |
| 既存HPのテーブル | **変更なし**（HPの10テーブルの名前は、11本のどれにも出てこない。第5.4節） |
| 取り消せないもの | `ALTER TYPE ... ADD VALUE`（新設のENUMのため、全体の戻しでは `DROP TYPE` で消せる） |

### 13.3 バックアップと復元確認

| 項目 | 状態 |
| --- | --- |
| 手動バックアップ（B-1） | 2026-11-12 15:05頃に取得（`public`・`auth`/`storage`のデータ・スキーマ参照・Storage本体15ファイル）。`shasum` 不一致0。**この時点より後の書込みは含まない** |
| 別環境での復元（B-2） | 2026-11-13、ローカルの使い捨てDBで復元。`public` の件数・履歴が一致。`auth`/`storage` は一部のみ（スキーマの版の差）。Storage本体は復元・SHA-256一致（5/10/0）。第12.5節 |
| 日次バックアップ | Pro、物理バックアップ7件。最古は日本時間2026-11-07 01:28:26、最新は同2026-11-13 01:30:47（2026-11-13の確認、第12.8節）。復元は取り消せず、中はオフライン（所要時間の目安なし）。ダウンロードなし、PITRは無効 |
| **適用の直前** | **手動バックアップの再取得が必要（別の承認）。** 日次バックアップの最新の取得日時の再確認も必要 |

### 13.4 dry-run（書込みなし）の結果

- 本番への読取り（B-0）：履歴が整合（適用済み15件、未適用11件）、`migrate diff` の差分は未適用分と一致、中止条件なし（第12.1・12.2節）。
- リハーサル（B-2、本番のコピー）：`migrate deploy` は約1秒、終了コード0。`migrate status` は最新（26件）、`migrate diff` は空。
  適用後、`anon`・`authenticated` の権限0件、`club-images` のポリシー0件。ロックの待ちは未計測（ローカルのため）。

### 13.5 戻し方

- 個別の戻しSQL（第9.5節）：22テーブル・関数3つ・ENUM13個・履歴11行・ポリシー4件・権限の戻し。**B-2の検証用DBで動作確認済み。本番では未実行。**
  新しいテーブルにデータが入った後は、`DROP TABLE` でデータが失われる。
- 途中で失敗した場合：失敗したmigrationは、全体が戻る（トランザクション）。再実行せず、第9.2節で判断する。
- アプリの不具合：アプリを前のデプロイへ戻す。DBは戻さない。
- DB全体の復元（最終手段）：第9.3節の下書き。Cron停止の方法（Supabase Cronのスイッチ）と日次バックアップの復元の仕様は、2026-11-13に確認した（第12.8節）。
  残る未確認は、実際のダウンタイムと、復元後のCronの状態。手動バックアップの本番への上書き復元は、リハーサルしておらず、採用しない。

### 13.6 既存HPへの影響の見込み

権限剥奪・ポリシー削除とも、影響なしの見込み（根拠は、デプロイ済みコード、B-0の権限の状態、7日間のLogs、公開バケットの設定。第5.4節・12.6節）。
アプリの順序は、DB適用 → 既存HPの確認（8.3）→ 新アプリのデプロイ。確認できない場合は、新アプリをデプロイせず、Cを保留して対処案を出す（8.1）。

### 13.7 未確認・残るリスク（本番でしか確認できないもの）

1. `storage.objects` の `DROP POLICY` の実行権限（第11節の13）。失敗した場合は、そのmigration全体が戻る。
2. `ensure_rls` による自動RLS有効化（同14）。適用後にRLSが34/34であることを確認し、満たさない場合は前方修正。
3. シーケンスの既定権限の、本番の適用前の状態（同15）。
4. 権限剥奪が、他のクライアントに影響しないか（同16）。7日間のLogsでは、`/rest/v1/` は0件（GraphQLと7日より前は未確認）。
5. Prismaの接続ロール（承認後、C直前に `select current_user` で確認）。
6. ローカルの検証の限界（同17）。
7. DB全体の復元が必要になった場合のみ：実際のダウンタイム（目安の表示なし）と、復元後のCronの状態（同19・20）。

### 13.8 承認の前に済ませること（現状）

| 項目 | 状態 |
| --- | --- |
| `migration.sql` を人が読む（#5） | **【修正：2026-11-13】済**（利用者が、第5.4節と2本に加え、残りの9本も読み終えたと報告。確認した時刻は記録していない。第12.7節・第12.10節） |
| 戻しSQLと、DB全体の復元手順の承認者の確認 | **【修正：2026-11-13】済**（右田和也が確認したと報告。確認した時刻は記録していない。第12.10節） |
| 実施の日時・体制・連絡 | **未**（日時は、準備完了後に決める） |
| 第8.1節のコミット照合 | `prisma/` は2026-10-31（`3c9c3e0`）から変更なし。C直前に `git rev-parse HEAD` を記録する |
| 適用直前の手動バックアップ | **未**（別の承認） |
| 日次バックアップの最新の取得日時の再確認 | **未**（管理画面の閲覧） |
| 接続先・`DATABASE_URL`・`.env` 系の確認 | C当日（第8.1節） |

### 13.9 承認を求める範囲（案）

**含める（【修正：2026-11-13、利用者の方針】）：** 第8.2節の、適用直前の `migrate status`（読取り）、`migrate deploy`（書込み）、適用後の `migrate status`（読取り）。
第8.3節の、適用直後の読取りSQLによる、件数・RLS・権限・ポリシー・migration履歴の確認。既存HPの公開ページ・画像・PDFの**表示確認**（ブラウザでの表示のみ）。
**含めない：** 新アプリのデプロイ、本番の初期化（G5）、Cron・Storage・Resendの変更、LINEの実送信、
戻しSQLやDB全体の復元の実行（実行する場合は、判断のうえ、別の承認）、本番のAuth・Storageへの書込み。
**【追加：2026-11-13】** 本番Storageのアップロード・差替え・削除と、新規ログイン操作も含めない。8.3から分け、第8.3.1節の別の承認（⑥）とする。
表示確認の成功を、書込みの確認済みとして扱わない。

### 13.10 中止条件

第9.1節のとおり。特に、`migrate deploy` の失敗、リハーサルの所要時間の数倍かかる場合、HPの異常（エラー・申込みの失敗）、8.3の不合格。
いずれの場合も、再実行せず、状況を記録して、第9.2節で判断する。

### 12.7 `migration.sql` の確認（第8.1節の「人が読み終えている」、2026-11-13）

- **利用者の報告：** 第5.4節の要約と、20260816224901（権限剥奪）・20260817003046（`club-images` のポリシー削除）の2本を、読み終えた。確認した時刻は記録していない。
- **【追加：2026-11-13】** 残りの9本も、右田和也が読み終えたと報告（確認した時刻は記録していない）。これで11本すべてを、人が読み終えた。
- **Claudeの読み（11本すべて）：** 上記2本以外の9本は、HPの10テーブルを参照せず、`DROP TABLE`・`TRUNCATE`・`DELETE`・`UPDATE`・`INSERT` を含まない（第5.4節）。
- **権限剥奪（20260816224901）の読み：**
  - 剥奪の対象は `anon`・`authenticated` のみ。`postgres`・`service_role` は含まれない。
  - 既定権限の変更は `FOR ROLE postgres IN SCHEMA public` のみ。他のロール（`supabase_admin` など）が作るオブジェクトの既定権限は変わらない。
  - テーブル・シーケンスの `PUBLIC` への権限は剥奪しない（`PUBLIC` は、関数の既定の実行権限だけを対象にする）。**既存の関数のEXECUTE権限は変わらない**（今後作られる関数のみ）。
  - 既存HPのテーブルは対象に含まれるが、本番の `anon`・`authenticated` には読み書きの権限がなかった（B-0）。
- **ポリシー削除（20260817003046）の読み：**
  - 対象は `storage.objects` のポリシーで、`qual` または `with_check` に `club-images` を**部分一致で含むもの**（`COALESCE` で、`qual` が空のINSERTも拾う）。
  - **部分一致のため、`club-images` と他のバケットを同じ条件に含むポリシーも削除される。** B-0で確認した本番の4件は、`club-images` のみの条件（第9.5節）。
    C直前の読取りで、`storage.objects` のポリシー名の一覧が4件から変わっていないことを、もう一度確認する。
  - 削除は `DROP POLICY IF EXISTS` で、存在しなければ何もしない。権限が足りない場合は、そのmigration全体が戻る（第11節の13）。

### 12.8 日次バックアップの復元の仕様とCronの呼び出し元（利用者が管理画面で確認し、報告、2026-11-13）

Claudeは本番へ接続していない。復元・Cronの切替・設定変更は、行っていない。

**日次バックアップ（Database → Backups）**

- 一覧：物理バックアップ7件。最古は2026-11-06 16:28:26 UTC（日本時間2026-11-07 01:28:26）、最新は2026-11-12 16:30:47 UTC（日本時間2026-11-13 01:30:47）。
- 復元の確認ダイアログ：「同じプロジェクトを上書きする」という明記はない。現在のDBを選んだ時点へ戻す説明で、操作は取り消せない。
  復元中はプロジェクトがオフライン。所要時間の目安の表示なし。バックアップ取得後のDBデータは失われる。
- 一覧の表示：Storage本体はDBバックアップに含まれず、バックアップ後に削除したファイル本体は復元されない。
- 各行は「Restore」のみ。ダウンロードのボタンなし。PITRは無効（「Point in time」タブに「Enable add-on」の表示）で、有効化しない。
- 公式資料（Supabase Docs「Backups」、2026-11-13に確認）：Proは直近7日間。復元中はアクセスできず、大きいほど長い。Storage本体を含まない。日次の物理バックアップは直接ダウンロードできない。

**Cron**

- Supabase Cron：`club-line-deliveries-every-5-minutes`（`*/5 * * * *`）、`storage-deletions-every-5-minutes`（`2-59/5 * * * *`）の2件のみ。各ジョブにActiveの切替スイッチがあり、両方オン（切替は操作していない）。
- `cron.job_run_details` の直近の結果は、どちらも succeeded（LINE配信 2026-11-13 12:00 JST、Storage削除 同11:57 JST）。
  **これはCronジョブの実行結果で、呼び出し先のHTTPステータスと、認証付きで処理が成功したかは未確認。** 本番のデプロイ済みアプリ（`8e70038`）には、この2つのエンドポイントがないため、呼び出しが404になっている可能性がある。
- VercelのCron Jobs（Legacy）：`/api/cron/delete-old-submission-logs` が1件Active、毎日03:00 UTC（日本時間12:00）。第11節の22のとおり、そのコミットに対応するルートが見当たらない。

**判定：** 第11節の19・20は、画面で確認できた範囲で解消。DB全体の復元（方法B）の実際のダウンタイムと、復元後のCronの状態は、未確認のまま。


## 14. C当日の進行表（1枚。2026-11-13時点の案。承認は未取得）

**これは当日の進行表である。承認ではない。** 実施者・中止判断者は利用者。実施日時は、準備完了後に決める。
詳細は各節を参照する。承認は操作ごとに取る（第3章）。**本番ターミナルと検証用ターミナルを分ける**（4.3）。

### 14.1 承認の取り方（当日までに、別々に取る）

| 承認 | 範囲 | 取得 |
| --- | --- | --- |
| ① 当日の読取り確認 | 8.1・8.2の1の読取り（`migrate status`、履歴、ポリシー名、件数、`select current_user`）。書込みなし | **【修正：2026-11-13】取得済**（2026-11-13 15:18、利用者の報告。実施日時は未定。第12.10節） |
| ② 適用直前の手動バックアップ | 第6.2〜6.5節（B-1と同じ範囲）。読取りのみ | **【修正：2026-11-13】取得済**（2026-11-13 15:18、利用者の報告。実施日時は未定。第12.10節） |
| ③ C（本番適用） | 8.2の `migrate deploy` と、8.3の読取り・表示確認（第13.9節の範囲） | **【修正：2026-11-16】取得済・実施済**（2026-11-16 13:22。第12.11節） |
| ④ 新アプリのデプロイ | 8.3が合格した場合のみ。Cの承認に含めない | 未 |
| ⑤ 戻しの実行 | 9.5の戻しSQL、9.3のDB全体の復元。必要になった場合のみ。実行ごとに承認 | 未（実行しない前提） |
| ⑥ 既存HPの動作確認（書込み・新規ログイン） | 8.3.1。テスト対象・影響・後片付けを、承認前に示す。Cに含めない。第8.3.1節に、画面名・ファイル名・年月（2099年7月）を記入済み | **【修正：2026-11-16】取得済**（2026-11-16 11:40、利用者の報告。第12.10節） |

### 14.2 前日まで

- [ ] 実施日時・時間帯を決める（HPの申込み・管理画面の更新が少ない時間帯。4.1）。クラブ代表への連絡の文面を用意する（既存のLINE個別トーク）。
- [ ] 手順書の変更を取り込んだスクリプトを、**本番に使う前に、ローカルで確認する**。
      第6.4節のNFC突き合わせと余分なファイルの確認は、**確認済み**（2026-11-13、第12.9節）。
      第7.4節の `f13-storage-check.mjs` は、この形では未実行（第7.4節の注記）。
- [ ] 作業用のMacの準備：FileVaultが有効、`libpq`（`pg_dump` 18以上）、Docker、十分な空き容量、電源とネットワーク。
- [ ] 他のデプロイが入らない状態にする（Vercelのプレビュー・本番の自動デプロイ、他のmigration）。
- [ ] 暗号鍵・Authの設定・環境変数の一覧の控え（6.1。LINE関連は本番にテーブルがないため、現時点では対象外）。
- [ ] 承認①②③の取得。本書の第13章を、承認者が読む。

### 14.3 当日の進行

| # | 段階 | 内容（参照） | 場所 | 見込みの所要時間 | 次へ進む条件 |
| --- | --- | --- | --- | --- | --- |
| 0 | 開始 | 開始時刻を記録。クラブ代表へ開始を連絡 | — | — | — |
| 1 | 端末の確認 | 新しいターミナル。`DATABASE_URL` が未設定、`.env` 系が想定どおり（8.1）。`git rev-parse HEAD` を記録し、`prisma/` が2026-10-31（`3c9c3e0`）から変わっていないことを確認 | 本番用ターミナル | 数分 | すべて満たす |
| 2 | 日次バックアップの確認 | 管理画面で、最新の取得日時を確認して記録（4.6）。**閲覧のみ** | 管理画面 | 数分 | 取得履歴がある |
| 3 | 本番の読取り確認 | `f13_prod_env`、ポートと pooler（5432・poolerなし）。`select current_user` を1回。履歴（5.1）が15件完了・未完了0。`storage.objects` のポリシー名が4件のまま（5.3、第12.7節）。`migrate status` で未適用11件 | 本番用ターミナル | 10〜20分（未計測） | 5.5の中止条件に当たらない |
| 4 | 手動バックアップ | 第6.2〜6.5節。6.2（取得前の記録）→ 6.3（`pg_dump`）→ 6.4（Storage本体）→ 6.5（取得後の再確認、`SHA256SUMS`）。取得の開始・終了時刻を記録 | 本番用ターミナル＋管理画面 | B-1の実績は約36分。同程度の見込み | 6.5の通過条件がすべて満たされ、取得後の `diff` が0 |
| 5 | **go / no-go** | 中止判断者（利用者）が、8.1のチェックリストを上から確認。**未確認があれば、Cへ進まない** | — | 数分 | すべて✓ |
| 6 | **適用（C）** | 8.2：適用直前の `migrate status` → `migrate deploy` → 適用後の `migrate status`。終了コードと、migration名だけを記録（接続先のホスト名は共有しない）。開始・終了時刻を記録 | 本番用ターミナル | リハーサルは約1秒（本番は未計測） | 終了コード0 |
| 7 | 適用直後の確認（DB） | 8.3の読取り：`migrate status` が最新（26件）、HPのテーブルの件数が変わらない、RLS 34/34、`club-images` のポリシー0件、`anon`・`authenticated` の権限0件、履歴26件・未完了0 | 本番用ターミナル | 10〜20分（未計測） | すべて満たす |
| 8 | 適用直後の確認（HP、表示のみ） | 公開ページの表示、スタッフ画像・ページ内容の画像の表示、月間練習計画PDFの表示（8.3）。**書込みと新規ログインはしない**（8.3.1・承認⑥） | ブラウザ | 10〜20分（未計測） | すべて問題なし |
| 8b | 書込み・新規ログインの確認（承認⑥。Cとは別） | 8.3.1。テスト画像（新規スタッフ・下書き）とテストPDF（下書き）の作成と削除、新規ログイン1回、後片付けの確認。**承認⑥がなければ行わない** | ブラウザ・管理画面 | 10〜20分（未計測） | 後片付けまで完了 |
| 9 | 判定 | 合格 → 承認④を取り、新アプリをデプロイ（別の作業。書込みは未確認である旨を承知して判断する、8.1）。不合格 → 14.4、9.2 | — | — | — |
| 10 | 後片付け | `unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE PGOPTIONS`。ターミナルを閉じる。台帳に記録（第10章）。クラブ代表へ結果を連絡 | — | — | — |

- **所要時間の「未計測」は、本番で初めて測る値。** 初回のため、余裕を持った時間帯を確保する。
- 手順4の取得後〜手順6の適用までの書込みは、バックアップに含まれない。**手順4と手順6の間を、空けない**（4.1）。空いた場合は、再取得するか、許容するかを、中止判断者が決める。
- 手順6は、再実行しない。失敗した場合は、14.4へ。

### 14.4 止める条件（中止判断者が、その場で判断する）

| 時点 | 条件 | 対処 |
| --- | --- | --- |
| 手順1〜3 | 想定外の端末の状態、接続先が6543またはpooler、履歴が整合しない、ポリシー名が4件でない、`migrate status` が想定と違う | 以降へ進まない。原因を調べる。5.5・9.1 |
| 手順4 | `pg_dump` の失敗、`diff` が0でない、Storageの件数・サイズの不一致 | 取り直す。解決するまで、手順6へ進まない |
| 手順5 | 未確認の項目、承認者の不安 | Cへ進まない（延期） |
| 手順6 | `migrate deploy` が失敗、リハーサルの数倍かかる、HPでエラー | **再実行しない。** 状況を記録し、9.2で判断する。失敗したmigrationは全体が戻る。それ以前に成功したものは残る |
| 手順7〜8 | 確認に不合格（RLS 34/34にならない、画像・PDFが表示できない、など） | 新アプリをデプロイしない。9.2：個別の戻しSQL（⑤の承認）、または前方修正。DB全体の復元は最終手段（9.3） |

### 14.5 当日の記録（第10章の台帳へ）

- 各承認の日時、`git rev-parse HEAD`、日次バックアップの最新取得日時、手動バックアップの開始・終了時刻と `SHA256SUMS` の項目数。
- `migrate deploy` の開始・終了時刻と終了コード。8.3の各確認の結果（件数と、表示確認の可否のみ）。8.3.1を実施した場合は、別に記録する。
- 中止・延期した場合は、理由と時刻。**接続先のホスト名、資格情報、個人情報、生のログは、記録しない。**

### 14.6 当日に行わないこと

新アプリのデプロイ（承認④）、本番の初期化（G5）、Cron・Storage・Resendの設定変更（G6）、LINEの実送信、
Authの設定変更、戻しSQL・DB全体の復元の実行（承認⑤）、
本番Storageのアップロード・差替え・削除と新規ログイン操作（承認⑥がない間）。

### 12.9 手順書のスクリプトのローカル確認（利用者が実行・報告、2026-11-13）

第6.4節の確認を、手順書に書いた形のまま、B-1のバックアップ（ローカルのファイル）に対して実行した。本番へは接続していない。読取りのみ。

- `storage-list-before.tsv`：15行、すべて3列（バケット・パス・サイズ）。バックアップのディレクトリは権限700。
- 余分なファイル（`.DS_Store`・未完了のダウンロード）：0件。
- NFC突き合わせ：期待15、実際15、欠け0、余り0、サイズ違い0（B-1の15行対15行・差0と同じ結果）。
- 未確認：第7.4節の `f13-storage-check.mjs`（ポートを環境変数で指定する形）は、この形では未実行。次にB-2相当の検証用環境を作るときに、最初に確認する。


### 12.10 承認①②の取得の記録（利用者の報告、2026-11-13）

**【追加：2026-11-13】** Claudeは本番へ接続していない。承認の記録は、利用者の報告に基づく。承認依頼文は、第13章・第14章をもとに作成した（チャットで提示。本書には転記していない）。

| 承認 | 承認者 | 判断 | 日時 | 条件・メモ |
| --- | --- | --- | --- | --- |
| ① 当日の読取り確認 | 右田和也 | 承認 | 2026-11-13 15:18 | なし |
| ② 適用直前の手動バックアップ | 右田和也 | 承認 | 2026-11-13 15:18 | なし |
| ⑥ 既存HPの動作確認（書込み・新規ログイン） | 右田和也 | 承認 | 2026-11-16 11:40 | なし（範囲は第8.3.1節） |
| ③ C（本番適用） | 右田和也 | 承認 | 2026-11-16 13:22 | 特になし（範囲は第13.9節） |
| ④ 新アプリのデプロイ | 右田和也 | 承認 | 2026-11-17 11:30 | 承認依頼文の送付前にマージ（第12.12節の逸脱）。Cの承認には含めない |

- **【修正：2026-11-16】実施日時：2026-11-16 11:40**（利用者の報告）。①②の承認（2026-11-13 15:18）は、この日時のものとして、承認者（右田和也）が有効と報告した。
  実施日時の選んだ理由（HPの書込みが少ない時間帯か）は、報告に含まれていない。実施日が延びる場合は、①②を取り直す（特に②は、取得時点の状況が変わる）。
- 前日までの準備（第14.2節）は、利用者の報告で、実施日時の決定を除き確認済み。クラブ代表への連絡文の下書きも完了。

**③の前に決めること（2026-11-13、利用者の報告で更新）：**

1. ~~第8.3節のHP確認と、第13.9節の範囲の食い違い。~~ **解消済み。** Cに含めるのは、表示確認まで。
   本番Storageの書込みと新規ログイン操作は、8.3.1の別の承認（⑥）へ分けた。第13.9節・第8.3節・第14章を揃えた。
   **⑥は実施する**（利用者の判断。最小限：テスト画像1枚のアップロードと削除、既存の管理者での新規ログイン1回）。
   第8.3.1節の表に、利用者指定の画面名・ファイル名（画像・PDF・ログイン）を記入した。PDFも⑥で行う。
   テスト用の月別練習計画の年月は2099年7月。**2026-11-16：** 利用者が、管理画面で、2099年7月の月別練習計画がないことを確認し、メモしたと報告。⑥の承認は取得済み。
   ⑥の前に、新アプリのデプロイ（④）をするかは、④の承認者が決める。
2. ~~`migration.sql` を人が読む（第8.1節）~~ **済。** 右田和也が、残り9本も読み終えたと報告。確認した時刻は記録していない。
3. ~~戻しSQLとDB全体の復元手順の承認者の確認（第8.1節）~~ **済。** 右田和也が確認したと報告。確認した時刻は記録していない。
   ただし、DB全体の復元は未リハーサル（第9.3.1節）。実行は⑤の承認が別に必要。

- **【追加：2026-11-16】** クラブ代表へ、開始を既存のLINE個別トークで連絡済み（利用者の報告）。

**残り（2026-11-16）：** ~~④の承認~~ **【修正：2026-11-17】** ④は承認・実施済み（第12.12節）。③と⑥も実施済み。

### 12.11 C当日の実施記録（利用者が実行・報告、2026-11-16）

**【追加：2026-11-16】** Claudeは本番へ接続していない。手順の案内と、結果の記録のみ。接続先のホスト名、資格情報、個人情報、Storageのパス、生のログは記録していない。

| 手順 | 時刻（JST） | 結果 |
| --- | --- | --- |
| 1 端末の確認 | 11:55 | `HEAD` 68835e6。`DATABASE_URL` は未設定。`.env` 系は `.env.example`・`.env.local`・`.env.prod`（素の `.env` なし）。`prisma/` は `3c9c3e0` から差分0。未コミットの変更は、手順書のみ |
| 2 日次バックアップ | 手順1の後 | 最新の取得は 2026-11-15 16:30:57 UTC（日本時間11-16 01:30:57） |
| 3 本番の読取り | 手順2の後 | ポート5432、pooler なし。`current_user` は `postgres`。`pg_dump`・`psql` は18.6。履歴は完了15・未完了0。`storage.objects` のポリシーは4件。`migrate status` は未適用11件。`public` のテーブルは12（HPの11＋`_prisma_migrations`） |
| 4 手動バックアップ | 12:13:51〜13:13:44 | `pg_dump` 3本とも終了コード0。`pg_restore --list` は103行。Storage本体は15件（`club-documents` 5・`club-images` 10・`club-app-attachments` 0）で、パス・件数・サイズが一致（欠け0・余り0・サイズ違い0）。余分なファイル0。取得後の `diff` 3つはすべて0（約1時間、HPのテーブル・Auth・Storageに変化なし）。`SHA256SUMS.txt` は28項目で、不一致0 |
| 5 go / no-go | 13:22より前 | 第8.1節の確認を、承認者が実施し、go。③の承認は 13:22 |
| 6 適用 | 13:22:41（確認開始）。適用 13:22:55〜13:23:13（18秒） | 適用前の未適用11件。`migrate deploy` の終了コード0。適用後の `migrate status` は up to date（26件） |
| 7 DBの確認 | 手順6の後 | HPのテーブル：追加22・消失0、総数34。RLS 34/34。`storage.objects` のポリシー0件（`club-images` を含むもの0件）。`anon`・`authenticated` の権限0件。履歴26件・未完了0 |
| 8 HPの表示確認 | 手順7の後 | 公開ページ、スタッフ画像、ページ内容の画像、月間練習計画PDFの表示と開く操作が、すべて問題なし |
| 8b 書込み・新規ログイン（⑥） | 13:31:49〜13:40:55（約9分） | 新規ログイン○。テスト画像（新規スタッフ・下書き）の作成・表示・削除○。テストPDF（2099年7月・下書き）の作成・削除○。下書きは公開ページに出なかった。Storageの件数・バイト数の `diff` は0行。`Staff` 4→4、`MonthlyPracticePlan` 5→5。2099年の計画0件。`LoginSubmissionLog` は49→53（+4。結果は `SUCCESS` 4件。利用者が4回ログインしたことと一致） |

**逸脱・備考：**
- **バックアップのパス修正：** Storage本体のダウンロードで、`club-documents` のPDF 5件のパスが、バケット内の相対パスと違っていた（`2026/7/…` と `monthly-practice-plans/2026/07/…`）。利用者が、スクリプトで、保管先の内でファイルを移動した。移動の前に、サイズの一致を確認している。あわせて、`.DS_Store` を削除した。手順書の手順にはなく、保管先のローカルのファイルのみを対象とした。移動後に、パス・件数・サイズが一致し、`SHA256SUMS` を作成した。
- 手順4は、`pg_dump` 3本の終了コードを、画面の出力で確認した（報告書式では「未記録」）。
- `migrate deploy` は18秒（B-2のリハーサルは約1秒）。ロックの待ちなどの異常は、報告されていない。

**判定：** 第8.3節（読取り・表示）と第8.3.1節（書込み・新規ログイン）は、合格。

**第11節の未確認の更新：**
- 13（`DROP POLICY` の権限）：**解消**（`migrate deploy` が終了コード0、ポリシー0件）。
- 14（`ensure_rls`）：**解消**（RLS 34/34）。
- 21（適用後の現行HPの互換性）：**表示・画像とPDFの書込み・ログインを確認**。
- 15（シーケンスの既定権限の、本番の状態）：**未確認のまま**。
- 16（他のクライアントへの影響）：7日間のLogsの範囲外は未確認のまま。適用後に、HPの異常の報告は受けていない。

**未実施（予定どおり）：** 新アプリのデプロイ（④）、本番の初期化（G5）、Cron・Storage・Resendの変更（G6）、LINEの実送信、戻し（⑤）。

### 12.12 ④ 新アプリのデプロイの実施記録（利用者が実行・報告、2026-11-17）

**【追加：2026-11-17】** Claudeは本番へ接続していない。デプロイ・マージも行っていない。手順の案内と、結果の記録のみ。秘密値、資格情報、個人情報、生のログは記録していない。

| 項目 | 結果 |
| --- | --- |
| 対象 | PR #17（`feat/club-app-foundation` → `main`）。マージ前の最新コミット 2a52306、156コミット |
| マージ前の確認 | `origin/feat/club-app-foundation` が 2a52306 と一致。PRは競合なし。Previewビルド成功。Previewで `/club-login` と `/` が開く。先行修正（`contact.ts`）は `origin/main` と差分なし。競合の予行も競合なし。`.env.example` は変数名と空の値のみ |
| 環境変数（名前のみ） | Production に必須分が設定済み。`LINE_CREDENTIAL_ENCRYPTION_KEY` は本番専用の鍵を新規に発行し、`.env.prod`・Vercel・パスワード管理ツールに登録済み（利用者の報告）。`DIRECT_URL`・`NEXT_PUBLIC_LIFF_DEBUG` は未設定で、設定不要 |
| 承認 | 右田和也。承認 2026-11-17 11:30 |
| マージ | 2026-11-17 11:30。`main` は 46b997a（PR #17のマージコミット） |
| 本番デプロイ | `BuXnGMEVd`。Production / Current / Ready |
| デプロイ後の確認 | 公開トップ `/`・スタッフ紹介・練習計画の表示、画像とPDFの表示、既存の管理者のログインと管理画面、`/club-login` の表示、Vercel Cron の新パス `/api/cron/delete-old-security-logs` があり旧パスがないこと。すべて問題なし（利用者の報告） |
| 戻し | 使っていない |

**逸脱・備考：**
- **承認依頼文の送付前にマージした。** 承認依頼文の「実施日時」と「承認」の時刻は、いずれも 11:30（マージの時刻と同じ）で、事前の承認ではなく、事後の記録になる。利用者が、マージ後に依頼文を作成して記入した。本番への影響（ビルド失敗・表示不良）は報告されていない。次回以降は、承認の取得後にマージする。
- マージ前に控えるはずだった、直前の本番デプロイの名前・時刻は、報告に含まれていない。戻しが不要だったため、影響はない。
- デプロイ後の確認の時刻は、報告に含まれていない。
- 適用後（DB migration後）のバックアップの取り直しは、行っていない。

**判定：** ④は、デプロイ後の確認が合格。

**未実施（予定どおり）：** 本番の初期化（G5）、Cron・Storage・Resend・Authの変更（G6）、LINEの実送信、戻し（⑤）、Cronの手動実行。

**今後の注意：**
- Vercel Cron `/api/cron/delete-old-security-logs` は、`0 18 * * *`（UTC）で、初回は 2026-11-17 18:00 UTC（日本時間 11-18 03:00）。たまった古いログが削除される可能性がある。
- Supabase 側の Cron（`club-line-deliveries`・`storage-deletions`）が、新アプリのAPIを呼ぶようになる。実際の動作の確認は、G6の範囲。
- 第11節の15（シーケンスの既定権限）・16（他のクライアントへの影響）は、未確認のまま。

### 12.13 台帳（第10章）への転記と後始末の決定（Claudeが転記、2026-11-17）

**【追加：2026-11-17】** 利用者の依頼で、第10章の項目へ、第12.1〜12.12節の内容を転記した。新しい事実は含まない（出どころの節を併記）。
Claudeは本番へ接続していない。URL・資格情報・個人情報・Storageのパス・バックアップの中身は記録しない。

| 項目 | 記録 |
| --- | --- |
| 承認 | ①② 2026-11-13 15:18、B-0 2026-11-11、B-1 2026-11-12、B-2 2026-11-13 07:05:54、⑥ 2026-11-16 11:40、③（C）2026-11-16 13:22、④ 2026-11-17 11:30。承認者はいずれも右田和也。④は事後の記録（第12.10・12.12節） |
| 対象 | Cの実施時の `HEAD` 68835e6、migration 11本（`20260816221153_add_club_app_schema` 〜 `20261031000000_f11_event_practice_batch`）、サーバー 17.6、`pg_dump` 18.6。④は PR #17、`main` 46b997a、デプロイ `BuXnGMEVd`（第12.1・12.11・12.12節） |
| B-0 | 履歴15件・すべて完了、未適用11件。種類：先頭15件が適用済みで、残りが未適用（第5.1節）。差分は、アプリの新規オブジェクトのみ（`DROP` 0、既存HPへの `ALTER` なし）。中止条件なし。通過（第12.1・12.2節） |
| 日次バックアップ（4.6） | Pro、物理バックアップ7件（2026-11-06 16:28:26 UTC 〜 2026-11-12 16:30:47 UTC）。復元できる期間は直近7日間。PITRは無効（有効化しない）。ダウンロードは不可。復元はプロジェクトのオフラインを伴い、Storage本体は含まない（第12.8節）。Cの当日の最新は 2026-11-15 16:30:57 UTC（第12.11節） |
| B-1 | 2026-11-12 14:56:07〜15:32:44。`pg_dump` 3本とも終了0。Storage 15件（`club-documents` 5・`club-images` 10・`club-app-attachments` 0）、パス・サイズの差0。`SHA256SUMS` 28件、不一致0。暗号鍵・設定の保全：`LINE_CREDENTIAL_ENCRYPTION_KEY` は、本番用を2026-11-17までに発行し、`.env.prod`・Vercel・パスワード管理ツールに登録済み（利用者の報告）。その他の環境変数は項目ごとの確認（第12.3・12.4節） |
| 当日の手動バックアップ（②） | 2026-11-16 12:13:51〜13:13:44。`pg_dump` 3本とも終了0、Storage 15件で欠け0・余り0・サイズ違い0、取得後の `diff` 0、`SHA256SUMS` 28件・不一致0（第12.11節） |
| B-2 | `public.dump` の復元：終了1・エラー4件（環境差、件数・履歴は一致）。リハーサルの `migrate deploy` 終了0（約1秒）、`migrate status` 26件、`migrate diff` 空。戻しSQLは動作。Storage本体の復元確認は5/10/0、失敗0・不一致0。`auth`・`storage` のデータ復元：エラー14件（ベストエフォート）。通過（条件付き。第12.5節） |
| 戻しSQL | 作成済み。検証用DBでの確認：戻し後のスキーマの差は、権限（ACL）と環境差を除いて0件（第12.5節）。本番では未使用 |
| C | 実施者 右田和也。2026-11-16 13:22:55〜13:23:13（18秒）、`migrate deploy` 終了0、適用後 up to date（26件）。確認：テーブル追加22・消失0（総数34）、RLS 34/34、`storage.objects` のポリシー0件、`anon`・`authenticated` の権限0件、履歴26件・未完了0。表示確認（8.3）・書込みと新規ログイン（⑥、8.3.1）は合格。`LoginSubmissionLog` +4（利用者の4回のログインと一致）（第12.11節） |
| ④（追加項目） | 2026-11-17 11:30 マージ、Production / Ready。確認（公開ページ・画像・PDF・管理者ログイン・`/club-login`・Cronの新パス）は合格。戻しは未使用。逸脱：承認依頼文の送付前にマージした（第12.12節） |
| 後始末 | 下の決定を参照 |

**後始末の決定（利用者の指示、2026-11-17）：**

| 対象 | 保持期限・削除日 | 備考 |
| --- | --- | --- |
| 手動バックアップ（`~/f13-backups/` の B-1 と ② の両方） | **G9の安定確認が済むまで保持する。済んだら、右田が削除日を決める。** | **削除候補日：2026-12-17**（約1か月後）。G9が未了なら延長する。個人情報（顔写真など）を含み得るため、保管先はGit管理外・クラウド同期対象外・権限700を維持する。削除は、削除対象のフォルダ名と大きさを確認してから、右田が実行する |
| B-2の検証用DB・復元ファイル | **削除済み** | 検証用のコンテナ（6）・ボリューム（2）・ネットワーク（1）は `supabase stop --no-backup` で削除。作業ディレクトリは 2026-11-13 10:32:24 と 10:34:13（JST）に削除（第12.5節）。元のバックアップ `20261112-150114` は残した（上の行） |
| 本番ターミナルの `PG*`・`F13_BACKUP` | **解除済み・残りなし** | 利用者の報告（2026-11-17）。`.env.prod` はG5・G6で使うため残す |
| 日次バックアップ（Supabase側） | Supabaseの保持（直近7日間）に従う | 当方では削除しない |

**台帳に書けない（未確認・未了）事項：** 第11節の15（シーケンスの既定権限）・16（他のクライアントへの影響）、G5・G6・G7の未了、Vercel Cronの初回実行（2026-11-18 03:00 JST）の結果。

## 15. F13の後に行う作業（順序・判断の記録。2026-11-18、利用者の判断）

**【追加：2026-11-18】** 実施の承認ではない。各作業は、操作ごとに、別の承認を取る（第3章）。値（鍵・アドレス・ID）は記録しない。

### 15.1 F13の残りの順序

G5（本番初期化スクリプト）→ G6（Storage・環境変数・Cron・Resendの確認手順）→ G8（プラン切替の手順書）→ G7（本番smoke testとWebhook切替）→ G10（手動受入）→ G9（公開判断）→ 環境変数の整理 → ドメイン切替。

- **G8をG7の前に置く理由：** STARTERのままでは、OWNER・MEMBERがアプリを開けない（`app/(club-app)/club/club-app-authorization.ts`）。G7のsmoke testの直前に、承認を取って、一時的にSTANDARDへ切り替え、戻し方も決めておく必要がある。
- **G5で作るもの：** `Club`（ARAO U-12、スラッグ `arao-u12`、STARTER）、`AppUser` と `ClubMembership`（クラブ代表者1名。OWNER / ACTIVE / `canManageWebsite = true`）、`PlatformAdmin`（開発者1名。DEVELOPER）、`ClubEmailSetting`。`ClubLineSetting` はG7（Webhook切替）で入れる。
- OWNER・PlatformAdminの本番Auth（user.id・email）は、利用者が照合済み（2026-11-17〜18の報告）。実値は、初期化の実行時に利用者が指定する。
- `WEBSITE_ADMIN_USER_IDS` は維持する。DB方式へは切り替えない。OWNERにならない既存HP管理者は、この方式のまま使える。

### 15.2 `ClubEmailSetting` の扱い（決定）

- 現在、**`ClubEmailSetting` を読むコードはない**（型の公開のみ）。HPの問い合わせ・体験申込みの運営向け通知は、`FormNotificationSetting`（`formType` が `CONTACT`・`SESSION_APPLICATION`）と `ADMIN_EMAIL` で動いており、G5で `ClubEmailSetting` を作っても挙動は変わらない。
- `FormNotificationSetting` は、HPの2種類のフォームの通知先であり、アプリのお知らせ・イベントの通知先ではない（アプリの通知はLINE）。
- **G5では `notificationEmail` を `null` にする。** `fromName` は `ARAO U-12`、`isEnabled` は `true`。理由：`notificationEmail` が1件（`String?`）で、ARAOが現在4人に通知している運用を表せない。
- **マルチテナント化で移行するときの設計方針：** `notificationEmail` は、`FormNotificationSetting.emails` と同じ形（改行区切りの文字列）にする（利用者の判断）。最大5件、形式チェックの仕様を維持する。
  あわせて、`FormType`（問い合わせ・体験申込み）ごとに宛先を分けている現行の仕様を、移行後も維持できるかを決める（`ClubEmailSetting` は1クラブにつき1件のため、このままでは種類を分けられない）。
- 不具合報告（宛先は開発者）と招待（宛先は招待された本人）は、`ClubEmailSetting` の通知先の対象ではない。招待は、送信元の表示名だけがクラブに関係する。
- それまで、HPは `FormNotificationSetting`・`ADMIN_EMAIL` を使い続ける。スキーマの変更は、マルチテナント化の作業で行い、F13の範囲では行わない。

### 15.3 環境変数の整理（G9の後）

- 順序：G5でDBへ初期データを入れる → G7で、DBの値で動くことをsmoke testで確認し、LINEのWebhookを切り替える → G9の安定確認の後に、環境変数を**1変数ずつ**消す。
- 消す前に、変数ごとに確認する：コードがその変数をまだ読んでいないか、DB側の値が正しいか、戻せるか（値はパスワード管理ツールに残す）、消した直後に動作確認できるか。
- `LINE_CHANNEL_SECRET` は「移行期間中のみ」（`.env.example`）。`LINE_CHANNEL_ACCESS_TOKEN`・`LINE_ADMIN_GROUP_ID`（既存HP用のLINE通知）は、DBへ移す対象かを、コードの読み先を調べてから決める（未確認）。

### 15.4 Resendの共通ドメイン化と `MAIL_FROM_ADDRESS`（公開後の別の作業）

- 順序：共通の独自ドメインを取得 → 開発者名義のResendアカウントでドメインを登録し、DNSの検証（SPF・DKIMなど）を済ませる → テスト送信で確認 → **`RESEND_API_KEY` と `MAIL_FROM_ADDRESS` を同時に**切り替える（VercelのProductionと `.env.prod`）→ 再デプロイして、実際のメール送信を確認する。
- キーと送信元は、必ずセットで変える。片方だけでは、Resendが送信を拒否する。切替の直前に、旧の値をパスワード管理ツールへ残す（戻すため）。
- `APP_BASE_URL` も、同じ時期に変わり得る。招待メール・パスワード再設定のリンク・`robots`・`sitemap`・認証のSite URL・Redirect URLに影響するため、一緒に計画する。
- 他のクラブを実際に受け入れるのは、G9の公開判断の後。先にドメインの切替を済ませると、他のクラブのメールがARAO名義の送信元から出ることを避けられる。

## 16. G5：本番初期化スクリプト（`scripts/initialize-production-club.ts`）

**【追加：2026-11-18】** 実装とローカル検証の記録、および本番での実行手順の案。**本番での実行（承認D・E）は未承認・未実施。** Claudeは本番へ接続していない。

### 16.1 何をするか

- 作成するのは5テーブルだけ：`Club`（プランは `STARTER`、タイムゾーン `Asia/Tokyo`）、`AppUser`、`ClubMembership`（OWNER / ACTIVE / `canManageWebsite = true`）、`PlatformAdmin`（DEVELOPER / 有効）、`ClubEmailSetting`（`fromName` はクラブ名、`notificationEmail`・`replyToEmail` は `null`、有効）。
- 触らないもの：既存HPのテーブル、`ClubLineSetting`、プラン切替（G8）、`WEBSITE_ADMIN_USER_IDS`。
- **作成のみ（更新しない）。** 既存の行が期待値と**完全一致**なら `UNCHANGED`、**1項目でも違えば** `CONFLICT` で全体を中止する（何も書かない）。再実行しても、安全に同じ結果になる（冪等）。
- 実行は1つのトランザクション（Serializable）。適用の開始時に、照合をやり直す。途中で失敗すれば、全体をロールバックする。
- 出力は、テーブル名と `CREATE` / `UNCHANGED` / `CONFLICT`、接続先の指紋だけ。メール・user.id・名前・接続先のホスト・生のエラーは出さない。

### 16.2 安全装置

| 装置 | 内容 |
| --- | --- |
| `--target` | `production` はローカル以外のDB・Supabaseだけ、`local` はローカルだけを許可する。DBへ接続する**前**に確認する。本番は直接接続（ポート5432）だけを許可し、pooler（6543など）を拒否する |
| 接続先の指紋 | dry-runが、DATABASE_URLのホスト・ポート・DB名から作った12文字のハッシュを表示する。**本番のapplyは、`--expect-fingerprint` でそれを要求する。** dry-run未実施・別環境への取り違えを防ぐ |
| Authの照合 | `getUserById`（読取りのみ）で、user.idの実在とメールの一致を、OWNER・PlatformAdminの両方で確認する。不一致なら、dry-runの段階で中止する |
| 入力ファイル | JSON。通常のファイル（シンボリックリンク不可）で、**権限600**。未知の項目は拒否する。内容は、エラーにも出力にも含めない |
| 実値の扱い | user.id・email・名前は、チャット・手順書・シェルの履歴に残さない（入力ファイルで渡す） |

### 16.3 入力ファイル（例。実値は書かない）

保管先は、リポジトリの外（例：`~/f13-input/`、権限700）。ファイルは権限600。実行後は、削除する。

```json
{
  "owner": { "authUserId": "<UUID>", "email": "<メール>", "name": "<表示名>" },
  "platformAdmin": { "authUserId": "<UUID>", "email": "<メール>", "name": "<表示名>" }
}
```

### 16.4 本番での実行手順（案。承認DとEを、別々に取る）

**前提：** 本番用のターミナル（`PG*` 変数が未設定のもの）、`.env.prod`、入力ファイル。承認D・Eのたびに、実施日時・承認者を第12章へ記録する。

**承認D：本番のdry-run（書込みなし。DBは読取り、Authは読取り）**

```bash
cd ~/Documents/arao-u12-hp
git status --short
npx dotenv-cli -e .env.prod -- npm run club:prod:init -- \
  --club-name "ARAO U-12" --club-slug arao-u12 --target production \
  --input-file ~/f13-input/initial.json --dry-run
```

- 見るもの：5テーブルがすべて `CREATE`（初回）。`CONFLICT` があれば中止して報告する。**「接続先の指紋」を控える**（Eで使う）。
- 終了コード0であること。DBへは何も書かない。

**承認E：apply（作成）**

```bash
npx dotenv-cli -e .env.prod -- npm run club:prod:init -- \
  --club-name "ARAO U-12" --club-slug arao-u12 --target production \
  --input-file ~/f13-input/initial.json --apply --expect-fingerprint <Dで控えた指紋>
```

- 終了コード0、5テーブルが `CREATE`。
- 直後に、もう一度dry-runを実行し、5テーブルがすべて `UNCHANGED` になることを確認する（冪等・完了の確認）。

**実行後：** 入力ファイルを削除する（`rm ~/f13-input/initial.json`）。`PG*` を使った場合は `unset` する。

### 16.5 適用後の確認（読取りのみ。第8.2節と同じ読取り専用の接続で）

- 5テーブルの件数：`Club` 1、`AppUser` 1、`ClubMembership` 1、`PlatformAdmin` 1、`ClubEmailSetting` 1（他のクラブがなければ）。
- `Club` の `planType` が `STARTER`。`ClubMembership` が OWNER / ACTIVE / `canManageWebsite = true`。
- 5テーブルのRLSが有効。`anon`・`authenticated` の権限が0件（第12.11節と同じ確認）。
- 既存HPのテーブルの件数が、適用前と同じ（本番の読取りで比べる）。

### 16.6 戻し方

作成した行だけを、IDを指定して削除する（`Club` の削除で `ClubMembership`・`ClubEmailSetting` もカスケードで消える）。**本番では、人が内容を確認してから、承認を取って実行する。** このスクリプトに、削除の機能はない。

```sql
-- 例（IDはdry-run・apply後の読取りで確認したものを入れる）
BEGIN;
DELETE FROM "Club" WHERE "slug" = 'arao-u12';
DELETE FROM "AppUser" WHERE "id" = '<owner の user.id>';
DELETE FROM "PlatformAdmin" WHERE "id" = '<platformAdmin の user.id>';
-- 件数を確認してから COMMIT（想定外なら ROLLBACK）
```

### 16.7 ローカルでの検証結果（2026-11-18、Claudeが実行）

| 項目 | 結果 |
| --- | --- |
| unit（引数・入力ファイル・接続先ガード・指紋・Auth照合） | 13件成功 |
| DB統合（ローカルDB。実行前に、DBがループバック・ポート54322であることを確認） | 8件を含む計21件成功。5テーブルの作成、dry-runが書込まない、再実行の冪等（更新時刻も不変）、プラン違いで全体を中止、メールの衝突、Membership・PlatformAdmin・メール設定の差分で中止（元の値を書き戻さない）、他クラブ非接触、出力に個人情報を含まない |
| 後片付け | 試験で作ったクラブ・AppUser・PlatformAdminの残りは0件 |
| 型チェック・lint | エラー0（lintの警告3件は既存のファイル） |
| `npm test` 全体 | 149ファイル成功・4ファイル失敗。**失敗は4ファイルとも、今回の変更前から** `DATABASE_URL` 未設定で落ちる既存のDB統合試験（今回の変更を外しても同じ4ファイル） |
| CLIのスモーク | 引数なし→安全なエラー（終了1）。ダミーの入力で `--target local` の dry-run → Auth不一致で中止（終了1）。`--target production` にローカルの接続先 → 中止（終了1） |

**未確認：** 本番のSupabase Authとの実際の照合（承認Dで初めて確認）。ローカルのSupabase Authのユーザーを使った、ローカルでの通しの実行（Authの照会は、関数を差し替えた試験のみ）。

### 16.8 実装上の注意・逸脱

- `test:club-prod-init:local`（ローカルDBの統合試験）は、F12の必須一覧（`tests/mvp/suite-manifest.ts`）には**登録していない**。登録すると、F12の期待件数（スイート数・ケース数）の契約が変わるため。必要なら、別の粒度で扱う。
- `package.json` へ、`club:prod:init` と `test:club-prod-init:local` の2つのスクリプトを追加した（利用者の承認あり）。パッケージ・ロックファイルは変更していない。
- `PGOPTIONS`（読取り専用）をdry-runで併用できるかは、未確認。**applyは、`PGOPTIONS` を設定していないターミナルで実行する。**


### 16.9 承認D：本番のdry-runの実施記録（利用者が実行・報告、2026-11-18）

| 項目 | 内容 |
| --- | --- |
| 実施者・中止判断者・承認者 | 右田和也 |
| 承認 | 2026-11-18 8:15 |
| 実施 | 2026-11-18 9:47 頃 |
| 入力ファイル | `~/f13-input/initial.json`（権限600、リポジトリ外。`owner` と `platformAdmin` の各 `authUserId`・`email`・`name`、UUID形式を確認） |
| 事前確認 | `PG` 変数なし／DBはループバックではない（false）・ポート5432 |
| 実行 | `--target production --dry-run`（1回のみ） |
| 結果 | Club・AppUser・ClubMembership・PlatformAdmin・ClubEmailSetting の5テーブルとも `CREATE`。`CONFLICT`・エラーなし。終了コード0。DB・Authへの書込みなし |
| 判定 | **合格**（本番Authとの user.id・メールの照合も通過） |

**逸脱・注意（記録）：**

- `git switch main` が `.claude/settings.json` の未コミット変更で失敗し、`feat/g5-production-club-init` のまま実行した。続く `git pull origin main` で、このブランチは origin/main（`3ba5ae7`、PR #22）まで進んでおり、**実行したコードは main と同一**（`git log` で `HEAD` と `origin/main` が同じコミットを指すことを確認）。
- 接続先の指紋（12文字）が、チャットへ貼られた。ホスト名ではなく縮めた値であり、この手順書には書かない。承認Eの `--expect-fingerprint` には、利用者のメモの値を使う。
- 入力ファイルは、承認Eまで残す。Eの後、または中止する場合に削除する。

### 16.10 承認E：本番のapplyの実施記録（利用者が実行・報告、2026-11-18）

| 項目 | 内容 |
| --- | --- |
| 実施者・中止判断者・承認者 | 右田和也 |
| 承認・実施 | 2026-11-18 9:54 |
| 事前確認 | `HEAD` 3ba5ae7（origin/main と同一）。`PG` 変数なし（`PGOPTIONS` を含む）。入力ファイルは権限600。未コミットの変更は `.claude/settings.json` と手順書のみ |
| 実行 | `--target production --apply --expect-fingerprint <承認Dと同じ12文字>`（1回のみ）。指紋は一致 |
| apply の結果 | Club・AppUser・ClubMembership・PlatformAdmin・ClubEmailSetting の5テーブルとも `CREATE`。終了コード0 |
| 直後の dry-run | 5テーブルとも `UNCHANGED`。`CONFLICT`・エラーなし。終了コード0 |
| 判定 | applyと再dry-runは、**合格**。第16.5節の読取り確認は、第16.11節に記録 |

**備考：**

- applyの出力に、承認Dにあった「DRY-RUN」の行はない。完了を示す専用の行は、出ていない。成功の判断は、終了コード0と、直後のdry-runの `UNCHANGED` による。
- 承認文の「承認」欄の山括弧は、記入時に残った。記録上の承認は、右田和也・9:54。
- 入力ファイルは、第16.5節の確認の後に削除した（第16.11節）。

### 16.11 適用後の読取り確認と後片付け（利用者が実行・報告、2026-11-18）

**【追加：2026-11-18】** 読取り専用の接続（`PGOPTIONS=-c default_transaction_read_only=on`、ポート5432、poolerなし）で、SELECTのみを実行した。個人情報・接続先は記録していない。

| 項目 | 結果 |
| --- | --- |
| 5テーブルの件数 | `Club` 1・`AppUser` 1・`ClubMembership` 1・`PlatformAdmin` 1・`ClubEmailSetting` 1 |
| 属性 | `planType` = `STARTER`、`ClubMembership` = OWNER・ACTIVE・`canManageWebsite` = true |
| RLS | `public` の34テーブルすべてで有効（34/34）。テーブルが増えていない（G5で作ったのは既存の5テーブルの行のみ） |
| `anon`・`authenticated` の権限 | 0件（結果が空） |
| 後片付け | 接続用の環境変数を `unset`。入力ファイル `~/f13-input/initial.json` を削除。`~/f13-input` は空 |

**判定：** 第16.5節は合格。**G5は完了。**

**備考：**

- 最初の `psql` は、新しいターミナルにPATHが入っておらず `command not found`（本番へは未接続）。`export PATH="$(brew --prefix libpq)/bin:$PATH"` で、`psql` 18.6 が使えた。
- 既存HPのテーブルの件数は、適用前の控えがないため、比べていない。G5は既存テーブルを更新しない設計（作成のみ）であり、テーブル数34/34が不変であることを確認した。
- `ClubLineSetting` はG7、プランの切替（STANDARD）はG8の手順に従う。このクラブは、現在 STARTER（公開前）。

## 17. G6：Storage・環境変数・Cron・Resendの確認（2026-11-18、Claudeがコードを読み取りで調査。本番へは未接続）

**【追加：2026-11-18】** この章は、読取りだけの調査と、利用者が行う確認の手順（案）である。本番への書込み、Cronの手動起動、環境変数の変更は含まない。**確認の実行は、利用者の承認（G6の承認）を得てから行う。**

### 17.1 コードから分かったこと（読取り）

| 項目 | 内容 |
| --- | --- |
| Cronの認証 | 3つのCron（`delete-old-security-logs`・`club-line-deliveries`・`storage-deletions`）とも、`isAuthorizedCronRequest`（`src/application/cron/cron-authorization.ts`）を最初に呼ぶ。`Authorization: Bearer <CRON_SECRET>` を、長さの確認の後に `timingSafeEqual` で比べる。**`CRON_SECRET` が未設定・空なら、常に拒否（401）**。3つとも `GET` のみ。認証前に、DB・外部への処理はしない |
| 認証なしの応答 | `delete-old-security-logs`・`storage-deletions`：401 `{ok:false,message:"Unauthorized"}`。`club-line-deliveries`：401 `{error:"Unauthorized"}`（形が少し違うが、ともに401） |
| `proxy.ts` | matcher は `/admin`・`/club-login`・`/platform`・`/platform-login`・`/club`・`/auth`・`/welcome`・`/club-invitations/accept` 系。**`/api/cron/*` は対象外**で、Cronはセッション処理を通らない |
| Vercel Cron | `vercel.json` は `/api/cron/delete-old-security-logs`（`0 18 * * *` UTC＝毎日 03:00 JST）の1件のみ。Vercelは、`CRON_SECRET` が設定されていると、同じ値を `Authorization: Bearer` で自動付与する。`club-line-deliveries`・`storage-deletions` は、`vercel.json` に追加しない（Supabase Cronが呼ぶ） |
| ログ削除の保持期間 | `FormSubmissionLog`・`LoginSubmissionLog` とも**30日**（`lib/security/submission-log-cleanup.ts`）。`createdAt` が30日より前の行を、`deleteMany` で削除する |
| 削除ジョブの上限 | `club-line-deliveries` は1回20件、`storage-deletions` は1回20件 |
| Storage（新アプリ） | 新アプリが使うバケットは `club-app-attachments` のみ（`club-attachment-storage-constants.ts`）。アプリ側で、PDFのみ・1ファイル3 MiB・合計3 MiB を検証（`pdf-file-validation.ts`）。バケットの作成・更新のコードはなく、バケットは Supabase 側で作る |
| Storage（既存HP） | `club-documents`（月間練習計画PDF）・`club-images`（スタッフ・ページ画像）は、既存HPが使う。今回のリリースで、これらの扱いは変えていない |

**気づき（変更しない）：** `delete-old-security-logs` のエラー処理は、`console.error` に、エラーオブジェクトをそのまま渡している（`app/api/cron/delete-old-security-logs/route.ts`）。AGENTSの「生のエラー詳細をログへ出さない」に照らすと、本来は名前だけにするのが望ましい。ただし、計画（G6）の「既存HPのCronの仕様は変えない」に従い、今回は変更しない。必要なら、別の粒度で扱う。

### 17.2 環境変数の一覧（変数名・用途・設定先・有無。値は書かない）

「有無」は、**利用者の報告**（2026-11-16〜17）による。Claudeは、本番の値も有無も、直接は確認していない。

| 変数名 | 用途 | 必須 | 設定先 | 有無（報告） |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | DB接続（Prisma） | 必須 | Vercel・`.env.prod` | 設定あり |
| `DIRECT_URL` | 直接接続（任意） | 任意 | — | 未設定（問題なし） |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseの接続（ブラウザ・サーバー） | 必須 | Vercel | 設定あり |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage・Authの管理操作（サーバーのみ） | 必須 | Vercel | 設定あり |
| `APP_BASE_URL` | 招待メール等のURL（本番はhttps） | 必須 | Vercel | 設定あり（変更なし） |
| `WEBSITE_ADMIN_USER_IDS` | 既存HPの管理者（F13では維持） | 必須 | Vercel | 設定あり |
| `FORM_LOG_HASH_SALT` | フォームログのハッシュ（32文字以上） | 必須 | Vercel | 設定あり |
| `LINE_CREDENTIAL_ENCRYPTION_KEY` | クラブのLINE資格情報の暗号鍵（32バイトbase64） | 必須 | Vercel・`.env.prod`・パスワードマネージャ | **本番用を新規に発行して設定（2026-11-17）** |
| `CRON_SECRET` | Cronの認証（32文字以上） | 本番で必須 | Vercel。**Supabase Cronのジョブにも同じ値**（17.4参照） | Vercelは設定あり。Supabase側との一致は**未確認** |
| `RESEND_API_KEY` / `MAIL_FROM_ADDRESS` | メール送信 | 本番で必須 | Vercel | 設定あり（共通ドメインへの切替は第15.4節） |
| `ADMIN_EMAIL` | HPの問い合わせ通知の宛先（フォールバック） | 任意 | Vercel | **未確認** |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_ADMIN_GROUP_ID` | 既存HPの管理者LINE通知 | 任意（両方セット） | Vercel | **未確認** |
| `LINE_CHANNEL_SECRET` | 既存の単一クラブ用Webhookの署名検証（移行期間のみ） | 任意 | Vercel | **未確認**（G7でWebhook切替時に扱う） |
| `NEXT_PUBLIC_LIFF_ID` / `LINE_LIFF_URL` | 既存HPのLIFF（両方セット） | 任意 | Vercel | **未確認** |
| `NEXT_PUBLIC_LIFF_DEBUG` | LIFFのデバッグ表示 | 任意 | — | 未設定 |
| `AXIOM_TOKEN` / `AXIOM_DATASET` | ログ送信（両方セット） | 任意 | Vercel | **未確認** |

- 開発専用の変数（`SEED_DEV_*`・`WEBSITE_ADMIN_SEED_*`）は、本番に設定しない。
- 「未確認」の変数は、Vercelの Production の**変数名一覧だけ**で、有無を確認する（値は開かない）。整理（削除）は、G9の後（第15.3節）。

### 17.3 利用者が行う確認（案。G6の承認の後。すべて読取り）

**【確認1】Cronの認証なし拒否（本番へのGETのみ。ジョブは動かない）**

```bash
cd ~/Documents/arao-u12-hp
npx dotenv-cli -e .env.prod -- sh -c 'for p in delete-old-security-logs club-line-deliveries storage-deletions; do printf "%s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "$APP_BASE_URL/api/cron/$p"; done'
```
- 期待：3つとも `401`。値（URL・本文）は表示しない。`CRON_SECRET` は送らない。
- 404 が出たら、そのルートが本番に無い（デプロイ内容の確認が必要）。200 が出たら、**認証が効いていない**ため、直ちに中止して報告する（`CRON_SECRET` が空の場合は401になる設計）。

**【確認2】Supabase Cronの実行結果（読取り専用の接続で。SQLの定義文は出さない）**

```sql
select j.jobname, d.status, d.start_time
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
order by d.start_time desc limit 10;
select status_code, created from net._http_response order by created desc limit 10;
```
- 期待：`status` が `succeeded`、`status_code` が `200`（`401` なら、Supabase側の `CRON_SECRET` と Vercelの値が合っていない。`404` なら、本番に未デプロイ）。
- `net._http_response` の本文（`content`）の列、`cron.job.command`（認証ヘッダーを含み得る）は、**選ばない・貼らない**。`net._http_response` が無い、または空の場合は、「確認できなかった」として報告する。
- 新アプリのデプロイは 2026-11-17 11:30 頃。それ以前の `404` は、旧アプリに該当ルートが無かったためで、異常ではない。

**【確認3】ログ削除Cronの効果（読取りで代替）**

Vercel（無料プラン）のログは直近1時間分しか見えず、**2026-11-18 03:00 JST の初回実行の結果は、消えていて確認できない**（利用者の報告）。代わりに、効果を数える。

```sql
select 'FormSubmissionLog', count(*) filter (where "createdAt" < now() - interval '30 days'), min("createdAt") from "FormSubmissionLog"
union all
select 'LoginSubmissionLog', count(*) filter (where "createdAt" < now() - interval '30 days'), min("createdAt") from "LoginSubmissionLog";
```
- 日時は、実行した日と、03:00の実行の前か後かを、記録する。
- **03:00の実行より後（2026-11-19の朝以降）に、30日より古い行が0件**なら、Cronは動いている。0件でなければ、動いていない可能性がある（原因は、Vercelの Cron一覧の登録・`CRON_SECRET`・ルートのHTTP応答のいずれか）。
- 2026-11-18 の今の時点で、30日より古い行が残っていれば、「初回実行の前の状態」として記録する。

**【確認4】Vercelの Cron一覧（画面）**

- Settings → Cron Jobs で、`/api/cron/delete-old-security-logs` のみが有効で、旧 `delete-old-submission-logs` が残っていないこと。

**【確認5】バケット（読取り）**

```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by 1;
```
- 期待：`club-app-attachments` は `public=false`、`file_size_limit=3145728`、`allowed_mime_types={application/pdf}`。`club-documents`・`club-images` は、既存のまま（公開・制限なし）。

### 17.4 要判断・未確認

1. **`club-documents`・`club-images` のバケット側の制限（サイズ・形式）：** 現状は、アプリ側の検証のみ。バケット側に制限を設けると、既存HPのアップロードが拒否されるおそれがあり、本番の書込みにもなる。**推奨：今回は変更しない。** 設ける場合は、既存HPの実際の使い方（形式・サイズ）を調べてから、別の承認で行う。
2. **`CRON_SECRET` の一致：** Vercel（Production）と、Supabase Cronのジョブが保持する値が、同じであることは、確認2の `status_code` が200かどうかで間接的に分かる。値そのものは、比べない・貼らない。
3. **旧パスの期間の削除漏れ：** 旧パス（`delete-old-submission-logs`）が動いていなかった期間に、30日を超えるログが残った可能性がある。初回の実行（新パス）が、まとめて削除する。個人情報ではなくハッシュだが、**削除してよいか**は、利用者の判断（現状は、実行されれば削除される設計）。
4. **Resend：** 共通ドメインへの切替は、第15.4節（G9・ドメイン切替の後）。G6では、変数の有無の確認のみ。
5. **§11 の15・16（シーケンスの既定権限、他のDataAPIクライアント）：** 未確認のまま。G6の範囲外。

### 17.5 G6の承認と決定（利用者、2026-11-18）

- **G6の承認：** 第17.3節の確認1〜5（すべて読取り）の実行を、右田和也が承認した。承認の範囲は、第17.3節に書いたものに限る（書込み・Cronの手動起動・環境変数の変更・バケットの変更は含まない）。
- **決定1：** `club-documents`・`club-images` のバケット側の制限は、**今回は変更しない**（第17.4節の1の推奨のとおり）。
- **決定2：** 旧パスの期間に残った30日超のログ（ハッシュのみ）は、次のCron実行で**まとめて削除されてよい**（第17.4節の3）。

### 17.6 G6の確認の実施記録（利用者が実行・報告、2026-11-18 10:22 頃）

**【追加：2026-11-18】** Claudeは本番へ接続していない。確認1は本番へのGET（認証なし）、確認2・3・5は読取り専用の接続（ポート5432、poolerなし、`PGOPTIONS` で読取り専用）のSELECTのみ。接続先・認証情報・本文は記録していない。

| 確認 | 結果 | 判定 |
| --- | --- | --- |
| 1 Cronの認証なし拒否 | `delete-old-security-logs`・`club-line-deliveries`・`storage-deletions` の3つとも `401` | 合格 |
| 2 Supabase Cronの実行 | `club-line-deliveries-every-5-minutes`（毎時00分起点）と `storage-deletions-every-5-minutes`（毎時02分起点）が、直近10件（UTC 01:00〜01:22、日本時間 10:00〜10:22）とも `succeeded`。`net._http_response` の直近10件が、すべて `200` | 合格（認証付きの呼び出しが成功。Supabase側と Vercel（Production）の `CRON_SECRET` は一致していると判断できる）。ただし、直近約22分の範囲のみ |
| 3 ログ削除の効果 | `FormSubmissionLog`：30日より古い行0件・最古の行なし（空）。`LoginSubmissionLog`：30日より古い行0件・最古 2026-10-25 11:38（約24日前） | **未判定**（下記） |
| 4 Vercelの Cron一覧 | `/api/cron/delete-old-security-logs` のみが有効 | 合格 |
| 5 バケット | `club-app-attachments`：非公開・`3145728`・`{application/pdf}`。`club-documents`・`club-images`：公開・サイズ上限なし・形式制限なし | 合格（想定どおり。2つの既存バケットは変更しない決定） |
| 環境変数（Productionの有無） | `ADMIN_EMAIL`・`LINE_CHANNEL_ACCESS_TOKEN`・`LINE_ADMIN_GROUP_ID`・`LINE_CHANNEL_SECRET`・`NEXT_PUBLIC_LIFF_ID`・`LINE_LIFF_URL`・`AXIOM_TOKEN`・`AXIOM_DATASET` は、すべて**あり**（値は未確認・未変更） | 第17.2節の「未確認」を「あり」に更新 |

**確認3が未判定の理由：** 最古の行が約24日前で、30日の保持期間に達していない。30日より古い行が0件なのは、「削除された」からではなく、「まだ該当する行がない」からかもしれない。`FormSubmissionLog` が空なのも、「過去30日に送信が無かった」ためか、「削除された」ためかを、この確認では区別できない。**したがって、ログ削除Cronが動いているかは、まだ確認できていない。** 2026-11-18 03:00 JST の初回実行は、Vercelの無料プランのログが約1時間のため、確認できなかった。

**確認3の再実施（読取り）：** `LoginSubmissionLog` の最古の行（2026-10-25 11:38）は、約 **2026-11-24 11:38** に30日を超える。その次の定刻（**2026-11-25 03:00 JST**）の実行の後（**11月25日の朝以降**）に、確認3のSQLを再実行する。
- 30日より古い行が **0件**で、最古の行の日時が「実行時刻の30日前」より新しい → Cronが動いている。
- 30日より古い行が残っている → 動いていない。Vercelの Cron一覧・`CRON_SECRET`・ルートの応答を調べる（その場合は、新たな読取りの承認を取る）。

**第17.4節の決定2（古いログの削除）の補足：** 現時点で、30日を超えたログは存在しなかった。旧パスの期間の削除漏れは、確認できなかった（`FormSubmissionLog` は空）。

**G6の判定：** 確認1・2・4・5は合格。確認3は未判定で、**2026-11-25 の朝以降に再確認**する（G6は、その1件を残して完了。G7・G8・G9の進行は止めない）。

## 18. G8：プラン切替（STARTER ↔ STANDARD）の手順（2026-11-18、Claudeが作成。**手順書のみ。切替は未実施・未承認**）

**【追加：2026-11-18】** この章は、手順の案である。プランの変更は、本番DBへの書込みなので、**操作ごとに、承認地点Gとして、右田和也の明示承認を得てから行う**。Claudeは、本番へ接続しない。

### 18.1 プランが、何を切り替えるか（コードの読取り）

| 項目 | 内容 |
| --- | --- |
| 機能表 | `domain/club/plan-features.ts`：`STARTER` は `WEBSITE` のみ、`STANDARD` は `WEBSITE`・`CLUB_APP`、`PRO` は空（現在は使わない） |
| STARTERのとき | クラブ運営アプリの画面・操作（`/club/...`）は、`requireClubFeature` が `ClubFeatureUnavailableError` を投げて使えない（`club-app-authorization.ts`、各Repositoryの `hasClubFeature`）。ログイン後の遷移先も、アプリが使えるクラブだけを数える（`club-login-destination.ts`）。**既存HP（`WEBSITE`）は、どちらのプランでも使える** |
| 反映のタイミング | プランは、リクエストごとに `Club.planType` をDBから読む。キャッシュは見つかっていない。DBを更新すれば、次のリクエストから反映される（再デプロイ不要） |
| 切替の手段 | **プランを変更する画面・スクリプトはない**（`planType` を更新するコードは、G5の初期化と、ローカルのseedのみ）。本番では、**手動のSQL**で行う |
| 他のデータ | プランを変えても、アプリで作ったデータ（予定・出欠・お知らせ等）は、消えない。STARTERへ戻すと、見えなくなるだけ |

### 18.2 いつ、どちらにするか

| 時期 | プラン | 理由 |
| --- | --- | --- |
| G5の直後〜G7の前（現在） | `STARTER` | 公開前。OWNER・MEMBERは、アプリを開けない |
| G7（本番のsmoke test）の間 | **一時的に `STANDARD`** | OWNER・MEMBER・PlatformAdminの最小smokeが、アプリを開く必要がある。**smokeの前に切り替え、終わったらすぐ `STARTER` へ戻す**（公開判断までは、STARTERで待つ） |
| G9（公開時） | `STANDARD` | 公開判断（承認地点H）の後に、承認Gで切り替える。以後は、STANDARDのまま運用 |

- G7の間は、アプリを使える利用者を、**OWNER（クラブ代表）・PlatformAdmin（開発者）の2人だけ**にする。招待メールは、まだ送らない。クラブ代表には、smokeの時間帯を、事前に伝える。
- `ClubLineSetting`（LINE）は、G7の手順で扱う。STANDARDの間に、LINEの実送信が起きないように、**G7の手順書で、LINE設定の有効・無効の順序を決める**（G8の範囲外）。

### 18.3 切替の前に確認する（読取り。第16.5節と同じ、読取り専用の接続）

```sql
select slug, "planType", "updatedAt" from "Club" where slug = 'arao-u12';
select count(*) from "ClubMembership" m join "Club" c on c.id = m."clubId" where c.slug = 'arao-u12' and m.status = 'ACTIVE';
```
- 現在の `planType` が、想定どおり（切替前は `STARTER`）であること。
- ACTIVEな会員が、想定どおりの人数であること（現在は、OWNERのみで 1）。想定外の会員がいれば、**切替を中止**して、確認する（STANDARDにすると、その人がアプリを使えるようになる）。

### 18.4 切替（承認Gの後に実行。書込みのため、`PGOPTIONS` を設定しない接続で）

**STARTER → STANDARD：**

```sql
BEGIN;
UPDATE "Club"
SET "planType" = 'STANDARD', "updatedAt" = timezone('UTC', now())
WHERE "slug" = 'arao-u12' AND "planType" = 'STARTER';
-- 「UPDATE 1」と出ること。0なら、ROLLBACKして報告（想定外の状態）。
SELECT slug, "planType" FROM "Club" WHERE slug = 'arao-u12';
-- 想定どおりなら COMMIT; 想定外なら ROLLBACK;
```

- `"updatedAt"` は、Prismaが付ける列で、DBには既定値がないため、SQLで**明示的に更新する**（時刻はUTC）。
- `WHERE` に、**現在のプランを条件に入れる**ことで、二重の実行や、想定外の状態での更新を、0件にして防ぐ。
- 対象は、`slug = 'arao-u12'` の1行だけ。他のクラブ・他のテーブルには触れない。

### 18.5 戻し（STANDARD → STARTER）

```sql
BEGIN;
UPDATE "Club"
SET "planType" = 'STARTER', "updatedAt" = timezone('UTC', now())
WHERE "slug" = 'arao-u12' AND "planType" = 'STANDARD';
-- 「UPDATE 1」を確認してから COMMIT;
```

- 戻しは、**承認Gの範囲に含める**（切替の承認と一緒に、戻しの実行も、承認する。戻しが必要になった時に、承認を取り直さなくてよい）。
- 戻した後も、アプリで作ったデータは、消えない。STANDARDへ再び切り替えれば、元のとおり使える。
- 戻した直後は、すでにアプリを開いている人が、次の操作で「使えない」状態になる（画面は、アプリが使えない旨の扱い）。

### 18.6 切替の後に確認する

- 読取り：`planType` が、期待どおり。`updatedAt` が、切替の時刻。他のクラブの `planType` が、変わっていないこと。
- 画面：OWNERでログインして、アプリのトップが開く（STANDARD）／開かない（STARTER）こと。HPの管理画面が、どちらでも開くこと。

### 18.7 承認Gの依頼文（雛形）

- 目的：`<G7のsmoke test／公開>` のために、クラブ `arao-u12` のプランを、`<STARTER→STANDARD／STANDARD→STARTER>` へ切り替える。
- 対象環境：本番のSupabase（DB）。書込み：`Club` の1行の `planType` と `updatedAt` のみ。
- 事前確認：第18.3節（現在のプラン、ACTIVEな会員数）。結果：`<記入>`。
- 戻し：第18.5節。この承認に含める。
- 中止条件：事前確認が想定と違う、`UPDATE` が1件でない。
- 承認の範囲外：`ClubLineSetting`、招待メール、環境変数、デプロイ。
- 実施者・中止判断者・承認者：右田和也。実施日時／承認：`<記入>`。

### 18.8 要判断

1. **手動SQLで足りるか：** 切替は、公開前後の数回のみ。専用のスクリプト（G5と同じ形）を作ると、安全だが、作業が増える。**推奨：現在の規模では、手動SQL（`WHERE` に現在のプランを条件に入れる）で十分**。回数が増えれば、別の粒度で、スクリプト化を検討する。
2. **G7の間のSTANDARDの時間：** できるだけ短くする（smokeの直前に切替、直後に戻す）。
3. **PRO：** 現在は使わない（機能表が空）。`STARTER`・`STANDARD` 以外へは、切り替えない。

## 19. G7：本番のsmoke testと、LINE Webhook切替の手順（2026-11-18、Claudeが作成。**手順書のみ。すべて未実施・未承認**）

**【追加：2026-11-18】** Claudeは本番へ接続しない。この章は案であり、**操作ごとに承認（承認地点F）を取る**。実メール・実LINEの送信は、受付成功と配送完了を区別して記録する。ログ・記録に、本文・個人情報・Cookie・トークン・署名URL・Webhook URL（`webhookKey` を含む）・生のエラーを写さない。

### 19.1 コードから分かったこと（読取り）

| 項目 | 内容 |
| --- | --- |
| 既存の `e2e/smoke.spec.ts` | ローカル専用（`https://localhost:3443` 固定、ログイン画面の表示のみ）。**本番には使えない**。本番のsmokeは、手動で行う |
| 旧Webhook `app/api/line/webhook/route.ts` | `LINE_CHANNEL_SECRET`（環境変数）で署名を検証し、イベントがあっても**何もせず200を返す**（検証リクエストは200）。移行期間のみ残す |
| 新Webhook `app/api/line/webhook/[webhookKey]/route.ts` | URLの `webhookKey` でDBの `ClubLineSetting` を引き、DBの暗号化済みChannel Secretで署名を検証する。成功は200、署名不正は401、キー不明は404など。ログには、`outcome` と `status` のみを出す。**登録コード（グループに投稿された完全一致の文字列）を消費して、通知先を「無効」で登録する**（LINEへは送らない） |
| LINE送信の条件 | 送信されるのは、`ClubLineTarget.isEnabled = true` の通知先へ、`ClubLineDelivery`（お知らせ等から作られる）がある場合だけ。`club-line-deliveries` のCron（5分間隔）が、`PROCESSING` にして送る。通知先の既定は**無効** |
| `ClubLineSetting` の作成 | `scripts/initialize-club-line-setting.ts`（`--club-slug`・`--club-id`・`--dry-run`/`--apply`。資格情報は `CLUB_LINE_INIT_*` の環境変数）。更新時に `webhookKey` は変えない。実行すると、**設定すべきWebhook URLを表示する**（`webhookKey` を含むため、貼らない）。**G5のような接続先ガード（`--target`・指紋）はない**ため、実行前に、接続先を別に確認する |
| 招待・再設定メールのリンク | 招待：`generateLink` に、アプリのURLから作った `redirectTo` を渡す。パスワード再設定：`APP_BASE_URL` から作る `redirectTo`。**Supabase Authの Redirect URLs に、その宛先が登録されていないと、Site URLへ戻される**。本番のSite URLは `http://localhost:3000`、Redirect URLsは登録なし（第12.3節）。**そのままでは、招待・再設定のリンクが、正しい宛先に着かない** |
| プラン | STARTERでは、アプリが開けない（第18章）。smokeの間だけ、承認Gで、STANDARDにする |

### 19.2 前提（利用者が先に確認・決める）

1. **本番のアプリのURL：** 現在の `APP_BASE_URL` のオリジン（独自ドメインか、Vercelのドメインか）。ドメイン切替（第15.4節）の前か後かで、Authに登録するURLが変わる。**切替の後で、新URLも追加する**必要がある。
2. **Resend：** `MAIL_FROM_ADDRESS` のドメインが、Resendで**検証済み**か（Resendの画面で確認。未検証なら、送信は拒否される）。
3. **LINE：**
   - クラブ運営アプリのLINEは、**既存HPと同じLINE公式アカウント（チャネル）**か、別か。
   - LINE Developersの Webhook URLが、現在、旧URL（`/api/line/webhook`）になっているか。
   - **テスト用のLINEグループ（開発者のみが入る）と、そのグループに入れるBot**が用意できるか。**実際のクラブのグループは使わない。**
4. **MEMBERの確認用のメールアドレス：** 開発者が受信できる別のアドレス（19.4のB案を選ぶ場合）。
5. LINEのChannel ID・Bot User ID・Channel Access Token・Channel Secretの4つを、**G5と同じ要領で、リポジトリの外に、権限600で**用意できるか（値は貼らない）。

### 19.3 順序と承認の分け方（案）

| 順 | 内容 | 種別 | 承認 |
| --- | --- | --- | --- |
| 1 | 前提の確認（19.2）。計画の確定 | 読取り | — |
| 2 | Supabase Authの Site URL・Redirect URLsの設定 | **外部設定の変更** | F-1 |
| 3 | `ClubLineSetting` の作成（dry-run → apply） | 本番DBへの書込み | F-2（dry-runとapplyは別々に） |
| 4 | プランを一時的にSTANDARDへ（第18章） | 本番DBへの書込み | G |
| 5 | smoke（OWNER・PlatformAdmin・HP管理画面。**読取りの閲覧のみ**） | 本番の閲覧 | F-3 |
| 6 | MEMBERの招待と、Resendの疎通 | 本番への書込み・**実メール** | F-4 |
| 7 | LINE Webhook URLの切替と、登録コードの疎通 | **外部設定の変更** | F-5 |
| 8 | LINEの実送信（テストグループのみ） | **実LINE送信** | F-6 |
| 9 | プランをSTARTERへ戻す（公開判断まで） | 本番DBへの書込み | G（戻しは4の承認に含める） |
| 10 | 記録（本章に追記）と、後始末 | 文書 | — |

- 6〜8は、結果を見てから次に進む。止める条件に当たったら、その場で止め、後続に進まない。
- 4〜9の間、アプリを使える利用者は、**OWNER・PlatformAdmin・テスト用のMEMBER**だけ。他の招待は送らない。クラブ代表に、時間帯を事前に伝える。

### 19.4 各手順

**2. Supabase Auth（F-1）：** Authentication → URL Configuration。
- Site URLを、本番のアプリのURLのオリジンにする。Redirect URLsに、アプリのURLのオリジン（および、招待・再設定の戻り先のパス）を登録する。**登録前の値（`http://localhost:3000`、登録なし）を、控える。**
- 戻し：登録前の値に戻す。
- **既存HPへの影響：** 既存HPの管理者のログイン（パスワード）は、この設定に依存しない想定だが、**変更後に、HPの管理者ログイン（`/admin`）が通ること**を、手順5で確認する。

**3. `ClubLineSetting`（F-2）：** `scripts/initialize-club-line-setting.ts`。
- dry-run：`--club-slug arao-u12 --club-id <clubId> --dry-run`。出力が「設定を新規作成予定」であること。接続先は、別途、第16.4節と同じ確認（ポート5432・poolerなし・本番）で確かめる。
- apply：dry-runの出力が想定どおりであることを確認して、承認を得て、実行。`webhookKey` を含むWebhook URLが表示される。**URLは、貼らない。LINE Developersへ、手で貼る**（手順7）。
- 戻し：`ClubLineSetting` の行を、ID指定で削除（本番では、確認と承認の後）。

**5. smoke（OWNER・PlatformAdmin・HP）：**
- 未ログイン：`/club-login` が200、`/` が200、`/club/arao-u12/events` はログイン画面へ（アプリの中身を見せない）。
- OWNER：ログインして、予定・会員・お知らせ・設定の各画面が開く（**閲覧のみ。データを作らない**）。ログアウト。
- PlatformAdmin：`/platform-login` からログインして、プラットフォームの画面が開く。ログアウト。
- 既存HP：`/admin` に、既存の管理者でログインできる。公開ページ・スタッフ画像・月間練習計画PDFが表示される。

**6. MEMBERとResend（F-4）：**
- OWNERで、確認用のアドレスへ、MEMBERとして招待を送る（**実メール1通**）。
- **受付成功**：アプリが「送信した」と表示し、エラーがない。**配送完了**：確認用の受信箱に届く（Resendの画面の状態が `Delivered` になることも確認）。両方を、別々に記録する。
- 招待リンク → 受諾（パスワード設定）→ MEMBERでログイン。MEMBERが、管理画面（会員・設定）を開けないこと（404）。
- 後始末：会員を無効化する（アプリの会員管理。実施前に、機能の有無を確認）。**テスト用のAuthユーザー・`AppUser` は残る**ため、削除の要否と方法は、右田が決める（削除は、別の承認）。

**7. LINE Webhook（F-5）：**
- LINE Developersで、Webhook URLを、手順3で表示された新URLに変更し、**「検証」**を押す。**成功（200）**であること。旧URLを控えておく。
- 戻し：旧URL（`/api/line/webhook`）へ戻す。旧Webhookは、検証に200を返す。
- テスト用グループで、OWNERが設定画面で発行した登録コード（15分程度で失効するかは、実施前にコードで確認）を、そのまま投稿する。通知先が「無効」で登録されること（**LINEへは、まだ何も送られない**）。

**8. LINEの実送信（F-6）：** テストグループの通知先だけを有効にし、OWNERが、テスト用のお知らせを、LINE配信ありで作る。
- Cronが、約5分以内に拾う。**受付成功**：配信の状態が `SENT`（LINE APIが受け付けた）。**配送完了**：テストグループに、メッセージが表示される。両方を、別々に記録する。
- `FAILED` なら、再送せず、状態と `errorCode` だけを報告する（本文・トークンは出さない）。
- 後始末：通知先を無効に戻し、テスト用のお知らせを削除（アプリの機能）。実際のクラブのグループは、**公開判断の後**に登録する。

### 19.5 止める条件

- 想定外の利用者が、アプリを開けた。MEMBERが、管理画面を開けた。
- 未ログインで、アプリの中身が見えた。
- Webhookの検証が、200にならない（401・404・503）。
- LINE・メールが、想定外の宛先へ届いた。
- いずれの場合も、その場で止め、第18章のプランの戻し（STARTER）を行い、報告する。

### 19.6 記録に残す項目

実施日時、承認、各手順の結果（受付成功と配送完了を別々に）、逸脱、後始末（テスト用のAuthユーザー・通知先・お知らせ）、残る課題。接続先・Webhook URL・個人情報は、書かない。

### 19.7 要判断・未確認

1. **MEMBER（19.4の6）：** 確認用のアドレスで、B案（実招待）を行うか、省略して、最初の本物の招待（公開時）で確認するか。**推奨：B案**（Resendの疎通と、Redirect URLsの確認も兼ねる）。ただし、テスト用のAuthユーザーが、本番に残る。
2. **Authの Site URL（19.4の2）：** 現在の `http://localhost:3000` を、本番のURLに変えてよいか（既存HPへの影響は、手順5で確認）。
3. **テスト用のLINEグループ：** 用意できない場合、LINEの実送信（手順8）は、公開判断の後（最初の本物の配信）へ回し、手順7までにする案もある。
4. **登録コードの有効期限：** 実施前に、コード（`line-registration-code` 周辺）で確認する。
5. 旧Webhook（`LINE_CHANNEL_SECRET`）の削除は、G9の後の環境変数の整理（第15.3節）。

### 19.8 利用者の回答の反映と、追加で確認したこと（2026-11-18）

**利用者の回答（報告。Claudeは確認していない）：**
- 本番のURLは、既存HPと同じ独自ドメイン（`https://arao-u12-basketballclub.com`）。アプリのログインは `/club-login`。`*.vercel.app` は、本番URLとして使わない。
- Resendの Domains で、このドメインが `Verified`（2026-11-18）。`MAIL_FROM_ADDRESS` のドメインと一致。送信・配送の成功は、未確認。
- LINE：Messaging APIチャネル「ARAO U-12 CLUB」（既存HPと同じ公式アカウントを、アプリでも使う）。現在のWebhook URLは `https://arao-u12-hp.vercel.app/api/line/webhook`（旧URL。利用：オン、再送：オン、エラー統計：オフ）。**設定の変更・検証ボタン・実送信は、行っていない。**
- テスト用グループ「ARAO アプリ送信テスト用」を作成（参加者は、右田と公式アカウントのみ）。
- MEMBERの確認：確認用のアドレスへ、OWNERから、MEMBERとして招待する案を採用。招待の送信・本番設定の変更は、実施手順の確認後。
- Authの Site URL を、`http://localhost:3000` → `https://arao-u12-basketballclub.com` へ変更する方針を**承認**（操作は、右田が行う）。

**コードで確認したこと：**

| 項目 | 内容 |
| --- | --- |
| OWNERの招待権限 | 招待の送信・再送・取消は、`requireClubAppOwnerAccess`（OWNERで、かつSTANDARD）が必要（`admin/members/invitation-actions.ts`）。招待できる役割は、`COACH`・`OFFICER`・`MEMBER`（OWNERは招待できない）。**STARTERの間は、OWNERでも招待できない**ため、手順4（STANDARD）の後に行う |
| 招待メールのリンク | 招待ページ：`<オリジン>/club-invitations/accept?clubSlug=…&token=…`。Authの戻り先（`redirectTo`）：`<オリジン>/welcome?clubSlug=…&token=…`。`<オリジン>` は、`Club.appBaseUrl`（G5では未設定）が無ければ、**環境変数 `APP_BASE_URL`**（本番はhttpsが必須）。したがって、**`APP_BASE_URL` が `https://arao-u12-basketballclub.com`（パス・末尾スラッシュなし）であること**を、実施前に確認する |
| パスワード再設定 | `redirectTo` は、`APP_BASE_URL` のオリジンそのもの（末尾スラッシュなし。`forgot-password/actions.ts`） |
| メールの送信元 | `MAIL_FROM_ADDRESS`（本番は必須。未設定なら招待は設定エラーになる）。送信はResendのAPI（冪等キー付き）。**アプリの「送信した」は、Resendが受け付けた（受付成功）という意味。受信箱への到着が、配送完了** |
| 旧Webhook | `app/api/line/webhook/route.ts`：`LINE_CHANNEL_SECRET` で署名を検証し、**イベントがあっても何もせず、200を返す**（確認用のgroupId等のログは、粒度5で削除済み）。したがって、**旧URLに、いま、維持すべき業務処理はない**。維持すべきなのは、「**Webhook URLが、常に200を返す（LINE側のWebhook利用・再送がオンでも、エラーを積まない）**」ことだけ |
| 既存HPからのLINE送信 | Webhook URLとは別（`LINE_CHANNEL_ACCESS_TOKEN` と `LINE_ADMIN_GROUP_ID` で、push送信）。**Webhook URLを切り替えても、既存HPの通知送信には影響しない**（コードで、Webhookに依存する箇所は見つかっていない）。LIFF（`NEXT_PUBLIC_LIFF_ID`）も、Webhook URLとは別の設定 |
| 新Webhookの条件 | URLの `webhookKey` でDBの設定を引き、**DBの `lineBotUserId` が、リクエストの `destination` と一致しないと403**。Channel Secretは、DBの暗号化済みの値で署名を検証（不正は401、キー不明は404、DB障害・設定不足は503＝LINEが再送）。**登録コード：グループへ、そのまま投稿（前後に空白・改行・説明文を付けない）、有効期限は発行から10分、一度だけ使える** |
| 新Webhookと、再送オン | 503はLINEが再送する。登録コードの消費は条件付きで、再送されても二重に登録されない。401・403・404は、再送されない |
| 通知先の登録と有効化 | 登録コードで登録された通知先は、**必ず無効（`isEnabled=false`）**。OWNERが、設定画面で、名前・対象の役割（`targetRoles`）を設定してから、有効化する。**お知らせの対象の役割が、通知先の役割をすべて含むときだけ**、そのグループへ送る（役割が未設定の通知先は、送らない） |
| グループIDの扱い | 登録コードの方式では、**グループIDを、人が調べて入力する必要はない**（Webhookのイベントから、アプリが取得して保存する。ログには、完全なIDを出さない）。LINE Developersの画面にも、グループIDは出ない |

**手順書（`docs/ops2.md`）との食い違い：** `docs/ops2.md` の本番の手順は、クラブの `slug` を `arao-u-12` としているが、**本番に作成した `slug` は `arao-u12`**（G5）。`ops2.md` のコマンドを、そのまま使わない。また、`ops2.md` に、「`CLUB_LINE_INIT_BOT_USER_ID` は、LINE Developersの画面には書いておらず、ターミナルのコマンドで取得する」との注記がある（LINEの公式APIの、Botの情報を取得するエンドポイント。**実施前に、LINEの最新の公式資料で、手順を確認する**）。

### 19.9 F-1：Supabase Authの URL設定（右田が操作。承認済みの方針）

- **変更前（控える）：** Site URL = `http://localhost:3000`、Redirect URLs = 登録なし。
- **変更後：**
  - Site URL = `https://arao-u12-basketballclub.com`
  - Redirect URLs に、次の2件を追加する：
    - `https://arao-u12-basketballclub.com`（パスワード再設定の戻り先。末尾スラッシュなしの、オリジンそのもの）
    - `https://arao-u12-basketballclub.com/**`（招待の戻り先 `/welcome?clubSlug=…&token=…` を含む、このドメイン配下）
  - 既存の項目は、削除しない。`localhost` は追加しない（本番のAuthに、ローカルの戻り先は、不要）。
- **注意：** ワイルドカード `**` の扱い（クエリ文字列を含めて一致するか）は、Supabaseの管理画面の説明で、確認する。`/**` で一致しない場合は、招待のリンクで、Site URLへ戻される（確認4で分かる）。
- **確認（変更の直後）：** (1) 既存HPの `/admin` に、既存の管理者でログインできる。(2) `/club-login` に、OWNERでログインできる（STARTERのため、アプリは開けない旨の挙動は、第18章のとおり）。
- **戻し：** 変更前の値に戻す。
- 独自ドメインの変更（第15.4節）の後で、新しいオリジンを、同じ形で追加する。

### 19.10 F-1 の実施記録（利用者が操作・報告、2026-11-18）

**【追加：2026-11-18】** Claudeは本番へ接続していない。URL・個人情報は記録していない。

| 項目 | 結果 |
| --- | --- |
| `APP_BASE_URL`（Vercel Production） | `https://arao-u12-basketballclub.com`（パス・末尾スラッシュなし）であることを確認 |
| Authの Site URL | `http://localhost:3000` → `https://arao-u12-basketballclub.com` に変更済み |
| Redirect URLs | 2件を追加済み（`https://arao-u12-basketballclub.com`、`https://arao-u12-basketballclub.com/**`） |
| 既存HP `/admin` のログイン | 既存の管理者で、ログインできた |
| `/club-login` のOWNERのログイン | ログインできたが、「アプリを利用できるクラブがありません／所属クラブのプランまたは利用状態を確認してください」と表示され、アプリの画面には入れなかった |

**OWNERの表示の照合：** 想定どおり。`app/(club-app)/club/select/page.tsx` で、所属（ACTIVE）はあるが、`CLUB_APP` を使えるクラブが0件のときに、この文言を表示する（クラブ `arao-u12` は STARTER で、`getAppEnabledMemberships` に含まれない）。ログイン自体は成功し、アプリの画面へは入れない、という設計どおり。

**未確認：** Redirect URLsの `/**` が、クエリ文字列付きの戻り先（`/welcome?clubSlug=…&token=…`）に一致するか（Supabaseの画面に、クエリの扱いの説明なし）。**MEMBERの招待テスト（F-4）で確認する。** 招待のリンクが、`/welcome` ではなく、トップページ（Site URL）へ戻る場合は、Redirect URLsと、実装の戻り先（`<オリジン>/welcome?clubSlug=…&token=…`、第19.8節）を照合し、必要なら、クエリ付きの形を追加する。

**F-1の判定：** 合格（設定の変更と、HP管理者ログインの確認。クエリの一致は、F-4で確認）。

### 19.11 LINEの方針と、資格情報の取り扱いの事故（2026-11-18）

**【追加：2026-11-18】** 値は、一切、記録していない。

**方針（利用者）：** 既存HPと新アプリは、同じ「ARAO U-12 CLUB」のMessaging APIチャネルを共用する。既存HPの体験・見学申込み・問い合わせの通知は、**現在の運営者用グループへの通知を維持**する。アプリのお知らせ・イベント通知は、アプリ側の通知先（`ClubLineTarget`）へ送り分ける。テストには、開発者だけの別グループを使う。

**事故（記録）：** 2026-11-18、LINEの**Channel Secret と Channel Access Token（長期）の実値が、チャットに貼られた**（AGENTSの「トークン・資格情報をチャット・成果物へ出さない」に反する。意図せず）。会話の記録は、利用者のMacと、AIの処理系に残る。**この2つは、漏えいした資格情報として扱い、F-2より前に、再発行する**（Channel IDは秘密ではない）。今後、値は、チャットに貼らず、`read -rs` で、ターミナルに、直接入力する。

**再発行の影響（LINEの公式資料の範囲。管理画面の挙動は、実施時に、画面で確認）：**
- 長期トークンの再発行は、現在有効な長期トークンを無効にする（再発行の際に、旧トークンを最大24時間残すオプションが、APIにはあるとされる。管理画面で選べるかは、未確認）。**既存HPのLINE通知（`LINE_CHANNEL_ACCESS_TOKEN`）は、Vercelの値を新トークンへ更新して、再デプロイするまで、失敗する**（その間の体験・問い合わせの通知は、運営者へ届かない）。
- Channel Secretの再発行は、旧Secretを無効にする。旧Webhook（`LINE_CHANNEL_SECRET` で署名を検証）は、Vercelの値を更新するまで、署名検証が失敗して401を返す（旧Webhookは、何も処理しないため、業務への影響はない。LINEのエラー統計はオフ）。新Webhookへ切り替えれば、旧Webhookは使われなくなる。
- **順序の案：** (1) 低トラフィックの時間帯に、承認を取る。(2) LINE Developersで、Secretとトークンを再発行する。(3) 直ちに、Vercel Productionの `LINE_CHANNEL_ACCESS_TOKEN`（と `LINE_CHANNEL_SECRET`）を更新し、再デプロイする。`.env.prod` も更新する。(4) 新しい値で、Bot情報取得API（読取り）を呼び、トークンが有効なことと、Bot User IDを確認する。(5) F-2へ。
- 長期トークンは、チャネルあたり、1つのみ有効。既存HPとアプリで、同じトークンを共用する（DBには、暗号化して保存する）。

**Bot User ID：** LINE公式のBot情報取得（`GET https://api.line.me/v2/bot/info`、`Authorization: Bearer <チャネルアクセストークン>`）の応答の `userId`（`U` に16進数32桁）。`basicId`（ベーシックID、`@` から始まる）や、LINE Developersの「あなたのユーザーID」とは別の値。Webhookの `destination`（受信するBotのユーザーID）と一致する。F-2の入力の手順の中で、ターミナル内で取得して、画面にもチャットにも出さずに使う（利用者が、トークンを `read -rs` で入力）。

### 19.12 F-2a：LINE資格情報の再発行の実施記録（利用者が操作・報告、2026-11-18）

**【追加：2026-11-18】** 値は、一切、記録していない。

- **承認：** 承認F-2a、2026-11-18 19:47（右田和也）。
- **実施：** 再発行 19:47。手順1〜5（Secret再発行、Vercel更新、トークン再発行、Vercel更新、再デプロイ）の完了 19:58。**旧トークンを残すオプションは選ばず、旧トークンの有効期間を0時間**として再発行した（漏えいした旧トークンは、再発行の時点で無効）。
- **Vercel：** `LINE_CHANNEL_SECRET`・`LINE_CHANNEL_ACCESS_TOKEN` の更新後の再デプロイは、いずれも Ready。`.env.prod` も更新した。
- **確認（読取りのみ、Bot情報取得）：** HTTP 200／`userId` の形式 true／`userId` と `basicId` が別 true／表示名「ARAO U-12 CLUB」。新トークンは有効。Bot User ID は、画面にもチャットにも出していない（F-2の入力で、ターミナル内で再取得する）。
- **通知が止まった目安：** 19:47〜19:58（最大11分）。この間の体験・問い合わせの通知の有無は、未確認。
- **未確認：** 再デプロイ後の既存HPのLINE通知（`LINE_CHANNEL_ACCESS_TOKEN` による送信）。テスト送信は行っていない。次の実際の問い合わせ時に、運営者へ届いたかを確認する。旧Webhook（新しい `LINE_CHANNEL_SECRET` で署名を検証）の動作も、未確認。
- **結果：** 漏えいした資格情報の無効化は完了。次は F-2。

### 19.13 F-2：`ClubLineSetting` の作成（手順。2026-11-18、Claudeが作成。**未実施・未承認**）

**【追加：2026-11-18】** コード（`scripts/initialize-club-line-setting.ts`）から分かったこと。
- `--club-slug` と `--club-id`（本番で読取りして得た値）が、同じクラブを示さなければ中止する。**接続先の指紋の照合は、ない**（`--club-id` の一致が、取り違えの防止になる）。
- dry-runは、**既存設定がない場合、Webhook URLを表示しない**（新規作成予定と表示するのみ）。applyの出力に、`webhookKey` を含むWebhook URLが出る（ターミナルだけで扱う。チャットへ貼らない）。
- 入力は環境変数4つ（Channel ID・Bot User ID・トークン・Secret）。Bot User IDは、ターミナル内で、Bot情報取得から作る。`LINE_CREDENTIAL_ENCRYPTION_KEY` と `APP_BASE_URL`、`DATABASE_URL` は `.env.prod` から読む。
- applyは `upsert`。既存があれば、`webhookKey` を変えずに資格情報を更新する（再実行可能）。
- 注意：`.env.prod` の `LINE_CREDENTIAL_ENCRYPTION_KEY` が、Vercel Productionの値と違うと、本番アプリが復号できない。F-5の「検証」で確認する。

### 19.14 F-2 の1回目・2回目のdry-run：入力の取り違えと、Channel Secretの再漏えい（2026-11-19）

**【追加：2026-11-19】** 値は、一切、記録していない。

- **承認：** 承認F-2、2026-11-19 06:50（右田和也）。
- **1回目：** `Channel ID` の欄へ、数字10桁ではなく、**16進数32桁の値（Channel Secretの形式）を入力**し、スクリプトが「LINE Channel IDの形式が正しくありません」で中止した。DBへは書いていない。**この値が、チャットに貼られた（Channel Secretの再漏えいとして扱う）。**
- **2回目：** Channel IDは、正しい値（数字）で入力したが、`--club-id` に、**置換前の `<clubId>` が、そのまま入っていた**。スクリプトが「clubSlugと確認用clubIdが同じクラブを示していません」で中止した。DBへは書いていない（ガードが、意図どおり働いた）。
- **対応（案）：** Channel Secretを、もう一度、再発行する（承認F-2b）。Vercelの `LINE_CHANNEL_SECRET` を更新し、再デプロイし、`.env.prod` も更新する。トークンは、チャットに出ていないため、再発行しない。F-2のdry-runは、その後にやり直す。
- **再発防止：** 入力欄の意味を、手順書に明記する（Channel IDは数字、Secretは16進数32桁）。値をチャットへ貼らず、エラー行のみを貼る。

### 19.15 F-2b：Channel Secretの再再発行の実施記録（利用者が操作・報告、2026-11-19）

**【追加：2026-11-19】** 値は、一切、記録していない。

- **承認：** 承認F-2b、2026-11-19 06:57（右田和也）。
- **実施：** Channel Secretの再発行 06:57。手順1〜4（再発行、Vercel `LINE_CHANNEL_SECRET` の更新、再デプロイ、`.env.prod` の更新）の完了 06:59。再デプロイは Ready。
- **影響の時間：** 旧Webhookの署名検証が失敗した可能性がある時間は、最大 06:57〜06:59。旧Webhookは、業務処理をしない。HPのLINE通知（トークン）は、影響なし。
- **結果：** 取り違えでチャットへ出たSecretは無効。トークンは、F-2aで再発行済みの値のまま。次は、F-2のdry-runのやり直し。

**【追加：2026-11-19】** §19.13 の読取り手順の訂正：`f13_prod_env` は、`PG*` 変数をシェルへ設定する**関数**（§3で定義）であり、コマンドの前置きではない。新しいターミナルでは、関数を定義し直し、`f13_prod_env` を実行してから、`psql -c "…"` を直接実行する（`f13_prod_env psql …` とは書かない）。読取り用のターミナルは、apply用のターミナルと分ける（`PGOPTIONS` が書込みを拒否するため）。

### 19.16 F-2：`ClubLineSetting` の作成の実施記録（利用者が操作・報告、2026-11-19）

**【追加：2026-11-19】** 値（Secret・トークン・Webhook URL・`webhookKey`）は、記録していない。

- **承認：** 承認F-2、2026-11-19 06:50（右田和也）。
- **前の失敗（DB変更なし）：** §19.14 の2回の中止（入力欄の取り違え、`--club-id` への slug の誤入力）。いずれもスクリプトのガードが書込み前に中止した。
- **クラブの `id`：** 読取りで確認した（`id` は秘密ではないが、手順書へは書かない）。
- **dry-run：** 「DRY-RUN（設定を新規作成予定・DB変更なし）」。
- **apply：** 「作成しました。」。Webhook URL は表示されたが、利用者は伏せた（チャット・手順書へ出していない）。
- **再dry-run：** 「DRY-RUN（既存設定を更新予定・DB変更なし）」。**`ClubLineSetting` が作成されたことを確認した。**
- **未確認：** 読取りSQLでの確認（件数1・`lineBotUserId` の形式・`webhookKey` の長さ）。ターミナルを閉じたため、未実施。再実施する。
- **未確認：** `LINE_CREDENTIAL_ENCRYPTION_KEY` が、`.env.prod` とVercel Productionで同じか（F-5のWebhook「検証」で確認する）。

**【追加：2026-11-19】** F-2 の読取りの確認（利用者が実施）：`ClubLineSetting` は 1 行、`lineBotUserId` の形式が正しい、`webhookKey` の長さが32以上。**F-2 は完了。**

### 19.17 承認G：STARTER → STANDARD への切替の実施記録（利用者が操作・報告、2026-11-19）

**【追加：2026-11-19】** 値は、記録していない。

- **承認：** 承認G（切替と、STARTERへの戻しを含む）、2026-11-19 07:32（右田和也）。
- **事前確認（読取り）：** `arao-u12` の `planType` は STARTER（`updatedAt` は 2026-11-18 00:56 UTC台）、ACTIVEな会員は 1（OWNERのみ）。想定どおり。
- **切替：** 実施 2026-11-19 07:40。`UPDATE` は1件、`planType` は STANDARD（トランザクション内の `SELECT` の表示）。
- **切替後の読取りの確認：** 未実施。`unset PGHOST …` の後の同じターミナルで `psql` を実行し、接続先がなく失敗した（書込みではない。接続先の設定を消した後の、予想された失敗）。読取り専用のターミナルで、やり直す。
- **現在のプラン：** STANDARD（G7の間の一時。F-6の後に、STARTERへ戻す。戻しは承認Gに含む）。

**【追加：2026-11-19】** 切替後の読取りの確認（読取り専用のターミナル）：`Club` は `arao-u12` の1行のみで、`planType` は STANDARD、`updatedAt` は 2026-11-18 22:39 UTC（= 11月19日 7:39 JST）。切替は、確認済み。

### 19.18 F-3：本番のsmoke（閲覧のみ）の実施記録（利用者が操作・報告、2026-11-19）

**【追加：2026-11-19】** 個人情報・メール・パスワードは、記録していない。

- **承認：** 承認F-3、2026-11-19 08:56（右田和也）。実施：2026-11-19 09:15。
- **A 未ログイン（A1〜A4）：** すべて ○（`/`、`/club-login`、`/club/arao-u12/events`、`/platform-login`。アプリの中身は、見えなかった）。
- **B OWNER（B1〜B4）：** すべて ○（STANDARDで、アプリが開く。会員は OWNER の1人のみ）。
- **C PlatformAdmin（C1〜C3）：** すべて ○。
- **D 既存HP（D1〜D3）：** すべて ○（`/admin`、公開ページ・画像・PDF）。
- **想定外の動き：** なし。
- **結果：** F-3 完了。Auth URL設定（F-1）後の、HP管理者ログインも、再確認できた。

### 19.19 F-4 の1回目：招待が「準備中」で止まった（利用者が報告、2026-11-19。**調査中**）

**【追加：2026-11-19】** メールアドレス・画面の個人情報は、記録していない。

- **承認：** 承認F-4、2026-11-19 09:31（右田和也）。
- **現象：** OWNERから、確認用のアドレス（**開発者＝PlatformAdminとして登録済みのアドレス**）へ、MEMBERで招待を送った。「招待の準備が完了していません」と表示された。招待の一覧は、「招待状態：準備中」「在籍状態：所属情報なし」「最終送信日時：送信記録なし」で、「運営者による復旧が必要です」の注意が出た。Resendの画面にメールは増えず、受信箱にも届かなかった。**メールは、送られていない**（Resendへの依頼まで、進んでいない）。
- **コードから分かること（`send-club-invitation.ts`、`club-invitation-auth.ts`）：** 招待は、(1)招待行の予約 (2)Authの確認またはリンク作成 (3)`AppUser`・`ClubMembership`（INVITED）の作成 (4)Resendへの依頼、の順。準備（2・3）で失敗すると、「準備中」のまま残る。(2)で、`AppUser` がないメールは、Authへ `generateLink`（`invite`）を呼ぶ。**そのメールが、すでにSupabase Authに登録済みだと、失敗する**。このとき復旧は「手動（MANUAL）」になり、画面は「運営者による復旧が必要」を出す。
- **有力な原因（未確定）：** PlatformAdmin は、`AppUser` とは**別のテーブル**。G5で、開発者は `PlatformAdmin` にだけ作られ、`AppUser` には作られていない。しかし、Supabase Authには、開発者のユーザーがある（`/platform-login` で入れる）。そのため、「`AppUser` はないが、Authには登録済み」の状態になり、招待のAuthリンク作成が失敗した可能性が高い。「PlatformAdminだから」ではなく、「Authに登録済みのメールを、アプリが新規招待できない」ことが原因。**エラーの詳細は、アプリが握りつぶすため、ログでは確定できない**（読取りSQLで、状態から裏づける）。
- **本番への影響：** メールは送られていない。`AppUser`・`ClubMembership` は、作られていない見込み（作成は、Auth確認の後）。`ClubInvitation` に、1行（PREPARING）が残っている。
- **今後：** 招待を取り消す（アプリの「招待を取り消す」）。確認用のアドレスは、**Authに未登録のアドレス**に変えて、再承認の上で、やり直す。実際の会員の招待（G9以降）では、「Authに登録済みで、`AppUser` がないメール」（HP管理者・開発者）が、招待できないことを、運用上の制約として記録する。

**【追加：2026-11-19】** 読取りの確認（利用者が実施）：`ClubInvitation` は1行、`status` は PREPARING、`authUserId` と `membershipId` はどちらも null、`attemptCount` は 1。`AppUser` は 1人のまま（MEMBER は 0）。**Authの手順で止まった（`AppUser`・`ClubMembership` は作られていない）ことと、整合する。** 原因は、確定ではなく、有力な仮説のまま（エラーの詳細は、ログに残らない）。

### 19.20 コーチ3人の追加：Auth登録済み・`AppUser` なしの扱い（利用者の質問への回答、2026-11-19。**方針は、G9で決める**）

**【追加：2026-11-19】** 氏名・メールは、記録していない。

- **状況：** HP管理者としてSupabase Authに登録済みのコーチが3人いる。`AppUser` には、いない。§19.19 と同じ状況のため、アプリの招待は、同じ理由で、失敗する可能性が高い。
- **選択肢（G9の前に、決める）：** (A) アプリ用に、Authに未登録の別のメールを使う（1人が、Authのアカウントを2つ持つことになる）。(B) `AppUser` を、読取り確認の上で、承認を得て、本番に作成してから招待する（Authの `user.id` ＝ `AppUser.id`、メールは完全一致。コーチ3人分のため、手動SQLまたはG5型のcreate-onlyスクリプト）。(C) 招待のコードを、「Authに登録済みで、`AppUser` がない」場合に対応させる（別の粒度）。
- **共通の注意：** アプリのロールと、HP管理者の認可（`WEBSITE_ADMIN_USER_IDS`）は、別。後者は、変更しない。招待は、公開判断（承認H）の後、STANDARDの間に、実際の本人に送る（公開前は、送らない）。

**【追加：2026-11-19】** 「招待を取り消す」が押せない理由（コードの読取り）：取消の許可判定（`evaluateClubInvitationCancellation`）は、`ClubMembership`（INVITED）の存在を要求する。今回は、Authの手順で止まり、`ClubMembership` が作られていないため、「メンバーシップが見つからない」で、取り消せない（画面のボタンも無効）。**不具合というより、準備の途中で止まった行を、画面では片づけられない設計上の穴。** 「準備を再試行する」は、同じ理由で失敗するため、押さない。
- **扱い（方針）：** 行は、そのまま残す（有効期限 2026-11-20 09:34 JST を過ぎると、次の招待の予約時に、自動で `EXPIRED` になる）。本番へ、追加の書込み（SQLでの削除・更新）は、しない。同じメールの再招待は、期限切れまで、「有効な招待が既にある」で、拒否される（別のメールでの確認には、影響しない）。
- **G9の前に決める：** 準備途中の行を、運営者が片づける手段が、画面にない。件数が増える運用になる場合は、別の粒度で、画面かスクリプトを検討する。

### 19.21 承認F-4（再）（2026-11-19）

**【追加：2026-11-19】** 承認F-4（再）、2026-11-19 10:20（右田和也）。招待先は、Authに未登録であることを確認した確認用アドレス（1件。アドレスは記録しない）。1回目の準備途中の行は、取り消さず、そのまま残す（期限で自動失効）。範囲・中止条件は、承認F-4（09:31）と同じ。結果は、実施後に追記する。

**【追加：2026-11-19】** F-4（再）の後始末の訂正：手順5の「会員を無効にする」は、**会員の状態を「退会済み」（WITHDRAWN）にする**という意味で行う（状態は、ACTIVE／SUSPENDED＝休部中／WITHDRAWN＝退会済み）。会員の行・`AppUser`・Authのユーザーは、残る。無効化後に、そのMEMBERがアプリへ入れないことを、実際に試して確認する。

### 19.22 F-4（再）の実施記録（利用者が操作・報告、2026-11-19）

**【追加：2026-11-19】** メールアドレス・リンク・トークン・パスワードは、記録していない。

- **実施・送信：** 2026-11-19 10:28（承認F-4（再） 10:20）。
- **受付成功：** ○。「招待メールを送信しました」のトースト。招待状況は「送信済み・招待中」。
- **配送完了：** ○。ResendはDelivered。受信は、確認用アドレスの**迷惑メールフォルダー**（Outlook Web版）。到着 10:28（送信と同時刻）。
- **到達性の課題：** Outlookで、迷惑メールに分類された。公開前（G9）に、送信ドメインの認証（SPF・DKIM・DMARC）、本文・件名、送信元の表示名を見直す。受信側への案内（迷惑メールの確認、許可の登録）も、必要。
- **招待リンク／Auth Redirect：** ○。現在のRedirect URLs設定で、`/welcome` へ遷移した（F-1の `/**` の懸念は、解消）。
- **受諾・ログイン：** ○。
- **MEMBERの管理画面の制限：** ○（開けない）。
- **後始末：** テスト用MEMBERを「退会済み」にした。無効化後、対象クラブのアプリを利用できない：○。
- **残るもの：** テスト用の `AppUser`・Authユーザー・`ClubMembership`（WITHDRAWN）・`ClubInvitation`（受諾済み）。1回目の準備途中の `ClubInvitation`（期限 11月20日 09:34 に自動失効）。削除の要否は、右田が決める（削除は、別の承認）。
- **結果：** F-4 完了。

### 19.23 承認F-5（2026-11-19）

**【追加：2026-11-19】** 承認F-5（LINE Webhook URLの切替と、登録コードの疎通）、2026-11-19 11:05（右田和也）。範囲外：実際のクラブのグループの登録、LINEの実送信、プラン変更。Webhook URL・`webhookKey`・登録コードは、記録しない。結果は、実施後に追記する。

### 19.24 F-5：LINE Webhook URLの切替と、登録コードの疎通の実施記録（利用者が操作・報告、2026-11-19）

**【追加：2026-11-19】** Webhook URL・`webhookKey`・登録コードは、記録していない。

- **承認：** 承認F-5、2026-11-19 11:05（右田和也）。実施：2026-11-19 11:05。
- **検証（LINE Developers）：** 成功。**これにより、(1)新URLの受付口が動く、(2)DBの `lineBotUserId` と `destination` が一致する、(3)DBの暗号化Secretを復号できる（`LINE_CREDENTIAL_ENCRYPTION_KEY` が、`.env.prod` とVercelで同じ）、ことが確認できた**（コードの読取りによる推論。Secretの復号に失敗すれば、署名の検証で失敗する）。
- **登録コードの疎通：** 成功。右田と公式アカウントのみが参加するテスト用グループに、コードを投稿し、アプリの通知先の一覧に、**「無効」**の状態で登録された。
- **旧URLへの切戻し：** 不要。新URLのまま継続。
- **結果：** F-5 完了。LINEへは、何も送っていない。

### 19.25 承認F-6（2026-11-19）

**【追加：2026-11-19】** 承認F-6（LINEの実送信、テスト用グループのみ。後始末と、STARTERへの戻しを含む）、2026-11-19 11:24（右田和也）。範囲外：実際のクラブのグループの登録、他の通知先の有効化、環境変数の変更。本文・トークン・グループID・Webhook URLは、記録しない。結果は、実施後に追記する。

### 19.26 F-6 の中断：`Club.appBaseUrl` が未設定で、LINE通知付きのお知らせを保存できない（2026-11-19）

**【追加：2026-11-19】** 値の実体は、記録していない。

- **現象：** OWNERが、LINE通知ありでお知らせを保存しようとすると、「クラブのアプリURLが設定されていないため、LINE通知できません。」と表示され、保存されなかった。**本番へは、何も書かれていない**（アクションが、DBへの保存の前に、エラーを返す。LINEへも、送っていない）。
- **原因（コード）：** お知らせ・イベントの作成・編集のアクション（`notice/new`・`notice/[noticeId]/edit`・`events/new`・`events/[eventId]/edit` の `actions.ts`）は、LINE通知のメッセージに入れる詳細ページのURLを、**DBの `Club.appBaseUrl`** から作る（`findClubLineContentContext`）。環境変数 `APP_BASE_URL` には、フォールバックしない。G5の初期化は `Club.appBaseUrl` を設定しない（NULL）ため、LINE通知が使えない。招待メールは、`Club.appBaseUrl` が無ければ `APP_BASE_URL` を使うため、F-4では、問題にならなかった。
- **設計との差：** 招待は、`Club.appBaseUrl` → `APP_BASE_URL` の順。LINE通知は、`Club.appBaseUrl` のみ。手順書の §19.1 は、この差を見落としていた。
- **対応（案）：** `Club.appBaseUrl` を、`https://arao-u12-basketballclub.com`（パス・末尾スラッシュなし）に設定する。本番DBへの書込みのため、承認（F-6a）が要る。以後、**ドメインを変える場合は、`Club.appBaseUrl` と `APP_BASE_URL` の両方**を更新する（`Club.appBaseUrl` が優先されるため）。
- **G5の初期化スクリプトの課題：** `Club.appBaseUrl` を、設定できない。今回は、手動SQLで足りる。

**【追加：2026-11-19】** 承認F-6a（`Club.appBaseUrl` の設定）、2026-11-19 11:33（右田和也）。値：`https://arao-u12-basketballclub.com`。結果は、実施後に追記する。
**設計の意図（利用者の質問）：** LINE通知だけが `APP_BASE_URL` にフォールバックしない理由は、設計書で、確認できなかった（マルチテナントでの、クラブ別URLの方針の可能性があるが、未確認）。本番では、`Club.appBaseUrl` の設定で足りる。

### 19.27 F-6a：`Club.appBaseUrl` の設定の実施記録（利用者が操作・報告、2026-11-19）

**【追加：2026-11-19】**

- **承認：** 承認F-6a、2026-11-19 11:33（右田和也）。実施：2026-11-19 11:35。
- **事前確認（読取り）：** `appBaseUrl` は空（NULL）、`planType` は STANDARD。想定どおり。
- **設定：** `UPDATE 1`。`appBaseUrl` は `https://arao-u12-basketballclub.com`。
- **確認（読取り）：** `Club` は `arao-u12` の1行のみ。`appBaseUrl` は設定済み、`planType` は STANDARD のまま、`updatedAt` は 2026-11-19 02:37 UTC（11:37 JST）。
- **結果：** 完了。F-6 の手順2（お知らせの作成）から、再開する。

### 19.28 F-6：LINEの実送信の実施記録と、後始末（利用者が操作・報告、2026-11-19）

**【追加：2026-11-19】** 本文・グループID・トークン・Webhook URL・個人情報は、記録していない。

- **承認：** 承認F-6、2026-11-19 11:24（右田和也）。**F-6a（`Club.appBaseUrl` の設定）の後に、手順2から再開した。**
- **事前確認（読取り）：** 通知先 1、有効 0。
- **受付成功：** お知らせの作成 11:35、配信状態が `SENT` になった時刻 11:36。
- **配送完了：** テスト用グループへの表示 11:36（LINE APIの受付と、グループへの表示は、別々に確認した）。
- **後始末：** 通知先を無効に戻した。テスト用のお知らせを削除した。読取りで、`enabled` が 0。
- **プランをSTARTERへ戻した：** 書込み用ターミナルで実施。`UPDATE 1`、`planType` は STARTER。接続先の確認（ポート5432・poolerなし・`PGOPTIONS` なし）も、期待どおり。**以後、アプリは、公開判断（承認H）まで、使えない。**
  - **経過（記録）：** 最初の戻しは、読取り用の設定（`PGOPTIONS`）が残る同じターミナルで実行したため、接続先の確認で止まり、書込みは行われなかった。書込みは、`PGOPTIONS` のない状態で、やり直した。
- **結果：** F-6 完了。

### 19.29 LINE通知リンクを、退会済みのアカウントで開くと404になる件（コードの読取り。2026-11-19）

**【追加：2026-11-19】**

- **現象（利用者の報告）：** LINEのお知らせ通知リンクを、**退会済み**のテスト用アカウントでログインして開くと、別のお知らせのリンクも含めて、404。**有効なOWNER**では、閲覧できた。通知リンクは、有効。
- **コードから分かること（意図した権限制御）：** お知らせ詳細（`/club/<slug>/notice/<id>`）は、`requireClubAppAccess` → `requireActiveClubMembership`（`club-membership-authorization.ts`）を通る。
  - 未ログイン：`/club-login` へ移る。
  - ログイン済みで、そのクラブに**ACTIVEな会員がない**（退会済み・休部中・招待中を含む）：**`notFound()`（404）**。コメントに、「クラブの存在を公開しない」とある。**意図した仕様。**
  - ACTIVEな会員で、クラブが **STARTER**：`requireClubFeature` が、「アプリは使えない」扱い（別の画面）。
- **ログイン後の戻り先：** ログイン画面には、戻り先（`returnTo` など）の仕組みが、見つからない。ログイン後は、`getClubLoginDestination` により、アプリが使えるクラブが1つなら `/club/<slug>/events`、それ以外は `/club/select`。**通知リンクを開いて、未ログインで、ログインしても、元のお知らせへは戻らない。**
- **通知URLの生成：** `Club.appBaseUrl` と `/club/<slug>/notice/<id>` から作る。生成に問題はない。
- **今回のテストの解釈：** 404は、退会済みの会員を、ACTIVE以外として、拒否する正しい動き。「別のお知らせのリンクも404」も、同じ理由（お知らせ単位ではなく、会員の状態で拒否）。
- **改善課題（案、今回は実装しない）：** (1)404の画面に、ログアウト・別のアカウントでの再ログインへの案内がない。(2)通知リンクから未ログインでログインした後、元のお知らせへ戻らない（戻り先の保持）。(3)退会・休部の会員への表示は、「クラブの存在を公開しない」方針と、利便性の、兼ね合い（方針は、利用者が決める）。

### 19.30 G10：手動受入の進め方（案）（Claudeが作成、2026-11-19。**手順書のみ。未実施・未承認。利用者の決定待ち**）

F13粒度別計画 G10 の受入は、「各項目に、実施結果か保留理由がある」こと。
対象は、運用書第10.5節（`mvp-verification.md`）と、F10・F11運用書の手動表（`event-month-copy.md`、`event-practice-batch.md`）。
**手動表の未確認欄は、一括更新しない**（計画の定め）。実施した項目と、保留した項目を、個別に、このG10の台帳へ書く。

#### 19.30.1 前提（確認した事実）

- 本番は、現在 **STARTER**。クラブアプリの画面（M系）は、STANDARD にしないと、本番では開けない（STANDARD への切替は、承認Gと同じ、操作ごとの承認が要る）。
- Server Actions のOrigin保護は、Nextの標準の動き。`next.config.ts` には、`allowedOrigins` の設定がない（`allowedDevOrigins` は開発用で、別物）。本番Proxy条件は、`proxy.ts`（セッション更新）で、`matcher` で経路を指定している。
- 手動表のM01〜M14・H01・H02は、自動試験（E2E・DB試験）に、根拠が既にある（第10.5節）。残るのは、実機・実ブラウザー・実HTTPでの確認。

#### 19.30.2 分類（案）

| 区分 | 項目 | 扱い（案） |
| --- | --- | --- |
| 止める（公開前に、結果が必要） | H03（外部Originの拒否・Proxy条件） | 実施する。結果が出るまで、公開しない（計画の「Proxy／Origin条件と主要導線は止める案」） |
| 止める | 主要導線（ログイン、招待、権限拒否、LINE通知） | G7で実施済み（§19.22〜§19.29）。M02相当（MEMBER・退会済みの拒否）の一部も確認済み。台帳へ転記する |
| 理由付きで保留できる | M01、M03〜M14、H01、H02 | 保留理由案：「自動試験（E2E・DB）で根拠あり。実機の手動は、公開後の、最初の実利用で確認」 |
| 保留か、簡易実施か（利用者が決める） | M15（キーボード・フォーカス・読み上げ・狭い画面） | 公開前に、1画面だけ簡易確認するか、理由付きで保留するか |

#### 19.30.3 H03の実施方法（案）

1. **本番形式のローカル検証（必須、本番へ触れない）：** `next build` → `next start` を、使い捨てのローカルDBへ向けて起動し、正しいリクエストの `Origin` だけを別のものへ変えて、POSTを送る。期待：Nextが拒否し、DBは変わらない。応答番号は推測せず、実際の応答を記録する。
2. **本番での確認（任意。利用者が決める）：** 本番の独自ドメインで、同じ操作をすると、本番への通信になる。拒否される想定で、DBへ書かないが、**本番への操作なので、操作ごとの承認を取る**。やる場合は、承認の様式を、別に出す。

#### 19.30.4 利用者が決めること

1. H03の本番での確認（上の2）を、やるか、ローカルの結果（上の1）だけにするか。
2. M15を、公開前に簡易確認するか、保留するか。
3. M01〜M14・H01・H02の保留理由の文言（案のままでよいか）。

#### 19.30.5 台帳（実施結果・保留理由。決定後に、記入する）

| 項目 | 結果（実施／保留） | 日時 | 根拠・保留理由 |
| --- | --- | --- | --- |
| H03 ローカル（本番形式） | 未 | | |
| H03 本番 | 未（実施するかは未決） | | |
| 主要導線（G7の転記） | 未転記 | | §19.22〜§19.29 |
| M15 | 未（簡易実施か保留かは未決） | | |
| M01〜M14・H01・H02 | 未（保留案） | | |

### 19.31 G10：利用者の決定と、実施計画・台帳（2026-11-19、Claudeが記録。**手動確認・E2Eの結果は、まだない**）

#### 19.31.1 利用者の決定（2026-11-19）

1. **H03：** まず、本番形式のローカル環境で実施する。本番DB・本番の秘密値は使わない。正常な同一Originの要求との比較で、外部Originの拒否とDB変更なしを確認する。**認証エラーや不正なAction IDによる拒否を、Origin保護の成功として扱わない。** VercelのProxy条件は、ローカルの結果と分けて記録する。本番通信による確認が要るなら、理由・対象・副作用を抑える方法を示す。**現時点では、本番への試験通信は承認しない。**
2. **M15：** 公開前に、主要1画面で簡易確認する。ローカルのテストデータで、キーボード・読み上げ・スマホ幅を確認し、画面と確認範囲を記録する。
3. **保留の書き方：** 自動試験に根拠がある項目は、試験と結果を示し、「手動確認は未実施」と区別する。保留には、未確認の内容と再確認時期を書く。権限・データ整合性など、公開判断に影響する未確認は、一括で保留せず、個別に挙げる。

#### 19.31.2 今回の変更（ローカルのテストコードだけ。本番・DB・設定に触れていない）

既存のH03の自動確認（`e2e/action-boundaries.spec.ts`）は、お知らせ・予定の共通保存Actionが対象で、**F10・F11の各Actionは対象外**だった。外部Originの拒否だけを見ており、正規Originでの成功との比較がなかった。そこで、次の2つのケースを、既存のE2Eファイルへ追加した（必須E2Eの一覧は、ファイル単位なので、変更なし）。

| ファイル | 追加したケース | 確認する内容 |
| --- | --- | --- |
| `e2e/event-practice-batch.spec.ts` | F11 外部OriginのAction POSTだけを拒否し、同じ要求は正規Originで保存される | 実UIの保存要求を、送信前に捕捉 → **Originだけを外部に変えて**、同じセッション・同じ本文・同じAction IDで再送 → HTTP 400以上、成功の遷移なし、生成イベント0件、完了記録0件 → **同じ要求を正規Originで再送** → 成功の遷移、生成1件、完了記録1件（既存の`saved`で、下書き固定・配送0件も確認） |
| `e2e/event-month-copy.spec.ts` | F10 同上 | 同上（前月予定の複製） |

後の「同じ要求の成功」が、前の拒否が、認証・Action ID・入力の不正ではなく、**Originだけが原因**であることを示す。

- **確認したこと（今回）：** `npx tsc --noEmit` はエラーなし。`npx eslint`（追加した2ファイル）は出力なし。F10・F11の関連unit（actions・pages・forms 計6ファイル）は、233件成功。
- **未実施：** 追加した2ケースの**実行**（E2E）。実行には、運用書第4〜7節の、使い捨て環境が要る（`npm run test:e2e`。E2Eは、現在の78件から、80件になる見込み。件数は、実行時の表示を記録する）。**成功扱いにしない。**
- **注意：** 既存のH03と同じく、応答は「HTTP 400以上」と、成功遷移がないこと、で判定する。Nextの拒否の文言・番号は、推測せず、実際の応答を記録する。サーバー側のログに、Origin不一致の拒否が出るかは、実行時に、利用者が確認できる範囲で記録する（原文は記録しない）。

#### 19.31.3 VercelのProxy条件・本番通信（承認なし。提示のみ）

- **ローカルで分かること：** Nextの `next start` での、Origin照合の動き。
- **ローカルで分からないこと：** Vercelの前段（独自ドメイン・CDN・Proxy）が、`Host`・`X-Forwarded-Host` を書き換えた場合の動き。`proxy.ts`（セッション更新）は、Origin照合とは別。これは、**ローカルの結果と分けて**、「本番条件は未確認」と記録する。
- **本番通信が必要になる理由（案）：** 独自ドメインでの、前段を含む、Originの扱いの確認のため。
- **副作用を抑える案（未承認・実施しない）：** 対象は、認証が要らず、DBへ書かない入口に限る（例：ログイン入口のActionへ、外部Originで送る。拒否されれば、何も実行されない）。F10・F11のActionなど、業務データを書き得る入口へは送らない。実施する場合は、操作ごとの承認様式を、別に出す。

#### 19.31.4 M15の簡易確認（案）

- **画面：** F11「定期練習の一括作成」（`/club/<slug>/admin/events/create-practice-batch`）。入力・候補選択・エラー・保存と、確認の観点が最も多い、1画面。
- **環境：** ローカルのDBと、テストデータ（`npm run db:seed:app:local`、`.env.local` が、本番でなく、ローカルを指すことを、先に確認する。値は、記録しない）。
- **確認する範囲：**

| 観点 | 確認内容 |
| --- | --- |
| キーボードのみ | Tabの順序、フォーカスの見え方、入力→曜日の選択→preview→候補の選択→保存、エラーからの修正と再確認、フォーカスの位置 |
| 読み上げ | macOSのVoiceOver：入力欄のラベル、fieldset（「作成する日を選択」）、エラー・件数・処理中・成功の読み上げ |
| スマホ幅 | 幅375px前後（ブラウザーの開発者ツール）で、横スクロールなし、操作できること。実機は、利用者が可能なら、1機種 |

- **記録する項目：** 画面、環境（ブラウザー・OSの版、読み上げソフト）、確認範囲、結果、未達（未達は、受入残件にする）。

#### 19.31.5 台帳（2026-11-19時点。実施結果は、まだない）

「自動根拠」は、過去の記録を含む。**今回の検証結果として扱わない**（今回実行したのは、上のunit 233件だけ）。過去の記録：2026-11-10、使い捨て環境で `verify:mvp` が全11段階成功（E2E 78件）。ただし、今回の修正前の版。

| 項目 | 自動根拠（試験） | 手動確認 | 未確認の内容 | 再確認の時期 |
| --- | --- | --- | --- | --- |
| H03 F10・F11（ローカル） | 追加した2ケース（`e2e/event-*.spec.ts`）。**未実行** | 未実施 | 外部Originの拒否と、正規Originでの成功の比較（F10・F11のAction） | G9の前（公開を止める条件。承認Hまで） |
| H03 共通のお知らせ・予定 | `e2e/action-boundaries.spec.ts`（過去に成功。今回未実行） | 未実施 | 同上（共通Action）。正規Originの比較は、この試験になし | G9の前（上と同時に実行） |
| H03 Vercel前段・Proxy | なし | 未実施（本番通信は未承認） | 独自ドメイン・前段を含む条件 | 公開後の、最初の安全な機会。承認の様式を、別に出す |
| M15 | UI表示・操作の自動試験あり | **簡易確認を実施済み（一部残件。19.34）** | 実機のスクリーンリーダー、複数機種、他の画面 | 簡易確認はG9の前。残りは、公開後の最初の実利用の後 |
| M01〜M14、H01、H02（F10・F11の個別） | 各`e2e/event-*.spec.ts`、`tests/event-*.flow.integration.test.ts`、unit（今回、関連6ファイル233件成功） | 未実施 | 実ブラウザーでの、全ロール・全入力の組合せ。M12・M13の本番相当の障害再現（別環境が要る） | 公開後、最初に、F10・F11を使う前（クラブの管理者が、初回に使う時） |
| M02 の各条件 | 下の表 | 未実施 | 下の表 | 下の表 |

**M02（権限）：公開判断に影響するため、個別に挙げる。** 対象：F10・F11の入力画面（`copy-previous-month`、`create-practice-batch`）と、その保存Action。

| M02の条件 | 自動根拠 | 実HTTPでの確認 | 未確認の内容 |
| --- | --- | --- | --- |
| 未ログイン | `tests/event-*-pages.test.ts`、`tests/event-*-actions.test.ts`（認可はmock）。実HTTP：`authorization.spec.ts`で、親の管理URL（`admin/events`）が、ログイン画面へ戻る | F10・F11の子URLは、未確認 | 子URL・保存Actionでの、実HTTPの挙動 |
| MEMBER | 同上のunit（Serviceを呼ばない）。実HTTP：親の管理URLで、MEMBERの拒否 | 子URLは、未確認 | 同上 |
| 所属失効（退会済み・休部中など） | unit（WITHDRAWNなど）。実HTTP：親の管理URLで、非ACTIVEと既存Cookieの再認可を拒否 | 子URLは、未確認。**G7で、退会済みアカウントが、お知らせのURLで404になることは実機で確認済み（§19.28・§19.29）** | F10・F11の子URL |
| 他クラブ | unit（other-club・missing）。実HTTP：Aの一般会員が、別クラブ・未知slugへ入れない | 子URLは、未確認 | 他クラブのOWNERが、このクラブの子URLへ入る場合 |
| STARTER・PRO（プラン） | unit（STARTER・PRO）。実HTTP：`authorization.spec.ts`で、プラン別の利用可否（親の管理URL・既存Cookie） | 子URLは、未確認 | 子URL・保存Action。**本番は、現在STARTER。STANDARDにした後に、確認が要る** |

M02の個別確認の方法（案、利用者が決める）：(a) 既存の `authorization.spec.ts` へ、F10・F11の子URLの拒否ケースを追加する（ローカルのE2E）。(b) 公開前に、ローカル環境で、MEMBERと退会済みの本人で、子URLを直接開く（手動）。**公開判断に影響する項目なので、保留にせず、公開前（G9の前）に、(a)か(b)で実施する案。**

#### 19.31.6 G7の結果の転記（実際に確認した範囲だけ）

| 項目 | 確認した内容（本番、2026-11-18〜19） | 記録 |
| --- | --- | --- |
| 招待メール | 受付成功、Resendで配信完了（Delivered）。受信側（Outlook）で、迷惑メールに分類された | §19.22 |
| 招待の受諾・ログイン | 招待リンク→受諾→ログイン。Auth URL・リダイレクトが動作 | §19.22 |
| 権限（MEMBER） | MEMBERの会員は、管理者向けの画面を使えない（確認した画面の範囲） | §19.22 |
| 権限（退会済み） | 退会済みにした後、クラブの画面へ入れない。お知らせのURLは404（意図した仕様） | §19.22・§19.29 |
| LINE Webhook | 切替後、LINE検証が成功。登録コードで、通知先を登録（無効の状態） | §19.24 |
| LINEの実送信 | テスト用グループへ、お知らせを送信。配送状態SENT、グループに表示 | §19.28 |

**転記していないもの（未確認）：** 既存HPのLINE通知（再発行後）、旧Webhookの挙動、F10・F11の画面・保存、M15、本番のProxy条件。MEMBER以外のロール（COACH・OFFICER）の、本番での画面確認は、記録にない。

### 19.32 G10：M02(a)の追加と、H03・M02の実行計画（2026-11-19、Claudeが記録。**E2Eは未実行**）

利用者の決定（2026-11-19）：M02の確認方法は(a)（ローカルE2Eへの追加）。追加したH03の2ケースは、ほかのテストと一緒に実行する（`verify:mvp`の全体実行）。

#### 19.32.1 追加した変更（ローカルのテストコードだけ）

| ファイル | 変更 |
| --- | --- |
| `e2e/authorization.spec.ts` | F10・F11の入力画面（`admin/events/copy-previous-month`、`admin/events/create-practice-batch`）の、M02の9ケースを追加：対照（OWNERは同じパスを開ける）1、未ログイン→`/club-login` 1、MEMBER 1、既存Cookieで最新DBの INVITED・SUSPENDED・WITHDRAWN 3、Bの管理者（他クラブ）1、STARTER・PROのOWNER 2。各ケースで、保護画面の見出しが出ないことも確認する |
| `e2e/fixtures.ts` | `authorization.path` の引数の型に、F10・F11の2つの相対パスを追加しただけ（【修正】。動作は変更なし） |

対照ケースで、拒否の原因が、パスの誤りではないことを示す。

#### 19.32.2 今回確認したこと（実行したもの）

- `npx tsc --noEmit`：エラーなし。`npx eslint e2e`：出力なし。
- `npx playwright test --list`：89件・12ファイル（78件 + H03の2件 + M02の9件。計算と一致）。**一覧であり、合格ではない。**
- MVPのunit（`vitest.mvp-unit.config.mts`）：132ファイル・4,272件成功。
- 必須E2Eの一覧（`MVP_E2E_SUITES`）は、ファイル単位のため、変更なし。ほかに、E2Eの件数を固定している箇所は、見つからなかった（`78` の検索で該当なし）。

#### 19.32.3 実行計画（利用者が実行。運用書 `mvp-verification.md` の第4〜7.1節・第11節に従う）

- **対象：** 使い捨てローカルSupabase（実行ごとのproject ID）と、`/private/tmp` 配下の新しいコピー。本番・通常のDB・Auth・Storageには触れない。通常のローカルSupabaseを一時的に止める。
- **実行：** `f12_e2e_env npm run verify:mvp`（全11段階）。成功の条件：`F12_MVP_PASSED 11` と終了コード0。E2Eは、89件が成功すること（件数は、実行時の表示を記録する）。
- **注意：** コピーは、Git追跡ファイルの**現在の内容**を使う（未コミットの変更を含む）。未追跡の新規ファイルは、コピーされない（今回の変更は、すべて追跡済みのファイルの編集なので、対象になる）。
- **戻し方：** 第11節（専用projectの `--no-backup` 停止、通常Supabaseの再起動、元ソースの差分確認）。

#### 19.32.4 台帳の更新（結果が出るまで、未実施のまま）

| 項目 | 状態 |
| --- | --- |
| H03 F10・F11（ローカル） | 追加済み・**未実行** |
| M02 各条件（F10・F11の子URL） | 追加済み・**未実行**（実行して合格すれば、「実HTTPの確認」欄を更新する） |

※ 2026-11-20に実行した結果と修正は、§19.33。上の表の「未実行」は、§19.33の時点で、更新が必要（受入の実行は、再実行待ち）。

### 19.33 G10：`verify:mvp` のE2E失敗の原因と修正（2026-11-20、Claudeが記録。**修正後の受入の再実行は、未実施**）

#### 19.33.1 経過（事実と、推定を分ける）

| 実行 | 結果 | 受入に数えるか |
| --- | --- | --- |
| 初回 `verify:mvp`（使い捨て環境、全11段階） | ENV〜INTEGRATIONの9段階は成功。**E2E段階で失敗**（固定表示 `F12_MVP_STAGE E2E FAILED`、`F12_MVP_FAILED`、終了コード1）。BUILD段階には到達していない | 数えない（失敗） |
| 診断1〜3 | Claudeが専用コピーへ入れた診断パッチが、`scripts/test-e2e.mjs` の型検査（`@ts-check`）を壊し、事前buildが失敗した。**失敗の原因の特定には使えない**（Claudeの誤り。診断が、結果を混乱させた） | 数えない |
| 診断4（型検査を通した診断。**専用コピーだけ**、ブラウザー段階の期限を15分へ延長） | 事前build成功、seed成功、アプリ起動成功。ブラウザー段階は**221秒**で終了。結果：期待どおり86、**期待外3**、flaky 0、skipped 0、errors 0。外部通信の違反記録は、事前build後・seed後とも0件（ファイル側・stub側）。期待外3件は、すべて `authorization.spec.ts` の、今回Claudeが追加したケース | 数えない（診断用に、runnerを変えた実行） |

期待外の3ケース：(1) 「F10・F11の入力画面は、OWNERが同じパスを開ける（拒否試験の対照）」、(2) 「STARTERではOWNERでもF10・F11の入力画面へ入れない」、(3) 「PROではOWNERでもF10・F11の入力画面へ入れない」。

診断で言えること：
- **5分の期限（`waitMvpChild(browser, 5 * 60000)`）の超過ではない。** ブラウザー段階は221秒で、期限（300秒）の内側だった。ただし、この221秒には、失敗した3ケースの待ち時間が含まれる（Playwrightのテスト上限は1件30秒）。修正後の所要時間は、再実行で記録し、余裕を確認する。期限の変更は、受入基準の変更になるため、利用者の決定とする。
- 既存の86件（H03の2ケースと、M02のほかの6ケースを含む）は、期待どおりに成功として数えられた。**ただし、診断用に変えたrunnerでの実行なので、受入には数えない。**
- 診断パッチは、専用コピー（`/private/tmp/f12-mvp.wtOkHv`）だけに入れた。元ソースには入れていない（`git grep F12_DIAG` で、元ソースに痕跡なし）。

#### 19.33.2 原因（推定。失敗の表示そのものは、取得していない）

runnerは固定表示だけを出し、Playwrightの個々の失敗メッセージを出さない。このため、原因は、**実装と既存テストからの推定**である。再実行で確認する。

- `aOwner` は、AのOWNERであり、BのMEMBERでもある（`e2e/fixtures.ts` の `definitions`）。
- ログイン後の遷移は、`app/(club-app)/club/select/page.tsx` の実装に従う：利用可能なクラブが**1件なら、そのクラブへ直接移る**。2件なら、選択画面（`/club/select`）。0件なら、「アプリを利用できるクラブがありません」を表示する。
- (1) 対照ケースは、A・Bとも利用可能（STANDARD）なので、ログイン後は選択画面になる。ところが、テストは、Aのパスへの遷移を待っていた。
- (2)(3) STARTER・PROのケースは、Aだけを利用不可にするので、利用可能なクラブはBの1件になり、ログイン後はBへ直接移る。ところが、テストは、`/club/select` への遷移を待っていた。
- 既存テストは、同じ形で正しく書かれている（`aOwner` で `/club/select` を待つ。Bだけ利用不可なら、Aのパスを待つ）。
- 失敗しなかったケース（MEMBER・COACH・Bの管理者）は、1つのクラブだけに所属する本人でログインするため、この影響を受けない。

結論：**アプリの不具合ではなく、Claudeが追加したテストの、ログイン後の遷移先の指定誤り。** 型検査・lintでは、検出できない種類の誤りだった。Claudeが、追加したケースを、実行前に、既存の同型テストと突き合わせなかった。

#### 19.33.3 修正（ローカルのテストコードだけ。1ファイル）

| 変更 | 内容 |
| --- | --- |
| `e2e/authorization.spec.ts`（対照ケース） | ログイン後の遷移先を、Aのパスから `/club/select` へ変更 |
| `e2e/authorization.spec.ts`（STARTER・PROのケース） | ログイン後の遷移先を、`/club/select` から、Bのパスへ変更。**Bは利用可能のまま残す。** これにより、Aの拒否の原因が、Aのプランだけであることを、示せる（元の意図より、強い確認になる） |

確認（実行したもの）：`npx tsc --noEmit` エラーなし。`npx eslint e2e` 出力なし。`npx playwright test --list` 89件・12ファイル（件数は変わらない）。件数を固定した箇所はない（`MVP_E2E_SUITES` はファイル単位。`assertMvpE2eResults` は、欠落・0件・skip・失敗だけを拒否する）。**これらは静的な確認と一覧であり、E2Eの合格ではない。**

#### 19.33.4 再実行と、台帳の扱い

- **再実行：** 新しい使い捨てコピー（元ソースの最新の内容）で、`verify:mvp` の全体（11段階）。成功の条件：`F12_MVP_PASSED 11` と終了コード0。診断用のrunnerは、使わない。
- **台帳（受入の結果が出るまで、「成功」にしない）：**

| 項目 | 状態（2026-11-20） |
| --- | --- |
| H03 F10・F11（ローカル） | 受入の実行で成功（下の19.33.5）。**ローカルの結果。Vercel・Proxyの条件は、未確認のまま** |
| M02 の、MEMBER・所属失効3種・他クラブ・未ログイン（6ケース） | 受入の実行で成功（19.33.5） |
| M02 の、OWNER対照・STARTER・PRO（3ケース） | 修正後、受入の実行で成功（19.33.5）。失敗の原因は、推定どおり、テストの遷移先の誤りと考えられる（失敗メッセージは未取得のため、「修正後に成功した」ことだけが事実） |

#### 19.33.5 受入の実行の結果（2026-11-20、利用者が実行・報告。使い捨てローカル環境）

- 実行：新しい使い捨てコピー（元ソースの現在の内容。`scripts/test-e2e.mjs` と `e2e/authorization.spec.ts` は元ソースと一致、診断の痕跡なし）で `npm run verify:mvp`。所要は約4分（07:31〜07:35）。
- 結果：**全11段階が成功。`F12_MVP_PASSED 11`、終了コード0。**
- E2E：89件が成功（失敗・skip・flaky なし）。内訳：`account-children` 3、`action-boundaries` 6、`authorization` 36、`event-month-copy` 6、`event-practice-batch` 8、`events` 6、`failure-observability` 3、`line-settings` 5、`members-invitations` 4、`notices` 6、`smoke` 1、`support-platform` 5。
- 5分の期限：実行全体が約4分で通ったので、今回は期限の内側。余裕は、E2E段階だけの時間が表示されないため、未計測。ケースを増やすときに見直す（変更は利用者の決定）。
- 事前準備のつまずき（結果には無関係）：依存フォルダーのコピーで、`rsync` が強制終了（137）した。原因は未特定。APFSのクローンコピー（`cp -cR`）に替えて解決した。
- **範囲：** 本番には触れていない。ローカル環境の結果であり、Vercel前段・Proxyの条件でのOrigin保護は、別に未確認（§19.31.3）。M01〜M14・H01・H02の手動確認、M15は、未実施のまま。

### 19.34 G10：M15の簡易確認の結果（2026-11-20、利用者が実行・報告。Claudeが記録。画面・読み上げは、Claudeは確認していない）

- **画面：** F11「定期練習の一括作成」。ローカルのDB・テストデータ（本番には触れていない）。
- **環境：** Chrome 143.0.7499.41（arm64）、Responsive 375×812。Safari 26.3（21623.2.7.11.6）＋macOS VoiceOver、macOS Tahoe 26.3。**実機のスマホは未確認。**
- **作った下書き：** 試行が多く、件数・対象月は不明（ローカルDBのみ。削除は別に判断する）。

| ID | 観点 | 結果 |
| --- | --- | --- |
| K1〜K5 | キーボードのみ（Tab順・フォーカス・一連の操作・エラー修正・フォーカス位置） | すべてOK |
| V1〜V3 | VoiceOver（入力欄のラベル・対象曜日のまとまり・候補「作成する日を選択」） | すべてOK |
| V4 | VoiceOver（エラー・選択件数・処理中・成功） | エラー・選択件数・成功：移動すると読めた。**処理中：短時間のため未確認** |
| 時刻欄 | VoiceOver（開始・終了・集合時刻） | **未達（残件）**。下記 |
| S1・S3 | 375px：横スクロールなし・候補一覧が読める | OK |
| S2 | 375px：操作できる | OK。ただし、「入力を変更してpreviewを作成し直す」と「月別管理ページへ戻る」が同じ行に並ぶ指摘 → 別の行に修正（`EventPracticeBatchForm.tsx`）。**修正後の画面確認は未実施** |

#### 19.34.1 時刻欄の読み上げ（残件。利用者の決定：未入力の仕様どおりとして、残件に記録する）

- 事実：画面を開くと、3つの時刻欄が画面上は「12:30」に見え、Safari＋VoiceOverは「0」と読む。時刻を入力し直すと、previewの候補は出た。
- コードの事実：3つの初期値は空文字（`page.tsx`）。標準の `type="time"` の入力欄。
- 推定（未検証）：「12:30」はSafariの未入力時の薄い表示で、「0」は空の値の読み上げ。Safariの要素検査で `.value` が空かを見る照合は、未実施。
- 影響：必須項目を空のままpreviewするとエラーになる（K4はOK）。
- 残件：補助説明（`aria-describedby`）での「未入力」の案内は、今回は行わない。再確認は、公開後の最初の実利用の後、または利用者が照合したとき。

#### 19.34.2 受入の残件（M15）

1. 時刻欄の読み上げ（上記）。
2. VoiceOver：処理中の読み上げ（未確認）。
3. ボタンの行分け：修正後の画面確認。
4. 実機のスマホ、他の画面、他の読み上げソフト・複数機種（範囲外）。
5. M15の確認で作ったローカルの下書きの扱い（件数不明）。

### 19.35 G10：手動表（M01〜M14・H01・H02）の台帳の確定（2026-11-20、利用者の方針に基づき、Claudeが記録。**手動確認は未実施。本番に触れていない**）

#### 19.35.1 利用者の方針（2026-11-20）

1. M02「他クラブのOWNER」：対象ケースと直近のE2E結果を照合し、存在して成功している場合だけ「自動試験で確認済み」とする。親URLの確認だけで子URLを確認済みとしない。
2. 保留理由の文言：「対応する自動試験（E2E・DB）で確認済み。実機での手動確認は未実施。対象機能の初回実利用前に、右田和也が確認する。」項目ごとに自動試験の根拠を対応付け、根拠がないものは「確認済み」に含めない。G7等で手動確認済みの項目は、保留と分けて記録する。
3. 再確認の時期：クラブ管理者がF10・F11を初めて実利用する前。必要な手動確認が終わるまで、対象機能の利用開始を保留する。
4. 権限・他クラブへのアクセス・データ整合性など、公開前に解消すべき未確認事項は、この保留にまとめず、公開判断の残件として別に示す。

#### 19.35.2 M02「他クラブのOWNER」の照合

- 対象ケース：`e2e/authorization.spec.ts`「Bの管理者は、AのF10・F11の入力画面へ入れない」（`bOwner` が `BATCH_PAGES` の2画面＝`admin/events/copy-previous-month`・`admin/events/create-practice-batch` を `?month=2028-02` 付きで開き、拒否と、見出しが表示されないことを確認）。**子URL（入力画面）の2画面を対象にしている。**
- 直近の実行結果：2026-11-20、`verify:mvp`（使い捨てローカル環境）で `authorization` 36件が全件成功（失敗・skipなし。§19.33.5）。ただし、ケースごとの結果一覧は取得していない（ファイル単位の件数のみ）。上のケースがファイルに存在し、ファイル内に失敗・skipがないことから、成功と判断する。
- 結論：**子URLの他クラブOWNERは、ローカルE2Eで確認済み。** ただし、保存Action（POST）での他クラブ越境は、E2Eでは未確認（19.35.4の残件）。

#### 19.35.3 手動表と自動試験の対応（保留とするもの）

保留理由（共通）：**対応する自動試験（E2E・DB）で確認済み。実機での手動確認は未実施。対象機能の初回実利用前に、右田和也が確認する。** 「自動の根拠」が空欄または「特定できず」の項目は、確認済みに含めない。ケース単位の照合は、見出しを見られたE2Eだけ。DB・unitは、各運用書（`event-month-copy.md`・`event-practice-batch.md`）の対応表に基づく、ファイル単位の対応で、ケース単位の照合は未実施。

| ID | F10（前月複製）の自動の根拠 | F11（定期練習の一括作成）の自動の根拠 |
| --- | --- | --- |
| M01 ロール | E2Eは、保存までの流れ（`event-month-copy.spec.ts`「表示月の入口…DRAFT保存」）。**COACH・OFFICERで入るE2Eは特定できず** | E2E（「Tokyoの月初・閏日…保存する」）。**COACH・OFFICERは特定できず** |
| M03 月・件数の境界 | 100件・101件はDB（運用書の対応表）。不正月はunit（`event-month-copy-pages.test.ts`） | 不正月・期間・曜日はunit（`event-practice-batch-pages/-forms.test.ts`） |
| M04〜M07（月末・DST・既存一致など） | E2E：Tokyo月末補正・既存一致（M05・M08相当）、NYのgap/fold（M07相当）。M04・M06相当はunit・DBのみ | E2E：Tokyoの月初・閏日・既存一致（M04・M07）、NYのDST除外（M05）。M06はunit・DBのみ |
| M08〜M10 | M08・M09の候補一致・不正sourceはunit・DB。M10（保存直前の変更）のE2Eは**特定できず** | E2E：遅い旧preview破棄（M08）、timezone変更（M09）。M10（31件・32件）はDBのみ |
| M11・M12 連打・応答喪失 | E2E（「連打を抑止し、応答喪失後も…」） | E2E（同上） |
| M13 保存後の再検証失敗 | E2E（「needsReload」） | E2E（同上） |
| M14 成功後の一覧・toast | E2E単独の対応は**特定できず**（保存を含む流れで通る範囲のみ） | 同左 |
| H01 直接POSTの再送 | E2Eの実Action再送（運用書の対応表）。ケース単位は未照合 | 同左 |
| H02 改変・越境・失効 | unit・DB・共通境界の試験（`action-boundaries`）。**F10・F11の両ActionへのMEMBER・他クラブ・失効の実HTTP POSTは未確認** | 同左 |

#### 19.35.4 公開判断の残件（保留にまとめない）

公開前（G9の前、または公開判断の前）に、解消するか、承知の上で受けるかを決める項目。

| # | 残件 | 理由 | 必要な確認（案） |
| --- | --- | --- | --- |
| 1 | F10・F11の**保存Action**への、MEMBER・他クラブ・失効所属の実HTTP POST（M02・H02） | E2Eは入力画面（Page）の拒否まで。保存の拒否は、unit・mockのみ | ローカルE2Eにケースを追加（保存Actionを、拒否される本人で再送し、DBが変わらないこと） |
| 2 | **COACH・OFFICER**の、F10・F11の利用（M01）と権限 | 該当するE2Eを特定できず | ローカルで、各ロールで入力画面と保存を確認（手動または追加E2E） |
| 3 | **STARTER→STANDARD後**のプランの確認（M02） | 本番は現在STARTER（F10・F11は使えない）。STANDARD切替後の権限は、本番で未確認 | G8でSTANDARDにした後、初回利用の前に確認 |
| 4 | **H03：Vercel前段・Proxy**（本番の条件） | 本番通信は未承認 | 承認の様式を出してから |
| 5 | **データ整合性**：F11の31件・32件の上限（M10）と、F10のpreview変更（M10相当）がE2Eで未確認 | DBの試験とunitのみ | 必要なら、E2Eを追加するか、手動で確認 |

#### 19.35.5 手動確認の済んでいるもの（保留と分ける）

- **G7（本番、2026-11-18〜19）：** 招待、ログイン、MEMBERの権限、退会済みの拒否、LINE Webhook・実送信（§19.31.6）。F10・F11の画面・保存は含まない。
- **M15（ローカル、2026-11-20）：** 簡易確認の結果（§19.34）。

#### 19.35.6 利用開始の保留

- クラブ管理者がF10・F11を初めて実利用する前に、右田和也が、手動表の確認を行う。**その確認が終わるまで、F10・F11の利用開始を保留する。**
- 19.35.4の残件は、上の保留とは別に、公開判断の前に扱う。

### 19.36 G10：公開判断の残件1・2・5のE2E追加と、受入の再実行の結果（2026-11-20、利用者が実行・報告。Claudeが記録。使い捨てローカル環境）

#### 19.36.1 追加したE2E（ローカルのテストコードだけ。`e2e/event-month-copy.spec.ts`・`e2e/event-practice-batch.spec.ts`）

| 残件（§19.35.4） | 追加したケース | F10 | F11 |
| --- | --- | --- | --- |
| 1（M02・H02） | 会員・他クラブの管理者・休部中の本人が、OWNERの保存Actionを直接再送しても拒否され、DBが変わらない。最後に正規の再送で成功（対照） | ○ | ○ |
| 2（M01） | COACH・OFFICERが、実画面で入力から保存まで操作でき、実行者がその本人（所有会員のroleを一時変更し、終了時に復元・完了記録を回収） | ○（2ロール） | ○（2ロール） |
| 5（M10） | F11：31日の月（2028-01）で全曜日を指定し、31件が保存される。F10：preview後に元予定が変わると、保存せず再previewを案内 | ○（変更検出） | ○（31件） |

- 拒否の判定は、HTTPの状態番号でなく、「成功の遷移がないこと」と「生成行・完了記録が0件のこと」で行う。

#### 19.36.2 実行の結果

- 実行：新しい使い捨てコピー（元ソースの現在の内容、追加後）で `npm run verify:mvp`。所要は約4分（12:25〜12:29）。
- 結果：**全11段階が成功。`F12_MVP_PASSED 11`、終了コード0。**
- E2E：**97件が成功**（失敗・skipなし）。内訳：`account-children` 3、`action-boundaries` 6、`authorization` 36、`event-month-copy` 10（+4）、`event-practice-batch` 12（+4）、`events` 6、`failure-observability` 3、`line-settings` 5、`members-invitations` 4、`notices` 6、`smoke` 1、`support-platform` 5。
- 単体・DB：unit・integration も全suite成功（event-month-copy・event-practice-batch のDB試験は、自然競合2・注入2を含む）。
- 回収：専用buildの回収、専用Supabaseの停止（終了コード0）、残存container・volumeなし、通常Supabaseの再起動（終了コード0）、元ソースの差分の確認。
- 範囲：**本番には触れていない。** ケース別の結果一覧は取得していない（ファイル単位の件数。追加した各ケースは、ファイル内の失敗なしで成功と判断）。

#### 19.36.3 §19.35.4 の残件の更新

| # | 残件 | 更新後の状態 |
| --- | --- | --- |
| 1 | F10・F11の保存Actionへの、会員・他クラブ・失効所属の実HTTP POST | **ローカルE2Eで確認済み**（拒否とDB非更新、正規再送の成功）。Vercel前段・Proxy経由は、残件4のまま |
| 2 | COACH・OFFICERの利用と権限 | **ローカルE2Eで確認済み**（F10・F11の保存、実行者の一致）。実機・実ブラウザーの手動は、利用開始前の確認（§19.35.6）に含める |
| 3 | STANDARD切替後のプラン確認 | **未確認のまま**（本番はSTARTER）。G8でSTANDARDにした後、初回利用の前に確認 |
| 4 | H03：Vercel前段・Proxy（本番の条件） | **未確認のまま**（本番通信は未承認） |
| 5 | データ整合性（M10相当） | F11の31件は、E2Eで確認済み。F10のpreview変更検出も、E2Eで確認済み。**F11の32件の拒否は、E2Eで作れないため、DB試験のみ**（このまま） |

- 手動確認（M01〜M14・H01・H02・M15の残り）は、未実施のまま。保留の条件は §19.35.1・§19.35.6 のとおり。

### 19.37 G9：公開判断の準備（2026-11-20、利用者の方針に基づき、Claudeが作成。**手順書のみ。本番は未操作・すべて未承認**）

**【追加：2026-11-20】** Claudeは本番へ接続していない。値（メール・UID・URL・トークン・グループID）は記録しない。本番の読取りも、操作ごとに承認を取る（第3章）。

#### 19.37.1 利用者の方針（段階1の決定）

1. コーチ3人は **B**（既存AuthのUIDに対応する `AppUser` だけを作成して招待）。**C**（招待コードの対応）は、将来の導入改善として残す。
2. Outlookの迷惑メールは、当面は受信側への案内で対応。現行ドメインのDNS確認（SPF・DKIM・DMARC）と、将来の共通ドメイン取得後の設定を分ける。DNS変更が必要なら、確認結果と変更案を先に示す。
3. H03の本番確認は、具体案を確認してから、実施を判断する。
4. 公開の直前に、新しい手動バックアップを取る。
5. Cronの正常動作と、トークン再発行後の既存HPのLINE通知を、公開前の確認条件にする。
6. 不要なテストデータは整理する。開発者用LINEグループは残し、テスト通知先は無効のまま。Authユーザーの削除は、別に判断する。

#### 19.37.2 全体の順序（案）

| # | 内容 | 本番への作用 | 承認 |
| --- | --- | --- | --- |
| 1 | 読取り確認：Cron（Supabase側の直近の実行）、テストデータの件数、コーチ3人のAuth UIDと `AppUser` の有無 | 読取り | 読取りの承認 |
| 2 | DNSの確認（公開DNSへの問い合わせ。本番システムに触れない） | なし | 不要（結果は、先に提示） |
| 3 | テストデータの整理 | 書込み（削除） | 個別承認 |
| 4 | コーチ3人の `AppUser` の作成（B） | 書込み（3行） | 個別承認 |
| 5 | 既存HPのLINE通知の確認（19.37.7） | 実送信・書込み | 個別承認 |
| 6 | H03の本番確認（19.37.5。実施するなら） | 本番への通信 | 個別承認 |
| 7 | **新しい手動バックアップ**（19.37.6） | 読取り（手元に複製ができる） | 承認B-1 |
| 8 | 2026-11-25 朝以降：ログ削除Cronの確認（19.37.7） | 読取り | 読取りの承認 |
| 9 | **承認H（公開判断）** | なし | 右田和也 |
| 10 | **承認G：STARTER→STANDARD**（第18章） | 書込み（1行） | 個別承認 |
| 11 | コーチ3人の招待（実メール）。LINEの本番グループの登録 | 書込み・実送信 | 個別承認 |
| 12 | 初回の実利用の前の手動確認（§19.35.6）。その後、安定確認、バックアップの削除 | ― | 右田和也 |

- 7（バックアップ）は、3・4（本番への準備の書込み）の**後**、9（承認H）の**前**に行う（バックアップの時点より後の書込みは、復元で失われ得る。第9.6節）。
- 8は、日付に依存する。2026-11-25 より前に、6までを済ませてよい。

#### 19.37.3 コーチ3人：Bの手順（`AppUser` だけを作成する。既存HPの認可・データは変えない）

**コードの読取り（`send-club-invitation.ts`）：** `AppUser` があると、招待の準備は、`AppUser.id` を既知のAuth IDとして、Authで照合する（`getClubInvitationAuthUserById`）。照合が通り、メールが確認済みなら、「既存ユーザー向け」のメール（Authのリンクを作らない）で送られる。1回目の失敗は、`AppUser` がなく、既存のAuthのメールに `generateLink`（`invite`）を呼んだことによる（§19.19）。**したがって、`AppUser` を先に作れば、この失敗を避けられる見込み。ただし、本番での招待は、未実施。** 条件：`AppUser.id` ＝ Authの `user.id`、`AppUser.email` ＝ Authのメール（正規化＝小文字、`normalizeEmail`）。

**触れないもの：** Authのテーブル・設定、`WEBSITE_ADMIN_USER_IDS`、既存HPのテーブル、`ClubMembership`（招待の受諾で作られる）、プラン。

**手順1（読取り。承認の後）：** 各コーチの `user.id` とメールを、Supabaseの管理画面（Authentication → Users）で控える（チャットには貼らない）。読取り用ターミナルで、次を確認する（`<uid>`・`<email>` は、各自の値）。

```sql
select count(*) from auth.users where id = '<uid>' and lower(email) = lower('<email>');
select count(*) from "AppUser" where id = '<uid>' or lower(email) = lower('<email>');
select count(*) from "PlatformAdmin" where id = '<uid>';
```
- 期待：1行目が1、2行目が0。3行目は、参考（コーチがPlatformAdminでないこと。1なら、報告）。
- 2行目が1以上なら、**作成しない**。内容（IDとメールの一致）を確認する。

**【訂正：2026-11-21】** 下の `INSERT` は、`AppUser.id` が text、`auth.users.id` が uuid のため、`u.id` を `u.id::text` にしないと、`text = uuid` のエラーになる（本番での最初の実行で判明。トランザクションは中断し、書込みはなかった。§19.42）。以下は、訂正後。

**手順2（書込み。個別承認の後。`PGOPTIONS` のない書込み用接続で）：** 3人を、1つのトランザクションで。1人分の例（`<name>` は、表示名。不要なら `NULL`）。

```sql
BEGIN;
INSERT INTO "AppUser" ("id", "email", "name", "createdAt", "updatedAt")
SELECT u.id::text, lower(u.email), '<name>', timezone('UTC', now()), timezone('UTC', now())
FROM auth.users u
WHERE u.id = '<uid>'
  AND lower(u.email) = lower('<email>')
  AND NOT EXISTS (
    SELECT 1 FROM "AppUser" a WHERE a.id = u.id::text OR a.email = lower(u.email)
  );
```
- 各 `INSERT` が **`INSERT 0 1`** であること（3人とも）。1つでも `INSERT 0 0` なら、`ROLLBACK;`（想定外の状態）。3つとも1なら、`COMMIT;`。
- 確認（読取り）：`select count(*) from "AppUser";`（作成前の人数＋3）。
- **戻し：** 招待の前なら、`DELETE FROM "AppUser" WHERE id IN ('<uid1>','<uid2>','<uid3>') AND NOT EXISTS (SELECT 1 FROM "ClubMembership" m WHERE m."userId" = "AppUser".id);`（`DELETE 3`）。`ClubMembership` ができた後は、戻さない。
- 本番での書込み前に、**ローカルで、同じ状態（Authに既存、`AppUser` 作成済み）の招待を、一度、再現して確認する案**（別の粒度。希望があれば）。

**招待（本番、承認Gの後）：** アプリの「招待」から、各コーチのメールへ、COACHまたは指定のロールで。受信側は、既存のHP管理者のパスワードで、ログインする。HP管理者の認可（`WEBSITE_ADMIN_USER_IDS`）は、変わらない。

#### 19.37.4 Outlookの迷惑メール：DNSの確認（現行ドメイン）と、将来の設定の分離

**現行ドメイン（確認だけ。変更は、結果を見てから提案）：** Resendで「Verified」は、利用者が確認済み。SPF・DKIM・DMARCの実際のレコードを、公開DNSに問い合わせる（本番システムには触れない）。`D` は、`MAIL_FROM_ADDRESS` のドメイン。Resendの標準の配置（DKIM：`resend._domainkey`、SPF・MX：`send` サブドメイン）を想定する。**実際のレコード名は、Resendの画面（Domains → DNS Records）と照合する。**

```bash
D="<ドメイン>"
dig +short TXT "resend._domainkey.$D"
dig +short MX "send.$D"
dig +short TXT "send.$D"
dig +short TXT "$D"
dig +short TXT "_dmarc.$D"
```
- 結果（レコードの有無と種類）を教えてほしい。DKIMの鍵そのものは、貼らなくてよい（有無と、`v=DKIM1` で始まるか）。
- 判定の目安：DKIM・SPFがあれば、Resendの認証は成立。**DMARCがない場合**は、迷惑メール判定に影響し得る（特に大手の受信側）。その場合の変更案（先に提示）：`_dmarc.<D>` に、TXT `v=DMARC1; p=none; rua=mailto:<受信先>`（監視のみ）。**DNSの変更は、確認結果を見て、承認の上で、右田が行う。**

**将来の共通ドメイン取得後（§15.4）：** 別の作業として、①ドメイン取得 ②Resendへ登録 ③DNS（DKIM・SPF・DMARC）④テスト送信 ⑤`RESEND_API_KEY` と `MAIL_FROM_ADDRESS` を同時に切替 ⑥`APP_BASE_URL`・`Club.appBaseUrl`・AuthのURLの更新。今回は、実施しない。

**当面の対応：** 招待を受ける人へ、「迷惑メールフォルダーの確認」と「送信元の許可登録」を、案内する（文案は、別に作る）。

#### 19.37.5 H03：本番確認の具体案（**実施するかは、右田が判断。手順の確認だけ**）

**目的：** Vercel前段・Proxyを通る本番の条件で、外部Originの Server Action 要求が、Next.jsの検査で拒否されることを確認する。ローカル（E2E 97件）では、確認済み。

**考え方：**
- **対象：** `/club-login` のログイン（Server Action）。ログイン前の画面で、STARTERでも使える。**実在するアカウントを使わず**、存在しない確認用メール（例：`h03-check@example.invalid`）と、無作為のパスワードを使う。
- **想定外に、外部Originの要求が通っても：** ログイン失敗になるだけ（存在しないアカウント）。業務データは変わらない。外部送信（メール・LINE）もない。**書込みは、ログイン試行の記録（`LoginSubmissionLog`、ハッシュのみ。30日で自動削除）が、1件増えるだけ。**
- **拒否と他のエラーの区別：** 同じ要求を、**Originだけ**変えて、2回送る。
  1. **対照（正しいOrigin）：** アプリが動き、ログイン失敗の表示を返す（アプリ側のエラー）。要求の形式・Action IDが有効なことを示す。**この対照が、`LoginSubmissionLog` を1件増やす（唯一の書込み）。**
  2. **外部Origin：** Next.jsが、アプリを呼ぶ前に拒否する（アプリ側のエラーの表示が、返らない）。対照と違う応答であれば、「Originによる拒否」と判断できる。
- 判定は、HTTPの状態番号だけで行わない（Nextの応答番号は、推測しない）。**応答の本文に、アプリのログイン失敗の表示が含まれるか**で区別する。Vercelのログ（約1時間の保持）に、Nextの拒否のメッセージが出れば、補強になる。

**手順（案。承認の後）：**
1. ブラウザー（ログアウト状態）で、`/club-login` を開き、開発者ツールの Network を開く。確認用メールと無作為のパスワードで、送信する（**対照の1回目。`LoginSubmissionLog` が1件増える**）。
2. Networkの、ページと同じパスへのPOSTを、右クリック → Copy → **Copy as cURL (bash)**。
3. ターミナルで（コピーした内容は、Cookie・Action IDを含み得る。ファイルは、終わったら削除）。

```bash
umask 077
H03_DIR="$(mktemp -d /private/tmp/h03.XXXXXX)"
pbpaste > "$H03_DIR/control.sh"
sed -E "s#-H '[Oo]rigin: [^']*'#-H 'origin: https://attacker.invalid'#" "$H03_DIR/control.sh" > "$H03_DIR/foreign.sh"
grep -c "attacker.invalid" "$H03_DIR/foreign.sh"
```
- 期待：最後が `1`（外部Originへ置換できている）。

```bash
bash "$H03_DIR/control.sh" -s -o "$H03_DIR/control.out" -w 'control status=%{http_code}\n'
bash "$H03_DIR/foreign.sh" -s -o "$H03_DIR/foreign.out" -w 'foreign status=%{http_code}\n'
wc -c "$H03_DIR/control.out" "$H03_DIR/foreign.out"
grep -c "<ログイン失敗の表示の一部>" "$H03_DIR/control.out" "$H03_DIR/foreign.out"
```
- `<ログイン失敗の表示の一部>` は、画面に表示される失敗メッセージの一部（1の画面で確認）。
- **期待：** control は一致あり（1以上）、foreign は一致なし（0）。応答の中身は、貼らない（状態番号と、一致の件数だけを報告）。

```bash
rm -rf "$H03_DIR"
unset H03_DIR
```
- **注意：** 手順1の対照の1回目と、3の対照の再送で、`LoginSubmissionLog` が合計2件（FAILED）になる。**ログインの失敗回数による制限（ブロック）が、同じメール・同じIPに働くか**は、未確認。回数は、最小（2回）に抑える。
- **別案（書込みなし）：** 承認Gの後（STANDARD）に、F11のpreview（DBを書き換えない読取り経路）の要求で、同じ手順を行う。ただし、承認Hの後になる。

> **【訂正：2026-11-20】** 上のH03の手順は、§19.38.2 で置き換える。`/club-login` のログイン（`loginAction`）は、`LoginSubmissionLog` へ書込まない（Supabase Authの `signInWithPassword` を呼ぶだけ。`LoginSubmissionLog` に書くのはHP管理者のログイン）。「ログイン試行の記録が2件増える」「`LoginSubmissionLog` の制限」の記述は、誤り。また、手順3の `bash foo.sh -s ...` は、curlへ引数が渡らない誤りで、§19.38.2 で直す。

#### 19.37.6 新しい手動バックアップ（公開の直前）：既存手順（第6章）からの差分

**そのまま使う：** 第6.2〜6.5節（取得前の記録、`pg_dump` 3本、Storage本体、取得後の確認、SHA-256）。承認B-1を、新たに取る。

**差分（今回、変わること・追加すること）：**

| 項目 | 前回（2026-11-12・16） | 今回 |
| --- | --- | --- |
| 保管先 | `~/f13-backups/<日時>/` | **新しい日時のフォルダー**（前回のものは、上書き・削除しない）。権限700、Git管理外・クラウド同期外 |
| 取得の時期 | migration前 | **本番への準備の書込み（19.37.2の3・4・5）の後、承認Hの前** |
| DBの内容 | アプリのテーブルは、ほぼ空 | OWNER・開発者・テスト用の行、`ClubLineSetting`（暗号化済みの資格情報）、通知先などを含む。件数は、6.2の `counts-before.tsv` で記録される |
| Storage | 15件（`club-app-attachments` は0） | **件数が変わっている可能性**。6.2の直前の集計で確認し、6.4の突き合わせ（欠け・余り・サイズ違いが0）を、必ず行う |
| 暗号鍵 | `LINE_CREDENTIAL_ENCRYPTION_KEY` の保全を確認 | **再確認**：鍵が、パスワード管理ツールにあり、`.env.prod`・Vercelと同じであること（値は、貼らない）。**再発行したLINEのChannel Secret・Access Token（新しい値）も、パスワード管理ツールへ保全されていること**（バックアップのDBには、暗号化された形で入る） |
| Authの設定 | 控えた | **F-1で変更したSite URL・Redirect URLsを、画面で、控え直す**（スクリーンショットに、秘密が写らないよう注意） |
| 環境変数 | 変数名と用途の一覧 | 一覧を更新（G6・G7の確認後の状態）。値は、パスワード管理ツール |
| Cron | 名前とスケジュールを控えた | 再確認（Supabase側の2本、Vercelの1本）。**コマンド文は、保存しない** |
| 復元リハーサル（B-2） | 実施済み（2026-11-13） | **全体の再リハーサルは、スキーマが変わっていなければ、不要**（案。右田が判断）。ただし、6.5の通過条件（`pg_restore --list`、チェックサム、前後の件数の差0）は、必ず行う |
| 取得中の書込み | ― | **取得中に、Cron（`storage-deletions`、毎時02分起点）と、LINE配信が動き得る**。6.4の注意に従い、時刻を避ける。6.5の「取得前後の差0」で確認 |
| 保持 | G9の安定確認まで | **前回・今回の両方**を、G9の安定確認まで保持。削除候補日（2026-12-17）は、公開日に合わせて、見直す |

#### 19.37.7 公開前の確認条件：Cron と 既存HPのLINE通知

**Cron（3本）の状態：**

| Cron | 確認済み | 未確認 | いつ・どう確認するか |
| --- | --- | --- | --- |
| Supabase側 `club-line-deliveries`・`storage-deletions`（5分間隔） | 2026-11-18：直近10件とも成功・200（約22分の範囲）。認証なしは401 | 長期の安定 | **いつでも**、読取りで、直近の実行を確認できる（第17.3節の確認2と同じSQL）。公開の直前に、再確認する |
| Vercel `/api/cron/delete-old-security-logs`（毎日 03:00 JST） | Cron一覧に登録済み。認証なしは401 | **実行して、削除が働くこと**（未判定） | 下記 |

**11月25日以降とする理由（記録から）：** このCronは、**30日より古い行を削除する**。`LoginSubmissionLog` の最古の行は、2026-10-25 11:38 で、**30日を超えるのは 2026-11-24 11:38 頃**。その次の定刻（**2026-11-25 03:00 JST**）の実行の後に、「30日より古い行が0件」であれば、削除が働いたと言える。それ以前は、30日より古い行が、もともと0件のため、**「動いていない」のと「動いて削除した」のを、区別できない**（`FormSubmissionLog` は空）。また、2026-11-18 の初回の実行は、Vercelの無料プランのログ（約1時間）が消えており、確認できなかった。

**11月25日より前に、確認できる範囲：**
1. **Supabase側のCron（2本）の、直近の実行**：読取りで確認できる（いつでも）。
2. **Vercel側の、ルートと認証**：認証なしの401は、確認済み。**認証付きの呼び出しが、200を返すか**は、未確認。Vercelの管理画面（Cron Jobs）から、**手動で実行**すると、認証付きの呼び出しになる。ただし、**これは本番への操作（承認が必要）**。実行すると、30日より古い行を削除する（**現在は、該当する行が0件のため、実質、何も削除しない**）。実行直後に、Vercelのログ（約1時間）で、応答（200）を確認できる。**これで、「ルートが動き、認証が通る」までは、25日より前に確認できる。「削除が働く」の確認は、25日以降。**
3. **2026-11-25 03:00 JST の実行を、直接、見る：** 実行から約1時間以内に、Vercelのログを見れば、定刻の実行と応答を確認できる（早朝のため、現実的でなければ、読取りの方法で代替）。

**判定条件（案）：** 公開の前提は、「Supabase側が、直近で成功」かつ「Vercel側が、2026-11-25 以降の読取りで、削除が働いている」。**公開日が11月25日より前になる場合の扱い**（上の2までで足りるとするか）は、右田が決める。

**既存HPのLINE通知（トークン再発行後）：**
- 現状：`lib/line/send-line-message.ts` が、環境変数 `LINE_CHANNEL_ACCESS_TOKEN`・`LINE_ADMIN_GROUP_ID` で、管理者グループへ送る（問い合わせ・体験申込みのフォームの通知）。再発行後（2026-11-18、§19.12）、Vercelの値を更新し、再デプロイ済みだが、**実際の通知は、未確認**（§19.31.6）。トークンが無効なら、失敗しても、フォーム自体は、成功扱い（通知の失敗は、握りつぶされ得る）。
- 確認の方法（案）：
  - **A（推奨）：** 本番のHPの問い合わせフォームから、確認用の送信を、1件行う。**副作用：** `Contact` の行が1件増える（管理画面で、削除できる）、`FormSubmissionLog` が増える、**運営向けのメール（現在4人）と、LINEの管理者グループに通知が届く**。実施前に、受信者へ「確認用の送信」と、予告する。
  - **B（書込みなし、有効性のみ）：** LINEのBot情報取得API（読取り）で、トークンの有効性を確認する。F-2aで、再発行後に実施済みの可能性がある。**ただし、Vercelの環境変数が新しい値であること、`LINE_ADMIN_GROUP_ID` へ届くことまでは、確認できない。**
- **判定：** Aで、LINEの管理者グループに、通知が表示されれば合格。届かなければ、Vercelの環境変数（有無・更新時刻）と、再デプロイの時刻を確認する（値は見ない）。

#### 19.37.8 テストデータの整理：削除候補と依存関係

**記録（§19.19〜§19.28）から把握できる、本番のテストデータ。** 実在と件数は、**読取りの確認が先**（下のSQL。件数と状態だけを出す）。削除は、個別承認の後。

| 対象 | 由来 | 依存（外部キー） | 扱い（案） |
| --- | --- | --- | --- |
| `ClubInvitation`（1回目、PREPARING→期限で自動失効の見込み） | F-4（§19.19） | 参照する行なし（`membershipId`・`authUserId` が null） | **削除候補**（先に、状態を読取りで確認） |
| `ClubInvitation`（再、ACCEPTED） | F-4（再、§19.22） | `membershipId` → テスト用 `ClubMembership`（削除時は SetNull）。この行を消しても、他の行に影響なし | **削除候補**（`ClubMembership` の前でも後でも可） |
| `ClubMembership`（テスト用MEMBER、WITHDRAWN） | §19.22 | `ChildClubMembership`（親の所属、Cascade）、`ClubEventMemo`・`ClubEventRead`・`ClubNoticeRead`（Cascade）、`ClubEvent`・`ClubNotice` の作成者・更新者（SetNull）、`SupportReport`（SetNull）、`ClubLineDelivery` の依頼者（SetNull）、`ClubInvitation.membershipId`（SetNull）、`ClubEventBatchOperation` の実行者（SetNull）。**このMEMBERが作成した行が、あれば、作成者がnullになる** | **削除候補**（先に、依存する行の件数を、読取りで確認） |
| `AppUser`（テスト用MEMBER） | §19.22 | `Child`（親、Cascade）、`ClubMembership`（Cascade）。**`AppUser` を消すと、所属・子どもも消える** | **削除候補**（`ClubMembership` の後） |
| Authのユーザー（テスト用MEMBER） | §19.22 | `AppUser.id` と同じID。Authを消すと、そのメールで、再度、招待できる（HP管理者として登録済みの別人には、無関係） | **別途判断**（今回は、削除しない） |
| `ClubLineRegistrationToken`（使用済み・期限切れ） | F-5（§19.24） | `ClubLineSetting`・作成者の `ClubMembership`（Cascade。削除しても、他へ影響なし） | **削除候補**（使用済み・期限切れのみ） |
| `ClubLineDelivery`（テストの配信、SENT） | F-6（§19.28） | 通知先は、Restrict（**配信行を消しても、通知先は残る**）。お知らせは削除済みで、`noticeId` は null | **削除候補**（本文のスナップショットが残るため）。通知先は、削除しない |
| `ClubLineTarget`（開発者用のテスト用グループ） | F-5・F-6 | 配信行（Restrict） | **残す（利用者の方針）。無効（`isEnabled = false`）のまま**（現在、無効に戻し済み。読取りで再確認） |
| `ClubNotice`（テスト用のお知らせ） | F-6 | 添付・既読・配信行 | **削除済み**（アプリで削除、§19.28）。残りがないか、読取りで確認 |
| `StorageDeletionJob`（添付の削除の記録） | お知らせに添付があった場合のみ | なし | 件数を確認。完了済みなら、削除候補 |
| `LoginSubmissionLog`・`FormSubmissionLog`（テストのログイン等） | テストの操作 | なし | **Cronが、30日で自動削除**。手動の削除は、しない |
| `ClubLineSetting`・`Club.appBaseUrl`・`PlatformAdmin`・OWNERの `AppUser`・`ClubMembership` | 実運用の設定 | ― | **残す** |

**読取りSQL（件数と状態だけ。承認の後）：**

```sql
select status, count(*) from "ClubInvitation" group by status order by status;
select role, status, count(*) from "ClubMembership" group by role, status order by role, status;
select count(*) from "AppUser";
select count(*) filter (where "usedAt" is not null) as used, count(*) filter (where "usedAt" is null and "expiresAt" < now()) as expired, count(*) filter (where "usedAt" is null and "expiresAt" >= now()) as active from "ClubLineRegistrationToken";
select status, count(*) from "ClubLineDelivery" group by status order by status;
select "isEnabled", count(*) from "ClubLineTarget" group by "isEnabled";
select status, count(*) from "ClubNotice" group by status order by status;
select status, count(*) from "ClubEvent" group by status order by status;
select status, count(*) from "StorageDeletionJob" group by status order by status;
select count(*) from "Child";
select count(*) from "SupportReport";
```
- 期待：OWNER 1（ACTIVE）、テスト用MEMBER 1（WITHDRAWN）、通知先1（無効）、お知らせ・予定・子どもは0 など。**想定外の行があれば、削除の前に、内容を確認する。**
- 削除の順序（案）：`ClubLineDelivery` → `ClubLineRegistrationToken` → `ClubInvitation` → `ClubMembership`（テスト用MEMBER、`id` と `status = 'WITHDRAWN'` を条件に）→ `AppUser`（テスト用MEMBER）。1つのトランザクションで、各 `DELETE` の件数が、想定どおりであること（`WHERE` に、`id` と状態を入れ、他の行を巻き込まない）。個別の `DELETE` 文は、読取りの結果を見て、承認の際に提示する。

#### 19.37.9 次に決めること・承認

- 19.37.5 のH03：実施するか（実施する場合は、ログイン試行の記録2件の副作用を承知するか）。
- 19.37.7：公開日が2026-11-25より前になる場合の、Cron の判定条件。既存HPのLINE通知の確認は、A・Bのどちらか。
- 19.37.6：B-2の再リハーサルの要否（案：スキーマが変わっていなければ不要）。
- 19.37.2の各操作の承認（1つずつ、承認の依頼文を、出す）。

### 19.38 G9：段階1の判断（第2回）と、手順の確定案（2026-11-20、Claudeが記録・作成。**本番は未操作・すべて未承認。実施日時は未定**）

**【追加：2026-11-20】** 値（メール・UID・URL・トークン・グループID・応答の本文）は、記録しない。

#### 19.38.1 利用者の判断（2026-11-20）

1. **H03：** `/club-login` のServer Actionによる試験を実施する。**正しいOriginと外部Originを各1回、合計2回に限定。** 実施日時と手順を確定してから実行する。ログイン試行記録の増加数は、必ず2件とはせず実測する。**Origin拒否・認証失敗・レート制限を区別し、判定できない場合は、繰り返さず、報告する。**
2. **既存HPのLINE通知：A**。通知を受ける運営者へ事前に予告し、「開発者による通知テスト・対応不要」と分かる問い合わせを、右田が1件送信する。メールとLINEの到着を確認し、テストの `Contact` の後始末も記録する。
3. **25日より前のCron判定：** 公開前は、必要な各ジョブの**呼出し先・認証・正常応答**を確認する。定刻の実行の証拠で足りなければ、手動実行の対象と影響を提示する。削除対象がないことは、**実行直前に、対象テーブルごとに再確認**する。**期限到来による実削除は、未確認として、担当者・確認日時を残し、公開後の確認項目にする。**
4. **B-2：** 前回の復元検証が成功しており、スキーマ・取得範囲・形式・復元手順に変更がなければ、全面再実施は不要。新しいバックアップは、既存手順で取得・検証し、前回の復元検証の根拠と今回の取得記録を対応付ける。変更点があれば、必要な追加検証だけを提示する。

#### 19.38.2 H03（改訂）：実測する項目と、判定の区別

**コードの読取り（`app/(club-app)/club-login/actions.ts`）：**
- `loginAction` は、`requestId` が前の状態と一致しなければ、「フォームの有効期限が切れました。…」を返す。形式の誤りは「入力内容を確認してください。」。
- その後、`supabase.auth.signInWithPassword` を呼ぶ。**失敗（誤った認証情報）も、Authのレート制限による失敗も、同じ表示「メールアドレスまたはパスワードが正しくありません。」になる**（`error` を区別しない）。**つまり、画面の表示だけでは、認証失敗とレート制限を区別できない。**
- アプリのDBへは書込まない（`LoginSubmissionLog`・`FormSubmissionLog` は、HPのフォーム・HP管理者ログイン用）。副作用は、**Supabase Auth側のログイン試行**（Authのログに記録され、IP単位のレート制限の計数に入る）だけ。

**実測する項目（読取り。承認の後。前後で、同じSQLを実行）：**

```sql
select 'LoginSubmissionLog' as t, count(*) from "LoginSubmissionLog"
union all select 'FormSubmissionLog', count(*) from "FormSubmissionLog"
union all select 'AppUser', count(*) from "AppUser"
union all select 'ClubMembership', count(*) from "ClubMembership";
```
- 期待：前後で**差0**（アプリのDBへ書込まない設計）。**差があれば、そのまま報告する**（想定外の書込み。繰り返さない）。
- Supabase Auth側の記録は、管理画面（Logs → Auth）で、試験の時刻の前後を、目視で確認する（**HTTP 429／`over_request_rate_limit` の有無**、ログイン失敗のイベントが、何件か）。件数は、実測値を記録する。

**判定の区別（応答と、ログから）：**

| 観察 | 判断 |
| --- | --- |
| 正しいOrigin（ブラウザーの送信）で、画面に「メールアドレスまたはパスワードが正しくありません。」。Authのログに、429なし | **アプリが動き、認証失敗**（対照が成立。要求の形式・Action IDは有効） |
| 同じ画面表示で、Authのログに **429（レート制限）** | **レート制限**（対照が、認証失敗と区別できない）。**試験を中止し、繰り返さず、報告** |
| 外部Originの再送の応答に、上の失敗表示の文字列が**含まれない**。Vercelのログ（約1時間）に、NextのOrigin不一致のメッセージ | **Originによる拒否**（アプリが呼ばれていない） |
| 外部Originの再送の応答に、上の失敗表示が**含まれる** | **Origin保護が、効いていない可能性**。**繰り返さず、報告**（本番の条件の対策が必要） |
| 外部Originの応答に、失敗表示も、拒否の根拠（ログ）もない | **判定できない**。**繰り返さず、報告**（HTTPの状態番号だけで判断しない） |

**手順（案。承認と、実施日時の確定の後）：** 確認用メールは、実在しないアドレス（例：`h03-check@example.invalid`）、パスワードは、無作為の文字列。

1. 読取りで、前の件数を取る（上のSQL）。Supabase Authのログを開いておく。
2. ブラウザー（ログアウト状態）で、`/club-login` を開き、開発者ツールの Network を開き、確認用のメールとパスワードで、送信する。**これが、「正しいOriginの1回」**。画面の表示を記録する。
3. Networkの、ページと同じパスへのPOSTを、右クリック → Copy → **Copy as cURL (bash)**。
4. ターミナルで、外部Originへ置換し、**1回だけ**送る（コピーした内容は、Cookie等を含み得るため、終わったらファイルを削除）。

```bash
umask 077
H03_DIR="$(mktemp -d /private/tmp/h03.XXXXXX)"
pbpaste > "$H03_DIR/control.sh"
sed -E "s#-H '[Oo]rigin: [^']*'#-H 'origin: https://attacker.invalid'#" "$H03_DIR/control.sh" > "$H03_DIR/foreign0.sh"
sed -E "1s#^curl #curl -s -o $H03_DIR/foreign.out -w 'foreign status=%{http_code}\\\\n' #" "$H03_DIR/foreign0.sh" > "$H03_DIR/foreign.sh"
grep -c "attacker.invalid" "$H03_DIR/foreign.sh"
head -c 80 "$H03_DIR/foreign.sh" | cut -c1-60
```
- 期待：`grep -c` が `1`（外部Originへ置換できている）。先頭が `curl -s -o …` で始まる。**ここまでは、送信しない。**

```bash
bash "$H03_DIR/foreign.sh"
wc -c < "$H03_DIR/foreign.out"
grep -c 'メールアドレスまたはパスワードが正しくありません' "$H03_DIR/foreign.out"
rm -rf "$H03_DIR"
unset H03_DIR
```
- 報告するもの：`foreign status=…`、応答の大きさ、一致の件数（0か1以上か）だけ。**応答の中身は、貼らない。**
5. 読取りで、後の件数を取り、前後の差と、Authのログ（429の有無、失敗の件数）を、実測値として報告する。
- **回数の上限：** ブラウザー1回＋再送1回の、合計2回。**結果が曖昧でも、繰り返さない。**
- **別案（書込みなし）：** 承認Gの後、F11のpreview（DBを書き換えない読取り経路）で行う。承認Hの後になる。

#### 19.38.3 既存HPのLINE通知：A（確認用の問い合わせを、1件送信）

**コードの読取り：** 問い合わせの送信後、`lib/line/admin-line-notifications.ts` が、`sendLineMessage`（`LINE_CHANNEL_ACCESS_TOKEN`・`LINE_ADMIN_GROUP_ID`）で、管理者グループへ送る。通知先メール（`FormNotificationSetting`・`ADMIN_EMAIL`）へも、メールが届く。**問い合わせの削除機能は、アプリ・管理画面のコードに、見つからなかった**（`contact.delete` の呼出しなし）。そのため、後始末は、**管理画面で状態を「対応済み」にし、メモに「テスト」と書く**（書込み。アプリの機能）か、**承認を得て、SQLで1行を削除**する。

**事前の予告（運営者へ。文案）：**
> 【お知らせ】○月○日 ○時ごろ、開発者が、ホームページの問い合わせフォームの通知テストを1件送信します。メールとLINEの管理者グループに、「開発者による通知テスト・対応不要」という通知が届きます。対応は不要です。

**送信する問い合わせ（右田が、ホームページの問い合わせフォームから、1件）：**
- 名前：`開発者通知テスト`、カナ：`カイハツシャツウチテスト`、メール：開発者本人のアドレス、電話：空欄。
- 内容の先頭に、`【開発者による通知テスト・対応不要】`、日時を入れる。

**確認（記録する）：** 送信の日時／フォームの完了表示／メールの到着（受信者、日時。本文は、記録しない）／LINEの管理者グループの表示（日時）／**受付成功と、配送完了を、別々に記録**。
**判定：** LINEのグループに表示されれば合格。届かない場合：Vercelの環境変数（`LINE_CHANNEL_ACCESS_TOKEN`・`LINE_ADMIN_GROUP_ID`）の有無と、更新時刻、再デプロイの時刻を確認する（値は見ない）。**通知の失敗は、フォームの成功を妨げない設計のため、フォームの完了だけでは、LINEの成功を判断しない。**

**後始末（記録する）：**
1. **読取り**で、テストの `Contact` を特定する：`select id, "createdAt", status from "Contact" where "createdAt" > now() - interval '1 day' order by "createdAt" desc;`（件数と時刻で、テストの1行を、特定）。
2. **【利用者の決定：2026-11-20】SQLで削除する**（承認の上、書込み用接続で。`PGOPTIONS` なし）。`BEGIN; DELETE FROM "Contact" WHERE id = '<特定したid>'; ` が **`DELETE 1`** であることを確認してから `COMMIT;`（0または2以上なら `ROLLBACK;` して報告）。削除の前に、読取りで、その1行が、テストの問い合わせ（内容の先頭の印・作成時刻）であることを、再確認する。管理画面の「対応済み」にする方法は、使わない。
3. `FormSubmissionLog` の1件は、Cronが30日で自動削除する（手動では削除しない）。
4. 実施者・日時・結果を、運用書へ記録する。

#### 19.38.4 Cron：公開前に確認する範囲と、手動実行の案

**3本の呼出し先・認証・正常応答：**

| ジョブ | 呼出し先 | 認証 | 正常応答 | 現在の証拠 | 公開前の確認 |
| --- | --- | --- | --- | --- | --- |
| `club-line-deliveries`（Supabase Cron、5分間隔） | `/api/cron/club-line-deliveries` | `CRON_SECRET`（Bearer） | 200 | 2026-11-18：直近10件、`succeeded`・200。認証なしは401 | **公開の直前に、第17.3節の確認2と同じ読取りを、再実行**（新しい実行の範囲） |
| `storage-deletions`（Supabase Cron、5分間隔） | `/api/cron/storage-deletions` | 同上 | 200 | 同上 | 同上 |
| `delete-old-security-logs`（Vercel Cron、毎日 03:00 JST） | `/api/cron/delete-old-security-logs` | 同上 | 200、`{ ok: true, formSubmissionLogs: {deletedCount, cutoffDate, retentionDays}, loginSubmissionLogs: {…} }` | 認証なしは401（確認済み）。**認証付きの200は、未確認** | 手動実行（下記）、または、2026-11-21 03:00 JST の実行の直後（約1時間以内）に、Vercelのログで確認 |

**手動実行の対象と影響（提示。承認の後）：**
- **対象：** Vercelの管理画面（Settings → Cron Jobs）で、`/api/cron/delete-old-security-logs` を、手動で実行する。Vercelが、認証付き（`CRON_SECRET`）で、本番の関数を呼ぶ。
- **影響（コードの読取り）：** `FormSubmissionLog` と `LoginSubmissionLog` の、**30日より古い行を削除**する（`deleteOldSecurityLogs`）。他のテーブルには、触れない。
- **実行直前の再確認（対象テーブルごと、読取り）：**

```sql
select 'FormSubmissionLog' as t, count(*) filter (where "createdAt" < now() - interval '30 days') as old, min("createdAt") from "FormSubmissionLog"
union all
select 'LoginSubmissionLog', count(*) filter (where "createdAt" < now() - interval '30 days'), min("createdAt") from "LoginSubmissionLog";
```
- **実行してよい条件：** 両テーブルとも `old` が **0**（削除対象がない）。**1以上なら、実行しない**（想定外の削除になる。内容を、先に確認）。実行の日時は、`LoginSubmissionLog` の最古の行（2026-10-25 11:38）が、30日を超える **2026-11-24 11:38 より前**であること。
- **期待する応答：** `ok: true`、両方の `deletedCount: 0`、`retentionDays` が、30。Vercelのログ（約1時間）で、確認する。
- **判定できること・できないこと：** 「ルートが動き、認証が通り、200を返す」までは、確認できる。**「期限を過ぎた行が、実際に削除される」は、確認できない**（対象がないため）。

**期限到来による実削除（公開後の確認項目として、残す）：**

| 項目 | 内容 |
| --- | --- |
| 確認内容 | 2026-11-25 03:00 JST の実行の後、`LoginSubmissionLog` の30日より古い行が0件で、最古の行が、実行時刻の30日前より新しい（第17.6節の確認3のSQL） |
| 確認日時 | 2026-11-25 の朝以降（担当者が、日時を記録） |
| 担当者 | 右田和也（確認の実施・記録）。結果は、運用書へ追記 |
| 公開前の扱い | **未確認として残す。公開前の条件には、含めない**（利用者の判断）。結果が「削除されていない」場合は、Vercelの Cron一覧・`CRON_SECRET`・ルートの応答を調べる（新たな読取りの承認が必要） |

#### 19.38.5 新しい手動バックアップと、前回の復元検証の対応付け（B-2の再実施は、不要とする条件）

**変更の有無の確認（コード・リポジトリの読取り）：**

| 観点 | 前回（B-1 2026-11-12／② 2026-11-16／B-2 2026-11-13） | 今回（2026-11-20時点） | 変更 |
| --- | --- | --- | --- |
| マイグレーション | 26件（履歴26件、`migration_lock.toml` を除く）。③（C）で適用済み（2026-11-16） | `prisma/migrations` は、26件のまま（2026-11-16 以降、追加の提出なし） | なし |
| スキーマ（`prisma/schema.prisma`） | ― | 2026-11-18 の1件（e8067c3）は、**コメント1行のみ**（`FormNotificationSetting` の説明）。モデル・列・制約の変更なし | コメントのみ（DBへは影響しない） |
| 取得範囲 | `public`（スキーマ＋データ）、`auth`・`storage`（データのみ）、スキーマ参照、Storage3バケット | 同じ（第6.3・6.4節を、そのまま使う） | なし |
| 形式 | `pg_dump` custom形式3本（サーバー17.6、`pg_dump` 18.6） | 同じ。**サーバー・`pg_dump` の版は、取得前に確認**（6.2の `server-version.txt`） | 版の確認が必要 |
| 復元手順 | 第7章（B-2） | 変更なし | なし |
| Storageのバケット | 3バケット（`club-app-attachments` は非公開・3MiB・PDF。G6で確認） | 変更なし（G6以降、バケットの変更なし） | なし（件数は、取得前に再集計） |

**前回の復元検証の根拠（記録）：** B-2（2026-11-13 07:05:54）：`public.dump` の復元（終了1・エラー4件は、環境差。件数・履歴は一致）、リハーサルの `migrate deploy` 終了0・`migrate status` 26件・`migrate diff` 空、戻しSQL動作、Storage本体の復元確認（5/10/0、失敗0）。**今回、同じ形式・同じスキーマなら、この根拠を引き継ぐ。**

**今回の取得記録との対応付け（取得後に、台帳へ記録）：**

| 前回の根拠 | 今回の取得で確認すること | 合格条件 |
| --- | --- | --- |
| サーバー17.6・`pg_dump` 18.6 | `server-version.txt`・`pg_dump --version` | 同じ版（違えば、下の追加検証） |
| 履歴26件・すべて完了 | `migrations-before.txt` | 26件・すべて完了（前回の②と、一致） |
| `public.dump` が復元できる | `pg_restore --list` が成功し、項目数が、前回と大きく違わない | 成功 |
| スキーマ参照 | 前回（②）と今回の `schema-reference.sql` を `diff` | 差0（権限・環境差を除く） |
| Storage本体 | 6.4の突き合わせ（NFC正規化、欠け・余り・サイズ違い） | すべて0 |
| 取得中に書込みなし | 6.5の前後の件数の差 | すべて0 |
| 破損なし | `SHA256SUMS.txt` の `shasum -a 256 -c` | 不一致0 |

```bash
ls -1 "$HOME/f13-backups"
PREV="$HOME/f13-backups/<前回(②)のフォルダー名>"
diff "$PREV/schema-reference.sql" "$F13_BACKUP/schema-reference.sql" | wc -l
diff "$PREV/server-version.txt" "$F13_BACKUP/server-version.txt" | wc -l
diff "$PREV/migrations-before.txt" "$F13_BACKUP/migrations-before.txt" | wc -l
```
- 期待：すべて `0`。

**追加検証が必要になる条件（必要なものだけ）：**

| 変更 | 追加検証（最小） |
| --- | --- |
| `schema-reference.sql` の差が、1以上 | 差の内容（どのオブジェクトか）を確認。スキーマの変更なら、`public.dump` の**復元リハーサル**（使い捨てのDBへ。第7章）と、`migrate status`・`migrate diff` |
| サーバー・`pg_dump` の版が違う | 新しい版で、`pg_restore --list` と、使い捨てのDBへの `public.dump` の復元（第7章の手順1〜3） |
| 履歴の件数が違う | 取得を中断し、原因（予期しないmigration）を確認 |
| Storageのバケットの設定が違う | バケットの設定の復元手順（第6.4節の1）を、記録で確認 |
| 暗号鍵・Authの設定を、更新した | 6.1の保全の再確認（値は貼らない） |

#### 19.38.6 実施日時・承認（未定）

- **H03・既存HPのLINE通知（A）の、実施日時（【更新：2026-11-22】利用者の報告）：** LINE通知（A）＝2026-11-22 17:00（運営者4人へ、新しい日時で、事前予告済み。利用者の報告、2026-11-22）、H03＝2026-11-22 17:15。**LINE通知（A）の確認と、送信後の読取りを終えてから、H03の前の件数を取る**（LINE通知（A）が `FormSubmissionLog` を1行増やすため、H03の前後の差0の判定が混ざらないようにする）。（経過：2026-11-21 19:27 に、両方を同時刻とする案があったが、上の理由で、順を分け、日時を変更した。2026-11-21 の時点では、どちらも未実施。）
- 【旧記載（2026-11-20）：】日時は、未定。確定してから、承認の依頼文を出す。LINE通知（A）は、運営者への事前の予告の後。H03は、読取りの承認（前後の件数）と、本番への通信の承認が、別々に要る。
- **次に、承認を取る操作（順）：** ①読取り（Cron直近の実行、テストデータの件数、コーチの `AppUser` の有無、H03の前の件数）。

### 19.39 G9：読取りの実施記録（利用者が実行・報告、2026-11-21 朝。Claudeは本番へ接続していない）

**【追加：2026-11-21】** 承認：右田和也、2026-11-21 7:53（範囲＝Cron直近の実行、テストデータの件数、コーチ3人のAuth UIDと `AppUser` の有無。すべて読取り）。接続：ポート5432、poolerなし、`PGOPTIONS` で読取り専用（利用者の報告）。実行したのはSELECTのみ。値（UID・メール・接続先）は記録していない。

**経過（記録）：**
- 新しいターミナルで、`f13_prod_env`（関数）の未定義と、`psql` のPATH未設定により、最初の2回は、コマンドが失敗した（本番へは未接続）。関数を定義し直し、`export PATH="$(brew --prefix libpq)/bin:$PATH"` で解消。
- コーチの確認は、最初の2人で `auth_match` が0だった。入力のずれ（前後の空白と見られる）が原因。空白を除く入力に直し、切り分けのSQL（`auth_total`・`id_match`・`email_match`・`both_match`）を実行。**この間の `appuser_exists`・`platform_admin` の0は、入力のずれた状態のものなので、無効**とし、空白を除いた入力で再実行した。

**結果1：Supabase Cron（直近10件ずつ。時刻はUTC。JSTは+9時間）**

| 項目 | 結果 | 期待との一致 |
| --- | --- | --- |
| `club-line-deliveries-every-5-minutes` | `succeeded` 5件。2026-11-20 23:00〜23:20 UTC（JST 2026-11-21 08:00〜08:20） | 一致 |
| `storage-deletions-every-5-minutes` | `succeeded` 5件。2026-11-20 22:57〜23:17 UTC（JST 07:57〜08:17） | 一致 |
| HTTP応答（`net._http_response`） | `status_code` 200 が10件。22:57〜23:20 UTC | 一致（401・404なし） |

- 判定：Supabase側のCron2本は、直近約23分間で、成功・200。長期の安定は、未確認のまま。**公開の直前に、再確認する**（§19.37.7）。

**結果2：テストデータの件数**

| 対象 | 結果 | 想定との差 |
| --- | --- | --- |
| `ClubInvitation` | `PREPARING` 1、`ACCEPTED` 1 | 想定どおり。`PREPARING` は、自動失効していない（削除候補の1回目） |
| `ClubMembership` | OWNER・ACTIVE 1、MEMBER・WITHDRAWN 1 | 想定どおり |
| `AppUser` | 2 | 想定どおり（OWNERとテスト用MEMBER。**どちらが、どちらかは、次の読取りで確認**） |
| `ClubLineRegistrationToken` | used 1、expired 0、active 0 | 想定どおり（使用済み1） |
| `ClubLineDelivery` | `SENT` 3 | **件数は、記録（§19.28）で、3件の配信を確認できていない。次の読取りで、通知先・時刻・作成元を確認する** |
| `ClubLineTarget` | 無効（`isEnabled = false`）1 | 想定どおり |
| `ClubNotice`・`ClubEvent`・`StorageDeletionJob` | 0（行なし） | 想定どおり |
| `Child`・`SupportReport` | 0 | 想定どおり |

**結果3：コーチ3人（件数のみ。3人とも同じ）**

| `auth_match` | `appuser_exists` | `platform_admin` | 判定 |
| --- | --- | --- | --- |
| 1 | 0 | 0 | Authのユーザーと一致。`AppUser` は未作成。PlatformAdminではない。**Bの作成（§19.37.3 手順2）へ進める** |

- 切り分けの結果（3人とも）：UID長36、`auth_total` 6、`id_match`・`email_match`・`both_match` が1。
- **まだ確認していないこと：** 3人のメールの綴りが、Authと、招待時に使う綴りで同じか（`lower` で比較済み）。`AppUser` の作成後に、招待の準備が通るか（本番は未実施）。

**次の読取り（案、承認が要る）：** テストデータの削除の前の特定。①`ClubLineDelivery` 3件の通知先・状態・作成時刻（本文は選ばない）、②2つの `AppUser` と `ClubMembership` の対応（ID・状態・作成時刻。メールは選ばない）、③テスト用MEMBERの所属に依存する行の件数、④`ClubInvitation` 2件の状態と時刻。

### 19.40 G9：読取り（2回目）の実施記録と、テストデータの削除案（利用者が実行・報告、2026-11-21 8:28 承認。Claudeは本番へ接続していない）

**【追加：2026-11-21】** 承認：右田和也、2026-11-21 8:28（範囲＝削除する行の特定。SELECTのみ）。接続：ポート5432、poolerなし、読取り専用、`psql` 18.6（利用者の報告）。内部ID（UUID）は記録する。メール・氏名・Auth UID・本文・トークンは、選んでいない・記録していない。時刻はDBの値（UTC）。JSTは+9時間。

**経過：** 最初の実行は、前回の `unset` により `PG*` 変数が消えていたため、ソケット接続のエラー（本番へは未接続）。`f13_prod_env` の再実行で解消。

**結果1：`ClubLineDelivery`（3件、すべて `SENT`・`NOTICE`・`attemptCount` 1）**

| id | requestedAt（UTC） | JST | sentAt（UTC） | 通知先 | 予定・お知らせ | 依頼者 |
| --- | --- | --- | --- | --- | --- | --- |
| `c887be02-7f00-4719-bfe5-51d1bafab049` | 2026-11-19 02:42:42 | 11:42 | 02:42:48 | 唯一の通知先（開発者用） | どちらも null（お知らせは削除済み） | あり（OWNERの所属。テスト用MEMBERではない） |
| `33594fbf-8db9-43fa-a51a-16b61b07293a` | 2026-11-19 02:45:58 | 11:45 | 02:46:02 | 同上 | 同上 | 同上 |
| `df7ff322-d31f-4c1a-b9a7-c4587ea1497e` | 2026-11-19 02:55:17 | 11:55 | 02:55:22 | 同上 | 同上 | 同上 |

- **記録との差（未解消）：** §19.28 の記録は、「お知らせの作成 11:35、配信状態が `SENT` 11:36」。DB上の3件は、11:42・11:45・11:55（JST）で、時刻が合わない。F-6の試験の途中の、再送・追加の送信と見られる（推定）。**利用者に、3件がF-6の試験の送信であることの確認を求める。**

**結果2：`AppUser` と `ClubMembership`**

| `AppUser`（IDの先頭8文字） | 作成（UTC） | 所属ID | role | status |
| --- | --- | --- | --- | --- |
| `113b33b1` | 2026-11-18 00:56 | `81a04541-f17b-48ba-86af-87cc4002a034` | OWNER | ACTIVE（**残す**） |
| `cdd4c46a` | 2026-11-19 01:28 | `3f09ad39-5bd5-4f33-b786-adce88b66ca8` | MEMBER | WITHDRAWN（テスト用。削除候補） |

**結果3：テスト用MEMBERの所属に依存する行（`target_memberships` 1）**

- `ChildClubMembership`・`ClubEventMemo`・`ClubEventRead`・`ClubNoticeRead`・送った招待・依頼した配信・LINE登録トークン・一括操作：**すべて0**。
- 受諾した招待（`membershipId` がこの所属）：1（`SetNull`。削除する招待）。
- 判定：削除で、巻き込まれる行は、ない。

**結果4：`ClubInvitation`（2件）**

| id | status | 作成（UTC） | 期限（UTC） | 受諾 | 所属 | Auth ID | 送信エラー |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `2faba898-d173-4e7d-b894-43b22179eb19` | PREPARING | 2026-11-19 00:34 | 2026-11-20 00:34 | なし | なし | なし | なし |
| `9fc52a45-a6c9-4d61-8603-f08eb89f1bf2` | ACCEPTED | 2026-11-19 01:28 | 2026-11-20 01:28 | 2026-11-19 01:36 | あり | あり | なし |

- 観察：1つ目は、期限（2026-11-20 00:34 UTC）を過ぎても、`PREPARING` のまま（期限での自動の状態変更は、ない設計と見られる。受諾は、期限で拒否される）。F-4の失敗（§19.19）の残り。

**削除案（書込み。個別承認の後。`PGOPTIONS` のない書込み用接続の、対話の `psql` で、貼り付ける）：**

```sql
BEGIN;
DELETE FROM "ClubLineDelivery"
WHERE id IN (
  'c887be02-7f00-4719-bfe5-51d1bafab049',
  '33594fbf-8db9-43fa-a51a-16b61b07293a',
  'df7ff322-d31f-4c1a-b9a7-c4587ea1497e'
) AND status = 'SENT';
DELETE FROM "ClubLineRegistrationToken" WHERE "usedAt" IS NOT NULL;
DELETE FROM "ClubInvitation"
WHERE id IN (
  '2faba898-d173-4e7d-b894-43b22179eb19',
  '9fc52a45-a6c9-4d61-8603-f08eb89f1bf2'
) AND status IN ('PREPARING', 'ACCEPTED');
DELETE FROM "AppUser" a
WHERE a.id IN (
  SELECT "userId" FROM "ClubMembership"
  WHERE id = '3f09ad39-5bd5-4f33-b786-adce88b66ca8'
    AND role = 'MEMBER' AND status = 'WITHDRAWN'
);
```
- 期待：`DELETE 3`、`DELETE 1`（トークンは全体で1件。結果の件数＝使用済み1・期限切れ0・有効0）、`DELETE 2`、`DELETE 1`（所属は、`AppUser` の削除で、Cascade により、同時に消える）。**1つでも違えば、`ROLLBACK;` して報告。**
- `COMMIT;` の前に、同じトランザクションで確認：

```sql
SELECT (SELECT count(*) FROM "ClubLineDelivery") AS deliveries,
  (SELECT count(*) FROM "ClubLineRegistrationToken") AS tokens,
  (SELECT count(*) FROM "ClubInvitation") AS invitations,
  (SELECT count(*) FROM "ClubMembership") AS memberships,
  (SELECT count(*) FROM "AppUser") AS app_users,
  (SELECT count(*) FROM "ClubLineTarget") AS targets;
```
- 期待：0・0・0・1・1・1。一致すれば `COMMIT;`。
- **削除しないもの：** `ClubLineTarget`（無効のまま）、OWNERの `AppUser`・所属、`ClubLineSetting`、`Club`、Authのユーザー（別に判断）。
- **戻し：** 削除は、戻せない。ただし、いずれもテストデータで、実運用の情報ではない。バックアップ（§19.37.6）は、削除の後に取る。

### 19.41 G9：テストデータの削除の実施記録（利用者が実行・報告、2026-11-21 10:34 承認。Claudeは本番へ接続していない）

**【追加：2026-11-21】** 承認：右田和也、2026-11-21 10:34（範囲＝§19.40 の削除案の4種類。確認事項「配信3件は、11月19日のF-6の試験で、右田が送ったもの」＝はい）。接続：書込み用（ポート5432、poolerなし、`PGOPTIONS` なし。サーバー17.6、`psql` 18.6）。値（接続先・認証情報）は記録していない。

| 段階 | 結果 | 期待との一致 |
| --- | --- | --- |
| 削除前の件数（配信・トークン・招待・所属・AppUser・通知先） | 3・1・2・2・2・1 | 一致 |
| `DELETE`（配信・使用済みトークン・招待・`AppUser`） | `DELETE 3`・`DELETE 1`・`DELETE 2`・`DELETE 1` | 一致 |
| `COMMIT` の前の確認 | 0・0・0・1・1・1 | 一致 |
| `COMMIT` | `COMMIT` | ― |
| `COMMIT` の後の確認 | 0・0・0・1・1・1 | 一致（確定を確認） |

- **削除した行：** `ClubLineDelivery` 3件、使用済みの `ClubLineRegistrationToken` 1件、`ClubInvitation` 2件、`AppUser` 1件（テスト用MEMBER。所属1件は Cascade で同時に削除）。
- **残した行：** `ClubLineTarget` 1件（無効のまま）、OWNERの `AppUser`・`ClubMembership`、`ClubLineSetting`、`Club`、Authのユーザー（テスト用MEMBERのAuthは、別に判断）。
- **経過（記録）：** ①新しいターミナルで、`f13_prod_env` が未定義だったため、関数を定義し直した（本番へは未接続）。②確認の後、`COMMIT` の代わりに、後始末の `unset …` を、`psql` の中へ貼った。トランザクションは開いたままで、確定していなかった。`\r`（バッファの消去）の後に、`COMMIT;` を実行して確定した。`unset` は、SQLとして実行されていない（本番への影響なし）。③`COMMIT` の後にも、同じ貼り付けの誤りが1回あった（バッファのみ。無害）。**以後、`psql` の中では、SQLと `\` コマンドだけを入力し、`unset` は、`\q` の後のシェルで行う。**
- **戻し：** 戻せない（テストデータ）。バックアップは、AppUser作成の後、承認Hの前に、取る（§19.37.2 の7）。
- **次：** コーチ3人の `AppUser` 作成（§19.37.3 手順2。書込みの個別承認が要る）。

### 19.42 G9：コーチ3人の `AppUser` 作成（方針B）の実施記録（利用者が実行・報告、2026-11-21 10:52 承認。Claudeは本番へ接続していない）

**【追加：2026-11-21】** 承認：右田和也、2026-11-21 10:52（範囲＝`AppUser` 3件の作成のみ。表示名は、利用者が端末へ直接入力した）。接続：書込み用（ポート5432、poolerなし、`PGOPTIONS` なし。サーバー17.6、`psql` 18.6）。UID・メール・表示名は、記録していない。

| 段階 | 結果 | 期待との一致 |
| --- | --- | --- |
| 入力の長さ（UID・メール） | UID 36・36・36、メール 18・20・22 | 一致（前回の確認と同じ並び） |
| 作成前の件数（`AppUser`） | 1（OWNERのみ） | 一致 |
| 1回目の `INSERT`（§19.37.3 の訂正前の SQL） | `ERROR: operator does not exist: text = uuid`。トランザクションは中断。`ROLLBACK` | 書込みなし（作成前の件数1のまま） |
| 2回目の `INSERT`（`u.id::text` に訂正） | `INSERT 0 1` ×3 | 一致 |
| `COMMIT` の前の確認 | `AppUser` 4、作成した3人 3、`name` が空 0、`ClubMembership` 1 | 一致 |
| `COMMIT` | `COMMIT` | ― |
| 後始末 | 入力変数・`PG*` を `unset`。`env \| grep -c '^PG'` が 0 | 一致 |

- **経過（記録）：** 1回目は、運用書の SQL の型の誤り（`AppUser.id` が text、`auth.users.id` が uuid）により、エラー。Claudeが §19.37.3 に書いた誤り。`ROLLBACK` の後、`u.id::text` に訂正した SQL で、やり直した。§19.37.3 も、同日に訂正した。
- **作成した行：** `AppUser` 3件（`id`＝Authのユーザーid、`email`＝Authのメール（小文字）、`name`＝利用者が入力した表示名）。
- **触れていないもの：** Authのテーブル・設定、`WEBSITE_ADMIN_USER_IDS`、既存HPのデータ、`ClubMembership`（1件のまま）、プラン（STARTER）。
- **COMMIT後の確認（読取り）は、`COMMIT` の直前のものと同じ内容で、`COMMIT` の後の独立した確認は、未実施。** `COMMIT` が正常に返った（プロンプトが `postgres=>` に戻った）ことで、確定とみなす。公開の直前の読取りで、`AppUser` が4件であることを、再確認する。
- **戻し：** 招待の前なら、`DELETE FROM "AppUser" WHERE id IN ('<uid1>','<uid2>','<uid3>') AND NOT EXISTS (SELECT 1 FROM "ClubMembership" m WHERE m."userId" = "AppUser".id);`（`DELETE 3`）。`ClubMembership` ができた後は、戻さない。
- **未確認：** 本番での招待（承認Gの後）。`AppUser` を先に作ることで、F-4 の「準備中で止まる」失敗（§19.19）を避けられる見込みだが、本番では未実施。

### 19.43 G9：現行ドメインのDNS確認（利用者が実行・報告、2026-11-21。公開DNSへの問い合わせのみ。Claudeは何も実行していない）

**【追加：2026-11-21】** 対象：`MAIL_FROM_ADDRESS` のドメイン（現行のARAOのドメイン。ドメイン名・受信先は記録しない）。実行したのは `dig +short`（公開DNSへの問い合わせ）のみ。本番システム・Resendへの操作はない。承認は不要な範囲（§19.37.2 の2）。

| 項目 | 結果 | 判定 |
| --- | --- | --- |
| DKIM（`resend._domainkey`、TXT）の件数 | 1 | **レコードあり** |
| そのうち `v=DKIM1` を含む件数 | 0 | **要確認**：Resendの値は `p=`（公開鍵）で始まる形が一般的で、`v=DKIM1` を含まない場合がある（推定。Resendの画面の値との照合は、未実施）。Resendの画面は Verified（利用者が確認済み） |
| `send` サブドメインの MX の件数 | 1 | 設定あり |
| `send` サブドメインの SPF（`v=spf1`）の件数 | 1 | 設定あり |
| ルートの SPF（`v=spf1`）の件数 | 0 | 差出人が `send` 側を使う構成では、必須ではない（要確認：差出人のドメインとResendの設定の対応） |
| DMARC（`_dmarc`、`v=DMARC1`）の件数 | 0 | **なし** |

**判断（案。DNSの変更は、まだ、していない）：**
- DKIM・SPFは、Resendの標準の配置で、設定されている。**DMARCが、ない。** 迷惑メール判定で、受信側（特にOutlook）が見る材料の1つ（影響の大きさは、推定）。
- 変更案：`_dmarc.<ドメイン>` に、TXT `v=DMARC1; p=none;`（監視のみ。**配信には影響しない**）。`rua=mailto:<受信先>` は、レポートの受信先を読む運用ができるまで、付けない案（付けると、集計レポートが、毎日、届く）。
- **DNSの変更は、外部設定の変更にあたるため、承認の上で、右田が行う。**
- **未確認：** DNSの管理先（レジストラ・DNS事業者）、既存のメール運用（このドメインで、別のメールを使っていないか）、DMARC追加の後の、Outlookでの実際の効果（実メール送信の承認が要る。承認Gの後の招待で、確認する）。

#### 19.43.1 利用者の方針（2026-11-21。**DNSは、まだ変更していない**）

1. DMARC：`v=DMARC1; p=none;` を追加する。`rua` は付けない（レポートの受信・監視は、後の課題）。迷惑メール分類の改善を、保証するものではない（利用者は、理解済み）。
2. 実施前に、既存のDMARCがないことを確認する。追加先・値・確認方法・戻し方を含む承認依頼を提示する。既存のSPF・DKIM・MXなどは、変更しない。
3. DNSの管理先：Cloudflare（ネームサーバー2つを、利用者が確認）。Cloudflareの画面に合わせて、手順と承認依頼を示す。
4. 同じドメインのメール利用：Resendによる既存HP・クラブアプリの送信に使っている可能性がある。それ以外の送信サービス、独自ドメインの受信用メールはない（利用者の報告。引き続き確認する）。

#### 19.43.2 DMARC追加の手順（案。承認の後に、利用者がCloudflareで実施）

| 項目 | 内容 |
| --- | --- |
| 追加先 | Cloudflare → 該当ドメイン → DNS → Records |
| 種別・名前 | `TXT`、名前 `_dmarc`（Cloudflareは、ドメインを、自動で補う） |
| 値 | `v=DMARC1; p=none;`（引用符は付けない） |
| TTL | Auto |
| 変更しないもの | 既存のSPF・DKIM・MX、その他のレコード |
| 実施前の確認 | 権威サーバー（Cloudflare）へ、`_dmarc` の TXT・CNAME の有無を問い合わせる（0件）。DNSレコードの一覧のエクスポート（手元のファイル。内容は、貼らない）と、レコード数の控え |
| 実施後の確認 | 権威サーバーと公開DNSで `_dmarc` の TXT が1件（`v=DMARC1` を含む）。DKIM・MX・SPFの件数が、実施前と同じ。Cloudflareのレコード数が、実施前＋1 |
| 戻し方 | Cloudflareで `_dmarc` の TXT を削除（削除で、変更前の状態に戻る。他に影響しない） |

### 19.44 G9：DMARC追加の実施記録（利用者が実行・報告、2026-11-21 17:47 承認。DNSの変更はCloudflareで、利用者が実施。Claudeは何も実行していない）

**【追加：2026-11-21】** 承認：右田和也、2026-11-21 17:47（範囲＝Cloudflareの `_dmarc` のTXT 1件の追加のみ。値 `v=DMARC1; p=none;`、`rua` なし、TTL Auto）。ドメイン名・受信先は記録しない。

| 段階 | 結果 | 期待との一致 |
| --- | --- | --- |
| 実施前：権威サーバー2つの `_dmarc` の TXT・CNAME | 2つとも TXT 0・CNAME 0 | 一致（既存のDMARCなし） |
| 実施前：権威サーバー2つの DKIM・`send` のMX・`send` のSPF | 2つとも 1・1・1 | 一致 |
| 実施後：権威サーバー2つの `_dmarc` の TXT・`v=DMARC1` を含む件数 | 2つとも 1・1 | 一致 |
| 実施後：公開DNSの `_dmarc` の TXT・`v=DMARC1` を含む件数 | 1・1。値は `"v=DMARC1; p=none;"` | 一致（反映済み） |
| 実施後：権威サーバー2つの DKIM・`send` のMX・`send` のSPF（再確認） | 2つとも 1・1・1 | 一致（既存のレコードは、変わっていない） |
| Cloudflareのレコード数（画面。利用者の報告） | 実施前 6、実施後 7 | 一致（実施前＋1） |
| DNSレコードのエクスポート（実施前。手元のファイル） | 取得済み（利用者の報告）。内容は、記録・共有しない | 一致 |

**未報告・未確認（2026-11-21 時点）：**
- 迷惑メール分類の実際の改善（保証しない。承認Gの後の招待メールで、確認する）。`rua` なしのため、DMARCレポートは、届かない（レポートの受信・監視は、後の課題）。
- **戻し方：** Cloudflareで `_dmarc` のTXTを削除（他に影響しない）。

### 19.45 G9：既存HPのLINE通知の確認（A）の実施記録（利用者が実行・報告、2026-11-22。Claudeは本番へ接続していない）

**【追加：2026-11-22】** 承認：読取り（3回目）＝右田和也、2026-11-22 16:50（範囲＝`Contact`・`FormSubmissionLog` の件数、テストの `Contact` の特定（`id`・`createdAt`・`status` のみ）、H03の前後の件数、Supabase・Vercelのログの閲覧）。実送信＝右田和也、2026-11-22 16:50（問い合わせフォームから、確認用の1件）。運営者4人へ、2026-11-22 17:00 の日時で、事前予告済み。メール・氏名・本文・UID・接続先は記録しない。時刻は、特記なければJST。

**経過（接続）：** ①16:50ごろ、直接接続のホスト（IPv6のみ。IPv4アドレス0件）へ、`psql` が、タイムアウト。②iPhoneのテザリング、通常のWi-Fiの両方で、`No route to host`（名前解決は、一部で失敗。`PGHOSTADDR` で迂回しても、到達できない）。**このDBのIPv6アドレスへの経路が、利用者の2つのネットワークから、なかった。**③**Session pooler（ポート5432、IPv4可）へ、接続経路を変更する承認：右田和也、2026-11-22 17:37**（範囲＝読取りのみ。読取り専用は、SQLの先頭の `SET default_transaction_read_only = on;`）。`show default_transaction_read_only` が `on`。④以降の読取りは、すべてSession pooler経由。**書込み（後始末の削除）の接続経路は、別に承認が要る。**

**結果：**

| 項目 | 結果 | 判定 |
| --- | --- | --- |
| 送信前の件数（Session pooler経由。送信の前） | `Contact` 1、`FormSubmissionLog` 0 | 送信前から、`Contact` は1行（2026-08-17作成、`REPLIED`。実運用の問い合わせ。**残す**） |
| フォームの完了表示 | あり（17:49） | 受付成功 |
| メール到着（運営者4人） | あり（17:52） | 配送完了（メール）。受付から約3分 |
| LINEの管理者グループの表示 | あり（17:53） | **配送完了（LINE）。トークン再発行後の通知は、動いている** |
| 送信後の件数 | `Contact` 2、`FormSubmissionLog` 1 | 一致（それぞれ+1） |
| 新しい `Contact`（テストの行） | `id` `a8af06e8-e111-423e-99be-78c2cad26a68`、作成 2026-11-22 08:48:55（UTC。JST 17:48:55）、`PENDING` | 送信の時刻と一致 |

- **観察（原因は未確認）：** フォームの完了（17:49）から、メール（17:52）・LINE（17:53）の到着まで、約3〜4分。通知の遅れの原因（送信側・受信側のどちら）は、未確認。実運用の通知が、数分遅れる可能性として、運営者へ、案内する案。
- **判定：** 既存HPの、メール通知・LINE通知とも、**届いた**（受付成功と配送完了を、別々に確認）。

#### 19.45.1 後始末：テストの `Contact` の削除（利用者が実行・報告、2026-11-22 17:58 承認）

承認：右田和也、2026-11-22 17:58（範囲＝`Contact` `a8af06e8-e111-423e-99be-78c2cad26a68` の1件の削除。接続経路＝Session pooler、ポート5432、書込み用＝読取り専用の設定なし）。

| 段階 | 結果 | 期待との一致 |
| --- | --- | --- |
| 削除前の読取り（内容の先頭の印・名前の一致） | 新しい行：`test_marker` t・`test_name` t。古い行（`b12e6e81-…`）：どちらも f | 一致 |
| `show default_transaction_read_only` | `off` | 一致（書込み可能） |
| 削除前の件数（`Contact`） | 2 | 一致 |
| `DELETE`（`id`・`status`・`name`・内容の先頭の印の4条件） | `DELETE 1` | 一致 |
| `COMMIT` の前の確認 | `contacts` 1・`test_row` 0・`real_row` 1 | 一致 |
| `COMMIT` | `COMMIT` | ― |
| 後始末 | `PG*` を `unset`。`env \| grep -c '^PG'` が 0 | 一致 |

- **削除した行：** テストの `Contact` 1件。**残した行：** 実運用の問い合わせ `b12e6e81-…`（2026-08-17、`REPLIED`）。`FormSubmissionLog` の1件は、Cronが30日で自動削除する（手動では削除しない）。
- **`COMMIT` の後の独立した読取りは、未実施。** `COMMIT` が正常に返ったことで、確定とみなす。公開の直前の読取りで、`Contact` が1件であることを再確認する。
- **戻し：** 戻せない（テストデータ）。
- **接続経路（残件）：** 今回、書込みも、Session pooler（直接接続のIPv6に、利用者の2つのネットワークから到達できなかったため）で行った。H03・バックアップ・STANDARD切替などの、今後の本番作業の接続経路は、作業ごとの承認に、書く（直接接続／Session pooler）。方針は、利用者が決める。

### 19.46 G9：接続経路（Session pooler）の方針、`pg_dump` の適合確認、H03の実行手順の分離（2026-11-22、利用者の方針に基づき、Claudeが作成。**本番は未操作・すべて未承認**）

**【追加：2026-11-22】** Claudeは本番へ接続していない。値（接続先・UID・メール・URL）は記録しない。

#### 19.46.1 利用者の方針

1. 接続経路：今回の手動作業は、**Session pooler**（Transaction poolerとは区別。SupabaseのConnect画面にある、対象プロジェクトのSession pooler接続情報）を使う。まず、読取りで、接続先を確認する手順を示す。**接続経路の変更だけを理由に、Vercelの環境変数・アプリの接続設定は、変更しない。**
2. `pg_dump`：公式のバックアップ手順と、今回の取得範囲・オプションの適合を確認する。**バックアップ取得の実施承認は、取得手順の確認の後。**
3. H03：公開前に実施する方針を維持。接続確認が済み、利用者が実行できるタイミングで、日時を確定する。HTTPS試験通信と、前後確認のためのDB接続を分けて手順を示す。DB接続が必要な理由と、確認する項目を明記。試験は、正しいOriginと外部Originを、各1回に限定し、認証失敗・Origin拒否・レート制限を区別する。判定不能なら、繰り返さず停止。

#### 19.46.2 接続先の確認（読取り。承認の後）

確認する項目：ホスト名に `pooler` を含む／ポート5432（Session mode。6543はTransaction mode）／ユーザー名が `postgres.<プロジェクトの識別子>` の形／読取り専用（SQLの先頭の `SET`）／**同じセッションで、`pg_backend_pid()` が、2回とも同じ**（Session modeの目安。Transaction modeでは、文ごとに変わり得る）／既知の件数との一致（同じDBであること：`AppUser` 4、`ClubMembership` 1、`Contact` 1）。

#### 19.46.3 `pg_dump` の公式手順との適合（Claudeが、公式資料の検索結果で確認。本文の全文の精読ではない）

- **公式の記述（検索結果の要約）：** SupabaseのConnect画面（接続のガイド）は、`pg_dump` を、直接接続の用途に挙げる。直接接続は、IPv6が要り、IPv4のアドオン（Pro以上）がない限り、IPv4のみのネットワークから届かない。IPv4のみのネットワークには、**Session pooler（ポート5432）が、代替**。CLIのバックアップ手順は、直接接続を先に、IPv6が使えない場合に、Session poolerを案内する。移行ガイドは、`pg_dump`・復元に、Session modeを使うと案内する。**Transaction pooler（ポート6543）は、`pg_dump` に使わない。**
- **今回の取得（§6.3）との適合：**

| 項目 | 今回の手順 | 公式との適合 |
| --- | --- | --- |
| 接続経路 | Session pooler、ポート5432、ユーザー `postgres.<識別子>` | 適合（IPv4のみの場合の代替） |
| 形式・範囲 | `--format=custom`、`--schema=public`（全体）、`auth`・`storage`（データのみ）、スキーマ定義（参照用） | 公式はCLIの `db dump`（ロール・スキーマ・データを分ける）も案内。今回は、`pg_dump` の直接実行で、同等の範囲を分けて取る。**復元は、B-2で、検証用DBへ、リハーサル済み（形式・範囲）** |
| `--no-owner` | 付ける | 復元先（検証用DB）でロールが違っても戻せるため、既存の手順どおり |
| 読取りのみ | `pg_dump` は、読取り専用のトランザクションで取得 | 適合。`PGOPTIONS` は、poolerで拒否される場合があるため、**使わない**（`pg_dump` 自体が読取り専用） |
| クライアントの版 | `pg_dump` 18.6、サーバー17.6 | 適合（クライアントの版が、サーバー以上） |

- **未確認：** ①Session pooler経由の `pg_dump` が、`auth`・`storage` スキーマを、直接接続と同じ内容で取れること（実測が必要）。②取得中のSession pooler側の接続数・タイムアウトの影響（データ量が小さいため、影響は小さいと見られる。推定）。③公式資料の本文を、全文では読んでいない（検索結果の要約）。
- **取得の実施の前に、書込みなしの確認（案）：** `pg_dump --schema-only --schema=public` を、Session poolerで実行し、終了コード0・出力の大きさだけを確認する（データを含まない。読取り。承認が要る）。
- **Storageのファイル本体（§6.4）：** DB接続とは別（HTTPSのAPI）。経路の影響を受けない。
- **B-2の再実施は不要の方針（§19.38.5）：** 接続経路が違っても、取得物の形式・範囲は同じ。ただし、取得物（`public.dump` など）の内容は、直接接続のものと、件数・スキーマで一致を確認する（`counts-before.tsv`・`schema-reference.sql` の差）。

#### 19.46.4 H03の実行手順（DB接続とHTTPS試験通信を分ける）

**DB接続（Session pooler、読取り）が必要な理由と、確認する項目：** HTTPS試験通信の前後で、**アプリのDBに、書込みが起きていない**ことを確かめる（`LoginSubmissionLog`・`FormSubmissionLog`・`AppUser`・`ClubMembership` の件数が、前後で差0）。**ただし、この差0は、「Origin拒否」の証拠にならない**（`/club-login` は、認証失敗でもDBへ書かない設計）。**拒否の判定の根拠は、応答の内容と、Supabase Authのログ（ログイン試行の件数）と、Vercelのログ。**

**HTTPS試験通信（合計2回。DB接続は不要）：** ①ブラウザー（ログアウト状態）で、実在しないメール（`h03-check@example.invalid`）・無作為のパスワードを、`/club-login` から送信（正しいOriginの1回）。②Network の POST を cURL でコピーし、Origin を外部（`attacker.invalid`）へ置換して、1回だけ再送。手順・コマンドは、§19.38.2。

**ログの確認（画面。DB接続は不要）：** Supabase Authのログ（試験の時刻の前後の、ログイン試行の件数と、HTTP 429の有無）、Vercelのログ（約1時間。Origin不一致の記録）。

**判定（追加）：** 正しいOriginの1回の後、Authのログのログイン失敗が**1件**で、外部Originの再送の後に**増えない**なら、「外部Originの要求が、アプリのログイン処理に届いていない」（Origin拒否の根拠）。**2件**なら、Origin保護が効いていない可能性（繰り返さず、報告）。429があれば、レート制限（中止）。Authのログの表示項目・件数の数え方は、実施時に画面で確認する（未確認）。

### 19.47 Session pooler の接続先の確認（読取りの結果。2026-11-24）

**承認：** 右田和也。2026-11-24 9:56。読取りのみ（§19.46.2 の4項目）。実行者：右田和也。Claudeは本番へ接続していない。

| 項目 | 期待 | 結果 |
| --- | --- | --- |
| 識別子（直接接続のホスト名から取り出し）の長さ | 20 | 20 |
| ポート | 5432 | 5432 |
| ホストに pooler を含む | はい | はい |
| ユーザーは `postgres.` で始まる | はい | はい |
| `default_transaction_read_only` | on | on |
| `pg_backend_pid()` の2回の比較 | 同じ | 同じ（Session modeの目安。値は記録しない） |
| AppUser / ClubMembership / Contact の件数 | 4 / 1 / 1 | 4 / 1 / 1 |
| 後始末（`PG*` の環境変数の数） | 0 | 0 |

**判定：** Session pooler（ポート5432）の接続先は、本番DB（同じDB）と判断する。SQLは SELECT と SHOW のみで、書込みは無い。Vercelの環境変数・アプリの接続設定・`.env.prod` は、変更していない。

**注意（追加）：** 実行中に、識別子の一致を確認する追加の `printf` が出力され、**識別子の値が、画面とチャットに出た**。識別子はホスト名の一部で、単独では認証情報ではないが、**以後の確認では、値を出さず、真偽のみで確認する**。値は、この運用書に記録しない。

**次の作業（未実施）：** `pg_dump` の書込みなし確認（スキーマのみ。別途承認）、H03（日時・承認は別）、B-1の手動バックアップ（手順確認の後）。
