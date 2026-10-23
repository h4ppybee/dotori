"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { getSyncConfig } from "@/lib/db/local-store";
import {
  startFirstDevice, prepareConnect, connectExistingDevice, syncNow, disableDeviceSync,
  restartWithNewKey, revealConnectionInfo,
} from "@/lib/device-sync/engine";

export const DEVICE_SYNC_CONFIG_KEY = ["device-sync-config"] as const;

/** 기기 동기화 설정(키는 암호문 그대로). 꺼져 있으면 null. 잠금 상태에서는 비활성. */
export function useDeviceSyncConfig() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: DEVICE_SYNC_CONFIG_KEY,
    enabled: !locked,
    queryFn: async () => (await getSyncConfig()) ?? null,
  });
}

function useInvalidateConfig() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: DEVICE_SYNC_CONFIG_KEY });
}

// 엔진 함수는 throw하지 않고 결과를 돌려준다 — 화면은 결과의 status로 분기한다.
export function useStartFirstDevice() {
  const invalidate = useInvalidateConfig();
  return useMutation({ mutationFn: (deviceName: string) => startFirstDevice({ deviceName }), onSuccess: invalidate });
}

export function usePrepareConnect() {
  return useMutation({ mutationFn: (keyText: string) => prepareConnect(keyText) });
}

export function useConnectDevice() {
  const invalidate = useInvalidateConfig();
  return useMutation({
    mutationFn: (input: { keyText: string; deviceName: string }) => connectExistingDevice(input),
    onSuccess: invalidate,
  });
}

export function useSyncNow() {
  return useMutation({ mutationFn: () => syncNow() });
}

export function useDisableDeviceSync() {
  const invalidate = useInvalidateConfig();
  return useMutation({ mutationFn: () => disableDeviceSync(), onSuccess: invalidate });
}

export function useRestartWithNewKey() {
  const invalidate = useInvalidateConfig();
  return useMutation({ mutationFn: () => restartWithNewKey(), onSuccess: invalidate });
}

export function useRevealConnectionInfo() {
  return useMutation({ mutationFn: () => revealConnectionInfo() });
}
