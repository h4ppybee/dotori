import { getFx, putFx } from "@/lib/db/local-store";

/**
 * 공개 환율 API 폴백. 토스 연동이 없거나 토스 환율이 실패한 날에도
 * USDKRW를 확보한다(백업 불러오기 직후 등). 시크릿이 없어 프록시 없이 직접 호출한다.
 * 일 1회 갱신 데이터지만 자산 평가 용도로는 충분하다. (docs/external-api.md)
 */
const PUBLIC_FX_URL = "https://open.er-api.com/v6/latest/USD";

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 공개 API에서 USDKRW 환율을 가져온다. 응답이 양의 유한수가 아니면 예외. */
export async function fetchPublicUsdKrw(): Promise<number> {
  const res = await fetch(PUBLIC_FX_URL);
  if (!res.ok) {
    throw new Error(`환율 조회 실패: ${res.status}`);
  }
  const data = (await res.json()) as { rates?: { KRW?: unknown } };
  const rate = data.rates?.KRW;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("환율 응답이 올바르지 않아요");
  }
  return rate;
}

/**
 * 오늘자(UTC, refresh.ts의 dayOf와 동일 기준) USDKRW가 없으면 공개 API로 채운다.
 * 토스 환율이 그날 성공했으면 asOf가 오늘이라 스킵된다(토스 값 우선).
 * 실패는 조용히 삼키고 기존 환율을 유지한다(기존 토스 환율 스텝과 동일 정책).
 * @returns 폴백으로 새 환율을 저장했으면 true.
 */
export async function ensureFxFallback(now: number = Date.now()): Promise<boolean> {
  const fx = await getFx();
  if (fx != null && dayOf(fx.asOf) === dayOf(now)) {
    return false;
  }
  try {
    const rate = await fetchPublicUsdKrw();
    await putFx({ pair: "USDKRW", rate, asOf: now });
    return true;
  } catch {
    return false;
  }
}
