<!-- docs/runbooks/mvp-verification.md -->

# F12 MVP検証：専用環境・受入matrix・残課題

## 1. この運用書の範囲と完了の区別

F12の粒度20（MVP検証運用書・受入matrix・残課題）を対象とする。
F12の仕様書と粒度別計画は、今後の運用に不要なため意図的に削除済みで、復元しない。
本書が現行の検証・受入・残課題の資料であり、F12の検証結果・証跡・制限は本書に保持する。
実装の基準は粒度19完了コミット `22e8f4c417c286bb96ccad68252fa1f6a55b6bb1`。
本書の作成では実DB・Auth・Storage・メール・LINEを操作せず、実行結果を作り直していない。

| 判定 | 根拠 | この文書での扱い |
| --- | --- | --- |
| patchの適用確認 | `git apply --check`、対象ファイル、差分・参照の静的照合 | 文書を適用できることの確認 |
| ローカル自動受入 | 専用環境の `verify:mvp` 全11段階、必須suite・群・件数・回収 | 粒度19の合格記録を下記に継承 |
| MVP全受入・本番公開 | 未確認の実機操作、実サービス、本番初期化・smoke、残課題の判断 | このpatchだけでは完了としない |

2026-11-09に利用者から `F12_MVP_PASSED 11`、終了コード0の報告があり、
基準コミットの本文にもfixture・build・server回収と通常Supabase復帰が記録されている。
これは粒度19での実行記録であり、粒度20で再実行したという意味ではない。
個別ケースの生JSON・Cookie・署名URLを証跡としてリポジトリへ追加しない。

通常の `npm test` は実DB群をskipしても成功する。
`.integration.test.ts` 内にmock群と実DB群が混在する例もあるため、
ファイル名・総成功件数・guard単体の成功だけで実DB合格にしない。

## 2. 実在する入口と合格条件

[package.json]の3コマンドを使う。`verify:local` は通常開発用の別入口である。
F12の受入コマンドへ `dotenv -e .env.local` を付けない。

| コマンド | 環境・前提 | 成功時の表示 | 終了 |
| --- | --- | --- | --- |
| `npm run test:integration` | HTTP `http://localhost:3000`、専用DBへ既存migration適用済み、Auth・Storage起動済み | `F12 integration: 22 suites, N passed` | 成功0、失敗nonzero |
| `npm run test:e2e` | `RUN_MVP_E2E=1`、HTTPS `https://localhost:3443`、DB適用済み、Chromium導入済み | `F12_E2E_PASSED N` | 成功0、失敗nonzero |
| `npm run verify:mvp` | E2Eと同じ明示環境、別DB作成・回収権限も必要 | `F12_MVP_PASSED 11` | 成功0、失敗nonzero |

`N`は実行時の件数であり固定の合格件数ではない。
[manifest]が要求する統合22ファイル、先行migration1ファイル、E2E12ファイルと必須群を照合する。
旧 `MVP_SUITES` 15本だけで統合全体の完了を判定しない。
case0、必須ファイル／群欠落、失敗、skip、pending、合計不一致、期限超過、signal、回収失敗は合格にしない。
CLIが捕捉した失敗は終了コード1。強制終了などではOS由来のnonzeroになる場合もある。

各段階の `F12_MVP_STAGE ... START/PASSED/FAILED` と
`F12_MVP_SUITE ... passed=... natural=... injected=...` を記録する。
末尾の成功は回収完了後に出る。途中の `PASSED` だけで全体成功と扱わない。

### 2.1 必須統合suiteの一覧

以下は実装基準時点の `MVP_INTEGRATION_SUITES`。flagはrunnerが付与する。
DB／Auth列はmanifestの要求であり、ケース数の全てが実DB／Authという意味ではない。

| ファイル | 必須境界 | 必須群の完全名 |
| --- | --- | --- |
| [tests/club-id-integrity.integration.test.ts](../../tests/club-id-integrity.integration.test.ts) | DB | `clubId整合性` |
| [tests/storage-deletion-jobs.integration.test.ts](../../tests/storage-deletion-jobs.integration.test.ts) | DB | `StorageDeletionJob` |
| [tests/club-line-setting.integration.test.ts](../../tests/club-line-setting.integration.test.ts) | DB | `ClubLineSetting Repository` |
| [tests/club-membership-repository.integration.test.ts](../../tests/club-membership-repository.integration.test.ts) | DB | `ClubMembership Repository` |
| [tests/club-invitation-schema.integration.test.ts](../../tests/club-invitation-schema.integration.test.ts) | DB | `ClubInvitation DB制約` |
| [tests/club-invitation-repository.integration.test.ts](../../tests/club-invitation-repository.integration.test.ts) | DB | `ClubInvitation Repository` |
| [tests/club-invitation-acceptance-repository.integration.test.ts](../../tests/club-invitation-acceptance-repository.integration.test.ts) | DB | `招待受取人の読取Repository（ローカルDB）` |
| [tests/club-invitation-recovery.integration.test.ts](../../tests/club-invitation-recovery.integration.test.ts) | DB | `復旧CLIと実RepositoryのDB統合` |
| [tests/club-invitation-auth.local.integration.test.ts](../../tests/club-invitation-auth.local.integration.test.ts) | Auth | `ローカルSupabaseの招待Auth契約` |
| [tests/club-invitation-acceptance.flow.integration.test.ts](../../tests/club-invitation-acceptance.flow.integration.test.ts) | DB・Auth | `F06実DB・実Auth（3つの実行flagがない通常実行ではskip）` |
| [tests/club-account.flow.integration.test.ts](../../tests/club-account.flow.integration.test.ts) | DB | `F07 Action・Service・Repositoryと実DB` |
| [tests/support-report.flow.integration.test.ts](../../tests/support-report.flow.integration.test.ts) | DB | `F08実DBフロー（専用flag未指定時はskip）` |
| [tests/platform-support.flow.integration.test.ts](../../tests/platform-support.flow.integration.test.ts) | DB | `F09実DB統合（専用flag未指定時はskip）` |
| [tests/event-month-copy.flow.integration.test.ts](../../tests/event-month-copy.flow.integration.test.ts) | DB | `F10専用使い捨てDB統合（flag未指定はskip）` |
| [tests/event-practice-batch.flow.integration.test.ts](../../tests/event-practice-batch.flow.integration.test.ts) | DB | `F11専用使い捨てDB統合（flag未指定はskip）` |
| [tests/mvp/database-fixture.integration.test.ts](../../tests/mvp/database-fixture.integration.test.ts) | DB | `F12 DB fixture統合（専用flag未指定時はskip）` |
| [tests/mvp/local-services-fixture.integration.test.ts](../../tests/mvp/local-services-fixture.integration.test.ts) | DB・Auth | `F12ローカルAuth・Storage・DB統合（専用flag未指定時はskip）` |
| [tests/mvp/content-tenancy.integration.test.ts](../../tests/mvp/content-tenancy.integration.test.ts) | DB | `F12 content Repositoryの実DB越境（専用flag未指定時はskip）` |
| [tests/mvp/attachment-storage.integration.test.ts](../../tests/mvp/attachment-storage.integration.test.ts) | DB・Auth | `F12 添付の実Storage・DB・途中失敗（専用flag未指定時はskip）` |
| [tests/mvp/line-webhook-tenancy.integration.test.ts](../../tests/mvp/line-webhook-tenancy.integration.test.ts) | DB | `F12 LINE設定・Webhookの実DBクラブ束縛（専用flag未指定時はskip）` |
| [tests/mvp/line-delivery.integration.test.ts](../../tests/mvp/line-delivery.integration.test.ts) | DB | `F12 LINE workerの実DB並列・障害（専用flag未指定時はskip）` |
| [tests/mvp/mail-failures.integration.test.ts](../../tests/mvp/mail-failures.integration.test.ts) | DB・Auth | `F12 Resend障害と実DB・ローカルAuth（専用flag未指定時はskip）` |

