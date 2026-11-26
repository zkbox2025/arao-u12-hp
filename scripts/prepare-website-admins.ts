// scripts/prepare-website-admins.ts
// HP管理権限のDB化の事前整備：既存のAppUserに、ARAOの所属(ACTIVE・canManageWebsite=true)を作成する。
// dry-run既定・作成のみ・既存の差分は拒否・1トランザクション・再実行可能。
// 作成しないもの：AppUser、Auth、PlatformAdmin、HPのテーブル、Storage、WEBSITE_ADMIN_USER_IDS。
// 更新・削除は一切しない。出力には、ID・メール・名前を含めない(入力の順番号だけで示す)。

import { lstatSync, readFileSync } from "node:fs"; // 入力ファイルの種類・権限の確認と読込を行う標準関数
import { pathToFileURL } from "node:url"; // 直接実行かどうかの判定に使うURL変換関数
import { parseArgs } from "node:util"; // コマンド引数を解析する標準関数

import type { Prisma, PrismaClient } from "@prisma/client"; // Prismaの型(トランザクション・クライアント)
import { createClient } from "@supabase/supabase-js"; // Supabase Authを照会するクライアント生成関数
import { z } from "zod"; // 入力ファイルを検証するスキーマ関数群

import { normalizeEmail } from "../domain/shared/email"; // メールアドレスを小文字・半角へ正規化する関数
import {
  assertTargetEnvironment, // --targetと接続先の整合を確認する関数
  computeTargetFingerprint, // 接続先の指紋を作る関数
  SafeInitializerError, // 利用者に表示してよいメッセージだけを持つエラークラス
  type AuthUserLookup, // Authを照会する関数の型
  type InitializerMode, // 実行モード(dry-run・apply)の型
  type InitializerTarget, // 実行環境(production・local)の型
  type PlanAction, // 計画の処理の種類(CREATE・UNCHANGED・CONFLICT)の型
} from "./initialize-production-club";

/** クラブURLの識別子(スラッグ)の許可形式。 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // スラッグの正規表現

/** 1回の実行で扱える人数の上限(誤って大量に作らないための制限)。 */
const MAX_MEMBERS = 20; // 人数の上限

/** HP管理者に付けられる所属の役割。OWNERは、この作業では作らない。 */
export type WebsiteAdminRole = "COACH" | "OFFICER";

/** コマンド引数を整理した結果の型。実値(IDやメール)は含めない。 */
export type PreparationOptions = {
  clubSlug: string; // 対象クラブのURL識別子
  target: InitializerTarget; // 実行する環境の種別
  mode: InitializerMode; // dry-runかapplyか
  inputFile: string; // 対象の人物を書いた入力ファイルのパス
  expectedFingerprint: string | undefined; // applyで確認する接続先の指紋(productionのapply必須)
};

/** 所属を作る対象の人物。Supabase Authのuser.idとemailを正とする。 */
export type WebsiteAdminMember = {
  authUserId: string; // Supabase Authのuser.id(小文字)
  email: string; // 正規化済みのメールアドレス
  role: WebsiteAdminRole; // 作成する所属の役割
};

/** 差分の理由コード。個人情報・値は含めない固定の文字列。 */
export type PreparationReason =
  | "CLUB_MISSING" // 対象クラブがない
  | "APP_USER_MISSING" // 同じIDのAppUserがない(招待で整備する対象)
  | "EMAIL_MISMATCH" // AppUserのメールが、入力と一致しない
  | "MEMBERSHIP_MISMATCH"; // 既存の所属が、期待する内容(役割・ACTIVE・canManageWebsite=true)と違う

/** 1人ぶんの計画。個人を特定する値の代わりに、入力ファイルの順番号(1から)を持つ。 */
export type PreparationEntry = {
  number: number; // 入力ファイルの順番号(1から)
  action: PlanAction; // 処理の種類
  reason?: PreparationReason; // CONFLICTのときだけ付く理由
};

/** 計画の作成に必要なDBの読取り部分。PrismaClientとトランザクションの両方を受ける。 */
export type PreparationReader = Pick<
  Prisma.TransactionClient,
  "club" | "appUser" | "clubMembership"
>;

/** 既存データとの差分で適用を中止したことを表すエラー。計画を保持する。 */
export class PreparationConflictError extends SafeInitializerError {
  /** 差分のある計画を受け取り、固定メッセージで初期化する。 */
  constructor(readonly entries: readonly PreparationEntry[]) {
    super("既存データが期待値と一致しません。何も書き込んでいません。"); // 親エラーのコンストラクター
  }
}

