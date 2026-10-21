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

// 진행 중인 내보내기 Promise(모듈 스코프 단일 슬롯). 자동(갱신 직후)·수동("지금 내보내기")이
// 겹쳐 호출돼도 같은 요청을 공유하게 한다 — 동시에 두 번 POST하면 시트 Apps Script의
// LockService가 뒤 요청을 BUSY로 튕기므로, 애초에 겹치지 않게 막는다.
let inflight: Promise<SheetExportOutcome> | null = null;

/**
 * 내보내기 실행 + 결과를 app-store에 기록(자동·수동 공용 단일 원천).
 * skipped(설정 없음)면 이전 기록을 지운다 — 연결을 해제했는데 지난 실패 배너가 남아있지 않게.
 * 이미 진행 중인 호출이 있으면 새로 시작하지 않고 그 결과를 함께 기다린다(single-flight).
 * exportToSheet가 throw하지 않으므로 fire-and-forget으로 호출해도 안전하다.
 */
export async function runSheetExport(key: CryptoKey): Promise<SheetExportOutcome> {
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    try {
      const outcome = await exportToSheet({ key, now: Date.now() });
      if (outcome.status === "skipped") {
        useAppStore.getState().clearLastSheetExport();
        return outcome;
      }
      useAppStore.getState().setLastSheetExport(
        outcome.status === "ok"
          ? { at: Date.now(), status: "ok" }
          : { at: Date.now(), status: "error", message: outcome.message },
      );
      return outcome;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHEET_EXPORT_CONFIG_KEY });
      // 연결을 해제했으니 지난 성공/실패 기록도 함께 지운다(stale 배너 방지).
      useAppStore.getState().clearLastSheetExport();
    },
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