別段階のmigrationは[migrations]、必須E2E12ファイルは[manifest]の `MVP_E2E_SUITES` に従う。

## 3. 専用環境の契約

- macOS・zsh・ローカルDockerを基準にする。他OSやCIへの移植は別途確認する。
- 本番／通常のDB・Auth・Storage・メール宛先を使わない。架空の検証データだけを作る。
- `.env`、`.env.local`、`.env.test*`、`.env.production*`などを専用コピーへ入れない。
  guardはファイル名だけを検査する。`.env.example`はguard上許可されるが、以下のコピーでは省く。
- 初期 `NODE_ENV` は `test`。productionのHTTPS・必須設定検証はrunner内部で維持する。
- `RUN_MVP_TESTS=1`、`MVP_TEST_DISPOSABLE=1`を厳密な文字列で指定する。
  E2E／全体実行では `RUN_MVP_E2E=1`。統合単独ではこの変数を設定しない。`0`も指定しない。
- DBはloopbackの54322・`postgres`、Supabase APIはHTTP loopbackの54321。
  DB URLのquery、別DB、別port、曖昧なhost表記、`PG*`等による上書きを認めない。
- 統合のAPP originは `http://localhost:3000`、E2Eは厳密に `https://localhost:3443`。
  NextRequestが127.0.0.1をlocalhostへ正規化するため、Origin headerもlocalhostへ揃える。
- 元プロジェクトの`.next`・認証状態・診断用spec・`test-results`をコピーしない。
  専用コピーで事前に `npm run build` を実行しない。既存`.next`は開始時に拒否される。
- `node_modules`全体を元プロジェクトへのsymlinkにしない。Client生成先も専用コピーにする。
- `NODE_OPTIONS`、`NODE_PATH`、`DOTENV_*`、`PG*`、本番配送／ログ設定を引き継がない。
  以下では `env -i` から必要な値だけを渡す。

### 3.1 依存とPlaywrightの承認範囲

`@playwright/test` は粒度11で例外承認され、現在は `1.64.1` に固定されている。
本手順でパッケージ追加・更新はしない。既存lockfileと導入済み依存を使う。
不足や不一致があれば、勝手に `npm install`・更新で埋めず、環境整備として扱う。
Chromium本体の取得は準備作業であり、業務通信を遮断するE2E実行とは分ける。

元プロジェクトのSupabase CLI指定は `^2.101.0`。
粒度19の専用コピーにはCLI `3.0.0`、`allowScripts`、lockfileの差が観測されたが、元へ取り込んでいない。
合格記録に実際のCLI版を残し、異なる版での結果を同一環境と呼ばない。
本書の新規セットアップを元のCLI条件で通し実行することは、粒度20では未実施である。

## 4. 新しい専用コピーを用意する

各ブロックで失敗したら次へ進まない。同じzshで続ける。
元プロジェクトのルートで開始し、ソースの変更状態とコミットを記録する。
未コミットの実装変更がある場合は、検証対象を確定してからコピーする。

```bash
F12_SOURCE="$PWD"
F12_ROOT="$(mktemp -d /private/tmp/f12-mvp.XXXXXX)"
F12_CHECKOUT="$F12_ROOT/checkout"
F12_SUPABASE="$F12_ROOT/local-supabase"
F12_PROJECT_ID="f12-mvp-$(openssl rand -hex 6)"
F12_NORMAL_PROJECT_ID="arao-u12-hp"

mkdir -p "$F12_CHECKOUT" "$F12_SUPABASE/supabase"
git rev-parse HEAD > "$F12_ROOT/source-revision.txt"
git status --short > "$F12_ROOT/source-status-before.txt"
```

`F12_NORMAL_PROJECT_ID`は元の `supabase/config.toml` のproject_idと照合する。
通常projectと新規専用projectのIDを混同しない。
次は追跡ファイルの現在内容だけをコピーし、環境ファイルを内容ごと読まない。
未追跡の実装はコピー対象外なので、未コミットの新規実装を試す用途にこの手順を流用しない。

```bash
python3 - "$F12_SOURCE" "$F12_CHECKOUT" <<'PY'
from pathlib import Path
import shutil
import subprocess
import sys

source = Path(sys.argv[1])  # 元プロジェクトのパスを扱う
checkout = Path(sys.argv[2])  # 専用コピーのパスを扱う
names = subprocess.check_output(  # Gitの追跡ファイル名だけを取得する
    ["git", "ls-files", "-z"],
    cwd=source,
).decode().split("\0")  # NUL区切りの一覧を文字列へ戻す

for name in filter(None, names):  # 空項目を除き追跡ファイルだけを処理する
    relative = Path(name)  # 相対パスを扱う
    if name == "feature.patch":
        continue
    if any(part.startswith(".env") for part in relative.parts):  # 環境ファイル名を除く
        continue
    original = source / relative
    if original.is_symlink():  # checkout外の参照をコピーしない
        raise SystemExit("追跡symlinkは個別確認してください")
    target = checkout / relative
    target.parent.mkdir(parents=True, exist_ok=True)  # コピー先の親を用意する
    shutil.copy2(original, target)  # 現在の内容と実行属性をコピーする
PY

rsync -a \
  --exclude='.cache/' \
  --exclude='.vite/' \
  "$F12_SOURCE/node_modules/" \
  "$F12_CHECKOUT/node_modules/"

cd "$F12_CHECKOUT"
node --version
npm ls --depth=0
```

依存の診断結果はバージョン確認に使い、エラーを自動修復しない。
ブラウザーをデフォルトの保存先へ準備する。独自 `PLAYWRIGHT_BROWSERS_PATH` は使わない。

```bash
env -i \
  PATH="$PATH" \
  HOME="$HOME" \
  ./node_modules/.bin/playwright install chromium

npm run test:e2e:list
```

`test:e2e:list`は接続しない一覧確認であり、受入合格ではない。
実E2Eは必ず専用runnerから起動する。`playwright test`の直接実行や既存serverの再利用はしない。

## 5. 使い捨てローカルSupabaseを起動する

[supabase/config.toml]は通常projectとLAN用Auth設定を持つため、そのまま使わない。
以下のTOMLはファイルへ書き込むブロックであり、`[auth]`等を単独でシェルへ貼り付けない。
`db.password`は設定しない。存在しないseedや独自メールtemplateを参照しない。

```bash
cat > "$F12_SUPABASE/supabase/config.toml" <<TOML
project_id = "$F12_PROJECT_ID"

[api]
enabled = true
port = 54321

[db]
port = 54322
shadow_port = 54320
major_version = 17

[db.seed]
enabled = false

[studio]
enabled = false

[inbucket]
enabled = true
port = 54324

[storage]
enabled = true
file_size_limit = "50MiB"

[auth]
enabled = true
site_url = "https://localhost:3443"
additional_redirect_urls = [
  "http://localhost:3000/**",
  "http://127.0.0.1:3000/**",
  "https://localhost:3443/**",
  "https://127.0.0.1:3443/**"
]

[auth.rate_limit]
email_sent = 1000
token_refresh = 1000
sign_in_sign_ups = 1000
token_verifications = 1000
TOML

# 専用workdirだけを扱う。環境変数ファイルは読み込まない。
f12_supabase() {
  env -i \
    PATH="$PATH" \
    HOME="$HOME" \
    SUPABASE_EXPERIMENTAL_STACK=0 \
    "$F12_CHECKOUT/node_modules/.bin/supabase" \
    --workdir "$F12_SUPABASE" \
    "$@"
}

f12_supabase --version
```

