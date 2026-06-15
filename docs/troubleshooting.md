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



### [2026-06-05] [Vercelデプロイ時のPrisma型定義エラー修正]

【影響範囲】
発生環境：本番環境（Vercel デプロイ時）

緊急度：高（MVPv1のリリース・デプロイがブロックされるため）


【症状】
何が起きたか：
GitHubへコードをプッシュした際、Vercelのビルドプロセスで `@prisma/client` から `FaqCategory` がエクスポートされていないというTypeScriptの型エラーが発生し、デプロイが失敗した。

期待していた動作：
ローカル環境と同様に、データベースのスキーマ変更（`FaqCategory` の追加）が認識され、エラーなくビルドおよびデプロイが完了すること。


【再現手順】
1. `schema.prisma` に `model Faq` および列挙型 `FaqCategory` を新しく定義・追加する。

2. 対象の型（`FaqCategory`）を定数ファイル等で `import type { FaqCategory } from "@prisma/client"` として読み込む。

3. `git push` を実行し、Vercel側で自動ビルドを走らせる。


【エラーメッセージ / ログ】
・型エラー: モジュール '"@prisma/client"' にはエクスポートされたメンバー 'FaqCategory' がありません。

・import type { FaqCategory } from "@prisma/client" ;

・Next.jsビルドワーカーがコード1、シグナルnullで終了しました。

・エラー: コマンド「npm run build」が終了コード1で終了しました


【切り分けメモ（どこが怪しいか）】
・ローカル環境では `npx prisma generate` を明示的に実行していたため、問題なくビルド（`npm run build`）が通る状態だった。

・Vercel（リモート環境）側でのみ型が見つからないと言われるため、Vercelのビルド時に最新の `schema.prisma` から `@prisma/client` の型を再生成する処理が実行されていない可能性が高い。


【原因（Root Cause）】
・Vercelの標準設定では、ビルドコマンド（`next build`）の前に自動でPrismaの型生成（`prisma generate`）が行われない。

・そのため、Vercel内の古い `@prisma/client` を参照してしまい、新しく追加した独自型（`FaqCategory`）を認識できずにコンパイルエラーとなっていた。


【結論】
・本番環境（Vercel）がデータベース設計図の最新の変更内容を認識できていないことが原因。


【解決策（Fix）】
・`package.json` の `scripts` 領域にある `build` コマンドを修正し、Next.jsのビルドが走る直前に必ずPrismaの型を生成するように変更した。

```json
"scripts": {
  "build": "prisma generate && next build"
}
```


【確認（動作検証）】
・ローカル環境にて `npm run build` を実行し、`Generated Prisma Client` が出力されたのちに `✓ Compiled successfully` となり、正常に静的ページが生成されることを確認。

・修正内容をGitHub（`mvp-v1` / `main` ブランチ）にプッシュし、Vercel側でもエラーを出さずにデプロイ（緑色のReadyマーク）が成功することを確認。


【よくある落とし穴】
・「ローカル（自分のPC）で動いているから、本番環境でもそのまま動くはず」と思い込んでしまうこと。

・Prismaなどのツールは、スキーマを変更した後に「型を再生成するコマンド」をそれぞれの環境で実行させる必要がある。


【再発防止（Prevention）】
・今後データベースのスキーマ（`schema.prisma`）を変更・追加した際も、今回の修正によってVercel側で毎回自動的に最新の型定義が生成されるようになったため、根本的な再発防止策は完了。



###[2026-06-09] [ToastMessageの削除完了メッセージだけ表示されない]

【影響範囲】
発生環境：
Next.js 管理画面 FAQ管理ページ `/admin/faq`

緊急度：
中  
FAQ削除自体は成功していたが、管理者に削除完了が伝わらず、操作完了の確認がしづらくなるため。

【症状】
何が起きたか：
FAQ削除後、URLは `/admin/faq?category=TARGET&status=PUBLISHED&deleted=1#top` になっていたが、「削除しました。」のトーストメッセージが表示されなかった。

