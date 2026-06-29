"use client";

import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { getSettings } from "@/lib/db/local-store";

export const SETTINGS_KEY = ["settings"] as const;

/** 앱 설정(Settings)을 로컬 DB에서 읽는다. 잠금 상태에서는 비활성. */
export function useSettings() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: SETTINGS_KEY,
    enabled: !locked,
    queryFn: () => getSettings(),
  });
}

/** 금액 숨기기 플래그만 반환하는 편의 훅. 미설정/잠금 시 false. */
export function usePrivacyAmounts(): boolean {
  const { data } = useSettings();
  return data?.privacyAmounts ?? false;
}
