// scripts/initialize-production-club.ts
// 本番DBへクラブの初期データを、安全に（dry-run既定・作成のみ・既存差分は拒否）登録する。
// 対象：Club / AppUser / ClubMembership(OWNER) / PlatformAdmin / ClubEmailSetting。
// 既存HPのテーブル、ClubLineSetting、プラン切替、WEBSITE_ADMIN_USER_IDSには触れない。

import { createHash } from "node:crypto"; // 接続先の指紋を作るSHA-256ハッシュ関数
import { lstatSync, readFileSync } from "node:fs"; // 入力ファイルの種類・権限確認と読込の関数
import { pathToFileURL } from "node:url"; // 直接実行かどうかの判定に使うURL変換関数
import { parseArgs } from "node:util"; // コマンド引数を解析する標準関数

import type { Prisma, PrismaClient } from "@prisma/client"; // Prismaの型（トランザクション・クライアント）
import { createClient } from "@supabase/supabase-js"; // Supabase Authを照会するクライアント生成関数
import { z } from "zod"; // 入力ファイルを検証するスキーマ関数群

import { normalizeEmail } from "../domain/shared/email"; // 【追加】メールアドレスを小文字・半角へ正規化する関数

/** 【追加】作成する初期データの固定値（プランは公開前のSTARTER。切替はG8の範囲）。 */
const EXPECTED_PLAN_TYPE = "STARTER"; // クラブのプランの期待値
/** 【追加】クラブの基準タイムゾーンの期待値。 */
const EXPECTED_TIMEZONE = "Asia/Tokyo"; // クラブのタイムゾーンの期待値
/** 【追加】クラブURLの識別子（スラッグ）の許可形式。seedや他のCLIと同じ。 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // スラッグの正規表現
/** 【追加】ローカルとみなすホスト名の一覧。 */
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"]; // ループバックのホスト名

/** 【追加】実行する環境の種別。production=本番、local=使い捨てのローカルDB（テスト用）。 */
export type InitializerTarget = "production" | "local";

/** 【追加】実行モード。dry-run=書込みなしの確認、apply=作成。 */
export type InitializerMode = "dry-run" | "apply";

/** 【追加】コマンド引数を整理した結果の型。実値（IDやメール）は含めない。 */
export type InitializerOptions = {
  clubName: string; // クラブの表示名
  clubSlug: string; // クラブURLの識別子
  target: InitializerTarget; // 実行する環境の種別
  mode: InitializerMode; // dry-runかapplyか
  inputFile: string; // OWNERとPlatformAdminを書いた入力ファイルのパス
  expectedFingerprint: string | undefined; // applyで確認する接続先の指紋（productionのapply必須）
};

/** 【追加】人物（OWNER・PlatformAdmin）の入力。Supabase Authのuser.idとemailを正とする。 */
export type InitializerPerson = {
  authUserId: string; // Supabase Authのuser.id
  email: string; // 正規化済みのメールアドレス
  name: string; // 表示名
};

/** 【追加】入力ファイルの内容。 */
export type InitializerInput = {
  owner: InitializerPerson; // クラブ代表者（OWNER）
  platformAdmin: InitializerPerson; // 開発者（PlatformAdmin / DEVELOPER）
};

/** 【追加】計画の対象テーブル名。 */
export type PlanTable =
  | "Club"
  | "AppUser"
  | "ClubMembership"
  | "PlatformAdmin"
  | "ClubEmailSetting";

/** 【追加】テーブルごとの処理。CREATE=作成予定、UNCHANGED=期待値と完全一致、CONFLICT=差分あり。 */
export type PlanAction = "CREATE" | "UNCHANGED" | "CONFLICT";

/** 【追加】差分の理由コード。個人情報・値は含めない固定の文字列。 */
export type ConflictReason =
  | "FIELD_MISMATCH" // 既存の行が期待値と違う
  | "EMAIL_USED_BY_OTHER_ID"; // 同じメールが別のIDで使われている

/** 【追加】1テーブルぶんの計画。 */
export type PlanEntry = {
  table: PlanTable; // 対象テーブル
  action: PlanAction; // 処理の種類
  reason?: ConflictReason; // CONFLICTのときだけ付く理由
};

