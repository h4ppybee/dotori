"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { DonutChart } from "@/components/ui/DonutChart";
import { ProfileSegment } from "@/components/envelope/ProfileSegment";
import { RollupCard } from "@/components/envelope/RollupCard";
import { EnvelopeItemRow } from "@/components/envelope/EnvelopeItemRow";
import { EnvelopeItemDialog } from "@/components/envelope/EnvelopeItemDialog";
import {
  useEnvelopeItems,
  useEnvelopeConfig,
  useEnvelopeMutations,
} from "@/lib/query/use-envelope";
import { buildEnvelopeView } from "@/lib/envelope/envelope-service";
import type { EnvelopeItemRow as EnvelopeItemRowData } from "@/lib/envelope/envelope-service";
import { TAG_PRESETS, ACCOUNT_PRESETS, mergePresets } from "@/lib/envelope/presets";
import { tagColor } from "@/lib/envelope/tag-color";
import { formatKrw } from "@/lib/format";
import type { EnvelopeItem, EnvelopeProfile } from "@/lib/types";

// scope 라벨 — 통합/아내/남편.
const SCOPE_LABEL: Record<"combined" | EnvelopeProfile, string> = {
  combined: "통합",
  wife: "아내",
  husband: "남편",
};

// 프로필 라벨(인물별 롤업·통합 섹션 헤더용).
const PROFILE_LABEL: Record<EnvelopeProfile, string> = {
  wife: "아내",
  husband: "남편",
};

