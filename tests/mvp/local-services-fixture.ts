// tests/mvp/local-services-fixture.ts
// guard後だけSDKを初期化し、登録済みのローカルAuth・private PDF・DBを一体で管理する。

import {
  Buffer, // 小さなPDFをメモリ上で組み立てるクラス
} from "node:buffer";
import {
  randomBytes, // run専用passwordの乱数を作る関数
} from "node:crypto";
import type {
  PrismaClient, // guard後に呼出し元が生成する専用DB client型
} from "@prisma/client";
import type {
  SupabaseClient, // ローカルAuth・Storage SDKの型
  User, // Auth本人の戻り値型
} from "@supabase/supabase-js";
import type {
  CookieOptions, // SSR Cookieの保存属性型
} from "@supabase/ssr";
import {
  CLUB_ATTACHMENT_BUCKET, // ストレージ内の保管場所の名前
} from "@/src/infrastructure/storage/club-attachment-storage-constants";
import {
  cleanupMvpDatabaseFixture, // 所有台帳の範囲だけを削除する関数
  planMvpDatabaseFixture, // DB接続前にUUIDと保存行を計画する関数
  seedMvpDatabaseFixture, // 計画した行を一体保存する関数
} from "./database-fixture";
import type {
  MvpDatabaseFixture, // 認可・関連行のfixture ID型
  MvpFixtureOptions, // ケース別fixture入力型
  MvpFixtureUserKey, // 本人キー型
} from "./database-fixture";
import {
  requireMvpTestEnvironment, // F12の実行前ガード関数
} from "./environment";
import type {
  MvpTestEnvironment, // F12の検証済み実行環境型
} from "./environment";

const SERVICE_ERROR = "F12ローカルサービスfixtureの設定・作成・認証を確認してください。";

/**
 * 秘密を列挙せず、DB fixtureと実行の対応だけを公開するハンドル。
 */
export type MvpLocalServicesFixture = Readonly<{ // 秘密を列挙しない所有ハンドル型 / 読取専用にする型
  runId: string; // 文字列型
  database: MvpDatabaseFixture; // 認可・関連行のfixture ID型
}>;

/**
 * ブラウザー接続用にメモリ上でのみ受け渡すpasswordログイン情報。ログ・成果物へ保存しない。
 */
export type MvpFixtureCredentials = Readonly<{ // 検証専用の認証情報型 / 読取専用にする型
  email: string; // 文字列型
  password: string; // 文字列型
}>;

/**
 * SDKが実password認証で生成したCookieと、同じ応答へ必要なキャッシュ抑止header。
 * ブラウザーへの適用は後続粒度。Service Roleや管理clientは含めない。
 */
export type MvpFixtureSession = Readonly<{ // 実認証で生成したCookie・header型 / 読取専用にする型
  cookies: readonly Readonly<{ // 読取専用にする型
    name: string; // 文字列型
    value: string; // 文字列型
    options: CookieOptions; // Cookieの保存属性型
  }>[];
  headers: Readonly<Record<string, string>>; // 読取専用にする型 / キーと値の対応型 / 文字列型
}>;

/**
 * 削除できない、または作成・削除結果が未確認の資源を、値を伏せた件数だけで報告する。
 */
export type MvpLocalCleanupReport = Readonly<{ // 残存・未確認件数の報告型 / 読取専用にする型
  runId: string; // 文字列型
  remaining: Readonly<{ // 読取専用にする型
    authUsers: number; // 数値型
    storageObjects: number; // 数値型
    buckets: number; // 数値型
    database: boolean; // 真偽値型
  }>;
}>;

/**
 * 公開ハンドルに対応する所有台帳と、外へ出さないSDK・passwordの状態。
 */
