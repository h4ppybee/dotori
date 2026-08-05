"use client";

import { formatKrw } from "@/lib/format";
import { tagColor } from "@/lib/envelope/tag-color";
import type { EnvelopeItemRow as EnvelopeItemRowData } from "@/lib/envelope/envelope-service";

interface EnvelopeItemRowProps {
  row: EnvelopeItemRowData;
  onEdit: () => void;
  /** 편집 모드 여부. true면 금액 인라인 입력 + X 삭제로 렌더한다. */
  editing?: boolean;
  /** 편집 모드에서 컨트롤되는 금액 문자열. */
  draftAmount?: string;
  onDraftChange?: (v: string) => void;
  /** 편집 모드 X 삭제. */
  onDelete?: () => void;
}

/** 비율(0~100)을 부호 없이 소수점 1자리로. */
function formatShare(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/** 태그 칩 — key별 팔레트 색. */
function TagChip({ tag, color }: { tag: string; color: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-[3px] text-[12px] font-semibold leading-[1.4]"
      style={{ backgroundColor: `${color}1F`, color }}
    >
      {tag}
    </span>
  );
}

/**
 * 통장 쪼개기 항목 행.
 * 보기 모드: 탭하면 편집 다이얼로그를 연다(항목명 + 태그 칩 + 통장 + 금액 + 비율).
 * 편집 모드: 금액 인라인 입력 + X 삭제(비율은 숨김). 금액은 뉴트럴 text-ink.
 */
export function EnvelopeItemRow({
  row,
  onEdit,
  editing = false,
  draftAmount,
  onDraftChange,
  onDelete,
}: EnvelopeItemRowProps) {
  const { item, ratioPct } = row;
  const color = tagColor(item.tag);

  // 편집 모드 — 버튼이 아닌 행. 금액 인라인 입력 + X 삭제.
  if (editing) {
    return (
      <div className="flex items-center gap-3 px-1 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[17px] font-semibold leading-[1.45] tracking-[-0.2px] text-ink">
              {item.name}
            </span>
            <TagChip tag={item.tag} color={color} />
          </div>
          <span className="mt-0.5 block truncate text-[13px] font-normal leading-[1.45] text-muted">
            {item.account}
          </span>
        </div>
        <input
          inputMode="numeric"
          value={draftAmount ?? String(item.amountKrw)}
          onChange={(e) => onDraftChange?.(e.target.value.replace(/[^\d]/g, ""))}
          className="w-[120px] rounded-[10px] border border-hairline bg-surface-soft px-3 py-2 text-right text-[15px] font-semibold tabular-nums text-ink outline-none focus:border-[1.5px] focus:border-primary"
          aria-label={`${item.name} 금액`}
        />
        <button
          type="button"
          onClick={onDelete}
          aria-label={`${item.name} 삭제`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-soft"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  // 보기 모드 — 탭하면 편집 다이얼로그를 연다.
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 rounded-[12px] px-1 py-3 text-left transition-colors duration-150 hover:bg-surface-soft"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[17px] font-semibold leading-[1.45] tracking-[-0.2px] text-ink">
            {item.name}
          </span>
          <TagChip tag={item.tag} color={color} />
        </div>
        <span className="mt-0.5 block truncate text-[13px] font-normal leading-[1.45] text-muted">
          {item.account}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-[15px] font-semibold leading-[1.4] tabular-nums text-ink">
          {formatKrw(item.amountKrw)}
        </span>
        <span className="text-[13px] font-normal leading-[1.4] tabular-nums text-muted">
          {formatShare(ratioPct)}
        </span>
      </div>
    </button>
  );
}
