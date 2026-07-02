/**
 * 순자산 추이 콤보 차트용 순수 헬퍼. DB·Date 없음.
 * 입력은 createdAt 내림차순(최신 우선) 목록 — listAssetSnapshots 반환 순서 그대로.
 */

export interface TrendSource {
  id: string;
  createdAt: number;
  netWorthKrw: number;
}

export interface TrendDatum extends TrendSource {
  /** 직전 스냅샷 대비 변화량. 직전이 없으면(전체 첫 기록) null. */
  deltaKrw: number | null;
}

/**
 * 최신 display개를 시간순(과거→최신)으로 반환한다.
 * 입력에 display+1개째(표시 구간 직전 값)가 있으면 가장 오래된 표시 항목의 변화량도 계산한다.
 */
export function buildTrendData(snapshotsDesc: TrendSource[], display = 20): TrendDatum[] {
  const asc = snapshotsDesc.slice(0, display + 1).reverse();
  const start = Math.max(0, asc.length - display);
  const out: TrendDatum[] = [];
  for (let i = start; i < asc.length; i += 1) {
    const prev = i > 0 ? asc[i - 1] : undefined;
    out.push({
      ...asc[i],
      deltaKrw: prev == null ? null : asc[i].netWorthKrw - prev.netWorthKrw,
    });
  }
  return out;
}
