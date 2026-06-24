import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  let idToken: string | undefined;

  try {
    const body = await request.json();
    idToken = body?.idToken;
  } catch {
    return NextResponse.json({ error: "Body request tidak valid." }, { status: 400 });
  }

  if (!idToken || typeof idToken !== "string") {
    return NextResponse.json({ error: "idToken wajib diisi." }, { status: 400 });
  }

  try {
    await createSessionCookie(idToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Jangan bocorkan detail error Firebase Admin ke client —
    // cukup beri tahu bahwa autentikasi gagal.
    console.error("[api/login] gagal membuat session cookie:", err);
    return NextResponse.json(
      { error: "Sesi login tidak valid atau sudah kedaluwarsa. Coba login ulang." },
      { status: 401 }
    );
  }
}
