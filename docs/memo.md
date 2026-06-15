//docs/memo.md
//開発中の学習メモをそのまま載せています（原本）
# arao-u12-hp



## 失敗ログはこちらarao-u12-hp/docs/troubleshooting.md


## 日々の気づきとメモ (Development Log)
◯supabaseプロジェクト初期設定
.env.localの環境変数を設定する際の確認の仕方：ローカルドッカーの設定をする際にターミナルに以下が出てくる
・secretkeysにあるsb＿secret_から始まるURLがSUPABASE_SERVICE_ROLE_KEY=
・Publishable keyにあるsb_publishableから始まるURLがNEXT_PUBLIC_SUPABASE_ANON_KEY=

◯githubに初プッシュする際の確認（これがないとプッシュできない）
VSCodeの.gitのconfigの
[remote "origin"]
url = https://github.com/zkbox2025/arao-u12-hp
fetch = +refs/heads/*:refs/remotes/origin/*

※url = https://github.com/...
データの送信先（住所）
fetch = +refs/heads/*:refs/remotes/origin/*
ブランチの同期ルール

◯<ul>・・・</ul>について
役割：箇条書きのリストを作る際に用いる。
主な用途：ナビゲーションメニュー、商品一覧など
SEO（検索エンジン最適化）とアクセシビリティ（全ての人が問題なくサイトを使用できる）が高い

◯<li>・・・</li>について
役割：箇条書きの項目を作る

（例）<ul className="space-y-1">
              {publicNavigationItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className="block rounded-lg px-3 py-3 text-base font-medium text-neutral-800 transition hover:bg-green-50 hover:text-green-800"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>



◯<a>・・・</a>について
役割：別のページや、ページ内の特定の場所に「リンク」させるときに使う
（例）<a href="https://example.com">公式サイトはこちら</a>

◯フォーム送信後の流れ
1. ユーザーがフォーム入力
2. 送信ボタンを押す
3. Server Action が FormData を受け取る
4. ボット判定専用関数に入れてチェック
5. 送信速度判定関数に入れてチェック
6. Zodで入力チェック
7. エラーがあれば画面に返す
8. レートリミット関数で送信回数制限を行う
9. 送信回数が超えていたらエラーを返す
10. 問題なければ prisma.xxx.create() でDB保存
11. DB保存に成功したデータが savedXxx として返る
12. savedXxx をメール送信関数に渡す
13. Resendで管理者に通知メール送信
14. メール送信に失敗してもDB保存済みなら完了扱い
15. 完了URLへ redirect

バリデーションNG
→ DB保存しない
→ rate limitログも保存しない
→ 入力エラー表示

バリデーションOK + rate limit BLOCKED
→ Contactには保存しない
→ formSubmissionLogにBLOCKEDとして保存
→ エラーメッセージ表示

バリデーションOK + rate limit ALLOWED
→ Contactに保存
→ formSubmissionLogにALLOWEDとして保存
→ 管理者通知メール
→ 送信者確認メール
→ /contact?submitted=success#top へredirect

◯フォーム送信時のバリデーションのエラーの時に初期状態（空）で戻るため、デフォルト値を入力した。その後、エラー時に選択肢の質問が初期値（選択してください）になって戻ってきた。その際の対応について。
入力欄
→ defaultValue が比較的そのまま見た目に残りやすい

select
→ defaultValue は初回だけなので、エラー後に戻らないことがある

入力フォームの質問項目のインプットにkey を付ける
→ select を作り直す（Reactにセレクトを教えてあげる）
→ 送信時の値を defaultValue としてもう一度反映できる


2026/06/02
【useActionState と key によるフォーム復元の流れ】

1. 最初の表示
useActionState（Action関数の戻り値であり引数） の state はまだ実行されていないため以下のように初期状態。

state = {
  ok: false,
  message: "",
  errors: {},
  values: {}, ※←これがstate.values
}

このとき formKey は以下になる。
const formKey = JSON.stringify(state.values ?? {});であり、
state.valuesが空のため

formKey = "{}"

そのため、SessionApplicationFormInner は key="{}" の状態で表示される。


2. ユーザーがフォームに入力する
ユーザーが参加内容、学年、経験年数、名前などを入力しても、この時点では state.values はまだ変わらない。

理由は、state.values は Server Action関数 から返ってきた値だから。
入力した瞬間に React の state.values が自動で更新されるわけではない。


3. 送信してバリデーションエラーになる
フォームを送信すると formAction が実行される。

<form action={formAction}>

Server Action 側で FormData から送信時の値を集める。

const values = {
  type: getStringValue(formData, "type"),
  childName: getStringValue(formData, "childName"),
  childGrade: getStringValue(formData, "childGrade"),
  experience: getStringValue(formData, "experience"),
  agreed: formData.get("agreed") === "on" ? "on" : "",
};

バリデーションエラーがあれば、errors と一緒に values を返す。

return {
  ok: false,
  message: "入力内容を確認してください",
  errors: getFieldErrors(parsed.error.issues),※←バリデーション後のエラーコメントを入れる
  values,　※←これがstate.values　入力値を文字列にして入れる（エラー時に入力欄に入ってる状態で返すため）
};

これにより、useActionState の state.values が送信時の入力値に更新される。


4. state.values が変わると key も変わる
formKey は state.values から作っている。

const formKey = JSON.stringify(state.values ?? {});

最初はこう。

formKey = "{}"

エラー後はこうなる。

formKey = '{"type":"TRIAL","childName":"山田太郎","childGrade":"ELEMENTARY_3","experience":"NONE","agreed":"on"}'

key が変わると、React は「前とは別の SessionApplicationFormInner だ」と判断する。
その結果、SessionApplicationFormInner が作り直される。
<SessionApplicationFormInner
      key={formKey}
      state={state}
      formAction={formAction}
    />


5. なぜ作り直す必要があるのか
useState の初期値は、そのコンポーネントが最初に作られたときだけ使われる。

const [agreed, setAgreed] = useState(state.values?.agreed === "on");

key がない場合、エラー後に state.values.agreed が "on" になっても、同じ SessionApplicationFormInner が再利用される。
そのため、useState の初期値は再実行されず、チェックボックスの状態が復元されないことがある。

key が変わると SessionApplicationFormInner が作り直されるため、useState の初期値がもう一度評価される。
その結果、state.values.agreed === "on" なら agreed が true で始まる。


6. input や select の復元
※ useStateで管理していない入力項目には defaultValue を付ける。
※ select など、defaultValue の再反映が不安定な項目は、keyを付けて作り直す。（Reactが同じ <select> を再利用すると、エラー後に state.values.type が変わっても、見た目の選択状態が更新されないことがあるため。）
※ ただし、SessionApplicationFormInner 全体に key={formKey} を付けて作り直しているなら、select個別のkeyは必須ではない。

<input
  id="email"
  name="email"
  type="email"
  defaultValue={state.values?.email ?? ""}
  className="w-full rounded-lg border border-neutral-300 px-4 py-3"
/>


<select
  key={state.values?.childGrade ?? "childGrade-empty"}
  id="childGrade"
  name="childGrade"
  defaultValue={state.values?.childGrade ?? ""}
  className="w-full rounded-lg border border-neutral-300 px-4 py-3"
>

defaultValue も基本的には「その要素が作られたときの初期値」。
そのため、key によって SessionApplicationFormInner が作り直されると、新しい input/select が作られ、その時点の state.values が defaultValue として反映される。



【重要な整理】
state.values はエラー時に画面へ返ってくる
↓
でも defaultValue は「初回作成時だけ」効く
↓
同じフォーム部品が再利用されると、state.values が変わっても見た目に反映されないことがある
↓
key を変える
↓
フォーム部品を作り直す
↓
defaultValue がもう一度効く
↓
state.values が画面に反映される

◯upsertとは
データがすでにあれば更新。なければ追加をするということ


◯レスポンシブ対応のチェック方法
1.ターミナルでのコマンド：「ipconfig getifaddr en0」でIPアドレスを確認する
2..nextを削除してから開発サーバーをIPアドレス指定で起動する
以下をターミナルでコマンドしてブラウザを立ち上げる(IPアドレスが以下の場合：192.168.210.198)
「rm -rf .next
npx next dev --hostname 192.168.210.198 --port 3000」
3.PCおよびスマホを以下のURLで開いて確認する
 http://192.168.210.198:3000/explore

【注意】
・localhost:3000` はスマホからは使わない
・表示やクリック挙動がおかしい場合は、一度 `.next` を削除して開発サーバーを再起動する。

◯　Next.jsのクライアント遷移で前の状態が残っており、遷移先のページ内の中途半端なところに遷移する場合は、明示的にページの一番上に戻ってと指示すればOK。
例）redirect("/contact?submitted=success#top");
※#topはハッシュフラグメントと言ってページ内のどこにスクロールするか（ブラウザの制御用）のもので、クエリパラメータ（?submitted=success）とは明確に区別される。そのため、遷移先のconst isSubmitted = params.submitted === "success";はそのままでいい。


◯updateSession と createClient の違い（動く場所とタイミング）
この2つの関数は、Next.jsのシステム内において「動くステージ」と「実行されるタイミング」が明確に分かれています。
1. updateSession（ミドルウェア）動く場所：
ページが実際に表示される「前」の特殊な通り道（ミドルウェア層）動くタイミング：ユーザーがURLをクリックして画面が切り替わる瞬間に、Next.jsによって自動的に1回だけ実行されます。画面を作る前に、裏側でログイン期限の延長処理（セッション更新）だけをサッと済ませる全自動のガードマンのような存在です。

2. createClient（サーバーコンポーネント・サーバーアクション等）動く場所：
ページが表示される「中」の通常のプログラム内部（アプリケーション層）動くタイミング：画面に文字やデータを表示するとき、あるいはユーザーが「ログインボタン」を押したときなど、開発者がコードの中で直接呼び出したタイミングで実行されます。Supabaseからデータを取得したり、ログイン命令を出したりするための、手元の万能な道具箱のような存在です。

◯ミドルウェアの「無限リダイレクト」について
※今回の実装では未ログイン判定はページ側でrequireAdmin関数で行う。ミドルウェアは「クッキーを最新に保つ」ことだけに注力しているのでこれには当てはまらない（ミドルウェアが未ログイン判定を行う場合、リダイレクト先をログインページにした上でログインページもログインが必要としたら無限リダイレクトになるという危険性をこれからのべる）

危ないのは、middleware 側にこういう処理を入れた場合（未ログイン判定を入れた場合）です。

if (!user) {
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

この状態で matcher がこれだとします。

export const config = {
  matcher: ["/admin/:path*"],//adminから始まる全てのURLで行う
};

すると /admin/login も middleware の対象になります。

流れはこうです。

/admin/dashboard にアクセス
↓
middleware が未ログイン判定
↓
/admin/login にリダイレクト
↓
/admin/login にアクセス
↓
でも /admin/login も middleware 対象
↓
middleware が未ログイン判定
↓
また /admin/login にリダイレクト
↓
無限ループ

つまり、ログインページに行きたいのに、ログインページ自身も「未ログイン禁止」扱いされるのが問題です。


◯Next.jsでは、フォルダ名に丸カッコがついた (dashboard)（ルートグループ）はURLから完全に無視（省略）される

◯ <Icon size={18} aria-hidden="true" />
「目が見えない方が使う『画面読み上げソフト（スクリーンリーダー）』に対して、このアイコンを無視（非表示に）してください」と指示する設定


◯過去に書いたメモ（defaultMemo）が最初から6行分の高さで表示されており、改行しながら新しく書き直して保存できる、綺麗な見た目の入力欄
 <textarea
        name="adminMemo"
        rows={6}
        defaultValue={defaultMemo}
        className="w-full rounded-lg border border-neutral-300 px-4 py-3"
      />

      

◯FAQの編集フォームで${faqId}を使う理由
・「label と textarea を正しく連動させるため」
・「画面内でのIDの重複（バグ）を防ぐため（クリックしたらクリックした質問と回答を編集できるようにするため）」

<div>
        <label
          htmlFor={`edit-question-${faqId}`}
          className="block text-sm font-bold text-neutral-900"
        >
          質問
        </label>
        <textarea
          id={`edit-question-${faqId}`}
          name="question"
          rows={3}
          defaultValue={defaultQuestion}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
        />
      </div>

      <div>
        <label
          htmlFor={`edit-answer-${faqId}`}
          className="block text-sm font-bold text-neutral-900"
        >
          回答
        </label>
        <textarea
          id={`edit-answer-${faqId}`}
          name="answer"
          rows={6}
          defaultValue={defaultAnswer}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
        />
      </div>


◯Prisma７より、seedする際の設定が変わった。
Prisma 6まではpackage.jsonに以下を書き加えなければならなかったが、

//package.json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}

Prisma７よりprisma.config.ts管理になった。
以下、実装例。

//prisma.config.ts

import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",　　　　　　　　　　//←※（書き加えること）
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});


◯プルダウン選択の表示について
（以下return）
<select
※ここからはプルダウンを動かした時の挙動について
          id="pageKey"
          value={selectedPageKey}
          onChange={(event) => {
            const nextPageKey = event.target.value as PageContentPageKey;
            const nextBlockKey = getFirstBlockKey(nextPageKey);

            moveTo({
              pageKey: nextPageKey,
              blockKey: nextBlockKey,
            });
          }}
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3"
        >
※ここからは表示についてのコード
          {PAGE_CONTENT_PAGE_KEYS.map((pageKey) => (
            <option key={pageKey} value={pageKey}>
              {PAGE_CONTENT_DEFINITIONS[pageKey].label}
            </option>
          ))}
        </select>
    

◯ユーザーには見せる必要はないけど、フォーム送信の際に、「どのページのどのパーツなのか」を入力値と一緒に送るために
以下のように明記する
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="pageKey" value={pageKey} />
      <input type="hidden" name="blockKey" value={blockKey} />
      ・・・



◯\nは改行
例）fallback: "ARAO U-12\nBASKETBALL CLUB",
表示：
ARAO U-12
BASKETBALL CLUB

◯fallback：空欄だった場合のデフォルト文言


◯satori時の実装型との変更点について
ToastMessageではURLを触らない
↓
Server Actionのredirect URLに toastId を付ける
↓
ToastMessageのkeyに toastId を入れる
↓
同じページ・同じパーツを連続保存しても毎回トーストが出る
↓
router.replaceとの競合がなくなる

◯key はコンポーネントに渡される通常の props ではなく、React が内部で使う特別な属性。
React は key を見て、前回と同じコンポーネントとして扱うか、別のコンポーネントとして作り直すかを判断する。key の値が変わると、そのコンポーネントは再マウントされる。再マウントされると useState や useActionState などの内部状態が初期化される。
また、input や select や textarea で defaultValue / defaultChecked を使っている場合、defaultValue は基本的に「最初に表示されたとき」だけ反映される。
そのため、エラー時に state.values が返ってきても、すでに表示済みのフォームが同じコンポーネントとして残っていると、defaultValue が再反映されず、古い初期値のまま見えることがある。
このような場合に、state.values の内容や toastId などを key に含めて key を変えると、React がフォームを別物として再マウントする。
その結果、defaultValue / defaultChecked がもう一度読み込まれ、エラー時に返ってきた state.values の入力内容をフォームへ再表示しやすくなる。つまり key を変える効果は、「入力値を直接渡すこと」ではなく、「コンポーネントを作り直して、defaultValue を再適用させること」。
フォーム送信後に入力欄・選択項目・エラー状態をリセットしたい場合や、逆にエラー時に返ってきた state.values を defaultValue として確実に反映したい場合に有効。

◯liffの流れについて再度復習すること。ワンタップで処理完了：申し込み通知をラインでタップした瞬間にラインの中で申し込み管理画面が開き、そのまま「承認」や「返信」の操作ができるように実装する。

◯スムーズスクロールの部分をコード理解する

