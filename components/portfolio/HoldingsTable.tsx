import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PnlText } from "@/components/ui/PnlText";
import { formatKrw, formatUsd } from "@/lib/format";
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
  usdKrwRate?: number;
  onSelectHolding?: (row: PortfolioRow) => void;
}

/** 보유 수량 — 소수 첫째 자리까지(반올림), 천 단위 콤마. */
function formatQuantity(q: number): string {
  return q.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

/**
 * 모바일 우선 스택 행. 왼쪽은 섹터·종목명만, 오른쪽은 평가금 아래에
 * 수량·현재가를 보조로 두고 맨 아래에 수익을 둔다(계좌 라벨은 그룹 제목으로 뺐다).
 * 행을 탭하면 종목 상세 화면으로 이동한다.
 */
function HoldingItem({ row, usdKrwRate, onSelectHolding }: RowProps) {
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
          <span className="mt-1 text-[13px] font-normal leading-[1.45] text-body-soft tabular-nums">
            {formatQuantity(holding.quantity)}주 · 현재{" "}
            {isUsd && usdKrwRate ? formatUsd(nativePrice) : formatKrw(row.priceKrw)}
          </span>
          <PnlText
            amountKrw={row.pnlKrw}
            returnPct={row.returnPct}
            className="mt-auto pt-1 text-[13px] font-semibold leading-[1.4]"
          />
        </div>
      </button>
    </li>
  );
}

/** 같은 계좌 라벨의 행 묶음. */
interface HoldingGroup {
  label: string;
  totalKrw: number;
  rows: PortfolioRow[];
}

/** 계좌 라벨별로 묶는다. 그룹·그룹 안 행 모두 평가금(원화) 내림차순. */
function groupByLabel(rows: PortfolioRow[], connectionLabels: Record<string, string>): HoldingGroup[] {
  const groups = new Map<string, HoldingGroup>();
  for (const row of rows) {
    const label = connectionLabels[row.holding.connectionId] ?? "직접 추가";
    const group = groups.get(label) ?? { label, totalKrw: 0, rows: [] };
    group.totalKrw += row.valueKrw;
    group.rows.push(row);
    groups.set(label, group);
  }
  for (const group of groups.values()) {
    group.rows.sort((a, b) => b.valueKrw - a.valueKrw);
  }
  return [...groups.values()].sort((a, b) => b.totalKrw - a.totalKrw);
}

/**
 * 보유 종목 리스트. 계좌(연동) 라벨별 그룹으로 나눠 그룹 제목 + 그룹 평가금 아래에 종목을 나열한다.
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

  const groups = groupByLabel(rows, connectionLabels);

  return (
    <Card className="flex flex-col gap-1">
      {/* 제목 없이 "종목 추가" 버튼만 오른쪽에 둔다. */}
      <div className="flex items-center justify-end">
        <Link
          href="/holdings/new"
          aria-label="종목 추가"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-soft hover:text-body transition-colors"
        >
          <PlusIcon />
        </Link>
      </div>
      <div className="flex flex-col gap-6" role="group" aria-label="보유 종목">
        {groups.map((group) => (
          <section key={group.label} className="flex flex-col">
            {/* 그룹 제목 아래 구분선 — 제목을 소제목처럼 세워 그룹 경계를 드러낸다. */}
            <div className="flex items-baseline justify-between border-b border-hairline px-3 pb-2 mb-1">
              <h3 className="text-[15px] font-semibold leading-[1.4] text-body">{group.label}</h3>
              <span className="text-[13px] font-normal leading-[1.45] tabular-nums text-muted">
                {formatKrw(group.totalKrw)}
              </span>
            </div>
            <ul className="flex flex-col">
              {group.rows.map((row) => (
                <HoldingItem
                  key={row.holding.id}
                  row={row}
                  usdKrwRate={usdKrwRate}
                  onSelectHolding={onSelectHolding}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}