type LocalState = { // ローカル資源の非公開所有台帳型
  configuration: MvpTestEnvironment; // ガード済み実行環境型
  credentials: Map<MvpFixtureUserKey, MvpFixtureCredentials>; // キーと値を保持するMap型 / 本人キー型 / 検証専用の認証情報型
  pendingUsers: Set<string>; // 所有ID・pathの集合型 / 文字列型
  createdUsers: Set<string>; // 所有ID・pathの集合型 / 文字列型
  objects: Set<string>; // 所有ID・pathの集合型 / 文字列型
  admin?: SupabaseClient; // ローカルAuth・Storage SDKの型
  database?: PrismaClient; // 専用DB clientの型
  databaseAttempted: boolean; // 真偽値型
  databaseReady: boolean; // 真偽値型
  bucketPending: boolean; // 真偽値型
  bucketCreatedAt?: string; // 文字列型
  phase: "planned" | "seeding" | "ready" | "failed" | "cleaning" | "cleaned"; // fixtureの処理段階を表すリテラル型
};

const states = new WeakMap<MvpLocalServicesFixture, LocalState>(); // fixtureと所有台帳を結ぶコンストラクター / 秘密を列挙しない所有ハンドル型 / ローカル資源の非公開所有台帳型

/**
 * このモジュールで登録したハンドルだけから、非公開の所有台帳を取り出す。
 */
function stateOf(fixture: MvpLocalServicesFixture): LocalState { // 非公開の所有台帳を取得する関数 / 秘密を列挙しない所有ハンドル型 / ローカル資源の非公開所有台帳型
  const state = states.get(fixture); // 登録した値を取得するメソッド
  if (!state) {
    throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
  }
  return state;
}

/**
 * 既に検証した値もSDK初期化前に再確認し、Authに必要なキーを必須とする。
 */
function checkedConfiguration(configuration: MvpTestEnvironment): MvpTestEnvironment { // SDK初期化前に接続条件を再検証する関数 / ガード済み実行環境型
  const checked = requireMvpTestEnvironment( // 接続前の実行条件を検証する関数
    configuration.variables,
    configuration.checkoutDirectory,
    configuration.runId,
  );
  if (
    !checked.variables.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !checked.variables.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
  }
  return checked;
}

/**
 * SDKと署名URL取得の通信先を同じローカルoriginに固定し、redirectを追跡しない。
 */
function localFetch(state: LocalState): typeof fetch { // ローカルoriginだけへ通信する関数を返す関数 / ローカル資源の非公開所有台帳型 / 値の宣言から型を取得する型 / HTTP通信関数の型
  return (
    /**
     * 解析後もローカルoriginであることを確認してからHTTP通信を行う。
     */
    async (input, init) => { // 初期化・照合・後処理のコールバック
      try {
        const source = input instanceof Request ? input.url : String(input); // 文字列へ変換する関数
        const url = new URL(source); // 接続先を解析するコンストラクター
        if (
          url.origin !== state.configuration.supabaseOrigin ||
          url.username ||
          url.password ||
          url.hash
        ) {
          throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
        }
        return await fetch(input, { // HTTP通信を行う関数
          ...init,
          redirect: "error",
        });
      } catch {
        throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
      }
    }
  );
}

/**
 * xrefを含む小さなASCII PDFをメモリ上で作り、ファイル・環境変数を読まない。
 */
