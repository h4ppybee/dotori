import { Card } from "@/components/ui/Card";
import { ReturnBadge } from "@/components/ui/ReturnBadge";
import { formatKrw, formatUsd } from "@/lib/format";
import type { PortfolioRow } from "@/lib/portfolio/portfolio-service";

interface HoldingsTableProps {
  rows: PortfolioRow[];
  /** connectionId → 증권사 라벨 조회 맵. */
  connectionLabels: Record<string, string>;
  /** USD→KRW 환율. USD 종목의 원통화 보조 표기에 사용. */
  usdKrwRate?: number;
}

function formatNativePrice(price: number, currency: "KRW" | "USD"): string {
  if (currency === "USD") {
    return formatUsd(price);
  }
  return formatKrw(price);
}

interface RowProps {
  row: PortfolioRow;
  label: string;
  usdKrwRate?: number;
}

/**
 * 모바일 우선 스택 행. 종목명·평가금·수익률을 크게,
 * 시장/증권사/수량/매수가/현재가는 보조로.
 */
function HoldingItem({ row, label, usdKrwRate }: RowProps) {
  const { holding } = row;
  const isUsd = holding.currency === "USD";

  // USD 종목의 자체통화 현재가/평가금. priceKrw를 환율로 역산.
  const nativePrice =
    isUsd && usdKrwRate ? row.priceKrw / usdKrwRate : holding.avgBuyPrice;
  const nativeValue = nativePrice * holding.quantity;

  return (
    <li className="flex items-start justify-between gap-3 py-4 border-b border-hairline last:border-b-0">
      <div className="flex flex-col gap-[3px] min-w-0">
        <span className="text-[17px] font-semibold leading-[1.4] tracking-[-0.2px] text-ink truncate">
          {holding.name}
        </span>
        <span className="text-[13px] font-normal leading-[1.45] text-muted">
          {holding.symbol} · {holding.market} · {label}
        </span>
        <div className="flex items-center gap-x-2 gap-y-[2px] mt-1 flex-wrap">
          <span className="text-[13px] font-normal text-body-soft tabular-nums">
            {holding.quantity.toLocaleString("ko-KR")}주
          </span>
          <span className="text-[13px] text-muted-soft">·</span>
          <span className="text-[13px] font-normal text-body-soft tabular-nums">
            매수 {formatNativePrice(holding.avgBuyPrice, holding.currency)}
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

      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[15px] font-semibold leading-[1.4] tabular-nums text-ink">
          {formatKrw(row.valueKrw)}
        </span>
        {isUsd && usdKrwRate && (
          <span className="text-[12px] font-normal leading-[1.4] tabular-nums text-muted">
            {formatUsd(nativeValue)}
          </span>
        )}
        <ReturnBadge value={row.returnPct} />
      </div>
    </li>
  );
}

/**
 * 보유 종목 리스트. 모바일에서 스택 행 레이아웃으로 읽기 쉽게.
 * USD 종목은 원화 평가금 + 원통화 금액을 보조로 함께 보여준다.
 */
export function HoldingsTable({ rows, connectionLabels, usdKrwRate }: HoldingsTableProps) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-1">
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-1">
        보유 종목
      </h2>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <HoldingItem
            key={row.holding.id}
            row={row}
            label={connectionLabels[row.holding.connectionId] ?? "직접 추가"}
            usdKrwRate={usdKrwRate}
          />
        ))}
      </ul>
    </Card>
  );
}
