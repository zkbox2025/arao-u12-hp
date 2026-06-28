// components/form/PrivacyAgreementField.tsx
// プライバシーポリシー同意チェック欄の共通コンポーネント（問い合わせフォームと体験見学フォーム）

type PrivacyAgreementFieldProps = {
  id: string;
  agreed: boolean;
  onAgreedChange: (checked: boolean) => void;
  error?: string;
  onOpenPrivacy: () => void;
};

export function PrivacyAgreementField({
  id,
  agreed,
  onAgreedChange,
  error,
  onOpenPrivacy,
}: PrivacyAgreementFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 text-sm leading-7">
        <input
          id={id}
          type="checkbox"
          name="agreed"
          checked={agreed}
          onChange={(event) => onAgreedChange(event.target.checked)}
          className="mt-1"
        />

        <div>
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="font-bold text-green-700 underline"
          >
            プライバシーポリシー
          </button>

          <label htmlFor={id} className="ml-1">
            に同意する
          </label>
        </div>
      </div>

      {error ? (
        <p className="text-sm font-medium text-red-600">{error}</p>
      ) : null}
    </div>
  );
}