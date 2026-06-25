import { decrypt } from "@/lib/crypto/crypto";
import { getValidToken } from "@/lib/toss/toss-token";
import { db } from "@/lib/db/schema";
import {
  listConnections,
  upsertConnection,
  upsertAutoHolding,
  pruneAutoHoldings,
  listHoldings,
  getPrice,
  putPrice,
  listPrices,
  putFx,
  getFx,
  getSectorOverrides,
} from "@/lib/db/local-store";
import { buildPortfolio, type PortfolioVM } from "@/lib/portfolio/portfolio-service";

interface NormalizedHolding {
  symbol: string;
  name: string;
  market: string;
  currency: "KRW" | "USD";
  quantity: number;
  avgBuyPrice: number;
  dailyPnl?: number;
}

interface RefreshFailure {
  connectionId: string;
  label: string;
  message: string;
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function proxyPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} 실패: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * 401 발생 시 tokenCache를 무효화하고 토큰을 재발급받아 한 번 재시도한다.
 * 재시도 후에도 실패하면 에러를 그대로 던진다.
 */
async function proxyPostWithTokenRetry<T>(
  path: string,
  buildBody: (token: string) => unknown,
  conn: { id: string; clientId: string; clientSecretEnc: string },
  key: CryptoKey,
): Promise<T> {
  const clientSecret = await decrypt(key, conn.clientSecretEnc);
  let token = await getValidToken({
    connectionId: conn.id,
    clientId: conn.clientId,
    clientSecret,
    key,
  });

  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildBody(token)),
  });

  if (res.status !== 401) {
    if (!res.ok) {
      throw new Error(`${path} 실패: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  // 401 → 캐시 무효화 후 토큰 재발급 → 1회 재시도
  await db.tokenCache.delete(conn.id);
  token = await getValidToken({
    connectionId: conn.id,
    clientId: conn.clientId,
    clientSecret,
    key,
  });

  const retry = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildBody(token)),
  });

  if (!retry.ok) {
    throw new Error(`${path} 실패: ${retry.status}`);
  }
  return retry.json() as Promise<T>;
}

/**
 * spec §4-1 갱신 오케스트레이션 (전부 클라이언트 주도, 토스 호출은 프록시 경유).
 * 토큰 → 계좌 → 보유 upsert → 시세(prevClose 이월) → 환율 → 뷰모델.
 * connection 단위 try/catch로 부분 실패를 격리한다 (spec §6).
 */
export async function refreshAll(opts: {
  key: CryptoKey;
  now?: number;
}): Promise<{ vm: PortfolioVM; failures: RefreshFailure[] }> {
  const now = opts.now ?? Date.now();
  const today = dayOf(now);

  const connections = await listConnections();
  const failures: RefreshFailure[] = [];

  // 시세/환율 조회에 재사용할, 인증에 성공한 첫 토스 토큰.
  let priceToken: string | null = null;

  for (const conn of connections) {
    if (conn.type !== "TOSS_API") {
      continue;
    }
    try {
      const clientSecret = await decrypt(opts.key, conn.clientSecretEnc!);
      const token = await getValidToken({
        connectionId: conn.id,
        clientId: conn.clientId!,
        clientSecret,
        key: opts.key,
      });
      const accountsRes = await proxyPost<{ accounts: string[] }>("/api/toss/accounts", { token });
      const accounts: string[] = accountsRes.accounts;
      await upsertConnection({ ...conn, accountSeqs: accounts });

      const seenSymbols: string[] = [];
      for (const accountSeq of accounts) {
        const holdingsRes = await proxyPostWithTokenRetry<{ holdings: NormalizedHolding[] }>(
          "/api/toss/holdings",
          (t) => ({ token: t, accountSeq }),
          { id: conn.id, clientId: conn.clientId!, clientSecretEnc: conn.clientSecretEnc! },
          opts.key,
        );
        const holdings: NormalizedHolding[] = holdingsRes.holdings;
        for (const h of holdings) {
          seenSymbols.push(h.symbol);
          await upsertAutoHolding({
            connectionId: conn.id,
            market: h.market,
            symbol: h.symbol,
            name: h.name,
            sector: "미분류",
            currency: h.currency,
            quantity: h.quantity,
            avgBuyPrice: h.avgBuyPrice,
            manualPrice: undefined,
            tossDailyPnl: h.dailyPnl,
          });
        }
      }
      // 매도되어 이번 응답에 없는 AUTO 행 정리. 성공 경로에서만 수행해
      // 전송 실패 시 데이터가 날아가지 않도록 한다.
      await pruneAutoHoldings(conn.id, seenSymbols);

      // 시세/환율 조회 토큰은 accounts·holdings까지 모두 성공한
      // connection의 토큰만 채택한다.
      if (priceToken === null) {
        priceToken = token;
      }
    } catch (e) {
      failures.push({
        connectionId: conn.id,
        label: conn.label,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 시세: 보유 종목의 distinct {symbol, currency}.
  if (priceToken !== null) {
    try {
      const heldHoldings = await listHoldings();
      const seen = new Set<string>();
      const symbols: { symbol: string; currency: string }[] = [];
      for (const h of heldHoldings) {
        const k = `${h.symbol}|${h.currency}`;
        if (seen.has(k)) {
          continue;
        }
        seen.add(k);
        symbols.push({ symbol: h.symbol, currency: h.currency });
      }

      if (symbols.length > 0) {
        const pricesRes = await proxyPost<{ prices: { symbol: string; currency: "KRW" | "USD"; lastPrice: number }[] }>(
          "/api/toss/prices",
          { token: priceToken, symbols },
        );
        const prices: { symbol: string; currency: "KRW" | "USD"; lastPrice: number }[] =
          pricesRes.prices;
        for (const p of prices) {
          const existing = await getPrice(p.symbol, p.currency);
          const existingDay = existing ? dayOf(existing.asOf) : null;
          const prevClose =
            existing && existingDay !== today ? existing.lastPrice : existing?.prevClose;
          await putPrice({
            symbol: p.symbol,
            currency: p.currency,
            lastPrice: p.lastPrice,
            prevClose,
            asOf: now,
          });
        }
      }
    } catch (e) {
      failures.push({
        connectionId: "prices",
        label: "시세",
        message: e instanceof Error ? e.message : String(e),
      });
    }

    // 환율: 실패해도 기존 환율 유지(치명적 실패로 보지 않음).
    try {
      const fxRes = await proxyPost<{ rate: number }>("/api/toss/exchange-rate", { token: priceToken });
      await putFx({ pair: "USDKRW", rate: fxRes.rate, asOf: now });
    } catch {
      // 기존 fxRate 유지
    }
  }

  const [holdings, prices, fx, sectorOverrides] = await Promise.all([
    listHoldings(),
    listPrices(),
    getFx(),
    getSectorOverrides(),
  ]);

  return {
    vm: buildPortfolio({
      holdings,
      prices,
      fx: fx ? { rate: fx.rate } : undefined,
      sectorOverrides,
    }),
    failures,
  };
}
