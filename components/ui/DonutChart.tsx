import { formatKrw } from "@/lib/format";

export interface DonutSegment {
  /** 범례에 표시할 이름. */
  label: string;
  /** 환산 금액(원). 범례 보조 텍스트로 포맷해 표시한다. */
  value: number;
  /** 비율 0~100. 호 길이와 범례 비율 표시에 쓴다. */
  pct: number;
}

interface DonutChartProps {
  segments: DonutSegment[];
  /** 가운데 라벨(예: "총평가금" / "총 자산 비중"). */
  centerLabel?: string;
  /** 가운데 값(이미 포맷된 문자열). */
  centerValue?: string;
  /** 도넛 지름(px). 기본 160. */
  size?: number;
  /** svg aria-label. */
  ariaLabel: string;
  /** 범례 우측 보조 텍스트 포매터. 기본 formatKrw. */
  formatValue?: (value: number) => string;
}

// DESIGN.md donut-chart 팔레트 순서대로 배정.
const PALETTE = ["#A87342", "#F04452", "#15803D", "#FF9800", "#8B5CF6", "#6B7684"];
const TRACK_COLOR = "#F1ECE4"; // hairline

const DEFAULT_SIZE = 160;
const STROKE = 22;

// 세그먼트 사이 갭(px)과 작은 세그먼트가 사라지지 않도록 보장하는 최소 호 길이(px).
const SEGMENT_GAP = 2;
const MIN_ARC = 1;

/** 비율(0~100)을 부호 없이 소수점 1자리로 — 점유율이므로 +/- 를 붙이지 않는다. */
function formatShare(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

function colorFor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

/**
 * 표현형 도넛 차트 프리미티브 (외부 라이브러리 없이 SVG로 직접 그림 — PWA 번들 경량 유지).
 * 단일 원에 stroke-dasharray로 각 세그먼트 호를 그린다. 카드/헤딩은 소비자가 감싼다.
 * 섹터 비중·저축 카테고리 비중 등 여러 화면에서 재사용한다.
 */
export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  size = DEFAULT_SIZE,
  ariaLabel,
  formatValue = formatKrw,
}: DonutChartProps) {
  const radius = (size - STROKE) / 2;
  const circum = 2 * Math.PI * radius;
  const center = size / 2;

  // 호 누적 오프셋 계산. 12시 방향에서 시작하도록 -90도 회전.
  // 누적 분율(prefix sum)을 먼저 구해 render 중 변수 재할당을 피한다.
  const prefix = segments.reduce<number[]>((acc, s) => {
    const prev = acc.length === 0 ? 0 : acc[acc.length - 1];
    acc.push(prev + s.pct / 100);
    return acc;
  }, []);

  const arcs = segments.map((s, i) => {
    const fraction = s.pct / 100;
    const full = fraction * circum;
    // 세그먼트 사이 미세 갭으로 경계를 깔끔하게 분리한다.
    // 갭만큼 호를 줄이고 절반만큼 안쪽으로 밀어 가운데 정렬한다.
    const dash = Math.max(full - SEGMENT_GAP, MIN_ARC);
    const startFraction = i === 0 ? 0 : prefix[i - 1];
    return {
      key: s.label,
      color: colorFor(i),
      dash,
      gap: circum - dash,
      offset: -(startFraction * circum) - SEGMENT_GAP / 2,
    };
  });

  return (
    <div className="flex items-center gap-6 flex-wrap">
      {/* 도넛 */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={ariaLabel}
        >
          {/* 트랙 */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={TRACK_COLOR}
            strokeWidth={STROKE}
          />
          {/* 호 — 12시 방향 시작 */}
          <g transform={`rotate(-90 ${center} ${center})`}>
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeDasharray={`${arc.dash} ${arc.gap}`}
                strokeDashoffset={arc.offset}
              />
            ))}
          </g>
        </svg>
        {/* 가운데 라벨 + 값 */}
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerLabel && (
              <span className="text-[12px] font-normal leading-[1.4] text-muted">
                {centerLabel}
              </span>
            )}
            {centerValue && (
              <span className="text-[15px] font-bold leading-[1.3] tracking-[-0.2px] tabular-nums text-ink px-2">
                {centerValue}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 범례 */}
      <ul className="flex-1 min-w-[180px] flex flex-col gap-3">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5">
            <span
              className="size-[10px] rounded-full shrink-0"
              style={{ backgroundColor: colorFor(i) }}
              aria-hidden="true"
            />
            <span className="flex-1 min-w-0 text-[15px] font-normal leading-[1.4] text-body truncate">
              {s.label}
            </span>
            <span className="flex flex-col items-end shrink-0">
              <span className="text-[15px] font-semibold leading-[1.3] tabular-nums text-ink">
                {formatShare(s.pct)}
              </span>
              <span className="text-[12px] font-normal leading-[1.3] tabular-nums text-muted">
                {formatValue(s.value)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