一方で、「保存しました。」や「並び順を保存しました。」のトーストは表示されていた。

また、削除後に表示されたURLをブラウザへ直接入力し直すと、「削除しました。」のトーストは正常に表示された。

期待していた動作：
FAQ削除後、`deleted=1` のサーチパラムスを検知し、画面上部に「削除しました。」のトーストメッセージが3秒間表示される。

【再現手順】
1. `/admin/faq?category=TARGET&status=PUBLISHED` を開く。
2. FAQカードの操作メニューから削除を実行する。
3. `/admin/faq?category=TARGET&status=PUBLISHED&deleted=1#top` にリダイレクトされるが、「削除しました。」のトーストが表示されない。

【エラーメッセージ / ログ】
・コンソール上の明確な実行時エラーはなし。
・URLには `deleted=1` が付与されていた。
・`ToastMessage` の表示条件である `toastMessage` 自体は作られている可能性が高かった。

【切り分けメモ（どこが怪しいか）】
・`deleteFaq` のDB削除処理は成功していた。
・リダイレクト後のURLにも `deleted=1` が付いていた。
・`page.tsx` 側の `params.deleted === "1"` の判定も直接URL入力時には機能していた。
・直接URL入力では表示されるため、Server ActionやsearchParamsの問題ではなさそう。
・削除直後だけ表示されないため、Client Componentである `ToastMessage` の再表示制御が怪しいと判断。

【原因（Root Cause）】
・`ToastMessage` コンポーネントがReact上で再利用され、内部stateの `isVisible` が `false` のまま残っていたため。

・`ToastMessage` は3秒後に以下の処理で非表示になる。

