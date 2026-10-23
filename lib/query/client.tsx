"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { startDeviceSync } from "@/lib/device-sync/engine";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

// 싱글턴: 브라우저에서는 모듈 단위로 공유, SSR에서는 매 요청마다 새로 생성.
let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (browserQueryClient == null) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // useState를 쓰면 Suspense 경계에서 새 쿼리 클라이언트를 만들지 않아도 된다.
  const [client] = useState(() => getQueryClient());
  // 기기 동기화 엔진 등록(정리 함수 반환 → StrictMode 이중 실행에도 구독이 하나만 남는다).
  // 잠금 해제 순간 받기를 시작하고, 적용 후 이 클라이언트의 쿼리를 무효화한다(lib/device-sync/engine).
  useEffect(() => startDeviceSync(client), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
