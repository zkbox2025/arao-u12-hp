// tests/mvp/migration-databases.ts
// 予約DBの作成・変更なしmigrationコピー・履歴照合と、所有確認付きcleanupだけを扱う。

import {
  spawnSync, // インストール済みPrisma CLIの終了を期限付きで待つ関数
} from "node:child_process";
import {
  createHash, // migration原文のchecksumを作る関数
  randomUUID, // 所有マーカーのnonceを作る関数
} from "node:crypto";
import {
  copyFileSync, // migrationとschemaを変更せずコピーする関数
  mkdirSync, // prefix用ディレクトリを作る関数
  mkdtempSync, // この実行専用の一時領域を作る関数
  readdirSync, // migrationの実在名だけを列挙する関数
  readFileSync, // migrationの原文を読む関数
  realpathSync, // 別checkoutへのリンクを検出する関数
  rmSync, // 所有する一時ディレクトリだけを削除する関数
  statSync, // 通常ファイルを確認する関数
  writeFileSync, // dotenvを使わない専用CLI設定を作る関数
} from "node:fs";
import {
  tmpdir, // OSの一時領域を返す関数
} from "node:os";
import {
  join, // パスを組み立てる関数
} from "node:path";
import type {
  Client, // 専用PostgreSQL接続の型
} from "pg";

import {
  getMvpMigrationDatabase, // 同一実行に予約したmigration DBの接続先だけを解決する関数
  requireMvpTestEnvironment, // SDK評価前に専用flag・URL・checkoutを検証する関数
} from "./environment";
import type {
  MvpTestEnvironment, // ガード済みの専用実行環境型
} from "./environment";

const FAILURE = "F12 migration試験の接続・履歴・所有資源を確認してください。";
const BOUNDARIES = {
  legacy: "20260816221153_add_club_app_schema",
  f10: "20261027000000_f10_event_month_copy",
  latest: "20261031000000_f11_event_practice_batch",
};

/**
 * 既存データを投入する旧形式、F10、現在のF11までの適用段階。
 */
export type MvpMigrationStage = keyof typeof BOUNDARIES; // 適用段階型 / 境界定数から取得するキー型

/**
 * 接続秘密や削除権限を列挙せず、WeakMapの所有台帳と照合するハンドル。
 */
export type MvpMigrationHandle = Readonly<{ // DB所有ハンドル型 / 読取専用型
  runId: string; // 実行識別子の文字列型
  databaseName: string; // 同一実行に予約したDB名の文字列型
}>;

/**
 * 値・SQL例外を含まず、この実行が解放できなかった資源だけを返す。
 */
export type MvpMigrationCleanup = { // 後片付け結果型
  runId: string; // 所有する実行の文字列型
  databaseName: string; // 残存時に識別できる予約DB名の文字列型
  remainingDatabase: boolean; // 存在または結果不明を表す真偽値型
  openClients: number; // 解放を確認できない専用接続数の数値型
  temporaryDirectories: number; // 削除できなかった一時領域数の数値型
};

/**
 * コピー元の原文と、Prisma履歴に期待するSHA-256を対応させる。
 */
type Migration = { // migration原本の照合型
  name: string; // migration名の文字列型
  file: string; // 通常ファイルの絶対パス型
  checksum: string; // 原文のSHA-256文字列型
};

/**
 * PostgreSQLのDB識別子と所有role・実行固有のコメントを保持する。
 */
type Identity = { // DB実体の識別型
  oid: string; // DB OIDの文字列型
  owner: string; // DB所有roleの文字列型
  marker: string | null; // 所有コメントの文字列型 / 未設定の型
};

/**
 * 途中失敗でも登録済みの接続・一時領域・作成試行を追える非公開台帳。
 */
type State = { // 予約DBごとの所有台帳型
  configuration: MvpTestEnvironment; // ガード済み環境型
  handle: MvpMigrationHandle; // 公開ハンドル型
  databaseUrl: string; // 予約DB専用接続先の文字列型
  marker: string; // 実行とnonceを含む非公開の所有証明文字列型
  identity?: Identity; // 作成後のDB識別型
  attempted: boolean; // CREATE要求を送ったかの真偽値型
  ready: boolean; // 作成と所有確認が完了したかの真偽値型
  busy: boolean; // 同じハンドルでの並列操作を拒否する真偽値型
  clients: Set<Client>; // 所有接続の集合型 / 専用pg接続型
  directories: Set<string>; // 自分が作った一時パスの集合型 / 文字列型
};

