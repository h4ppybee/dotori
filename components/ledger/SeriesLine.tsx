import { lineSegments } from "@/lib/ledger/chart-geometry";

interface SeriesLineProps {
  /** null = 기록 없는 달(선을 끊는다). */
  values: (number | null)[];
  yAt: (v: number) => number;
  color: string;
  /** 점 반지름. */
  r: number;
}

/**
 * 점이 있는 선 계열. 기록 없는 달(null)에서 선을 끊어 구간마다 polyline을 그리고,
 * 점은 기록한 달마다 찍는다(따로 떨어진 한 달도 점으로 보인다).
 */
export function SeriesLine({ values, yAt, color, r }: SeriesLineProps) {
  const segments = lineSegments(values, yAt);
  return (
    <>
      {segments
        .filter((seg) => seg.length > 1)
        .map((seg) => (
          <polyline
            key={`line-${seg[0].index}`}
            points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      {segments.flat().map((p) => (
        <circle key={`dot-${p.index}`} cx={p.x} cy={p.y} r={r} fill={color} />
      ))}
    </>
  );
}
