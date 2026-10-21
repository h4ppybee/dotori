"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import {
  getSheetExportConfig, saveSheetExportConfig, clearSheetExportConfig,
} from "@/lib/db/local-store";
import { exportToSheet, type SheetExportOutcome } from "@/lib/sheet-export/export";
import { isValidWebAppUrl } from "@/lib/sheet-export/client";

export const SHEET_EXPORT_CONFIG_KEY = ["sheet-export-config"] as const;

/** 시트 내보내기 설정(웹앱 URL·암호화된 비밀키). 미설정이면 null. 잠금 상태에서는 비활성. */
export function useSheetExportConfig() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: SHEET_EXPORT_CONFIG_KEY,
    enabled: !locked,
    queryFn: async () => (await getSheetExportConfig()) ?? null,
  });
}

/**
 * 내보내기 실행 + 결과를 app-store에 기록(자동·수동 공용 단일 원천). skipped는 기록하지 않는다.
 * exportToSheet가 throw하지 않으므로 fire-and-forget으로 호출해도 안전하다.
 */
export async function runSheetExport(key: CryptoKey): Promise<SheetExportOutcome> {
  const outcome = await exportToSheet({ key, now: Date.now() });
  if (outcome.status === "skipped") {
    return outcome;
  }
  useAppStore.getState().setLastSheetExport(
    outcome.status === "ok"
      ? { at: Date.now(), status: "ok" }
      : { at: Date.now(), status: "error", message: outcome.message },
  );
  return outcome;
}

export function useSaveSheetExportConfig() {
  const sessionKey = useAppStore((s) => s.sessionKey);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { webAppUrl: string; secret: string }) => {
      if (sessionKey === null) {
        throw new Error("잠금 해제 후 저장할 수 있어요.");
      }
      if (!isValidWebAppUrl(input.webAppUrl)) {
        throw new Error("웹앱 URL 형식이 아니에요. /exec로 끝나는 배포 URL을 넣어 주세요.");
      }
      if (input.secret.length === 0) {
        throw new Error("비밀키를 입력해 주세요.");
      }
      await saveSheetExportConfig(sessionKey, input);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SHEET_EXPORT_CONFIG_KEY }),
  });
}

export function useClearSheetExportConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearSheetExportConfig(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SHEET_EXPORT_CONFIG_KEY }),
  });
}

/** 설정 화면의 '지금 내보내기'. */
export function useSheetExportNow() {
  const sessionKey = useAppStore((s) => s.sessionKey);
  return useMutation({
    mutationFn: async () => {
      if (sessionKey === null) {
        throw new Error("잠금 해제 후 내보낼 수 있어요.");
      }
      return runSheetExport(sessionKey);
    },
  });
}
