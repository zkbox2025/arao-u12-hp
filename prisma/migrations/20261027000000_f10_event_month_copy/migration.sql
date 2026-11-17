-- prisma/migrations/20261027000000_f10_event_month_copy/migration.sql
-- 前月予定の複製と同一transactionで保存する完了記録を追加する。
-- CHECK・triggerはPrisma schemaで表現できないため、このmigrationで定義する。
-- F01の同クラブ参照・SetNull補正・clubId不変の共通関数が適用済みであることを前提とする。

BEGIN;

-- 本文やイベントへの関連行を持たず、操作の照合値と完了結果だけを保持する。
CREATE TABLE public."ClubEventBatchOperation" (
    "id" TEXT NOT NULL, -- 操作記録IDの文字列型。Prismaのuuid()で生成する
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 記録時刻のミリ秒精度日時型
    "clubId" TEXT NOT NULL, -- 操作を所属させるクラブIDの文字列型
    "requestId" TEXT NOT NULL, -- 小文字UUID v4の操作識別子を保持する文字列型
    "operation" TEXT NOT NULL, -- 固定の操作種別を保持する文字列型
    "targetMonth" TEXT NOT NULL, -- 対象月をYYYY-MMで保持する文字列型
    "inputHash" TEXT NOT NULL, -- 実行入力の小文字SHA-256を保持する文字列型
    "executedByMembershipId" TEXT, -- 実行者削除後のnullを許す履歴参照IDの文字列型
    "createdCount" INTEGER NOT NULL, -- 完了した作成件数の整数型
    "completedAt" TIMESTAMP(3) NOT NULL, -- 完了日時のミリ秒精度日時型。途中状態用の既定値は設けない

    CONSTRAINT "ClubEventBatchOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClubEventBatchOperation_operation_check"
        CHECK ("operation" = 'COPY_PREVIOUS_MONTH'),
    CONSTRAINT "ClubEventBatchOperation_request_id_check"
        CHECK (
            char_length("requestId") = 36 -- 文字数を数える関数。末尾の改行等を許可しない
            AND "requestId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        ),
    CONSTRAINT "ClubEventBatchOperation_target_month_check"
        CHECK (
            char_length("targetMonth") = 7 -- 対象月の文字数を検証する関数
            AND "targetMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
            AND "targetMonth" NOT LIKE '0000-%'
            AND "targetMonth" <> '0001-01'
        ),
    CONSTRAINT "ClubEventBatchOperation_input_hash_check"
        CHECK (
            char_length("inputHash") = 64 -- SHA-256の16進表記の文字数を検証する関数
            AND "inputHash" ~ '^[0-9a-f]{64}$'
        ),
    CONSTRAINT "ClubEventBatchOperation_created_count_check"
        CHECK (
            "createdCount" >= 1
            AND "createdCount" <= 100
        )
);

-- Membership削除時の履歴参照解除で、対象の操作記録を検索するための索引。
CREATE INDEX "ClubEventBatchOperation_executedByMembershipId_idx"
    ON public."ClubEventBatchOperation" ("executedByMembershipId");

-- 同じクラブ内での再送を一意にし、別クラブでの同じrequestIdは独立して扱う。
CREATE UNIQUE INDEX "ClubEventBatchOperation_clubId_requestId_key"
    ON public."ClubEventBatchOperation" ("clubId", "requestId");

-- クラブ自体の削除時だけ、所属する完了記録を削除する。
ALTER TABLE public."ClubEventBatchOperation"
    ADD CONSTRAINT "ClubEventBatchOperation_clubId_fkey"
    FOREIGN KEY ("clubId")
    REFERENCES public."Club" ("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- clubIdは必須のまま保持し、Membership削除時には実行者の単一FKだけを解除する。
ALTER TABLE public."ClubEventBatchOperation"
    ADD CONSTRAINT "ClubEventBatchOperation_executedByMembershipId_fkey"
    FOREIGN KEY ("executedByMembershipId")
    REFERENCES public."ClubMembership" ("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- 実行者を設定・変更する際は、操作記録と同じクラブのMembershipであることを保証する。
-- 新規保存時の実行者必須・ACTIVE・管理者権限の確認は、後続Repositoryで別途行う。
CREATE TRIGGER "ClubEventBatchOperation_executor_club_match"
    BEFORE INSERT OR UPDATE
    ON public."ClubEventBatchOperation"
    FOR EACH ROW
    EXECUTE FUNCTION public."enforce_same_club_reference"( -- F01の同クラブ参照検証関数を再利用する
        'executedByMembershipId',
        'ClubMembership'
    );

-- 更新によって別クラブへ完了記録を移せないようにする。
CREATE TRIGGER "ClubEventBatchOperation_club_id_immutable"
    BEFORE UPDATE OF "clubId"
    ON public."ClubEventBatchOperation"
    FOR EACH ROW
    EXECUTE FUNCTION public."prevent_club_id_change"(); -- F01のclubId変更禁止関数を再利用する

-- ブラウザー向けpolicyを作らず、既存のサーバーDB接続だけで利用する。
ALTER TABLE public."ClubEventBatchOperation" ENABLE ROW LEVEL SECURITY;

-- 作成roleのdefault privilegesに依存せず、既存のData API用ロールとPUBLICから権限を剥奪する。
REVOKE ALL PRIVILEGES
    ON TABLE public."ClubEventBatchOperation"
    FROM PUBLIC, anon, authenticated;

COMMIT;
