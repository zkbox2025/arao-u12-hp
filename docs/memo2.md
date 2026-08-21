//docs/memo2.md
//開発中の学習メモをそのまま載せています（原本）

◯DBでのsetnullについて：ライン送信履歴で以下のようにイベントIDを送信履歴テーブルにリレーションする際、
event ClubEvent? @relation(
  fields: [eventId],
  references: [id],
  onDelete: SetNull
)
なぜsetnullにするのか
→イベント削除時に履歴自体を削除せずにイベントidのみnullにして
LINE送信履歴
 ├─ eventId = null
 ├─ contentTitle = "8月の練習"
 └─ messageSnapshot = "集合は9時です"
 というように履歴を残しておくため

※複合（二つを結びつける）外部キー（他の場所にある参照しているコード）の場合、setnullにするとイベントを削除したらeventId, clubIdの両方がsetnullになり、エラーになってしまうので注意すること。
event ClubEvent? @relation(
  fields: [eventId, clubId],
  references: [id, clubId],
  onDelete: SetNull
)

※まとめ
Setnull：親が削除されたら子の外部キーは削除ではなくがnullになる
Cascade：親が削除されたら子も削除される
Restrict：親がいる限り親は削除されない
SetDefault：親が消えたら、子の外部キーをあらかじめ設定しておいた「デフォルト値（初期値）」に書き換える

◯【重要！】次メインにマージするときはPRした残りからマージする


◯先に開発ページから作るのではなくて、開発基板、DB、アプリ認可基板、共通基板から実装してから、ログインやレイアウトを実装し、その後に各機能やページなどを実装するようにすると、責務分離等が楽。