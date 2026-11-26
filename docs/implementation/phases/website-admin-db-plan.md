<!-- docs/implementation/phases/website-admin-db-plan.md -->

# HP管理権限のDB化：調査と計画

本書は、HP管理画面の認可を、環境変数 `WEBSITE_ADMIN_USER_IDS` から、DB（`ClubMembership.canManageWebsite`）へ
移すための調査結果と計画である。本人認証は、引き続き Supabase Auth を使う。

- 作成：2026-11-25（調査・計画。F13 の範囲外の新しい粒度）。
- **F13 との関係：** F13 の規則は「既存HPの `WEBSITE_ADMIN_USER_IDS` を維持し、DB方式のHP管理認可へ切り替えない」。
  本書の段階1は、この規則の**例外**にあたる。利用者は、2026-11-25 に、AGENTS.md へ例外を明記する方針を決定した
  （F13 の既存方針は残す。HP管理認可のDB化は、F13 の範囲外の別粒度として、承認のうえ実施する。範囲は、DB化に必要な分に限る）。
- 本書は、コード・DB・Auth・環境変数・Storage を変更しない。値（ユーザーID、メール）は、記録しない。
- 本番の操作（読取りを含む）は、操作ごとの明示承認を得てから行う。

## 1. 現状（2026-11-25、コードの読取り）

| 箇所 | 認可の実態 |
| --- | --- |
| `app/admin/(dashboard)/layout.tsx` | `requireWebsiteAdmin()`（Authで本人確認し、環境変数の一覧にあるかを確認。なければ404） |
| HP管理のサーバーアクション（12ファイル） | 更新系の関数のすべてが `requireWebsiteAdmin()` を呼ぶ（ログアウト・ログインを除く） |
| ページ（`page.tsx` 14枚） | **P0 の実装前は、ページ自身の認可がなかった**（レイアウトの確認に依存）。P0 の実装後は、各ページの最初の `await` で `requireWebsiteAdmin()` を呼ぶ |
| データ取得（`lib/repositories/admin-*`） | 認可を含まない（呼び出し側のページ・アクションで確認する設計） |
| `proxy.ts` | `/admin/:path*` を対象にするが、セッションの更新のみ。認可はしない |
| Prisma | `postgres` ロールで接続する。RLS では守られない（運用書 §19.67） |

- **Auth の認証だけで許可される箇所は、見つかっていない。** 環境変数の一覧にない人は、ページ・アクションとも拒否される。
- ただし、Next.js のドキュメント（`authentication.md`「Layouts and auth checks」）は、レイアウトは画面遷移で再描画されないため、
  認可をレイアウトだけに置かず、データに近い場所で行うことを求めている。実際に、レイアウトを迂回してページを取得できるかは、
  **試験していない**（推定リスク）。
- HP のテーブル（`Contact`、`SessionApplication`、`Notice`、`Faq`、`PageContent`、`Staff`、`StaffPageSetting`、
  `MonthlyPracticePlan`、`FormNotificationSetting`、`FormSubmissionLog`、`LoginSubmissionLog`）は、`clubId` を持たない（単一クラブ前提）。
- `app/admin/liff/page.tsx` は、LIFF 経由の中継ページで、データを返さない（対象外。`next` の扱いは、別に確認する）。

## 2. 優先事項（一般会員の導入の前）

| 優先 | 項目 | 状態 |
| --- | --- | --- |
| **P0** | HP管理の14ページの最初の `await` で、`requireWebsiteAdmin()` を呼ぶ（DB化とは独立） | **実装済み（ブランチ `fix/website-admin-page-guard`。コミット・マージ・デプロイは未）** |
| P0 の試験 | 認可の関数のユニット試験（未ログイン、非管理者、管理者、複数管理者、未設定）と、ページ・アクションの構造試験（`tests/website-admin-*.test.ts`） | 実装済み（ユニットのみ。E2E は未実行） |
| P1 | HP管理のデータ取得を、認可済みの証明（戻り値）を受け取る形にする | 未着手 |
| P2 | ローカル E2E に、「会員でログインした人が、HP管理の各 URL・アクションを拒否される」ケースを追加する | 未着手 |

## 3. 段階1：ARAOのHP管理権限のDB化（現在のDBを使用）

### 3.1 利用者の決定（2026-11-25）

