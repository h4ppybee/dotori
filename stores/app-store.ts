import { create } from "zustand";

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
 * 세션 키(CryptoKey)는 메모리에만 존재하며 절대 영속화하지 않는다. (spec §6)
 */
export const useAppStore = create<AppState>((set) => ({
  locked: true,
  sessionKey: null,
  lastRefreshAt: null,
  unlock: (key) => set({ locked: false, sessionKey: key }),
  lock: () => set({ locked: true, sessionKey: null }),
  setLastRefresh: (t) => set({ lastRefreshAt: t }),
}));
