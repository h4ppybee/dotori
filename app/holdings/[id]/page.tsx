"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { ReturnBadge } from "@/components/ui/ReturnBadge";
import { Dialog } from "@/components/ui/Dialog";
import { SectorDialog } from "@/components/portfolio/SectorDialog";
import { HoldingForm } from "@/components/holdings/HoldingForm";
import { usePortfolio } from "@/lib/query/use-portfolio";
import {
  listConnections,
  getFx,
  putSectorOverride,
  deleteSectorOverride,
  deleteHolding,
} from "@/lib/db/local-store";
import { KNOWN_SECTORS, UNCLASSIFIED } from "@/lib/sector/sector-map";
import { formatKrw, formatUsd, signClass } from "@/lib/format";
import type { Currency } from "@/lib/types";

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

/** 양수면 + 접두사를 붙인 원화 표기. */
function signedKrw(n: number): string {
  if (n > 0) {
    return `+${formatKrw(n)}`;
  }
  return formatKrw(n);
}

/** 자체 통화로 가격 포맷. */
function formatNative(price: number, currency: Currency): string {
  if (currency === "USD") {
    return formatUsd(price);
  }
  return formatKrw(price);
}

/** 연필(수정) 아이콘. stroke=currentColor. */
function PencilIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

interface InfoRowProps {
  label: string;
  children: React.ReactNode;
}

/** 라벨(좌) + 값(우) 한 줄. */
function InfoRow({ label, children }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-[14px] border-b border-hairline last:border-b-0">
      <span className="text-[15px] font-normal leading-[1.45] text-muted">
        {label}
      </span>
      <span className="text-[15px] font-medium leading-[1.45] text-body tabular-nums">
        {children}
      </span>
    </div>
  );
}

