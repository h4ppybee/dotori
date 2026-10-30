/** 가계부 금액 숨기기 해제 버튼의 접근성 라벨(월별·분석 화면 공용). */
export const LEDGER_REVEAL_LABEL = "가계부 금액 보기";

/**
 * 가계부 분석 차트 색(DESIGN.md 토큰 값). 지출·남은 돈은 손익이 아니므로 up/down(빨강·파랑)을 쓰지 않는다.
 * 수입 = primary, 저축 = semantic-success, 지출 = semantic-warning.
 */
export const FLOW_COLORS = {
  income: "#A87342",
  saving: "#15803D",
  expense: "#FF9800",
} as const;

/** 카테고리 선 슬롯 색 — donut palette 앞 4색을 슬롯 0~3에 고정 배정한다. */
export const SLOT_COLORS = ["#A87342", "#F04452", "#15803D", "#FF9800"] as const;

/** 차트 보조선·라벨(hairline·muted). */
export const GRID_COLOR = "#F1ECE4";
export const LABEL_COLOR = "#8C8C8C";
