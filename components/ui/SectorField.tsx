"use client";

import { useState } from "react";
import { UNCLASSIFIED } from "@/lib/sector/sector-map";

/** 드롭다운에서 "직접 입력"을 의미하는 내부 센티넬 값. */
const CUSTOM = "__custom__";

interface SectorFieldProps {
  value: string;
  onChange: (sector: string) => void;
  /** 드롭다운 후보 섹터 목록 (미분류 제외, 중복 없음). */
  options: string[];
  label?: string;
  inputId?: string;
}

/**
 * 섹터 선택 필드. 드롭다운(알려진 섹터 + 미분류)과 "+ 직접 입력" 모드를 함께 제공한다.
 * 직접 추가 폼과 포트폴리오 섹터 다이얼로그에서 공통으로 쓴다.
 *
 * 호출 측이 종목별로 재마운트하려면 key를 지정해 초기 상태를 리셋한다.
 */
export function SectorField({
  value,
  onChange,
  options,
  label = "섹터",
  inputId = "sector-field",
}: SectorFieldProps) {
  // 현재 값이 목록·미분류에 없으면 사용자 정의 → 직접 입력 모드로 시작.
  const valueIsListed = value === UNCLASSIFIED || options.includes(value);
  const [custom, setCustom] = useState(value !== "" && !valueIsListed);

  const selectValue = custom ? CUSTOM : valueIsListed ? value : UNCLASSIFIED;

  return (
    <div className="flex flex-col gap-[6px]">
      <label
        htmlFor={inputId}
        className="text-[13px] font-semibold leading-[1.45] text-body-soft"
      >
        {label}
      </label>
      <select
        id={inputId}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM) {
            setCustom(true);
            onChange("");
            return;
          }
          setCustom(false);
          onChange(v);
        }}
        className="
          h-[56px] px-4 rounded-[12px]
          bg-surface-soft text-ink
          text-[17px] font-normal leading-[1.5] tracking-[-0.2px]
          border border-hairline
          outline-none
          focus:bg-surface-card focus:border-[1.5px] focus:border-primary
          transition-colors duration-150
          appearance-none cursor-pointer
        "
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value={UNCLASSIFIED}>{UNCLASSIFIED}</option>
        <option value={CUSTOM}>+ 직접 입력</option>
      </select>
      {custom && (
        <input
          type="text"
          value={value}
          placeholder="새 섹터명을 입력하세요"
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          aria-label="새 섹터명"
          className="
            h-[56px] px-4 rounded-[12px]
            bg-surface-soft text-ink
            text-[17px] font-normal leading-[1.5] tracking-[-0.2px]
            border border-hairline
            outline-none
            focus:bg-surface-card focus:border-[1.5px] focus:border-primary
            placeholder:text-muted
            transition-colors duration-150
          "
        />
      )}
    </div>
  );
}
