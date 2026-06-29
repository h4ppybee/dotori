import { describe, it, expect, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { db } from "@/lib/db/schema";
import { putSettings } from "@/lib/db/local-store";
import { useAppStore } from "@/stores/app-store";
import { usePrivacyAmounts } from "@/lib/query/use-settings";
import { QueryWrapper } from "@/test/utils/query";

afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
});

describe("usePrivacyAmounts", () => {
  it("Settings가 없으면 false를 반환한다", async () => {
    useAppStore.setState({ locked: false });
    const { result } = renderHook(() => usePrivacyAmounts(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("privacyAmounts=true면 true를 반환한다", async () => {
    await putSettings({ id: "app", kdfSalt: "s", verifier: "v", schemaVersion: 1, privacyAmounts: true });
    useAppStore.setState({ locked: false });
    const { result } = renderHook(() => usePrivacyAmounts(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("잠금 상태에서는 쿼리가 비활성이라 false를 반환한다", async () => {
    await putSettings({ id: "app", kdfSalt: "s", verifier: "v", schemaVersion: 1, privacyAmounts: true });
    useAppStore.setState({ locked: true });
    const { result } = renderHook(() => usePrivacyAmounts(), { wrapper: QueryWrapper });
    // enabled:false → 데이터 미조회 → 기본 false 유지
    await waitFor(() => expect(result.current).toBe(false));
  });
});