const broken = new WeakSet<Client>(); // 障害を通知した所有接続の弱参照集合型 / pg接続型
const states = new WeakMap<MvpMigrationHandle, State>(); // 所有台帳のコンストラクター / ハンドル型 / 内部状態型

/**
 * 原本パスに外部リンクを許さず、コピーとchecksumが同じ通常ファイルを使う。
 */
function sourceFile(path: string): string { // 原本ファイルの検証関数 / 文字列型
  if (
    realpathSync(path) !== path || // 実在パスを照合する関数
    !statSync(path).isFile() // ファイル情報取得関数 / 通常ファイル判定メソッド
  ) {
    throw new Error(FAILURE); // 原文を含めない例外コンストラクター
  }
  return path;
}

/**
 * 現在のcheckoutに実在するmigrationを、元の順序と原文checksumで列挙する。
 */
function migrations(configuration: MvpTestEnvironment): Migration[] { // 原本一覧取得関数 / 実行環境型 / migration配列型
  const directory = join(configuration.checkoutDirectory, "prisma/migrations"); // 原本ディレクトリのパス結合関数
  const names = readdirSync(directory, {  // 実在ファイル名を列挙する関数
    withFileTypes: true
  }); // ファイル名と種別だけを列挙する関数
  const result: Migration[] = []; // migration原本の配列型
  for (const entry of names) {
    if (entry.name === "migration_lock.toml") {
      continue;
    }
    if (
      !entry.isDirectory() || // ディレクトリを判定するメソッド
      !/^\d{14}_[a-z0-9_]+$/u.test(entry.name) // migration名を検証するメソッド
    ) {
      throw new Error(FAILURE); // 不明な原本構成を拒否するコンストラクター
    }
    const file = sourceFile(join(directory, entry.name, "migration.sql")); // 原本検証関数 / パス結合関数
    result.push({ // 原本情報を記録するメソッド
      name: entry.name,
      file,
      checksum: createHash("sha256").update(readFileSync(file)).digest("hex"), // hash生成関数 / 原文読取関数 / hash入力・出力メソッド
    });
  }
  result.sort( // migration名の順に並べるメソッド
    /**
     * migrationのタイムスタンプを含む名前順を保持する。
     */
    (
      left,
      right
    ) => left.name.localeCompare(right.name), // 名前比較のコールバック / 文字列比較メソッド
  );
  if (
    result.length === 0 ||
    result[result.length - 1].name !== BOUNDARIES.latest
  ) {
    throw new Error(FAILURE); // 未確認の末尾migrationを拒否するコンストラクター
  }
  return result;
}

/**
 * 公開値を信用せず、所有台帳と接続前ガードを毎回照合する。
 */
function stateFor(handle: MvpMigrationHandle): State { // 内部台帳の取得関数 / DBハンドル型 / 内部状態型
  const state = states.get(handle); // 同じハンドルの台帳を取得するメソッド
  if (!state) {
    throw new Error(FAILURE); // 偽造ハンドルを拒否するコンストラクター
  }
  const configuration = requireMvpTestEnvironment( // SDK・CLI評価前の接続ガード関数
    state.configuration.variables,
    state.configuration.checkoutDirectory,
    handle.runId,
  );
  const resource = getMvpMigrationDatabase(configuration, handle.databaseName); // 同一実行の予約DBだけを解決する関数
  if (
    resource.databaseUrl !== state.databaseUrl ||
    new URL(configuration.databaseUrl).username !== "postgres" // 接続URLを解析するコンストラクター
  ) {
    throw new Error(FAILURE); // postgres所有の専用cluster以外を拒否するコンストラクター
  }
  return state;
}

/**
 * 接続前に台帳登録し、connect・endの途中失敗も後片付けへ引き継ぐ。
 */
