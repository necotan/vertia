"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const scriptUrl = `/sw.js?v=${encodeURIComponent(process.env.SERVICE_WORKER_VERSION ?? "")}`;
    navigator.serviceWorker.register(scriptUrl, { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);

  return null;
}
