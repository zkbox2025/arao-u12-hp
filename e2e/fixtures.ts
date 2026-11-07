// e2e/fixtures.ts
// 実Cookieと所有する既存seedを使い、認可シナリオの準備・非更新確認・復元を行う。

import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  test as base,
  expect,
} from "@playwright/test";
import type {
  ClubMemberRole,
  ClubMembershipStatus,
  PlanType,
  PlatformAdminRole,
  PrismaClient,
} from "@prisma/client";
import {
  z,
} from "zod";

import {
  requireMvpTestEnvironment, // F12専用の接続前ガード関数
} from "../tests/mvp/environment";

const USERS = [
  "aOwner",
  "aCoach",
  "aOfficer",
  "aMember",
  "bOwner",
  "platformAdmin",
] as const; // 本人キーのリテラル型を保持する型アサーション
const ACTORS = [
  "aOwner",
  "aCoach",
  "aOfficer",
  "aMember",
  "bOwner",
  "bMember",
] as const; // 所属キーのリテラル型を保持する型アサーション
const CLUBS = ["a", "b"] as const; // 二クラブのリテラル型を保持する型アサーション
const SETUP_ERROR = "F12_AUTHORIZATION_SETUP_FAILED";
const CHANGED_ERROR = "F12_AUTHORIZATION_BUSINESS_DB_CHANGED";
const RESTORE_ERROR = "F12_AUTHORIZATION_RESTORE_FAILED";
const LOGIN_ERROR = "F12_AUTHORIZATION_LOGIN_FAILED";
const COOKIE_ERROR = "F12_AUTHORIZATION_COOKIE_MISSING";

const userSchema = z.object({ // 本人識別情報の構造を検証する関数
  id: z.string().uuid(), // 文字列型のUUIDを検証する関数
  email: z.string().email(), // 文字列型のメール形式を検証する関数
});
const clubSchema = z.object({ // 所有クラブの構造を検証する関数
  id: z.string().uuid(), // 文字列型のUUIDを検証する関数
  slug: z.string(), // slugの文字列型を検証する関数
  planType: z.enum(["STARTER", "STANDARD", "PRO"]), // DBと一致するプランの列挙型を検証する関数
});
const actorSchema = z.object({ // 本人・所属・クラブの対応を検証する関数
  userId: z.string().uuid(), // 本人IDの文字列型を検証する関数
  membershipId: z.string().uuid(), // 所属IDの文字列型を検証する関数
  clubId: z.string().uuid(), // クラブIDの文字列型を検証する関数
  role: z.enum(["OWNER", "COACH", "OFFICER", "MEMBER"]), // 所属ロールの列挙型を検証する関数
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "WITHDRAWN"]), // 所属状態の列挙型を検証する関数
});
const payloadSchema = z.object({ // 制御secretで受け取ったデータの構造を検証する関数
  fixture: z.object({ // 登録済みfixtureの構造を検証する関数
    database: z.object({ // DBの識別情報を検証する関数
      runId: z.string().regex(/^[0-9a-f]{32}$/u), // 実行識別子の文字列型と書式を検証する関数
      scopeId: z.string().uuid(), // 所有範囲を表すUUIDの文字列型を検証する関数
      clubs: z.object({ // 二クラブの対応を検証する関数
        a: clubSchema,
        b: clubSchema,
      }),
      users: z.record(z.enum(USERS), userSchema), // 必須本人キーと本人情報の対応型を検証する関数
      actors: z.record(z.enum(ACTORS), actorSchema), // 必須所属キーと所属情報の対応型を検証する関数
    }),
    credentials: z.record(z.enum(USERS), z.object({ // 必須本人キーと認証情報の対応型を検証する関数
      email: z.string().email(), // メール文字列型を検証する関数
      password: z.string().min(12), // 検証用passwordの文字列型と長さを検証する関数
    })),
  }),
});

/**
 * ログインする既存fixtureの本人キー。B MEMBERはA OWNERと同じ本人を使う。
 */
export type AuthorizationUser = typeof USERS[number]; // 本人キー型 / 配列要素を参照する型