async function connection( // 接続前に台帳登録して専用接続を作る関数
  state: State, // 予約DBの非公開所有台帳型
  databaseUrl: string // 文字列型
): Promise<Client> { // 接続生成関数 / 台帳型 / 接続先文字列型 / 専用pg接続の非同期型
  stateFor(state.handle); // 接続直前にも所有と環境を照合する関数
  const { Client: PgClient } = await import("pg"); // ガード後にpg SDKを遅延評価する関数
  const client = new PgClient({ // 専用pg接続のコンストラクター
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    lock_timeout: 2_000,
    ssl: false,
    options: "-c search_path=public",
  });
  state.clients.add(client); // connectより前に所有接続を登録するメソッド
  client.on("error", // 接続切断の非同期通知を受け取るメソッド
    /**
     * pgが通知した例外原文を出さず、成功扱いを防ぐため接続障害だけを記録する。
     */
    () => { // 所有接続の障害を記録するコールバック
      broken.add(client); // 障害を通知した接続を登録するメソッド
    },
  );
  await client.connect(); // 専用DBへ接続するメソッド
  return client;
}

/**
 * 成功したendだけを台帳から外し、失敗した接続を見失わない。
 */
async function disconnect( // 所有接続を解放し台帳から外す関数
  state: State, // 予約DBの非公開所有台帳型
  client: Client // 専用pg接続型
): Promise<void> { // 接続解放関数 / 台帳型 / pg接続型 / 完了待機型
  try {
    await client.end(); // 自分の接続だけを終了するメソッド
  } catch {
    throw new Error(FAILURE); // 解放例外の原文も公開しないコンストラクター
  }
  state.clients.delete(client); // 解放済みの接続を台帳から外すメソッド
}

/**
 * 既存のcluster roleと現在の権限を確認し、ロールの作成や変更は行わない。
 */
async function admin(state: State): Promise<Client> { // 管理接続生成関数 / 台帳型 / pg接続の非同期型
  const client = await connection(state, state.configuration.databaseUrl); // 既存postgres DBへの管理接続を作る関数
  const result = await client.query( // cluster roleと現在の権限を確認するメソッド
    `SELECT rolname, rolcreatedb, rolsuper, rolname = current_user AS is_current
     FROM pg_roles WHERE rolname = ANY($1::text[])`,
    [["anon", "authenticated", "postgres"]],
  );
  if (
    result.rows.length !== 3 ||
    !result.rows.some( // postgresでのCREATE権限を確認するメソッド
      /**
       * 設定名だけでなく、接続後のcurrent_userと権限を照合する。
       */
      (role) => role.rolname === "postgres" && // 初期化・照合・後片付けのコールバック
        role.is_current &&
        (role.rolcreatedb ||
          role.rolsuper), // 権限照合のコールバック
    )
  ) {
    throw new Error(FAILURE); // 不足role・権限を拒否するコンストラクター
  }
  return client;
}

/**
 * 対象名1件だけを調べ、他実行のDB一覧を取得・削除しない。
 */
async function identity( // 対象DBのOID・所有role・markerを取得する関数
  client: Client, // 専用pg接続型
  name: string // 文字列型
): Promise<Identity | undefined> { // DB実体照合関数 / pg接続型 / 名前文字列型 / DB識別情報の非同期型
  const result = await client.query<Identity>( // DB識別情報を取得するメソッド / DB識別型
    `SELECT oid::text, pg_get_userbyid(datdba) AS owner,
       shobj_description(oid, 'pg_database') AS marker
     FROM pg_database WHERE datname = $1`,
    [name],
  );
  return result.rows[0];
}

/**
 * 同じ名前の別DBへ削除権限を持ち越さず、OID・role・実行固有markerを照合する。
 */
function owned( // 作成時と現在の所有実体を照合する関数
  state: State, // 予約DBの非公開所有台帳型
  current: Identity | undefined // OID・所有role・markerの識別型 / 未設定の型
): boolean { // 所有実体の照合関数 / 台帳型 / DB識別型 / 真偽値型
  return !!current &&
    typeof current.oid === "string" &&
    /^[0-9]+$/u.test(current.oid) && // 実体を識別するOID文字列の検証メソッド
    current.owner === "postgres" &&
    current.marker === state.marker &&
    (!state.identity ||
      state.identity.oid === current.oid);
}

/**
 * 同一runに予約された2つのDB名を計画する。SDK・DB・CLIはまだ評価しない。
 */