- HP のみの利用者・アプリ退会者の扱いは、**案A**とする：HP管理は、`status = ACTIVE` かつ `canManageWebsite = true`。
  HP のみの人も、`ACTIVE` の会員（役割は COACH か OFFICER）にする。退会（`WITHDRAWN`）・利用停止（`SUSPENDED`）は、HP管理も失う。
- 併用（union）は、**切替当日の動作確認中だけ**にする。事前に全管理者のDB設定を照合してから、DBのみへ切り替える。
  問題があれば、旧方式へ戻し、併用状態を続けない。
- `canManageWebsite` の付与・解除は、**当面、スクリプトのみ**で行う。
- 画面の追加（付与・解除の機能）は、**別作業**とする（将来のマルチテナント化の段階。§4）。
- **着手時期（決定）：** 段階1は、**今すぐ着手**する。進める順は、規則の更新 → 事前整備（付録A の照合、AppUser の整備）→ 実装 → ローカル試験。
  本番データの整備、デプロイ、認可モードの切替は、**対象と手順を確認した上で、それぞれ別の承認**で行う。
- **付与・取消し（決定）：** 当面は、スクリプトのみ。`canManageWebsite` を持つだけでは、他人への付与・取消しを許可しない。
  **STARTER でも使える手段が要る**ため、スクリプトは、アプリ側の招待機能（STANDARD と OWNER に結びつく）に依存させない。
  （招待機能への依存を避けるため、会員の作成を含めて、スクリプトで完結させる。）

### 3.2 認可の規則

HP管理者とは、次をすべて満たす人である。

1. Supabase Auth で認証済み（`getUser()`）。
2. 対象クラブ（ARAO。slug は設定として固定）の `ClubMembership` がある。
3. `canManageWebsite = true`。
4. `status = ACTIVE`（案A）。

- スキーマの変更は不要（`canManageWebsite` と、索引 `[clubId, status, canManageWebsite]` は、すでにある）。

### 3.3 モード

新しい環境変数（例：`WEBSITE_ADMIN_AUTH_MODE`）で、3つを切り替える。

| モード | 判定 |
| --- | --- |
| `env`（現在） | 環境変数の一覧のみ |
| `union`（切替当日のみ） | 環境変数か DB の**どちらかが許可すれば許可**。両方を計算し、食い違った件数だけをログに残す（ID・メールは出さない） |
| `db` | DB のみ |

### 3.4 手順

**事前（切替日の前。本番の追加は、データの追加のみ）**

1. コードをデプロイする（モードは `env` のまま。動作は変わらない）。
2. 既存の HP 管理者の全員について、`AppUser`（Auth と同じ ID・同じメール）と、ARAO の `ClubMembership`
   （`ACTIVE`、`canManageWebsite = true`）を整える（§5）。作成のみ、ドライラン付き、再実行可能なスクリプトで行う。
3. 照合（読取り。付録A）：「環境変数の一覧」と「DB で許可される人」が一致することを確認する。**一致しない人が1人でもいれば、切替日を設けない。**
4. ローカル E2E で、管理者が使えること、非管理者（MEMBER、退会者、会員でない Auth ユーザー、別クラブの管理者）が、ページ・アクションとも拒否されることを確認する。

**切替日（1回の作業枠で完結）**

| 順 | 作業 | 合格の条件 | 戻し |
| --- | --- | --- | --- |
| 1 | モードを `union` にする（環境変数の変更と再デプロイ） | 画面が問題なく開く | `env` へ戻す |
| 2 | 管理者の**全員**が、ログインして主要な画面を開き、1つ更新する | 食い違いの記録が **0**（DB 側でも許可されていること） | 食い違いがあれば `env` へ戻して中止 |
| 3 | 非管理者（会員、会員でない Auth ユーザー）が、HP管理の URL を開く | **拒否される** | 許可されたら、直ちに `env` へ戻す |
| 4 | モードを `db` にする | 管理者の全員がもう一度開ける。非管理者は拒否される | `union` か `env` へ戻す |
| 5 | 旧一覧（環境変数）は、そのまま残す | ― | ― |