```tsx
setIsVisible(false);

・その後、削除処理によって toastMessage が「削除しました。」に変わっても、Reactが同じ ToastMessage コンポーネントとして再利用したため、useState(true) が再実行されなかった。

・結果として、内部stateは false のままとなり、以下の条件により何も表示されなかった。

if (!isVisible) return null;

【結論】
・削除処理やURL生成は正しく動いていた。
・原因は ToastMessage の再マウントが発生せず、非表示状態のstateが再利用されていたこと。
・Reactの key を使って、トーストメッセージが変わったタイミングでコンポーネントを作り直す必要があった。

【解決策（Fix）】
・ToastMessage に key を付与し、メッセージが変わったら別コンポーネントとして再生成されるようにした。

修正前：

{toastMessage ? <ToastMessage message={toastMessage} /> : null}

修正後：

{toastMessage ? (
  <ToastMessage key={toastMessage} message={toastMessage} />
) : null}

・これにより、toastMessage が「削除しました。」に変わったとき、ToastMessage が新しく作り直され、useState(true) が再度有効になった。

【確認（動作検証）】
・FAQ削除後、URLが /admin/faq?category=TARGET&status=PUBLISHED&deleted=1#top になることを確認。
・削除直後に「削除しました。」のトーストが表示されることを確認。
・「保存しました。」も引き続き表示されることを確認。
・「並び順を保存しました。」も引き続き表示されることを確認。
・トーストが3秒後に消えることを確認。

【よくある落とし穴】
・URLやsearchParamsが正しくても、Client Component内部のstateが再利用されて表示されないことがある。
・useState(true) はコンポーネントが新しくマウントされたときだけ初期化される。
・同じコンポーネントとしてReactに再利用されると、前回のstateが残る。
・useEffect 内で setIsVisible(true) を直接呼んで対応しようとすると、React Compiler / ESLintで警告が出る場合がある。


【再発防止（Prevention）】
・トーストやモーダルのように「表示ごとに状態を初期化したいコンポーネント」には、必要に応じて key を付ける。
・URLパラメータによって表示内容が変わるClient Componentでは、messageやsearchParams由来の値を key に含める。
・トーストの表示/非表示stateは、表示メッセージの切り替わりとReactの再マウント挙動を意識して設計する。
・今後、同じように「URLは正しいのに表示だけ出ない」場合は、Server ActionではなくClient Componentのstate再利用を疑う。



[2026-06-10] [Next.js App RouterでのURLハッシュ重複バグ]
【影響範囲】
発生環境：ローカル開発環境 / ステージング環境（Next.js App Router 導入環境）
緊急度：低（画面遷移やURLの見栄えに関する不具合のため）

【症状】
何が起きたか：特定のページ遷移（または同一ページ内のパラメータ更新）時、URLの末尾に #top#top とハッシュ（#）が重複して付与されてしまう現象が発生した。期待していた動作：遷移後のURL末尾が、重複のないきれいな状態（例：...#top）になること。

【再現手順】
現在のURLにすでに #top が付いている状態で、moveTo 関数を実行する。router.push にオブジェクト形式などの不適切な形式、または特定の文字列結合でパスを渡す。ブラウザのURL欄が #top#top に変化する。

【エラーメッセージ / ログ】
・特になし（構文エラーではなく、ルーターの挙動によるURL文字列の不正結合）。
※オブジェクト形式（{ pathname, query, hash }）を試した際は、TypeScriptより以下の型エラーが出力された：
型 '{ pathname: string; query: ...; hash: string; }' の引数を型 'string' のパラメーターに割り当てることはできません。

【切り分けメモ（どこが怪しいか）】
・new URLSearchParams() でクエリは一から生成しているため、クエリ自体の重複ではない。
・router.push に渡す手前の文字列構築、あるいは Next.js のルーターが現在のハッシュを保持したまま後ろに結合してしまっている可能性が怪しい。

【原因（Root Cause）】
・Next.js の App Router (next/navigation) において、router.push は引数に「文字列」しか受け付けない仕様である。
・移行期や検証段階で旧仕様（Pages Router）のオブジェクト形式を混ぜてしまったり、現在のハッシュ状態をクリアせずに文字列を直接渡したため、ルーター側でハッシュのクレンジングが正しく行われず、#top#top と重複して結合されてしまった。

【結論】
・App Router の仕様に則り、パラメータとハッシュ（#top）を1つのクリーンな文字列（targetUrl）として完全に組み立ててから router.push() に渡す必要がある。

【解決策（Fix）】
・URL文字列を事前に完全な形で構築し、router.push に一括で渡す実装に変更した。
typescriptconst params = new URLSearchParams();
params.set("pageKey", pageKey);
params.set("blockKey", blockKey);

// 1つのきれいな文字列として組み立てる（#topは常に1つになる）
const targetUrl = `/admin/pagecontent?${params.toString()}#top`;

router.push(targetUrl);
コードは注意してご使用ください。

【確認（動作検証）】
・修正後のコードを実行し、元のURL状態に関わらず、遷移後のURL末尾が正しく #top（重複なし）になることを確認。型エラーも解消された。

【よくある落とし穴】
・Next.js の Pages Router（旧） と App Router（新） の仕様混同。Pages Router の router.push は { pathname, query, hash } のオブジェクトを受け付けたが、App Router では string のみしか受け付けないため、同様のオブジェクトを渡すと型エラーになる。

【再発防止（Prevention）】
・App Router 環境において URL パラメータやハッシュを操作して遷移する場合は、オブジェクト形式を使わず、必ず URLSearchParams やテンプレートリテラルを用いて「1つの完成されたURL文字列」を作ってから router.push に渡すコーディングルールを徹底する。
【重要】：そのまま router.push() に流し込んだときの Next.js 側の処理のタイミングやバグが起きるため、一度 targetUrl という固定の変数に文字列を確定させてから渡したほうが確実。
もしくは  return `/admin/pagecontent?${params.toString()}#top`;のようにリターンで一度確定させてから返すと他と競合しない。





###[2026-06-10] [PageContentEditorFormで保存後・選択変更後に本文が更新されない]