export function planMvpMigrationDatabases(configuration: MvpTestEnvironment): readonly MvpMigrationHandle[] { // 予約DB計画関数 / ガード済み環境型 / 所有ハンドルの読取専用配列型
  const checked = requireMvpTestEnvironment( // URLやSDKより先に実行条件を照合する関数
    configuration.variables,
    configuration.checkoutDirectory,
    configuration.runId,
  );
  return checked.migrationDatabaseNames.map( // 同じrunの予約名をハンドルへ写すメソッド
    /**
     * 作成前から失敗時の後片付け先を登録する。
     */
    (databaseName) => { // 所有台帳を作るコールバック
      const resource = getMvpMigrationDatabase(configuration, databaseName); // 予約済みDBだけを解決する関数
      const handle = Object.freeze({ // 公開ハンドルの改変を防ぐ関数
        runId: resource.runId,
        databaseName,
      });
      states.set(handle, { // SDK評価前に内部台帳へ登録するメソッド
        configuration: checked,
        handle,
        databaseUrl: resource.databaseUrl,
        marker: `mvp_f12:${resource.runId}:${randomUUID()}`, // 所有nonceを作る関数
        attempted: false,
        ready: false,
        busy: false,
        clients: new Set(), // 専用接続を保持する集合のコンストラクター
        directories: new Set(), // 自分の一時パスを保持する集合のコンストラクター
      });
      stateFor(handle); // ガードと予約資源の対応を照合する関数
      return handle;
    },
  );
}

/**
 * 不在を確認した予約DBだけを作り、所有コメントとOIDを保存する。既存DBは採用しない。
 */
export async function createMvpMigrationDatabase(handle: MvpMigrationHandle): Promise<void> { // 所有DB作成関数 / ハンドル型 / 非同期完了型
  const state = stateFor(handle); // 所有台帳を取得する関数
  if (state.busy ||
    state.attempted) {
    throw new Error(FAILURE); // 同時・二重作成を拒否するコンストラクター
  }
  state.busy = true;
  let client: Client | undefined; // 管理接続型 / 未設定の型
  try {
    client = await admin(state); // role・権限確認済みの管理接続を作る関数
    if (await identity(client, handle.databaseName)) { // 既存DBの実体を確認する関数
      throw new Error(FAILURE); // 同名の既存DBは触らずに拒否するコンストラクター
    }
    state.attempted = true;
    // 名前は予約資源解決済み、markerはrunIdと内部生成UUIDだけで構成する。
    await client.query(`CREATE DATABASE "${handle.databaseName}" WITH TEMPLATE template0 ENCODING 'UTF8' OWNER postgres`); // 登録済みの新規DBだけを作るメソッド
    await client.query(`COMMENT ON DATABASE "${handle.databaseName}" IS '${state.marker}'`); // 実行固有の所有証明を記録するメソッド
    state.identity = await identity(client, handle.databaseName); // 作成したDBの実体を取得する関数
    if (!owned(state, state.identity)) { // 所有role・marker・OIDを確認する関数
      throw new Error(FAILURE); // 所有不明の状態を成功にしないコンストラクター
    }
    state.ready = true;
  } catch {
    throw new Error(FAILURE); // SQL・資格情報・causeを公開しないコンストラクター
  } finally {
    try {
      if (client) {
        await disconnect(state, client); // 自分の管理接続だけを解放する関数
      }
    } finally {
      state.busy = false;
    }
  }
}

/**
 * 所有を再確認してから専用接続を渡す。古い列へのcurrent Prisma Clientは使用しない。
 */
