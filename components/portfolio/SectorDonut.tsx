import { Card } from "@/components/ui/Card";
import { formatKrw } from "@/lib/format";
import type { PortfolioVM } from "@/lib/portfolio/portfolio-service";

interface SectorDonutProps {
  vm: PortfolioVM;
}

// DESIGN.md donut-chart 팔레트 순서대로 배정.
const PALETTE = ["#A87342", "#F04452", "#15803D", "#FF9800", "#8B5CF6", "#6B7684"];
const TRACK_COLOR = "#F1ECE4"; // hairline

// SVG 기하 상수.
const SIZE = 160;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUM = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

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
 * 섹터 비중 도넛 차트 (외부 라이브러리 없이 SVG로 직접 그림 — PWA 번들 경량 유지).
 * 단일 원에 stroke-dasharray로 각 섹터 호를 그린다.
 * 빈 상태(bySector 없음)에서는 도넛을 그리지 않는다.
 */
export function SectorDonut({ vm }: SectorDonutProps) {
  const sectors = vm.bySector;

  if (sectors.length === 0) {
    return null;
  }

  // 호 누적 오프셋 계산. 12시 방향에서 시작하도록 -90도 회전.
  // 누적 분율(prefix sum)을 먼저 구해 render 중 변수 재할당을 피한다.
  const prefix = sectors.reduce<number[]>((acc, s) => {
    const prev = acc.length === 0 ? 0 : acc[acc.length - 1];
    acc.push(prev + s.pct / 100);
    return acc;
  }, []);

  const arcs = sectors.map((s, i) => {
    const fraction = s.pct / 100;
    const full = fraction * CIRCUM;
    // 세그먼트 사이 미세 갭으로 경계를 깔끔하게 분리한다.
    // 갭만큼 호를 줄이고 절반만큼 안쪽으로 밀어 가운데 정렬한다.
    const dash = Math.max(full - SEGMENT_GAP, MIN_ARC);
    const startFraction = i === 0 ? 0 : prefix[i - 1];
    return {
      key: s.sector,
      color: colorFor(i),
      dash,
      gap: CIRCUM - dash,
      offset: -(startFraction * CIRCUM) - SEGMENT_GAP / 2,
    };
  });

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
        섹터 비중
      </h2>

      <div className="flex items-center gap-6 flex-wrap">
        {/* 도넛 */}
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label="섹터 비중 도넛 차트"
          >
            {/* 트랙 */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={TRACK_COLOR}
              strokeWidth={STROKE}
            />
            {/* 호 — 12시 방향 시작 */}
            <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
              {arcs.map((arc) => (
                <circle
                  key={arc.key}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${arc.dash} ${arc.gap}`}
                  strokeDashoffset={arc.offset}
                />
              ))}
            </g>
          </svg>
          {/* 가운데 총평가금 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[12px] font-normal leading-[1.4] text-muted">
              총평가금
            </span>
            <span className="text-[15px] font-bold leading-[1.3] tracking-[-0.2px] tabular-nums text-ink px-2">
              {formatKrw(vm.totalValueKrw)}
            </span>
          </div>
        </div>

        {/* 범례 */}
        <ul className="flex-1 min-w-[180px] flex flex-col gap-3">
          {sectors.map((s, i) => (
            <li key={s.sector} className="flex items-center gap-2.5">
              <span
                className="size-[10px] rounded-full shrink-0"
                style={{ backgroundColor: colorFor(i) }}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 text-[15px] font-normal leading-[1.4] text-body truncate">
                {s.sector}
              </span>
              <span className="flex flex-col items-end shrink-0">
                <span className="text-[15px] font-semibold leading-[1.3] tabular-nums text-ink">
                  {formatShare(s.pct)}
                </span>
                <span className="text-[12px] font-normal leading-[1.3] tabular-nums text-muted">
                  {formatKrw(s.valueKrw)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
