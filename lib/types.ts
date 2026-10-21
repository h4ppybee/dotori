export type ConnectionType = "TOSS_API" | "UPBIT_API" | "MANUAL";
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
  balanceAsOf?: string;    // 금액 기준일 "YYYY-MM-DD". 금액 변경·자동 증가 시 갱신 — MANUAL
  note?: string;           // 비고
  sortOrder: number;       // 카테고리 내 표시 순서
  updatedAt: number;
  source: HoldingSource;   // "AUTO" | "MANUAL"
  connectionId?: string;   // AUTO 행만: 소속 업비트 연결
}

export type PensionCategory = "PERSONAL" | "RETIREMENT";
// 개인연금 / 퇴직연금

/** 연금 계좌(수동). 평가금/손익은 수량×단가로 파생한다(KRW 고정). */
export interface PensionAccount {
  id: string;
  category: PensionCategory;
  name: string;          // 종목 — 예: "TIGER 미국S&P500"
  symbol?: string;       // KRX 종목코드 — 예: "360750". 토스 시세 자동 갱신에 사용
  company?: string;      // 회사명 — 예: "미래에셋"
  fundType?: string;     // 구분 — ETF/펀드/예적금 등
  quantity: number;      // 수량
  buyPrice: number;      // 매수가(단가) → cost = quantity * buyPrice
  currentPrice: number;  // 현재가(주가) → value = quantity * currentPrice
  note?: string;
  sortOrder: number;
  updatedAt: number;
}

/** 코인 보유(수동). 카테고리 없이 평탄. 평가금/손익은 수량×단가로 파생(KRW 고정). */
export interface CoinHolding {
  id: string;
  name: string;          // 종목 — 예: "비트코인"
  exchange?: string;     // 거래소 — 예: "업비트"
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  note?: string;
  sortOrder: number;
  updatedAt: number;
  source: HoldingSource;   // "AUTO" | "MANUAL"
  connectionId?: string;   // AUTO 행만: 소속 업비트 연결
  market?: string;         // AUTO 행만: "KRW-BTC"
}

export type LoanCategory = "MORTGAGE" | "CREDIT" | "JEONSE" | "CAR" | "STUDENT" | "ETC";
// 주택담보 / 신용 / 전세자금 / 자동차 / 학자금 / 기타

/** 대출(부채, 수동). 잔액은 KRW 고정·양수로 저장. 순자산 = 자산총액 − Σ balance. */
export interface LoanAccount {
  id: string;
  category: LoanCategory;
  name: string;            // 대출명 — 예: "주택담보대출"
  lender?: string;         // 금융기관 — 예: "국민은행"
  balance: number;         // 현재 잔액 (KRW, 양수)
  interestRate?: number;   // 연 금리 (%)
  monthlyPayment?: number; // 월 상환액 (KRW)
  maturityDate?: string;   // 만기 "YYYY-MM-DD"
  note?: string;           // 비고
  sortOrder: number;       // 표시 순서
  updatedAt: number;
}

/** 주식·연금·코인 공용 스냅샷 상세 행 (스냅샷 시점 값 고정, KRW). */
export interface AssetSnapshotRow {
  name: string;       // 종목명
  quantity: number;   // 수량
  costKrw: number;    // 매수금액
  valueKrw: number;   // 스냅샷 시점 평가금액
  pnlKrw: number;     // 손익금액
  returnPct: number;  // 수익률 (%)
}

/** 저축·부채 공용 스냅샷 행. */
export interface AssetSnapshotSimpleRow {
  name: string;
  amountKrw: number;
}

/** 손익 있는 자산군(주식·연금·코인)의 스냅샷 섹션. */
export interface AssetSnapshotPnlSection {
  totalValueKrw: number;
  totalCostKrw: number;
  totalPnlKrw: number;
  returnPct: number;
  rows: AssetSnapshotRow[];
}

/** 금액만 있는 자산군(저축·부채)의 스냅샷 섹션. */
export interface AssetSnapshotAmountSection {
  totalKrw: number;
  rows: AssetSnapshotSimpleRow[];
}

/** 수동 전체 자산 스냅샷 1건 — 버튼 클릭 시점의 상태를 고정 저장(조회 시 재계산 없음). */
export interface AssetSnapshot {
  id: string;              // uuid (key)
  createdAt: number;       // epoch ms — 목록 정렬 기준
  netWorthKrw: number;     // 순자산 = totalAssetsKrw - totalDebtKrw
  totalAssetsKrw: number;  // 주식+저축+연금+코인 평가금 합
  totalDebtKrw: number;    // 부채 잔액 합
  stocks: AssetSnapshotPnlSection;
  pension: AssetSnapshotPnlSection;
  coin: AssetSnapshotPnlSection;
  savings: AssetSnapshotAmountSection;
  debt: AssetSnapshotAmountSection;
}

export interface Settings {
  id: "app";
  kdfSalt: string;
  verifier: string;
  lastSnapshotDate?: string;
  schemaVersion: number;
  privacyAmounts?: boolean;   // 금액 숨기기 ON/OFF. undefined === OFF
  lockType?: "pin" | "passphrase"; // 잠금 수단. undefined === passphrase(기존 데이터)
}

/** 순자산 목표(단일 행). 사용자가 직접 입력 → 백업 대상. */
export interface Goal {
  id: "goal";                 // 고정 키
  targetNetWorthKrw: number;  // 목표 순자산(원, > 0)
  targetDate: string;         // "YYYY-MM-DD"
  createdAt: number;          // epoch ms
}

export type EnvelopeProfile = "wife" | "husband";

/** 통장 쪼개기 라인 항목. 사용자가 직접 입력 → 백업 대상. */
export interface EnvelopeItem {
  id: string;
  profile: EnvelopeProfile;
  tag: string;
  account: string;
  name: string;
  amountKrw: number;   // ≥ 0
  note?: string;
  sortOrder: number;
  createdAt: number;
}

/** 통장 쪼개기 커스텀 태그·은행(단일 행). */
export interface EnvelopeConfig {
  id: "envelope";
  customTags: string[];
  customAccounts: string[];
}

/** 구글 시트 내보내기 설정(단일 행). 기기별 민감 설정 → 백업 제외. */
export interface SheetExportConfig {
  id: "sheet";          // 고정 키
  webAppUrl: string;    // Apps Script 웹앱 URL (…/exec)
  secretEnc: string;    // 공유 비밀키 (세션 키로 암호화, base64)
  updatedAt: number;
}
