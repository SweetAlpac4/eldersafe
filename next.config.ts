import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "firebase-admin",
    "jose",
    "jwks-rsa",
    "google-auth-library",
    "googleapis-common",
  ],
};

export default nextConfig;