/**
 * 正規の画面アクセス前後に、所有行だけへ設定するプラン・所属・Platform状態。
 */
export type AuthorizationOverrides = { // 認可シナリオの準備入力型
  plans?: Partial<Record<typeof CLUBS[number], PlanType>>; // 任意のクラブキーとプラン型の対応型
  memberships?: Partial<Record<typeof ACTORS[number], { // 任意の所属キーと変更情報の対応型
    role?: ClubMemberRole; // 所属ロールの列挙型
    status?: ClubMembershipStatus; // 所属状態の列挙型
  }>>;
  platform?: {
    isActive?: boolean; // Platform権限の有効状態を表す真偽値型
    role?: PlatformAdminRole; // Platform運営者のロール型
  };
};

/**
 * 秘密を公開せず、同じテストのpageと所有seedに限定して操作する認可試験API。
 */
export type AuthorizationScenario = { // 一件の認可試験で使用する操作契約型
  path: (club: typeof CLUBS[number], section?: "events" | "events/list" | "admin/events" | "admin/members") => string; // 所有クラブキーから同クラブのパスを返す関数型
  configure: (input: AuthorizationOverrides) => Promise<void>; // 所有行だけを変更する関数型 / 準備入力型 / 非同期結果型
  login: ( // 実passwordフォームからログインする関数型
    user: AuthorizationUser, // 既存fixtureの本人キー型
    destination: string, // 期待する固定遷移先の文字列型
    entry?: "club" | "platform", // ログイン入口のリテラル型
  ) => Promise<void>; // 非同期処理の完了を表す型
  deny: (path: string) => Promise<void>; // HTTP状態・404 UI・noindexを検証する関数型 / 非同期結果型
  cookieFingerprint: () => Promise<string>; // Cookie原文を出さず比較値を返す関数型 / 非同期結果型
  missingPath: string; // 所有クラブと異なるslugのパス文字列型
  publicTitle: string; // B MEMBERにも公開する題名の文字列型
  staffTitle: string; // B OWNER・COACHへ公開する題名の文字列型
  draftTitle: string; // Bの下書き題名の文字列型
  supportPath: (club: typeof CLUBS[number]) => string; // Platformの対象クラブを選ぶパス生成関数型
  reportMessages: Readonly<Record<typeof CLUBS[number], string>>; // 二クラブの固定報告本文を保持する読取専用型
};

/**
 * 拒否されたアクセスが業務行を書き換えないことを、所有範囲のハッシュで確認する。
 * Auth自身のセッション更新とLoginSubmissionLogの正規の監査記録は比較対象にしない。
 */
