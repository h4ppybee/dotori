export type ConnectionType = "TOSS_API" | "MANUAL";
export type HoldingSource = "AUTO" | "MANUAL";
export type Currency = "KRW" | "USD";

export interface Member { id: string; name: string; }

export interface Connection {
  id: string;
  memberId: string;
  type: ConnectionType;
  label: string;
  clientId?: string;
  clientSecretEnc?: string;   // Web Crypto ciphertext (base64)
  accountSeqs?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TokenCache {
  connectionId: string;       // key
  accessTokenEnc: string;
  expiresAt: number;
}

export interface Holding {
  id: string;
  connectionId: string;
  market: string;
  symbol: string;
  name: string;
  sector: string;             // "미분류" when unknown
  currency: Currency;
  quantity: number;
  avgBuyPrice: number;        // in the holding's own currency
  source: HoldingSource;
  updatedAt: number;
  manualPrice?: number;       // MANUAL fallback current price
  manualPriceAsOf?: number;
  tossDailyPnl?: number;      // AUTO 일간 손익 (보유 종목 자체 통화), refresh 플로우가 toss dailyProfitLoss로 채움
}

export interface PriceCache {
  key: string;                // `${symbol}|${currency}`
  symbol: string;
  currency: Currency;
  lastPrice: number;
  prevClose?: number;
  asOf: number;
}

export interface FxRate { pair: "USDKRW"; rate: number; asOf: number; }

export interface DailySnapshot {
  date: string;               // "YYYY-MM-DD" (key)
  totalCostKrw: number;
  totalValueKrw: number;
  totalPnlKrw: number;
  returnPct: number;
  bySectorJson: string;
  byHoldingJson: string;
}

export type SavingsCategory = "DEPOSIT" | "CHECKING" | "BOND" | "ETC";
// 예적금 / 입출금(파킹) / 채권 / 기타

export interface SavingsAccount {
  id: string;
  category: SavingsCategory;
  name: string;            // 내용(계좌명) — 예: "뚜니 청년도약"
  bank?: string;           // 은행 — 예: "우리"
  amount: number;          // 총 금액 (currency 기준 통화)
  currency?: Currency;     // 통화. undefined === "KRW"(기본). 모든 카테고리에서 KRW/USD 선택 가능
  interestRate?: number;   // 이율 (%) — DEPOSIT/CHECKING/BOND
  maturityDate?: string;   // 만기 "YYYY-MM-DD" — DEPOSIT/BOND
  monthlyDeposit?: number; // 월 불입액 (KRW) — DEPOSIT
  note?: string;           // 비고
  sortOrder: number;       // 카테고리 내 표시 순서
  updatedAt: number;
}

export interface Settings {
  id: "app";
  kdfSalt: string;
  verifier: string;
  lastSnapshotDate?: string;
  schemaVersion: number;
  privacyAmounts?: boolean;   // 금액 숨기기 ON/OFF. undefined === OFF
}
