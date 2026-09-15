import type { NextConfig } from "next";

// Service Worker の登録 URL に付けるバージョン
const serviceWorkerVersion =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now());

const nextConfig: NextConfig = {
  env: {
    SERVICE_WORKER_VERSION: serviceWorkerVersion,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