async function fingerprint( // 所有する業務行の比較値を作る関数
  database: PrismaClient, // ガード後に生成した専用DB client型
  clubIds: string[], // 所有クラブIDの文字列配列型
  userIds: string[], // 所有本人IDの文字列配列型
): Promise<string> { // 比較値の文字列を返す非同期結果型
  const where = {
    clubId: {
      in: clubIds,
    },
  };
  const orderBy = {
    id: "asc" as const, // ID順のリテラル型を保持する型アサーション
  };
  const rows = await database.$transaction([ // 一貫した業務行のスナップショットを取得するメソッド
    database.club.findMany({ // 所有クラブを取得するメソッド
      where: {
        id: {
          in: clubIds
        }
      },
      orderBy
    }),
    database.appUser.findMany({ // 所有AppUserを取得するメソッド
      where: {
        id: {
          in: userIds
        }
      },
      orderBy
    }),
    database.platformAdmin.findMany({ // 所有PlatformAdminを取得するメソッド
      where: {
        id: {
          in: userIds
        }
      },
      orderBy
    }),
    database.child.findMany({ // 所有本人の子どもを取得するメソッド
      where: {
        parentId: {
          in: userIds
        }
      },
      orderBy
    }),
    database.clubMembership.findMany({ // 所有所属を取得するメソッド
      where,
      orderBy
    }),
    database.childClubMembership.findMany({ // 所有クラブの子ども所属を取得するメソッド
      where,
      orderBy
    }),
    database.clubEvent.findMany({ // 所有イベントを取得するメソッド
      where,
      orderBy
    }),
    database.clubNotice.findMany({ // 所有お知らせを取得するメソッド
      where,
      orderBy
    }),
    database.clubEventAttachment.findMany({ // 所有イベント添付を取得するメソッド
      where,
      orderBy
    }),
    database.clubNoticeAttachment.findMany({ // 所有お知らせ添付を取得するメソッド
      where,
      orderBy
    }),
    database.clubEventRead.findMany({ // 所有イベント既読を取得するメソッド
      where,
      orderBy
    }),
    database.clubNoticeRead.findMany({ // 所有お知らせ既読を取得するメソッド
      where,
      orderBy
    }),
    database.clubEventMemo.findMany({ // 所有メモを取得するメソッド
      where,
      orderBy
    }),
    database.clubInvitation.findMany({ // 所有招待を取得するメソッド
      where,
      orderBy
    }),
    database.clubLineSetting.findMany({ // 所有LINE設定を取得するメソッド
      where,
      orderBy
    }),
    database.clubLineTarget.findMany({ // 所有LINE対象を取得するメソッド
      where,
      orderBy
    }),
    database.clubLineRegistrationToken.findMany({ // 所有LINE登録tokenを取得するメソッド
      where,
      orderBy
    }),
    database.clubLineDelivery.findMany({ // 所有LINE配送記録を取得するメソッド
      where,
      orderBy
    }),
    database.storageDeletionJob.findMany({ // 所有Storage jobを取得するメソッド
      where,
      orderBy
    }),
    database.supportReport.findMany({ // 所有サポート報告を取得するメソッド
      where,
      orderBy
    }),
    database.clubEventBatchOperation.findMany({ // 所有イベント一括操作記録を取得するメソッド
      where,
      orderBy
    }),
  ], {
    isolationLevel: "RepeatableRead",
  });
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex"); // ハッシュ生成関数 / JSON直列化関数 / 入力追加メソッド / ハッシュ確定メソッド
}

/**
 * テストごとに新しいpageを使い、所有行の準備・HTTP確認後の非更新検査・復元を実行する。
 */
