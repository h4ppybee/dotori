import type { QueryClient } from "@tanstack/react-query";
import { portfolioQueryOptions } from "@/lib/query/use-portfolio";
import { savingsQueryOptions } from "@/lib/query/use-savings";
import { pensionQueryOptions } from "@/lib/query/use-pension";
import { coinQueryOptions } from "@/lib/query/use-coin";
import { debtQueryOptions } from "@/lib/query/use-debt";
import { goalQueryOptions } from "@/lib/query/use-goal";
import { envelopeItemsQueryOptions, envelopeConfigQueryOptions } from "@/lib/query/use-envelope";
import { assetSnapshotsQueryOptions, RECENT_SNAPSHOT_LIMIT } from "@/lib/query/use-asset-snapshots";
import { settingsQueryOptions } from "@/lib/query/use-settings";
import { biometricConfigQueryOptions, biometricAvailableQueryOptions } from "@/lib/query/use-biometric";
import { sheetExportConfigQueryOptions } from "@/lib/query/use-sheet-export";

/**
 * 잠금 해제 직후 모든 메인 탭이 첫 렌더에 쓰는 쿼리를 한 번에 미리 읽는다.
 * 데이터가 로컬 IndexedDB라 비용이 작고, 덕분에 탭을 처음 열 때도 빈 상태가 한 번 그려졌다가
 * 내용으로 바뀌는 깜박임이 없다. 실패한 조회는 각 화면이 열릴 때 다시 시도하므로 여기서는 삼킨다.
 */
export async function prefetchAppData(queryClient: QueryClient): Promise<void> {
  await Promise.allSettled([
    queryClient.prefetchQuery(portfolioQueryOptions),
    queryClient.prefetchQuery(savingsQueryOptions),
    queryClient.prefetchQuery(pensionQueryOptions),
    queryClient.prefetchQuery(coinQueryOptions),
    queryClient.prefetchQuery(debtQueryOptions),
    queryClient.prefetchQuery(goalQueryOptions),
    queryClient.prefetchQuery(envelopeItemsQueryOptions),
    queryClient.prefetchQuery(envelopeConfigQueryOptions),
    queryClient.prefetchQuery(assetSnapshotsQueryOptions(RECENT_SNAPSHOT_LIMIT)),
    queryClient.prefetchQuery(settingsQueryOptions),
    queryClient.prefetchQuery(biometricConfigQueryOptions),
    queryClient.prefetchQuery(biometricAvailableQueryOptions),
    queryClient.prefetchQuery(sheetExportConfigQueryOptions),
  ]);
}
