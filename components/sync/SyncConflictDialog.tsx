"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { resolveConflict, dismissConflict } from "@/lib/device-sync/engine";

/**
 * 기기 동기화 충돌 선택. app/layout.tsx에서 한 번만 마운트하고 app-store.syncConflict를 읽는다.
 * 닫기 = 보류. 같은 원격 revision은 자동 동기화에서 다시 띄우지 않고, 설정의 "지금 동기화하기"나 새 revision이 오면 다시 묻는다.
 * 잠금 상태에서는 그리지 않는다.
 */
export function SyncConflictDialog() {
  const conflict = useAppStore((s) => s.syncConflict);
  const locked = useAppStore((s) => s.locked);
  const [pending, setPending] = useState<"local" | "remote" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (locked || conflict === null) {
    return null;
  }

  async function choose(choice: "local" | "remote") {
    setPending(choice);
    setError(null);
    try {
      const outcome = await resolveConflict(choice);
      if (outcome.status === "error") {
        setError(outcome.message);
      }
    } finally {
      setPending(null);
    }
  }

  const savedAt = Date.parse(conflict.remote.savedAt);
  const when = Number.isNaN(savedAt) ? "" : `${formatDateTime(savedAt)}에 `;

  return (
    <Dialog open title="다른 기기에서 바꾼 내용이 있어요" onClose={dismissConflict}>
      <div className="flex flex-col gap-4">
        <p>
          {conflict.remote.deviceName}에서 {when}저장한 내용이 이 기기 내용과 달라요. 어떤 내용을 쓸지 골라 주세요.
        </p>
        {error != null && (
          <p role="alert" className="text-[13px] leading-[1.45] text-[#F04452]">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={() => void choose("remote")} disabled={pending !== null} className="w-full">
            {pending === "remote" ? "받는 중..." : "다른 기기 내용 받기"}
          </Button>
          <Button variant="secondary" onClick={() => void choose("local")} disabled={pending !== null} className="w-full">
            {pending === "local" ? "올리는 중..." : "이 기기 내용으로 덮기"}
          </Button>
        </div>
        <p className="text-[13px] text-muted leading-[1.45]">닫아도 설정의 &apos;지금 동기화하기&apos;에서 다시 고를 수 있어요.</p>
      </div>
    </Dialog>
  );
}
