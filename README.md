# Monitor Lansia — Dashboard Caretaker

Dashboard real-time untuk caretaker memantau deteksi jatuh dan vitals (HR/SpO2) lansia,
berbasis Next.js + Firebase, di-deploy ke Vercel.

## Quick start (development lokal)

```bash
npm install
cp .env.local.example .env.local   # isi sesuai panduan SETUP_GUIDE_NEXTJS.md
npm run dev
```

Buka http://localhost:3000

## Struktur penting

```
src/
├── proxy.ts                          # Edge: cek cepat session cookie, redirect awal
├── lib/
│   ├── firebase-client.ts            # Firebase SDK untuk browser
│   ├── firebase-admin.ts             # Firebase Admin SDK (server-only, rahasia)
│   └── session.ts                    # Buat/verifikasi/hapus session cookie httpOnly
└── app/
    ├── login/page.tsx                # Form email + password
    ├── api/login, api/logout         # Tukar ID token <-> session cookie
    └── dashboard/
        ├── page.tsx                  # Server Component, verifikasi ulang session
        └── dashboard-client.tsx      # Client Component, listener real-time Firebase
```

## Testing

```bash
npx tsc --noEmit     # type check
npx eslint src/       # lint
npx vitest run        # unit/component test
```

## Dokumentasi lengkap

Lihat `SETUP_GUIDE_NEXTJS.md` untuk:
- Setup Firebase Console (security rules, tambah user caretaker, service account key)
- Cara isi environment variables
- Deploy ke Vercel step-by-step
- Penjelasan lapisan keamanan (defense-in-depth)

Firmware ESP32 terkait ada di luar folder ini (`fall_detection_firebase.ino`) — tidak
berubah dari versi sebelumnya, tetap push data ke Firebase Realtime Database yang sama.