/** 【追加】Supabase Authのユーザーを照会する関数の型。存在しなければnullを返す。 */
export type AuthUserLookup = (
  authUserId: string,
) => Promise<{ email: string | null } | null>;

/** 【追加】計画の作成に必要なDBの読取り部分。PrismaClientとトランザクションの両方を受ける。 */
export type PlanReader = Pick<
  Prisma.TransactionClient,
  "club" | "appUser" | "clubMembership" | "platformAdmin" | "clubEmailSetting"
>;

/** 【追加】利用者に表示してよい安全なメッセージだけを持つエラー。 */
export class SafeInitializerError extends Error {
  override readonly name = "SafeInitializerError"; // エラーの種類名
}

/** 【追加】既存データとの差分で適用を中止したことを表すエラー。計画を保持する。 */
export class InitializerConflictError extends SafeInitializerError {
  /** 【追加】差分のある計画を受け取り、利用者向けの固定メッセージで初期化する。 */
  constructor(readonly entries: readonly PlanEntry[]) {
    super("既存データが期待値と一致しません。何も書き込んでいません。"); // 親エラーのコンストラクター
  }
}

/**
 * 【追加】コマンド引数を検証して整理する。
 * @param args process.argvのうち、コマンド名を除いた引数。
 * @returns 検証済みの実行オプション。形式が正しくなければSafeInitializerError。
 */
export function parseInitializerOptions(
  args: readonly string[],
): InitializerOptions {
  let values: Record<string, string | boolean | undefined>; // 解析結果の型

  try {
    values = parseArgs({ // 引数を解析する標準関数
      args: [...args], // 読取り専用配列を通常配列へ複製する
      options: {
        "club-name": { type: "string" },
        "club-slug": { type: "string" },
        target: { type: "string" },
        "input-file": { type: "string" },
        "expect-fingerprint": { type: "string" },
        "dry-run": { type: "boolean" },
        apply: { type: "boolean" },
      },
      allowPositionals: false,
      strict: true,
    }).values;
  } catch {
    throw new SafeInitializerError("コマンド引数の形式が正しくありません。"); // 安全なエラー
  }

  const clubName = typeof values["club-name"] === "string" ? values["club-name"].trim() : "";
  const clubSlug = typeof values["club-slug"] === "string" ? values["club-slug"].trim() : "";
  const inputFile = typeof values["input-file"] === "string" ? values["input-file"].trim() : "";
  const expected =
    typeof values["expect-fingerprint"] === "string"
      ? values["expect-fingerprint"].trim()
      : undefined;

  if (!clubName || clubName.length > 100) {
    throw new SafeInitializerError("--club-nameは1〜100文字で指定してください。");
  }

  if (!SLUG_PATTERN.test(clubSlug) || clubSlug.length > 64) {
    throw new SafeInitializerError("--club-slugの形式が正しくありません。");
  }

  if (values.target !== "production" && values.target !== "local") {
    throw new SafeInitializerError("--targetはproductionかlocalを指定してください。");
  }

  if (!inputFile) {
    throw new SafeInitializerError("--input-fileを指定してください。");
  }

  const hasDryRun = values["dry-run"] === true;
  const hasApply = values.apply === true;

  if (hasDryRun === hasApply) {
    throw new SafeInitializerError("--dry-runか--applyのどちらか一つを指定してください。");
  }

  if (values.target === "production" && hasApply && !expected) {
    throw new SafeInitializerError(
      "本番のapplyには、dry-runで表示された--expect-fingerprintが必要です。",
    );
  }

  return {
    clubName,
    clubSlug,
    target: values.target,
    mode: hasApply ? "apply" : "dry-run",
    inputFile,
    expectedFingerprint: expected,
  };
}

/** 【追加】人物の入力ファイルの形式を検証するスキーマ。 */
const personSchema = z // オブジェクト形式を定義するスキーマ関数
  .object({
    authUserId: z.string().uuid(), // UUID形式の文字列
    email: z.string().email(), // メール形式の文字列
    name: z.string().trim().min(1).max(100), // 1〜100文字の表示名
  })
  .strict(); // 未知の項目を拒否する

