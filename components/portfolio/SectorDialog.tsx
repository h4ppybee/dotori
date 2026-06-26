"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { SectorField } from "@/components/ui/SectorField";

interface SectorDialogProps {
  /** 종목명 (다이얼로그 제목 보조). */
  name: string;
  /** 현재 섹터 (초기 선택값). */
  currentSector: string;
  /** 드롭다운 후보 섹터 목록 (미분류 제외, 중복 없음). */
  options: string[];
  onClose: () => void;
  onSave: (sector: string) => void;
}

/**
 * 보유 종목의 섹터를 설정하는 다이얼로그.
 * 종목별로 재마운트(key)해 초기 상태를 리셋하는 것을 전제로 한다.
 */
export function SectorDialog({
  name,
  currentSector,
  options,
  onClose,
  onSave,
}: SectorDialogProps) {
  const [sector, setSector] = useState(currentSector);

  return (
    <Dialog
      open
      title={`${name} 섹터 설정`}
      onClose={onClose}
      actionLabel="저장"
      onAction={() => onSave(sector)}
    >
      <SectorField
        inputId="sector-dialog-field"
        value={sector}
        onChange={setSector}
        options={options}
      />
    </Dialog>
  );
}
