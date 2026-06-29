// app/admin/_components/AdminScrollToTop.tsx
// LIFFなど外部遷移後に管理画面のトップへスクロールするClient Component

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function AdminScrollToTop() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const shouldScrollToTop =
      sessionStorage.getItem("adminScrollToTop") === "1" ||
      window.location.hash === "#top";

    if (!shouldScrollToTop) return;

    sessionStorage.removeItem("adminScrollToTop");

    requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      const topElement = document.getElementById("top");

      topElement?.focus({
        preventScroll: true,
      });
    });
  }, [pathname, searchParams]);

  return null;
}