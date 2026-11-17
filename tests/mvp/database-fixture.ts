// tests/mvp/database-fixture.ts
// SDKを初期化せず、作成前のID登録・一体seed・所有範囲だけのcleanupを提供する。

import {
  randomUUID, // fixture専用のUUIDを生成する関数
} from "node:crypto";
import type {
  ClubMemberRole, // 所属ロールのDB列挙型
  ClubMembershipStatus, // 所属状態のDB列挙型
  PlanType, // クラブプランのDB列挙型
  Prisma, // 各モデルの作成入力型namespace
  PrismaClient, // 呼出し元がガード後に生成する専用DB clientの型
} from "@prisma/client";
import {
  CLUB_ATTACHMENT_BUCKET, // ストレージ内の保管場所の名前
} from "@/src/infrastructure/storage/club-attachment-storage-constants";
import type {
  MvpTestEnvironment, // ガード済み接続先と生成予定資源を表す型
} from "./environment";

const FIXTURE_ERROR = "F12 DB fixtureの作成・所有範囲・後片付けを確認してください。";
const USER_KEYS = [
  "aOwner",
  "aCoach",
  "aOfficer",
  "aMember",
  "bOwner",
  "platformAdmin",
] as const; // リテラル型を保持するconstアサーション

/**
 * ローカルAuthとの接続時にIDを差し込める本人のキー。bMemberはaOwnerと同じ本人。
 */
export type MvpFixtureUserKey = typeof USER_KEYS[number]; // 本人キー型 / プロパティまたは配列要素を参照する型 / 値の宣言から型を取得する型 / 数値型

/**
 * 基本の二クラブ以外に、そのケースだけが必要とする関連データの種類。
 */
export type MvpFixtureFeature = // 関連データ種別型
  | "content"
  | "attachments"
  | "activity"
  | "line"
  | "support"
  | "copySources";

/**
 * ケース専用のプラン・失効状態・Auth本人ID・関連データを指定する入力。
 * authUserIdsは新規ローカルAuth user.idだけを渡す。Authの作成・存在照合は後続粒度。
 */
export type MvpFixtureOptions = { // ケース別fixture入力型
  authUserIds?: Partial<Record<MvpFixtureUserKey, string>>; // 任意項目にする型 / キーと値の対応型 / 本人キー型 / 文字列型
  plans?: {
    a?: PlanType; // クラブプラン型
    b?: PlanType; // クラブプラン型
  };
  statuses?: Partial<Record<MvpFixtureActorKey, ClubMembershipStatus>>; // 任意項目にする型 / キーと値の対応型 / 所属キー型 / 所属状態型
  features?: readonly MvpFixtureFeature[]; // 関連データ種別型
};

/**
 * 管理者・会員・クラブ間で役割が異なる本人を選ぶためのキー。
 */
export type MvpFixtureActorKey = // 所属キー型
  | "aOwner"
  | "aCoach"
  | "aOfficer"
  | "aMember"
  | "bOwner"
  | "bMember";

/**
 * 認可contextを組み立てるための、実在する本人・所属・クラブと状態。
 */
export type MvpFixtureActor = Readonly<{ // 認可用の本人・所属型 / 読取専用にする型
  userId: string; // 文字列型
  membershipId: string; // 文字列型
  clubId: string; // 文字列型
  role: ClubMemberRole; // 所属ロール型
  status: ClubMembershipStatus; // 所属状態型
}>;

/**
 * 下書き・MEMBER公開・COACH限定を選ぶコンテンツIDの組。
 */
export type MvpFixtureContent = Readonly<{ // 公開状態別コンテンツID型 / 読取専用にする型
  draft: string; // 文字列型
  member: string; // 文字列型
  coach: string; // 文字列型
}>;

/**
 * 共通seedが返すID。生成台帳は外へ出さず、後片付けはこのオブジェクトの所有記録を使う。
 */
