//app/(club-app)/club/admin/_components/FormErrorAlert.tsx
//フォーム全体で発生したエラー（サーバーエラー、ログイン失敗、通信タイムアウトなど）を受け取り、
// アラートとして表示する関数

type FormErrorAlertProps = {
  message: string | null;
};

export function FormErrorAlert({
  message,
}: FormErrorAlertProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-lg border border-red-200 bg-red-50 p-4"
    >
      <p className="text-sm font-bold text-red-700">
        {message}
      </p>
    </div>
  );
}