Authの高いrate limitとHTTP許可はこの使い捨て設定だけに置く。
HTTPは既存Auth／DB統合、HTTPSはproduction E2Eに必要で、片方だけでは両方を検証できない。
設定変更後はCLIの案内に従って専用projectを再起動し、実際に反映された設定で実行する。

Docker Desktopを起動する。54321・54322を通常Supabaseが使っている場合は、
次で通常projectを停止する。通常projectには `--no-backup` を付けない。
他のprocessが使っている場合は所有者を確認し、port変更や強制終了でguardを回避しない。

```bash
env -i \
  PATH="$PATH" \
  HOME="$HOME" \
  SUPABASE_EXPERIMENTAL_STACK=0 \
  "$F12_SOURCE/node_modules/.bin/supabase" \
  --workdir "$F12_SOURCE" \
  stop --project-id "$F12_NORMAL_PROJECT_ID"
```

通常projectが元から停止していた場合は上の停止を省く。専用projectは次で起動する。

```bash
# 起動時に表示され得るキーをログへ転送しない。
f12_supabase start >/dev/null 2>&1
F12_START_EXIT=$?
printf '専用Supabase起動終了コード: %s\n' "$F12_START_EXIT"
```

0の場合だけ続行する。`db start`だけではAuth・Storageの準備にならない。
失敗した場合はproject ID・CLI版・終了コードを記録し、生の設定・キーを共有しない。

## 6. 接続情報をメモリ内だけで渡す

専用workdirのstatusを取得する。JSONを表示・ファイル保存・`eval`しない。
必要なキーがない場合、別projectのキーや本番キーで補わない。

```bash
set +x
unset F12_DB_URL F12_API_URL F12_ANON_KEY F12_SERVICE_ROLE_KEY
F12_STATUS_JSON="$(f12_supabase status -o json 2>/dev/null)"

# 値はコマンド置換の中でだけ受け取り、画面やファイルへ出さない。
f12_status_value() {
  printf '%s' "$F12_STATUS_JSON" |
    node -e '
      const fs = require("node:fs"); // 標準のファイル読取機能を取得する
      try {
        const value = JSON.parse(fs.readFileSync(0, "utf8"))[process.argv[1]]; // stdinのJSONから指定値だけを取り出す
        if (typeof value !== "string" || !value) throw new Error(); // 不足値を拒否する
        process.stdout.write(value); // 呼出し元のコマンド置換へだけ値を返す
      } catch {
        console.error("F12_STATUS_VALUE_FAILED"); // 秘密を含めない固定失敗を出す
        process.exitCode = 1;
      }
    ' "$1"
}

F12_API_URL="$(f12_status_value API_URL)" &&
F12_DB_URL="$(f12_status_value DB_URL)" &&
F12_ANON_KEY="$(f12_status_value ANON_KEY)" &&
F12_SERVICE_ROLE_KEY="$(f12_status_value SERVICE_ROLE_KEY)" &&
printf 'F12設定取得OK\n'

unset F12_STATUS_JSON

# HTTPのDB／Auth統合用。RUN_MVP_E2Eは未設定のままにする。
f12_test_env() {
  env -i \
    PATH="$PATH" \
    HOME="$HOME" \
    NODE_ENV=test \
    TZ=UTC \
    RUN_MVP_TESTS=1 \
    MVP_TEST_DISPOSABLE=1 \
    DATABASE_URL="$F12_DB_URL" \
    NEXT_PUBLIC_SUPABASE_URL="$F12_API_URL" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="$F12_ANON_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="$F12_SERVICE_ROLE_KEY" \
    APP_BASE_URL=http://localhost:3000 \
    "$@"
}

# 共通の許可設定に、E2E専用flagとHTTPS originだけを重ねる。
f12_e2e_env() {
  f12_test_env env \
    RUN_MVP_E2E=1 \
    APP_BASE_URL=https://localhost:3443 \
    "$@"
}

cd "$F12_CHECKOUT"
f12_e2e_env node --import tsx --input-type=module <<'JS'
import { requireMvpTestEnvironment } from "./tests/mvp/environment.ts"; // 接続前guardを読み込む
requireMvpTestEnvironment(process.env, process.cwd(), "a".repeat(32)); // 明示設定とcheckoutだけを検証する
console.log("F12_PREFLIGHT_OK"); // 返却された秘密を表示せず成功だけを出す
JS

test ! -e "$F12_CHECKOUT/.next"
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3443 -sTCP:LISTEN
```

`F12設定取得OK`、`F12_PREFLIGHT_OK`と既存build不在を確認する。
`lsof`は何も表示されず終了1なら待受なし。待受がある場合、所有を確認してから進める。
preflightはDBへ接続しない。起動・migrationの所有確認を代替するものではない。

## 7. 実行順と単独実行

### 7.1 全体実行

```bash
f12_e2e_env npm run verify:mvp
F12_MVP_EXIT=$?
printf '終了コード: %s\n' "$F12_MVP_EXIT"
```

[verify-runner]の `MVP_VERIFY_STAGES` が以下の順序を固定する。

| 段階 | 実装・返却 | DB・資源への作用 |
| --- | --- | --- |
| ENV | `runMvpVerification` → [guard]の `requireMvpTestEnvironment`、既存 `scripts/validate-env.mjs` | URL評価／SDKより前のguard。本番条件は架空の配送・暗号・Cron設定で検証 |
| PRISMA_VALIDATE | `executeStage` → Prisma validate | schema検証 |
| PRISMA_GENERATE | `executeStage` → Prisma generate | 専用コピーのClient生成。型チェックより先 |
| MIGRATION | [migrations] → [migration-DB]の計画・作成・deploy・cleanup | runIdに束縛した別DBで空DB／旧データupgradeを検証し、所有DBだけ回収 |
| DEPLOY | `executeStage` → Prisma migrate deploy | fixture用の専用postgresへ既存履歴を適用。新migration作成・resetはしない |
| LINT | 既存lint script | 静的検査 |
| TYPECHECK | 既存typecheck script | 型検査 |
| UNIT | `vitest.mvp-unit.config.mts`、`collectMvpVitestResults` | 実DB flag・接続情報を渡さずJSONをメモリ集計。integrationファイルは除外 |
| INTEGRATION | [integration-runner]の `runIntegration` | 全22suiteと必須DB／Auth群、自然競合／注入を照合。試験ごとの所有fixtureを作成・回収 |
| E2E | [e2e-runner]の `runMvpE2e` | 事前production build、Auth／DB／PDF seed、HTTPSとNext、Chromium、回収 |
| BUILD | `finalBuild` | 最後にもproduction build。所有した.next・stub・記録・一時領域を回収 |

MIGRATIONの空／upgrade試験と、通常fixture用postgresへのDEPLOYは別の作業である。
E2E内部の事前buildと最後のbuildを両方行う。
高速化のために片方を削ったり、HTTPS／認可条件を緩めたりしない。
`F12_MVP_PASSED 11`と終了0を両方確認する。

### 7.2 integration／E2Eだけを実行する場合

単独入口はmigrationやSupabase起動を行わない。
同じ専用DBでDEPLOYまで成功済みなら、その状態を使う。
`npm ci` で作ったコピーでは、`test:integration` の前に Prisma Client を生成する必要がある
（`verify:mvp` のPRISMA_GENERATE段階と同じ `node node_modules/prisma/build/index.js generate --config ./prisma.config.ts`）。
生成しないとDB suiteの準備で止まり、runnerは固定メッセージだけを返す（F13粒度3の検証で確認）。
元の `node_modules` を複製したコピーは、生成済みである。
新しい専用DBへ単独実行する場合だけ、上記guard成功と所有確認の後に以下を行う。

