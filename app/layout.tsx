import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { QueryProvider } from "@/lib/query/client";
import { LockGate } from "@/components/LockGate";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "dotori",
  description: "토스 스타일 로컬-퍼스트 주식 포트폴리오 앱",
  appleWebApp: {
    title: "Dotori",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <LockGate>{children}</LockGate>
        </QueryProvider>
        <ServiceWorkerRegister />
        <Analytics />
      </body>
    </html>
  );
}
