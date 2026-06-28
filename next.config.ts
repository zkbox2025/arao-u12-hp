// next.config.ts

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
allowedDevOrigins: [
    "https://talia-noncrinoid-fructuously.ngrok-free.dev",
  ],

    experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
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

export default nextConfig;