```bash
# 専用postgresへ既存履歴だけを適用する。通常DBへは実行しない。
f12_test_env ./node_modules/.bin/prisma migrate deploy \
  --config ./prisma.config.ts >/dev/null 2>&1
F12_DEPLOY_EXIT=$?
printf '専用DB deploy終了コード: %s\n' "$F12_DEPLOY_EXIT"
```

終了0を確認してから、必要な入口を一つ選ぶ。

```bash
f12_test_env npm run test:integration
F12_INTEGRATION_EXIT=$?
printf '統合終了コード: %s\n' "$F12_INTEGRATION_EXIT"
```

```bash
f12_e2e_env npm run test:e2e
F12_E2E_EXIT=$?
printf 'E2E終了コード: %s\n' "$F12_E2E_EXIT"
```

単独2入口の成功だけでは、先行migration・unit・最後のbuildを含む全体成功にならない。
`prisma migrate status`の終了1を、常に未適用という意味で扱わない。接続・権限障害も区別する。
`migrate dev`、`migrate reset`、本番seed、一般的なDB全削除はこの手順に含めない。

## 8. seed・通信・回収の境界

[db-fixture]の `planMvpDatabaseFixture` は接続前にIDと保存行を計画し、
`seedMvpDatabaseFixture` が一体保存、`cleanupMvpDatabaseFixture` が所有台帳の範囲だけを削除する。
AのOWNER／COACH／OFFICER／MEMBER、BのOWNER／MEMBER、独立PlatformAdminを用意する。
B MEMBERはA OWNERと同じ本人であり、複数所属の検証になる。既存の本番本人をupsertしない。

[local-services]の `planMvpLocalServicesFixture` → `seedMvpLocalServicesFixture` は
Auth、DB、private PDFを準備する。実行ごとのpassword・Cookie・鍵はメモリと所有一時領域だけに保持する。
E2EはUI → 実Action／Route → Service → Repository → 専用DBを通す。
実Auth・Storage SDKはローカルAPIへ、Resend・LINEの受付は実行所有のstubへ接続する。
受付成功を、受信者への配送完了や実LINE／Resend疎通と読み替えない。

| 境界 | 実装・保証 |
| --- | --- |
| server側・worker thread | [preload]と `createMvpWorkerPreload`。未知の外向き通信を拒否し同期違反記録も照合 |
| browser側 | [Playwright設定]の所有proxy、service worker禁止、Chromium一系統 |
| HTTPS | `createMvpCertificate`・`startMvpTls`。当該runの証明書とpinで3443から内部Nextへ中継。OSのCA storeは変更しない |
| 生出力・故障応答 | [observability]のsentinel照合、[secret-e2e]のDTO／HTML／許可DB列／stdout／stderr検証 |
| 認証状態 | trace・video・screenshot・認証状態ファイルの永続化を無効化。Playwright Node／ChromiumへService Roleを渡さない |

Service Roleは親runner・専用Next・実Auth／Storage統合試験Nodeで必要になる。
架空LINE暗号鍵など、runnerがその実行用に生成した値と本番資格情報を混同しない。
integrationは各suiteのローカル限定guard・SDK境界stubを使う。
E2Eのpreload／proxyによる遮断を、全integrationやOS全体のfirewall保証として説明しない。
Docker image・Chromiumの事前取得は準備通信であり、実サービスへの業務送信とは別である。

integrationの集計JSONは、既存runnerが所有一時領域にだけ作成し、finallyで削除する。
E2Eと全体入口のunit／migration結果はメモリ内で集計する。生reportを元ソースへ持ち帰らない。

正常終了でも次の回収条件を記録する。

- `runMvpE2e`は所有する子process群、TLS、stubを停止し、
  `cleanupMvpLocalServicesFixture`、DB切断、所有.next／一時領域の削除を行う。
- local fixtureは所有prefix内の追加PDFを発見し、登録物・DB・所有確認できたAuth・新規の空bucketを補償する。
  共有／既存bucketや所有が不明な資源は消さない。
- cleanup reportの `remaining.authUsers`、`storageObjects`、`buckets`、`database`に残存・未確認があれば失敗。
  列挙不能も回収済みと扱わない。報告はrunIdと件数に限定する。
- migrationは管理台帳とDB側の所有記録を照合する。任意名のDBをDROPしない。
- 既存F06 flowはAuthユーザーをsuite後に残し、使い捨て環境の処分で扱う設計である。
  全体成功とSupabase projectの処分は別の完了作業として記録する。

## 9. 失敗・中断時の扱い

| 停止位置 | 確認すること | 避ける操作 |
| --- | --- | --- |
| 段階表示前 | flag、.env系ファイル名、既存.next、キーの有無、依存root、manifest実在 | .env内容・URL・キーをログへ出す／guardを削る |
| ENV／Prisma | 明示したtest環境、production用架空設定、schema／Client生成の順序 | 本番NODE_ENVを入口へ渡す／依存を自動更新する |
| MIGRATION／DEPLOY | 専用project、固定port、DB作成権限、所有台帳、履歴 | status=1を無条件許可／通常postgresをresetする |
| UNIT | unit専用分類、guard／集計試験、case0・skip・合計 | 通常npm testのskip込み成功で置き換える |
| INTEGRATION | 失敗した必須ファイル・DB群、実失敗と集計失敗の区別 | 全体を成功するまで繰り返す／自然競合を障害注入で代替する |
| E2E | browser導入、3000／3443、HTTPS入口、AuthのHTTP／HTTPS allowlist、外向き違反件数 | 既存server再利用／ignoreHTTPSErrorsで全面回避／生report公開 |
| 最後のBUILD | E2E後にもbuildしたか、所有.nextと通信違反、回収 | E2Eの事前build成功だけで完了する |
| signal／timeout／cleanup | 子の終了、所有資源、残存・未確認件数 | SIGKILL後の回収を推測／全volume・Auth・bucketの一括削除 |

失敗後は、固定した段階名、終了コード、manifest内のファイル名、成功／失敗／skip件数だけを共有する。
Cookie、token、署名URL、LINE資格情報、個人情報、SQL／SDK原文、JSON／HTMLの生保存は避ける。
固定失敗だけで個別suiteを特定できない場合は、原文を公開しない診断を別途準備する。
本番ソースへ診断printを入れず、診断ファイルはcommitしない。

`Ctrl-C`は失敗として扱い、所有子とfixtureの回収完了を確認する。
強制終了で台帳を失った場合、同じrunの所有が確認できる範囲だけを調べ、
不明なものは「残存・未確認、削除保留」と記録する。試験を再開して未回収を隠さない。
使い捨てproject自体の所有を確認できれば、そのprojectの停止・処分へ進む。
通常DB、通常Auth、共有Storageを復旧用の代替fixtureにしない。

## 10. 受入matrix

状態の **R19** は、上記基準コミットと利用者の全11段階成功報告に結び付く自動suiteの根拠を示す。
この文書で個々のテストを再実行した印ではない。
**静的** はコード対応のみ、**未確認** は実行記録または対象の実装が確認できない範囲を示す。

### 10.1 F12の実装範囲・受入条件