- **併用の落とし穴：** `union` の間は、環境変数が許可する人は、DB が拒否しても通る。**管理者の確認（順2）は、画面に入れたことではなく、食い違いの記録で判定する。**
- **併用中の権限の取消し：** DB の `canManageWebsite` を外すだけでは**取り消せない**。**DB と旧許可リスト（環境変数）の両方を変更し、再デプロイする**必要がある。
  併用中に取消しが必要になったら、併用を中止して `env` に戻し、取消しを済ませてから、やり直す。
- **打ち切り：** 併用は、作業枠の中で終える。翌日以降に持ち越さない。
- **ロックアウトの防止：** 最後の HP 管理者の `canManageWebsite` を外す、または退会にすることは、更新処理で拒否する（`OWNER` の人数の確認と同じ形）。

- **事前整備の対象（決定。2026-11-26）：** 付録A の照合（2026-11-25。`.env.prod` の一覧の5人）で、OWNER 以外の4人に、`canManageWebsite` が真の ARAO の所属がなかった。
  このうち**3人（一覧の1・2・4番）を COACH とし、所属（`ACTIVE`、`canManageWebsite = true`）を作成する**。AppUser は、すでにある。
  **一覧の3番（PlatformAdmin。AppUser なし）は、HP 管理者から外す**（B）。AppUser も所属も作らない。HP 管理の作業は、OWNER のアカウントで行う。
  - 3番を一覧から外す作業は、環境変数の変更（外部設定）で、**切替の作業の中で、別の承認**を取る。それまでは、3番は、環境変数の方式のもとで、HP 管理に入れる状態のまま。
  - 作成は、`scripts/prepare-website-admins.ts`（dry-run 既定、作成のみ、差分は拒否、1トランザクション、再実行可能）で行う。本番の実行は、承認ごと。

### 3.5 `db` に切り替えた後、旧一覧を削除するまで（決定：7日間を目安）

- **削除の基準（決定）：** DBのみへの切替後、**7日間を目安**に、次のすべてを満たしてから削除する。
  1. 期間中、認可に問題がない。
  2. DB方式で、**権限取消し後のアクセス拒否**を確認済み。
  3. 戻しの手順を確認済み。
- **`env` へ戻すときの条件（決定）：** 現在の権限取消しを、**旧一覧にも反映**し、取り消した人が再び許可されないことを確認してから戻す。
  併用期間は、以前の決定どおり、**切替当日の確認中だけ**。
- 以下は、検討時の記録。

- `db` の間、旧一覧は判定に使われない。**緊急にモードを `env` へ戻す場合、旧一覧が古いと、DB で取り消した人が、再び許可される。**
  戻す前に、旧一覧を DB に合わせる手順が要る。
- 削除の時期の基準（例：一定期間、問題がない。`db` のままで、取消しの確認を1回実施。戻しの手順の確認）を、別に決める。
- 削除の作業（環境変数の削除、モードの値の整理、コードの旧経路の削除）は、別の作業として、承認を取る。

## 4. 段階2：HPデータ・Storageのマルチテナント化（将来。画面の追加は別作業）

| 対象 | 内容 |
| --- | --- |
| テーブル | §1 の HP のテーブルに `clubId` を追加する |
| 一意制約 | `PageContent` の `[pageKey, blockKey]`、`FormNotificationSetting` の主キー（`formType`）、`StaffPageSetting` の固定ID を、`clubId` つきの複合にする |
| 移行 | 既存の行を、ARAO の `clubId` で埋める（バックフィル）。その後、非 NULL にする。トリガー（`*_club_id_immutable`）を、同じ形で追加する |
| Storage | HP の画像（`club-images`、`staff/...`）と PDF（`club-documents`）に、`clubs/<clubId>/` の接頭辞を付ける。既存オブジェクトの移動と、公開URLの変更を伴う（別の承認） |
| 公開側 | ドメインやスラッグから、クラブを特定する仕組み（`Club.domain` は、すでにある） |
| 管理画面 | `/admin` を、クラブ単位に分ける。認可は、段階1の規則（対象クラブの会員）に乗せる |
| 設定 | LINE の管理者グループ、メールの通知先などの、環境変数に固定された設定を、クラブ単位の設定へ移す |
| Cron | 保持期間の削除を、クラブ単位にする |

### 4.1 権限の分離（利用者の方針）

次の3つを、別の権限として設計する。

