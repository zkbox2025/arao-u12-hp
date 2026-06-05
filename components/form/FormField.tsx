//components/form/FormField.tsx
//フォームのフィールドを表示するコンポーネント(任意と必須のバッジやエラーメッセージの箱を表示する)

import { OptionalBadge } from "./OptionalBadge";
import { RequiredBadge } from "./RequiredBadge";

type FormFieldProps = {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
};

export function FormField({
  label,
  name,
  required = false,
  error,
  children,
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-bold text-neutral-900">
        {label}
        {required ? <RequiredBadge /> : <OptionalBadge />}
      </label>

      {children}

      {error ? (
        <p className="text-sm font-medium text-red-600">{error}</p>
      ) : null}
    </div>
  );
}