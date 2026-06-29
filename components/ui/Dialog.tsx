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
    // 열려 있는 동안 배경(body) 스크롤을 잠근다.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-4"
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

      {/* 카드 — 화면보다 길면 내부만 스크롤되고 제목·버튼은 고정 */}
      <div className="relative z-10 flex max-h-[calc(100dvh-32px)] w-full max-w-[360px] flex-col bg-surface-card rounded-[28px] shadow-floating">
        <h2
          id="dialog-title"
          className="shrink-0 px-6 pt-6 pb-3 text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink"
        >
          {title}
        </h2>

        {children != null && (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 text-[15px] font-normal leading-[1.5] text-body">
            {children}
          </div>
        )}

        <div className="flex shrink-0 gap-2 px-6 pb-6 pt-4">
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
