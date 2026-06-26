import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { formatKrw, formatUsd, signClass } from "@/lib/format";
import type { PortfolioRow } from "@/lib/portfolio/portfolio-service";

/** 더하기 아이콘. stroke=currentColor. */
function PlusIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** 양수면 + 접두사를 붙인 원화 표기. */
function signedKrw(n: number): string {
  if (n > 0) {
    return `+${formatKrw(n)}`;
  }
  return formatKrw(n);
}

/** 부호 클래스 → 텍스트 색 (상승/수익=빨강, 하락/손실=파랑, 보합=muted). */
function signTextClass(n: number): string {
  const sign = signClass(n);
  if (sign === "up") {
    return "text-up";
  }
  if (sign === "down") {
    return "text-down";
  }
  return "text-muted";
}

interface HoldingsTableProps {
  rows: PortfolioRow[];
  /** connectionId → 증권사 라벨 조회 맵. */
  connectionLabels: Record<string, string>;
  /** USD→KRW 환율. USD 종목의 원통화 보조 표기에 사용. */
  usdKrwRate?: number;
  /** 행을 탭했을 때 호출 — 종목 상세 화면으로 이동. */
  onSelectHolding?: (row: PortfolioRow) => void;
}

interface RowProps {
  row: PortfolioRow;
  label: string;
  usdKrwRate?: number;
  onSelectHolding?: (row: PortfolioRow) => void;
}

/**
 * 모바일 우선 스택 행. 종목명·평가금·수익률을 크게,
 * 시장/증권사/수량/매수가/현재가는 보조로.
 * 행을 탭하면 종목 상세 화면으로 이동한다.
 */
function HoldingItem({ row, label, usdKrwRate, onSelectHolding }: RowProps) {
  const { holding } = row;
  const isUsd = holding.currency === "USD";

  // USD 종목의 자체통화 현재가/평가금. priceKrw를 환율로 역산.
  const nativePrice =
    isUsd && usdKrwRate ? row.priceKrw / usdKrwRate : holding.avgBuyPrice;
  const nativeValue = nativePrice * holding.quantity;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectHolding?.(row)}
        className="
          flex items-stretch justify-between gap-3 w-full text-left
          py-4 px-3 rounded-[12px]
          hover:bg-surface-soft transition-colors
        "
      >
        <div className="flex flex-col gap-[3px] min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center shrink-0 px-2 py-[2px] rounded-full text-[11px] font-semibold bg-surface-soft text-muted">
              {row.sector}
            </span>
            <span className="text-[17px] font-semibold leading-[1.4] tracking-[-0.2px] text-ink truncate">
              {holding.name}
            </span>
          </div>
          <span className="text-[13px] font-normal leading-[1.45] text-muted">
            {holding.symbol} · {holding.market} · {label}
          </span>
          <div className="flex items-center gap-x-2 gap-y-[2px] mt-1 flex-wrap">
          <span className="text-[13px] font-normal text-body-soft tabular-nums">
            {holding.quantity.toLocaleString("ko-KR")}주
          </span>
          {isUsd && usdKrwRate ? (
            <>
              <span className="text-[13px] text-muted-soft">·</span>
              <span className="text-[13px] font-normal text-body-soft tabular-nums">
                현재 {formatUsd(nativePrice)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[13px] text-muted-soft">·</span>
              <span className="text-[13px] font-normal text-body-soft tabular-nums">
                현재 {formatKrw(row.priceKrw)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end shrink-0">
        <span className="text-[15px] font-semibold leading-[1.4] tabular-nums text-ink">
          {formatKrw(row.valueKrw)}
        </span>
        {isUsd && usdKrwRate && (
          <span className="text-[12px] font-normal leading-[1.4] tabular-nums text-muted mt-[2px]">
            {formatUsd(nativeValue)}
          </span>
        )}
        <span
          className={`mt-auto pt-1 text-[13px] font-semibold leading-[1.4] tabular-nums ${signTextClass(row.pnlKrw)}`}
        >
          {signedKrw(row.pnlKrw)} ({Math.abs(row.returnPct).toFixed(2)}%)
        </span>
      </div>
      </button>
    </li>
  );
}

/**
 * 보유 종목 리스트. 모바일에서 스택 행 레이아웃으로 읽기 쉽게.
 * USD 종목은 원화 평가금 + 원통화 금액을 보조로 함께 보여준다.
 */
export function HoldingsTable({
  rows,
  connectionLabels,
  usdKrwRate,
  onSelectHolding,
}: HoldingsTableProps) {
  if (rows.length === 0) {
    return null;
  }

  // 평가금(원화) 내림차순 정렬.
  const sorted = [...rows].sort((a, b) => b.valueKrw - a.valueKrw);

  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink">
          보유 종목
        </h2>
        <Link
          href="/holdings/new"
          aria-label="종목 추가"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-soft hover:text-body transition-colors"
        >
          <PlusIcon />
        </Link>
      </div>
      <ul className="flex flex-col">
        {sorted.map((row) => (
          <HoldingItem
            key={row.holding.id}
            row={row}
            label={connectionLabels[row.holding.connectionId] ?? "직접 추가"}
            usdKrwRate={usdKrwRate}
            onSelectHolding={onSelectHolding}
          />
        ))}
      </ul>
    </Card>
  );
}
