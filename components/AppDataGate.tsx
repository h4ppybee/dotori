"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchAppData } from "@/lib/query/prefetch";

/** 미리 읽기가 늦어져도 화면을 이 시간 이상 붙잡지 않는다. */
const MAX_WAIT_MS = 600;

// 한 번 미리 읽었으면 다시 잠갔다 열어도 캐시가 남아 있으므로 기다리지 않는다.
let prefetchedOnce = false;

/** 테스트 전용 — 모듈 상태를 처음으로 되돌린다. */
export function resetAppDataGateForTest(): void {
  prefetchedOnce = false;
}

/**
 * 잠금 해제 직후, 모든 탭이 첫 렌더에 쓰는 데이터를 미리 읽은 뒤에 화면을 그린다.
 * 탭을 처음 열 때 빈 상태(0원·"아직 항목이 없어요")가 한 번 그려졌다가 내용으로 바뀌며
 * 깜박이던 문제를 막는다. 로컬 IndexedDB 조회라 보통 수십 ms 안에 끝나고, 늦어지면 MAX_WAIT_MS 뒤 그냥 연다.
 * (lib/query/prefetch.ts)
 */
export function AppDataGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(prefetchedOnce);

  useEffect(() => {
    if (ready) {
      return;
    }
    let cancelled = false;
    const open = () => {
      if (!cancelled) {
        setReady(true);
      }
    };
    const timer = window.setTimeout(open, MAX_WAIT_MS);
    void prefetchAppData(queryClient).finally(() => {
      prefetchedOnce = true;
      open();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [queryClient, ready]);

  if (!ready) {
    return null;
  }
  return <>{children}</>;
}