【影響範囲】
発生環境：
Next.js 管理画面 サイト内文章設定ページ `/admin/pagecontent`

緊急度：
中
DB保存自体は成功していたが、管理画面上では保存済み本文や選択中パーツの本文が正しく表示されず、管理者が「保存できていない」と誤認する可能性があったため。

【症状】
何が起きたか：
サイト内文章設定ページで本文を入力して保存すると、DBには正常に上書き保存され、保存後のURLにも遷移し、トーストも表示された。

しかし、保存後の画面上では、textareaに保存した本文が表示されなかった。

また、保存後にプルダウンで別のページ・別のパーツを選択しても、textareaの本文が選択先の内容に切り替わらず、前の内容が残ったままになることがあった。

期待していた動作：
保存後はDBに保存された最新の本文がtextareaに表示される。

また、プルダウンでページやパーツを変更した場合は、選択した `pageKey` / `blockKey` に対応する本文がtextareaへ自動で表示される。

【再現手順】

1. `/admin/pagecontent` を開く。
2. 任意のページ・パーツを選択し、本文を入力して保存する。
3. 保存後、URLは `saved=1` 付きになり、トーストも表示されるが、textareaに保存済み本文が表示されない。
4. さらにプルダウンで別のページ・パーツを選択しても、textareaの表示内容が正しく切り替わらない。

【エラーメッセージ / ログ】
・コンソール上の明確なエラーはなし。
・Server Actionは正常に実行されていた。
・DBの `PageContent` レコードも正常に更新されていた。
・保存後URLにも `saved=1` が付与され、トーストも表示されていた。

【切り分けメモ（どこが怪しいか）】
・DB保存は成功していたため、`updatePageContent` の `upsert` 処理は問題なさそう。
・保存後のredirectも成功していたため、Server Actionの完了処理も問題なさそう。
・`page.tsx` 側で `findAdminPageContent` によりDBからデータ取得できている可能性が高かった。
・問題は、取得した `defaultContent` が `PageContentEditorForm` 内のtextarea表示に反映されていないこと。
・特に `textarea` に `defaultValue` を使っていたため、Reactの再マウント挙動が怪しいと判断。

【原因（Root Cause）】
・`PageContentEditorForm` がReact上で同じコンポーネントとして再利用されていたため。

・`textarea` の `defaultValue` は、コンポーネントが最初にマウントされた時点の値だけを初期値として使う。

・そのため、親コンポーネントから渡される `defaultContent` が保存後やプルダウン変更後に変わっても、既にマウント済みのtextareaの表示値は自動では更新されなかった。

・つまり、DBから最新データは取得できていたが、Client Component側のフォームが再初期化されず、古いtextarea表示が残っていた。

【結論】
・Server Action、DB保存、redirect、toast表示は正常だった。
・原因は、`defaultValue` を使ったフォームコンポーネントが再マウントされず、初期値が更新されなかったこと。
・ページ・パーツ・更新日時が変わったタイミングで `PageContentEditorForm` を作り直す必要があった。

【解決策（Fix）】
・`PageContentEditorForm` に `key` を付与し、選択中のページ・パーツ・更新日時が変わったらフォーム全体を再マウントするようにした。

修正前：

```tsx
<PageContentEditorForm
  pageKey={selectedPageKey}
  blockKey={selectedBlockKey}
  defaultContent={pageContent?.content ?? ""}
  defaultImageUrl={pageContent?.imageUrl ?? ""}
  defaultImageAlt={pageContent?.imageAlt ?? ""}
/>
```

修正後：

```tsx
<PageContentEditorForm
  key={`${selectedPageKey}-${selectedBlockKey}-${pageContent?.updatedAt?.toISOString() ?? ""}`}
  pageKey={selectedPageKey}
  blockKey={selectedBlockKey}
  defaultContent={pageContent?.content ?? ""}
  defaultImageUrl={pageContent?.imageUrl ?? ""}
  defaultImageAlt={pageContent?.imageAlt ?? ""}
/>
```

