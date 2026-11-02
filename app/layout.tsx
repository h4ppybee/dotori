import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { QueryProvider } from "@/lib/query/client";
import { LockGate } from "@/components/LockGate";
import { AppDataGate } from "@/components/AppDataGate";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SyncConflictDialog } from "@/components/sync/SyncConflictDialog";
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
          {/* 기기 동기화 엔진은 QueryProvider가 등록한다 — 잠금 해제 순간 받기를 시작하고, 적용하면
              모든 쿼리를 무효화해 AppDataGate가 미리 읽은 캐시도 받은 데이터로 바뀐다. */}
          <LockGate>
            <AppDataGate>{children}</AppDataGate>
          </LockGate>
          {/* 기기 동기화 충돌 선택 — 화면과 무관하게 한 번만 마운트한다(잠금 중에는 그리지 않음). */}
          <SyncConflictDialog />
        </QueryProvider>
        <ServiceWorkerRegister />
        <Analytics />
      </body>
    </html>
  );
}
