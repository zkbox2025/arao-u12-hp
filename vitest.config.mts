//vitest.config.mts
//npm run verify:localなどテストで動作確認をする際にテストコードとして読むべきファイルを選定する（ターゲット選定）コード


import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "app/**/*.{test,spec}.{ts,tsx}",
      "lib/**/*.{test,spec}.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
      "domain/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["app/generated/**"],
  },
});