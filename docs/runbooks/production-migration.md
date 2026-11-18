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
