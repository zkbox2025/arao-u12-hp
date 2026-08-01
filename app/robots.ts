// app/robots.ts
// 検索エンジン向けのクロール設定

import type { MetadataRoute } from "next";

const baseUrl =
  process.env.APP_BASE_URL ?? "https://arao-u12-basketballclub.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}