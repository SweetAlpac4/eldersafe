import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

// Kredensial ini sengaja NEXT_PUBLIC_* — Firebase Web API Key memang
// didesain untuk terlihat di browser (bukan secret). Keamanan
// sesungguhnya ditegakkan oleh Firebase Security Rules (server-side)
// dan oleh verifikasi session di layer Next.js kita (lihat lib/session.ts).
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDatabase(): Database {
  return getDatabase(getFirebaseApp());
}
