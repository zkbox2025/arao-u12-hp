//domain/club/event/event-calendar-navigation.ts
// イベント一覧の前月・翌月・前日・翌日リンクを作るための純粋関数

//年月の表示型(2026-08)
const YEAR_MONTH_PATTERN =
  /^(\d{4})-(\d{2})$/;
//日の表示型(2026-08-24)
const DATE_ONLY_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})$/;

  //一桁の数字が来たら頭に0をつけて二桁にする関数
function pad2(
  value: number,
): string {
  return String(value).padStart(
    2,
    "0",
  );
}

//年月の文字列(2026-08)を指定して月数分だけ前後にずらす関数
export function shiftYearMonth(
  yearMonth: string,//ずらす月
  amount: number,//何ヶ月ずらすか
): string {
  const match =
    YEAR_MONTH_PATTERN.exec(//年月の型チェック
      yearMonth,
    );

  if (!match) {
    throw new RangeError(
      "年月が正しくありません。",
    );
  }

  const year = Number(match[1]);//2026→2026
  const month = Number(match[2]);//08→８

  // 月が 1未満（0以下）、または 12より大きい場合（例: "2026-15" など）
  if (
    month < 1 ||
    month > 12
  ) {
    throw new RangeError(
      "年月が正しくありません。",
    );
  }

  const totalMonths =
    year * 12 +// 年をすべて「月」に換算する（2026年 × 12ヶ月）
    (month - 1) +// 計算しやすいように、月を「0〜11」にするために 1 引く
    amount;// ずらしたい月数（amount）を足す（または引く）

  const nextYear =
    Math.floor(totalMonths / 12);// // 通算月数を 12 で割って、小数点以下を切り捨てて新しい年を出す

  const nextMonth =
    (totalMonths % 12) + 1;// 12 で割った「余り（%）」を計算し、さっき引いた 1 を元に戻す（1〜12月にする）

    // 「新しい年」を4桁に揃え（padStart）、「新しい月」をさっきの pad2 で2桁にする
  return `${String(
    nextYear,
  ).padStart(4, "0")}-${pad2(
    nextMonth,
  )}`;
}

//日付の文字列(2026-08-24)を、指定した日数分だけ前後にずらす
export function shiftDateOnly(
  dateOnly: string,//ずらしたい日付(2026-08-24)
  amount: number,//何日ずらしたいか
): string {
  const match =
    DATE_ONLY_PATTERN.exec(//日の表示型(2026-08-24)で検品する
      dateOnly,
    );

  if (!match) {
    throw new RangeError(
      "日付が正しくありません。",
    );
  }

  const year = Number(match[1]);//2026→2026
  const month = Number(match[2]);//08→8
  const day = Number(match[3]);//24→24

  const date = new Date(
    Date.UTC(
      year,
      month - 1,//最初から月から1を引いておく「0~11」
      day + amount,//ずらしたい日付を足す
    ),
  );

  return [
    String(
      date.getUTCFullYear(),
    ).padStart(4, "0"),//年を4桁にする
    pad2(
      date.getUTCMonth() + 1,//月に1を足す
    ),
    pad2(date.getUTCDate()),//日を2桁にする
  ].join("-");//全てをハイフンで繋ぐ
}


//"2026-08-24"（年月日）という文字から、後ろの『日』を削って "2026-08"（年月）だけを取り出す
export function getYearMonthFromDateOnly(
  dateOnly: string,//削りたい日付(2026-08-24)
): string {
  if (
    !DATE_ONLY_PATTERN.test(//日付型で検品する
      dateOnly,
    )
  ) {
    throw new RangeError(
      "日付が正しくありません。",
    );
  }

  return dateOnly.slice(0, 7);//最初の７文字を綺麗に切り取る
}

//"2026-08" のような文字列を、"2026年8月" という日本語の表記に変える
export function formatYearMonthLabel(
  yearMonth: string,//日本語にしたい年月
): string {
  const match =
    YEAR_MONTH_PATTERN.exec(//年月の型で検品
      yearMonth,
    );

  if (!match) {
    throw new RangeError(
      "年月が正しくありません。",
    );
  }

  return `${Number(
    match[1],
  )}年${Number(match[2])}月`;//日本語で表示する
}

//"2026-08-24"（年月日）という文字列から、曜日を自動で計算して、"2026年8月24日（月）" という日本語の表記に変える
export function formatDateOnlyLabel(
  dateOnly: string,//日本語表示にしたい日付(2026-08-24)
): string {
  const match =
    DATE_ONLY_PATTERN.exec(//日付型で検品
      dateOnly,
    );

  if (!match) {
    throw new RangeError(
      "日付が正しくありません。",
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const weekday =
    [
      "日",
      "月",
      "火",
      "水",
      "木",
      "金",
      "土",
    ][
      new Date(//UTCで組み立てる
        Date.UTC(
          year,
          month - 1,
          day,
        ),
      ).getUTCDay()//その日が何曜日かを0~6で教えてもらう
    ];

  return `${year}年${month}月${day}日（${weekday}）`;
}