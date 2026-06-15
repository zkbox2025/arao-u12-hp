// next.config.ts

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
allowedDevOrigins: [
    "https://talia-noncrinoid-fructuously.ngrok-free.dev",
  ],

    experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uibiezgxpdfciznhbsxr.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "http",
        hostname: "192.168.210.188",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;