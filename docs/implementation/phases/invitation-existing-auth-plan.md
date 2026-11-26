<!-- docs/implementation/phases/invitation-existing-auth-plan.md -->

# 招待の課題の解消：Auth 登録済み・AppUser 未作成の人を招待できるようにする（設計）

- 作成：2026-11-25（設計のみ。コード・DB・Auth は変更していない）。
- 粒度：HP管理権限のDB化（`website-admin-db-plan.md`）とは**別の実装単位**。
- 利用者の方針：Auth を作り直さず、別メールを要求せず、**既存の Auth UID に紐づけて** `AppUser` を整備し、招待・受諾できるようにする。
- 値（ユーザーID、メール）は、記録しない。

## 1. 原因（コードの読取り）

`src/application/club/invitation/send-club-invitation.ts`（準備の処理）の分岐：

| 状態 | 動作 |
| --- | --- |
| 招待に既知の Auth ID がある（`authUserId` か `existingUserId`）かつメール確認済み | **EXISTING_USER**：Auth のリンクは作らず、クラブの招待 URL だけをメールする（問題なし） |
| 既知の Auth ID がある、未確認 | NEW_USER：同じ ID を期待して、`generateLink(invite)` を再発行 |
| **既知の Auth ID がない** | NEW_USER：`generateLink(invite)` を呼ぶ |

`existingUserId` は、**`AppUser` が同じメールで見つかったときだけ**入る。したがって、**Auth にはいるが `AppUser` がない人**は、既知の ID がなく、
`generateLink(invite)` が「登録済み」で失敗（422）し、招待が準備中のまま残る（運用書 §19.69）。
受諾側（`matchesAuthUser`、`getClubInvitationAcceptance`）は、ログイン中の Auth の ID・メールと、招待の `authUserId`・メールの一致を確認する作りで、
**既存ユーザーの経路がすでにある**。足りないのは、準備段階で「メールから既存の Auth ユーザーを見つける」処理だけである。

## 2. 設計

### 2.1 変更の範囲（最小）

1. **Auth のユーザーを、メールで検索する関数**を、`src/infrastructure/supabase/club-invitation-auth.ts` に追加する（読取りのみ）。
   - 戻り値：見つからなければ `null`。あれば、ID・正規化したメール・確認済みか。
   - 検索方法の案：(A) `auth.users` を、Prisma の `$queryRaw` で、正規化メールの完全一致で読む（読取りのみ、1件）。
     (B) Supabase の管理 API の `listUsers` を、ページごとに走査する（ユーザー数が増えると遅い）。
     **推奨は (A)**。Prisma は `postgres` ロールで接続し、`auth.users` を読める（運用書 B-1 で確認済み）。
     失敗・複数件は、固定メッセージのエラーにして、招待を準備中のまま止める（推測で選ばない）。
2. **準備の処理（`send-club-invitation.ts`）**：既知の Auth ID がないとき、上の関数で検索する。
   - 見つかり、メール確認済み → **EXISTING_USER**（Auth のリンクは作らない。招待 URL のみ）。ID は、見つけた ID を `verifiedAuthUser` に使う。
   - 見つかり、未確認 → 見つけた ID を `expectedAuthUserId` にして、NEW_USER（`generateLink(invite)` を再発行）。
   - 見つからない → 従来どおり NEW_USER（新規の Auth を作る）。
3. **`AppUser` の作成**は、既存の `completeClubInvitationPreparation` が、`row.authUserId`（Auth の ID）で作る（すでに実装済み）。**既存の `AppUser` は変更しない**。

### 2.2 安全性の条件

| 観点 | 条件 |
| --- | --- |
| 招待する側の権限 | 現行どおり OWNER のみ（`requireClubAppOwnerAccess`）。サーバーで再確認し、クライアントの `clubId` を根拠にしない |
| 受諾する本人の確認 | 現行どおり、ログイン中の Auth の ID とメールが、招待の `authUserId` とメールに一致し、**パスワードでログイン**している（`authenticationMethod`）こと。メールの一致のみで、他人の Auth に紐づけない |
| 既存の所属・役割・HP管理権限 | 既存の `ClubMembership` がある人は、`MEMBERSHIP_EXISTS` で拒否（現行）。`AppUser` は、`create` のみで、`update` しない。`PlatformAdmin`・`canManageWebsite` は、触らない |
| ID・メールの食い違い | 同じメールで別 ID の `AppUser`、同じ ID で別メールの `AppUser` は、現行の検証で `RULE_VIOLATION`（手動対応）。**新しい経路でも、この検証を通す** |
| 失敗時 | 準備の途中で失敗したら、現行どおり、処理権を解放し、`PREPARATION_FAILED`（再送可否つき）を返す。**Auth は、作り直さない・削除しない** |
| 再実行 | 1回目で `authUserId` が招待に記録される。2回目以降は、既知の ID があるため、検索せず、同じ経路になる（同じ結果） |
| ログ・応答 | 固定メッセージのみ。ID・メール・生のエラーは出さない |

### 2.3 既存のデータの整備（今回の移行）

- HP 管理者のうち、Auth にはいるが `AppUser` のない人は、**この修正の後、通常の招待で**会員にできる（スクリプトによる直接作成は、`website-admin-db-plan.md` の §5.2 で別途）。
- 本番の変更は、**コードのデプロイと、実際の招待ごとに、別の承認**。

## 3. 検証（実装時）

使い捨てのローカル DB で、次を試験する。

| # | ケース | 期待 |
| --- | --- | --- |
| 1 | Auth あり（確認済み）・`AppUser` なし | EXISTING_USER。メールに招待 URL のみ。`AppUser` が、同じ ID で作られる。招待は READY_TO_SEND→送信 |
| 2 | Auth あり（未確認）・`AppUser` なし | 同じ ID で `invite` を再発行。新しい Auth は作らない |
| 3 | Auth なし | 従来どおり、新規の Auth を作る |
| 4 | 受諾：本人（ID・メール一致）がパスワードでログイン | 受諾できる。既存の ID に紐づく |
| 5 | 受諾：別人（メール不一致・ID 不一致） | 拒否 |
| 6 | 既存の `ClubMembership` がある | 拒否（`MEMBERSHIP_EXISTS`）。役割・状態・`canManageWebsite` は不変 |
| 7 | 同じメールで別 ID の `AppUser`、別メールで同じ ID の `AppUser` | 手動対応（`RULE_VIOLATION`）。何も変更しない |
| 8 | 検索で複数件・失敗 | 準備中のまま止める（固定メッセージ）。何も作らない |
| 9 | 準備の途中で失敗し、再実行 | 同じ結果（重複なし） |
| 10 | 既存の `AppUser` の行 | 前後で、列の値が変わらない |

- 型チェック、lint、既存の招待のテスト（ユニット・統合）が、すべて通ること。
- 本番での確認（任意）：修正のデプロイ後、実際の招待で確認する。**本番への書込み・実メール送信は、操作ごとの承認**。

## 4. 利用者の確認が要る点

1. 検索方法は **(A) `auth.users` の読取り（`$queryRaw`）**でよいか（推奨）。
2. 実装は、この設計のとおり、最小の範囲（検索の関数1つと、準備の分岐）でよいか。
