import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin (lewat jwks-rsa -> jose) memiliki dependency chain yang
  // mencampur ESM dan CommonJS, yang menyebabkan error ERR_REQUIRE_ESM kalau
  // di-bundle oleh Turbopack untuk Server Components/Route Handlers di Vercel.
  // Opsi ini memaksa Next.js memakai require() Node.js native untuk
  // package-package ini, bukan mencoba membundlenya.
  serverExternalPackages: ["firebase-admin", "jose", "jwks-rsa"],
};

export default nextConfig;
