interface GoalProgressRingProps {
  /** 진행률 0~100 (범위를 벗어나면 클램프한다). */
  pct: number;
  /** 가운데 위쪽 작은 라벨(예: "목표까지"). */
  centerLabel?: string;
  /** 가운데 큰 값(이미 포맷된 문자열). */
  centerValue?: string;
  /** 링 지름(px). 기본 168. */
  size?: number;
  /** svg aria-label. */
  ariaLabel: string;
}

const STROKE = 16;

/**
 * 단일 호 진행률 링 프리미티브 (외부 라이브러리 없이 SVG로 직접 그림 — PWA 번들 경량 유지).
 * 트랙 원 + 진행 호 하나로 목표 대비 진행률을 표현한다. 다중 세그먼트+범례가 필요하면 DonutChart를 쓴다.
 * 진행 호는 브랜드색(primary), 트랙은 hairline. 색은 DESIGN 토큰 유틸 클래스로만 지정한다.
 */
export function GoalProgressRing({
  pct,
  centerLabel,
  centerValue,
  size = 168,
  ariaLabel,
}: GoalProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* 12시 방향에서 시작하도록 -90도 회전. */}
      <svg width={size} height={size} role="img" aria-label={ariaLabel} className="-rotate-90">
        {/* 트랙 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-hairline"
          strokeWidth={STROKE}
        />
        {/* 진행 호 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-primary"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      {/* 가운데 라벨 + 값 */}
      <div className="absolute flex flex-col items-center gap-0.5">
        {centerLabel != null && <span className="text-[12px] text-muted">{centerLabel}</span>}
        {centerValue != null && (
          <span className="text-[22px] font-bold leading-[1.2] tabular-nums text-ink">
            {centerValue}
          </span>
        )}
      </div>
    </div>
  );
}