・`selectedPageKey` が変わった場合、別ページのフォームとして再マウントされる。
・`selectedBlockKey` が変わった場合、別パーツのフォームとして再マウントされる。
・`pageContent.updatedAt` が変わった場合、保存後の最新データとして再マウントされる。
※PageContentEditorForm の key が変わった時に、
Reactが古いフォームを破棄して新しいフォームとして再マウントする。

その再マウント時に、textarea / input の defaultValue が改めて読み込まれる。

【確認（動作検証）】
・本文を入力して保存すると、DBに保存されることを確認。
・保存後、`saved=1` 付きURLに遷移し、「保存しました。」のトーストが表示されることを確認。
・保存後のtextareaに、保存した本文が表示されることを確認。
・プルダウンで別ページを選択すると、そのページの最初のパーツ内容に切り替わることを確認。
・プルダウンで別パーツを選択すると、そのパーツの本文に切り替わることを確認。
・画像URL、画像altも同様に切り替わることを確認。

【よくある落とし穴】
・`defaultValue` はpropsが変わっても自動更新されない。
・`defaultValue` は「初期値」であり、「常に同期される値」ではない。
・同じClient ComponentとしてReactに再利用されると、フォーム内部の表示状態が残る。
・DB取得やServer Actionが正しくても、フォーム表示だけ古いままになることがある。
・保存後にDBの値を表示したい場合、フォームを再マウントさせるか、controlled componentとして `value` と `onChange` で管理する必要がある。

【再発防止（Prevention）】
・`defaultValue` を使うフォームで、選択対象やDBデータが変わる画面では、必要に応じて `key` を付ける。
・フォームの初期値が `pageKey` / `blockKey` / `updatedAt` に依存する場合、それらを `key` に含める。
・保存後にDBから再取得した値を表示したいフォームでは、Reactの再マウントが必要かを確認する。
・「DBは更新されているのに画面の入力欄だけ変わらない」場合は、`defaultValue` とコンポーネント再利用を疑う。
・フォームの用途に応じて、以下を使い分ける。

* 入力中の値をReact stateで常に管理したい場合：`value` + `onChange`
* 初期値だけ入れて通常のフォームとして扱いたい場合：`defaultValue` + 必要に応じて `key`

つまり、以下の通り
PageContentEditorForm は textarea / input に defaultValue を使っている。

defaultValue は「初回表示時の初期値」として使われるだけで、
その後 props の defaultContent が変わっても自動では入力欄に反映されない。

そのため、ページ選択・パーツ選択・保存後の updatedAt が変わったタイミングで
PageContentEditorForm に key を付けてフォームごと作り直す。

フォームが作り直されることで、
textarea / input の defaultValue がもう一度読み込まれ、
DBから取得した最新の本文・画像URL・alt が表示される。



###[2026-06-13] [PageContent画像アップロード後、管理画面プレビュー・公開ページ画像が表示されない]

【影響範囲】
発生環境：
ローカル開発環境  
Next.js 開発サーバー：`http://192.168.210.188:3000`  
Supabase Local Storage：`http://127.0.0.1:54321` / `http://192.168.210.188:54321`  
対象画面：
- `/admin/pagecontent`
- `/explore`

緊急度：
中  
管理画面で画像保存はできていたが、スマホ確認や公開ページ表示で画像が見えず、運用確認に支障が出る状態。

【症状】
何が起きたか：
サイト内文章設定で画像をアップロードすると、DBには `imageUrl` が保存され、PCでは画像URLを直接開くと画像が表示された。  
しかし、管理画面の画像プレビューでは `alt` の「設定中の画像」だけが表示されることがあった。  
また、公開トップページ `/explore` の画像枠にも画像が表示されず、代替表示または `?` のような表示になった。