| F12項目 | 実装・unit等 | 実DB／実ブラウザーの根拠 | 状態・限界 |
| --- | --- | --- | --- |
| 範囲1 DB基盤 | [guard]、[db-fixture]、[integration-runner] | [db-fixture-DB]、[local-services-DB]、必須DB群 | R19。guard単体成功だけでDB合格にしない |
| 範囲2 E2E基盤 | [Playwright設定]、[e2e-runner]、[harness-unit] | [smoke-E2E]、必須12ファイル | R19。Chromiumのみ |
| 範囲3 テナント・role・複数所属・Platform seed | [db-fixture]、[local-services] | [auth-E2E]、[support-E2E] | R19。B MEMBERはA OWNERと同一人物 |
| 範囲4 外部境界 | [preload]、[observability]、[harness-unit] | [attachment-DB]、[line-worker-DB]、[mail-DB]、[secret-E2E] | R19。LINE／Resendの本番配送は対象外 |
| 範囲5 空DB migration | [migration-DB]、[migrations] | 予約した別DBで既存全履歴をdeploy | R19。通常postgresのresetではない |
| 範囲6 旧データupgrade | [migration-DB]、[migrations] | 旧履歴prefix・fixtureから残りを適用し履歴／checksum／データ保持を照合 | R19。本番データのコピーではない |
| 範囲7 越境10種 | 次のID表 | [content-DB]、[line-binding-DB]、[direct-action]等 | R19。エラー応答と対象外DB非更新を併せて確認 |
| 範囲8 role越権 | [role-unit]、[plan-unit] | [auth-E2E]、[members-E2E]、[line-E2E]、[support-E2E] | R19。最新DBによるCookie再認可を含む |
| 範囲9 最後のOWNER | [membership-DB] | 最後のACTIVE OWNER拒否・2 OWNER並列降格、[members-E2E] | R19 |
| 範囲9 招待二重承諾 | [invitation-DB] | 同一招待2並行、取消・再送・期限処理との競合、[members-E2E] | R19 |
| 範囲9 LINE並列 | [line-worker-DB] | 同deliveryIdの自然並列2 workerで受付stub1回 | R19。期限切れ再claim上限は残課題 |
| 範囲9 Storage lease復旧 | [storage-job-DB] | 並列claim1件、期限切れPROCESSING再取得、失敗後COMPLETED | R19。ここでのStorage SDKはmock |
| 範囲10 外部障害とDB | [mail-DB]、[attachment-DB]、[line-worker-DB] | [events-E2E]、[notices-E2E]、[secret-E2E] | R19。補償・rollback・FAILED状態を区別 |
| 範囲11 3つのscript | [package.json]、[manifest] | 第2節の3入口と正／異常終了の集計 | R19 |
| 範囲12 実行順 | [verify-runner]、[verify-unit] | 全11段階と二度のproduction build | R19。粒度20の再実行なし |
| 受入：重要条件の自動化 | 本表のsuiteとmanifest | 必須DB群とE2Eファイルを集計で強制 | R19。手動残件を無言で合格にしない |
| 受入：A→B主要ID拒否 | 次のID表 | DBと実Cookieによる直接Action／Route | R19 |
| 受入：MEMBER管理Action拒否 | [direct-action]、[members-E2E]、[line-E2E] | 正規OWNERの要求をMEMBER Cookieで再送して非更新を確認 | R19 |
| 受入：STARTER拒否・STANDARD許可・PRO保留 | [plan-unit]、[auth-E2E] | Page／直接URL、既存Cookie後のプラン変更 | R19。PROを利用可能にしない |
| 受入：全チェックとproduction build | [verify-runner] | `F12_MVP_PASSED 11`・終了0・回収記録 | R19。本番公開可否とは分ける |

### 10.2 10種の越境ID

| ID／値 | 入替・期待結果 | 根拠 |
| --- | --- | --- |
| clubSlug | 実在B・未知slugでA権限を使えない | [auth-E2E]、[content-DB]、[members-E2E] |
| eventId | B／非公開／対象外イベントの読取・更新・削除を拒否 | [content-DB]、[events-E2E]、[direct-action] |
| noticeId | B／非公開／対象外お知らせの読取・更新・削除を拒否 | [content-DB]、[notices-E2E]、[direct-action] |
| attachmentId | B・DRAFT・対象外添付へ署名を発行しない | [attachment-DB]、[events-E2E]、[notices-E2E] |
| membershipId | B所属や別本人の所属更新を拒否 | [membership-DB]、[members-E2E]、[direct-action] |
| childId | 他保護者の子を更新せず、本人の正規操作は成功 | [account-E2E]、[direct-action] |
| targetId | BのLINE宛先をA OWNER／B MEMBERのCookieで更新しない | [line-binding-DB]、[line-E2E]、[direct-action] |
| invitation token | B slug、旧token、他人Cookieとの組合せで承諾しない | [invitation-DB]、[members-E2E]、[direct-action] |
| webhookKey | A/Bのkey・署名・destination・登録tokenを混ぜても対象を作らない | [line-binding-DB]、[line-E2E] |
| hidden clubId | hidden値・bind値・request本文を改変しても認可contextのクラブ外へ書かない | [account-E2E]、[events-E2E]、[notices-E2E]、[direct-action] |

### 10.3 role・plan・本人の状態

| 条件 | 期待する境界 | 根拠 |
| --- | --- | --- |
| A OWNER／COACH／OFFICER | 会員導線と対応するcontent管理を許可。OWNER専用管理と分ける | [auth-E2E]、[members-E2E]、[line-E2E] |
| A MEMBER | 対象の公開contentと本人／子ども操作。管理画面・管理Actionを拒否 | [auth-E2E]、[account-E2E]、[direct-action] |
| B OWNER／A OWNER兼B MEMBER | B自身のroleで判定し、AのOWNER権限をBへ持ち込まない | [auth-E2E]、[line-E2E] |
| INVITED／SUSPENDED／WITHDRAWN | 認証できてもクラブ利用は不可。古いCookieでも最新所属を再確認 | [auth-E2E] |
| STANDARD→STARTER／PRO | 既存Cookieがあっても最新プランで利用拒否 | [plan-unit]、[auth-E2E] |
| 独立Platform DEVELOPER／SUPPORT | 正規Platform入口から報告を確認。所属のないクラブ管理は不可 | [auth-E2E]、[support-E2E]、[line-E2E] |
| 一般OWNER／MEMBER | Platform内部メモ更新を拒否 | [support-E2E]、[auth-E2E] |
| 最後のACTIVE OWNER | 降格・停止・退会と並列操作でもOWNERを0人にしない | [membership-DB]、[members-E2E] |

### 10.4 自然競合・注入・機密非出力

| 種類 | 根拠と確認範囲 | 記録 |
| --- | --- | --- |
| F10自然競合 | [F10-DB]の同requestId・異requestIdの実並列 | `natural=2` |
| F10障害注入 | 同ファイルのP2034後rollback／有限再試行／上限 | `injected=2` |
| F11自然競合 | [F11-DB]の同操作ID・異操作IDの実並列 | `natural=2`。異IDはCREATEDとPREVIEW_CHANGED |
| F11障害注入 | 同ファイルの注入P2034正常復帰／上限 | `injected=2` |
| LINE自然競合 | [line-worker-DB]の同deliveryIdへの2 worker | `natural=1` |
| LINE障害注入 | rejected／network／timeoutの正規化と終端状態 | `injected=3`。実通信timeout実装とは別 |
| 二重承諾・OWNER・Storage claim | [invitation-DB]、[membership-DB]、[storage-job-DB] | 上記natural件数に合算しない。別ケースの根拠を残す |
| HTTP改変 | [direct-action]で正規要求のID・Cookie・Originを置換 | 応答コードだけでなくDB／Storage／受付非更新を確認 |
| 秘密sentinel | [secret-E2E]、[observability]、[observability-unit] | DTO・HTML・許可DB列・stdout／stderrへ原文を出さない |

