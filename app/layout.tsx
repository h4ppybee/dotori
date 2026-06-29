import type { Metadata, Viewport } from "next";
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

// iOS Safari/홈 화면 PWA에서 env(safe-area-inset-*)가 실제 값을 갖게 하려면
// viewport-fit=cover가 필요하다. 없으면 하단 탭바가 홈 인디케이터와 겹친다.
export const viewport: Viewport = {
  viewportFit: "cover",
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