export async function withMvpMigrationDatabase<T>( // 予約DBでSQL検証を実行する関数 / 任意の処理結果型
  handle: MvpMigrationHandle, // 所有ハンドル型
  operation: (client: Client) => Promise<T>, // 専用pg接続型 / 検証処理の非同期関数型
): Promise<T> { // 検証処理の結果を返す非同期型
  const state = stateFor(handle); // ガード済み所有台帳を取得する関数
  if (!state.ready ||
    state.busy) {
    throw new Error(FAILURE); // 未作成または並列操作を拒否するコンストラクター
  }
  state.busy = true;
  let management: Client | undefined; // 管理接続型 / 未設定の型
  let target: Client | undefined; // 対象DB接続型 / 未設定の型
  try {
    management = await admin(state); // 管理接続を生成して権限を確認する関数
    if (!owned(state, await identity(management, handle.databaseName))) { // 実体を取得する関数 / 所有情報照合関数
      throw new Error(FAILURE); // 同名DBの入替えを拒否するコンストラクター
    }
    await disconnect(state, management); // SQL検証前に管理接続を解放する関数
    management = undefined;
    target = await connection(state, state.databaseUrl); // 所有する予約DBへだけ接続する関数
    const result = await operation(target); // 渡されたSQL検証処理を実行する関数
    if (broken.has(target)) { // 非同期の接続障害通知を照合するメソッド
      throw new Error(FAILURE); // 接続障害を成功扱いしない例外コンストラクター
    }
    return result;
  } catch {
    throw new Error(FAILURE); // SQL結果や例外原文を公開しないコンストラクター
  } finally {
    try {
      if (target) {
        await disconnect(state, target); // 自分の専用DB接続を解放する関数
      }
      if (management) {
        await disconnect(state, management); // 自分の管理接続を解放する関数
      }
    } finally {
      state.busy = false;
    }
  }
}

/**
 * CLIのstatus=1を無条件に許さず、DBの有効な履歴と未適用名の応答を併せて確認する。
 */
export function assertMvpMigrationStatus( // CLI statusの終了状態を照合する関数
  result: Pick<ReturnType<typeof spawnSync>, "status" | "signal" | "error" | "stdout" | "stderr">, // 子プロセス結果の必要項目型 / 起動関数の戻り値型
  pending: readonly string[], // DB履歴と原本の差分で確定した未適用名の読取専用配列型
  hasHistory: boolean, // migration履歴テーブルの有無の真偽値型
): void { // 戻り値を使わない型
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const pendingList = /Following migrations? have not yet been applied:/u.test(text) && // Prisma 7の未適用応答を判定するメソッド
    pending.every( // DBで確定した未適用名が応答にあるか確認するメソッド
      /**
       * 接続障害・別履歴の応答を未適用と混同しない。
       */
      (name) => text.split(/\r?\n/u).includes(name), // 名前照合コールバック / 応答を行へ分割するメソッド / 完全一致判定メソッド
    );
  const unmanaged = !hasHistory &&
    text.includes("The current database is not managed by Prisma Migrate."); // 履歴がない新規DBの応答を照合するメソッド
  const completed = pending.length === 0 &&
    result.status === 0;
  const waiting = pending.length > 0 &&
    result.status === 1 &&
    (pendingList || unmanaged);
  if (
    result.error ||
    result.signal ||
    !(completed || waiting)
  ) {
    throw new Error(FAILURE); // 真のCLIエラーを固定例外で拒否するコンストラクター
  }
}

/**
 * 変更なしコピーしたprefixをdeployし、適用前後のstatus・履歴・checksumを照合する。
 */
