"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const auth = getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await credential.user.getIdToken();

      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Gagal membuat sesi login.");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setErrorMessage(mapAuthError(err));
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-9 justify-center">
          <span className="w-3.5 h-3.5 rounded-full bg-[#0F9B8E]" />
          <h1 className="font-serif text-3xl font-bold text-[#0E1A1C] tracking-tight">ElderSafe</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#F2F8F7] border-2 border-[#D7E4E2] rounded-2xl p-8"
        >
          <h2 className="text-[#0E1A1C] text-2xl font-bold mb-2">Masuk ke dashboard</h2>
          <p className="text-[#5B6F6C] text-base mb-7 leading-relaxed font-medium">
            Khusus caretaker yang sudah didaftarkan. Hubungi pengelola sistem kalau belum
            punya akses.
          </p>

          <label htmlFor="email" className="block text-sm font-bold uppercase tracking-wide text-[#5B6F6C] mb-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="caretaker@contoh.com"
            className="w-full bg-white border-2 border-[#D7E4E2] text-[#0E1A1C] rounded-lg px-4 py-3.5 text-lg mb-5 focus:outline-none focus:ring-2 focus:ring-[#0F9B8E] focus:border-[#0F9B8E]"
          />

          <label htmlFor="password" className="block text-sm font-bold uppercase tracking-wide text-[#5B6F6C] mb-2">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan password"
            className="w-full bg-white border-2 border-[#D7E4E2] text-[#0E1A1C] rounded-lg px-4 py-3.5 text-lg mb-3 focus:outline-none focus:ring-2 focus:ring-[#0F9B8E] focus:border-[#0F9B8E]"
          />

          {errorMessage && (
            <p className="text-[#D1271E] text-base font-semibold mt-3" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-7 bg-[#0F9B8E] text-white font-bold text-lg rounded-full py-4 disabled:opacity-60 disabled:cursor-not-allowed active:opacity-85 transition-opacity"
          >
            {isSubmitting ? "Memeriksa..." : "Masuk"}
          </button>
        </form>

        <p className="text-center text-[#5B6F6C] text-sm mt-7 font-medium">
          ElderSafe, Fall and Vitals Monitor
        </p>
      </div>
    </main>
  );
}

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code;

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email atau password salah.";
    case "auth/too-many-requests":
      return "Terlalu banyak percobaan gagal. Coba lagi beberapa menit lagi.";
    case "auth/invalid-email":
      return "Format email tidak valid.";
    case "auth/network-request-failed":
      return "Gagal terhubung ke server. Cek koneksi internet kamu.";
    default:
      return err instanceof Error ? err.message : "Login gagal. Coba lagi.";
  }
}
