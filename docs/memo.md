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
4. Zodで入力チェック
5. エラーがあれば画面に返す
6. 問題なければ prisma.xxx.create() でDB保存
7. DB保存に成功したデータが savedXxx として返る
8. savedXxx をメール送信関数に渡す
9. Resendで管理者に通知メール送信
10. メール送信に失敗してもDB保存済みなら完了扱い
11. 完了URLへ redirect

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