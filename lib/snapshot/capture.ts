import {
  listHoldings, listPrices, getFx, getSectorOverrides,
  listSavings, listPension, listCoin, listDebts, addAssetSnapshot,
} from "@/lib/db/local-store";
import { buildPortfolio } from "@/lib/portfolio/portfolio-service";
import { buildSavingsVM } from "@/lib/savings/savings-service";
import { buildPensionVM } from "@/lib/pension/pension-service";
import { buildCoinVM } from "@/lib/coin/coin-service";
import { buildDebtVM } from "@/lib/debt/debt-service";
import { buildAssetSnapshot } from "@/lib/snapshot/asset-snapshot";
import type { AssetSnapshot } from "@/lib/types";

/**
 * 현재 DB 상태를 화면과 동일한 빌더(VM 5종)로 계산해 스냅샷 1건으로 저장한다.
 * id·createdAt은 호출부에서 주입한다(순수 빌더와의 경계 유지).
 */
export async function captureAssetSnapshot(meta: {
  id: string;
  createdAt: number;
}): Promise<AssetSnapshot> {
  const [holdings, prices, fx, sectorOverrides, savings, pension, coin, debts] =
    await Promise.all([
      listHoldings(), listPrices(), getFx(), getSectorOverrides(),
      listSavings(), listPension(), listCoin(), listDebts(),
    ]);
  const snapshot = buildAssetSnapshot({
    id: meta.id,
    createdAt: meta.createdAt,
    portfolio: buildPortfolio({
      holdings, prices,
      fx: fx ? { rate: fx.rate } : undefined,
      sectorOverrides,
    }),
    savings: buildSavingsVM(savings, fx?.rate),
    pension: buildPensionVM(pension),
    coin: buildCoinVM(coin),
    debt: buildDebtVM(debts),
  });
  await addAssetSnapshot(snapshot);
  return snapshot;
}
