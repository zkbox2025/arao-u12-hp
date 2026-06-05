//docs/troubleshooting.md
失敗ログ


###[2026-06-01] [Zod v4のemail非推奨表示とenum errorMap型エラーの修正]

【影響範囲】
発生環境：ローカル開発環境 / Next.js / TypeScript / Zod v4
緊急度：中

【症状】
何が起きたか：
・`session-application.ts` の `childGrade: z.enum(...)` と `experience: z.enum(...)` に赤線が表示された。
・`z.enum(..., { errorMap: ... })` の `errorMap` に対して「この呼び出しに一致するオーバーロードはありません」と表示された。
・`contact.ts` と `session-application.ts` の `email: z.string().trim().email(...)` / `emailConfirm: z.string().trim().email(...)` の `email` 部分に横線が表示された。

期待していた動作：
・学年、経験年数、参加内容の未選択時に、指定した日本語エラーメッセージが表示される。
・メールアドレス形式チェックで、指定した日本語エラーメッセージが表示される。
・TypeScript上で赤線や非推奨表示が出ない。

【再現手順】
1. `src/lib/validations/session-application.ts` で `z.enum(..., { errorMap: ... })` を使用する。
2. `src/lib/validations/contact.ts` または `src/lib/validations/session-application.ts` で `z.string().trim().email(...)` を使用する。
3. VS CodeまたはTypeScriptチェックで、該当箇所に赤線または横線が表示される。

【エラーメッセージ / ログ】
・`この呼び出しに一致するオーバーロードはありません。`
・`オブジェクト リテラルは既知のプロパティのみ指定できます。'errorMap' は型 '{ error?: string | $ZodErrorMap<...> | undefined; message?: string | undefined; }' に存在しません。`
・`z.string().email(...)` の `email` に非推奨を示す横線が表示される。

【切り分けメモ（どこが怪しいか）】
・`z.enum()` の第2引数で使っている `errorMap` が、現在のZodの型定義と合っていない可能性が高い。
・`z.string().email()` がZod v4では非推奨になっている可能性が高い。
・`z.enum()` に渡す配列は `as const` で固定タプルとして定義した方がTypeScript上安定する。

【原因（Root Cause）】
・Zod v4では、エラーメッセージ指定の書き方が変更されており、`errorMap` ではなく `error` を使う必要があった。
・Zod v4では `z.string().email()` が非推奨となり、代わりに `z.email()` を使う形式が推奨されている。
・そのため、既存のZod v3寄りの書き方をZod v4環境で使ったことで、TypeScriptの型エラーや非推奨表示が発生した。

【結論】
・`z.enum(..., { errorMap: ... })` は `z.enum(..., { error: "..." })` に修正する。
・`z.string().trim().email("...")` は `z.string().trim().pipe(z.email({ error: "..." }))` に修正する。
・enumに渡す値は `as const` で定義してから `z.enum()` に渡す。

【解決策（Fix）】
・修正前：

