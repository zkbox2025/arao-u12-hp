// app/admin/liff/AdminLiffGate.tsx
// LIFF初期化後、指定された管理画面URLへ移動するClient Component

"use client";

import { useEffect, useState } from "react";
import liff from "@line/liff";

type AdminLiffGateProps = {
  nextPath: string;
};

function sanitizeAdminPath(path: string) {
  if (!path.startsWith("/admin/")) {
    return "/admin/dashboard";
  }

  if (path.startsWith("/admin/liff")) {
    return "/admin/dashboard";
  }

  return path;
}

function buildRedirectUrl(path: string) {
  const url = new URL(path, window.location.origin);
  url.hash = "top";
  return url.toString();
}

export function AdminLiffGate({ nextPath }: AdminLiffGateProps) {
  const [message, setMessage] = useState("LINE管理画面を起動しています...");
  const [debugMessage, setDebugMessage] = useState("");

  useEffect(() => {
    async function bootLiff() {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

      setDebugMessage(`currentUrl: ${window.location.href}`);

      if (!liffId) {
        setMessage("LIFF IDが設定されていません。");
        setDebugMessage("NEXT_PUBLIC_LIFF_ID が空です。");
        return;
      }

      try {
        setMessage("LIFFを初期化しています...");

        await liff.init({
          liffId,
        });

        setMessage("LINEログイン状態を確認しています...");

        if (!liff.isLoggedIn()) {
          setMessage("LINEログインへ移動しています...");

          liff.login({
            redirectUri: window.location.href,
          });

          return;
        }

        setMessage("管理画面へ移動しています...");

        const safePath = sanitizeAdminPath(nextPath);
        const redirectUrl = buildRedirectUrl(safePath);

        window.location.replace(redirectUrl);
      } catch (error) {
        console.error("LIFFの初期化に失敗しました。", error);

        setMessage("LINE管理画面の起動に失敗しました。");
        setDebugMessage(
          error instanceof Error ? error.message : "不明なエラー"
        );
      }
    }

    bootLiff();
  }, [nextPath]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-bold text-green-700">ARAO U-12 ADMIN</p>

        <h1 className="mt-3 text-xl font-black text-neutral-900">
          管理画面を開いています
        </h1>

        <p className="mt-4 leading-8 text-neutral-600">{message}</p>

        {debugMessage ? (
          <p className="mt-4 break-all rounded-lg bg-neutral-100 p-3 text-left text-xs leading-6 text-neutral-500">
            {debugMessage}
          </p>
        ) : null}
      </div>
    </main>
  );
}