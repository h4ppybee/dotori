"use client";

import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { getBiometricConfig } from "@/lib/db/local-store";

export const BIOMETRIC_CONFIG_KEY = ["biometric"] as const;

/** Face ID 등록 여부(단일 행). 잠금 상태에서는 비활성. */
export function useBiometricConfig() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: BIOMETRIC_CONFIG_KEY,
    enabled: !locked,
    queryFn: async () => (await getBiometricConfig()) ?? null,
  });
}
