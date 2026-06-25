import { db } from "@/lib/db/schema";
import { getSettings, putSettings } from "@/lib/db/local-store";
import type { PortfolioVM } from "@/lib/portfolio/portfolio-service";

export async function saveDailySnapshotIfNeeded(vm: PortfolioVM, today: string): Promise<boolean> {
  const settings = await getSettings();
  if (settings?.lastSnapshotDate === today) {
    return false;
  }
  await db.snapshots.put({
    date: today,
    totalCostKrw: vm.totalCostKrw,
    totalValueKrw: vm.totalValueKrw,
    totalPnlKrw: vm.totalPnlKrw,
    returnPct: vm.returnPct,
    bySectorJson: JSON.stringify(vm.bySector),
    byHoldingJson: JSON.stringify(vm.byHolding),
  });
  if (settings) {
    await putSettings({ ...settings, lastSnapshotDate: today });
  }
  return true;
}