期待していた動作：
画像をアップロード後、管理画面の「現在の画像プレビュー」に画像が表示される。  
さらに、公開ページ `/explore` の該当セクションにもアップロード済み画像が表示される。

【再現手順】
1. PCで `http://192.168.210.188:3000/admin/pagecontent` にアクセスする。
2. `TOP` の任意ブロックに画像をアップロードして保存する。
3. 管理画面の画像プレビュー、またはスマホの `http://192.168.210.188:3000/admin/pagecontent...` で表示確認する。
4. 公開ページ `http://192.168.210.188:3000/explore` を確認する。
5. 画像URLが `http://127.0.0.1:54321/...` のままだと、スマホ側で画像が表示されない。

【エラーメッセージ / ログ】
・明確なConsole Errorではなく、画像読み込み失敗時に `alt` の「設定中の画像」が表示された。  
・画像URLを直接開くとPCでは表示できた。  
・スマホでは `127.0.0.1` のURLを参照している場合、画像が表示されなかった。

【切り分けメモ（どこが怪しいか）】
・Supabase Storageへのアップロード自体は成功しているか？  
→ `http://127.0.0.1:54321/storage/v1/object/public/...` をPCで直接開くと画像が表示されたため、保存自体は成功。

・スマホからStorageにアクセスできるか？  
→ `http://192.168.210.188:54321/storage/v1/object/public/...` をスマホで直接開くと画像が表示されたため、ネットワーク的には到達可能。

・DBに保存されている `imageUrl` が何になっているか？  
→ `http://127.0.0.1:54321/...` のままだった。スマホから見ると `127.0.0.1` はスマホ自身を指すため表示できない。

・公開ページで画像を読んでいるブロックキーは正しいか？  
→ `/explore` では `ABOUT_SUMMARY_BODY.imageUrl` を参照していたが、画像を `ABOUT_SUMMARY_TITLE` に保存していた場合、公開ページには表示されない。

【原因（Root Cause）】
・Supabase Local の `getPublicUrl()` が `http://127.0.0.1:54321/...` を返しており、そのURLをそのままDBに保存していた。  
・PCでは `127.0.0.1` がPC自身なので表示できるが、スマホでは `127.0.0.1` がスマホ自身を指すため、PC上のSupabase Storageにアクセスできなかった。  
・また、公開トップページ `/explore` 側では、画像を表示するために参照しているブロックキーと、管理画面で画像を保存したブロックキーが一致していないケースがあった。

【結論】
・画像アップロード処理自体は成功していた。  
・問題は、ローカルSupabaseの公開URLがスマホから参照できない `127.0.0.1` のままDBに保存されていたこと。  
・公開ページに画像が出ない問題は、URL問題に加えて、画像を保存したブロックキーと公開ページで参照しているブロックキーの不一致も原因になり得る。

【解決策（Fix）】
・`actions.ts` の `uploadPageContentImage()` で、Supabaseから取得した公開URLをDB保存前にローカルLAN用URLへ変換した。

