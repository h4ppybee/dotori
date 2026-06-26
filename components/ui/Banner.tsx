import { type ReactNode } from "react";

interface BannerProps {
  message: string;
  action?: ReactNode;
  className?: string;
}

/**
 * 토스 스타일 경고 배너.
 * 배경 #FFF7E6, 텍스트 경고색 (#9A6700).
 */
export function Banner({ message, action, className = "" }: BannerProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[16px] px-4 py-[14px] ${className}`}
      style={{ backgroundColor: "#FFF7E6" }}
      role="alert"
    >
      <p
        className="flex-1 text-[15px] font-normal leading-[1.5] tracking-[-0.1px]"
        style={{ color: "#9A6700" }}
      >
        {message}
      </p>
      {action != null && (
        <div className="shrink-0" style={{ color: "#9A6700" }}>
          {action}
        </div>
      )}
    </div>
  );
}
