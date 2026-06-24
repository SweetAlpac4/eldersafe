import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import DashboardClient from "@/app/dashboard/dashboard-client";

// --- Mock next/navigation (useRouter) ---
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// --- Mock firebase/database: kita kendalikan kapan callback onValue terpanggil ---
let registeredCallback: ((snapshot: { val: () => unknown }) => void) | null = null;
let registeredErrorCallback: ((error: Error) => void) | null = null;

vi.mock("firebase/database", () => ({
  ref: vi.fn(() => ({})),
  onValue: vi.fn((_ref, cb, errCb) => {
    registeredCallback = cb;
    registeredErrorCallback = errCb;
    return vi.fn(); // unsubscribe
  }),
}));

// --- Mock firebase/auth: simulasikan user SUDAH login (kasus normal) ---
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, cb) => {
    // langsung panggil dgn user palsu, meniru auth client yg sudah restore sesi
    cb({ uid: "test-uid", email: "caretaker@contoh.com" });
    return vi.fn(); // unsubscribe
  }),
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseDatabase: vi.fn(() => ({})),
  getFirebaseAuth: vi.fn(() => ({})),
}));

async function emitState(data: Record<string, unknown>) {
  await act(async () => {
    registeredCallback?.({ val: () => data });
    // flush microtask queue (queueMicrotask di komponen) sebelum assertion
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("DashboardClient", () => {
  beforeEach(() => {
    registeredCallback = null;
    registeredErrorCallback = null;
    vi.useFakeTimers();
    // AudioContext tidak ada di jsdom -> stub agar playAlertBeep tidak melempar exception fatal
    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(() => ({
      createOscillator: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), type: "", frequency: { value: 0 } }),
      createGain: () => ({ connect: vi.fn(), gain: { value: 0, exponentialRampToValueAtTime: vi.fn() } }),
      currentTime: 0,
      destination: {},
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("menampilkan placeholder sebelum data masuk", () => {
    render(<DashboardClient userEmail="caretaker@contoh.com" />);
    expect(screen.getByText("Belum ada data")).toBeInTheDocument();
    expect(screen.getAllByText("Belum ada").length).toBeGreaterThan(0);
  });

  it("merender data normal dengan benar (aktivitas, HR, SpO2)", async () => {
    render(<DashboardClient userEmail="caretaker@contoh.com" />);

    await emitState({
      activity: "JALAN",
      fallAlert: false,
      fallRemainingMs: 0,
      fingerStatus: "ok",
      bpm: 75,
      spo2: 97,
      avgBpm30s: 74,
      avgSpo230s: 97,
      uptimeMs: 12345,
    });

    expect(screen.getByText("Berjalan")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("97")).toBeInTheDocument();
    expect(screen.getByText("Terhubung ke ESP32")).toBeInTheDocument();
    // Fall overlay TIDAK boleh tampil
    expect(screen.queryByText("JATUH TERDETEKSI")).not.toBeInTheDocument();
  });

  it("menampilkan overlay JATUH TERDETEKSI saat fallAlert true", async () => {
    render(<DashboardClient userEmail="caretaker@contoh.com" />);

    await emitState({
      activity: "DIAM",
      fallAlert: true,
      fallRemainingMs: 28000,
      fingerStatus: "no_finger",
      bpm: -1,
      spo2: -1,
      uptimeMs: 1000,
    });

    expect(screen.getByText("JATUH TERDETEKSI")).toBeInTheDocument();
    expect(screen.getByText(/Mereset otomatis dalam 28 detik/)).toBeInTheDocument();
  });

  it("countdown berkurang setiap detik", async () => {
    render(<DashboardClient userEmail="caretaker@contoh.com" />);

    await emitState({ activity: "DIAM", fallAlert: true, fallRemainingMs: 10000, uptimeMs: 1000 });
    expect(screen.getByText(/Mereset otomatis dalam 10 detik/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/Mereset otomatis dalam 9 detik/)).toBeInTheDocument();
  });

  it("klik 'Sudah saya periksa' menyembunyikan overlay walau fallAlert masih true di data", async () => {
    render(<DashboardClient userEmail="caretaker@contoh.com" />);

    await emitState({ activity: "DIAM", fallAlert: true, fallRemainingMs: 28000, uptimeMs: 1000 });
    expect(screen.getByText("JATUH TERDETEKSI")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Sudah saya periksa"));
    expect(screen.queryByText("JATUH TERDETEKSI")).not.toBeInTheDocument();

    // Data baru masuk, fallAlert MASIH true (ESP32 belum reset) -> overlay TETAP tersembunyi
    await emitState({ activity: "DIAM", fallAlert: true, fallRemainingMs: 27000, uptimeMs: 2000 });
    expect(screen.queryByText("JATUH TERDETEKSI")).not.toBeInTheDocument();
  });

  it("overlay muncul lagi untuk episode jatuh BARU setelah episode sebelumnya selesai", async () => {
    render(<DashboardClient userEmail="caretaker@contoh.com" />);

    // episode 1: muncul, lalu di-dismiss
    await emitState({ activity: "DIAM", fallAlert: true, fallRemainingMs: 28000, uptimeMs: 1000 });
    fireEvent.click(screen.getByText("Sudah saya periksa"));
    expect(screen.queryByText("JATUH TERDETEKSI")).not.toBeInTheDocument();

    // ESP32 reset alert (fallAlert jadi false)
    await emitState({ activity: "DIAM", fallAlert: false, fallRemainingMs: 0, uptimeMs: 31000 });
    expect(screen.queryByText("JATUH TERDETEKSI")).not.toBeInTheDocument();

    // episode 2: jatuh BARU terdeteksi -> overlay HARUS muncul lagi (bukan stuck dismissed)
    await emitState({ activity: "DIAM", fallAlert: true, fallRemainingMs: 28000, uptimeMs: 60000 });
    expect(screen.getByText("JATUH TERDETEKSI")).toBeInTheDocument();
  });

  it("menunjukkan warna warning saat SpO2 di bawah 92", async () => {
    render(<DashboardClient userEmail="caretaker@contoh.com" />);
    await emitState({ activity: "DIAM", fallAlert: false, bpm: 80, spo2: 88, uptimeMs: 1000 });

    const spo2El = screen.getByText("88");
    expect(spo2El.className).toContain("C9870A"); // warna amber/warning
  });

  it("menampilkan banner staleness setelah 10 detik tanpa data baru", async () => {
    render(<DashboardClient userEmail="caretaker@contoh.com" />);
    await emitState({ activity: "DIAM", fallAlert: false, bpm: 75, spo2: 97, uptimeMs: 1000 });

    expect(screen.queryByText(/lebih dari 10 detik/)).not.toBeInTheDocument();

    // melewati ambang 10s dengan margin yang jelas (12s), supaya tidak
    // bergantung pada presisi tepat siklus interval 2s staleness-check.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });

    expect(screen.getByText(/lebih dari 10 detik/)).toBeInTheDocument();
  });

  it("menampilkan pesan error saat Firebase onValue mengirim error", async () => {
    render(<DashboardClient userEmail="caretaker@contoh.com" />);

    act(() => {
      registeredErrorCallback?.(new Error("permission-denied"));
    });

    expect(screen.getByText(/Gagal membaca data sensor/)).toBeInTheDocument();
  });
});
