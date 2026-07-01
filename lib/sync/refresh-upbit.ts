import { upbitEndpoint } from "@/lib/upbit/relay-endpoint";
import { normalizeUpbitAccounts, type RawUpbitAccount } from "@/lib/upbit/normalize";
import { decrypt } from "@/lib/crypto/crypto";
import type { RefreshFailure } from "@/lib/sync/refresh";
import {
  listConnections,
  upsertAutoCoin,
  pruneAutoCoins,
  upsertAutoSavings,
  pruneAutoSavings,
} from "@/lib/db/local-store";

// 번들 경계: 이 파일은 클라이언트 코드다. node:crypto를 쓰는 upbit-client/upbit-jwt는
// 절대 import하지 않는다. 서명·API 호출은 프록시(upbitEndpoint) 서버측에서 수행한다.

export interface UpbitRefreshResult {
  updated: number;
  failures: RefreshFailure[];
}

async function proxyPost<T>(path: string, body: unknown): Promise<T> {
  const { url, headers } = upbitEndpoint(path);
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    throw new Error(`upbit proxy ${path} ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * 업비트 갱신 오케스트레이션. 마켓 이름 → connection별 계좌 → 코인/예수금 upsert·prune.
 * prune 정책: /accounts 조회가 성공한 경우에만 prune한다(catch로 빠지면 보유 보존).
 * 시세(tickers)·이름(markets) 조회 실패는 prune에 영향을 주지 않는다.
 */
export async function refreshUpbit(opts: { key: CryptoKey }): Promise<UpbitRefreshResult> {
  const failures: RefreshFailure[] = [];
  let updated = 0;
  const conns = (await listConnections()).filter(
    (c) => c.type === "UPBIT_API" && c.clientId && c.clientSecretEnc,
  );
  if (conns.length === 0) {
    return { updated, failures };
  }

  // 마켓 한글명. 실패하면 currency 코드로 폴백(normalize가 처리).
  let names: Record<string, string> = {};
  try {
    names = (await proxyPost<{ names: Record<string, string> }>("/markets", {})).names;
  } catch {
    // 이름 없으면 currency 코드로 폴백
  }

  for (const conn of conns) {
    try {
      const secretKey = await decrypt(opts.key, conn.clientSecretEnc!);
      const { rows } = await proxyPost<{ rows: RawUpbitAccount[] }>("/accounts", {
        accessKey: conn.clientId,
        secretKey,
      });

      const markets = [
        ...new Set(
          rows
            .map((r) => r.currency)
            .filter((c): c is string => !!c && c !== "KRW")
            .map((c) => `KRW-${c}`),
        ),
      ];

      // 시세 실패 → currentPrice undefined → upsert가 기존값 유지, prune은 계속 수행.
      let prices: Record<string, number> = {};
      try {
        prices = (await proxyPost<{ prices: Record<string, number> }>("/tickers", { markets })).prices;
      } catch {
        // 시세 없이 진행
      }

      const { coins, cash } = normalizeUpbitAccounts(rows, names, prices);
      for (const c of coins) {
        await upsertAutoCoin({
          connectionId: conn.id,
          market: c.market,
          name: c.name,
          quantity: c.quantity,
          buyPrice: c.avgBuyPrice,
          currentPrice: c.currentPrice,
        });
      }
      // /accounts 성공 경로에서만 prune.
      await pruneAutoCoins(conn.id, coins.map((c) => c.market));
      if (cash) {
        await upsertAutoSavings({ connectionId: conn.id, amount: cash.amount });
      } else {
        await pruneAutoSavings(conn.id);
      }
      updated += 1;
    } catch (e) {
      failures.push({
        connectionId: conn.id,
        label: conn.label,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { updated, failures };
}