export default function HoldingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: vm, isLoading } = usePortfolio();

  const [connectionLabels, setConnectionLabels] = useState<Record<string, string>>({});
  const [usdKrwRate, setUsdKrwRate] = useState<number | undefined>(undefined);
  const [editingSector, setEditingSector] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [connections, fx] = await Promise.all([listConnections(), getFx()]);
      if (cancelled) {
        return;
      }
      const labels: Record<string, string> = {};
      for (const c of connections) {
        labels[c.id] = c.label;
      }
      setConnectionLabels(labels);
      setUsdKrwRate(fx?.rate);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const row = vm?.rows.find((r) => r.holding.id === id);

  // 섹터 후보 = 시드 ∪ 현재 포트폴리오에서 쓰이는 섹터(미분류 제외).
  const sectorOptions = (() => {
    const set = new Set<string>([
      ...KNOWN_SECTORS,
      ...(vm?.rows.map((r) => r.sector) ?? []),
    ]);
    set.delete(UNCLASSIFIED);
    return Array.from(set);
  })();

  async function handleSaveSector(symbol: string, sector: string) {
    const chosen = sector.trim() === "" ? UNCLASSIFIED : sector.trim();
    if (chosen === UNCLASSIFIED) {
      await deleteSectorOverride(symbol);
    } else {
      await putSectorOverride(symbol, chosen);
    }
    await queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    setEditingSector(false);
  }

  function handleHoldingSaved() {
    void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    setEditing(false);
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await deleteHolding(id);
      await queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      router.push("/assets/stocks");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pb-24">
        {/* 헤더 */}
        <div className="flex items-center h-14 -ml-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="뒤로"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-soft transition-colors text-[22px] leading-none"
          >
            ‹
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <span className="text-[15px] text-muted">불러오는 중이에요…</span>
          </div>
        )}

        {!isLoading && row == null && (
          <Card className="flex flex-col items-center text-center gap-4 py-12">
            <p className="text-[15px] leading-[1.6] text-body-soft">
              종목을 찾을 수 없어요.
            </p>
            <Link
              href="/assets/stocks"
              className="text-[15px] font-semibold text-primary underline underline-offset-2"
            >
              포트폴리오로 돌아가기
            </Link>
          </Card>
        )}

        {!isLoading && row != null && (() => {
          const { holding } = row;
          const isUsd = holding.currency === "USD";
          const isManual = holding.source === "MANUAL";
          const label = connectionLabels[holding.connectionId] ?? "직접 추가";

          // 직접 추가한 종목 편집 모드.
          if (editing) {
            return (
              <Card>
                <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-5">
                  종목 수정
                </h2>
                <HoldingForm
                  initial={holding}
                  onSave={handleHoldingSaved}
                  onCancel={() => setEditing(false)}
                />
              </Card>
            );
          }

          // USD 종목의 자체통화 현재가/평가금 (priceKrw를 환율로 역산).
          const nativePrice =
            isUsd && usdKrwRate ? row.priceKrw / usdKrwRate : row.priceKrw;
          const nativeValue = nativePrice * holding.quantity;
          const currentLabel =
            isUsd && usdKrwRate ? formatUsd(nativePrice) : formatKrw(row.priceKrw);

          return (
            <div className="flex flex-col gap-4">
              {/* 히어로 */}
              <Card variant="hero" className="relative flex flex-col gap-4">
                {isManual && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    aria-label="종목 수정"
                    className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-soft hover:text-body transition-colors"
                  >
                    <PencilIcon />
                  </button>
                )}
                <div className="flex flex-col gap-1 pr-10">
                  <h1 className="text-[24px] font-bold leading-[1.3] tracking-[-0.3px] text-ink">
                    {holding.name}
                  </h1>
                  <span className="text-[13px] font-normal leading-[1.45] text-muted">
                    {holding.symbol} · {holding.market} · {label}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-normal leading-[1.45] text-muted">
                    평가금액
                  </span>
                  <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
                    {formatKrw(row.valueKrw)}
                  </span>
                  {isUsd && usdKrwRate && (
                    <span className="text-[13px] font-normal leading-[1.4] tabular-nums text-muted">
                      {formatUsd(nativeValue)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap border-t border-hairline pt-3">
                  <ReturnBadge value={row.returnPct} />
                  <span
                    className={`text-[15px] font-semibold leading-[1.4] tabular-nums ${signTextClass(row.pnlKrw)}`}
                  >
                    {signedKrw(row.pnlKrw)}
                  </span>
                  <span className="text-[13px] font-normal leading-[1.45] text-muted">
                    평가손익
                  </span>
                </div>
              </Card>

              {/* 상세 정보 */}
              <Card className="flex flex-col">
                <InfoRow label="수량">
                  {holding.quantity.toLocaleString("ko-KR")}주
                </InfoRow>
                <InfoRow label="평균 매수가">
                  {formatNative(holding.avgBuyPrice, holding.currency)}
                </InfoRow>
                <InfoRow label="현재가">{currentLabel}</InfoRow>
                <InfoRow label="매입금액">{formatKrw(row.costKrw)}</InfoRow>
                <InfoRow label="섹터">
                  <button
                    type="button"
                    onClick={() => setEditingSector(true)}
                    className="inline-flex items-center gap-1 text-[15px] font-semibold text-[#3182F6] hover:underline underline-offset-2"
                  >
                    {row.sector}
                    <span aria-hidden className="text-[13px]">
                      ›
                    </span>
                  </button>
                </InfoRow>
              </Card>

              {/* 직접 추가한 종목 삭제 */}
              {isManual && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="self-center mt-2 px-4 py-2 text-[15px] font-semibold text-up hover:underline underline-offset-2"
                >
                  종목 삭제하기
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {editingSector && row != null && (
        <SectorDialog
          key={row.holding.id}
          name={row.holding.name}
          currentSector={row.sector}
          options={sectorOptions}
          onClose={() => setEditingSector(false)}
          onSave={(sector) => void handleSaveSector(row.holding.symbol, sector)}
        />
      )}

      <Dialog
        open={confirmingDelete}
        title="이 종목을 삭제할까요?"
        onClose={() => {
          if (!deleting) {
            setConfirmingDelete(false);
          }
        }}
        actionLabel={deleting ? "삭제 중..." : "삭제하기"}
        onAction={() => void handleConfirmDelete()}
        actionVariant="primary"
      >
        삭제하면 되돌릴 수 없어요.
      </Dialog>
    </main>
  );
}
