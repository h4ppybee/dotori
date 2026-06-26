"use client";

import { useEffect } from "react";

/**
 * 프로덕션 전용 서비스 워커 등록 컴포넌트.
 * 개발 환경에서는 HMR 간섭을 방지하기 위해 등록하지 않는다.
 * 등록 실패는 앱을 중단시키지 않도록 조용히 처리한다.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    const registerSW = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.info("[SW] 등록 성공:", registration.scope);
        })
        .catch((err) => {
          console.warn("[SW] 등록 실패 (앱 동작에는 영향 없음):", err);
        });
    };

    // window load 이후 등록해 초기 렌더링 성능에 영향을 최소화
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW, { once: true });
    }
  }, []);

  return null;
}
