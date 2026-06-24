"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Tidak fatal: aplikasi tetap berfungsi normal tanpa service worker,
      // ini cuma menghilangkan kemampuan "Add to Home Screen" sebagai PWA.
      console.error("Gagal mendaftarkan service worker:", err);
    });
  }, []);

  return null;
}