/** 【追加】入力ファイル全体の形式を検証するスキーマ。 */
const inputSchema = z.object({ owner: personSchema, platformAdmin: personSchema }).strict(); // 入力全体のスキーマ

/**
 * 【追加】入力ファイルを読み、形式・権限を検証する。内容はエラーにも出力にも含めない。
 * @param path 入力ファイルのパス。通常ファイル・シンボリックリンクでない・権限600であること。
 * @returns メールを正規化した入力。
 */
export function readInitializerInput(path: string): InitializerInput {
  let stats: ReturnType<typeof lstatSync>; // ファイル情報の型

  try {
    stats = lstatSync(path); // シンボリックリンクをたどらずにファイル情報を取得する関数
  } catch {
    throw new SafeInitializerError("入力ファイルを読み込めません。");
  }

  if (!stats.isFile()) {
    throw new SafeInitializerError("入力ファイルは通常のファイルを指定してください。");
  }

  if ((stats.mode & 0o077) !== 0) {
    throw new SafeInitializerError("入力ファイルの権限を600にしてください。");
  }

  let parsed: z.infer<typeof inputSchema>; // 検証済みの入力の型

  try {
    parsed = inputSchema.parse(JSON.parse(readFileSync(path, "utf8"))); // 読込 / JSON解析 / 検証
  } catch {
    throw new SafeInitializerError("入力ファイルの形式が正しくありません。");
  }

  const toPerson = (person: z.infer<typeof personSchema>): InitializerPerson => ({ // 人物の正規化関数
    authUserId: person.authUserId.toLowerCase(),
    email: normalizeEmail(person.email), // メールの正規化関数
    name: person.name,
  });

  const input = { owner: toPerson(parsed.owner), platformAdmin: toPerson(parsed.platformAdmin) };

  if (
    input.owner.authUserId === input.platformAdmin.authUserId &&
    input.owner.email !== input.platformAdmin.email
  ) {
    throw new SafeInitializerError("同じuser.idに別のメールアドレスが指定されています。");
  }

  return input;
}

/**
 * 【追加】接続先の指紋を作る。ホスト名そのものは出さず、取り違えの検出にだけ使う。
 * @param databaseUrl DATABASE_URLの値。
 * @returns ホスト・ポート・DB名のSHA-256の先頭12文字。
 */
export function computeTargetFingerprint(databaseUrl: string): string {
  let url: URL; // 解析したURLの型

  try {
    url = new URL(databaseUrl); // URL解析コンストラクター
  } catch {
    throw new SafeInitializerError("DATABASE_URLの形式が正しくありません。");
  }

  return createHash("sha256") // ハッシュ生成関数
    .update(`${url.hostname}:${url.port || "5432"}${url.pathname}`) // ハッシュへ接続先を渡すメソッド
    .digest("hex") // 16進文字列へ変換するメソッド
    .slice(0, 12); // 先頭12文字を取り出すメソッド
}

/**
 * 【追加】--targetと、DB・Supabaseの接続先が合っているか確認する。DBへ接続する前に呼ぶ。
 * @param environment DATABASE_URLとNEXT_PUBLIC_SUPABASE_URLの値。
 * @param target productionまたはlocal。
 */
export function assertTargetEnvironment(
  environment: { databaseUrl: string; supabaseUrl: string },
  target: InitializerTarget,
): void {
  let databaseUrl: URL; // DB接続先URLの型
  let supabaseUrl: URL; // Supabase URLの型

  try {
    databaseUrl = new URL(environment.databaseUrl); // URL解析コンストラクター
    supabaseUrl = new URL(environment.supabaseUrl); // URL解析コンストラクター
  } catch {
    throw new SafeInitializerError("接続先の形式が正しくありません。");
  }

  const databaseIsLocal = LOOPBACK_HOSTS.includes(databaseUrl.hostname); // DBがローカルか
  const supabaseIsLocal = LOOPBACK_HOSTS.includes(supabaseUrl.hostname); // Supabaseがローカルか

  if (target === "local" && !(databaseIsLocal && supabaseIsLocal)) {
    throw new SafeInitializerError("--target localですが、接続先がローカルではありません。");
  }

  if (target === "production") {
    if (databaseIsLocal || supabaseIsLocal) {
      throw new SafeInitializerError("--target productionですが、接続先がローカルです。");
    }

    if ((databaseUrl.port || "5432") !== "5432") {
      throw new SafeInitializerError("本番の接続は、直接接続（ポート5432）を使ってください。");
    }
  }
}

