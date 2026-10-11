"use client";

import { useEffect } from "react";

/** Registers the service worker in production so the notebook installs as an app. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: the site works the same, it just won't open offline.
    });
  }, []);
  return null;
}