自然競合のケース名と必須DB群の一致は `MVP_CONCURRENCY_CASES` で強制される。
注入試験が通っても自然競合の成功へ代用しない。
F11のadapter `40001`は基準コミットで既存の有限再試行へ接続済み。
[F11-repository]の `isRetryableBatchConflict` と[F11-unit]の再認可・上限・対象外例外を根拠にする。

### 10.5 既存F10／F11運用書との対応

[F10-runbook]・[F11-runbook]の手動表は、作成当時の未確認欄を一括更新しない。
以下はF12で追加された自動確認の代表的対応で、全条件・全端末の手動受入完了を意味しない。

| 手動表の観点 | F12で追跡できる自動根拠 | 残る確認 |
| --- | --- | --- |
| M01／M02 ロール・入口 | [auth-E2E]、各[F10-E2E]／[F11-E2E]、既存role unit | 機能別の全role・端末組合せを一括完了にしない |
| 月初末・閏日・DST・既存一致 | [F10-DB]、[F11-DB]、[F10-E2E]、[F11-E2E] | 各手動表の全入力組合せは個別に記録 |
| M10上限（F11）／M03上限（F10） | F11の31件・32件、F10の100件・101件をDBで照合 | DB上限確認を全件数の実ブラウザー操作と混同しない |
| M11／M12 二重送信・応答喪失 | 両E2Eの連打・同payload／requestId再送、両DBの実並列 | payloadを失った後の運用照会は既存運用書に従う |
| M13保存後の再検証失敗 | 両E2EのneedsReloadと保存ボタン非表示 | 本番障害の再現は別環境・別承認 |
| H01／H02 直接POST・改変 | 各E2Eの実Action再送、[direct-action]の共通境界 | 個別機能・経路の対応を記録し、共通試験で全件を代用しない |
| H03外部Origin・Proxy | 共通content ActionのOrigin試験 | F10／F11個別経路・本番Proxy条件の実確認は未確認 |
| M15操作・読み上げ | UIの表示・操作に関する自動試験は存在 | 実機のキーボード、フォーカス、読み上げ、狭い画面の受入は未確認 |

## 11. 回収確認・通常環境への復帰

成功・失敗とも、専用serverとbuildの所有状態を先に確認する。
通常の開発serverが3000を使っている場合は、そのserverと専用serverを区別する。

```bash
test ! -e "$F12_CHECKOUT/.next" && printf '専用build回収OK\n'
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3443 -sTCP:LISTEN
```

この実行で作ったproject ID・workdirと一致し、通常projectとは異なることを確認する。
`--no-backup`を付けるのは、この使い捨てprojectだけである。

```bash
f12_supabase stop --project-id "$F12_PROJECT_ID" --no-backup

# 残存を調べる場合も、このprojectのlabelだけに限定する。
docker ps -a \
  --filter "label=com.supabase.cli.project=$F12_PROJECT_ID" \
  --format '{{.Names}}'
docker volume ls \
  --filter "label=com.supabase.cli.project=$F12_PROJECT_ID" \
  --format '{{.Name}}'

unset F12_ANON_KEY F12_SERVICE_ROLE_KEY F12_DB_URL F12_API_URL F12_STATUS_JSON
```

通常Supabaseを本書で停止した場合だけ、次の起動を行う。元から停止していた場合は起動を省く。

```bash
cd "$F12_SOURCE"
env -i \
  PATH="$PATH" \
  HOME="$HOME" \
  SUPABASE_EXPERIMENTAL_STACK=0 \
  ./node_modules/.bin/supabase \
  --workdir "$F12_SOURCE" \
  start >/dev/null 2>&1
F12_NORMAL_START_EXIT=$?
printf '通常Supabase起動終了コード: %s\n' "$F12_NORMAL_START_EXIT"
```

通常起動を行った場合は終了0を確認する。元プロジェクトで最終差分を確認する。

```bash
cd "$F12_SOURCE"
git status --short > "$F12_ROOT/source-status-after.txt"
diff -u "$F12_ROOT/source-status-before.txt" "$F12_ROOT/source-status-after.txt"
git diff --check -- . ':!feature.patch'
git status --short
```

残るcontainer・volumeがあればproject所有・用途を確認し、未確認なら削除を保留する。
`docker system prune`や全volume削除で片付けない。
status比較は変更一覧の比較であり、ファイル内容が完全一致する証明ではない。
コピー後に元ソースを編集した場合は、検証した版との対応を改めて確認する。
専用コピーのpackage.json・lockfile・生成Clientを元へ戻さない。

今回の対象ファイルだけを選んでstageし、検証したcommit・環境・結果・回収・残課題を記録してcommit／pushする。
文書のpatch検証と、過去の実DB／E2E合格を別の実行として記録する。
`.env`、証明書秘密鍵、trace、report、診断scriptをcommit対象へ含めない。

## 12. 結果台帳と引継ぎ

新しい実行では下表を埋める。件数・revision・runId・CLI／Node／browser／DB版・終了コードだけを記録し、
URL、資格情報、本文、個人情報、生reportを添付しない。未実行は空欄のままにせず明記する。

| 項目 | 継承した記録／今回の状態 | 次回記録するもの |
| --- | --- | --- |
| 実装基準 | `22e8f4c`、2026-11-09 | コピー元revision、変更有無、実行日・担当 |
| 通し結果 | 利用者報告・commit本文で `F12_MVP_PASSED 11`、終了0 | 全段階の固定表示と終了コード |
| unit | 粒度19追加修正時に129ファイル・4,252件成功を確認 | 実行時の件数、失敗／skip、所要時間 |
| integration | 同修正時に22ファイル・619件成功、skipなし | 全ファイル・必須群、自然／注入の件数 |
| F11競合修正 | 実DB51件を3回成功。全統合も成功 | 実エラー形・有限再試行・DB非重複の根拠 |
| migration／E2E／最後のbuild | 全11段階成功報告に含まれる。個別生reportはrepoに保存しない | 個別件数と回収結果の安全な要約 |
| 専用環境処分・通常復帰 | 基準commit本文に確認記録あり | project ID、残存件数、未確認、通常起動終了コード |
| 粒度20 | 静的照合とpatch適用確認のみ。実DB／E2E再実行なし | 文書patchのcheck・stat・対象ファイル |
| 本書の新規セットアップ | 未実行。元のCLI条件での再現性は未確認 | CLI版、設定差、fresh環境での通し結果 |
| SDK・実サービス | ローカルAuth／Storageと受付stubの範囲でR19 | LINE／Resend本番最小疎通はF13で別途確認 |
| browser・DB範囲 | Chromium・ローカルPostgreSQLの自動受入 | 他browser、実機、本番DBupgradeは未確認 |

### 12.1 F13粒度2（LINE再claim上限）の実行記録

2026-11-10に利用者が運用書第4〜7.2節の手順で実行した結果の報告に基づく記録。
URL・資格情報・生ログは記録しない。