export async function deployMvpMigrationStage( // 段階migrationの適用と履歴照合を実行する関数
  handle: MvpMigrationHandle, // 所有ハンドル型
  stage: MvpMigrationStage, // 検証するmigration段階型
): Promise<void> { // 完了を待つ非同期型
  const state = stateFor(handle); // 接続前ガードと所有台帳を取得する関数
  let directory: string | undefined; // 自分の一時パスの文字列型 / 未設定の型
  try {
    const all = migrations(state.configuration); // 原本とchecksumを列挙する関数
    const index = all.findIndex( // 必要な末尾の境界を探すメソッド
      /**
       * 計画で確認済みの境界名と完全一致させる。
       */
      (migration) => migration.name === BOUNDARIES[stage], // 境界照合のコールバック
    );
    if (index < 0) {
      throw new Error(FAILURE); // 例外を作るコンストラクター
    } // 存在しない段階を拒否する例外コンストラクター
    const prefix = all.slice(0, index + 1); // 変更せず適用するprefixを切り出すメソッド
    directory = mkdtempSync(join(tmpdir(), "mvp-migrations-")); // 所有一時領域生成関数 / パス結合関数 / 一時領域取得関数
    state.directories.add(directory); // 作成直後に一時資源を台帳へ登録するメソッド
    const migrationDirectory = join(directory, "migrations"); // prefix出力先のパス結合関数
    mkdirSync(migrationDirectory); // prefixディレクトリを作成する関数
    copyFileSync(sourceFile(join(state.configuration.checkoutDirectory, "prisma/schema.prisma")), join(directory, "schema.prisma")); // 原本検証関数 / パス結合関数 / schema原文のコピー関数
    copyFileSync(sourceFile(join(state.configuration.checkoutDirectory, "prisma/migrations/migration_lock.toml")), join(migrationDirectory, "migration_lock.toml")); // 原本検証関数 / パス結合関数 / provider設定のコピー関数
    for (const migration of prefix) {
      const target = join(migrationDirectory, migration.name); // コピー先のパス結合関数
      mkdirSync(target); // migrationディレクトリを作る関数
      copyFileSync(migration.file, join(target, "migration.sql")); // 原文のコピー関数 / パス結合関数
      const checksum = createHash("sha256").update(readFileSync(join(target, "migration.sql"))).digest("hex"); // SHA-256生成関数 / コピー後の原文読取関数 / パス結合関数 / hash入力・出力メソッド
      if (checksum !== migration.checksum) {
        throw new Error(FAILURE); // 例外を作るコンストラクター
      } // 原文の変更を拒否する例外コンストラクター
    }
    const config = join(directory, "prisma.config.mjs"); // dotenvを読み込まない設定パスの結合関数
    writeFileSync( // dotenvを評価しない専用CLI設定を作る関数
      config,
      `// prisma.config.mjs
/**
 * dotenvを読まず、この実行の予約DBと変更なしコピーだけをCLIへ渡す。
 */
export default {
  schema: "./schema.prisma",
  migrations: {
    path: "./migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
`,
    );
    await withMvpMigrationDatabase(handle, // 所有DBへの接続を生成・解放する関数
      /**
       * 生きたDB履歴を基準とし、SQL文字列検索だけでmigration成功とはしない。
       */
      async (client) => { // SQLとCLIの結果を照合するコールバック
        const presence = await client.query(`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`); // 履歴テーブルの有無を問い合わせるメソッド
        const previous = presence.rows[0].present
          ? (await client.query(`SELECT migration_name, checksum, finished_at, rolled_back_at, logs FROM public._prisma_migrations ORDER BY migration_name`)).rows // DB履歴を取得するメソッド
          : [];
        for (let position = 0; position < previous.length; position += 1) {
          const row = previous[position];
          const expected = prefix[position];
          if (
            !expected ||
            row.migration_name !== expected.name ||
            row.checksum !== expected.checksum ||
            !row.finished_at ||
            row.rolled_back_at ||
            row.logs
          ) {
            throw new Error(FAILURE); // 例外を作るコンストラクター
          } // divergence・失敗履歴・checksum変更を拒否する例外コンストラクター
        }
        const pending = prefix.slice(previous.length).map( // 未適用prefixを切り出すメソッド / 名前へ写すメソッド
          /**
           * CLIと照合する実際の未適用名を返す。
           */
          (migration) => migration.name, // 未適用名を返すコールバック
        );
        /**
         * 元のenvやdotenv設定を引き継がず、予約DBと専用configだけでCLIを起動する。
         */
        function command(action: "status" | "deploy") { // Prisma CLIの起動関数 / 許可するサブコマンド型
          stateFor(handle); // CLI評価直前に接続先と予約名を再確認する関数
          return spawnSync(process.execPath, [ // Prisma CLIを期限付きで起動する関数
            join(state.configuration.checkoutDirectory, "node_modules/prisma/build/index.js"), // 導入済みCLIのパス結合関数
            "migrate", action, "--config", config,
          ], {
            cwd: directory,
            env: {
              NODE_ENV: "test",
              DATABASE_URL: state.databaseUrl,
              CHECKPOINT_DISABLE: "1",
              PRISMA_HIDE_UPDATE_MESSAGE: "1",
              NO_COLOR: "1",
            },
            encoding: "utf8",
            timeout: 60_000,
            maxBuffer: 1024 * 1024,
            shell: false,
          });
        }
        assertMvpMigrationStatus(command("status"), pending, presence.rows[0].present); // status照合関数 / CLI起動関数
        const applied = command("deploy"); // migrationを実際に適用するCLI起動関数
        if (applied.status !== 0 ||
          applied.signal ||
          applied.error) {
          throw new Error(FAILURE); // 例外を作るコンストラクター
        } // 適用失敗を拒否する例外コンストラクター
        const history = await client.query(`SELECT migration_name, checksum, finished_at, rolled_back_at, logs FROM public._prisma_migrations ORDER BY migration_name`); // 適用後のDB履歴を取得するメソッド
        if (history.rows.length !== prefix.length) {
          throw new Error(FAILURE); // 例外を作るコンストラクター
        } // migration欠落を拒否する例外コンストラクター
        for (let position = 0; position < prefix.length; position += 1) {
          const row = history.rows[position];
          if (
            row.migration_name !== prefix[position].name ||
            row.checksum !== prefix[position].checksum ||
            !row.finished_at ||
            row.rolled_back_at ||
            row.logs
          ) {
            throw new Error(FAILURE); // 例外を作るコンストラクター
          } // 履歴と原本の不一致を拒否する例外コンストラクター
        }
        assertMvpMigrationStatus(command("status"), [], true); // 適用後statusを照合する関数 / CLI起動関数
      },
    );
  } catch {
    throw new Error(FAILURE); // CLI出力・SQL・資格情報を公開しないコンストラクター
  } finally {
    if (directory) {
      try {
        rmSync(directory, {  // 所有資源だけを削除する関数
          recursive: true,
          force: true
        }); // この実行のprefixコピーだけを削除する関数
      } catch {
        throw new Error(FAILURE); // 一時資源の削除例外を公開しないコンストラクター
      }
      state.directories.delete(directory); // 削除済み一時資源を台帳から外すメソッド
    }
  }
}

