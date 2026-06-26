"use client";

import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { AUTO_LOCK_MS, touchSession } from "@/lib/db/session-vault";

/** 만료 도달 여부를 확인하는 주기. */
const CHECK_INTERVAL_MS = 15 * 1000;
/** IndexedDB 만료시각 갱신 throttle — 활동마다 쓰지 않고 이 간격으로만 영속화한다. */
const PERSIST_THROTTLE_MS = 30 * 1000;

/**
 * 잠금 해제 상태에서 사용자 활동에 따라 자동 잠금 만료시각을 슬라이딩으로 연장하고,
 * 마지막 활동 후 AUTO_LOCK_MS가 지나면 잠근다.
 *
 * 만료시각의 진실원천은 메모리(클로저)이고, IndexedDB에는 새로고침 복원을 위해
 * throttle된 간격으로만 동기화한다. (lib/db/session-vault.ts)
 */
export function useSessionGuard(): void {
  const locked = useAppStore((s) => s.locked);
  const lock = useAppStore((s) => s.lock);

  useEffect(() => {
    if (locked) {
      return;
    }

    let expiresAt = Date.now() + AUTO_LOCK_MS;
    let lastPersist = Date.now();

    const bump = () => {
      const now = Date.now();
      expiresAt = now + AUTO_LOCK_MS;
      if (now - lastPersist >= PERSIST_THROTTLE_MS) {
        lastPersist = now;
        void touchSession(expiresAt);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        bump();
      }
    };

    window.addEventListener("click", bump);
    window.addEventListener("keydown", bump);
    document.addEventListener("visibilitychange", onVisibility);

    const timer = window.setInterval(() => {
      if (Date.now() >= expiresAt) {
        lock();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener("click", bump);
      window.removeEventListener("keydown", bump);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [locked, lock]);
}
