import { create } from "zustand";
import { saveSession, clearSession, AUTO_LOCK_MS } from "@/lib/db/session-vault";

interface AppState {
  locked: boolean;
  sessionKey: CryptoKey | null;
  lastRefreshAt: number | null;
  unlock: (key: CryptoKey) => void;
  lock: () => void;
  setLastRefresh: (t: number) => void;
}

/**
 * 패스프레이즈 잠금 상태 + 세션 키 + 마지막 갱신 시각.
 *
 * 세션 키(CryptoKey)는 기본적으로 메모리에만 둔다. 자동 잠금을 위해 비추출 키를
 * 만료시각과 함께 세션 볼트(IndexedDB)에 두지만, 원본 키 바이트는 영속화되지 않는다.
 * (lib/db/session-vault.ts, spec §6)
 */
export const useAppStore = create<AppState>((set) => ({
  locked: true,
  sessionKey: null,
  lastRefreshAt: null,
  unlock: (key) => {
    set({ locked: false, sessionKey: key });
    // 자동 잠금용 세션 영속화 (fire-and-forget). 잠금 해제 = 활동으로 보고 만료시각을 연장한다.
    void saveSession(key, Date.now() + AUTO_LOCK_MS);
  },
  lock: () => {
    set({ locked: true, sessionKey: null });
    void clearSession();
  },
  setLastRefresh: (t) => set({ lastRefreshAt: t }),
}));
