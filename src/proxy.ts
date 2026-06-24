import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "monitor_lansia_session";

// CATATAN ARSITEKTUR (defense-in-depth):
// Di Next.js 16, file ini disebut "proxy" (dulu bernama middleware.ts di
// Next.js 14-15) — berjalan di Edge Runtime, yang TIDAK mendukung Firebase
// Admin SDK (butuh Node.js crypto APIs). Jadi proxy ini cuma melakukan
// pengecekan CEPAT "apakah cookie session ada?" untuk redirect awal yang
// responsif.
//
// Verifikasi KRIPTOGRAFIS sesungguhnya (apakah cookie itu valid, belum
// di-revoke, dsb) dilakukan ulang di Server Component dashboard lewat
// getVerifiedSession() — lihat src/lib/session.ts. Proxy ini adalah
// lapisan UX/pertama, bukan satu-satunya garis pertahanan.
export function proxy(request: NextRequest) {
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
  const { pathname } = request.nextUrl;

  const isLoginPage = pathname.startsWith("/login");

  if (!hasSessionCookie && !isLoginPage) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSessionCookie && isLoginPage) {
    // sudah ada cookie, gak perlu lihat halaman login lagi —
    // verifikasi sungguhan tetap terjadi di /dashboard server component,
    // kalau cookie ternyata invalid, dia akan redirect balik ke /login.
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Jangan jalankan proxy di static assets / API routes —
  // mengurangi latency dan cakupan terbatas pada halaman yang relevan.
  matcher: ["/", "/login", "/dashboard/:path*"],
};
