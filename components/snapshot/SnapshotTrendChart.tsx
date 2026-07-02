import { buildTrendData, type TrendSource } from "@/lib/snapshot/trend";

interface SnapshotTrendChartProps {
  /** createdAt 내림차순(최신 우선) — listAssetSnapshots 반환 순서 그대로. */
  snapshotsDesc: TrendSource[];
  /** 표시 개수. 기본 20. */
  display?: number;
}

// viewBox 좌표계 (반응형은 svg width=100%로 처리)
const W = 320;
const H = 150;
const PAD_X = 10;
const LINE_TOP = 8;
const LINE_BOTTOM = 96;
const BAR_BASELINE = 127; // 하단 밴드(104~150) 중앙
const BAR_HALF = 23; // 기준선에서 위/아래 최대 높이
const BAR_WIDTH_RATIO = 0.5; // 슬롯 폭 대비 막대 폭

// DESIGN.md 토큰: primary(브랜드) / up(수익·증가=빨강) / down(손실·감소=파랑)
const LINE_COLOR = "#A87342";
const UP_COLOR = "#F04452";
const DOWN_COLOR = "#3182F6";
const BASELINE_COLOR = "#F1ECE4"; // hairline

/**
 * 순자산 추이 콤보 차트. 상단 밴드=순자산 선(포인트 마커), 하단 밴드=직전 대비 변화량 막대.
 * 두 밴드는 겹치지 않고 x 좌표만 공유한다. 축 라벨 없는 상대 스케일(스펙 §7).
 */
export function SnapshotTrendChart({ snapshotsDesc, display = 20 }: SnapshotTrendChartProps) {
  const data = buildTrendData(snapshotsDesc, display);
  if (data.length < 2) {
    return null;
  }

  const xAt = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / (data.length - 1);
  const slotWidth = (W - PAD_X * 2) / (data.length - 1);
  const barWidth = Math.min(12, slotWidth * BAR_WIDTH_RATIO);

  // 선: min~max 상대 스케일. 전 구간 동일 값이면 밴드 세로 중앙 수평선.
  const values = data.map((d) => d.netWorthKrw);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yAt = (v: number) => {
    if (max === min) {
      return (LINE_TOP + LINE_BOTTOM) / 2;
    }
    return LINE_BOTTOM - ((v - min) / (max - min)) * (LINE_BOTTOM - LINE_TOP);
  };
  const points = data.map((d, i) => `${xAt(i)},${yAt(d.netWorthKrw)}`).join(" ");

  // 막대: 변화량 절대값 최대 기준 독립 스케일. null(첫 기록)·0은 그리지 않는다.
  const maxAbsDelta = Math.max(...data.map((d) => Math.abs(d.deltaKrw ?? 0)));

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="순자산 추이와 직전 대비 변화량"
    >
      {/* 하단 밴드 0 기준선 */}
      <line x1={PAD_X} y1={BAR_BASELINE} x2={W - PAD_X} y2={BAR_BASELINE} stroke={BASELINE_COLOR} strokeWidth={1} />
      {data.map((d, i) => {
        if (d.deltaKrw == null || d.deltaKrw === 0 || maxAbsDelta === 0) {
          return null;
        }
        const h = (Math.abs(d.deltaKrw) / maxAbsDelta) * BAR_HALF;
        const up = d.deltaKrw > 0;
        return (
          <rect
            key={d.id}
            data-trend-bar
            x={xAt(i) - barWidth / 2}
            y={up ? BAR_BASELINE - h : BAR_BASELINE}
            width={barWidth}
            height={h}
            rx={1.5}
            fill={up ? UP_COLOR : DOWN_COLOR}
          />
        );
      })}
      {/* 상단 밴드: 순자산 선 + 포인트 */}
      <polyline points={points} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={d.id} cx={xAt(i)} cy={yAt(d.netWorthKrw)} r={3} fill={LINE_COLOR} />
      ))}
    </svg>
  );
}
