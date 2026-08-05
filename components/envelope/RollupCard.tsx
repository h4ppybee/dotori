"use client";

import { Card } from "@/components/ui/Card";
import { formatKrw } from "@/lib/format";
import { tagColor } from "@/lib/envelope/tag-color";
import type { EnvelopeRollupEntry } from "@/lib/envelope/envelope-service";

interface RollupCardProps {
  title: string;
  entries: EnvelopeRollupEntry[];
  /** true면 key별 색 점을 붙인다(태그 롤업용). */
  colored?: boolean;
}

/** 비율(0~100)을 부호 없이 소수점 1자리로. */
function formatShare(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/**
 * 통장 쪼개기 롤업 카드 — 태그·통장·프로필별 합계 목록.
 * key는 caller가 이미 라벨링한 값을 그대로 렌더한다(예: wife→아내 매핑은 페이지에서).
 * 금액은 손익이 아니므로 뉴트럴 text-ink로만 표기한다.
 */
export function RollupCard({ title, entries, colored = false }: RollupCardProps) {
  return (
    <Card>
      <h3 className="text-[17px] font-bold leading-[1.45] tracking-[-0.2px] text-ink">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-[15px] font-normal leading-[1.5] text-muted">
          아직 항목이 없어요.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.key} className="flex items-center gap-2.5">
              {colored && (
                <span
                  className="size-[10px] shrink-0 rounded-full"
                  style={{ backgroundColor: tagColor(entry.key) }}
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-[15px] font-normal leading-[1.4] text-body">
                {entry.key}
              </span>
              <span className="shrink-0 text-[15px] font-semibold leading-[1.4] tabular-nums text-ink">
                {formatKrw(entry.amountKrw)}
              </span>
              <span className="w-[52px] shrink-0 text-right text-[13px] font-normal leading-[1.4] tabular-nums text-muted">
                {formatShare(entry.ratioPct)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
