// Service worker ElderSafe.
// Hanya men-cache app shell statis (halaman login, ikon, manifest).
// TIDAK PERNAH men-cache data dari Firebase atau response /api/* -
// data vitals dan status jatuh harus selalu real-time, caretaker tidak boleh
// melihat data basi saat koneksi sempat putus lalu nyambung lagi.

const CACHE_NAME = "eldersafe-shell-v1";
const SHELL_URLS = ["/login", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Jangan sentuh sama sekali: API routes, dashboard (selalu harus data segar
  // dan terverifikasi server), dan koneksi WebSocket Firebase.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/dashboard") ||
    req.headers.get("upgrade") === "websocket"
  ) {
    return;
  }

  // Network-first untuk shell: kalau online, selalu ambil versi terbaru dan
  // refresh cache. Kalau offline, baru jatuh ke cache (mis. halaman login
  // tetap bisa tampil walau sinyal hilang sebentar).
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