/**
 * 専用接続を解放してから、予約名・OID・role・markerが一致するDBだけを削除する。
 * 他の接続をterminateせず、busy・接続・権限・所有・DROP失敗は残存として返す。
 */
export async function cleanupMvpMigrationDatabase(handle: MvpMigrationHandle): Promise<MvpMigrationCleanup> { // 所有DB後片付け関数 / ハンドル型 / cleanup結果の非同期型
  const state = stateFor(handle); // 環境と所有台帳を再確認する関数
  let remainingDatabase = state.attempted;
  if (state.busy) {
    return {
      ...handle,
      remainingDatabase,
      openClients: state.clients.size,
      temporaryDirectories: state.directories.size,
    };
  }
  state.busy = true;
  try {
    for (const client of state.clients) {
      try {
        await disconnect(state, client); // 自分の専用接続だけを解放する関数
      } catch {
        remainingDatabase = true;
      }
    }
    if (state.attempted &&
      state.clients.size === 0) {
      let management: Client | undefined; // 自分の管理接続型 / 未設定の型
      try {
        management = await admin(state); // 接続先・role・権限を再確認する関数
        const current = await identity(management, handle.databaseName); // 対象1件の実体を取得する関数
        if (!current) {
          remainingDatabase = false;
          state.ready = false;
        } else if (owned(state, current)) { // 作成時の所有実体と照合する関数
          const sessions = await management.query(`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1`, [handle.databaseName]); // 他の接続を解放せず件数だけを調べるメソッド
          if (sessions.rows[0].count === 0) {
            await management.query(`DROP DATABASE "${handle.databaseName}"`); // 所有を確認したDBだけを削除するメソッド
            remainingDatabase = false;
            state.ready = false;
          }
        }
      } catch {
        remainingDatabase = true;
      } finally {
        if (management) {
          try {
            await disconnect(state, management); // 自分の管理接続を解放する関数
          } catch {
            remainingDatabase = true;
          }
        }
      }
    }
    for (const directory of state.directories) {
      try {
        rmSync(directory, {  // 所有資源だけを削除する関数
          recursive: true,
          force: true
        }); // 登録済み一時資源だけを削除する関数
        state.directories.delete(directory); // 削除完了資源を台帳から外すメソッド
      } catch {
        // 一時資源の残存件数を返し、成功扱いしない。
      }
    }
    return {
      ...handle,
      remainingDatabase,
      openClients: state.clients.size,
      temporaryDirectories: state.directories.size,
    };
  } finally {
    state.busy = false;
  }
}
