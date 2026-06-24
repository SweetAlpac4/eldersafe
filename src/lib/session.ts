import "server-only";
import { cookies } from "next/headers";
import { getAdminAuth } from "@/lib/firebase-admin";

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "monitor_lansia_session";

// Umur session cookie. Ini dashboard kesehatan yang dipakai caretaker
// sehari-hari, jadi 7 hari adalah kompromi wajar antara keamanan dan
// supaya caretaker gak harus login ulang tiap hari. Firebase membatasi
// session cookie maksimum 14 hari.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Tukar Firebase ID token (dari client, hasil signInWithEmailAndPassword)
 * jadi session cookie httpOnly, lalu simpan di cookie store response.
 * HARUS dipanggil dari Route Handler (punya akses set cookie).
 */
export async function createSessionCookie(idToken: string): Promise<void> {
  const adminAuth = getAdminAuth();

  // verifyIdToken dulu sebelum createSessionCookie — defense-in-depth,
  // supaya token yang sudah revoked/invalid tidak lolos jadi session.
  await adminAuth.verifyIdToken(idToken);

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true, // tidak bisa diakses lewat JavaScript (mitigasi XSS)
    secure: true, // hanya dikirim lewat HTTPS (Vercel selalu HTTPS)
    sameSite: "lax", // mitigasi CSRF dasar
    maxAge: SESSION_MAX_AGE_MS / 1000,
    path: "/",
  });
}

/**
 * Verifikasi session cookie yang ada di request saat ini.
 * Dipakai di Server Component / Route Handler untuk defense-in-depth
 * (verifikasi ulang walau middleware sudah cek keberadaan cookie).
 * Return null kalau tidak ada / tidak valid / sudah di-revoke.
 */
export async function getVerifiedSession(): Promise<{ uid: string; email: string | undefined } | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const adminAuth = getAdminAuth();
    // checkRevoked: true -> selalu cek apakah token sudah di-revoke
    // (misal admin menghapus user ini dari Firebase Console).
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
