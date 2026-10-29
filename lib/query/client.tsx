"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // 로컬 IndexedDB 데이터라 작고, 버리면 그 탭을 다시 열 때 빈 상태가 한 번 그려지며 깜박인다.
        // 잠금 해제 직후 미리 읽은 캐시(lib/query/prefetch)를 끝까지 유지한다. 갱신은 staleTime·무효화로 한다.
        gcTime: Infinity,
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
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
