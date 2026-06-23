// lib/notifications/run-notifications.ts
// 通知処理を並列実行し、失敗してもフォーム送信自体は止めない共通処理

type SilentNotificationTask = {
  label: string;
  task: () => Promise<unknown>;
};

export async function runSilentNotifications(
  tasks: readonly SilentNotificationTask[]
) {
  const results = await Promise.allSettled(//受け取ったtask配列から実行する関数（item.task（））だけ取り出して並列処理する。
    tasks.map((item) => item.task())//allsetted:どれが失敗しようが全ての処理が終わるまで見届ける
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`${tasks[index]?.label ?? "通知処理"}に失敗しました`, result.reason);
    }
  });
}