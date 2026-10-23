import type { Connection, Holding, SavingsAccount, CoinHolding, PensionAccount, Member } from "@/lib/types";
import { emptySyncData, type SyncData } from "@/lib/device-sync/collect";

// 기기 동기화 테스트 공용 가상 행. 실제 이름·금액·코드를 쓰지 않는다(AGENTS.md 개인정보 금지).
export const member = (id: string, name = "나"): Member => ({ id, name });

export const manualConnection = (id: string, memberId: string): Connection => ({
  id, memberId, type: "MANUAL", label: "증권사A", createdAt: 1, updatedAt: 1,
});

export const apiConnection = (id: string, memberId: string): Connection => ({
  id, memberId, type: "TOSS_API", label: "토스", clientId: "test-client", clientSecretEnc: "iv.ct",
  createdAt: 1, updatedAt: 1,
});

export const holding = (id: string, source: "AUTO" | "MANUAL", connectionId: string): Holding => ({
  id, connectionId, market: "KRX", symbol: "000001", name: "종목A", sector: "미분류", currency: "KRW",
  quantity: 10, avgBuyPrice: 10_000, source, updatedAt: 1,
});

export const savings = (id: string, amount: number, source: "AUTO" | "MANUAL" = "MANUAL"): SavingsAccount => ({
  id, category: "CHECKING", name: "파킹통장", bank: "은행A", amount, sortOrder: 0, updatedAt: 1, source,
});

export const coin = (id: string, source: "AUTO" | "MANUAL" = "MANUAL"): CoinHolding => ({
  id, name: "코인A", exchange: "거래소A", quantity: 1, buyPrice: 1_000_000, currentPrice: 1_000_000,
  sortOrder: 0, updatedAt: 1, source,
});

export const pension = (id: string, currentPrice = 10_000): PensionAccount => ({
  id, category: "PERSONAL", name: "연금ETF", symbol: "000002", quantity: 10, buyPrice: 10_000, currentPrice,
  sortOrder: 0, updatedAt: 1,
});

export const syncDataWith = (patch: Partial<SyncData>): SyncData => ({ ...emptySyncData(), ...patch });
