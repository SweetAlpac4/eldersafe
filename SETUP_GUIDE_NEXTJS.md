# Panduan Setup — Monitor Lansia (Next.js + Login Aman + Deploy Vercel)

## Apa yang berubah dari versi sebelumnya

| | Versi HTML statis (sebelumnya) | Versi Next.js (ini) |
|---|---|---|
| Login | Form isi API key manual tiap buka | Email + password, session tersimpan |
| Siapa yang bisa akses | Siapa pun yang tahu URL & isi form benar | Hanya email yang **kamu daftarkan manual** di Firebase Auth |
| Kredensial Firebase | Diketik ulang tiap sesi browser | Disimpan aman di Environment Variables Vercel |
| Hosting | Buka file lokal / ESP32 LittleFS | Vercel (URL publik, HTTPS otomatis) |
| Proteksi halaman | Tidak ada | Proxy (edge) + verifikasi ulang di server tiap render |

Arsitektur:
```
Caretaker buka URL Vercel
   → /login (isi email + password yang SUDAH didaftarkan manual)
   → Firebase Auth verifikasi → dapat ID token
   → dikirim ke /api/login → server tukar jadi session cookie httpOnly
   → /dashboard → server verifikasi ulang cookie → render data real-time
       dari Firebase Realtime Database (sumber data sama dengan ESP32)
```

ESP32 tidak berubah sama sekali — tetap pakai `fall_detection_firebase.ino` yang sudah ada, push ke Realtime Database dengan akun yang sama.

---

## Bagian A — Firebase Console

### A1. Perketat Security Rules database

Kredensial yang valid (email+password) sekarang jadi satu-satunya pintu masuk, jadi kita
tutup akses publik yang dulu dibuka untuk "test mode".

1. Firebase Console → project kamu → **Realtime Database** (panel kiri) → tab **Rules**.
2. Ganti isinya jadi:
   ```json
   {
     "rules": {
       "monitorLansia": {
         "state": {
           ".read": "auth != null",
           ".write": "auth != null"
         }
       },
       "$other": {
         ".read": false,
         ".write": false
       }
     }
   }
   ```
   (Sudah tersedia juga di file `database.rules.json` pada project ini — bisa copy-paste isinya.)
3. Klik **Publish**. Tunggu beberapa menit untuk propagasi penuh.

> **Alternatif via CLI**: kalau sudah install `firebase-tools` dan login (`firebase login`),
> bisa juga jalankan `firebase deploy --only database --project <project-id-kamu>` dari
> folder ini — `firebase.json` sudah dikonfigurasi untuk membaca `database.rules.json`.
> Cara mana pun hasilnya sama; pilih yang paling nyaman.

Ini membatasi akses HANYA ke path `monitorLansia/state`, dan HANYA untuk request yang sudah
membawa token autentikasi Firebase yang valid (baik dari ESP32 maupun dari Next.js app).

### A2. Daftarkan email caretaker (kalau belum / mau tambah baru)

1. Firebase Console → **Authentication** → tab **Users**.
2. Klik **Add user**, isi email + password caretaker.
3. Ulangi untuk setiap caretaker yang boleh akses. Tidak ada batas jumlah user.
4. **Tidak perlu** ada tombol "Daftar sendiri" di mana pun — pendaftaran user baru hanya
   bisa dilakukan dari Console ini oleh kamu (pengelola sistem), bukan dari halaman login.

### A3. Generate Service Account Key (untuk Firebase Admin SDK)

Ini kredensial BARU yang belum pernah dipakai di versi sebelumnya — dipakai server Next.js
(bukan browser) untuk memverifikasi token secara aman.

1. Firebase Console → ikon gerigi ⚙️ → **Project settings** → tab **Service accounts**.
2. Klik **Generate new private key** → konfirmasi → sebuah file `.json` akan terdownload.
3. **JAGA file ini baik-baik** — siapa pun yang punya file ini bisa mengelola seluruh
   project Firebase kamu. Jangan upload ke Google Drive publik, jangan commit ke GitHub.
