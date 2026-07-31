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

  const { save, remove, addCustom } = useEnvelopeMutations();

  // 다이얼로그 상태 — 열림 여부 + 편집 대상(null이면 신규 추가).
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnvelopeItem | null>(null);

  const isCombined = scope === "combined";
  // 추가·편집은 항상 실제 프로필에서만 일어난다(통합 뷰엔 편집할 행이 없음).
  const formProfile: EnvelopeProfile = isCombined ? "wife" : scope;

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pt-6 pb-28 flex flex-col gap-4">
        {/* 헤딩 */}
        <h1 className="text-[22px] font-bold leading-[1.3] tracking-[-0.3px] text-ink">
          통장 쪼개기
        </h1>

        {/* 프로필 세그먼트 */}
        <ProfileSegment value={scope} onChange={setScope} />

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
            {/* 통합 뷰 — 읽기 전용 롤업(태그·통장·인물별) */}
            <RollupCard title="태그별" entries={view.byTag} colored />
            <RollupCard title="통장별" entries={view.byAccount} />
            <RollupCard
              title="인물별"
              entries={view.byProfile.map((e) => ({
                ...e,
                key: e.key === "wife" ? "아내" : "남편",
              }))}
            />
          </>
        ) : (
          <>
            {/* 프로필 뷰 — 태그 비중 도넛(항목이 있을 때만) */}
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

            {/* 항목 목록 */}
            <Card>
              {view.rows.length === 0 ? (
                <p className="py-6 text-center text-[15px] font-normal leading-[1.5] text-muted">
                  아직 항목이 없어요. 아래에서 추가해 보세요.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {view.rows.map((row) => (
                    <li key={row.item.id}>
                      <EnvelopeItemRow
                        row={row}
                        onEdit={() => {
                          setEditing(row.item);
                          setFormOpen(true);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* 항목 추가 */}
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

            {/* 롤업(통장·태그별) */}
            <RollupCard title="통장별" entries={view.byAccount} />
            <RollupCard title="태그별" entries={view.byTag} colored />
          </>
        )}

        {/* 항목 추가·수정 다이얼로그 — open일 때만 렌더링하고 편집 대상 기준 key로
            리마운트해 열 때마다 폼 상태를 새로 초기화한다(GoalForm과 동일 계약). */}
        {formOpen && (
          <EnvelopeItemDialog
            key={editing?.id ?? "new"}
            open
            profile={formProfile}
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
                { ...v, id: editing?.id, profile: formProfile },
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