| 権限 | 内容 | 判定の材料（案） |
| --- | --- | --- |
| アプリの利用権限 | クラブのアプリを使う | `ClubMembership.status = ACTIVE`、プランに `CLUB_APP` |
| HP管理権限 | HPの管理画面を使う | `canManageWebsite = true`、`ACTIVE`、プランに `WEBSITE` |
| **HP管理権限の管理（付与・解除）** | 他の人に、HP管理権限を付け外しする | **OWNER** の `ACTIVE` な会員、プランに `WEBSITE`。**`CLUB_APP` を必要としない** |

- **STARTER の OWNER も使える**ように、付与・解除の画面は、**HP の管理画面の側**に置く（アプリの `admin/members` には置かない）。
- `canManageWebsite` を持つ人が、他の人に付与できるか（権限の拡大）は、別に決める。初期案は、OWNER のみ。
- 最後の HP 管理者を外せない保護は、残す。
- **今回は、この方針の記録のみ。画面の追加は、別作業。**

### 4.1.1 PlatformAdmin（開発者・サポート）の権限の整理（2026-11-26 の調査と決定）

- **現在の権限（コードの読取り）：** PlatformAdmin（有効な DEVELOPER か SUPPORT）は、`/platform/support`（全クラブ分のサポート報告の管理）にだけ入れる。
  クラブのアプリ（一般・管理者の画面）は、そのクラブの `ACTIVE` の会員を要求し、PlatformAdmin を見る分岐がない。HP 管理は、環境変数の一覧（将来は `canManageWebsite`）だけを見る。
  サポート報告には、報告者の名前・メール・役割、本文、ページの URL、ブラウザ情報が含まれる。
- **PlatformAdmin の権限を、全クラブの管理画面・HP 管理へ広げる案は、いまは採用しない。** 理由：
  1. 個人情報の範囲が、全クラブへ広がる（子ども・保護者の情報、LINE、お問い合わせ、体験申込）。アカウント1つの漏えいが、全クラブへ及ぶ。クラブへの説明も要る。
  2. 書込みの記録が成り立たない。イベント・お知らせの作成者・更新者は、**会員の ID** で記録する。会員でない PlatformAdmin の書込みを、記録できない。
  3. 案A（退会・利用停止で HP 管理権限も失う）と、「最後の HP 管理者の取消しを拒否する」保護に、食い違う。
  4. HP のテーブルは、まだ1クラブ専用（`clubId` がない）。「全クラブの HP 管理」は、段階2の後でないと成り立たない。
- **ARAO での運用（決定）：** 開発者が HP 管理に入る場合は、**OWNER のアカウント**で入る。開発者の PlatformAdmin のアカウントは、サポート画面のみ。
  明示的に権限を与える必要がある場合は、そのクラブの会員（`ACTIVE`、COACH か OFFICER）と `canManageWebsite` を作る方法（クラブごと・人ごとに付け外しでき、記録が残る）を使う。
- **将来の案（記録。段階2の検討事項）：** 広げる場合は、**読取り専用・期間限定・記録つき（誰が、どのクラブを、いつ。本文は残さない）・クラブの同意つき**のサポート閲覧を、別に設計する。
  DEVELOPER と SUPPORT で、見られる範囲を分ける。書込みを許す場合は、実行者の記録の方法を、先に設計する。

### 4.2 STARTER のクラブの、HP のみの利用者（記録する論点）

- 案A のもとでは、STARTER のクラブの HP のみの利用者も、`ACTIVE` の会員である。STARTER の間は、プランのため、アプリは使えない。
- **そのクラブが STANDARD に上がると、その人が、突然、アプリを使えるようになる。** ARAO は、すでに STANDARD で、指導者の全員が会員になるため、問題にならない。
  マルチテナント化のときに、案Aのままでよいか、列を分ける案（アプリの利用と HP の利用を分ける）にするかを、再び判断する。
- STARTER のクラブでの、HP のみの利用者の招待の手段が要る。**現在の招待は、アプリの機能（STANDARD と OWNER）に結びついている。** 段階2の依存として記録する。

## 5. AppUser の整備（別の粒度。課題は未解消）

### 5.1 現状