export type MvpDatabaseFixture = Readonly<{ // 認可・関連行のfixture ID型 / 読取専用にする型
  runId: string; // 文字列型
  scopeId: string; // 文字列型
  clubs: Readonly<Record<"a" | "b", Readonly<{ // 読取専用にする型 / キーと値の対応型
    id: string; // 文字列型
    slug: string; // 文字列型
    planType: PlanType; // クラブプラン型
  }>>>;
  users: Readonly<Record<MvpFixtureUserKey, Readonly<{ // 読取専用にする型 / キーと値の対応型 / 本人キー型
    id: string; // 文字列型
    email: string; // 文字列型
  }>>>;
  actors: Readonly<Record<MvpFixtureActorKey, MvpFixtureActor>>; // 読取専用にする型 / キーと値の対応型 / 所属キー型 / 認可用の本人・所属型
  children: Readonly<{ // 読取専用にする型
    own: string; // 文字列型
    otherParent: string; // 文字列型
  }>;
  related: Readonly<Record<"a" | "b", Readonly<{ // 読取専用にする型 / キーと値の対応型
    events?: MvpFixtureContent; // 公開状態別コンテンツID型
    notices?: MvpFixtureContent; // 公開状態別コンテンツID型
    sourceEvents: readonly string[]; // 文字列型
    eventAttachmentId?: string; // 文字列型
    noticeAttachmentId?: string; // 文字列型
    storageJobId?: string; // 文字列型
    lineSettingId?: string; // 文字列型
    targetId?: string; // 文字列型
    deliveryId?: string; // 文字列型
    webhookKey?: string; // 文字列型
    supportReportId?: string; // 文字列型
  }>>>;
}>;

/**
 * 一つの実transactionで保存する、作成前にUUIDを決めた行の集合。
 */
type Rows = { // 作成前に登録する保存行集合型
  clubs: Prisma.ClubCreateManyInput[]; // ClubCreateManyInputの一括作成入力型
  users: Prisma.AppUserCreateManyInput[]; // AppUserCreateManyInputの一括作成入力型
  memberships: Prisma.ClubMembershipCreateManyInput[]; // ClubMembershipCreateManyInputの一括作成入力型
  children: Prisma.ChildCreateManyInput[]; // ChildCreateManyInputの一括作成入力型
  childMemberships: Prisma.ChildClubMembershipCreateManyInput[]; // ChildClubMembershipCreateManyInputの一括作成入力型
  admins: Prisma.PlatformAdminCreateManyInput[]; // PlatformAdminCreateManyInputの一括作成入力型
  events: Prisma.ClubEventCreateManyInput[]; // ClubEventCreateManyInputの一括作成入力型
  notices: Prisma.ClubNoticeCreateManyInput[]; // ClubNoticeCreateManyInputの一括作成入力型
  eventAttachments: Prisma.ClubEventAttachmentCreateManyInput[]; // ClubEventAttachmentCreateManyInputの一括作成入力型
  noticeAttachments: Prisma.ClubNoticeAttachmentCreateManyInput[]; // ClubNoticeAttachmentCreateManyInputの一括作成入力型
  eventReads: Prisma.ClubEventReadCreateManyInput[]; // ClubEventReadCreateManyInputの一括作成入力型
  noticeReads: Prisma.ClubNoticeReadCreateManyInput[]; // ClubNoticeReadCreateManyInputの一括作成入力型
  memos: Prisma.ClubEventMemoCreateManyInput[]; // ClubEventMemoCreateManyInputの一括作成入力型
  settings: Prisma.ClubLineSettingCreateManyInput[]; // ClubLineSettingCreateManyInputの一括作成入力型
  targets: Prisma.ClubLineTargetCreateManyInput[]; // ClubLineTargetCreateManyInputの一括作成入力型
  deliveries: Prisma.ClubLineDeliveryCreateManyInput[]; // ClubLineDeliveryCreateManyInputの一括作成入力型
  jobs: Prisma.StorageDeletionJobCreateManyInput[]; // StorageDeletionJobCreateManyInputの一括作成入力型
  reports: Prisma.SupportReportCreateManyInput[]; // SupportReportCreateManyInputの一括作成入力型
};

/**
 * 公開fixtureと結び付けた所有台帳。seed失敗時はtransaction rollbackに任せる。
 */
type FixtureState = { // 非公開の所有台帳型
  rows: Rows; // 作成前に登録する保存行集合型
  jobs: Set<string>; // 登録済みジョブIDの集合型 / 文字列型
  phase: "planned" | "seeding" | "ready" | "cleaning" | "cleaned";
};

