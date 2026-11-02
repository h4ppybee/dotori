import { getSheetExportConfig } from "@/lib/db/local-store";
import { decrypt } from "@/lib/crypto/crypto";
import { postSheetRead } from "@/lib/sheet-export/client";
import { SHEET_SECRET_DECRYPT_MESSAGE } from "@/lib/sheet-export/export";
import { parseEnvelopeSheet, type ImportedEnvelopeItem } from "@/lib/envelope/sheet-import";
import type { EnvelopeProfile } from "@/lib/types";

export const SHEET_NOT_CONNECTED_MESSAGE = "설정에서 시트를 먼저 연결해 주세요.";

export type EnvelopeSheetImportResult =
  | { status: "ok"; items: ImportedEnvelopeItem[]; counts: Record<EnvelopeProfile, number> }
  | { status: "error"; message: string };

/**
 * 시트 내보내기와 같은 웹앱·비밀키로 통장쪼개기 원본 탭을 읽어 항목으로 파싱한다.
 * 적용(덮어쓰기)은 하지 않는다 — 호출부가 개수를 보여주고 확인받은 뒤 replaceEnvelopeItems로 반영한다.
 * 어떤 실패도 throw하지 않고 { status: "error" }로 돌려준다.
 */
export async function importEnvelopeFromSheet(input: {
  key: CryptoKey;
  fetchImpl?: typeof fetch;
}): Promise<EnvelopeSheetImportResult> {
  try {
    const config = await getSheetExportConfig();
    if (!config) {
      return { status: "error", message: SHEET_NOT_CONNECTED_MESSAGE };
    }

    let secret: string;
    try {
      secret = await decrypt(input.key, config.secretEnc);
    } catch {
      return { status: "error", message: SHEET_SECRET_DECRYPT_MESSAGE };
    }

    const read = await postSheetRead(
      config.webAppUrl,
      { version: 1, secret, action: "readEnvelope" },
      { fetchImpl: input.fetchImpl },
    );
    if (read.status === "error") {
      return read;
    }

    const parsed = parseEnvelopeSheet(read.values);
    if (!parsed.ok) {
      return { status: "error", message: parsed.message };
    }
    const counts: Record<EnvelopeProfile, number> = { wife: 0, husband: 0 };
    for (const item of parsed.items) {
      counts[item.profile]++;
    }
    return { status: "ok", items: parsed.items, counts };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "시트에서 가져오는 중 문제가 생겼어요.",
    };
  }
}