/**
 * コマンド引数を検証して整理する。
 * @param args process.argvのうち、コマンド名を除いた引数。
 * @returns 検証済みの実行オプション。形式が正しくなければSafeInitializerError。
 */
export function parsePreparationOptions(args: readonly string[]): PreparationOptions {
  let values: Record<string, string | boolean | undefined>; // 解析結果の型

  try {
    values = parseArgs({ // 引数を解析する標準関数
      args: [...args], // 読取り専用配列を通常配列へ複製する
      options: {
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

  const clubSlug = typeof values["club-slug"] === "string" ? values["club-slug"].trim() : "";
  const inputFile = typeof values["input-file"] === "string" ? values["input-file"].trim() : "";
  const expected =
    typeof values["expect-fingerprint"] === "string"
      ? values["expect-fingerprint"].trim()
      : undefined;

  if (!SLUG_PATTERN.test(clubSlug) || clubSlug.length > 64) {
    throw new SafeInitializerError("--club-slugの形式が正しくありません。");
  }

  if (values.target !== "production" && values.target !== "local") {
    throw new SafeInitializerError("--targetはproductionかlocalを指定してください。");
  }

  if (!inputFile) {
    throw new SafeInitializerError("--input-fileを指定してください。");
  }

  const hasDryRun = values["dry-run"] === true; // dry-run指定の有無
  const hasApply = values.apply === true; // apply指定の有無

  if (hasDryRun === hasApply) {
    throw new SafeInitializerError("--dry-runか--applyのどちらか一つを指定してください。");
  }

  if (values.target === "production" && hasApply && !expected) {
    throw new SafeInitializerError(
      "本番のapplyには、dry-runで表示された--expect-fingerprintが必要です。",
    );
  }

  return {
    clubSlug,
    target: values.target,
    mode: hasApply ? "apply" : "dry-run",
    inputFile,
    expectedFingerprint: expected,
  };
}

/** 人物の入力ファイルの形式を検証するスキーマ(未知の項目を拒否する)。 */
const memberSchema = z // オブジェクト形式を定義するスキーマ関数
  .object({
    authUserId: z.string().uuid(), // UUID形式の文字列
    email: z.string().email(), // メール形式の文字列
    role: z.enum(["COACH", "OFFICER"]), // OWNERは許可しない
  })
  .strict(); // 未知の項目を拒否する

/** 入力ファイル全体の形式を検証するスキーマ。 */
const inputSchema = z // オブジェクト形式を定義するスキーマ関数
  .object({ members: z.array(memberSchema).min(1).max(MAX_MEMBERS) }) // 1〜上限人数の配列
  .strict(); // 未知の項目を拒否する

/**
 * 入力ファイルを読み、形式・権限・重複を検証する。内容はエラーにも出力にも含めない。
 * @param path 入力ファイルのパス。通常ファイル・シンボリックリンクでない・権限600であること。
 * @returns IDとメールを正規化した人物の配列(入力の順番を保つ)。
 */
export function readPreparationInput(path: string): WebsiteAdminMember[] {
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

  const members = parsed.members.map( // 人物を正規化する配列メソッド
    /** 1人ぶんの入力を、IDを小文字・メールを正規化した形へ変換するコールバック。 */
    (member): WebsiteAdminMember => ({
      authUserId: member.authUserId.toLowerCase(),
      email: normalizeEmail(member.email), // メールの正規化関数
      role: member.role,
    }),
  );

  const ids = new Set(members.map(/** IDを取り出すコールバック。 */ (member) => member.authUserId)); // IDの重複検査用集合
  const emails = new Set(members.map(/** メールを取り出すコールバック。 */ (member) => member.email)); // メールの重複検査用集合

  if (ids.size !== members.length || emails.size !== members.length) {
    throw new SafeInitializerError("入力ファイルに、同じuser.idまたはメールが重複しています。");
  }

  return members;
}

/**
 * DBを読み取り、1人ずつ、作成・一致・差分を判定する。書込みはしない。
 * @param db PrismaClientまたはトランザクション。
 * @param clubSlug 対象クラブのURL識別子。
 * @param members 入力の人物(順番号は、この配列の順)。
 * @returns 入力と同じ順番の計画。
 */
export async function buildPreparationPlan(
  db: PreparationReader,
  clubSlug: string,
  members: readonly WebsiteAdminMember[],
): Promise<PreparationEntry[]> {
  const club = await db.club.findUnique({ // クラブをURL識別子で1件取得するメソッド
    where: { slug: clubSlug },
    select: { id: true },
  });
  const entries: PreparationEntry[] = []; // 計画の配列

  for (const [index, member] of members.entries()) { // 人物と順番を取り出す配列メソッド
    const number = index + 1; // 入力ファイルの順番号(1から)

    if (!club) {
      entries.push({ number, action: "CONFLICT", reason: "CLUB_MISSING" });
      continue;
    }

    const appUser = await db.appUser.findUnique({ // AppUserをIDで1件取得するメソッド
      where: { id: member.authUserId },
      select: { id: true, email: true },
    });

    if (!appUser) {
      entries.push({ number, action: "CONFLICT", reason: "APP_USER_MISSING" });
      continue;
    }

    if (!appUser.email || normalizeEmail(appUser.email) !== member.email) {
      entries.push({ number, action: "CONFLICT", reason: "EMAIL_MISMATCH" });
      continue;
    }

    const membership = await db.clubMembership.findFirst({ // 所属をクラブとユーザーで1件取得するメソッド
      where: { clubId: club.id, userId: member.authUserId },
      select: { role: true, status: true, canManageWebsite: true },
    });

    if (!membership) {
      entries.push({ number, action: "CREATE" });
    } else if (
      membership.role === member.role &&
      membership.status === "ACTIVE" &&
      membership.canManageWebsite === true
    ) {
      entries.push({ number, action: "UNCHANGED" });
    } else {
      entries.push({ number, action: "CONFLICT", reason: "MEMBERSHIP_MISMATCH" });
    }
  }

  return entries;
}

/**
 * 計画に差分があるかを返す。
 * @param entries 人物ごとの計画。
 */
export function hasPreparationConflict(entries: readonly PreparationEntry[]): boolean {
  return entries.some(/** 差分のある行かを判定するコールバック。 */ (entry) => entry.action === "CONFLICT"); // 差分のある行を探すメソッド
}

/**
 * Supabase Authで、user.idの実在とメールの一致を確認する。読取りのみ。
 * @param lookup Authを照会する関数。
 * @param members 入力の人物。
 */
export async function verifyPreparationAuthUsers(
  lookup: AuthUserLookup,
  members: readonly WebsiteAdminMember[],
): Promise<void> {
  for (const member of members) {
    let found: Awaited<ReturnType<AuthUserLookup>>; // 照会結果の型

    try {
      found = await lookup(member.authUserId); // Auth照会関数
    } catch {
      throw new SafeInitializerError("Authのユーザーを確認できませんでした。");
    }

    if (!found || !found.email || normalizeEmail(found.email) !== member.email) {
      throw new SafeInitializerError("Authのuser.idとメールアドレスが一致しません。");
    }
  }
}

/**
 * 所属を作成する。トランザクション内で照合をやり直し、差分があれば何も書かずに中止する。
 * 既存の行は、更新も削除もしない。
 * @param db PrismaClient。
 * @param clubSlug 対象クラブのURL識別子。
 * @param members 入力の人物。
 * @returns 実施した計画(CREATEは作成済み)。
 */
export async function applyPreparation(
  db: PrismaClient,
  clubSlug: string,
  members: readonly WebsiteAdminMember[],
): Promise<PreparationEntry[]> {
  return db.$transaction( // 全作成を一つのトランザクションにするメソッド
    /** 計画を再作成し、差分がなければ所属を作成するコールバック。 */
    async (tx) => {
      const entries = await buildPreparationPlan(tx, clubSlug, members); // 計画の再作成関数

      if (hasPreparationConflict(entries)) { // 差分判定関数
        throw new PreparationConflictError(entries); // 差分ありのエラー
      }

      const club = await tx.club.findUniqueOrThrow({ // 対象クラブのIDを取得するメソッド
        where: { slug: clubSlug },
        select: { id: true },
      });

      for (const [index, member] of members.entries()) {
        if (entries[index].action !== "CREATE") {
          continue; // すでに一致している人は何もしない
        }

        await tx.clubMembership.create({ // 所属を作成するメソッド
          data: {
            clubId: club.id,
            userId: member.authUserId,
            role: member.role,
            status: "ACTIVE",
            canManageWebsite: true,
          },
        });
      }

      return entries;
    },
    {
      isolationLevel: "Serializable", // 同時実行の競合を防ぐ分離レベル
      maxWait: 15_000, // 【追加】本番のpooler経由で接続の確保に時間がかかっても、P2028にしない待ち時間(ミリ秒)
      timeout: 30_000, // 【追加】トランザクション全体の制限時間(既定5秒では足りない場合がある。ミリ秒)
    },
  );
}

/**
 * 計画を、個人情報・接続先を含まない行に整形する。
 * @param entries 人物ごとの計画。
 * @returns 表示用の行。
 */
export function formatPreparationPlan(entries: readonly PreparationEntry[]): string[] {
  return entries.map( // 計画の各行を文字列へ変換するメソッド
    /** 1人ぶんの計画を、順番号・処理・理由の行へ変換するコールバック。 */
    (entry) =>
      entry.reason
        ? `メンバー${entry.number}: ${entry.action}(${entry.reason})`
        : `メンバー${entry.number}: ${entry.action}`,
  );
}

/** 環境変数を必須で読む。値はエラーに含めない。 */
function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim(); // 環境変数の値

  if (!value) {
    throw new SafeInitializerError(`${name}が設定されていません。`);
  }

  return value;
}

/** コマンドの本体。ガード→入力→Auth照合→dry-runまたはapplyの順に実行する。 */
async function main(): Promise<void> {
  const options = parsePreparationOptions(process.argv.slice(2)); // 引数解析関数
  const members = readPreparationInput(options.inputFile); // 入力ファイル読込関数

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

  /** Authのユーザーを、IDで照会する関数(読取りのみ)。 */
  const lookup: AuthUserLookup = async (authUserId) => {
    const { data, error } = await supabase.auth.admin.getUserById(authUserId); // ユーザー取得メソッド

    if (error || !data.user) {
      return null;
    }

    return { email: data.user.email ?? null };
  };

  await verifyPreparationAuthUsers(lookup, members); // Auth照合関数

  const { prisma } = await import("../src/infrastructure/prisma/client"); // 接続先確認後にだけ読み込むPrismaClient

  try {
    const entries =
      options.mode === "apply"
        ? await applyPreparation(prisma, options.clubSlug, members) // 作成関数
        : await buildPreparationPlan(prisma, options.clubSlug, members); // 計画作成関数(書込みなし)

    console.log(`モード: ${options.mode} / 環境: ${options.target}`);
    console.log(`接続先の指紋: ${fingerprint}`);
    console.log(`クラブ: ${options.clubSlug}`);

    for (const line of formatPreparationPlan(entries)) { // 整形関数
      console.log(line);
    }

    if (hasPreparationConflict(entries)) { // 差分判定関数
      console.error("エラー: 既存データが期待値と一致しません。何も書き込んでいません。");
      process.exitCode = 1;
    } else if (options.mode === "dry-run") {
      console.log("DRY-RUN：DBへは何も書き込んでいません。");
    }
  } finally {
    await prisma.$disconnect(); // DB切断メソッド
  }
}

/**
 * 【追加】原因の切り分け用に、エラーの種別(名前とコード)だけを返す。
 * メッセージ・接続先・入力値は含めない。コードは英数字と_のみ、40文字以内のときだけ採用する。
 * @param error 捕捉したエラー。
 * @returns 例: "Error / ECONNREFUSED"。判別できなければ "不明"。
 */
function describeErrorKind(error: unknown): string {
  const safe = /^[A-Za-z0-9_]{1,40}$/; // 出力してよい文字列の形式
  const parts: string[] = []; // 出力する種別の一覧

  /** 【追加】1つのエラーオブジェクトから、名前とコードを集めるコールバック。 */
  const collect = (value: unknown): void => {
    if (typeof value !== "object" || value === null) {
      return;
    }

    const record = value as Record<string, unknown>; // コードを読むための型アサーション

    for (const key of ["name", "code", "errorCode"]) {
      const item = record[key]; // 名前またはコード

      if (typeof item === "string" && safe.test(item)) {
        parts.push(item); // 種別の追加メソッド
      }
    }
  };

  collect(error); // 本体の種別
  collect((error as { cause?: unknown } | null)?.cause); // 原因の種別

  return parts.length > 0 ? parts.join(" / ") : "不明";
}

/** エラーを、接続先・入力値・生のエラーを出さずに表示して終了コード1にする。 */
function reportFailure(error: unknown): void {
  if (error instanceof PreparationConflictError) {
    for (const line of formatPreparationPlan(error.entries)) { // 整形関数
      console.error(line);
    }

    console.error(`エラー: ${error.message}`);
  } else if (error instanceof SafeInitializerError) {
    console.error(`エラー: ${error.message}`);
  } else {
    // Prismaの生エラーには接続先・入力値が含まれ得るため、メッセージは出力しない。
    console.error("エラー: 事前整備に失敗しました。接続先と入力を確認してください。");
    console.error(`【追加】原因の種別: ${describeErrorKind(error)}`); // 種別だけを表示する関数
  }

  process.exitCode = 1;
}

/** ターミナルから直接実行されたときだけ、本体を開始する。 */
const directlyExecuted = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href, // URL変換関数
);

if (directlyExecuted) {
  main().catch(reportFailure); // 失敗時の表示関数
}
