import type { Metadata } from "next";
import { QueryProvider } from "@/lib/query/client";
import { LockGate } from "@/components/LockGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "dotori",
  description: "토스 스타일 로컬-퍼스트 주식 포트폴리오 앱",
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
      </body>
    </html>
  );
}
