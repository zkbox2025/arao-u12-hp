// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 【追加：F06粒度4】初回応答と遷移後の招待関連応答を保護する。
  async headers() {
    return [
      "/welcome",
      "/club-invitations/accept",
      "/auth/confirm",
    ].map((source) => ({
      source,
      headers: [
        {
          key: "Cache-Control",//キャッシュ禁止
          value: "no-store",
        },
        {
          key: "Referrer-Policy",//リンク情報の非表示（URLにトークンが入っているから）
          value: "no-referrer",
        },
      ],
    }));
  },

  allowedDevOrigins: [
    "https://ngrok-free.dev",
  ],

  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uibiezgxpdfciznhbsxr.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig; // 👈 元のシンプルな形に戻す