```ts
childGrade: z.enum(
  [
    "YOUJI",
    "ELEMENTARY_1",
    "ELEMENTARY_2",
    "ELEMENTARY_3",
    "ELEMENTARY_4",
    "ELEMENTARY_5",
    "ELEMENTARY_6",
  ],
  {
    errorMap: () => ({ message: "学年を選択してください" }),
  }
),

・修正後：

const childGrades = [
  "YOUJI",
  "ELEMENTARY_1",
  "ELEMENTARY_2",
  "ELEMENTARY_3",
  "ELEMENTARY_4",
  "ELEMENTARY_5",
  "ELEMENTARY_6",
] as const;

childGrade: z.enum(childGrades, {
  error: "学年を選択してください",
}),

・修正前：

experience: z.enum(["NONE", "LESS_THAN_1YEAR", "YEARS_1_OR_MORE"], {
  errorMap: () => ({ message: "経験年数を選択してください" }),
}),

・修正後：

const experienceYears = [
  "NONE",
  "LESS_THAN_1YEAR",
  "YEARS_1_OR_MORE",
] as const;

experience: z.enum(experienceYears, {
  error: "経験年数を選択してください",
}),

・修正前：

email: z
  .string()
  .trim()
  .email("メールアドレスの形式が正しくありません"),

emailConfirm: z
  .string()
  .trim()
  .email("確認用メールアドレスの形式が正しくありません"),

・修正後：

email: z
  .string()
  .trim()
  .pipe(z.email({ error: "メールアドレスの形式が正しくありません" })),

emailConfirm: z
  .string()
  .trim()
  .pipe(
    z.email({
      error: "確認用メールアドレスの形式が正しくありません",
    })
  ),

【確認（動作検証）】
・session-application.ts の childGrade と experience の赤線が消えることを確認した。
・contact.ts と session-application.ts の email / emailConfirm の横線が消えることを確認した。
・未選択の学年、経験年数に対して、指定した日本語エラーメッセージが返ることを確認する。
・不正なメールアドレス形式に対して、指定した日本語エラーメッセージが返ることを確認する。
・正しい入力値の場合、バリデーションを通過することを確認する。

【よくある落とし穴】
・Zod v3の記事やサンプルコードでは errorMap や z.string().email() が使われていることがある。
・Zod v4環境では、そのままコピペすると型エラーや非推奨表示が出る場合がある。
・z.enum() に通常の string[] を渡すと型が広がってしまい、TypeScriptでエラーになることがあるため、as const を付けて固定タプルにする。
・FormData.get() は string | File | null を返すため、チェックボックスの同意確認などは z.literal("on") より z.unknown().refine((value) => value === "on") の方が扱いやすい。

【再発防止（Prevention）】
・Zodのサンプルコードを使う場合は、現在使用しているZodのメジャーバージョンを確認する。
・Zod v4では、エラーメッセージ指定は基本的に { error: "..." } を使う。
・メール形式チェックは z.string().trim().pipe(z.email({ error: "..." })) の形で統一する。
・enumの選択肢は直接 z.enum([...]) に書くのではなく、const xxx = [...] as const として定義してから渡す。
・バリデーションファイル作成時は、VS Codeの赤線だけでなく、npm run build や npm run lint でも確認する。


###[2026-06-02] [Prisma seed実行時にDATABASE_URLが読み込まれずDB接続エラー]

【影響範囲】
発生環境：ローカル開発環境 / Prisma seed / Docker PostgreSQL
緊急度：中

【症状】
何が起きたか：
`npx prisma db seed` を実行したところ、Prisma seed処理中にDB接続エラーが発生した。

期待していた動作：
`prisma/seed.ts` が実行され、ローカルDockerのPostgreSQLにNoticeのテストデータが投入されること。

【再現手順】
1. `.env` ファイルが存在しない状態で、`.env.local` と `.env.prod` のみを用意する。
2. `.env.local` にローカルDocker用の `DATABASE_URL` を設定する。
3. `npx prisma db seed` を実行する。

【エラーメッセージ / ログ】
・
```txt
npx prisma db seed
Loaded Prisma config from prisma.config.ts.

Running seed command `tsx prisma/seed.ts` ...
prisma:error SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
...
An error occurred while running the seed command:
Error: Command failed with exit code 1: tsx prisma/seed.ts

【切り分けメモ（どこが怪しいか）】
・seed.ts の upsert 処理自体ではなく、DB接続前の環境変数読み込みが怪しい。
・client.ts では process.env.DATABASE_URL を使って Pool を作成している。
・dotenv/config はデフォルトでは .env を読む。
・今回の環境では .env が存在せず、.env.local と .env.prod に分けて管理していた。
・そのため、npx prisma db seed 実行時に .env.local の DATABASE_URL が読み込まれていなかった可能性が高い。

【原因（Root Cause）】
・npx prisma db seed をそのまま実行した場合、.env.local が自動では読み込まれなかった。
・その結果、process.env.DATABASE_URL が正しい文字列として読み込まれず、pg がPostgreSQL接続時にパスワードを文字列として取得できなかった。
・エラー client password must be a string は、DB接続URLのパスワード部分が正しく解釈できていないことを示していた。

