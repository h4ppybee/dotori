import { create } from "zustand";

interface NavState {
  /** 자산 탭 진입 직전에 보던 메인 탭 경로. 중첩 바 ← 버튼의 복귀 대상. */
  lastMainTabPath: string;
  setLastMainTab: (path: string) => void;
}

export const useNavStore = create<NavState>((set) => ({
  lastMainTabPath: "/",
  setLastMainTab: (path) => set({ lastMainTabPath: path }),
}));
