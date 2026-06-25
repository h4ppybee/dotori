"use client";

import { type ReactNode, useEffect } from "react";
import { Button } from "./Button";

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  /** 오른쪽 액션 버튼 텍스트 (없으면 렌더링 안 함) */
  actionLabel?: string;
  /** 오른쪽 액션 버튼 클릭 핸들러 */
  onAction?: () => void;
  /** 오른쪽 액션 버튼 variant (기본 primary) */
  actionVariant?: "primary" | "weak";
}

/**
 * 토스 스타일 모달 다이얼로그.
 * radius-xxl(28px), shadow-floating.
 * 왼쪽 보조 버튼은 항상 "닫기" (UX writing 규칙).
 * ESC 키로도 닫힌다.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  actionLabel,
  onAction,
  actionVariant = "primary",
}: DialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 카드 */}
      <div className="relative z-10 w-full max-w-[360px] bg-surface-card rounded-[28px] p-6 shadow-floating">
        <h2
          id="dialog-title"
          className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-3"
        >
          {title}
        </h2>

        {children != null && (
          <div className="text-[15px] font-normal leading-[1.5] text-body mb-6">
            {children}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <Button variant="weak" onClick={onClose} className="flex-1">
            닫기
          </Button>
          {actionLabel != null && (
            <Button variant={actionVariant} onClick={onAction} className="flex-1">
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