【結論】
・Prisma seed実行時には、使用する環境変数ファイルを明示的に指定する必要がある。
・今回のローカル開発では .env.local を読み込んだ状態で seed を実行する必要があった。

【解決策（Fix）】
・dotenv-cli を導入した。

npm install -D dotenv-cli

・package.json の scripts にローカル用seedコマンドを追加した。

{
  "scripts": {
    "db:seed:local": "dotenv -e .env.local -- prisma db seed",
  }
}

・ローカルDocker DBにシードを投入する場合は、以下を実行する。

npm run db:seed:local

【確認（動作検証）】
・以下のコマンドを実行。

npm run db:seed:local

・実行結果：

> arao-u12-hp@0.1.0 db:seed:local
> dotenv -e .env.local -- prisma db seed

Loaded Prisma config from prisma.config.ts.

Running seed command `tsx prisma/seed.ts` ...
Seed completed.

🌱  The seed command has been executed.

・prisma/seed.ts が正常に実行され、Noticeのシードデータ投入が完了した。

【よくある落とし穴】
・Next.jsでは .env.local をよく使うが、Prisma seedやtsx実行時に必ず自動で読まれるとは限らない。
・.env がない構成では、dotenv/config だけに頼ると DATABASE_URL が読めないことがある。
・.env.local と .env.prod を分けている場合、どちらのDBに対して操作するのかをコマンドで明示しないと危険。
・本番用 .env.prod に対して誤ってseedを流すと、テストデータが本番DBに入る可能性がある。
・client password must be a string は、seedの中身ではなく、DB接続URLや環境変数読み込みの問題であることが多い。

【再発防止（Prevention）】
・今後、ローカルDBにseedを流すときは必ず以下を使う。

npm run db:seed:local

・本番DBへseedする場合は、誤実行防止のため事前に .env.prod の内容と投入データを確認する。
・.env.local / .env.prod を使い分けるプロジェクトでは、Prisma系コマンドもpackage.json scripts経由で実行する。
・client.ts に DATABASE_URL 未設定時の明示的なエラーを入れておくと、原因特定が早くなる。

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL が設定されていません。.env.local または .env.prod を読み込んでください。"
  );
}


###[2026-06-04] [トップページの「詳しくみる」遷移後にページ上部ではなく本文位置から表示される問題]

【影響範囲】
発生環境：ローカル開発環境 / Next.js App Router / 公開ページ
緊急度：低〜中

【症状】
何が起きたか：
・トップページ `/explore` の「詳しくみる」ボタンから `/about`、`/policy`、`/summary`、`/flow`、`/faq` などへ遷移した際、ページタイトルから表示されず、タイトル下の本文付近が画面上部に表示された。
・スクロールしない短いページではタイトルから表示されたが、スクロールが発生する長いページでは本文位置から始まるように見えた。

期待していた動作：
・トップページの「詳しくみる」ボタンを押したら、遷移先ページの一番上、つまり `PageTitle` のタイトル部分から表示される。

【再現手順】
1. `/explore` を開く。
2. トップページ内の各セクションにある「詳しくみる」ボタンを押す。
3. 遷移先ページで、タイトルではなく本文付近が画面上部に表示されることを確認する。

【エラーメッセージ / ログ】
・ブラウザコンソール上のエラーメッセージはなし。
・TypeScript / Next.js のビルドエラーもなし。
・画面遷移時のスクロール位置に関する表示上の不具合。

【切り分けメモ（どこが怪しいか）】
・`app/(public)/layout.tsx` の余白 `pt-6` を調整しても改善しなかった。
・スクロールしない短いページでは正常にタイトルから表示された。
・スクロールがある長いページでのみ、本文付近から表示されるように見えた。
・そのため、CSSの余白不足ではなく、ページ遷移時のスクロール位置またはアンカー位置の問題が怪しいと判断した。
・トップページの `Link href="/about"` のような通常遷移では、期待通りに先頭位置へ戻らないケースがあった。

【原因（Root Cause）】
・トップページの「詳しくみる」ボタンの遷移先が `/about` や `/faq` のようにページURLのみだったため、遷移先で明示的なスクロール位置が指定されていなかった。
・その結果、Next.js のクライアント遷移時に、ページの高さや直前のスクロール位置、共通レイアウト、sticky header などの影響で、遷移先の先頭ではなく本文付近が表示されることがあった。
・遷移先ページの先頭位置を示すアンカー `#top` を明示していなかったことが原因。

