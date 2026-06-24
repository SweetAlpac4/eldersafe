import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";
import DashboardClient from "./dashboard-client";

// Server Component ini SENGAJA memverifikasi ulang session cookie
// secara kriptografis (bukan cuma "apakah cookie ada" seperti di
// middleware). Ini layer ke-2 dari defense-in-depth: kalau middleware
// ter-bypass dengan cara apapun, halaman ini tetap menolak akses
// untuk session yang tidak valid / sudah di-revoke.
export default async function DashboardPage() {
  const session = await getVerifiedSession();

  if (!session) {
    redirect("/login");
  }

  return <DashboardClient userEmail={session.email ?? ""} />;
}
