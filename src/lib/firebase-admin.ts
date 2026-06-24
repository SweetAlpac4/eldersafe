import "server-only";
import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

// File ini HANYA boleh diimpor dari kode server (Server Component,
// Route Handler, Middleware-adjacent server util). Paket "server-only"
// akan membuat build GAGAL kalau file ini ter-bundle ke client,
// supaya FIREBASE_ADMIN_PRIVATE_KEY tidak pernah bocor ke browser.

function getAdminApp(): App {
  if (getApps().length) return getApp();

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    throw new Error(
      "Kredensial Firebase Admin belum lengkap. Cek FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY di environment variables."
    );
  }

  // .env menyimpan \n sebagai teks literal dua-karakter, perlu di-convert
  // jadi newline asli supaya valid sebagai PEM private key.
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