export const test = base.extend<{ authorization: AuthorizationScenario }>({ // fixtureを追加する関数 / 認可試験APIの型
  /**
   * runnerの所有契約を検証してからDB clientを生成し、公開する操作を当該pageへ束縛する。
   */
  authorization: async ({ page }, provide, testInfo) => { // page・fixture受渡し関数・試験情報を受け取るコールバック
    let database: PrismaClient | undefined; // 初期化済み専用DB clientまたは未設定の型
    try {
      if (testInfo.config.workers !== 1) {
        throw new Error(SETUP_ERROR); // 共有する所有seedの並列変更を拒否する固定例外コンストラクター
      }
      const { readMvpE2eSession } = await import("../tests/mvp/outbound-stub.mjs"); // 所有契約を検証する関数 / ESM moduleの遅延読込関数
      const session = readMvpE2eSession(); // preloader・明示flag・接続契約を検証する関数
      // browser段階の所有確認後だけ、launcher用ガードへ渡す検証辞書をtestとして扱う。
      // 既存preloaderがworkerへ継承するproductionと、Next本体の環境は変更しない。
      const environment = requireMvpTestEnvironment( // 接続前ガード関数
        {
          ...process.env,
          NODE_ENV: "test",
          // 所有確認済みpreloaderの指定は残したまま、検証用辞書からだけ除く。
          NODE_OPTIONS: undefined,
        },
        process.cwd(), // 作業ディレクトリの取得関数
        session.runId,
      );
      if (environment.appOrigin !== session.appOrigin) {
        throw new Error(SETUP_ERROR); // 所有入口の不一致を拒否する固定例外コンストラクター
      }
      const response = await fetch(session.stubOrigin + "/control", { // 所有する制御入口へ要求する関数
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mvp-secret": session.secret,
        },
        body: JSON.stringify({ // 秘密をログへ渡さず制御要求を直列化する関数
          runId: session.runId,
          action: "read",
        }),
        signal: AbortSignal.timeout(5000), // 制御要求の期限signalを生成する関数
        redirect: "error",
      });
      if (!response.ok) {
        throw new Error(SETUP_ERROR); // 制御要求の失敗を固定例外にするコンストラクター
      }
      const { database: data, credentials } = payloadSchema.parse(await response.json()).fixture; // 構造検証メソッド / JSON応答を取得するメソッド
      if (data.runId !== session.runId) {
        throw new Error(SETUP_ERROR); // 別実行のfixtureを拒否する固定例外コンストラクター
      }
      for (const club of CLUBS) {
        if (data.clubs[club].slug !== `mvp-f12-${data.scopeId}-${club}`) {
          throw new Error(SETUP_ERROR); // 所有slug不一致の固定例外コンストラクター
        }
      }
      for (const user of USERS) {
        const email = `mvp-f12-${data.scopeId}-${user.toLowerCase()}@example.test`; // 本人キーを小文字にするメソッド
        if (data.users[user].email !== email ||
          credentials[user].email !== email) {
          throw new Error(SETUP_ERROR); // 所有メール不一致の固定例外コンストラクター
        }
      }
      const definitions = [
        ["aOwner", "a", "aOwner", "OWNER"],
        ["aCoach", "a", "aCoach", "COACH"],
        ["aOfficer", "a", "aOfficer", "OFFICER"],
        ["aMember", "a", "aMember", "MEMBER"],
        ["bOwner", "b", "bOwner", "OWNER"],
        ["bMember", "b", "aOwner", "MEMBER"],
      ] as const; // fixtureの対応関係を表すリテラル型の型アサーション
      for (const [actor, club, user, role] of definitions) {
        const value = data.actors[actor];
        if (
          value.clubId !== data.clubs[club].id ||
          value.userId !== data.users[user].id ||
          value.role !== role ||
          value.status !== "ACTIVE" ||
          value.userId === data.users.platformAdmin.id
        ) {
          throw new Error(SETUP_ERROR); // 本人・所属・ロールの不一致を拒否する固定例外コンストラクター
        }
      }
      const { PrismaClient } = await import("@prisma/client"); // DB clientのコンストラクター / moduleの遅延読込関数
      const { PrismaPg } = await import("@prisma/adapter-pg"); // PostgreSQL adapterのコンストラクター / moduleの遅延読込関数
      database = new PrismaClient({ // 専用DB clientのコンストラクター
        adapter: new PrismaPg({ // 専用PostgreSQL adapterのコンストラクター
          connectionString: environment.databaseUrl,
          max: 1,
          connectionTimeoutMillis: 3000,
          statement_timeout: 5000,
        }),
        log: [],
      });
      const client = database;
      const clubIds = CLUBS.map( // 所有クラブIDを配列へ写すメソッド
        /**
         * 制御secretで確認した所有クラブのIDだけを選ぶ。
         */
        (key) => data.clubs[key].id, // 所有クラブIDを選ぶコールバック
      );
      const userIds = USERS.map( // 所有本人IDを配列へ写すメソッド
        /**
         * 制御secretで確認した所有本人のIDだけを選ぶ。
         */
        (key) => data.users[key].id, // 所有本人IDを選ぶコールバック
      );
      const original = {
        clubs: await client.club.findMany({ // 所有IDとslugのDB照合に使う行を取得するメソッド
          where: {
            id: {
              in: clubIds
            }
          },
        }),
        memberships: await client.clubMembership.findMany({ // 所有クラブの所属行を取得するメソッド
          where: {
            clubId: {
              in: clubIds
            }
          },
        }),
        admin: await client.platformAdmin.findUniqueOrThrow({ // 所有する独立PlatformAdminを取得するメソッド
          where: {
            id: data.users.platformAdmin.id
          },
        }),
      };
      if (
        original.clubs.length !== 2 ||
        original.memberships.length !== 6 ||
        !original.admin.isActive ||
        original.admin.role !== "DEVELOPER" ||
        await client.appUser.count({ // 独立運営者のAppUserが自動作成されていないか確認するメソッド
          where: {
            id: data.users.platformAdmin.id
          },
        }) !== 0
      ) {
        throw new Error(SETUP_ERROR); // 所有行の不足・追加を拒否する固定例外コンストラクター
      }
      for (const club of original.clubs) {
        if (!CLUBS.some( // IDとslugの対応を検証するメソッド
          /**
           * DBの行が制御入口で確認した同じクラブかを照合する。
           */
          (key) => data.clubs[key].id === club.id && // 所有クラブを照合するコールバック
            data.clubs[key].slug === club.slug, // 所有クラブを照合するコールバック
        )) {
          throw new Error(SETUP_ERROR); // DB所有範囲不一致の固定例外コンストラクター
        }
      }
      for (const [key] of definitions) {
        const actor = data.actors[key];
        if (!original.memberships.some( // 本人・所属・クラブの一致を検証するメソッド
          /**
           * DBの所属が登録済みの同じ本人・クラブ・初期状態であることを確認する。
           */
          (row) => row.id === actor.membershipId && // 所有する値を受け取り、この照合処理を実行するコールバック
            row.clubId === actor.clubId &&
            row.userId === actor.userId &&
            row.role === actor.role &&
            row.status === actor.status, // 所有所属を照合するコールバック
        )) {
          throw new Error(SETUP_ERROR); // DB所属不一致の固定例外コンストラクター
        }
      }
      const eventIds = [randomUUID(), randomUUID(), randomUUID()]; // 試験が所有するイベントIDを生成する関数
      const reportIds = [randomUUID(), randomUUID()]; // 試験が所有する報告IDを生成する関数
      const publicTitle = "F12-B-MEMBER公開";
      const staffTitle = "F12-B-COACH限定";
      const draftTitle = "F12-B-下書き";
      const reportMessages = {
        a: "F12-Aの認可確認",
        b: "F12-Bの認可確認"
      };
      try {
        await client.clubEvent.createMany({ // ロール分離だけを確認する最小の三行を作成するメソッド
          data: ([
            {
              id: eventIds[0],
              title: publicTitle,
              status: "PUBLISHED",
              targetRoles: ["OWNER", "MEMBER"]
            },
            {
              id: eventIds[1],
              title: staffTitle,
              status: "PUBLISHED",
              targetRoles: ["OWNER", "COACH"]
            },
            {
              id: eventIds[2],
              title: draftTitle,
              status: "DRAFT",
              targetRoles: ["OWNER", "MEMBER"]
            },
          ] as const).map( // 公開状態・対象ロールのリテラル型を保持する型アサーション / 共通情報を追加するメソッド
            /**
             * Bクラブの既存OWNERへ紐付けた、当該試験だけの保存入力を作る。
             */
            (row) => ({ // イベントの保存入力を作るコールバック
              ...row,
              targetRoles: [...row.targetRoles],
              clubId: data.clubs.b.id,
              createdByMembershipId: data.actors.bOwner.membershipId,
              startAt: new Date("2026-06-10T09:00:00Z"), // 固定日時を生成するコンストラクター
            }),
          ),
        });
        await client.supportReport.createMany({ // 独立Platform権限で両クラブを読むための最小行を作成するメソッド
          data: CLUBS.map( // 所有クラブごとの報告入力を作るメソッド
            /**
             * 会員の本人情報を入れず、所有クラブに固定本文だけを保存する。
             */
            (club, index) => ({ // サポート報告入力を作るコールバック
              id: reportIds[index],
              clubId: data.clubs[club].id,
              message: reportMessages[club],
            }),
          ),
        });
        let expected = await fingerprint(client, clubIds, userIds); // 業務行の初期比較値を作る関数
        // 正規のpassword認証を通したまま、ケース別の監査用IPで試行件数を分離する。
        const ip = createHash("sha256").update(session.runId + testInfo.testId).digest(); // 試験専用IPを導出するハッシュ生成関数 / 入力追加メソッド / ハッシュ確定メソッド
        await page.context().setExtraHTTPHeaders({ // 当該contextだけへリクエストheaderを設定するメソッド / pageのcontextを返すメソッド
          "x-forwarded-for": `198.18.${ip[0]}.${ip[1]}`,
        });
        await provide({ // 当該テストへ秘密を含まない操作APIを渡す関数
          /**
           * 所有クラブキーからアプリ内のパスを作る。
           */
          path(club, section = "events") { // 所有クラブのパスを作る関数
            return `/club/${data.clubs[club].slug}/${section}`;
          },
          /**
           * 先行アクセスの非更新を確認してから、所有する認可行だけを変更する。
           */
          async configure(input) { // 認可シナリオを準備する関数
            if (await fingerprint(client, clubIds, userIds) !== expected) { // 変更前の業務行を確認する関数
              throw new Error(CHANGED_ERROR); // 想定外の業務更新を示す固定例外コンストラクター
            }
            try {
              await client.$transaction( // 準備する認可行を一体更新するメソッド
                /**
                 * 所有ID・クラブ・本人をwhereへ入れ、対象が一行の更新だけを許す。
                 */
                async (transaction) => { // 認可行を更新するtransactionコールバック
                  for (const club of CLUBS) {
                    const planType = input.plans?.[club];
                    if (planType !== undefined) {
                      const result = await transaction.club.updateMany({ // 所有クラブのプランを変更するメソッド
                        where: {
                          id: data.clubs[club].id,
                          slug: data.clubs[club].slug
                        },
                        data: {
                          planType
                        },
                      });
                      if (result.count !== 1) {
                        throw new Error(SETUP_ERROR); // 更新件数不一致の固定例外コンストラクター
                      }
                    }
                  }
                  for (const key of ACTORS) {
                    const change = input.memberships?.[key];
                    if (change) {
                      const actor = data.actors[key];
                      const result = await transaction.clubMembership.updateMany({ // 所有する本人・クラブの所属だけを変更するメソッド
                        where: {
                          clubId: actor.clubId,
                          id: actor.membershipId,
                          userId: actor.userId
                        },
                        data: change,
                      });
                      if (result.count !== 1) {
                        throw new Error(SETUP_ERROR); // 更新件数不一致の固定例外コンストラクター
                      }
                    }
                  }
                  if (input.platform) {
                    const result = await transaction.platformAdmin.updateMany({ // 所有する独立PlatformAdminだけを変更するメソッド
                      where: {
                        id: data.users.platformAdmin.id
                      },
                      data: input.platform,
                    });
                    if (result.count !== 1) {
                      throw new Error(SETUP_ERROR); // 更新件数不一致の固定例外コンストラクター
                    }
                  }
                },
              );
              expected = await fingerprint(client, clubIds, userIds); // 準備した状態の比較値を更新する関数
            } catch {
              throw new Error(SETUP_ERROR); // SQLや接続秘密を公開しない固定例外コンストラクター
            }
          },
          /**
           * 実際のログインフォームを送信し、呼出し元が指定した遷移先まで待つ。
           */
          async login(user, destination, entry = "club") { // 実Cookieを取得するログイン関数
            try {
              await page.goto(entry === "club" ? "/club-login" : "/platform-login"); // 正規のログイン画面を開くメソッド
              await page.getByLabel("メールアドレス", { // ラベルで入力欄を選ぶメソッド / 検証用メールを入力するメソッド
                exact: true
              }).fill(credentials[user].email); // ラベルで入力欄を選ぶメソッド / 検証用メールを入力するメソッド
              await page.getByLabel("パスワード", { // ラベルで入力欄を選ぶメソッド / 検証用passwordを入力するメソッド
                exact: true
              }).fill(credentials[user].password); // ラベルで入力欄を選ぶメソッド / 検証用passwordを入力するメソッド
              await Promise.all([ // 遷移とフォーム送信を一緒に待つ関数
                page.waitForURL(session.appOrigin + destination), // 指定した正規の遷移先を待つメソッド
                page.getByRole("button", { // 正規のログインボタンを選ぶメソッド / 送信するメソッド
                  name: "ログイン",
                  exact: true
                }).click(), // 正規のログインボタンを選ぶメソッド / 送信するメソッド
              ]);
              const cookies = await page.context().cookies(session.appOrigin); // Cookieを取得するメソッド / 当該pageのcontextを返すメソッド
              if (!cookies.some( // Auth Cookieが実際に保存されたか調べるメソッド
                /**
                 * SDKの分割Cookieも含め、Auth Cookieの名前だけを確認する。
                 */
                (cookie) => /^sb-.+-auth-token(?:\.\d+)?$/u.test(cookie.name), // Cookie名を確認するコールバック / 正規表現の検証メソッド
              )) {
                throw new Error(LOGIN_ERROR); // Cookie不足の固定例外コンストラクター
              }
            } catch {
              throw new Error(LOGIN_ERROR); // passwordやAuth原文を公開しない固定例外コンストラクター
            }
          },
          /**
           * Nextの非streaming 404、またはstreaming 200と404 UI・noindexを一体で検証する。
           */
          async deny(path) { // 保護画面の拒否を検証する関数
            const denied = await page.goto(path); // 対象URLを直接開くメソッド
            expect([200, 404].includes(denied?.status() ?? 0)).toBe(true); // 期待値生成関数 / 許容HTTP状態の照合メソッド / 状態取得メソッド / 真偽値検証メソッド
            await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached(); // 期待値生成関数 / noindex要素を選ぶメソッド / 最初の要素を選ぶメソッド / DOMの存在検証メソッド
            await expect(page.getByRole("heading", { // 期待値生成関数 / 拒否見出しを選ぶメソッド / 最初の要素を選ぶメソッド / 表示検証メソッド
              name: /^(404|イベントが見つかりません)$/u
            }).first()).toBeVisible(); // 期待値生成関数 / 拒否見出しを選ぶメソッド / 最初の要素を選ぶメソッド / 表示検証メソッド
            await expect(page.getByRole("heading", { // 期待値生成関数 / 保護画面の見出しを選ぶメソッド / 非表示を検証するメソッド
              name: "月別イベント管理",
              exact: true
            })).toHaveCount(0); // 期待値生成関数 / 保護画面の見出しを選ぶメソッド / 非表示を検証するメソッド
          },
          /**
           * Auth Cookieをメモリ上でだけハッシュ化し、既存セッションを使い続けたか比較する。
           */
          async cookieFingerprint() { // Cookie原文を出さない比較値生成関数
            const cookies = await page.context().cookies(session.appOrigin); // 当該pageのcontextを返すメソッド / Cookieを取得するメソッド
            const auth = cookies.filter( // Auth Cookieだけを選ぶメソッド
              /**
               * Cookie値を外へ渡さず、SDKのCookie名だけで選ぶ。
               */
              (cookie) => /^sb-.+-auth-token(?:\.\d+)?$/u.test(cookie.name), // Cookieを選ぶコールバック / Cookie名の検証メソッド
            );
            if (auth.length === 0) {
              throw new Error(COOKIE_ERROR); // Cookie不足の固定例外コンストラクター
            }
            auth.sort( // Cookie名順に並べるメソッド
              /**
               * 分割Cookieの並び順を固定する。
               */
              (left, right) => left.name.localeCompare(right.name), // Cookie名を比較するコールバック / 文字列比較メソッド
            );
            const values = auth.map( // Cookieの更新可能な属性を比較対象から外すメソッド
              /**
               * 期限属性が再設定されても、Cookie名と値が同じなら同じ認証状態として扱う。
               */
              (cookie) => ({ // Cookieの名前と値だけを選ぶコールバック
                name: cookie.name,
                value: cookie.value,
              }),
            );
            return createHash("sha256").update(JSON.stringify(values)).digest("hex"); // ハッシュ生成関数 / Cookieの直列化関数 / 入力追加メソッド / ハッシュ確定メソッド
          },
          missingPath: `/club/mvp-f12-${data.scopeId}-missing/events`,
          publicTitle,
          staffTitle,
          draftTitle,
          /**
           * Platformで所有クラブの報告を読むための固定queryを作る。
           */
          supportPath(club) { // 所有クラブのPlatformパスを返す関数
            const query = new URLSearchParams({ // 所有クラブIDだけでqueryを作るコンストラクター
              clubId: data.clubs[club].id
            });
            return `/platform/support?${query.toString()}`; // queryを文字列にするメソッド
          },
          reportMessages,
        });
        if (await fingerprint(client, clubIds, userIds) !== expected) { // 画面アクセス後の業務行を確認する関数
          throw new Error(CHANGED_ERROR); // 想定外の業務更新を示す固定例外コンストラクター
        }
      } finally {
        try {
          await client.$transaction( // 試験の追加行削除と認可行復元を一体で行うメソッド
            /**
             * 当該試験が登録した追加IDと、検証済みの元行だけを削除・復元する。
             */
            async (transaction) => { // 所有行を復元するtransactionコールバック
              await transaction.clubEvent.deleteMany({ // 当該試験のイベントだけを削除するメソッド
                where: {
                  clubId: data.clubs.b.id,
                  id: {
                    in: eventIds
                  }
                },
              });
              await transaction.supportReport.deleteMany({ // 当該試験の報告だけを削除するメソッド
                where: {
                  clubId: {
                    in: clubIds
                  },
                  id: {
                    in: reportIds
                  }
                },
              });
              for (const club of original.clubs) {
                const result = await transaction.club.updateMany({ // 所有クラブの初期プランを復元するメソッド
                  where: {
                    id: club.id,
                    slug: club.slug
                  },
                  data: {
                    planType: club.planType,
                    updatedAt: club.updatedAt
                  },
                });
                if (result.count !== 1) {
                  throw new Error(RESTORE_ERROR); // 復元件数不一致の固定例外コンストラクター
                }
              }
              for (const actor of original.memberships) {
                const result = await transaction.clubMembership.updateMany({ // 所有所属の初期ロール・状態を復元するメソッド
                  where: {
                    clubId: actor.clubId,
                    id: actor.id,
                    userId: actor.userId
                  },
                  data: {
                    role: actor.role,
                    status: actor.status,
                    updatedAt: actor.updatedAt
                  },
                });
                if (result.count !== 1) {
                  throw new Error(RESTORE_ERROR); // 復元件数不一致の固定例外コンストラクター
                }
              }
              const result = await transaction.platformAdmin.updateMany({ // 所有PlatformAdminの初期権限を復元するメソッド
                where: {
                  id: original.admin.id
                },
                data: {
                  role: original.admin.role,
                  isActive: original.admin.isActive,
                  updatedAt: original.admin.updatedAt
                },
              });
              if (result.count !== 1) {
                throw new Error(RESTORE_ERROR); // 復元件数不一致の固定例外コンストラクター
              }
            },
          );
        } catch {
          throw new Error(RESTORE_ERROR); // SQLや識別情報を出さない復元失敗の固定例外コンストラクター
        }
      }
    } catch (error) {
      if (error instanceof Error && // 固定文だけを公開できる例外型かを確認する
        [SETUP_ERROR, CHANGED_ERROR, RESTORE_ERROR, LOGIN_ERROR, COOKIE_ERROR].includes(error.message)) { // 例外型の判定 / 公開してよい固定コードを照合するメソッド
        throw error;
      }
      throw new Error(SETUP_ERROR); // SDK・DB・認証情報を出さない固定例外コンストラクター
    } finally {
      try {
        await database?.$disconnect(); // 専用DB clientを切断するメソッド
      } catch {
        throw new Error(RESTORE_ERROR); // 切断の失敗も原文を公開しない固定例外コンストラクター
      }
    }
  },
});

/**
 * 認可試験用のtestと同じPlaywrightの期待値検証APIを公開する。
 */
export { expect }; // 同じPlaywrightの期待値検証関数を公開する
