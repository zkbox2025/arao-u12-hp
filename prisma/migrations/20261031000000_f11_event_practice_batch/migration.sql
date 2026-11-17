-- prisma/migrations/20261031000000_f11_event_practice_batch/migration.sql
-- 完了記録をF11でも再利用できるよう、操作種別・対象月・作成件数のCHECKだけを変更する。
-- F10の既存行は同じ条件で引き続き有効とし、既存migrationとデータは変更しない。
-- FK・unique・trigger・RLS・Data API権限・UUIDとhashのCHECKは維持する。

BEGIN;

-- DROPとADDを同じALTER TABLE内で行い、既存行も新CHECKの検証対象にする。
-- NOT VALIDやデータの削除・補正は使わず、既存F10行との整合性を保つ。
ALTER TABLE public."ClubEventBatchOperation"
    DROP CONSTRAINT "ClubEventBatchOperation_operation_check",
    DROP CONSTRAINT "ClubEventBatchOperation_target_month_check",
    DROP CONSTRAINT "ClubEventBatchOperation_created_count_check",
    ADD CONSTRAINT "ClubEventBatchOperation_operation_check"
        CHECK (
            "operation" IN (
                'COPY_PREVIOUS_MONTH',
                'CREATE_PRACTICE_BATCH'
            )
        ),
    ADD CONSTRAINT "ClubEventBatchOperation_target_month_check"
        CHECK (
            char_length("targetMonth") = 7 -- 対象月の文字数を検証する関数
            AND "targetMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
            AND "targetMonth" NOT LIKE '0000-%'
            AND (
                (
                    "operation" = 'COPY_PREVIOUS_MONTH'
                    AND "targetMonth" <> '0001-01'
                )
                OR "operation" = 'CREATE_PRACTICE_BATCH'
            )
        ),
    ADD CONSTRAINT "ClubEventBatchOperation_created_count_check"
        CHECK (
            "createdCount" >= 1
            AND (
                (
                    "operation" = 'COPY_PREVIOUS_MONTH'
                    AND "createdCount" <= 100
                )
                OR (
                    "operation" = 'CREATE_PRACTICE_BATCH'
                    AND "createdCount" <= 31
                )
            )
        );

COMMIT;
