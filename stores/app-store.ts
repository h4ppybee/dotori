import { create } from "zustand";
import { persist } from "zustand/middleware";
import { saveSession, clearSession, AUTO_LOCK_MS } from "@/lib/db/session-vault";
import type { SyncRemoteMeta } from "@/lib/types";

/** 마지막 시트 내보내기 결과. 자동(통합 갱신)·수동(설정) 모두 여기에 기록한다. */
export interface SheetExportStatus {
  at: number;
  status: "ok" | "error";
  message?: string;
}

/** 마지막 기기 동기화 결과. 받기·올리기·충돌 해소 모두 여기에 기록한다(lib/device-sync/engine). */
export interface DeviceSyncStatus {
  at: number;
  status: "ok" | "error" | "conflict";
  message?: string;
  remote?: SyncRemoteMeta; // 서버에 마지막으로 저장된 버전의 출처(설정 패널 "출처 기기")
}

/** 충돌 다이얼로그 표시용(비영속). */
export interface SyncConflictState {
  remote: SyncRemoteMeta;
}

interface AppState {
  locked: boolean;
  sessionKey: CryptoKey | null;
  lastRefreshAt: number | null;
  lastSheetExport: SheetExportStatus | null;
  amountsRevealed: boolean; // 금액 숨기기 ON일 때 한 번 탭하면 전체 노출(세션 한정)
  unlock: (key: CryptoKey) => void;
  lock: () => void;
  setLastRefresh: (t: number) => void;
  setLastSheetExport: (s: SheetExportStatus) => void;
  clearLastSheetExport: () => void;
  revealAmounts: () => void;
  lastDeviceSync: DeviceSyncStatus | null;
  syncConflict: SyncConflictState | null;
  setLastDeviceSync: (s: DeviceSyncStatus) => void;
  clearLastDeviceSync: () => void;
  setSyncConflict: (c: SyncConflictState | null) => void;
}

/**
 * 패스프레이즈 잠금 상태 + 세션 키 + 마지막 갱신 시각.
 *
 * 세션 키(CryptoKey)는 기본적으로 메모리에만 둔다. 자동 잠금을 위해 비추출 키를
 * 만료시각과 함께 세션 볼트(IndexedDB)에 두지만, 원본 키 바이트는 영속화되지 않는다.
 * (lib/db/session-vault.ts, spec §6)
 *
 * `lastRefreshAt`·`lastSheetExport`·`lastDeviceSync`만 localStorage에 영속화한다(`persist` + `partialize`). 시세 자체는
 * IndexedDB에 저장돼 새로고침 후에도 유지되므로, 마지막 갱신 시각을 함께 복원해야
 * "마지막 갱신 HH:MM" 표시와 10분 자동 갱신 판단이 정상 동작한다. 잠금 상태·세션 키
 * 등 민감/휘발 상태는 저장하지 않는다.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      locked: true,
      sessionKey: null,
      lastRefreshAt: null,
      lastSheetExport: null,
      amountsRevealed: false,
      lastDeviceSync: null,
      syncConflict: null,
      unlock: (key) => {
        set({ locked: false, sessionKey: key });
        // 자동 잠금용 세션 영속화 (fire-and-forget). 잠금 해제 = 활동으로 보고 만료시각을 연장한다.
        void saveSession(key, Date.now() + AUTO_LOCK_MS);
      },
      lock: () => {
        // 잠그면 금액 노출도 다시 가리고, 충돌 다이얼로그도 닫는다.
        set({ locked: true, sessionKey: null, amountsRevealed: false, syncConflict: null });
        void clearSession();
      },
      setLastRefresh: (t) => set({ lastRefreshAt: t }),
      setLastSheetExport: (s) => set({ lastSheetExport: s }),
      // 연결 해제·전체 삭제 등으로 설정이 사라졌을 때, 이전 성공/실패 기록이 남아있지 않게 지운다.
      clearLastSheetExport: () => set({ lastSheetExport: null }),
      revealAmounts: () => set({ amountsRevealed: true }),
      setLastDeviceSync: (s) => set({ lastDeviceSync: s }),
      // 동기화를 끄거나 전체 삭제했을 때 지난 기록이 남지 않게 지운다.
      clearLastDeviceSync: () => set({ lastDeviceSync: null }),
      setSyncConflict: (c) => set({ syncConflict: c }),
    }),
    {
      name: "dotori-app",
      // 마지막 갱신 시각·마지막 시트 내보내기 결과·마지막 기기 동기화 결과만 저장한다. 잠금·세션 키·금액 노출은 매 세션 초기화한다.
      partialize: (state) => ({
        lastRefreshAt: state.lastRefreshAt,
        lastSheetExport: state.lastSheetExport,
        lastDeviceSync: state.lastDeviceSync,
      }),
    },
  ),
);