【結論】
・トップページの「詳しくみる」ボタンの遷移先に `#top` を付けることで解決した。
・遷移先ページ側には、共通レイアウト内に `id="top"` を持つ要素を用意しておく必要がある。

【解決策（Fix）】
・`app/(public)/layout.tsx` の `main` に `id="top"` を設定した。

```tsx
<main id="top" className="flex-1 scroll-mt-20">
  <div className="mx-auto w-full max-w-5xl px-5 pt-6 sm:px-6 sm:pt-8 lg:px-8">
    {children}
  </div>
</main>

・app/(public)/explore/page.tsx の summarySections 内の遷移先を、通常URLから #top 付きURLに変更した。

href: "/about#top",
href: "/policy#top",
href: "/summary#top",
href: "/flow#top",
href: "/faq#top",

・例：

const summarySections = [
  {
    id: "about-summary",
    title: "チーム紹介",
    heading:
      "荒尾から、次のステージへ。個性を伸ばし、可能性を広げるミニバスチーム",
    body: "荒尾市を拠点に活動する、ミニバスケットボールチームです。全国大会・九州大会へと子どもたちを導いた経験のあるコーチが在籍しています。",
    href: "/about#top",
    imageLabel: "ABOUT",
  },
];

【確認（動作検証）】
・/explore から「チーム紹介」の「詳しくみる」を押し、/about#top に遷移してタイトルから表示されることを確認した。
・/policy#top、/summary#top、/flow#top、/faq#top でも同様に、タイトル部分から表示されることを確認した。
・スクロールがある長いページでも、本文途中ではなくページ上部から表示されることを確認した。
・短いページでも表示崩れや副作用がないことを確認した。

【よくある落とし穴】
・layout.tsx に余白を追加しても、スクロール位置の問題は解決しない場合がある。
・href="/about" のままだと、Next.js のクライアント遷移時に期待通りページ先頭へ戻らないケースがある。
・href="/about#top" にしても、遷移先に id="top" が存在しないと効果がない。
・複数箇所に id="top" を付けると、どこへスクロールするか分かりづらくなるため、共通レイアウト側に1つだけ置く方が安全。
・sticky header がある場合、アンカー先がヘッダーに隠れることがあるため、必要に応じて scroll-mt-20 などを設定する。

【再発防止（Prevention）】
・ページ遷移後に必ず上部から表示したいリンクには、必要に応じて #top を付ける。
・公開ページ共通レイアウトの main に id="top" を設定して、全ページ共通のアンカー先を用意する。
・トップページや一覧ページから詳細ページへ遷移する導線では、スクロール位置が期待通りかスマホ・PC両方で確認する。
・sticky header を使う場合は、アンカー遷移先に scroll-mt-* を設定する。
・URLだけでなく、遷移後の初期表示位置も動作確認項目に入れる。



###[2026-06-05] [スマホ実機でドロワー・フォーム操作が反応しない問題とドロワー表示位置の修正]

【影響範囲】
発生環境：ローカル開発環境 / Next.js App Router / スマホ実機確認 / 公開ページ全体
緊急度：中〜高

【症状】
何が起きたか：
・スマホ実機でヘッダーのドロワーボタンを押しても、ドロワーが表示されなかった。
・体験/見学申し込みフォームで、全項目を入力し、プライバシーポリシーにチェックを入れても送信ボタンがグレーのままで押せなかった。
・フォーム入力中に画面のどこかを押したタイミングで、入力値がリセットされるように見えた。
・プライバシーポリシーのボタンを押しても、モーダルが表示されなかった。
・デバッグ中、`BUTTON PUSH` などのテストボタンも一時的に動いていないように見えた。
・その後、切り分けの結果、クライアントJSやHydration自体は正常であることを確認した。
・ドロワーが開くようになった後、ドロワーの「MENU」行と×ボタンがヘッダーにかぶって表示された。
・×ボタンを押した際に、背面のメニューやページ内リンクまでタップされたような挙動になり、スムーススクロールが発生することがあった。

期待していた動作：
・スマホ実機でもヘッダーのドロワーボタンを押すと、右側からドロワーメニューが表示される。
・ドロワーの×ボタンを押すと、ドロワーだけが閉じる。
・ドロワー内の操作が背面ページへ伝播しない。
・フォーム入力値は勝手に消えない。
・プライバシーポリシーにチェックを入れると送信ボタンが有効化される。
・プライバシーポリシーボタンを押すとモーダルが表示される。

【再現手順】
1. スマホ実機でローカル開発環境のURLを開く。
2. ヘッダー右側のドロワーボタンを押す。
3. ドロワーが表示されない、または表示位置がヘッダーとかぶることを確認する。
4. `/session-application` を開き、体験/見学申し込みフォームを入力する。
5. プライバシーポリシーにチェックを入れても送信ボタンが有効化されない、またはモーダルが開かないことを確認する。
6. デバッグ用の最小Client Componentで、`BUTTON PUSH` が動くか確認する。
7. 最終的にレイアウト、CSS、Header、Drawerを本番形に戻して再確認する。

【エラーメッセージ / ログ】
・開発サーバー確認中に以下のWebSocketエラーが表示された。

```txt
WebSocket connection to 'ws://192.168.210.198:3000/_next/webpack-hmr?id=...' failed