- 本番の `AppUser` は4人（2026-11-25 の読取り）。会員は OWNER 1人。
- 4人が、HP 管理者のコーチと対応しているか、`AppUser.id`・メールが Auth と一致するか、環境変数の一覧と一致するかは、**未確認**（付録A の照合で確かめる）。
- **「Auth に登録済みで `AppUser` のない人を、招待できない」課題は、未解消である。** 招待処理が、その場合に対応していない
  （運用書 §19.19・§19.20・§19.69）。AppUser の整備は、既存の管理者の一回限りの対処で、将来の同様の人には、同じ課題が出る。
  **招待処理が対応するまで、この課題を「解消済み」にしない。**

### 5.2 整備の方法（案。本番への変更は、別の承認）

1. **読取り（承認）：** 付録A の照合を実施する。値は出さず、一致・不一致の件数と、どの項目が欠けるかだけを出す。
2. **ドライラン付きの作成のみのスクリプト**（G5 の初期化と同じ形）：欠けている `AppUser` を、**Auth と同じ ID・同じメール**で作る。
   既存の行は変更しない。Auth のユーザーは作らない。再実行しても、同じ結果になる。
3. 続けて、ARAO の `ClubMembership`（`ACTIVE`、`canManageWebsite = true`）を、同じ形で作る。
4. 作成後に、付録A の照合を再実行する。

### 5.4 招待の課題の解消（別の実装単位。決定）

- 利用者の方針：Auth を作り直さず、別メールを要求せず、**既存の Auth UID に `AppUser` を紐づけ**、招待・受諾できるようにする。
- 設計の文書は、`docs/implementation/phases/invitation-existing-auth-plan.md`。HP管理のDB化とは、別の粒度で進める。

### 5.3 今後の不整合の防止（案）

| 対策 | 内容 |
| --- | --- |
| 作成の入口を1つにする | `ensureAppUser(authUser)` のような1つの関数に集約し、招待・承諾・スクリプトがそれを使う |
| 招待処理を直す（別の粒度。未解消の課題の解消） | Auth に登録済みで `AppUser` のないメールを、メールの一致と確認済みの状態を検証した上で、既存ユーザーとして扱う |
| 定期の整合チェック | 付録A の読取り照合を、招待の前と月次で実行する |
| 手作業の手順化 | Supabase の画面でユーザーを追加・削除するときの手順（追加後に `ensureAppUser`。削除前に、会員・招待・HP管理者・PlatformAdmin の確認）を、運用書へ書く |
| DB の外部キー | `AppUser.id` から `auth.users` への外部キーは、Prisma の管理外で、使い捨てのローカルDBの構成を複雑にする。**推奨しない**（整合チェックで代替） |

## 6. 利用者の決定（2026-11-25）と残る論点

| # | 決定 |
| --- | --- |
| 1 | AGENTS.md へ、F13 の既存方針を残したまま、「HP管理認可のDB化は、F13 の範囲外の別粒度として、承認のうえ実施する」と明記する。DB化に必要な範囲に限定する |
| 2 | 段階1は、今すぐ着手（規則更新・事前整備・実装・ローカル試験）。本番データの整備・デプロイ・モード切替は、それぞれ確認と承認の後 |
| 3 | 旧一覧の削除は、DBのみへの切替後、7日間を目安に、§3.5 の3条件を満たしてから |
| 4 | 付与・取消しは、当面スクリプトのみ。`canManageWebsite` の保有だけでは、他人への付与・取消しを許可しない。将来の画面は別途設計 |
| 5 | 案A。HP管理は ACTIVE かつ `canManageWebsite = true`。STANDARD への変更後は、設定された役割でアプリを使ってよい。退会・利用停止でHP管理も失う仕様を了承。**ただし、STARTER でも、HP管理者の追加・取消しができる手段を確保し、アプリの招待機能だけには依存させない** |

- 「Auth 登録済みで `AppUser` のない人を招待できない」課題は、HP管理のDB化とは**別の実装単位**で、今回の移行に合わせて解消する（§5.4）。
- 残る論点：将来の画面での付与者の範囲（段階2の設計時）。

### 6.1 旧：検討時の要判断（記録）

1. この計画を、F13 の範囲外の新しい粒度として始め、AGENTS.md の F13 の規則を更新（または、例外を明記）してよいか。
2. DB化（段階1）の着手の時期。**推奨：アプリの運用開始の後でよい。P0 は、一般会員の導入の前に実施する。**
   前倒しの条件：管理者の入れ替えが頻繁になる、付与・取消しの履歴が必要になる、2つ目のクラブを入れる（段階2の前に必須）。
