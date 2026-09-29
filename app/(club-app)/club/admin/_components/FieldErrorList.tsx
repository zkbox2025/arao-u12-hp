//app/(club-app)/club/admin/_components/FieldErrorList.tsx
//各入力項目ごとのエラーメッセージ配列を受け取り、エラーを赤字の箇条書きで各入力項目に表示する関数

type FieldErrorListProps = {
  id: string;
  errors?: readonly string[];
};

export function FieldErrorList({
  id,
  errors,
}: FieldErrorListProps) {
  if (!errors?.length) {
    return null;
  }

  return (
    <ul
      id={id}
      role="alert"
      className="mt-2 space-y-1 text-sm font-bold text-red-700"
    >
      {errors.map(
        (message, index) => (
          <li
            key={`${message}-${index}`}
          >
            {message}
          </li>
        ),
      )}
    </ul>
  );
}