/** 【追加】既存の行が、期待する項目と完全に一致しているかを判定して計画の1行にする。 */
function decide(table: PlanTable, existing: boolean, matches: boolean): PlanEntry {
  if (!existing) {
    return { table, action: "CREATE" };
  }

  return matches
    ? { table, action: "UNCHANGED" }
    : { table, action: "CONFLICT", reason: "FIELD_MISMATCH" };
}

/**
 * 【追加】DBを読み取り、各テーブルの作成・一致・差分を判定する。書込みはしない。
 * @param db PrismaClientまたはトランザクション。
 * @param options 実行オプション（クラブ名・スラッグ）。
 * @param input OWNERとPlatformAdminの入力。
 * @returns テーブルごとの計画。
 */
export async function buildInitializationPlan(
  db: PlanReader,
  options: Pick<InitializerOptions, "clubName" | "clubSlug">,
  input: InitializerInput,
): Promise<PlanEntry[]> {
  const entries: PlanEntry[] = []; // 計画の一覧

  const club = await db.club.findUnique({ // スラッグでクラブを取得するメソッド
    where: { slug: options.clubSlug },
    select: { id: true, name: true, planType: true, timezone: true },
  });

  entries.push(
    decide(
      "Club",
      club !== null,
      club?.name === options.clubName &&
        club.planType === EXPECTED_PLAN_TYPE &&
        club.timezone === EXPECTED_TIMEZONE,
    ),
  );

  const ownerById = await db.appUser.findUnique({ // IDでAppUserを取得するメソッド
    where: { id: input.owner.authUserId },
    select: { id: true, email: true, name: true },
  });
  const ownerByEmail = await db.appUser.findUnique({ // メールでAppUserを取得するメソッド
    where: { email: input.owner.email },
    select: { id: true },
  });

  if (ownerByEmail && ownerByEmail.id !== input.owner.authUserId) {
    entries.push({ table: "AppUser", action: "CONFLICT", reason: "EMAIL_USED_BY_OTHER_ID" });
  } else {
    entries.push(
      decide(
        "AppUser",
        ownerById !== null,
        ownerById?.email !== null &&
          ownerById?.email !== undefined &&
          normalizeEmail(ownerById.email) === input.owner.email &&
          ownerById.name === input.owner.name,
      ),
    );
  }

  const membership =
    club && ownerById
      ? await db.clubMembership.findUnique({ // クラブと利用者でMembershipを取得するメソッド
          where: { clubId_userId: { clubId: club.id, userId: ownerById.id } },
          select: { role: true, status: true, canManageWebsite: true },
        })
      : null;

  entries.push(
    decide(
      "ClubMembership",
      membership !== null,
      membership?.role === "OWNER" &&
        membership.status === "ACTIVE" &&
        membership.canManageWebsite === true,
    ),
  );

  const adminById = await db.platformAdmin.findUnique({ // IDでPlatformAdminを取得するメソッド
    where: { id: input.platformAdmin.authUserId },
    select: { email: true, name: true, role: true, isActive: true },
  });
  const adminByEmail = await db.platformAdmin.findUnique({ // メールでPlatformAdminを取得するメソッド
    where: { email: input.platformAdmin.email },
    select: { id: true },
  });

  if (adminByEmail && adminByEmail.id !== input.platformAdmin.authUserId) {
    entries.push({
      table: "PlatformAdmin",
      action: "CONFLICT",
      reason: "EMAIL_USED_BY_OTHER_ID",
    });
  } else {
    entries.push(
      decide(
        "PlatformAdmin",
        adminById !== null,
        adminById?.email === input.platformAdmin.email &&
          adminById.name === input.platformAdmin.name &&
          adminById.role === "DEVELOPER" &&
          adminById.isActive === true,
      ),
    );
  }

  const emailSetting = club
    ? await db.clubEmailSetting.findUnique({ // クラブのメール設定を取得するメソッド
        where: { clubId: club.id },
        select: {
          fromName: true,
          notificationEmail: true,
          replyToEmail: true,
          isEnabled: true,
        },
      })
    : null;

  entries.push(
    decide(
      "ClubEmailSetting",
      emailSetting !== null,
      emailSetting?.fromName === options.clubName &&
        emailSetting.notificationEmail === null &&
        emailSetting.replyToEmail === null &&
        emailSetting.isEnabled === true,
    ),
  );

  return entries;
}