3. `db` に切り替えた後、旧一覧を削除するまでの期間と、削除の基準（§3.5）。
4. `canManageWebsite` を持つ人が、他の人に付与できるか（§4.1）。
5. 段階2での、STARTER のクラブの HP のみの利用者の扱い（§4.2）。

## 付録A：HP管理者とAuth・AppUserの照合（読取りのみ。本番は承認ごと）

目的：環境変数の管理者の一覧、Auth、`AppUser`、`PlatformAdmin`、ARAO の `ClubMembership` が、一致しているかを確認する。
**出力は、真偽値と件数のみ。ID・メール・名前は、出さない。**

### A.1 前提

- 本番の読取りには、承認が要る。接続は、運用書の標準の手順（`f13_prod_env`、Session pooler、ポート 5432、`unset PGOPTIONS`）。
- 管理者の一覧は、画面・チャット・ファイルに出さず、`read -rs` で、シェルの変数へ入れる（コピー元は、Vercel の環境変数の画面。値は、自分の画面でのみ見る）。
- 一覧の値は、`psql` の `\getenv` で読む（コマンドの引数に出ない）。

### A.2 手順

**接続の準備（本番用ターミナル。手順1〜3。省略しない）：**

1. リポジトリのルートで、運用書 §4.4 の関数 `f13_prod_env` を定義して実行し、続けて次を実行する（`PGOPTIONS` を外し、Session pooler の接続先へ切り替える準備）。

```zsh
unset PGOPTIONS
export PATH="$(brew --prefix libpq)/bin:$PATH"
SUPA_REF="${PGHOST#db.}"
SUPA_REF="${SUPA_REF%%.*}"
printf 'ref長: %s / 直接接続の形式: %s\n' "${#SUPA_REF}" "$([[ "$PGHOST" == db.*.supabase.co ]] && echo はい || echo いいえ)"
```

   期待：`ref長: 20 / 直接接続の形式: はい`。違えば、ここで止める。

2. Session pooler のホストを、画面に出さず、1行で入力する。

```zsh
read -rs POOLER_HOST
echo
[[ "$POOLER_HOST" == *.pooler.supabase.com && "$POOLER_HOST" != *[[:space:]]* ]] && echo 形式OK || echo 形式NG
```

   期待：`形式OK`。`形式NG` なら、止めて `unset POOLER_HOST` する。

3. 接続設定を切り替え、確認する。

```zsh
export PGHOST="$POOLER_HOST" PGPORT=5432 PGUSER="postgres.${SUPA_REF}"
printf 'ポート: %s / poolerを含む: %s / ユーザー長: %s\n' "$PGPORT" "$([[ "$PGHOST" == *pooler* ]] && echo はい || echo いいえ)" "${#PGUSER}"
psql --version
psql -X -tA -c "select current_user = 'postgres' as is_postgres"
```

   期待：`ポート: 5432 / poolerを含む: はい / ユーザー長: 29`、`psql` が 15 以上、最後が `t`。違えば止める。

その後に、次を実行する。

```zsh
read -rs ADMIN_IDS
export ADMIN_IDS
[ -n "$ADMIN_IDS" ] && echo 入力あり || echo 入力なし
```

