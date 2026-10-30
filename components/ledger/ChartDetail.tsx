"use client";

import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { LEDGER_REVEAL_LABEL } from "@/components/ledger/ledger-constants";
import { formatKrw } from "@/lib/format";

export interface ChartDetailRow {
  key: string;
  label: string;
  color: string;
  /** null = 그 달 기록 없음. */
  value: number | null;
}

interface ChartDetailProps {
  /** 고른 달 버튼의 aria-describedby가 가리키는 id. */
  id: string;
  /** 고른 달 제목(예: "2026년 10월"). */
  title: string;
  rows: ChartDetailRow[];
  /** 열 수(수입·지출·저축 3, 카테고리 2). */
  columns: 2 | 3;
  /** 미리 잡아 둘 줄 수 — 고른 칩 수가 바뀌어도 높이가 흔들리지 않게. */
  reservedRows: 1 | 2;
}

// 한 칸 높이(라벨 12px + 값 14px + 간격) 40px, 줄 간격 8px.
const CELL_H = 40;
const ROW_GAP = 8;
const GRID_COLS = { 2: "grid-cols-2", 3: "grid-cols-3" } as const;

/**
 * 고른 달 상세 — 카드 제목과 그림 사이에 늘 자리를 잡아 두는 고정 줄(떠 있는 말풍선 대신).
 * 계열마다 라벨(색 점) 위에 금액을 쌓은 격자. 금액 숨기기가 켜져 있으면 값을 가린다.
 * 그 달 기록이 없으면 "기록 없음". 달을 바꾸면 스크린리더가 읽도록 aria-live="polite".
 */
export function ChartDetail({ id, title, rows, columns, reservedRows }: ChartDetailProps) {
  const minHeight = reservedRows * CELL_H + (reservedRows - 1) * ROW_GAP;
  const empty = rows.every((r) => r.value === null);
  return (
    <div id={id} role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold leading-[1.45] tabular-nums text-muted">{title}</span>
      <div style={{ minHeight }}>
        {empty ? (
          <p className="text-[14px] font-normal leading-[1.4] text-muted">기록 없음</p>
        ) : (
          <dl className={`grid ${GRID_COLS[columns]} gap-x-3 gap-y-2`}>
            {rows.map((row) => (
              <div key={row.key} className="flex min-w-0 flex-col gap-0.5">
                <dt className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold leading-[1.4] text-body-soft">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
                  {row.label}
                </dt>
                <dd className="whitespace-nowrap">
                  {row.value === null ? (
                    <span className="text-[14px] font-normal leading-[1.4] text-muted">기록 없음</span>
                  ) : (
                    <PrivacyAmount revealLabel={LEDGER_REVEAL_LABEL}>
                      <span className="text-[14px] font-semibold leading-[1.4] tabular-nums text-ink">
                        {formatKrw(row.value)}
                      </span>
                    </PrivacyAmount>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
