"use client";

import { Card } from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { UnderlineAmountInput } from "@/components/ledger/UnderlineAmountInput";
import { LEDGER_REVEAL_LABEL } from "@/components/ledger/ledger-constants";
import { formatKrw } from "@/lib/format";
import { LEDGER_TREE, chipLabel, type LedgerNode } from "@/lib/ledger/categories";
import type { LedgerMonthView } from "@/lib/ledger/ledger-service";

interface LedgerCategoryListProps {
  /** 보기 모드는 저장된 값, 편집 모드는 draft로 계산한 뷰(위 노드 합계가 즉시 바뀐다). */
  view: LedgerMonthView;
  editing: boolean;
  /** 편집 모드 잎 값(원). */
  draft: Record<string, number>;
  onDraftChange: (leafId: string, value: number) => void;
}

function Amount({ value, className }: { value: number; className: string }) {
  return (
    <PrivacyAmount revealLabel={LEDGER_REVEAL_LABEL}>
      <span className={`tabular-nums ${className}`}>{formatKrw(value)}</span>
    </PrivacyAmount>
  );
}

/**
 * 카테고리 목록 — 수입·지출·저축 카드. 각 카드 머리에 합계.
 * 지출은 고정지출·변동지출 소제목으로 묶고, 식비처럼 잎이 아닌 노드는 합계 행 아래 잎을 들여 쓴다.
 * 보기 모드에선 0원 잎도 보여 무엇을 안 적었는지 드러낸다. 편집 모드에선 잎이 밑줄형 입력칸으로 바뀐다.
 */
export function LedgerCategoryList({ view, editing, draft, onDraftChange }: LedgerCategoryListProps) {
  const sumOf = (id: string) => view.nodes.get(id) ?? 0;

  function renderLeaf(node: LedgerNode) {
    const value = sumOf(node.id);
    // 편집 모드 — 행 전체를 <label>로 감싸 카테고리 이름을 눌러도 입력칸에 포커스된다.
    if (editing) {
      return (
        <li key={node.id}>
          <label className="flex min-h-[44px] cursor-text items-center justify-between gap-3">
            <span className="text-[15px] font-normal leading-[1.5] text-body">{node.label}</span>
            <UnderlineAmountInput
              label={chipLabel(node.id)}
              value={draft[node.id] ?? 0}
              onChange={(v) => onDraftChange(node.id, v)}
            />
          </label>
        </li>
      );
    }
    return (
      <li key={node.id} className="flex min-h-[44px] items-center justify-between gap-3 py-1">
        <span className="text-[15px] font-normal leading-[1.5] text-body">{node.label}</span>
        <Amount
          value={value}
          className={`text-[15px] font-semibold leading-[1.4] ${value > 0 ? "text-ink" : "text-muted-soft"}`}
        />
      </li>
    );
  }

  // 그룹 안 노드 — 잎이면 행, 아니면(식비) 합계 행 + 들여 쓴 잎.
  function renderNode(node: LedgerNode) {
    if (!node.children?.length) {
      return renderLeaf(node);
    }
    return (
      <li key={node.id} className="flex flex-col">
        <div className="flex min-h-[44px] items-center justify-between gap-3 py-1">
          <span className="text-[15px] font-semibold leading-[1.4] text-ink">{node.label}</span>
          <Amount value={sumOf(node.id)} className="text-[15px] font-semibold leading-[1.4] text-ink" />
        </div>
        <ul className="ml-1 flex flex-col border-l-2 border-hairline pl-4">
          {node.children.map(renderLeaf)}
        </ul>
      </li>
    );
  }

  // 소제목 그룹(고정지출·변동지출) — 제목 아래 구분선, 오른쪽에 그룹 합계.
  function renderGroup(node: LedgerNode) {
    return (
      <div key={node.id} className="flex flex-col">
        <div className="mb-1 flex items-baseline justify-between border-b border-hairline pb-2">
          <h4 className="text-[15px] font-semibold leading-[1.4] text-body">{node.label}</h4>
          <Amount value={sumOf(node.id)} className="text-[13px] font-normal leading-[1.45] text-muted" />
        </div>
        <ul className="flex flex-col">{node.children?.map(renderNode)}</ul>
      </div>
    );
  }

  return (
    <>
      {LEDGER_TREE.map((root) => {
        const grouped = root.children?.some((c) => c.children?.length) ?? false;
        return (
          <section key={root.id} aria-label={root.label}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[17px] font-bold leading-[1.45] tracking-[-0.2px] text-ink">{root.label}</h3>
                <Amount value={sumOf(root.id)} className="text-[17px] font-bold leading-[1.45] tracking-[-0.2px] text-ink" />
              </div>
              {grouped ? (
                <div className="mt-2 flex flex-col gap-6">{root.children?.map(renderGroup)}</div>
              ) : (
                <ul className="flex flex-col">{root.children?.map(renderNode)}</ul>
              )}
            </Card>
          </section>
        );
      })}
    </>
  );
}
