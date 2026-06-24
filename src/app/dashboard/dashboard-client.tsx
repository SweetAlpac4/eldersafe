"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ref, onValue, type Database } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseDatabase, getFirebaseAuth } from "@/lib/firebase-client";

const FB_PATH_STATE = "monitorLansia/state";
const MAX_POINTS = 30;
const STALE_AFTER_MS = 10_000;

type SensorState = {
  activity?: string;
  fallAlert?: boolean;
  fallRemainingMs?: number;
  fingerStatus?: string;
  bpm?: number;
  spo2?: number;
  avgBpm30s?: number;
  avgSpo230s?: number;
  uptimeMs?: number;
};

const ACTIVITY_LABELS: Record<string, string> = {
  DIAM: "Diam / berdiri",
  JALAN: "Berjalan",
  LARI: "Berlari",
};

const FINGER_LABELS: Record<string, { dotClass: string; text: string }> = {
  ok: { dotClass: "bg-[#0F9B8E]", text: "Sensor jari terpasang, sedang membaca data" },
  warming_up: { dotClass: "bg-[#C9870A]", text: "Sensor menyesuaikan, mohon tunggu" },
  hold: { dotClass: "bg-[#C9870A]", text: "Jari baru dilepas, menampilkan data terakhir" },
  no_finger: { dotClass: "bg-[#8A9A9D]", text: "Jari belum terpasang di sensor" },
};

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `Aktif ${h}j ${m}m ${s}d`;
}

// Pure function, tidak menyentuh state/props komponen -> ditaruh di luar
// komponen supaya tidak perlu dideklarasikan ulang tiap render dan
// urutan deklarasi tidak membingungkan dependency tracking React Compiler.
function drawSeries(
  ctx: CanvasRenderingContext2D,
  series: (number | null)[],
  w: number,
  h: number,
  min: number,
  max: number,
  color: string
) {
  const points = series.filter((v) => v !== null);
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  let started = false;
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v === null) continue;
    const x = (i / (MAX_POINTS - 1)) * w;
    const norm = Math.min(1, Math.max(0, (v - min) / (max - min)));
    const y = h - norm * (h - 6) - 3;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

