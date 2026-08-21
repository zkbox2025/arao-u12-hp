//docs/troubleshooting2.md
失敗ログ

### [2026-08-18] role判定のunit testでDATABASE_URL未設定エラーが発生

【影響範囲】

発生環境：ローカル開発環境（Vitest実行時）

緊急度：低
本番環境やホームページの動作には影響しないが、unit testの実行ができない状態だった。

【症状】

何が起きたか：

`isClubAdminRole()`のunit testを実行したところ、テストが1件も実行されず、`DATABASE_URL`が設定されていないというエラーでテストファイル全体が失敗した。

期待していた動作：

以下の4種類のroleについて、管理権限の有無を判定するテストが実行されること。

* `OWNER`：管理権限あり
* `COACH`：管理権限あり
* `OFFICER`：管理権限あり
* `MEMBER`：管理権限なし

【再現手順】

1. `app/(club-app)/club/club-membership-authorization.test.ts`から、`club-membership-authorization.ts`の`isClubAdminRole()`をimportする。

2. 次のコマンドを実行する。

```bash
npm test -- club-membership-authorization.test.ts
```

3. テストが実行される前に、Prisma Clientの初期化処理でエラーが発生する。

【エラーメッセージ / ログ】

```text
Error: DATABASE_URL が設定されていません。
.env.local または .env.prod を読み込んでください。

Test Files 1 failed
Tests no tests
```

エラーの発生箇所：

```text
src/infrastructure/prisma/client.ts
app/(club-app)/club/club-membership-authorization.ts
app/(club-app)/club/club-membership-authorization.test.ts
```

また、次のVite警告も表示された。

```text
Your Vite config uses features that are unsupported by
configLoader: 'native'

ESM syntax in a file loaded as CommonJS
(vitest.config.ts)
```

ただし、このVite警告は今回テストが失敗した直接の原因ではない。

【切り分けメモ（どこが怪しいか）】

* テスト結果が`0 test`になっていたため、テスト関数の判定で失敗したのではなく、テストファイルのimport処理中に停止していると判断した。
* `club-membership-authorization.ts`は`isClubAdminRole()`以外にも、Prisma、Supabase、Next.jsのサーバー機能をimportしていた。
* JavaScript／TypeScriptでは、1つの関数だけをimportする場合でも、その関数が定義されているファイル全体が読み込まれる。
* `server-only`のVitest用aliasは設定済みだったが、Prisma Clientの読み込みまでは無効化されない。
* `vitest.config`の`include`はテスト対象ファイルを選定する設定であり、テスト対象がimportするPrismaなどの依存関係を除外する設定ではない。

【原因（Root Cause）】

* DBを使わない純粋なrole判定関数`isClubAdminRole()`が、PrismaやSupabaseを使用するサーバー認可ファイル内に定義されていた。
* テストが`club-membership-authorization.ts`をimportしたことで、同ファイルが依存するPrisma Clientも読み込まれた。
* Prisma Clientの初期化時に`DATABASE_URL`の存在確認が実行された。
* テストプロセスに`DATABASE_URL`が設定されていなかったため、`describe()`や`it()`が登録される前に例外が発生した。
* その結果、Vitestでは`0 test`と表示された。

【結論】

* `isClubAdminRole()`の実装やテスト内容に問題があったわけではない。
* DBを使わないunit testが、Prismaを使用するサーバー認可ファイルに依存していたことが原因だった。
* 純粋なrole判定処理をサーバー認可処理から分離する必要があった。

【解決策（Fix）】

DBやSupabaseに依存しないrole判定処理を、次のドメインファイルへ分離した。

```text
domain/club/club-member-role.ts
```

分離した処理：

```ts
import type { ClubMemberRole } from "@/types/prisma";

const CLUB_ADMIN_ROLES =
  new Set<ClubMemberRole>([
    "OWNER",
    "COACH",
    "OFFICER",
  ]);

export function isClubAdminRole(
  role: ClubMemberRole,
): boolean {
  return CLUB_ADMIN_ROLES.has(role);
}
```

`club-membership-authorization.ts`では、分離した関数をimportして使用するように変更した。

```ts
import {
  isClubAdminRole,
} from "@/domain/club/club-member-role";
```

テストファイルも次へ移動した。

```text
domain/club/club-member-role.test.ts
```

これにより、role判定のunit testではPrisma、Supabase、`server-only`を読み込まなくなった。

【確認（動作検証）】

個別テストを実行した。

```bash
npm test -- domain/club/club-member-role.test.ts
```

結果：

```text
Test Files 1 passed
Tests 4 passed
```

全テストを実行した。

```bash
npm test
```

結果：

```text
Test Files 3 passed
Tests 14 passed
```

TypeScript型チェックを実行した。

```bash
npm run typecheck
```

結果：

```text
エラーなし
```

ESLintを実行した。

```bash
npm run lint
```

結果：

```text
0 errors
3 warnings
```

残っている3件は既存コードの未使用変数に関する警告であり、今回追加したrole判定処理によるエラーではない。

【よくある落とし穴】

* 1つの関数だけをimportしても、そのファイルのトップレベルにあるimportや初期化処理はすべて実行される。
* `server-only`のaliasを設定しても、PrismaやSupabaseなど別の依存関係までは自動的に無効化されない。
* Vitestの`include`設定は、実行対象のテストファイルを選ぶだけである。テストファイルから読み込まれる依存モジュールは通常どおり実行される。
* `Tests no tests`や`0 test`は、テストが見つからなかった場合だけでなく、import中にエラーが起きた場合にも表示される。
* `.env.local`を読み込ませれば一時的にエラーを回避できる可能性はあるが、DBを使わないunit testをDB環境変数に依存させる設計は避ける。
* ViteのESM/CommonJS警告は今回のテスト失敗とは別問題である。必要に応じて`vitest.config.ts`を`vitest.config.mts`へ変更して解消する。

【再発防止（Prevention）】

* DBを使わない判定関数や変換処理は、`domain`配下の純粋なモジュールへ配置する。
* Prisma、Supabase、`next/navigation`、`server-only`を使用する処理は、サーバー認可ファイルへ限定する。
* unit testでは、可能な限りDB・環境変数・外部サービスに依存しない関数を直接テストする。
* テストが`0 test`で失敗した場合は、最初にテストファイルのimport先とトップレベルの初期化処理を確認する。
* 変更後は次のコマンドで継続的に確認する。

```bash
npm test
npm run typecheck
npm run lint
```

---


