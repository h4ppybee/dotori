"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { getBiometricConfig } from "@/lib/db/local-store";
import { isBiometricAvailable } from "@/lib/biometric/webauthn";

export const BIOMETRIC_CONFIG_KEY = ["biometric"] as const;

export const biometricConfigQueryOptions = queryOptions({
  queryKey: BIOMETRIC_CONFIG_KEY,
  queryFn: async () => (await getBiometricConfig()) ?? null,
});

/** Face ID 등록 여부(단일 행). 잠금 상태에서는 비활성. */
export function useBiometricConfig() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({ ...biometricConfigQueryOptions, enabled: !locked });
}

/**
 * 이 기기가 Face ID 잠금 해제를 지원하는지. 기기 특성이라 한 번 읽으면 다시 묻지 않는다(staleTime 무한).
 * 쿼리로 두어 잠금 해제 직후 미리 읽어 두면 설정 화면에서 Face ID 섹션이 늦게 끼어드는 일이 없다.
 */
export const biometricAvailableQueryOptions = queryOptions({
  queryKey: ["biometric-available"] as const,
  staleTime: Infinity,
  queryFn: isBiometricAvailable,
});

export function useBiometricAvailable() {
  return useQuery(biometricAvailableQueryOptions);
}
