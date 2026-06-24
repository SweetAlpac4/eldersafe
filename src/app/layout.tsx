import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Spectral } from "next/font/google";
import ServiceWorkerRegister from "./service-worker-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "ElderSafe",
  description: "Dashboard caretaker untuk monitor deteksi jatuh dan vitals lansia secara real-time.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ElderSafe",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F9B8E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} ${spectral.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