4. Buka file JSON itu, kamu akan butuh 3 nilai dari dalamnya:
   - `project_id`
   - `client_email`
   - `private_key` (teks panjang yang dimulai `-----BEGIN PRIVATE KEY-----`)

---

## Bagian B — Isi Environment Variables

Project ini butuh 8 environment variables. Buat file `.env.local` (untuk testing lokal)
dengan menyalin `.env.local.example` lalu isi:

```bash
cp .env.local.example .env.local
```

| Variable | Dari mana | Tipe |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Project Settings → General → Web API Key | publik |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Biasanya `<project-id>.firebaseapp.com` | publik |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Project Settings → General → Project ID | publik |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Realtime Database → URL di bagian atas | publik |
| `FIREBASE_ADMIN_PROJECT_ID` | File service account JSON → `project_id` | **rahasia** |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | File service account JSON → `client_email` | **rahasia** |
| `FIREBASE_ADMIN_PRIVATE_KEY` | File service account JSON → `private_key` | **rahasia** |
| `SESSION_COOKIE_NAME` | Bebas, boleh dibiarkan default | — |

> Untuk `FIREBASE_ADMIN_PRIVATE_KEY`: paste isinya APA ADANYA dari file JSON (termasuk
> karakter `\n` literal di dalamnya), dibungkus tanda kutip ganda. Jangan ganti `\n` jadi
> newline asli secara manual — kode kita (`src/lib/firebase-admin.ts`) sudah otomatis
> mengonversinya.

Variable yang diawali `NEXT_PUBLIC_` memang akan terlihat di browser (itu sudah didesain
publik oleh Firebase). Yang TIDAK diawali `NEXT_PUBLIC_` (3 variable Admin) tidak pernah
dikirim ke browser — paket `server-only` di kode kita akan menggagalkan build kalau
sampai ada yang salah pakai variable ini di Client Component.

### Test lokal dulu sebelum deploy (disarankan)

```bash
npm install
npm run dev
```
Buka `http://localhost:3000` → harus redirect ke `/login`. Login dengan email yang sudah
didaftarkan di Langkah A2 → harus masuk ke `/dashboard` dan melihat data real-time dari
ESP32 (asalkan firmware ESP32 sudah jalan dan push ke Firebase yang sama).

---

## Bagian C — Push ke GitHub

Vercel deploy dengan cara connect ke repository GitHub.

```bash
cd monitor-lansia-web
git init
git add .
git commit -m "Initial commit: Monitor Lansia dashboard"
```

Buat repository baru di GitHub (lewat web github.com → New repository), lalu:
```bash
git remote add origin https://github.com/<username-kamu>/monitor-lansia-web.git
git branch -M main
git push -u origin main
```

`.env.local` **tidak** akan ikut ter-push (sudah masuk `.gitignore` secara default) —
ini benar dan diharapkan, karena kredensial harus diisi langsung di Vercel, bukan di git.

---

## Bagian D — Deploy ke Vercel

1. Buka **https://vercel.com**, login/daftar (bisa pakai akun GitHub yang sama).
2. Klik **Add New → Project**.
3. Pilih repository `monitor-lansia-web` yang baru di-push.
4. Vercel otomatis mendeteksi ini project Next.js — biarkan setting default (Framework
   Preset: Next.js, Build Command & Output Directory otomatis).
5. **Sebelum klik Deploy**, buka bagian **Environment Variables**, masukkan ke-8 variable
   dari Bagian B satu per satu (Name + Value), termasuk yang rahasia. Vercel menyimpan
   ini terenkripsi dan tidak akan tampil di source code atau log build.
6. Klik **Deploy**. Tunggu 1-2 menit.
7. Setelah selesai, Vercel kasih URL publik seperti `https://monitor-lansia-web.vercel.app`.

### Setelah deploy

- Buka URL Vercel → harus redirect ke `/login`.
- Login dengan email caretaker yang sudah didaftarkan (Bagian A2).
- Kalau berhasil masuk dan data real-time muncul — selesai, siap dipakai/dipresentasikan.

### Mengubah environment variable di kemudian hari

Vercel Project → tab **Settings → Environment Variables**. Setiap perubahan butuh
**Redeploy** (Vercel akan menawarkan ini otomatis, atau lewat tab Deployments → "..." →
Redeploy) agar perubahan terbaca oleh aplikasi yang sudah live.

