import type { PortfolioVM } from "@/lib/portfolio/portfolio-service";
import type { SavingsVM } from "@/lib/savings/savings-service";
import type { PensionVM } from "@/lib/pension/pension-service";
import type { CoinVM } from "@/lib/coin/coin-service";
import { type DebtVM, debtCategoryLabel } from "@/lib/debt/debt-service";
import { buildEnvelopeView } from "@/lib/envelope/envelope-service";
import { computeNetWorth } from "@/lib/portfolio/net-worth";
import type { EnvelopeItem, EnvelopeProfile } from "@/lib/types";

/**
 * 구글 시트 내보내기 페이로드 순수 빌더. DB·비동기·Date 없이 입력(VM)만으로 탭별 2차원 배열을 만든다.
 * 셀 타입(string/number)이 곧 시트 셀 타입이 된다 — 스크립트가 string은 텍스트 서식으로 쓴다.
 * 금액은 원(KRW), 수익률·금리는 소수(0.12 = 12%), 빈 값은 "".
 * 자산 탭 M~P열(월불입액·이율·만기·상품구분)은 저축·연금 전용 부가 정보다. 시트가 열 위치로
 * 참조하므로 새 열은 항상 맨 뒤에만 추가한다.
 */

export type SheetCell = string | number;
export interface SheetTab {
  name: string;
  rows: SheetCell[][];
}

export const SHEET_TABS = {
  assets: "dotori_자산",
  debts: "dotori_부채",
  envelope: "dotori_통장쪼개기",
  meta: "dotori_meta",
} as const;

const ASSET_HEADER = ["자산군", "구분", "이름", "기관", "코드", "수량", "매수금액", "평가금액", "손익", "수익률", "통화", "섹터·비고", "월불입액", "이율", "만기", "상품구분"];
const DEBT_HEADER = ["구분", "대출명", "금융기관", "잔액", "금리", "월상환액", "만기", "비고"];
const ENVELOPE_HEADER = ["프로필", "태그", "은행", "항목", "금액", "비고"];
const META_HEADER = ["내보낸 시각", "총자산", "총부채", "순자산"];

// 화면 라벨(components/envelope/ProfileSegment)과 동일하게 유지한다.
const PROFILE_LABEL: Record<EnvelopeProfile, string> = { wife: "아내", husband: "남편" };

export interface SheetPayloadInput {
  portfolio: PortfolioVM;
  savings: SavingsVM;
  pension: PensionVM;
  coin: CoinVM;
  debt: DebtVM;
  envelopeItems: EnvelopeItem[];
  /** connectionId → 연결 라벨(증권사). 없으면 "". */
  connectionLabels: Record<string, string>;
  /** 내보낸 시각 표기 문자열(호출부에서 주입). */
  exportedAt: string;
}

/** 저축·연금 외 자산군의 M~P열(월불입액·이율·만기·상품구분) 빈 칸. */
const NO_EXTRA: SheetCell[] = ["", "", "", ""];

function assetRows(input: SheetPayloadInput): SheetCell[][] {
  const stocks = input.portfolio.rows.map((r) => [
    "주식", r.holding.market, r.holding.name, input.connectionLabels[r.holding.connectionId] ?? "",
    r.holding.symbol, r.holding.quantity, r.costKrw, r.valueKrw, r.pnlKrw, r.returnPct / 100,
    r.holding.currency, r.sector, ...NO_EXTRA,
  ]);
  const savings = input.savings.groups.flatMap((g) =>
    g.accounts.map((a) => [
      "저축", g.label, a.name, a.bank ?? "", "", "", "", a.amountKrw, "", "", a.currency ?? "KRW", a.note ?? "",
      a.monthlyDeposit ?? "", a.interestRate != null ? a.interestRate / 100 : "", a.maturityDate ?? "", "",
    ]),
  );
  const pension = input.pension.groups.flatMap((g) =>
    g.accounts.map((a) => [
      "연금", g.label, a.name, a.company ?? "", a.symbol ?? "", a.quantity,
      a.costKrw, a.valueKrw, a.pnlKrw, a.returnPct / 100, "KRW", a.note ?? "",
      "", "", "", a.fundType ?? "",
    ]),
  );
  const coin = input.coin.holdings.map((c) => [
    "코인", "", c.name, c.exchange ?? "", c.market ?? "", c.quantity,
    c.costKrw, c.valueKrw, c.pnlKrw, c.returnPct / 100, "KRW", c.note ?? "", ...NO_EXTRA,
  ]);
  return [ASSET_HEADER, ...stocks, ...savings, ...pension, ...coin];
}

function debtRows(debt: DebtVM): SheetCell[][] {
  const rows = debt.items.map((d) => [
    debtCategoryLabel(d.category), d.name, d.lender ?? "", d.balance,
    d.interestRate != null ? d.interestRate / 100 : "", d.monthlyPayment ?? "",
    d.maturityDate ?? "", d.note ?? "",
  ]);
  return [DEBT_HEADER, ...rows];
}

function envelopeRows(items: EnvelopeItem[]): SheetCell[][] {
  const view = buildEnvelopeView({ items, scope: "combined" });
  const rows = view.rows.map(({ item }) => [
    PROFILE_LABEL[item.profile], item.tag, item.account, item.name, item.amountKrw, item.note ?? "",
  ]);
  return [ENVELOPE_HEADER, ...rows];
}

function metaRows(input: SheetPayloadInput): SheetCell[][] {
  const totalAssets =
    input.portfolio.totalValueKrw + input.savings.totalKrw +
    input.pension.totalValueKrw + input.coin.totalValueKrw;
  const { netWorth } = computeNetWorth(totalAssets, input.debt.totalKrw);
  return [META_HEADER, [input.exportedAt, totalAssets, input.debt.totalKrw, netWorth]];
}

export function buildSheetPayload(input: SheetPayloadInput): SheetTab[] {
  return [
    { name: SHEET_TABS.assets, rows: assetRows(input) },
    { name: SHEET_TABS.debts, rows: debtRows(input.debt) },
    { name: SHEET_TABS.envelope, rows: envelopeRows(input.envelopeItems) },
    { name: SHEET_TABS.meta, rows: metaRows(input) },
  ];
}
