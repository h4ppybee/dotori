import {
  getSheetExportConfig, listHoldings, listPrices, getFx, getSectorOverrides,
  listSavings, listPension, listCoin, listDebts, listEnvelopeItems, listConnections,
} from "@/lib/db/local-store";
import { decrypt } from "@/lib/crypto/crypto";
import { buildPortfolio } from "@/lib/portfolio/portfolio-service";
import { buildSavingsVM } from "@/lib/savings/savings-service";
import { buildPensionVM } from "@/lib/pension/pension-service";
import { buildCoinVM } from "@/lib/coin/coin-service";
import { buildDebtVM } from "@/lib/debt/debt-service";
import { buildSheetPayload } from "@/lib/sheet-export/build-payload";
import { postSheetExport, type SheetExportResult } from "@/lib/sheet-export/client";
import { formatDateTime } from "@/lib/format";

export const SHEET_SECRET_DECRYPT_MESSAGE = "비밀키를 읽지 못했어요. 설정에서 시트 연결을 다시 저장해 주세요.";

export type SheetExportOutcome = { status: "skipped" } | SheetExportResult;

/**
 * 현재 DB 상태를 화면과 같은 빌더(VM 5종 + 통장 쪼개기)로 계산해 구글 시트로 보낸다.
 * 설정이 없으면 skipped. 어떤 실패도 throw하지 않고 { status: "error" }로 돌려준다
 * (자동 내보내기는 fire-and-forget이라 호출부가 예외를 받을 곳이 없다).
 */
export async function exportToSheet(input: {
  key: CryptoKey;
  now: number;
  fetchImpl?: typeof fetch;
}): Promise<SheetExportOutcome> {
  try {
    const config = await getSheetExportConfig();
    if (!config) {
      return { status: "skipped" };
    }

    let secret: string;
    try {
      secret = await decrypt(input.key, config.secretEnc);
    } catch {
      return { status: "error", message: SHEET_SECRET_DECRYPT_MESSAGE };
    }

    const [holdings, prices, fx, sectorOverrides, savings, pension, coin, debts, envelopeItems, connections] =
      await Promise.all([
        listHoldings(), listPrices(), getFx(), getSectorOverrides(),
        listSavings(), listPension(), listCoin(), listDebts(), listEnvelopeItems(), listConnections(),
      ]);

    const tabs = buildSheetPayload({
      portfolio: buildPortfolio({
        holdings, prices,
        fx: fx ? { rate: fx.rate } : undefined,
        sectorOverrides,
      }),
      savings: buildSavingsVM(savings, fx?.rate),
      pension: buildPensionVM(pension),
      coin: buildCoinVM(coin),
      debt: buildDebtVM(debts),
      envelopeItems,
      connectionLabels: Object.fromEntries(connections.map((c) => [c.id, c.label])),
      exportedAt: formatDateTime(input.now),
    });

    return await postSheetExport(config.webAppUrl, { version: 1, secret, tabs }, { fetchImpl: input.fetchImpl });
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "시트 내보내기 중 문제가 생겼어요.",
    };
  }
}
