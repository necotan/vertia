import type { NextConfig } from "next";

// Service Worker の登録 URL に付けるバージョン
const serviceWorkerVersion =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now());

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // 走行記録で位置情報・devicemotion（accelerometer と gyroscope）・画面の消灯防止を使うため、これらは self に許可する
  {
    key: "Permissions-Policy",
    value: [
      "geolocation=(self)",
      "accelerometer=(self)",
      "gyroscope=(self)",
      "screen-wake-lock=(self)",
      "camera=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "browsing-topics=()",
    ].join(", "),
  },
  // 描画前に <html lang> を設定するインラインスクリプトと MapLibre を壊さないよう、スクリプトを制限しないディレクティブだけにする
  {
    key: "Content-Security-Policy",
    value: [
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  env: {
    SERVICE_WORKER_VERSION: serviceWorkerVersion,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // 同じキーは後のルールが優先されるため、/sw.js の厳しい CSP を全体設定より後に置く
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
