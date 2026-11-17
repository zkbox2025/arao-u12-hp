-- 現在存在するpublicテーブルを、
-- Supabase Data APIのanon・authenticatedロールから非公開にする
REVOKE ALL PRIVILEGES
ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

-- publicスキーマのシーケンスも非公開にする
REVOKE USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
FROM anon, authenticated;

-- 今後postgresロールが新しいテーブルを作成しても、
-- anon・authenticatedへ自動的に権限を与えない
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE ALL PRIVILEGES ON TABLES
FROM anon, authenticated;

-- 今後作成されるシーケンスも自動公開しない
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE USAGE, SELECT ON SEQUENCES
FROM anon, authenticated;

-- 今後作成されるDB関数も自動公開しない
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS
FROM anon, authenticated;

-- publicロールに対する関数の自動実行権限も取り消す
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS
FROM PUBLIC;