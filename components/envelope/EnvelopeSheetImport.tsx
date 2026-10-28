"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Banner } from "@/components/ui/Banner";
import { useSheetExportConfig } from "@/lib/query/use-sheet-export";
import { useEnvelopeSheetImport } from "@/lib/query/use-envelope";
import type { ImportedEnvelopeItem } from "@/lib/envelope/sheet-import";
import type { EnvelopeProfile } from "@/lib/types";

/**
 * 통장 쪼개기 "시트에서 가져오기". 시트가 원본이고 앱 항목을 통째로 덮어쓴다.
 * 시트 연결(설정 > 시트 내보내기)이 있을 때만 보인다. 먼저 시트를 읽어 개수를 보여주고,
 * 확인을 받은 뒤에만 교체한다(읽기·파싱 실패 시 앱 데이터는 그대로).
 * 화면 제목(heading)을 받아 같은 줄 오른쪽에 버튼을 두고, 결과 문구는 그 아래에 보여준다.
 */
export function EnvelopeSheetImport({ heading }: { heading: ReactNode }) {
  const config = useSheetExportConfig().data;
  const { preview, apply } = useEnvelopeSheetImport();

  const [pending, setPending] = useState<{
    items: ImportedEnvelopeItem[];
    counts: Record<EnvelopeProfile, number>;
  } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  if (!config) {
    return <>{heading}</>;
  }

  async function handleFetch() {
    setMessage(null);
    const r = await preview.mutateAsync();
    if (r.status === "error") {
      setMessage({ kind: "error", text: r.message });
      return;
    }
    setPending({ items: r.items, counts: r.counts });
  }

  async function handleApply() {
    if (!pending) {
      return;
    }
    const count = pending.items.length;
    try {
      await apply.mutateAsync(pending.items);
      setMessage({ kind: "ok", text: `${count}개 항목을 가져왔어요.` });
    } catch {
      setMessage({ kind: "error", text: "가져온 항목을 저장하지 못했어요. 다시 시도해 주세요." });
    }
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {heading}
        <button
          type="button"
          onClick={() => void handleFetch()}
          disabled={preview.isPending}
          className="shrink-0 text-[15px] font-semibold text-primary hover:underline disabled:text-muted disabled:no-underline"
        >
          {preview.isPending ? "시트를 읽는 중이에요" : "시트에서 가져오기"}
        </button>
      </div>

      {message?.kind === "ok" && <Banner message={message.text} />}
      {message?.kind === "error" && (
        <div
          className="rounded-[16px] px-4 py-[14px] text-[15px] leading-[1.5]"
          style={{ backgroundColor: "#FDECEE", color: "#F04452" }}
          role="alert"
        >
          {message.text}
        </div>
      )}

      <Dialog
        open={pending !== null}
        title="지금 항목을 시트 내용으로 바꿀까요?"
        onClose={() => setPending(null)}
        actionLabel={apply.isPending ? "가져오는 중" : "가져오기"}
        onAction={() => void handleApply()}
      >
        {pending && (
          <p>
            아내 {pending.counts.wife}개, 남편 {pending.counts.husband}개를 가져와요. 앱에서 고친 내용은
            시트 내용으로 바뀌어요.
          </p>
        )}
      </Dialog>
    </div>
  );
}
