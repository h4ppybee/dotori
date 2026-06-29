import { type ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** 테스트마다 격리된 QueryClient(재시도/캐시 끔). */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
}

/** renderHook/render의 wrapper로 쓸 Provider. */
export function QueryWrapper({ children }: { children: ReactNode }) {
  const client = makeTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** QueryClientProvider로 감싸 렌더한다. */
export function renderWithQuery(ui: ReactNode) {
  return render(<QueryWrapper>{ui}</QueryWrapper>);
}