/** 편집 모드에서 금액 문자열을 정수로. 빈 문자열이나 숫자 아님은 0. */
function parseAmount(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  if (digits === "") {
    return 0;
  }
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

export default function PlanPage() {
  // 현재 보고 있는 프로필(통합/아내/남편).
  const [scope, setScope] = useState<"combined" | EnvelopeProfile>("combined");

  const itemsData = useEnvelopeItems().data;
  const config = useEnvelopeConfig().data;

  // itemsData(쿼리 원본)를 deps로 삼아 매 렌더마다 새 배열이 생기지 않게 한다.
  const view = useMemo(
    () => buildEnvelopeView({ items: itemsData ?? [], scope }),
    [itemsData, scope],
  );

  // 다이얼로그에서 고를 수 있는 태그·통장(프리셋 ∪ 커스텀).
  const tags = mergePresets(TAG_PRESETS, config?.customTags ?? []);
  const accounts = mergePresets(ACCOUNT_PRESETS, config?.customAccounts ?? []);

  const { save, remove, addCustom, bulkUpdate } = useEnvelopeMutations();

  // 다이얼로그 상태 — 열림 여부 + 편집 대상(null이면 신규 추가).
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnvelopeItem | null>(null);

  // 일괄 편집 모드 상태(저축 관리 화면과 동일 구조).
  const [bulkEditing, setBulkEditing] = useState(false);
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const isCombined = scope === "combined";
  // 신규 추가는 항상 실제 프로필에서만 일어난다(통합 뷰엔 추가 버튼이 없음).
  const formProfile: EnvelopeProfile = isCombined ? "wife" : scope;

  const hasItems = view.rows.length > 0;

  // 편집 시작 — 현재 뷰의 모든 항목 금액을 draft로.
  function startEdit() {
    const draft: Record<string, string> = {};
    for (const { item } of view.rows) {
      draft[item.id] = String(item.amountKrw);
    }
    setDraftAmounts(draft);
    setDeletedIds(new Set());
    setBulkEditing(true);
  }

  function cancelEdit() {
    setBulkEditing(false);
    setDraftAmounts({});
    setDeletedIds(new Set());
  }

  // 저장 — 변경된 금액만 일괄 반영하고 삭제분을 제거한다.
  async function saveEdit() {
    const changed: EnvelopeItem[] = [];
    for (const { item } of view.rows) {
      if (deletedIds.has(item.id)) {
        continue;
      }
      const next = parseAmount(draftAmounts[item.id] ?? "");
      if (next !== item.amountKrw) {
        changed.push({ ...item, amountKrw: next });
      }
    }
    if (changed.length > 0) {
      await bulkUpdate.mutateAsync(changed);
    }
    for (const id of deletedIds) {
      await remove.mutateAsync(id);
    }
    cancelEdit();
  }

  // 세그먼트 전환 — 편집 상태가 뷰 간에 새지 않게 리셋한다(effect 아님).
  function handleScopeChange(next: "combined" | EnvelopeProfile) {
    setScope(next);
    cancelEdit();
  }

  function markDelete(id: string) {
    setDeletedIds((prev) => new Set(prev).add(id));
  }

  // 편집 모드에서 삭제 표시된 행은 숨긴다.
  const visibleRows = bulkEditing
    ? view.rows.filter((r) => !deletedIds.has(r.item.id))
    : view.rows;

  // 통합 뷰 — 아내/남편으로 나눈 섹션.
  const wifeRows = visibleRows.filter((r) => r.item.profile === "wife");
  const husbandRows = visibleRows.filter((r) => r.item.profile === "husband");
  const profileSubtotal = (profile: EnvelopeProfile): number =>
    view.byProfile.find((e) => e.key === profile)?.amountKrw ?? 0;

  // 편집 툴바 — 항목이 있을 때만 노출.
  const toolbar = hasItems ? (
    <div className="flex items-center justify-end">
      {!bulkEditing ? (
        <button
          type="button"
          onClick={startEdit}
          className="text-[15px] font-semibold text-primary hover:underline"
        >
          편집
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button type="button" onClick={cancelEdit} className="text-[15px] font-semibold text-muted">
            취소
          </button>
          <button type="button" onClick={() => void saveEdit()} className="text-[15px] font-semibold text-primary">
            저장
          </button>
        </div>
      )}
    </div>
  ) : null;

  // 항목 행 렌더 — 보기/편집 모드 공용.
  function renderRow(row: EnvelopeItemRowData) {
    const { item } = row;
    return (
      <EnvelopeItemRow
        row={row}
        editing={bulkEditing}
        draftAmount={draftAmounts[item.id]}
        onDraftChange={(v) => setDraftAmounts((p) => ({ ...p, [item.id]: v }))}
        onDelete={() => markDelete(item.id)}
        onEdit={() => {
          setEditing(item);
          setFormOpen(true);
        }}
      />
    );
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pt-6 pb-28 flex flex-col gap-4">
        {/* 헤딩 */}
        <h1 className="text-[22px] font-bold leading-[1.3] tracking-[-0.3px] text-ink">
          통장 쪼개기
        </h1>

        {/* 프로필 세그먼트 */}
        <ProfileSegment value={scope} onChange={handleScopeChange} />

        {/* 총액 카드 */}
        <Card variant="hero" className="flex flex-col gap-2">
          <span className="text-[13px] font-normal leading-[1.45] text-muted">
            {SCOPE_LABEL[scope]} 합계
          </span>
          <PrivacyAmount revealLabel="통장 쪼개기 금액 보기">
            <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
              {formatKrw(view.totalKrw)}
            </span>
          </PrivacyAmount>
        </Card>

        {isCombined ? (
          <>
            {/* 통합 뷰 — 태그 비중 도넛(항목이 있을 때만) */}
            {view.totalKrw > 0 && (
              <Card>
                <DonutChart
                  segments={view.byTag.map((e) => ({
                    label: e.key,
                    value: e.amountKrw,
                    pct: e.ratioPct,
                    color: tagColor(e.key),
                  }))}
                  centerLabel="총액"
                  centerValue={formatKrw(view.totalKrw)}
                  ariaLabel="태그별 비중"
                />
              </Card>
            )}

            {/* 읽기 전용 롤업(태그·통장·인물별) */}
            <RollupCard title="태그별" entries={view.byTag} colored />
            <RollupCard title="통장별" entries={view.byAccount} />
            <RollupCard
              title="인물별"
              entries={view.byProfile.map((e) => ({
                ...e,
                key: PROFILE_LABEL[e.key as EnvelopeProfile] ?? e.key,
              }))}
            />

            {/* 편집 툴바 */}
            {toolbar}

            {/* 항목 목록 — 아내/남편 구분 섹션(전체 항목) */}
            {!hasItems ? (
              <Card>
                <p className="py-6 text-center text-[15px] font-normal leading-[1.5] text-muted">
                  아직 항목이 없어요. 아내·남편 탭에서 추가해 보세요.
                </p>
              </Card>
            ) : (
              <>
                {wifeRows.length > 0 && (
                  <CombinedSection
                    label={PROFILE_LABEL.wife}
                    subtotal={profileSubtotal("wife")}
                    rows={wifeRows}
                    renderRow={renderRow}
                  />
                )}
                {husbandRows.length > 0 && (
                  <CombinedSection
                    label={PROFILE_LABEL.husband}
                    subtotal={profileSubtotal("husband")}
                    rows={husbandRows}
                    renderRow={renderRow}
                  />
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* 프로필 뷰 — 롤업(통장·태그별)을 목록 위로 */}
            <RollupCard title="통장별" entries={view.byAccount} />
            <RollupCard title="태그별" entries={view.byTag} colored />

            {/* 편집 툴바 */}
            {toolbar}

            {/* 항목 목록 */}
            <Card>
              {!hasItems ? (
                <p className="py-6 text-center text-[15px] font-normal leading-[1.5] text-muted">
                  아직 항목이 없어요. 아래에서 추가해 보세요.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {visibleRows.map((row) => (
                    <li key={row.item.id}>{renderRow(row)}</li>
                  ))}
                </ul>
              )}
            </Card>

            {/* 항목 추가 — 편집 모드에서는 숨긴다 */}
            {!bulkEditing && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                + 항목 추가
              </Button>
            )}
          </>
        )}

        {/* 항목 추가·수정 다이얼로그 — open일 때만 렌더링하고 편집 대상 기준 key로
            리마운트해 열 때마다 폼 상태를 새로 초기화한다(GoalForm과 동일 계약). */}
        {formOpen && (
          <EnvelopeItemDialog
            key={editing?.id ?? "new"}
            open
            profile={editing?.profile ?? formProfile}
            initial={
              editing
                ? {
                    tag: editing.tag,
                    account: editing.account,
                    name: editing.name,
                    amountKrw: editing.amountKrw,
                    note: editing.note,
                  }
                : undefined
            }
            tags={tags}
            accounts={accounts}
            onClose={() => setFormOpen(false)}
            onSubmit={(v) =>
              save.mutate(
                { ...v, id: editing?.id, profile: editing?.profile ?? formProfile },
                { onSuccess: () => setFormOpen(false) },
              )
            }
            onDelete={
              editing
                ? () => remove.mutate(editing.id, { onSuccess: () => setFormOpen(false) })
                : undefined
            }
            onAddTag={(value) => addCustom.mutate({ kind: "tag", value })}
            onAddAccount={(value) => addCustom.mutate({ kind: "account", value })}
            submitting={save.isPending}
          />
        )}
      </div>
    </main>
  );
}

interface CombinedSectionProps {
  label: string;
  subtotal: number;
  rows: EnvelopeItemRowData[];
  renderRow: (row: EnvelopeItemRowData) => React.ReactNode;
}

/** 통합 뷰의 인물 섹션 — 헤더(라벨 + 소계) + 항목 목록. */
function CombinedSection({ label, subtotal, rows, renderRow }: CombinedSectionProps) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] font-bold leading-[1.45] tracking-[-0.2px] text-ink">
          {label}
        </h3>
        <span className="text-[15px] font-semibold leading-[1.4] tabular-nums text-ink">
          {formatKrw(subtotal)}
        </span>
      </div>
      <ul className="mt-1 flex flex-col">
        {rows.map((row) => (
          <li key={row.item.id}>{renderRow(row)}</li>
        ))}
      </ul>
    </Card>
  );
}