const states = new WeakMap<MvpDatabaseFixture, FixtureState>(); // fixtureと所有台帳を結ぶコンストラクター / 認可・関連行のfixture ID型 / 非公開の所有台帳型

/**
 * このモジュールが作ったfixtureだけから、非公開の所有台帳を取り出す。
 */
function stateOf(fixture: MvpDatabaseFixture): FixtureState { // 非公開の所有台帳を取得する関数 / 認可・関連行のfixture ID型 / 非公開の所有台帳型
  const state = states.get(fixture); // 所有台帳または参照先を取得するメソッド
  if (!state) {
    throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
  }
  return state;
}

/**
 * IDを先に発行し、同じrun内でも独立した二クラブと任意の関連行を計画する。
 * DB・Auth・Storageへ接続せず、既存データの再利用・upsertは行わない。
 */
export function planMvpDatabaseFixture( // DB接続前にUUIDと保存行を計画する関数
  configuration: MvpTestEnvironment, // ガード済み実行環境型
  options: MvpFixtureOptions = {}, // ケース別fixture入力型
): MvpDatabaseFixture { // 認可・関連行のfixture ID型
  try {
    if (!/^[0-9a-f]{32}$/u.test(configuration.runId)) { // 書式を検証するメソッド
      throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
    }
    const scopeId = randomUUID(); // UUIDを生成する関数
    const users = {} as Record<MvpFixtureUserKey, { // キーと値の対応型 / 本人キー型
      id: string; // 文字列型
      email: string; // 文字列型
    }>;
    for (const key of USER_KEYS) {
      const id = options.authUserIds?.[key] ?? randomUUID(); // UUIDを生成する関数
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id)) { // 書式を検証するメソッド
        throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
      }
      users[key] = Object.freeze({ // 設定の変更を防ぐ関数
        id: id.toLowerCase(), // 小文字へ正規化するメソッド
        email: `mvp-f12-${scopeId}-${key.toLowerCase()}@example.test`, // 小文字へ正規化するメソッド
      });
    }
    if (new Set(Object.values(users).map( // 重複しない集合のコンストラクター / 各要素を保存・照合用の値へ写すメソッド / 値を列挙する関数
      /**
       * 本人キーごとのIDを照合し、PlatformAdminをクラブ本人と兼任させない。
       */
      (user) => user.id, // 試験または保存処理のコールバック
    )).size !== USER_KEYS.length) {
      throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
    }
    const clubs = {} as Record<"a" | "b", { // キーと値の対応型
      id: string; // 文字列型
      slug: string; // 文字列型
      planType: PlanType; // クラブプラン型
    }>;
    for (const key of ["a", "b"] as const) { // リテラル型を保持するconstアサーション
      const planType = options.plans?.[key] ?? "STANDARD";
      if (!["STARTER", "STANDARD", "PRO"].includes(planType)) { // 許可値に含まれるか調べるメソッド
        throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
      }
      clubs[key] = Object.freeze({ // 設定の変更を防ぐ関数
        id: randomUUID(), // UUIDを生成する関数
        slug: `mvp-f12-${scopeId}-${key}`,
        planType,
      });
    }
    const actors = {} as Record<MvpFixtureActorKey, MvpFixtureActor>; // キーと値の対応型 / 所属キー型 / 認可用の本人・所属型
    const definitions = [
      ["aOwner", "a", "aOwner", "OWNER"],
      ["aCoach", "a", "aCoach", "COACH"],
      ["aOfficer", "a", "aOfficer", "OFFICER"],
      ["aMember", "a", "aMember", "MEMBER"],
      ["bOwner", "b", "bOwner", "OWNER"],
      ["bMember", "b", "aOwner", "MEMBER"],
    ] as const; // リテラル型を保持するconstアサーション
    for (const [key, club, user, role] of definitions) {
      const status = options.statuses?.[key] ?? "ACTIVE";
      if (!["INVITED", "ACTIVE", "SUSPENDED", "WITHDRAWN"].includes(status)) { // 許可値に含まれるか調べるメソッド
        throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
      }
      actors[key] = Object.freeze({ // 設定の変更を防ぐ関数
        userId: users[user].id,
        membershipId: randomUUID(), // UUIDを生成する関数
        clubId: clubs[club].id,
        role,
        status,
      });
    }
    const children = Object.freeze({ // 設定の変更を防ぐ関数
      own: randomUUID(), // UUIDを生成する関数
      otherParent: randomUUID(), // UUIDを生成する関数
    });
    const rows: Rows = { // 作成前に登録する保存行集合型
      clubs: Object.values(clubs).map( // 各要素を保存・照合用の値へ写すメソッド / 値を列挙する関数
        /**
         * 各クラブの固定timezoneとケース専用プランを保存入力にする。
         */
        (club) => ({ // 試験または保存処理のコールバック
          ...club,
          name: "F12 fixture",
          timezone: "Asia/Tokyo",
        }),
      ),
      users: USER_KEYS.filter( // 条件に合う要素を選ぶメソッド
        /**
         * PlatformAdminはAppUser・クラブ所属を持たない独立した運営者にする。
         */
        (key) => key !== "platformAdmin", // 試験または保存処理のコールバック
      ).map( // 各要素を保存・照合用の値へ写すメソッド
        /**
         * Auth IDを指定した場合も、同じIDの新しいAppUser行だけを作る。
         */
        (key) => ({ // 試験または保存処理のコールバック
          ...users[key],
          name: "F12 fixture",
        }),
      ),
      memberships: Object.values(actors).map( // 各要素を保存・照合用の値へ写すメソッド / 値を列挙する関数
        /**
         * 本人・所属・クラブを対応させた状態を保存入力にする。
         */
        (actor) => ({ // 試験または保存処理のコールバック
          id: actor.membershipId,
          userId: actor.userId,
          clubId: actor.clubId,
          role: actor.role,
          status: actor.status,
        }),
      ),
      children: [
        {
          id: children.own,
          parentId: users.aMember.id,
          name: "本人の子ども",
        },
        {
          id: children.otherParent,
          parentId: users.aCoach.id,
          name: "他保護者の子ども",
        },
      ],
      childMemberships: [
        {
          id: randomUUID(), // UUIDを生成する関数
          clubId: clubs.a.id,
          childId: children.own,
          parentUserId: users.aMember.id,
          status: "ACTIVE",
        },
        {
          id: randomUUID(), // UUIDを生成する関数
          clubId: clubs.a.id,
          childId: children.otherParent,
          parentUserId: users.aCoach.id,
          status: "ACTIVE",
        },
      ],
      admins: [
        {
          ...users.platformAdmin,
          name: "F12 independent admin",
          role: "DEVELOPER",
          isActive: true,
        },
      ],
      events: [],
      notices: [],
      eventAttachments: [],
      noticeAttachments: [],
      eventReads: [],
      noticeReads: [],
      memos: [],
      settings: [],
      targets: [],
      deliveries: [],
      jobs: [],
      reports: [],
    };
    const features = new Set(options.features ?? []); // 重複しない集合のコンストラクター
    for (const feature of features) {
      if (!["content", "attachments", "activity", "line", "support", "copySources"].includes(feature)) { // 許可値に含まれるか調べるメソッド
        throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
      }
    }
    const related = {} as Record<"a" | "b", MvpDatabaseFixture["related"]["a"]>; // キーと値の対応型 / プロパティまたは配列要素を参照する型 / 認可・関連行のfixture ID型
    for (const key of ["a", "b"] as const) { // リテラル型を保持するconstアサーション
      const clubId = clubs[key].id;
      const owner = key === "a" ? actors.aOwner : actors.bOwner;
      const member = key === "a" ? actors.aMember : actors.bMember;
      const item: {
        events?: MvpFixtureContent; // 公開状態別コンテンツID型
        notices?: MvpFixtureContent; // 公開状態別コンテンツID型
        sourceEvents: string[]; // 文字列型
        eventAttachmentId?: string; // 文字列型
        noticeAttachmentId?: string; // 文字列型
        storageJobId?: string; // 文字列型
        lineSettingId?: string; // 文字列型
        targetId?: string; // 文字列型
        deliveryId?: string; // 文字列型
        webhookKey?: string; // 文字列型
        supportReportId?: string; // 文字列型
      } = {
        sourceEvents: [],
      };
      if (
        features.has("content") || // 登録の有無を確認するメソッド
        features.has("attachments") || // 登録の有無を確認するメソッド
        features.has("activity") || // 登録の有無を確認するメソッド
        features.has("line") // 登録の有無を確認するメソッド
      ) {
        item.events = Object.freeze({ // 設定の変更を防ぐ関数
          draft: randomUUID(), // UUIDを生成する関数
          member: randomUUID(), // UUIDを生成する関数
          coach: randomUUID(), // UUIDを生成する関数
        });
        item.notices = Object.freeze({ // 設定の変更を防ぐ関数
          draft: randomUUID(), // UUIDを生成する関数
          member: randomUUID(), // UUIDを生成する関数
          coach: randomUUID(), // UUIDを生成する関数
        });
        for (const kind of ["draft", "member", "coach"] as const) { // リテラル型を保持するconstアサーション
          const status = kind === "draft" ? "DRAFT" : "PUBLISHED";
          const targetRoles: ClubMemberRole[] = [ // 所属ロール型
            "OWNER",
            kind === "coach" ? "COACH" : "MEMBER",
          ];
          const publication = kind === "draft" ? null : new Date("2026-03-01T00:00:00.000Z"); // 日時を生成するコンストラクター
          rows.events.push({ // 作成前の行・IDを登録するメソッド
            id: item.events[kind],
            clubId,
            title: `F12 ${kind}`,
            content: "架空のイベント本文",
            status,
            targetRoles,
            startAt: new Date("2026-03-10T00:00:00.000Z"), // 日時を生成するコンストラクター
            endAt: new Date("2026-03-10T02:00:00.000Z"), // 日時を生成するコンストラクター
            genre: "PRACTICE",
            createdByMembershipId: owner.membershipId,
            updatedByMembershipId: owner.membershipId,
            firstPublishedAt: publication,
            readRequiredAt: publication,
          });
          rows.notices.push({ // 作成前の行・IDを登録するメソッド
            id: item.notices[kind],
            clubId,
            title: `F12 ${kind}`,
            content: "架空のお知らせ本文",
            status,
            targetRoles,
            createdByMembershipId: owner.membershipId,
            updatedByMembershipId: owner.membershipId,
            firstPublishedAt: publication,
            readRequiredAt: publication,
          });
        }
      }
      if (
        features.has("attachments") && // 登録の有無を確認するメソッド
        item.events &&
        item.notices
      ) {
        item.eventAttachmentId = randomUUID(); // UUIDを生成する関数
        item.noticeAttachmentId = randomUUID(); // UUIDを生成する関数
        item.storageJobId = randomUUID(); // UUIDを生成する関数
        rows.eventAttachments.push({ // 作成前の行・IDを登録するメソッド
          id: item.eventAttachmentId,
          clubId,
          eventId: item.events.member,
          storagePath: `clubs/${clubId}/events/${item.events.member}/${item.eventAttachmentId}.pdf`,
          fileName: "fixture.pdf",
          mimeType: "application/pdf",
          sizeBytes: 64,
        });
        rows.noticeAttachments.push({ // 作成前の行・IDを登録するメソッド
          id: item.noticeAttachmentId,
          clubId,
          noticeId: item.notices.member,
          storagePath: `clubs/${clubId}/notices/${item.notices.member}/${item.noticeAttachmentId}.pdf`,
          fileName: "fixture.pdf",
          mimeType: "application/pdf",
          sizeBytes: 64,
        });
        rows.jobs.push({ // 作成前の行・IDを登録するメソッド
          id: item.storageJobId,
          clubId,
          bucket: CLUB_ATTACHMENT_BUCKET,
          storagePath: `clubs/${clubId}/events/${item.events.member}/${item.storageJobId}.pdf`,
          sourceType: "EVENT_ATTACHMENT",
          status: "COMPLETED",
        });
      }
      if (
        features.has("activity") && // 登録の有無を確認するメソッド
        item.events &&
        item.notices
      ) {
        rows.eventReads.push({ // 作成前の行・IDを登録するメソッド
          id: randomUUID(), // UUIDを生成する関数
          clubId,
          eventId: item.events.member,
          membershipId: member.membershipId,
        });
        rows.noticeReads.push({ // 作成前の行・IDを登録するメソッド
          id: randomUUID(), // UUIDを生成する関数
          clubId,
          noticeId: item.notices.member,
          membershipId: member.membershipId,
        });
        rows.memos.push({ // 作成前の行・IDを登録するメソッド
          id: randomUUID(), // UUIDを生成する関数
          clubId,
          eventId: item.events.member,
          membershipId: member.membershipId,
          content: "架空の個人メモ",
        });
      }
      if (
        features.has("line") && // 登録の有無を確認するメソッド
        item.events
      ) {
        item.lineSettingId = randomUUID(); // UUIDを生成する関数
        item.targetId = randomUUID(); // UUIDを生成する関数
        item.deliveryId = randomUUID(); // UUIDを生成する関数
        item.webhookKey = randomUUID(); // UUIDを生成する関数
        rows.settings.push({ // 作成前の行・IDを登録するメソッド
          id: item.lineSettingId,
          clubId,
          webhookKey: item.webhookKey,
          lineChannelId: `fixture-${scopeId}`,
          lineChannelAccessTokenEncrypted: "F12_FAKE_CIPHERTEXT_NEVER_DECRYPT",
          lineChannelSecretEncrypted: "F12_FAKE_CIPHERTEXT_NEVER_DECRYPT",
        });
        rows.targets.push({ // 作成前の行・IDを登録するメソッド
          id: item.targetId,
          clubId,
          lineSettingId: item.lineSettingId,
          lineGroupId: `fixture-${scopeId}-${key}`,
          targetName: "架空の無効通知先",
          targetRoles: ["OWNER", "MEMBER"],
          isEnabled: false,
        });
        rows.deliveries.push({ // 作成前の行・IDを登録するメソッド
          id: item.deliveryId,
          clubId,
          targetId: item.targetId,
          eventId: item.events.member,
          contentType: "EVENT",
          contentTitle: "架空の送信履歴",
          requestedByMembershipId: owner.membershipId,
          status: "SENT",
          sentAt: new Date("2026-03-01T00:00:00.000Z"), // 日時を生成するコンストラクター
          idempotencyKey: `mvp-f12-${item.deliveryId}`,
          requestId: randomUUID(), // UUIDを生成する関数
        });
      }
      if (features.has("support")) { // 登録の有無を確認するメソッド
        item.supportReportId = randomUUID(); // UUIDを生成する関数
        rows.reports.push({ // 作成前の行・IDを登録するメソッド
          id: item.supportReportId,
          clubId,
          membershipId: owner.membershipId,
          category: "BUG",
          status: "OPEN",
          message: "架空のサポート本文",
          handledByPlatformAdminId: users.platformAdmin.id,
        });
      }
      if (features.has("copySources")) { // 登録の有無を確認するメソッド
        for (const status of ["DRAFT", "PUBLISHED"] as const) { // リテラル型を保持するconstアサーション
          const id = randomUUID(); // UUIDを生成する関数
          item.sourceEvents.push(id); // 作成前の行・IDを登録するメソッド
          const publication = status === "PUBLISHED" ? new Date("2026-02-01T00:00:00.000Z") : null; // 日時を生成するコンストラクター
          rows.events.push({ // 作成前の行・IDを登録するメソッド
            id,
            clubId,
            status,
            firstPublishedAt: publication,
            readRequiredAt: publication,
            title: `F12 source ${status}`,
            targetRoles: ["OWNER", "MEMBER"],
            startAt: new Date("2026-02-10T00:00:00.000Z"), // 日時を生成するコンストラクター
            endAt: new Date("2026-02-10T02:00:00.000Z"), // 日時を生成するコンストラクター
            genre: "PRACTICE",
            createdByMembershipId: owner.membershipId,
          });
        }
      }
      Object.freeze(item.sourceEvents); // 設定の変更を防ぐ関数
      related[key] = Object.freeze(item); // 設定の変更を防ぐ関数
    }
    const fixture: MvpDatabaseFixture = Object.freeze({ // 認可・関連行のfixture ID型 / 設定の変更を防ぐ関数
      runId: configuration.runId,
      scopeId,
      clubs: Object.freeze(clubs), // 設定の変更を防ぐ関数
      users: Object.freeze(users), // 設定の変更を防ぐ関数
      actors: Object.freeze(actors), // 設定の変更を防ぐ関数
      children,
      related: Object.freeze(related), // 設定の変更を防ぐ関数
    });
    states.set(fixture, { // 所有台帳を登録するメソッド
      rows,
      jobs: new Set(rows.jobs.map( // 重複しない集合のコンストラクター / 各要素を保存・照合用の値へ写すメソッド
        /**
         * clubIdがSetNullされても追跡できるよう、作成前にジョブIDを記録する。
         */
        (job) => job.id!, // 試験または保存処理のコールバック
      )),
      phase: "planned",
    });
    return fixture;
  } catch {
    throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
  }
}