| 項目 | 記録 |
| --- | --- |
| コピー元revision | `8f44b50885ac68b1f03697e74f183b8b0c819b38`（G2のcommit）。実行前の変更は未追跡の `.claude/` のみ |
| 環境の版 | Node v24.12.0、Supabase CLI 2.101.0（package.jsonの `^2.101.0` と一致）、専用project ID方式 |
| 依存の準備 | 元プロジェクトの `node_modules` を `rsync` で複製。fresh installではない。`npm ls --depth=0` はエラーなし |
| migration | 専用postgresへの既存履歴のdeploy、終了コード0 |
| integration | 3回実行、毎回22 suites・621件成功、終了コード0。F12時点の619件より2件増え、追加した2件に一致する。runnerはskipを許さない |
| 追加した試験 | 上限3回の終端化、取得2回済みの5並列。必須ケース名（manifest）への登録は未決定で、件数にだけ含まれる |
| verify:mvp | 利用者の報告で `F12_MVP_PASSED 11`、終了コード0（2026-11-10、同じ専用コピー・同revision）。件数・所要時間・回収の個別確認は未報告。上のintegration3回とは別の、DB再作成後の実行 |
| E2E一覧 | Chromium導入と `test:e2e:list`（78件・12ファイル）は一覧確認 |
| 回収 | `.next` 不在、3000・3443の待受なし。専用projectは `--no-backup` で停止し、該当label（project ID）のcontainerとvolumeの表示は空 |
| 通常環境の復帰 | 通常Supabaseを停止（`--no-backup`なし）して専用projectを実行。終了後に通常起動の終了コード0 |
| 元ソース | 前後の `git status --short` は同一、`git diff --check` は出力なし |

verify:mvp実行後の回収確認（`.next`・container・volume・通常Supabase復帰）は、利用者から未報告である。

この記録でF13-ENV-REPROは解消しない。依存を元から複製しており、fresh環境の通し再現ではない。
G2の合格は、ローカルの専用DBでのintegrationに限る。本番のLINE配信・実通信の確認ではない。

### 12.2 F13粒度1（再現性確認）の承認と実行記録

承認地点A（利用者の明示承認、2026-11-10）：

- 対象：ローカルDockerの使い捨てSupabase（実行ごとのproject ID）と、`/private/tmp` 配下の新しいコピー。
  本番・通常のDB／Auth／Storageには触れない。
- 変更：`/private/tmp` に作業ディレクトリを作る、Dockerコンテナを起動する、
  通常のローカルSupabaseを一時的に止める。package.json・lockfileは変更しない。
- 戻し方：専用projectを `--no-backup` で停止し、通常Supabaseを起動し直す。
- 実メール・LINE送信、deploy、外部設定・プランの変更は行わない。
- 追加の確認事項（実行前に利用者へ提示）：fresh環境では `npm ci` による依存取得とChromium取得のため、
  npm registry等への準備通信が発生する。lockfileは変更しない。

実行結果（2026-11-10、利用者の報告に基づく。生ログ・URL・資格情報は記録しない）：

| 項目 | 記録 |
| --- | --- |
| コピー元revision | `50660c7a62db159ae3dfa327951faecae474a1d8`。実行前の変更は未追跡の `.claude/` のみ |
| 環境の版 | Node v24.12.0、npm 11.18.0、Docker 29.2.1、Supabase CLI 2.101.0 |
| 依存の取得 | `node_modules` を複製せず、新しいコピーで `npm ci`（638パッケージ追加、終了コード0）。package.json・lockfileは元と一致（`cmp`） |
| 主要パッケージの版 | supabase 2.101.0、prisma 7.9.1、@prisma/client 7.8.0、next 16.2.6、@playwright/test 1.64.1、vitest 4.1.10（lockfileの記録と一致） |
| `npm ci` の警告 | 6パッケージのinstall scriptがallowScripts未設定（@prisma/engines、esbuild、fsevents、prisma、sharp、unrs-resolver）。スクリプトが実行されたか、許可されずにskipされたかは未確認。後続の全段階は成功している |
| 他の警告 | `npm audit` が26件の脆弱性（moderate 10・high 15・critical 1）を表示。G1では対応せず、`npm audit fix` も実行していない |
| verify:mvp | 全11段階成功、`F12_MVP_PASSED 11`、終了コード0。MIGRATION 23件、INTEGRATION 22ファイル（件数の合計621）、E2E 12ファイル（件数の合計78） |
| LINE worker | `line-delivery.integration.test.ts` は28件成功。必須ケースとして数える自然競合1・注入3は、manifestの登録どおり（G2で追加した2件は含まれない） |
| DB（PostgreSQL）の版 | 17.6（`show server_version`）。G1の `verify:mvp` とは別の実行（同日の粒度3の検証中）で、同じSupabase CLI 2.101.0・同じ専用config（`major_version = 17`）の専用DBから取得。専用DBのmigration履歴は26行、`prisma/migrations` の26ディレクトリと一致 |
| Chromium | 導入の終了コード0、`test:e2e:list` は78件・12ファイル |
| 回収 | `.next` 不在、3000・3443の待受なし、専用projectの container・volume の表示は空。通常Supabaseの起動終了コード0、元ソースの `git status` は前後で同一、`git diff --check` は出力なし |

この結果は、同じマシン・同じDockerイメージ・Playwrightのブラウザーキャッシュ（取得済み）の条件での1回の再現である。
F13-ENV-REPROは、G1の受入条件（CLI・Node・DBの版、fresh環境での通し結果、package.json・lockfileの無変更、回収の確認）の記録が揃ったため、解消済みとする。ただし、DBの版は別の実行で取得した値で、同じ実行での取得ではない。別マシン・空のキャッシュでの確認は未実施で、allowScripts警告の扱いは別項目（依存関係の警告）で扱う。

### 12.3 F13粒度3（LINE通信のtimeout）の実行記録

2026-11-10に利用者が運用書第4〜7.2節の手順で実行した結果の報告に基づく記録。生ログ・URL・資格情報は記録しない。

| 項目 | 記録 |
| --- | --- |
| 対象 | G3のcommit `7c953b3`（コピー元revisionの出力は未報告） |
| 環境 | `npm ci` で作った新しいコピー、Supabase CLI 2.101.0、PostgreSQL 17.6（専用DBの `show server_version`） |
| DB・migration | 専用DBに接続でき、migration履歴26行、`ClubLineDelivery` テーブルあり（確認用の読み取りのみ） |
| 初回の失敗 | integrationを3回実行し、毎回終了コード1。runnerは固定メッセージのみで原因を示さなかった |
| 原因 | コピーで Prisma Client が未生成だった（`npm ci` 後に生成していない）。DB suiteの準備が止まり、24件が実行されなかった。生成後に解消。コードの不具合ではない |
| 切り分け | 生成後の再実行で解消したことで確認。診断は、使い捨てDBの読み取り確認と、line-delivery単体のvitest実行（失敗した試験名のみを出力）で行った |
| integration（生成後） | 3回実行、毎回22 suites・623件成功、終了コード0。粒度2の621件より2件増え、G3で追加した有効期間の2件（23時間・25時間）に一致する。skipなし |
| verify:mvp | 利用者の報告で `F12_MVP_PASSED 11`、終了コード0。`line-delivery.integration.test.ts` は `passed=30 natural=1 injected=3`（G2・G3で追加した4件はmanifest未登録のため、必須の件数には含まれない） |
| 回収 | `.next` 不在、専用projectの停止とcontainer・volumeの確認、通常Supabaseの起動終了コード0。実行後の `git status` の差分は、台帳の編集（文書2ファイル）のみ |
| コピー元revision | 利用者が貼り付け1の出力を確認できなかったため、未記録（G3のcommit `7c953b3` のコピーに G3 の変更が入っていることは、`grep` で確認済み） |

実LINE通信の10秒の打ち切りは、unitで `AbortSignal.timeout` の値と時間切れの変換を確認した。実際のLINE APIへの通信・実時間の打ち切りは確認していない。

### 12.4 F13粒度3の追加決定（通信エラー・再送期限・manifest）の変更記録

