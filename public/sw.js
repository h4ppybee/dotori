// Dotori PWA 서비스 워커
// 네비게이션 요청: 네트워크 우선(network-first), 실패 시 캐시 폴백
// /api/* 요청: 절대 캐시하지 않음 (toss 프록시 no-store 계약)
// 정적 자산: stale-while-revalidate

const CACHE = "dotori-v1";

// ──────────────────────────────────────────────
// install: skipWaiting으로 즉시 활성화
// ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        // 앱 셸(/)을 미리 캐시해두어 오프라인 폴백으로 사용
        await cache.add("/");
      } catch (err) {
        // 프리캐시 실패가 install 자체를 막지 않도록 삼킴
        console.warn("[SW] 프리캐시 실패 (무시):", err);
      }
    })()
  );
});

// ──────────────────────────────────────────────
// activate: 이전 캐시 정리 + 즉시 제어권 획득
// ──────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 현재 버전 외의 캐시 삭제
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      );
      // 이미 열려 있는 탭도 즉시 제어
      await self.clients.claim();
    })()
  );
});

// ──────────────────────────────────────────────
// fetch: 요청 유형별 전략
// ──────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET 외 메서드(POST, PUT 등)는 서비스 워커가 개입하지 않음
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // /api/* 는 절대 캐시하지 않음 — 항상 네트워크로 통과
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 동일 오리진만 캐시 전략 적용
  if (url.origin !== self.location.origin) {
    return;
  }

  // 네비게이션 요청(페이지 로드): 네트워크 우선, 폴백 캐시
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  // 정적 자산: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ──────────────────────────────────────────────
// 전략: 네트워크 우선 (네비게이션)
// ──────────────────────────────────────────────
async function networkFirstNavigate(request) {
  try {
    const networkResponse = await fetch(request);
    // 성공 응답은 캐시에 저장
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_err) {
    // 오프라인 — 캐시된 "/" 폴백
    const cached = await caches.match("/");
    if (cached) {
      return cached;
    }
    // 캐시도 없으면 오프라인 응답
    return new Response("오프라인 상태입니다.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

// ──────────────────────────────────────────────
// 전략: Stale-While-Revalidate (정적 자산)
// ──────────────────────────────────────────────
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  // 백그라운드에서 네트워크 갱신
  const fetchAndUpdate = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => {
      // 정적 자산 갱신 실패는 조용히 무시
    });

  // 캐시가 있으면 즉시 반환, 없으면 네트워크 대기
  return cached ?? fetchAndUpdate;
}