---

## Lapisan keamanan yang sudah diterapkan (defense-in-depth)

Ini bukan satu mekanisme tunggal — ada beberapa lapis independen:

1. **Pendaftaran user tertutup** — tidak ada tombol "Sign up" di mana pun di aplikasi.
   Satu-satunya cara user baru bisa login adalah kamu menambahkannya manual di Firebase
   Console (Bagian A2).
2. **Proxy/Middleware (edge)** — `src/proxy.ts` mengecek cepat keberadaan session cookie
   dan redirect ke `/login` kalau tidak ada. Ini lapisan pertama yang ringan, jalan di
   edge sebelum request mencapai server penuh.
3. **Verifikasi server-side (Server Component)** — `src/app/dashboard/page.tsx` memanggil
   `getVerifiedSession()` yang **memverifikasi ulang secara kriptografis** lewat Firebase
   Admin SDK, termasuk mengecek apakah token sudah di-revoke. Ini lapisan independen dari
   proxy — kalau proxy ter-bypass dengan cara apa pun, lapisan ini tetap menolak akses
   untuk session yang tidak valid.
4. **Session cookie httpOnly + Secure + SameSite=Lax** — token tidak bisa dibaca lewat
   JavaScript di browser (mitigasi XSS), hanya dikirim lewat HTTPS, dan punya proteksi
   dasar terhadap CSRF.
5. **Firebase Security Rules** — bahkan kalau seseorang berhasil mendapatkan
   `databaseURL` dan `apiKey` (yang memang publik), Firebase sendiri menolak semua
   baca/tulis yang tidak membawa token autentikasi valid (Bagian A1).
6. **Kredensial Admin SDK tidak pernah ke client** — paket `server-only` membuat build
   gagal kalau `FIREBASE_ADMIN_PRIVATE_KEY` atau sejenisnya sampai diimpor dari kode yang
   ter-bundle ke browser.

## Yang sudah saya verifikasi

- `npx tsc --noEmit` — bersih, tidak ada type error.
- `npx eslint src/` — bersih, tidak ada error/warning.
- `npx next build` — build production lengkap berhasil, semua route ter-generate dengan
  benar (`/`, `/login`, `/dashboard`, `/api/login`, `/api/logout`, plus Proxy aktif).
- `npx vitest run` — 9 test komponen dashboard lulus semua, mencakup: render data normal,
  overlay alert jatuh muncul/hilang dengan benar, countdown berjalan, tombol dismiss,
  **episode alert baru tetap memicu overlay lagi setelah episode sebelumnya selesai**
  (ini skenario yang berisiko tinggi kalau salah), warna warning SpO2 rendah, banner
  staleness, dan error handling Firebase.
- Logic `session.ts` (create/verify/clear session cookie) ditest dengan mock Firebase
  Admin SDK yang realistis — 10 skenario lulus, termasuk token tidak valid ditolak, cookie
  corrupt tidak crash, dan **session milik user yang sudah di-revoke ditolak**.
- Logic redirect `proxy.ts` ditest terisolasi untuk 6 kombinasi state — semua benar.

## Yang masih perlu kamu lakukan sendiri

- Jalankan Bagian A (Firebase Console) — saya tidak punya akses ke akun Google kamu.
- Generate Service Account Key sendiri (file ini sensitif, sengaja tidak saya buatkan
  contoh isinya selain dummy untuk testing).
- Push ke GitHub dan connect ke Vercel (Bagian C & D) — butuh akun kamu.
- Saya **tidak bisa** menjalankan Firebase emulator sungguhan di sandbox ini (network
  sandbox saya tidak punya akses ke `storage.googleapis.com` tempat emulator di-download),
  jadi alur login → session → dashboard belum saya test dengan Firebase Auth yang
  sungguhan — hanya dengan mock yang meniru perilakunya. Setelah deploy, coba alur
  lengkap (login dengan email salah → harus ditolak; email benar → harus masuk) dan
  beri tahu saya kalau ada perilaku yang tidak sesuai.
