// app/sitemap.ts
// Googleなどの検索エンジン向けサイトマップ

import type { MetadataRoute } from "next";

const baseUrl =
  process.env.APP_BASE_URL ?? "https://arao-u12-basketballclub.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes = [
    "",
    "/about",
    "/contact",
    "/explore",
    "/faq",
    "/flow",
    "/join",
    "/notice",
    "/policy",
    "/session-application",
    "/staff",
    "/summary",
    "/term",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}