```zsh
psql -X -v ON_ERROR_STOP=1 <<'SQL'
\getenv ids ADMIN_IDS
SET default_transaction_read_only = on;
SHOW default_transaction_read_only;

SELECT
  (SELECT count(*) FROM auth.users) AS auth_users,
  (SELECT count(*) FROM "AppUser") AS app_users,
  (SELECT count(*) FROM "PlatformAdmin") AS platform_admins,
  (SELECT count(*) FROM "ClubMembership") AS memberships,
  cardinality(string_to_array(:'ids', ',')) AS admin_list_entries;

WITH admin_ids AS (
  SELECT lower(btrim(x)::uuid::text) AS id, n
  FROM unnest(string_to_array(:'ids', ',')) WITH ORDINALITY AS t(x, n)
)
SELECT
  a.n AS list_no,
  (u.id IS NOT NULL) AS in_auth,
  (u.email_confirmed_at IS NOT NULL) AS auth_confirmed,
  (p.id IS NOT NULL) AS has_app_user,
  (p.id IS NOT NULL AND lower(p.email) = lower(u.email)) AS app_email_matches_auth,
  (pa.id IS NOT NULL) AS is_platform_admin,
  m.role AS membership_role,
  m.status AS membership_status,
  m."canManageWebsite" AS can_manage_website
FROM admin_ids a
LEFT JOIN auth.users u ON u.id::text = a.id
LEFT JOIN "AppUser" p ON p.id = a.id
LEFT JOIN "PlatformAdmin" pa ON pa.id = a.id
LEFT JOIN "ClubMembership" m ON m."userId" = a.id
  AND m."clubId" = (SELECT id FROM "Club" WHERE slug = 'arao-u12')
ORDER BY a.n;

WITH admin_ids AS (
  SELECT lower(btrim(x)::uuid::text) AS id
  FROM unnest(string_to_array(:'ids', ',')) AS t(x)
)
SELECT
  row_number() OVER (ORDER BY u.created_at) AS auth_no,
  (u.email_confirmed_at IS NOT NULL) AS auth_confirmed,
  (u.id::text IN (SELECT id FROM admin_ids)) AS in_admin_list,
  (pa.id IS NOT NULL) AS is_platform_admin,
  (p.id IS NOT NULL) AS has_app_user,
  (p.id IS NOT NULL AND lower(p.email) = lower(u.email)) AS app_email_matches_auth,
  (m.id IS NOT NULL) AS has_membership,
  u.created_at::date AS created_on,
  u.last_sign_in_at::date AS last_sign_in_on
FROM auth.users u
LEFT JOIN "AppUser" p ON p.id = u.id::text
LEFT JOIN "PlatformAdmin" pa ON pa.id = u.id::text
LEFT JOIN "ClubMembership" m ON m."userId" = u.id::text
ORDER BY u.created_at;

SELECT count(*) AS app_users_without_auth
FROM "AppUser" p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = p.id);

SELECT count(*) AS platform_admins_without_auth
FROM "PlatformAdmin" pa
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = pa.id);

SELECT count(*) AS app_user_email_duplicates
FROM (
  SELECT lower(email) FROM "AppUser" WHERE email IS NOT NULL
  GROUP BY lower(email) HAVING count(*) > 1
) d;
SQL
```

```zsh
unset ADMIN_IDS PGHOST PGUSER PGPORT PGPASSWORD PGDATABASE PGSSLMODE POOLER_HOST SUPA_REF
env | grep -c -E '^(PG|ADMIN_IDS)'
```

- 期待：最後の件数は 0。

### A.3 読み方

| 出力 | 期待（管理者の全員が、DB化の準備を終えた状態） |
| --- | --- |
| `list_no` の表（一覧の順） | 全員が、`in_auth` と `has_app_user` と `app_email_matches_auth` が真。`membership_role` が COACH／OFFICER／OWNER、`membership_status` が `ACTIVE`、`can_manage_website` が真 |
| `auth_no` の表（Auth の全員） | 一覧にない人（`in_admin_list` が偽）で、`can_manage_website` を持つ人はいない。`has_app_user` が偽の人が、整備の対象 |
| `app_users_without_auth`、`platform_admins_without_auth` | 0 |
| `app_user_email_duplicates` | 0 |

- 食い違いがあれば、その行の種類（`in_auth`、`has_app_user`、`app_email_matches_auth`、`membership_*`）だけを報告し、ID・メールは報告しない。
  `list_no` は、環境変数の一覧の順番なので、どの管理者かは、実施者だけが分かる。
- **検証：** 照合の SQL は、使い捨てのローカルDB（`supabase/postgres:17.6`、26件の migration を適用）で、架空のデータを使って動作を確認した
  （一致、メール不一致、`AppUser` なし、PlatformAdmin、Auth のみのユーザー、`AppUser` のみの行を区別できる）。本番では、未実行。
- **本番の `auth.users` の列（`email_confirmed_at`、`created_at`、`last_sign_in_at`）は、標準の GoTrue のスキーマとして使っている。** 本番のスキーマ参照での照合は、未実施。
  列がなければ、SQL はエラーで止まり、何も変更しない。
- Pooler の `postgres` ロールで `auth.users` を読めることは、B-1 のバックアップ（`auth` のダンプ）で確認済み。
