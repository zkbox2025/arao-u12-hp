クラブHP運用メモ
・VSCode内の特定のプロジェクトのコードを全てコピペする方法
機能：ChatGPT & Claude Code Exporter（拡張機能にてインストール済み）
方法：全てファイルを閉じた状態でCmd + Option + Xをする。
注意：以下はファイルを右クリックしてExclude from Exportを選択すること（コピペ不可にするため）（.vscode/project-export.jsonに保存される）
.env.local
.env.prod
.DS_Store
tsconfig.tsbuildinfo

◯本番DB、本番環境へのマージはアプリ完成までやらないでおく

◯ローカルでの検証するコマンド（scripts/validate-env.mjs（環境変数のチェックコード）,tests/foundation.test.ts（テストコード）,vitest.config.ts（どのテストコードを読むべきか選定するコード））

「npm run verify:local」とターミナルでコマンドを打つと

以下の点をプロジェクト内のコードを自動でチェックする
環境変数の設定ミスがないか （単体確認：npm run env:validate）
データベースの設計に矛盾がないか （単体確認：npm run prisma:validate）
コードに壊れている部分（型エラーなど）がないか （単体確認：npm run typecheck）
自動テスト（Vitest）でsample.test.ts内に書いてある自動検証コードの検証がすべてクリアしているか実行 （単体確認：npm run test）
Vercelでビルドエラーが起きないか （単体確認：npm run build）

※sample.test.tsにお知らせの既読機能の検証など検証を書いておくと、npm run verify:localを実行するだけで自動検証してくれる。ぽちぽちしなくていい。ありがたい。
※「npm run test:watch」とすると、テストコードを実行監視しながら開発が進められるのでおすすめ。

◯コードの検証をするコマンド（eslint.config.mjs）
「npm run lint」とターミナルにコマンドを打つと

以下の点を自動でチェックする
アプリの表示速度が遅くなるような書き方をしていないか
宣言したのに使っていない変数がある
など


◯今後、Prismaスキーマを変更するときは次の順番です。

npx dotenv-cli -e .env.local -- npx prisma format


npx dotenv-cli -e .env.local -- \
  npx prisma migrate dev \
  --name 変更内容 \
  --create-only

生成されたmigration.sqlを確認し、必要なCHECK制約などを書き足します。

npx dotenv-cli -e .env.local -- npx prisma migrate dev

適用済みの過去のmigration.sqlは編集しません。

本番ではmigrate devではなく、未適用の履歴だけを適用する次のコマンドを使用します。

npx dotenv-cli -e .env.prod -- npx prisma migrate deploy

◯本番DBを変更前にバックアップをする

◯cronについて
・Vercel Hobby（無料版）の１枠（1日1回1時間以内の制限あり）
api/cron/delete-old-security-logs
・Supabase Cronについて
api/cron/club-line-deliveries
api/cron/storage-deletions

※ローカルのsupabase cronの立ち上げる場合のURL
コマンド：npx next dev \
  --hostname 0.0.0.0 \
  --port 3000
URL：http://192.168.210.198:3000/api/cron/club-line-deliveriesなど
ローカルではターミナルにクロンの200が表示される