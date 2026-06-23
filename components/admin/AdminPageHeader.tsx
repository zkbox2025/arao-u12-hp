// components/admin/AdminPageHeader.tsx
// 管理画面ページタイトル用ヘッダー

import { adminNavigationItems } from "@/constants/adminNavigation";

type AdminPageHeaderProps = {
  href: (typeof adminNavigationItems)[number]["href"];
  title?: string;
  children?: React.ReactNode;
  showBorder?: boolean;
};

export function AdminPageHeader({
  href,
  title,
  children,
  showBorder = true,
}: AdminPageHeaderProps) {
  const navigationItem = adminNavigationItems.find((item) => item.href === href);
  const Icon = navigationItem?.icon;
  const displayTitle = title ?? navigationItem?.label ?? "";

  return (
      <div className={showBorder ? "border-b border-neutral-300 pb-5" : "pb-0"}>
      <p className="text-sm font-bold text-green-700">ADMIN</p>

      <div className="mt-2 flex items-center gap-3">
        {Icon ? (
          <span className="inline-flex items-center justify-center text-neutral-900">
            <Icon size={24} aria-hidden="true" />
          </span>
        ) : null}

        <h1 className="text-2xl font-black text-neutral-900">
          {displayTitle}
        </h1>
      </div>

      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}