import type { SavingsCategory } from "@/lib/types";

/**
 * 저축 카테고리 아이콘 (단순 stroke, DESIGN.md 규칙).
 * 예적금=금고, 입출금=카드, 채권=문서, 기타=상자.
 */
export function SavingsCategoryIcon({
  category,
  className = "",
}: {
  category: SavingsCategory;
  className?: string;
}) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
    className,
  };
  const sw = 2;
  if (category === "DEPOSIT") {
    return (
      <svg {...common}>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" stroke="currentColor" strokeWidth={sw} />
        <circle cx="13" cy="12" r="2.5" stroke="currentColor" strokeWidth={sw} />
        <path d="M7 9v6" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  }
  if (category === "CHECKING") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth={sw} />
        <path d="M3 10h18" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        <path d="M7 14.5h4" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  }
  if (category === "BOND") {
    return (
      <svg {...common}>
        <path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
        <path d="M13.5 3.5V8h4.5" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
        <path d="M9 13h6M9 16.5h4" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3.5 8 12 4l8.5 4-8.5 4z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
      <path d="M3.5 8v8l8.5 4 8.5-4V8" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
      <path d="M12 12v8" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}
