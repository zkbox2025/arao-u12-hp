// domain/club/line/line-target-policy.ts
// アプリのライン通知を特定のグループラインに送っていいかを判定する

//お知らせ公開対象：OWNER、COACH
//LINEグループ：OWNER、COACH
//→ 送信可能

//お知らせ公開対象：OWNER
//LINEグループ：OWNER、MEMBER
//→ 送信不可

import type {
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
} from "@/types/prisma";


//イベントやお知らせ通知をあるLINEグループに配信してもよいかどうかを判定する関数
export function isLineTargetAllowedForContent(
  input: {
    contentTargetRoles://イベント・お知らせ情報にあるターゲットロール
      readonly ClubMemberRole[];

    lineTargetRoles://通知先のLINEグループに設定されているターゲットロール
      readonly ClubMemberRole[];
  },
): boolean {
  /*
   * role未設定のLINEグループは
   * 宛先の意味が不明なため拒否する。
   */
  if (
    input.lineTargetRoles
      .length === 0
  ) {
    return false;
  }

  //「関係ないグループや、権限のない相手」に誤送信してしまうのを防ぐために、2つの設定を見比べている
  return input.lineTargetRoles.every(//通知先のLINEグループに設定されているターゲットロールがイベント・お知らせ情報にあるターゲットロールに全て含まれているかを確認する
    (role) =>
      input.contentTargetRoles.includes(
        role,
      ),
  );
}