/**
 * 【追加】Supabase Authで、user.idの実在とメールの一致を確認する。読取りのみ。
 * @param lookup Authを照会する関数。
 * @param input OWNERとPlatformAdminの入力。
 */
export async function verifyAuthUsers(
  lookup: AuthUserLookup,
  input: InitializerInput,
): Promise<void> {
  for (const person of [input.owner, input.platformAdmin]) {
    let found: Awaited<ReturnType<AuthUserLookup>>; // 照会結果の型

    try {
      found = await lookup(person.authUserId); // Auth照会関数
    } catch {
      throw new SafeInitializerError("Authのユーザーを確認できませんでした。");
    }

    if (!found || !found.email || normalizeEmail(found.email) !== person.email) {
      throw new SafeInitializerError("Authのuser.idとメールアドレスが一致しません。");
    }
  }
}

/**
 * 【追加】計画に差分があるかを返す。
 * @param entries テーブルごとの計画。
 */
export function hasConflict(entries: readonly PlanEntry[]): boolean {
  return entries.some((entry) => entry.action === "CONFLICT"); // 差分のある行を探すメソッド
}

/**
 * 【追加】計画を作成する。トランザクション内で照合をやり直し、差分があれば何も書かずに中止する。
 * @param db PrismaClient。
 * @param options 実行オプション。
 * @param input OWNERとPlatformAdminの入力。
 * @returns 実施した計画（CREATEは作成済み）。
 */
export async function applyInitialization(
  db: PrismaClient,
  options: Pick<InitializerOptions, "clubName" | "clubSlug">,
  input: InitializerInput,
): Promise<PlanEntry[]> {
  return db.$transaction( // 全作成を一つのトランザクションにするメソッド
    async (tx) => { // トランザクション内の処理（コールバック）
      const entries = await buildInitializationPlan(tx, options, input); // 計画の再作成関数

      if (hasConflict(entries)) {
        throw new InitializerConflictError(entries); // 差分ありのエラー
      }

      const creates = new Set( // 作成対象のテーブル名の集合
        entries.filter((entry) => entry.action === "CREATE").map((entry) => entry.table),
      );

      if (creates.has("Club")) {
        await tx.club.create({ // クラブを作成するメソッド
          data: {
            name: options.clubName,
            slug: options.clubSlug,
            planType: EXPECTED_PLAN_TYPE,
            timezone: EXPECTED_TIMEZONE,
          },
        });
      }

      const club = await tx.club.findUniqueOrThrow({ // 作成または既存のクラブのIDを取得するメソッド
        where: { slug: options.clubSlug },
        select: { id: true },
      });

      if (creates.has("AppUser")) {
        await tx.appUser.create({ // AppUserを作成するメソッド
          data: {
            id: input.owner.authUserId,
            email: input.owner.email,
            name: input.owner.name,
          },
        });
      }

      if (creates.has("ClubMembership")) {
        await tx.clubMembership.create({ // OWNERのMembershipを作成するメソッド
          data: {
            clubId: club.id,
            userId: input.owner.authUserId,
            role: "OWNER",
            status: "ACTIVE",
            canManageWebsite: true,
          },
        });
      }

      if (creates.has("PlatformAdmin")) {
        await tx.platformAdmin.create({ // PlatformAdminを作成するメソッド
          data: {
            id: input.platformAdmin.authUserId,
            email: input.platformAdmin.email,
            name: input.platformAdmin.name,
            role: "DEVELOPER",
            isActive: true,
          },
        });
      }

      if (creates.has("ClubEmailSetting")) {
        await tx.clubEmailSetting.create({ // メール設定を作成するメソッド
          data: {
            clubId: club.id,
            fromName: options.clubName,
            notificationEmail: null,
            replyToEmail: null,
            isEnabled: true,
          },
        });
      }

      return entries;
    },
    { isolationLevel: "Serializable" }, // 同時実行の競合を防ぐ分離レベル
  );
}