/**
 * ガード後の専用clientで、計画済みの全行を一つのtransactionに保存する。
 * 途中失敗はrollbackし、衝突した既存AppUserをcleanup対象にしない。
 */
export async function seedMvpDatabaseFixture( // 計画した行を一体保存する関数
  database: PrismaClient, // 専用DB clientの型
  fixture: MvpDatabaseFixture, // 認可・関連行のfixture ID型
): Promise<void> { // 非同期結果の型 / 戻り値を使わない型
  const state = stateOf(fixture); // 非公開の所有台帳を取得する関数
  if (state.phase !== "planned") {
    throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
  }
  state.phase = "seeding";
  try {
    const rows = state.rows;
    await database.$transaction( // 一体保存・削除の実transactionを実行するメソッド
      /**
       * 親から関連行へ順に作成し、途中状態を他のケースへ残さない。
       */
      async (transaction) => { // 試験または保存処理のコールバック
        if (rows.clubs.length > 0) {
          await transaction.club.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.clubs,
          });
        }
        if (rows.users.length > 0) {
          await transaction.appUser.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.users,
          });
        }
        if (rows.memberships.length > 0) {
          await transaction.clubMembership.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.memberships,
          });
        }
        if (rows.children.length > 0) {
          await transaction.child.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.children,
          });
        }
        if (rows.childMemberships.length > 0) {
          await transaction.childClubMembership.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.childMemberships,
          });
        }
        if (rows.admins.length > 0) {
          await transaction.platformAdmin.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.admins,
          });
        }
        if (rows.events.length > 0) {
          await transaction.clubEvent.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.events,
          });
        }
        if (rows.notices.length > 0) {
          await transaction.clubNotice.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.notices,
          });
        }
        if (rows.eventAttachments.length > 0) {
          await transaction.clubEventAttachment.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.eventAttachments,
          });
        }
        if (rows.noticeAttachments.length > 0) {
          await transaction.clubNoticeAttachment.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.noticeAttachments,
          });
        }
        if (rows.eventReads.length > 0) {
          await transaction.clubEventRead.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.eventReads,
          });
        }
        if (rows.noticeReads.length > 0) {
          await transaction.clubNoticeRead.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.noticeReads,
          });
        }
        if (rows.memos.length > 0) {
          await transaction.clubEventMemo.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.memos,
          });
        }
        if (rows.settings.length > 0) {
          await transaction.clubLineSetting.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.settings,
          });
        }
        if (rows.targets.length > 0) {
          await transaction.clubLineTarget.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.targets,
          });
        }
        if (rows.deliveries.length > 0) {
          await transaction.clubLineDelivery.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.deliveries,
          });
        }
        if (rows.jobs.length > 0) {
          await transaction.storageDeletionJob.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.jobs,
          });
        }
        if (rows.reports.length > 0) {
          await transaction.supportReport.createMany({ // 計画したfixture行を一括保存するメソッド
            data: rows.reports,
          });
        }
      },
      {
        timeout: 15_000,
      },
    );
    state.phase = "ready";
  } catch {
    state.phase = "planned";
    throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
  }
}