```ts
function normalizeLocalSupabasePublicUrl(publicUrl: string) {
  return publicUrl
    .replace("http://127.0.0.1:54321", "http://192.168.210.188:54321")
    .replace("http://localhost:54321", "http://192.168.210.188:54321");
}
const { data } = supabase.storage
  .from(PAGE_CONTENT_IMAGE_BUCKET)
  .getPublicUrl(filePath);

return normalizeLocalSupabasePublicUrl(data.publicUrl);

・すでにDBに保存済みの 127.0.0.1 の画像URLは自動では変わらないため、一度画像を削除して再アップロードした。
・公開ページで画像を表示する場合は、画像を保存するブロックキーと、公開ページ側で参照するブロックキーを揃える必要がある。
例：現在の /explore では以下を参照している。

imageUrl: contentMap.ABOUT_SUMMARY_BODY?.imageUrl,
imageAlt: contentMap.ABOUT_SUMMARY_BODY?.imageAlt,

そのため、チーム紹介セクションに画像を出したい場合は、管理画面で ABOUT_SUMMARY_BODY 側に画像を保存する。

・ローカルSupabase画像を next/image で表示する場合、必要に応じて unoptimized を付ける。

<Image
  src={imageUrl}
  alt={imageAlt || title}
  fill
  unoptimized
  className="object-cover"
/>

【確認（動作検証）】
・PCで http://127.0.0.1:54321/storage/v1/object/public/... を直接開き、画像が表示されることを確認。
・スマホで http://192.168.210.188:54321/storage/v1/object/public/... を直接開き、画像が表示されることを確認。
・画像削除後、再アップロードしてDBに保存される imageUrl が http://192.168.210.188:54321/... になることを確認。
・PCの管理画面 http://192.168.210.188:3000/admin/pagecontent... で画像プレビューが表示されることを確認。
・スマホの管理画面でも画像プレビューが表示されることを確認。
・公開ページ /explore で、該当ブロックに保存した画像が表示されることを確認。

【よくある落とし穴】
・127.0.0.1 はアクセス元自身を指す。PCではPC、スマホではスマホ自身になる。
・getPublicUrl() で返るURLをそのままDBに保存すると、スマホ確認で画像が表示されないことがある。
・replace() 修正後も、すでにDBに保存済みのURLは自動では変わらない。再アップロードまたはDB更新が必要。
・next.config.ts の remotePatterns を修正したら、Next.js devサーバーの再起動が必要。
・画像を保存したブロックキーと、公開ページ側で参照しているブロックキーが違うと、保存できていても公開ページには表示されない。
・input type="file" に保存済み画像をデフォルトセットすることはできない。保存済み画像はプレビューとして表示する。

【再発防止（Prevention）】
・ローカルSupabaseの公開URLはDB保存前に必ず normalizeLocalSupabasePublicUrl() を通す。
・画像URLを保存後、管理画面に実際の imageUrl を表示して、127.0.0.1 になっていないか確認できるようにする。
・公開ページで画像を使うブロックキーをルール化する。例：TOPの各要約画像は *_SUMMARY_BODY に保存する。
・本番運用では、ローカルURLではなく本番Supabaseの https://...supabase.co のURLを使う。
・画像表示確認はPCだけでなく、スマホ実機でも行う。
・next.config.ts に本番Supabase、ローカルSupabase、LAN IPの remotePatterns を入れておく。


今回の大事な学びは、**「画像保存は成功しているのに表示されない場合、URLのホスト名と参照しているブロックキーをまず見る」** です。




###[2026-06-15] [ngrok経由でNext.js開発環境を開くとClient Componentが正常に動作しない]

【影響範囲】
発生環境：
ローカル開発環境
Next.js dev server
ngrok経由の外部公開URL
`https://xxxxx.ngrok-free.dev`

緊急度：
中
LIFF検証前の外部URL確認ができないが、本番ビルドでは回避可能。

【症状】
何が起きたか：
ngrokで発行したURLからサイトを開くと、通常ページの一部機能が正常に動作しなかった。

具体的には以下が発生した。

・ヘッダーのドロワーメニューを押しても開かない
・体験/見学申し込みフォームで必須項目を入力しても送信ボタンが押せない
・お問い合わせフォームも正常に動作しない

一方で、LAN内URLである `http://192.168.xxx.xxx:3000` では同じ不具合は発生しなかった。

期待していた動作：
ngrok URLからアクセスしても、通常のローカル確認時と同じように以下が動作すること。

・ヘッダーのドロワーメニューが開く
・体験/見学申し込みフォームが入力後に送信できる
・お問い合わせフォームが正常に送信できる

【再現手順】

1. Next.jsを開発モードで起動する
   `npx next dev --hostname 0.0.0.0 --port 3000`

2. ngrokを起動する
   `ngrok http 3000`