/**
 * 【追加】計画を、個人情報・接続先を含まない行に整形する。
 * @param entries テーブルごとの計画。
 * @returns 表示用の行。
 */
export function formatPlan(entries: readonly PlanEntry[]): string[] {
  return entries.map((entry) => // 計画の各行を文字列へ変換するメソッド
    entry.reason
      ? `${entry.table}: ${entry.action}（${entry.reason}）`
      : `${entry.table}: ${entry.action}`,
  );
}

/** 【追加】環境変数を必須で読む。値はエラーに含めない。 */
function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim(); // 環境変数の値

  if (!value) {
    throw new SafeInitializerError(`${name}が設定されていません。`);
  }

  return value;
}

/** 【追加】コマンドの本体。ガード→入力→Auth照合→dry-runまたはapplyの順に実行する。 */
async function main(): Promise<void> {
  const options = parseInitializerOptions(process.argv.slice(2)); // 引数解析関数
  const input = readInitializerInput(options.inputFile); // 入力ファイル読込関数

  const databaseUrl = requireEnvironment("DATABASE_URL"); // DB接続先
  const supabaseUrl = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL"); // Supabase URL
  const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"); // Service Roleキー

  assertTargetEnvironment({ databaseUrl, supabaseUrl }, options.target); // 接続先ガード関数

  const fingerprint = computeTargetFingerprint(databaseUrl); // 接続先の指紋

  if (
    options.mode === "apply" &&
    options.target === "production" &&
    options.expectedFingerprint !== fingerprint
  ) {
    throw new SafeInitializerError("接続先の指紋が一致しません。dry-runの結果を確認してください。");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { // Supabase管理クライアント生成関数
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const lookup: AuthUserLookup = async (authUserId) => { // Auth照会関数（読取りのみ）
    const { data, error } = await supabase.auth.admin.getUserById(authUserId); // ユーザー取得メソッド

    if (error || !data.user) {
      return null;
    }

    return { email: data.user.email ?? null };
  };

  await verifyAuthUsers(lookup, input); // Auth照合関数

  const { prisma } = await import("../src/infrastructure/prisma/client"); // 接続先確認後にだけ読み込むPrismaClient

  try {
    const entries =
      options.mode === "apply"
        ? await applyInitialization(prisma, options, input) // 作成関数
        : await buildInitializationPlan(prisma, options, input); // 計画作成関数（書込みなし）

    console.log(`モード: ${options.mode} / 環境: ${options.target}`);
    console.log(`接続先の指紋: ${fingerprint}`);
    console.log(`クラブ: ${options.clubName} (${options.clubSlug})`);

    for (const line of formatPlan(entries)) { // 整形関数
      console.log(line);
    }

    if (hasConflict(entries)) { // 差分判定関数
      console.error("エラー: 既存データが期待値と一致しません。何も書き込んでいません。");
      process.exitCode = 1;
    } else if (options.mode === "dry-run") {
      console.log("DRY-RUN：DBへは何も書き込んでいません。");
    }
  } finally {
    await prisma.$disconnect(); // DB切断メソッド
  }
}

/** 【追加】エラーを、接続先・入力値・生のエラーを出さずに表示して終了コード1にする。 */
function reportFailure(error: unknown): void {
  if (error instanceof InitializerConflictError) {
    for (const line of formatPlan(error.entries)) { // 整形関数
      console.error(line);
    }

    console.error(`エラー: ${error.message}`);
  } else if (error instanceof SafeInitializerError) {
    console.error(`エラー: ${error.message}`);
  } else {
    // Prismaの生エラーには接続先・入力値が含まれ得るため、出力しない。
    console.error("エラー: 初期化に失敗しました。接続先と入力を確認してください。");
  }

  process.exitCode = 1;
}

/** 【追加】ターミナルから直接実行されたときだけ、本体を開始する。 */
const directlyExecuted = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href, // URL変換関数
);

if (directlyExecuted) {
  main().catch(reportFailure); // 失敗時の表示関数
}