・ただし、最小Client Componentの検証により、クライアントJS / Hydration自体は正常に動作していることを確認した。
・npm run build は成功した。

✓ Compiled successfully
✓ Finished TypeScript
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization

【切り分けメモ（どこが怪しいか）】
・最初はスマホで onClick が効かないため、JavaScript未起動、Hydrationエラー、透明オーバーレイ、古いキャッシュを疑った。
・ClientCheck を追加し、スマホ上で JS OK が表示されることを確認した。
・RawDomTapTest、FixedClickTest、NativeClickTest、FullScreenTapTest などで、Reactイベントやネイティブイベントの動作を切り分けた。
・最初の BUTTON PUSH テストは document.body.dataset を変えるだけで画面表示が変わらなかったため、動いていないように見えた。
・画面上の status と count が変わるテストに変更したところ、PC・スマホともにClient Componentのイベントが正常に動くことを確認した。
・app/(public)/layout.tsx を最小構成にして、PublicHeader、children、PublicFooter を順番に戻して確認した。
・その結果、PublicHeader + FullScreenTapTest、children 復帰、PublicFooter 復帰のすべてで、ドロワーとテストボタンが正常に動作した。
・最終的に、閉じた状態のドロワーがタップ対象として残らないように pointer-events-none を明示する方針にした。
・さらに、ドロワーの表示開始位置を top-0 から top-16 に変更し、ヘッダーと重ならないようにした。
・×ボタン操作時に背面要素へイベントが伝わるのを防ぐため、event.stopPropagation() を追加した。

【原因（Root Cause）】
※「閉じたDrawerに pointer-events-none がなかったから」
解決策としては以下の通り実装する
isOpen
  ? "pointer-events-auto translate-x-0"
  : "pointer-events-none translate-x-full"
・スマホ実機でJSイベントが動いていないように見えたが、最終的にはClient Component、Hydration、onClick、useStateは正常に動作していた。
・初期のデバッグコードが画面上の変化を伴わない処理だったため、イベントが発火していないように誤認した。
・実際のUI不具合は、ドロワーの閉じた状態、表示位置、イベント伝播の制御不足が原因だった。
・閉じたドロワーに `pointer-events-none` がなく、見えない要素がタップ対象として残る可能性があった。
・ドロワーが `top-0` で表示され、sticky header と重なっていた。
・ドロワー本体や×ボタンで `event.stopPropagation()` を行っていなかったため、背面ページのナビゲーションやページ内リンクにもタップが伝わったような挙動が発生した。