export default function DashboardClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();

  const [state, setState] = useState<SensorState | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const lastMessageAtRef = useRef<number>(0);
  // true selama caretaker sudah menekan "Sudah saya periksa" UNTUK
  // episode alert yang sedang aktif saat ini. Direset otomatis begitu
  // fallAlert kembali false (episode berakhir), lewat effect di bawah.
  const [isCurrentAlertDismissed, setIsCurrentAlertDismissed] = useState(false);

  const bpmSeriesRef = useRef<(number | null)[]>([]);
  const spo2SeriesRef = useRef<(number | null)[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [countdown, setCountdown] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    drawSeries(ctx, bpmSeriesRef.current, rect.width, rect.height, 40, 180, "#0F9B8E");
    drawSeries(ctx, spo2SeriesRef.current, rect.width, rect.height, 70, 100, "#C9870A");
  }, []);

  function playAlertBeep() {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = audioCtxRef.current || new AudioCtx();
      const ctx = audioCtxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 880;
      g.gain.value = 0.001;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime;
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t);
      o.stop(t + 0.4);
    } catch {
      // autoplay diblokir sebelum interaksi pertama, abaikan
    }
  }

  // --- Firebase real-time listener ---
  useEffect(() => {
    let db: Database;
    let auth;
    try {
      db = getFirebaseDatabase();
      auth = getFirebaseAuth();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menginisialisasi Firebase.";
      queueMicrotask(() => setDbError(message));
      return;
    }

    let unsubscribeDb: (() => void) | null = null;

    // Login di halaman /login membuat SESSION COOKIE (lewat Admin SDK di
    // server) untuk proteksi route Next.js — tapi itu TIDAK otomatis membuat
    // Firebase Auth client SDK di browser ini "signed in". Realtime Database
    // client (dipakai onValue di bawah) butuh auth client SENDIRI yang sudah
    // siap, supaya request-nya membawa token dan lolos rule "auth != null".
    // onAuthStateChanged menunggu sampai Firebase selesai me-restore sesi
    // client (dari IndexedDB) sebelum kita pasang listener database.
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Auth client benar-benar tidak punya sesi — biasanya karena tab ini
        // belum pernah memanggil signInWithEmailAndPassword (mis. dibuka
        // langsung ke /dashboard tanpa lewat /login di tab/browser ini).
        setDbError("Sesi Firebase belum siap. Coba login ulang lewat halaman /login.");
        return;
      }

      const stateRef = ref(db, FB_PATH_STATE);
      unsubscribeDb = onValue(
        stateRef,
        (snapshot) => {
          const data = snapshot.val() as SensorState | null;
          if (!data) return;
          lastMessageAtRef.current = Date.now();
          setIsLive(true);
          setIsStale(false);
          setDbError(null);
          setState(data);

          if (data.bpm && data.bpm > 0) {
            bpmSeriesRef.current.push(data.bpm);
            if (bpmSeriesRef.current.length > MAX_POINTS) bpmSeriesRef.current.shift();
          }
          if (data.spo2 && data.spo2 > 0) {
            spo2SeriesRef.current.push(data.spo2);
            if (spo2SeriesRef.current.length > MAX_POINTS) spo2SeriesRef.current.shift();
          }
          if ((data.bpm && data.bpm > 0) || (data.spo2 && data.spo2 > 0)) {
            drawChart();
          }
        },
        (error) => {
          console.error("Firebase onValue error:", error);
          setIsLive(false);
          setDbError("Gagal membaca data sensor. Periksa koneksi atau aturan akses Firebase.");
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeDb?.();
    };
  }, [drawChart]);

  // --- staleness check ---
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastMessageAtRef.current && Date.now() - lastMessageAtRef.current > STALE_AFTER_MS) {
        setIsStale(true);
        setIsLive(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // --- fall alert countdown ---
  // wasAlertActiveRef melacak transisi true->false TANPA setState (ref biasa,
  // boleh dibaca/ditulis bebas di body effect). setIsCurrentAlertDismissed
  // hanya dipanggil lewat queueMicrotask agar tidak memicu cascading render
  // sinkron dari dalam body effect.
  const wasAlertActiveRef = useRef(false);

  useEffect(() => {
    const isAlertActiveNow = Boolean(state?.fallAlert);
    const justEnded = wasAlertActiveRef.current && !isAlertActiveNow;
    wasAlertActiveRef.current = isAlertActiveNow;

    if (justEnded) {
      queueMicrotask(() => setIsCurrentAlertDismissed(false));
    }

    if (!isAlertActiveNow || isCurrentAlertDismissed) return;

    const initialSeconds = Math.ceil((state?.fallRemainingMs || 0) / 1000);
    queueMicrotask(() => setCountdown(initialSeconds));
    playAlertBeep();

    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.fallAlert]);

  useEffect(() => {
    const handleResize = () => drawChart();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawChart]);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  function handleDismissFall() {
    setIsCurrentAlertDismissed(true);
  }

  const showFallOverlay = Boolean(state?.fallAlert) && !isCurrentAlertDismissed;
  const activityLabel = state?.activity ? ACTIVITY_LABELS[state.activity] || state.activity : "Belum ada data";
  const fingerInfo = FINGER_LABELS[state?.fingerStatus || "no_finger"] || FINGER_LABELS.no_finger;

  return (
    <div className="min-h-screen bg-white text-[#1A2E2B] flex flex-col">
      <header className="flex items-center justify-between px-6 py-5 border-b-2 border-[#D7E4E2] bg-white">
        <div className="flex items-baseline gap-3">
          <span className={`w-3.5 h-3.5 rounded-full -mt-0.5 ${isLive ? "bg-[#0F9B8E] animate-pulse" : "bg-[#D1271E]"}`} />
          <h1 className="font-serif text-2xl font-bold text-[#0E1A1C]">ElderSafe</h1>
        </div>
        <div className="text-right">
          <div className={`text-base font-bold uppercase tracking-wide ${isLive ? "text-[#0F9B8E]" : "text-[#D1271E]"}`}>
            {isLive ? "Terhubung ke ESP32" : dbError ? "Tidak terhubung" : "Menghubungkan ke ESP32"}
          </div>
          <div className="flex items-center gap-3 justify-end mt-1.5">
            <span className="text-sm text-[#5B6F6C] font-medium">{userEmail}</span>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="text-sm font-semibold text-[#0E1A1C] underline hover:text-[#0F9B8E] disabled:opacity-50"
            >
              {isLoggingOut ? "Keluar..." : "Keluar"}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 flex flex-col gap-5 max-w-3xl mx-auto w-full">
        {dbError && (
          <div className="bg-[#FCE4E2] border-2 border-[#D1271E] text-[#8A1810] text-base font-medium rounded-xl px-4 py-3.5">
            {dbError}
          </div>
        )}

        <div className="flex items-center justify-between bg-[#F2F8F7] border-2 border-[#D7E4E2] rounded-2xl px-5 py-4.5">
          <div>
            <div className="text-sm font-bold uppercase tracking-wide text-[#5B6F6C]">
              Aktivitas saat ini
            </div>
            <div className="font-serif text-3xl font-bold mt-1 text-[#0E1A1C]">{activityLabel}</div>
          </div>
          <div
            className={`text-sm font-bold px-4 py-2 rounded-full border-2 ${
              state?.activity
                ? "border-[#0F9B8E] bg-[#0F9B8E]/10 text-[#0E1A1C]"
                : "border-[#D7E4E2] text-[#5B6F6C]"
            }`}
          >
            {state?.activity === "DIAM" ? "Tenang" : state?.activity ? "Bergerak" : "Menunggu data"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <VitalCard
            label="Denyut jantung"
            value={state?.bpm && state.bpm > 0 ? state.bpm : null}
            unit="bpm"
            avgLabel="Rata-rata 30 dtk"
            avgValue={state?.avgBpm30s && state.avgBpm30s > 0 ? `${state.avgBpm30s} bpm` : "--"}
            warn={false}
          />
          <VitalCard
            label="Saturasi oksigen"
            value={state?.spo2 && state.spo2 > 0 ? state.spo2 : null}
            unit="%"
            avgLabel="Rata-rata 30 dtk"
            avgValue={state?.avgSpo230s && state.avgSpo230s > 0 ? `${state.avgSpo230s}%` : "--"}
            warn={Boolean(state?.spo2 && state.spo2 > 0 && state.spo2 < 92)}
          />
        </div>

        <div className="flex items-center gap-3 bg-[#F2F8F7] border-2 border-[#D7E4E2] rounded-xl px-5 py-4 text-base font-medium text-[#3D4F4C]">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${fingerInfo.dotClass}`} />
          <span>{fingerInfo.text}</span>
        </div>

        {isStale && (
          <div className="bg-[#FFF4E0] border-2 border-[#C9870A] text-[#7A5200] text-base rounded-xl px-4 py-3.5 font-medium">
            Data terakhir diterima lebih dari 10 detik yang lalu. Periksa apakah ESP32 masih
            menyala dan terhubung internet.
          </div>
        )}

        <div className="bg-[#F2F8F7] border-2 border-[#D7E4E2] rounded-2xl px-5 pt-5 pb-4">
          <div className="text-sm font-bold uppercase tracking-wide text-[#5B6F6C] mb-3">
            Tren denyut jantung dan SpO2 (30 titik terakhir)
          </div>
          <canvas ref={canvasRef} className="w-full h-16 block" />
        </div>
      </main>

      <footer className="text-center px-6 py-4 text-sm font-medium text-[#5B6F6C] border-t-2 border-[#D7E4E2]">
        ElderSafe, Fall and Vitals Monitor via Firebase.{" "}
        {state?.uptimeMs !== undefined ? formatUptime(state.uptimeMs) : "Belum tersedia"}
      </footer>

      {showFallOverlay && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-8"
          style={{ animation: "alertFlash 1s ease-in-out infinite", background: "#8A1810" }}
        >
          <style>{`
            @keyframes alertFlash { 0%, 100% { background: #8A1810; } 50% { background: #B0241A; } }
            @keyframes sirenShake { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-8deg); } 75% { transform: rotate(8deg); } }
          `}</style>
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-24 h-24 mb-6 text-white"
            style={{ animation: "sirenShake 0.6s ease-in-out infinite" }}
          >
            <path d="M12 2L1 21h22L12 2zm0 4.5L19.5 19h-15L12 6.5zM11 10v5h2v-5h-2zm0 6.5v2h2v-2h-2z" />
          </svg>
          <h2 className="font-serif text-5xl font-bold text-white mb-3">JATUH TERDETEKSI</h2>
          <p className="text-xl text-white max-w-sm mb-8 font-medium">
            Sensor mendeteksi kemungkinan jatuh. Segera periksa kondisi lansia.
          </p>
          <div className="text-base font-semibold text-white/90">
            Mereset otomatis dalam {countdown} detik
          </div>
          <button
            onClick={handleDismissFall}
            className="mt-7 bg-white text-[#8A1810] font-bold text-lg px-8 py-4 rounded-full active:bg-white/90"
          >
            Sudah saya periksa
          </button>
        </div>
      )}
    </div>
  );
}

function VitalCard({
  label,
  value,
  unit,
  avgLabel,
  avgValue,
  warn,
}: {
  label: string;
  value: number | null;
  unit: string;
  avgLabel: string;
  avgValue: string;
  warn: boolean;
}) {
  return (
    <div className="bg-[#F2F8F7] border-2 border-[#D7E4E2] rounded-2xl p-6">
      <div className="text-sm font-bold uppercase tracking-wide text-[#5B6F6C] mb-4">{label}</div>
      <div className="flex items-baseline gap-2">
        <span
          className={`font-serif font-bold text-[64px] leading-none ${
            value === null ? "text-[#8A9A9D]" : warn ? "text-[#C9870A]" : "text-[#0F9B8E]"
          }`}
        >
          {value === null ? "--" : value}
        </span>
        {value !== null && <span className="text-lg text-[#5B6F6C] font-semibold">{unit}</span>}
      </div>
      <div className="flex justify-between items-baseline mt-4 pt-4 border-t-2 border-[#D7E4E2] text-base text-[#5B6F6C] font-medium">
        <span>{avgLabel}</span>
        <strong className="text-[#0E1A1C] font-bold text-lg">{avgValue}</strong>
      </div>
    </div>
  );
}