export function createMvpFixturePdf(): Uint8Array { // 小さなPDFをメモリ上で生成する関数 / バイト配列の型・コンストラクター
  const content = "BT /F1 12 Tf 20 100 Td (F12 local fixture) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 150] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`, // 文字列のバイト数を調べる関数
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = []; // 数値型
  for (const [index, object] of objects.entries()) { // 要素と添字を列挙するメソッド
    offsets.push(Buffer.byteLength(body)); // 作成前の行・IDを登録するメソッド / 文字列のバイト数を調べる関数
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body); // 文字列のバイト数を調べる関数
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`; // 固定桁数まで先頭を埋めるメソッド / 文字列へ変換する関数
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "ascii"); // 文字列・バイト列からBufferを作る関数
}

/**
 * DBのUUID・メールを先に決め、Auth・Storageに触れずに所有ハンドルを返す。
 * 各runで払い出したclubIdのprefixだけをStorageで所有する。
 */
export function planMvpLocalServicesFixture( // ローカル資源の所有ハンドルを計画する関数
  configuration: MvpTestEnvironment, // ガード済み実行環境型
  options: Omit<MvpFixtureOptions, "authUserIds"> = {}, // 指定した項目を入力から除く型 / ケース別fixture入力型
): MvpLocalServicesFixture { // 秘密を列挙しない所有ハンドル型
  try {
    const checked = checkedConfiguration(configuration); // SDK初期化前に接続条件を再検証する関数
    const database = planMvpDatabaseFixture(checked, { // DB接続前にUUIDと保存行を計画する関数
      ...options,
      authUserIds: undefined,
      features: [...(options.features ?? []), "attachments"],
    });
    const fixture = Object.freeze({ // 設定の変更を防ぐ関数
      runId: checked.runId,
      database,
    });
    const credentials = new Map<MvpFixtureUserKey, MvpFixtureCredentials>(); // キーと値を保持するMapのコンストラクター / 本人キー型 / 検証専用の認証情報型
    for (const key of Object.keys(database.users) as MvpFixtureUserKey[]) { // キーを列挙する関数 / 本人キー型
      credentials.set(key, Object.freeze({ // 値と所有台帳を登録するメソッド / 設定の変更を防ぐ関数
        email: database.users[key].email,
        password: `Mvp-Aa9!-${randomBytes(32).toString("base64url")}`, // 文字列に変換するメソッド / 検証用passwordの乱数を生成する関数
      }));
    }
    states.set(fixture, { // 値と所有台帳を登録するメソッド
      configuration: checked,
      credentials,
      pendingUsers: new Set(), // 重複しない集合のコンストラクター
      createdUsers: new Set(), // 重複しない集合のコンストラクター
      objects: new Set(), // 重複しない集合のコンストラクター
      databaseAttempted: false,
      databaseReady: false,
      bucketPending: false,
      phase: "planned", // 保存前の計画状態を記録する
    });
    return fixture;
  } catch {
    throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
  }
}

/**
 * 戻りID・メール・管理者だけが書けるrun識別を使ってAuth本人の所有を照合する。
 */
function ownsUser(fixture: MvpLocalServicesFixture, user: User, id: string): boolean { // 登録IDと管理者metadataからAuth所有を照合する関数 / 秘密を列挙しない所有ハンドル型 / Auth本人の戻り値型 / 文字列型 / 真偽値型
  const expected = Object.values(fixture.database.users).find( // 条件に合う所有資源を選ぶメソッド / 値を列挙する関数
    /**
     * 作成前に計画したメールと完全一致する本人だけを選ぶ。
     */
    (candidate) => candidate.email === user.email, // 所有するメールを照合するコールバック
  );
  return Boolean( // 条件の成立を真偽値に変換する関数
    expected &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(user.id) && // Authの戻りIDの書式を検証するメソッド
    user.id === id &&
    user.email === expected.email &&
    user.app_metadata.mvp_f12_run === fixture.runId &&
    user.app_metadata.mvp_f12_scope === fixture.database.scopeId,
  );
}

/**
 * 確認済みpasswordユーザー→DB→private bucket→PDFの順に作成する。
 * 失敗してもハンドルと残存台帳を保持するため、呼出し元は必ずfinallyでcleanupする。
 */
export async function seedMvpLocalServicesFixture( // Auth・DB・private PDFを順に作成する関数
  database: PrismaClient, // 専用DB clientの型
  fixture: MvpLocalServicesFixture, // 秘密を列挙しない所有ハンドル型
): Promise<void> { // 非同期結果の型 / 戻り値を使わない型
  const state = stateOf(fixture); // 非公開の所有台帳を取得する関数
  if (state.phase !== "planned") {
    throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
  }
  state.phase = "seeding";
  try {
    state.configuration = checkedConfiguration(state.configuration); // SDK初期化前に接続条件を再検証する関数
    state.database = database;
    const { createClient } = await import("@supabase/supabase-js"); // ガード後にSDKを遅延読込みする関数
    state.admin = createClient( // Auth・Storage管理clientを生成する関数
      state.configuration.supabaseOrigin,
      state.configuration.variables.SUPABASE_SERVICE_ROLE_KEY!, // 事前確認を前提にする非nullアサーション
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: localFetch(state), // ローカルoriginだけへ通信する関数を返す関数
        },
      },
    );
    for (const [key, credentials] of state.credentials) {
      const expected = fixture.database.users[key];
      state.pendingUsers.add(expected.id); // 所有IDを登録するメソッド
      const result = await state.admin.auth.admin.createUser({ // 確認済みpasswordユーザーを作成するメソッド
        id: expected.id,
        email: credentials.email,
        password: credentials.password,
        email_confirm: true,
        user_metadata: {
          name: `F12-${fixture.runId}-${key}`,
        },
        app_metadata: {
          mvp_f12_run: fixture.runId,
          mvp_f12_scope: fixture.database.scopeId,
        },
      });
      if (
        result.data.user &&
        ownsUser(fixture, result.data.user, result.data.user.id) // 戻りID・所有メール・管理者metadataを照合する関数
      ) {
        // IDが想定と違っても、自分が作成したことを確認した戻りIDは補償台帳に残す。
        state.pendingUsers.add(result.data.user.id); // 既知の作成結果を所有台帳へ登録するメソッド
        state.createdUsers.add(result.data.user.id); // 自分の作成結果を記録するメソッド
      }
      if (
        result.error ||
        !result.data.user ||
        result.data.user.id !== expected.id ||
        result.data.user.email !== expected.email ||
        !ownsUser(fixture, result.data.user, expected.id) || // 登録IDと管理者metadataからAuth所有を照合する関数
        !result.data.user.email_confirmed_at
      ) {
        throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
      }
    }
    state.databaseAttempted = true;
    await seedMvpDatabaseFixture(database, fixture.database); // 計画した行を一体保存する関数
    state.databaseReady = true;
    const buckets = await state.admin.storage.listBuckets({ // bucketのメタデータを取得するメソッド
      search: CLUB_ATTACHMENT_BUCKET,
      limit: 100,
    });
    if (
      buckets.error ||
      !buckets.data
    ) {
      throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
    }
    const existing = buckets.data.find( // 条件に合う所有資源を選ぶメソッド
      /**
       * 固定名以外のバケットへアクセスしない。
       */
      (bucket) => bucket.id === CLUB_ATTACHMENT_BUCKET, // 初期化・照合・後処理のコールバック
    );
    if (!existing) {
      state.bucketPending = true;
      const created = await state.admin.storage.createBucket(CLUB_ATTACHMENT_BUCKET, { // 未作成のprivate bucketを作るメソッド
        public: false,
        allowedMimeTypes: ["application/pdf"],
      });
      if (created.error) {
        throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
      }
    }
    const bucket = await state.admin.storage.getBucket(CLUB_ATTACHMENT_BUCKET); // bucketの公開設定と作成時刻を確認するメソッド
    if (
      bucket.error ||
      !bucket.data ||
      bucket.data.public !== false
    ) {
      throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
    }
    if (!existing) {
      if (!bucket.data.created_at) {
        throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
      }
      state.bucketCreatedAt = bucket.data.created_at;
    }
    const pdf = createMvpFixturePdf(); // 小さなPDFをメモリ上で生成する関数
    for (const club of ["a", "b"] as const) { // リテラル型を保持するconstアサーション
      const item = fixture.database.related[club];
      const paths = [
        `clubs/${fixture.database.clubs[club].id}/events/${item.events!.member}/${item.eventAttachmentId}.pdf`, // 事前確認を前提にする非nullアサーション
        `clubs/${fixture.database.clubs[club].id}/notices/${item.notices!.member}/${item.noticeAttachmentId}.pdf`, // 事前確認を前提にする非nullアサーション
      ];
      for (const path of paths) {
        state.objects.add(path); // 所有IDを登録するメソッド
        const uploaded = await state.admin.storage.from(CLUB_ATTACHMENT_BUCKET).upload(path, pdf, { // 所有prefixへPDFを保存するメソッド / 固定bucketのStorage操作を取得するメソッド
          contentType: "application/pdf",
          upsert: false,
        });
        if (uploaded.error) {
          throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
        }
      }
      const eventUpdated = await database.clubEventAttachment.updateMany({ // 所有する添付行のPDFサイズを更新するメソッド
        where: {
          id: item.eventAttachmentId,
          clubId: fixture.database.clubs[club].id,
        },
        data: {
          sizeBytes: pdf.byteLength,
        },
      });
      const noticeUpdated = await database.clubNoticeAttachment.updateMany({ // 所有する添付行のPDFサイズを更新するメソッド
        where: {
          id: item.noticeAttachmentId,
          clubId: fixture.database.clubs[club].id,
        },
        data: {
          sizeBytes: pdf.byteLength,
        },
      });
      if (
        eventUpdated.count !== 1 || // 条件に合う行数を取得するメソッド
        noticeUpdated.count !== 1 // 条件に合う行数を取得するメソッド
      ) {
        throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
      }
    }
    state.phase = "ready";
  } catch {
    state.phase = "failed";
    throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
  }
}

/**
 * readyなfixtureのpasswordをメモリ上で渡す。ログ・trace・storageStateに保存しない。
 */
export function getMvpFixtureCredentials( // readyなfixtureの認証情報をメモリ上で取得する関数
  fixture: MvpLocalServicesFixture, // 秘密を列挙しない所有ハンドル型
  key: MvpFixtureUserKey, // 本人キー型
): MvpFixtureCredentials { // 検証専用の認証情報型
  const state = stateOf(fixture); // 非公開の所有台帳を取得する関数
  const credentials = state.credentials.get(key); // 登録した値を取得するメソッド
  if (
    state.phase !== "ready" ||
    !credentials
  ) {
    throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
  }
  return credentials;
}

/**
 * anon keyでpassword認証し、別SSR clientがCookieから実getUserで検証できた結果だけ返す。
 */
export async function signInMvpFixtureUser( // password認証とCookieの本人検証を行う関数
  fixture: MvpLocalServicesFixture, // 秘密を列挙しない所有ハンドル型
  key: MvpFixtureUserKey, // 本人キー型
): Promise<MvpFixtureSession> { // 非同期結果の型 / 実認証で生成したCookie・header型
  try {
    const state = stateOf(fixture); // 非公開の所有台帳を取得する関数
    const credentials = getMvpFixtureCredentials(fixture, key); // readyなfixtureの認証情報をメモリ上で取得する関数
    const { createServerClient } = await import("@supabase/ssr"); // ガード後にSDKを遅延読込みする関数
    const jar = new Map<string, MvpFixtureSession["cookies"][number]>(); // キーと値を保持するMapのコンストラクター / 文字列型 / プロパティまたは配列要素を参照する型 / 実認証で生成したCookie・header型 / 数値型
    let headers: Record<string, string> = {}; // キーと値の対応型 / 文字列型
    const cookies = {
      /**
       * SDKへこの認証操作だけのCookieを渡す。
       */
      getAll() { // この認証操作のCookieをSDKへ渡すメソッド
        return Array.from(jar.values()); // 要素を配列へ変換する関数 / 値を列挙する関数
      },
      /**
       * 分割Cookieと属性・キャッシュ抑止headerをそのまま保持する。
       */
      setAll(values: MvpFixtureSession["cookies"], responseHeaders: Record<string, string>) { // SDKのCookieと応答headerを保持するメソッド / プロパティまたは配列要素を参照する型 / 実認証で生成したCookie・header型 / キーと値の対応型 / 文字列型
        for (const value of values) {
          if (
            value.options.maxAge === 0 ||
            !value.value
          ) {
            jar.delete(value.name); // 登録した値を削除するメソッド
          } else {
            jar.set(value.name, value); // 値と所有台帳を登録するメソッド
          }
        }
        headers = {
          ...headers,
          ...responseHeaders
        };
      },
    };
    const options = {
      cookies,
      global: {
        fetch: localFetch(state), // ローカルoriginだけへ通信する関数を返す関数
      },
    };
    const client = createServerClient( // Cookieを用いるSSR clientを生成する関数
      state.configuration.supabaseOrigin,
      state.configuration.variables.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // 事前確認を前提にする非nullアサーション
      options,
    );
    const login = await client.auth.signInWithPassword(credentials); // anon keyでpassword認証するメソッド
    if (
      login.error ||
      !login.data.session ||
      login.data.user?.id !== fixture.database.users[key].id ||
      jar.size === 0
    ) {
      throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
    }
    const nextRequest = createServerClient( // Cookieを用いるSSR clientを生成する関数
      state.configuration.supabaseOrigin,
      state.configuration.variables.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // 事前確認を前提にする非nullアサーション
      options,
    );
    const verified = await nextRequest.auth.getUser(); // Cookieの本人をAuthで検証するメソッド
    if (
      verified.error ||
      verified.data.user?.id !== fixture.database.users[key].id
    ) {
      throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
    }
    return {
      cookies: Array.from(jar.values()), // 要素を配列へ変換する関数 / 値を列挙する関数
      headers,
    };
  } catch {
    throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
  }
}

/**
 * 登録したprivate PDFだけを署名付きで取得し、公開URLでは取得できないことも確認する。
 * 署名URL・token・レスポンス本文は返さず、失敗原文も公開しない。
 */
export async function verifyMvpFixturePdf( // 所有PDFの署名取得と公開拒否を検証する関数
  fixture: MvpLocalServicesFixture, // 秘密を列挙しない所有ハンドル型
  path: string, // 文字列型
): Promise<void> { // 非同期結果の型 / 戻り値を使わない型
  try {
    const state = stateOf(fixture); // 非公開の所有台帳を取得する関数
    if (
      state.phase !== "ready" ||
      !state.objects.has(path) || // 登録の有無を確認するメソッド
      !state.admin
    ) {
      throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
    }
    const signed = await state.admin.storage.from(CLUB_ATTACHMENT_BUCKET).createSignedUrl(path, 60); // 所有PDFの署名付きURLを発行するメソッド / 固定bucketのStorage操作を取得するメソッド
    if (
      signed.error ||
      !signed.data?.signedUrl
    ) {
      throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
    }
    const url = new URL(signed.data.signedUrl); // 接続先を解析するコンストラクター
    if (
      url.origin !== state.configuration.supabaseOrigin ||
      url.pathname !== `/storage/v1/object/sign/${CLUB_ATTACHMENT_BUCKET}/${path}` ||
      !url.searchParams.has("token") // 登録の有無を確認するメソッド
    ) {
      throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
    }
    const response = await localFetch(state)(url); // ローカルoriginだけへ通信する関数を返す関数
    const expected = createMvpFixturePdf(); // 小さなPDFをメモリ上で生成する関数
    const actual = new Uint8Array(await response.arrayBuffer()); // バイト配列の型・コンストラクター / 応答本文をバイト列として取得するメソッド
    if (
      !response.ok ||
      actual.length !== expected.length ||
      !actual.every( // 全要素の一致を確認するメソッド
        /**
         * 署名付き取得が、保存したPDF全体と一致することを確かめる。
         */
        (value, index) => value === expected[index], // 初期化・照合・後処理のコールバック
      )
    ) {
      throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
    }
    const publicUrl = new URL( // 接続先を解析するコンストラクター
      `/storage/v1/object/public/${CLUB_ATTACHMENT_BUCKET}/${path}`,
      state.configuration.supabaseOrigin,
    );
    const denied = await localFetch(state)(publicUrl); // ローカルoriginだけへ通信する関数を返す関数
    if (![400, 401, 403, 404].includes(denied.status)) { // 許可値に含まれるか調べるメソッド
      throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
    }
  } catch {
    throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
  }
}

/**
 * 【追加】所有クラブの二種類のcontent直下だけを列挙し、新規PDFを回収台帳へ登録する。
 * 一覧取得に失敗した場合は未確認を残し、親runnerを成功扱いしない。
 */
async function discoverMvpContentObjects( // 【追加】所有prefixの新規添付を発見する関数
  state: LocalState, // 【追加】秘密を公開しない所有台帳型
  fixture: MvpLocalServicesFixture, // 【追加】同じ実行の資源ハンドル型
): Promise<void> { // 【追加】列挙完了を表す非同期結果型
  if (
    !state.admin ||
    !state.databaseReady
  ) {
    return;
  }
  const storage = state.admin.storage.from(CLUB_ATTACHMENT_BUCKET); // 【追加】固定private bucketのSDK操作を取得するメソッド
  const queue = [];
  for (const club of [fixture.database.clubs.a, fixture.database.clubs.b]) {
    for (const kind of ["events", "notices"]) {
      queue.push({ // 【追加】所有クラブの固定prefixだけを列挙開始点へ登録するメソッド
        path: `clubs/${club.id}/${kind}`,
        depth: 0,
      });
    }
  }
  for (const directory of queue) {
    for (let offset = 0; ; offset += 100) {
      if (offset >= 10000) {
        throw new Error(SERVICE_ERROR); // 【追加】列挙が終わらない場合を固定例外で拒否するコンストラクター
      }
      const result = await storage.list(directory.path, { // 【追加】固定深度の所有prefixだけをページ単位で列挙するメソッド
        limit: 100,
        offset,
        sortBy: {
          column: "name",
          order: "asc",
        },
      });
      if (result.error || !result.data) {
        throw new Error(SERVICE_ERROR); // 【追加】一覧の取得失敗を固定文で通知するコンストラクター
      }
      for (const entry of result.data) {
        const folder = directory.depth === 0 &&
          /^[0-9a-f-]{36}$/u.test(entry.name) && // 【追加】content直下のID形式を確認するメソッド
          !entry.id;
        const pdf = directory.depth === 1 &&
          /^[0-9a-f-]{36}\.pdf$/u.test(entry.name) && // 【追加】PDF名の書式を確認するメソッド
          !!entry.id;
        if (folder) {
          queue.push({ // 【追加】所有content直下だけを次の列挙先へ追加するメソッド
            path: `${directory.path}/${entry.name}`,
            depth: 1,
          });
        } else if (pdf) {
          state.objects.add(`${directory.path}/${entry.name}`); // 【追加】所有PDFの完全なpathを回収台帳へ登録するメソッド
        } else {
          throw new Error(SERVICE_ERROR); // 【追加】想定外の構造を勝手に削除せず未確認とするコンストラクター
        }
      }
      if (result.data.length < 100) {
        break;
      }
    }
  }
}

/**
 * 登録物→DB→所有確認したAuth→新規作成した空bucketの順に補償する。
 * 一件の失敗で他の後片付けを止めず、残存・未確認はrunIdと件数だけで返す。
 */
export async function cleanupMvpLocalServicesFixture( // 登録した資源だけを補償し残存件数を返す関数
  fixture: MvpLocalServicesFixture, // 秘密を列挙しない所有ハンドル型
): Promise<MvpLocalCleanupReport> { // 非同期結果の型 / 残存・未確認件数の報告型
  const state = stateOf(fixture); // 非公開の所有台帳を取得する関数
  if (
    state.phase === "seeding" ||
    state.phase === "cleaning"
  ) {
    throw new Error(SERVICE_ERROR); // 例外を生成するコンストラクター
  }
  state.phase = "cleaning";
  let undiscoveredObjects = false;
  try {
    await discoverMvpContentObjects(state, fixture); // 【追加】E2Eが保存した所有PDFを削除前に発見する関数
  } catch {
    undiscoveredObjects = true;
  }
  if (state.admin) {
    for (const path of [...state.objects]) {
      try {
        const removed = await state.admin.storage.from(CLUB_ATTACHMENT_BUCKET).remove([path]); // 指定したobjectだけを削除するメソッド / 固定bucketのStorage操作を取得するメソッド
        if (!removed.error) {
          state.objects.delete(path); // 登録した値を削除するメソッド
        }
      } catch {
        // 例外・pathを出さず、台帳を残して再試行する。
      }
    }
  }
  let databaseRemaining = false;
  if (
    state.database &&
    state.databaseAttempted
  ) {
    try {
      if (state.databaseReady) {
        await cleanupMvpDatabaseFixture(state.database, fixture.database); // 所有台帳の範囲だけを削除する関数
      } else {
        // commit応答が失われた可能性は、既存helperの成功台帳と混同しない。
        // 残存確認ができなければDB・Authを残し、専用環境の廃棄時に回収する。
        const clubs = await state.database.club.count({ // 条件に合う行数を取得するメソッド
          where: {
            id: {
              in: [fixture.database.clubs.a.id, fixture.database.clubs.b.id],
            },
          },
        });
        const users = await state.database.appUser.count({ // 条件に合う行数を取得するメソッド
          where: {
            id: {
              in: Object.values(fixture.database.users).map( // 各要素を保存・照合用の値へ写すメソッド / 値を列挙する関数
                /**
                 * 事前登録した本人IDだけで、作成結果不明の残存を確認する。
                 */
                (user) => user.id, // 初期化・照合・後処理のコールバック
              ),
            },
          },
        });
        const admin = await state.database.platformAdmin.count({ // 条件に合う行数を取得するメソッド
          where: {
            id: fixture.database.users.platformAdmin.id,
          },
        });
        databaseRemaining = clubs + users + admin > 0;
      }
    } catch {
      databaseRemaining = true;
    }
  }
  if (
    state.admin &&
    !databaseRemaining
  ) {
    for (const id of [...state.pendingUsers]) {
      try {
        const found = await state.admin.auth.admin.getUserById(id); // 登録したAuth IDだけを直接照会するメソッド
        if (found.error) {
          if (
            found.error.status === 404 &&
            found.error.code === "user_not_found"
          ) {
            state.pendingUsers.delete(id); // 登録した値を削除するメソッド
          }
          continue;
        }
        if (
          !found.data.user ||
          !ownsUser(fixture, found.data.user, id) // 登録IDと管理者metadataからAuth所有を照合する関数
        ) {
          if (!state.createdUsers.has(id)) { // 登録の有無を確認するメソッド
            state.pendingUsers.delete(id); // 登録した値を削除するメソッド
          }
          continue;
        }
        const removed = await state.admin.auth.admin.deleteUser(id); // 所有確認したAuth本人を削除するメソッド
        if (!removed.error) {
          state.pendingUsers.delete(id); // 登録した値を削除するメソッド
        }
      } catch {
        // ID・メール・SDK例外を出さず、台帳を残す。
      }
    }
  }
  if (
    state.admin &&
    state.bucketPending &&
    state.objects.size === 0 &&
    !undiscoveredObjects &&
    state.bucketCreatedAt
  ) {
    try {
      const current = await state.admin.storage.getBucket(CLUB_ATTACHMENT_BUCKET); // bucketの公開設定と作成時刻を確認するメソッド
      if (
        !current.error &&
        current.data?.public === false &&
        current.data.created_at === state.bucketCreatedAt
      ) {
        // emptyBucketは使わない。他runのobjectがあれば削除が失敗し、bucketを残す。
        const removed = await state.admin.storage.deleteBucket(CLUB_ATTACHMENT_BUCKET); // 所有する空bucketだけを削除するメソッド
        if (!removed.error) {
          state.bucketPending = false;
        }
      }
    } catch {
      // bucket名・例外原文を出さず、未確認件数だけ返す。
    }
  }
  const report = Object.freeze({ // 設定の変更を防ぐ関数
    runId: fixture.runId,
    remaining: Object.freeze({ // 設定の変更を防ぐ関数
      authUsers: state.pendingUsers.size,
      storageObjects: state.objects.size + (undiscoveredObjects ? 1 : 0), // 【追加】列挙できない場合も未回収として報告する
      buckets: state.bucketPending ? 1 : 0,
      database: databaseRemaining,
    }),
  });
  state.phase =
    report.remaining.authUsers === 0 &&
    report.remaining.storageObjects === 0 &&
    report.remaining.buckets === 0 &&
    !report.remaining.database
      ? "cleaned"
      : "failed";
  if (state.phase === "cleaned") {
    state.credentials.clear(); // 保持していた認証情報を消去するメソッド
  }
  return report;
}