【結論】
・Next.jsのClient ComponentやHydration自体は壊れていなかった。
・スマホ実機でもReactの onClick / useState は正常に動作していた。
・ドロワーは、閉じているときに pointer-events-none を付け、開いているときだけ pointer-events-auto にすることで安定した。
・ドロワーを top-16 から表示し、h-[calc(100dvh-4rem)] を指定することで、ヘッダーとかぶらないレイアウトになった。
・×ボタンと aside に event.stopPropagation() を入れることで、背面ページへの意図しないクリック伝播を防げた。
・フォームの送信ボタン、プライバシーポリシーモーダル、入力値保持も最終的に正常動作を確認できた。

【解決策（Fix）】
・ドロワーの `aside` に、閉じているときは `pointer-events-none`、開いているときは `pointer-events-auto` を指定した。
・ドロワーの表示開始位置を `top-0` から `top-16` に変更し、ヘッダーと重ならないようにした。
・高さを `h-dvh` から `h-[calc(100dvh-4rem)]` に変更し、ヘッダー分を差し引いた。
・ドロワー本体に `onClick={(event) => event.stopPropagation()}` を追加し、クリックイベントが背面に伝わらないようにした。
・×ボタンでも `event.stopPropagation()` を実行してから `onClose()` するようにした。
・デバッグ時は、`count` や `status` など画面上で変化が確認できる最小Client Componentで、Reactイベントの生存確認を行うようにした。
※まとめ
閉じたDrawerに `pointer-events-none` を指定したことで、見えないDrawer要素がフォーム上のタップを妨げる可能性を排除できた。
その結果、プライバシーポリシーのチェック、モーダル表示、送信ボタンの有効化など、タップ操作に関する不具合が改善した。
一方で、入力値リセットについては、Drawerの影響だけでなく、フォーム側の `key` 設計や再レンダリングの影響も考えられるため、単一原因とは断定しない。

【確認（動作検証）】
・スマホ実機でヘッダーのドロワーボタンを押し、右からドロワーが表示されることを確認した。
・ドロワーの×ボタンを押し、ドロワーだけが閉じることを確認した。
・×ボタン押下時に、背面のページ内リンクやメニューが反応してスムーススクロールしないことを確認した。
・ドロワーのMENU行と×ボタンがヘッダーにかぶらないことを確認した。
・/session-application で入力中に値が勝手に消えないことを確認した。
・プライバシーポリシーにチェックできることを確認した。
・チェック後、送信ボタンが押せる状態になることを確認した。
・プライバシーポリシーボタンを押してモーダルが表示されることを確認した。
・npm run build が成功することを確認した。
・PC、スマホともにClient Componentのイベントが動作することを確認した。

【よくある落とし穴】
・ Tailwind CSS v4ではz-9999。z-[9999] はv3まで。
・opacity-0 や translate-x-full で見えなくしているだけでは、要素がタップ対象として残る場合がある。閉じているUIには pointer-events-none を付ける方が安全。
・テストコードで画面表示が変わらない処理だけを書くと、イベントが動いていないように誤解しやすい。
・スマホ実機検証では、古い .next、ブラウザキャッシュ、開発サーバーのHMRエラーが切り分けを難しくする。
・top-0 のドロワーは、sticky header と重なりやすい。
・ドロワー内のクリックイベントを止めないと、背面要素へイベントが伝わったような挙動になることがある。
・デバッグ用コンポーネントを複数入れると、それ自体が切り分けのノイズになる。

【再発防止（Prevention）】
・スマホ実機でクリック不具合が出た場合は、まず画面表示が変わる最小Client ComponentでHydrationとイベント動作を確認する。
・pointer-events を使うUI、特にDrawerやModalでは、開閉状態に応じて pointer-events-auto / pointer-events-none を明示する。
・ヘッダー固定時のドロワーは top-16 や h-[calc(100dvh-4rem)] のように、ヘッダー高を考慮する。
・閉じるボタンやドロワー本体には、必要に応じて event.stopPropagation() を入れる。
・スマホ実機確認前には rm -rf .next、開発サーバー再起動、必要に応じてシークレットモードで確認する。
・デバッグが終わったら、ClientCheck、TapCheck、FixedClickTest、RawDomTapTest、NativeClickTest、FullScreenTapTest などは必ず削除する。