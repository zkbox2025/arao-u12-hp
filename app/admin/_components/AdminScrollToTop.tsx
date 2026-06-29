// app/admin/_components/AdminScrollToTop.tsx
// LIFFなど外部遷移後に管理画面のトップへスクロールするClient Component

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function scrollAdminPageToTop() {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: "auto",
  });

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  const topElement = document.getElementById("top");

  topElement?.scrollIntoView({
    behavior: "auto",
    block: "start",
  });

  topElement?.focus({
    preventScroll: true,
  });
}

export function AdminScrollToTop() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  useEffect(() => {
    const shouldScrollToTop =
      sessionStorage.getItem("adminScrollToTop") === "1" ||
      window.location.hash === "#top";

    if (!shouldScrollToTop) return;

    sessionStorage.removeItem("adminScrollToTop");

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    scrollAdminPageToTop();

    requestAnimationFrame(() => {
      scrollAdminPageToTop();
    });

    const timeoutIds = [50, 150, 300, 700].map((delay) =>
      window.setTimeout(() => {
        scrollAdminPageToTop();
      }, delay)
    );

    return () => {
      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, [pathname, searchParamsString]);

  return null;
}