3. ngrokで発行されたURLから通常ページを開く
   例：
   `https://xxxxx.ngrok-free.dev/explore`
   `https://xxxxx.ngrok-free.dev/session-application`
   `https://xxxxx.ngrok-free.dev/contact`

4. ドロワーメニューやフォーム操作を確認する

【エラーメッセージ / ログ】
・ブラウザConsoleに以下のエラーが出ていた。

`WebSocket connection to 'wss://xxxxx.ngrok-free.dev/_next/webpack-hmr?id=...' failed:`

【切り分けメモ（どこが怪しいか）】
・LIFF関連ページだけでなく、通常ページでも不具合が出ていた
・`/admin/liff` に入る前の `/explore` や `/session-application` でも動作不良が発生
・LAN内URLでは正常に動作していた
・ngrok URL経由のみで発生していた
・Consoleに `/_next/webpack-hmr` のWebSocket接続失敗が出ていた
・そのため、LIFF設定ではなく `next dev + ngrok` の開発用WebSocket/HMR周りが原因と判断した

【原因（Root Cause）】
・`next dev` は開発用に Hot Module Replacement、通称HMR、のWebSocket通信を使用する
・ngrok経由では `wss://xxxxx.ngrok-free.dev/_next/webpack-hmr` への接続が失敗していた
・その影響で、Next.jsの開発用クライアント処理が正常に動かず、Client Componentの挙動に問題が出た可能性が高い
・結果として、ドロワーやフォームの状態制御など、ブラウザ側JavaScriptに依存する機能が正常に動作しなかった

【結論】
・今回の不具合はLIFF実装そのものが原因ではない
・ngrok経由で `next dev` を使った場合の開発用HMR WebSocket接続失敗が原因
・LIFF検証や外部URL検証では、`next dev` ではなく本番ビルド後の `next start` を使う方が安定する

【解決策（Fix）】
・開発サーバーではなく、本番ビルドで起動してngrokに接続する

実行手順：

1. 本番ビルドする
   `npm run build`

2. 本番モードで起動する
   `npx next start -H 0.0.0.0 -p 3000`

3. 別ターミナルでngrokを起動する
   `ngrok http 3000 --host-header=localhost:3000`

4. 発行されたngrok URLで通常ページを確認する

【確認（動作検証）】
・以下の手順で確認した。

1. `npm run build` を実行
2. `npx next start -H 0.0.0.0 -p 3000` を実行
3. `ngrok http 3000 --host-header=localhost:3000` を実行
4. ngrok URLから通常ページを確認

確認結果：

・ヘッダーのドロワーが正常に開いた
・体験/見学申し込みフォームで必須項目入力後、送信ボタンが押せるようになった
・お問い合わせフォームも正常に動作した

このため、`next start + ngrok` では問題が解消することを確認済み。

【よくある落とし穴】
・LIFFの設定ミスと勘違いしやすい
・しかし、LIFFに入る前の通常ページでも壊れている場合は、まずngrok/Next.js側を疑う
・`next dev` は開発用HMR WebSocketを使うため、ngrok経由だと不安定になることがある
・`allowedDevOrigins` を設定しても、HMR WebSocketの問題が完全に解決しない場合がある
・`NEXT_PUBLIC_` 系の環境変数を変更した場合、本番ビルドでは再度 `npm run build` が必要

【再発防止（Prevention）】
・LIFFやLINE連携の外部URL検証では、原則として以下の構成を使う。

`npm run build`
↓
`npx next start -H 0.0.0.0 -p 3000`
↓
`ngrok http 3000 --host-header=localhost:3000`

・ngrok URLで不具合が出た場合は、まずConsoleの `/_next/webpack-hmr` エラーを確認する
・通常ページがngrokで正常に動くことを確認してから、LIFF設定確認に進む
・LIFFのEndpoint URLや環境変数を変更した場合は、本番ビルドをやり直す
・ローカル開発中の見た目確認は `next dev`、LINE/LIFF/ngrok確認は `next start` と使い分ける