/**
 * seed後のケースが追加するStorage削除ジョブのUUIDを、保存前に所有台帳へ登録する。
 */
export function reserveMvpStorageDeletionJob(fixture: MvpDatabaseFixture): string { // 追加ジョブのUUIDを保存前に登録する関数 / 認可・関連行のfixture ID型 / 文字列型
  const state = stateOf(fixture); // 非公開の所有台帳を取得する関数
  if (state.phase !== "ready") {
    throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
  }
  const id = randomUUID(); // UUIDを生成する関数
  state.jobs.add(id); // 所有IDを登録するメソッド
  return id;
}

/**
 * LINEのRestrictとStorageのSetNullを考慮し、登録範囲だけを一体で削除する。
 * 保存失敗した計画には触らず、失敗したcleanupは台帳を残して再試行できる。
 */
export async function cleanupMvpDatabaseFixture( // 所有台帳の範囲だけを削除する関数
  database: PrismaClient, // 専用DB clientの型
  fixture: MvpDatabaseFixture, // 認可・関連行のfixture ID型
): Promise<void> { // 非同期結果の型 / 戻り値を使わない型
  const state = stateOf(fixture); // 非公開の所有台帳を取得する関数
  if (
    state.phase === "planned" ||
    state.phase === "cleaned"
  ) {
    return;
  }
  if (state.phase !== "ready") {
    throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
  }
  state.phase = "cleaning";
  try {
    const clubIds = state.rows.clubs.map( // 各要素を保存・照合用の値へ写すメソッド
      /**
       * 公開オブジェクトではなく、作成時の非公開台帳からクラブIDを取り出す。
       */
      (club) => club.id!, // 試験または保存処理のコールバック
    );
    const userIds = state.rows.users.map( // 各要素を保存・照合用の値へ写すメソッド
      /**
       * このfixtureが新規作成した本人だけを選ぶ。
       */
      (user) => user.id, // 試験または保存処理のコールバック
    );
    await database.$transaction( // 一体保存・削除の実transactionを実行するメソッド
      /**
       * 依存する履歴・ジョブを先に処理し、他クラブ所属があれば本人を消さない。
       */
      async (transaction) => { // 試験または保存処理のコールバック
        await transaction.clubLineDelivery.deleteMany({ // 登録範囲に限定して削除するメソッド
          where: {
            clubId: {
              in: clubIds,
            },
          },
        });
        await transaction.storageDeletionJob.deleteMany({ // 登録範囲に限定して削除するメソッド
          where: {
            OR: [
              {
                clubId: {
                  in: clubIds,
                },
              },
              {
                id: {
                  in: [...state.jobs],
                },
                clubId: null,
              },
            ],
          },
        });
        await transaction.club.deleteMany({ // 登録範囲に限定して削除するメソッド
          where: {
            id: {
              in: clubIds,
            },
          },
        });
        await transaction.appUser.deleteMany({ // 登録範囲に限定して削除するメソッド
          where: {
            id: {
              in: userIds,
            },
            memberships: {
              none: {},
            },
          },
        });
        await transaction.platformAdmin.deleteMany({ // 登録範囲に限定して削除するメソッド
          where: {
            id: {
              in: state.rows.admins.map( // 各要素を保存・照合用の値へ写すメソッド
                /**
                 * このfixtureが作成した独立運営者だけを選ぶ。
                 */
                (admin) => admin.id, // 試験または保存処理のコールバック
              ),
            },
            handledSupportReports: {
              none: {},
            },
          },
        });
        const remainingUsers = await transaction.appUser.count({ // 条件に合う行数を取得するメソッド
          where: {
            id: {
              in: userIds,
            },
          },
        });
        const remainingAdmins = await transaction.platformAdmin.count({ // 条件に合う行数を取得するメソッド
          where: {
            id: {
              in: state.rows.admins.map( // 各要素を保存・照合用の値へ写すメソッド
                /**
                 * 他クラブの報告に参照される運営者を誤って完了扱いにしない。
                 */
                (admin) => admin.id, // 試験または保存処理のコールバック
              ),
            },
          },
        });
        if (
          remainingUsers !== 0 ||
          remainingAdmins !== 0
        ) {
          throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
        }
      },
      {
        timeout: 15_000,
      },
    );
    state.phase = "cleaned";
  } catch {
    state.phase = "ready";
    throw new Error(FIXTURE_ERROR); // 例外を生成するコンストラクター
  }
}