2026-11-10の追加決定（通信エラーを結果不明に含める、再送期限を依頼日時から判定する、お知らせの再送対象の
実DB試験を1件追加する、G2・G3の追加試験をmanifestへ登録する）に伴うコード変更の記録。

| 項目 | 記録 |
| --- | --- |
| 元ソース側の確認 | unit（`vitest.mvp-unit.config.mts`）132ファイル・4,272件成功、型検査・対象lintに成功 |
| コピー元revision | `b37f9bf223640e25152fb2676fff50724268ff8f`（追加決定のコードのcommit）。実行前の変更は未追跡の `.claude/` のみ |
| 環境 | Node v24.12.0、npm 11.18.0、Supabase CLI 2.101.0。`npm ci` で作った新しいコピー。package.json・lockfileは元と一致（`cmp`）。`prisma generate`・`migrate deploy` の終了コードはともに0 |
| integration | 3回実行、毎回22 suites・624件成功、終了コード0（直前の623件より、お知らせの再送対象の試験1件が増えた）。skipなし |
| verify:mvp | 全11段階成功、`F12_MVP_PASSED 11`、終了コード0 |
| manifest | `line-delivery.integration.test.ts` は `passed=31 natural=2 injected=7`。登録した必須ケース（自然競合2・注入7）が、実際に数えられた |
| unit（専用環境） | 追加分：`line-delivery-result.test.ts` 15件、`line-messaging-api.test.ts` 3件、`line-delivery-retry-repository.test.ts` 2件 |
| 回収 | `.next` 不在、専用projectの停止とcontainer・volumeの確認、通常Supabaseの起動終了コード0。元ソースの `git status` は前後で同一、`git diff --check` は出力なし |

残課題を「テストがあるから解決済み」にしない。以下はF13の粒度計画作成・見直し時の引継ぎ項目とする。
本粒度ではF13の文書や実装を変更しない。引継ぎ時に担当・期限・採否・公開判断への影響を記録する。

| ID | 未解決／未確認 | 根拠・次の判断 |
| --- | --- | --- |
| F13-LINE-RECLAIM | 期限切れPROCESSINGの再claim回数に数値上限がない | [LINE-worker]。FAILEDは自動再送しない現行仕様と区別し、上限・終端化・運用保留を設計判断する。**G2で実装済み**（処理権の取得は合計3回まで、超過は専用errorCodeのFAILEDへ終端化）。ローカルintegrationで確認（第12.1節）。`verify:mvp` 全体とG3（結果不明の再送操作の除外）は未完了のため、LINE通知の本番有効化の判断は保留 |
| F13-LINE-TIMEOUT | 実LINE通信を一定時間で打ち切る機能は未実装 | [LINE-api]のfetch、[line-worker-DB]はTimeoutError注入。実timeoutと結果不明／重複防止の扱いを別patchで検討する |
| F13-ENV-REPRO | CLI版差とfreshセットアップ未実行 | **解消済み（G1、第12.2節）**。新しいコピーで `npm ci` から `verify:mvp` 全11段階まで成功し、CLIはlockfileどおり2.101.0、DBは17.6。条件：DB版は別実行で取得。別マシン・空のキャッシュでの確認と、allowScripts警告の扱いは未実施・別項目 |
| F13-RELEASE | 本番DBバックアップ・初期化・Storage制限・Cron・LINE／Resend疎通 | F12のローカル合格を本番確認の代用にしない |
| MANUAL-ACCEPTANCE | 既存運用書の実機・アクセシビリティ・Proxy条件 | 第10.5節と既存手動表へ、実施結果／保留理由を対応付ける |

解決済みの粒度19修正は、統合originのlocalhost統一と、F11の確認済みadapter競合の有限再試行である。
LINEの再claim上限・実timeoutの未実装と混同しない。
LINE workerの一回の取得limitも、同一deliveryの再claim回数上限とは別である。

本節を残課題の正本とする。F13での対応粒度・受入条件・担当・実施時期・公開可否への影響は、
[F13粒度別計画]に記載する。採否・上限値などの判断結果は、決定後に本節へ反映する。

<!-- 以下は実在するコード・試験・既存運用書への参照。 -->
[package.json]: ../../package.json
[supabase/config.toml]: ../../supabase/config.toml
[guard]: ../../tests/mvp/environment.ts
[manifest]: ../../tests/mvp/suite-manifest.ts
[integration-runner]: ../../scripts/test-integration.mjs
[e2e-runner]: ../../scripts/test-e2e.mjs
[verify-runner]: ../../scripts/verify-mvp.mjs
[verify-unit]: ../../tests/mvp/verify-mvp.test.ts
[db-fixture]: ../../tests/mvp/database-fixture.ts
[db-fixture-DB]: ../../tests/mvp/database-fixture.integration.test.ts
[local-services]: ../../tests/mvp/local-services-fixture.ts
[local-services-DB]: ../../tests/mvp/local-services-fixture.integration.test.ts
[migration-DB]: ../../tests/mvp/migration-databases.ts
[migrations]: ../../tests/mvp/migrations.integration.test.ts
[Playwright設定]: ../../playwright.config.mts
[preload]: ../../tests/mvp/outbound-preload.mjs
[harness-unit]: ../../tests/mvp/outbound-harness.test.ts
[observability]: ../../tests/mvp/failure-observability.mjs
[observability-unit]: ../../tests/mvp/failure-observability.test.ts
[smoke-E2E]: ../../e2e/smoke.spec.ts
[auth-E2E]: ../../e2e/authorization.spec.ts
[events-E2E]: ../../e2e/events.spec.ts
[notices-E2E]: ../../e2e/notices.spec.ts
[account-E2E]: ../../e2e/account-children.spec.ts
[members-E2E]: ../../e2e/members-invitations.spec.ts
[line-E2E]: ../../e2e/line-settings.spec.ts
[support-E2E]: ../../e2e/support-platform.spec.ts
[direct-action]: ../../e2e/action-boundaries.spec.ts
[secret-E2E]: ../../e2e/failure-observability.spec.ts
[F10-E2E]: ../../e2e/event-month-copy.spec.ts
[F11-E2E]: ../../e2e/event-practice-batch.spec.ts
[F10-DB]: ../../tests/event-month-copy.flow.integration.test.ts
[F11-DB]: ../../tests/event-practice-batch.flow.integration.test.ts
[F11-repository]: ../../src/infrastructure/prisma/repositories/event-practice-batch-mutation-repository.ts
[F11-unit]: ../../tests/event-practice-batch-mutation-repository.test.ts
[membership-DB]: ../../tests/club-membership-repository.integration.test.ts
[invitation-DB]: ../../tests/club-invitation-acceptance-repository.integration.test.ts
[storage-job-DB]: ../../tests/storage-deletion-jobs.integration.test.ts
[content-DB]: ../../tests/mvp/content-tenancy.integration.test.ts
[attachment-DB]: ../../tests/mvp/attachment-storage.integration.test.ts
[line-binding-DB]: ../../tests/mvp/line-webhook-tenancy.integration.test.ts
[line-worker-DB]: ../../tests/mvp/line-delivery.integration.test.ts
[mail-DB]: ../../tests/mvp/mail-failures.integration.test.ts
[role-unit]: ../../tests/club-membership-authorization.test.ts
[plan-unit]: ../../domain/club/plan-features.test.ts
[LINE-worker]: ../../src/application/club/line/send-pending-line-deliveries.ts
[LINE-api]: ../../src/infrastructure/line/line-messaging-api.ts
[F10-runbook]: event-month-copy.md
[F11-runbook]: event-practice-batch.md
[F13粒度別計画]: ../implementation/phases/F13-granular-plan.md
