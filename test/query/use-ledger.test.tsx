import { describe, it, expect, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/lib/db/schema";
import { saveLedgerMemo } from "@/lib/db/local-store";
import { useAppStore } from "@/stores/app-store";
import { useLedgerMonths, useLedgerMutations } from "@/lib/query/use-ledger";
import { QueryWrapper } from "@/test/utils/query";

afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null, lastRefreshAt: null });
});

function useLedger() {
  return { months: useLedgerMonths(), mutations: useLedgerMutations() };
}

describe("use-ledger", () => {
  it("전체 달을 월 오름차순으로 읽는다", async () => {
    await saveLedgerMemo("2026-10", "b");
    await saveLedgerMemo("2026-09", "a");
    useAppStore.setState({ locked: false });
    const { result } = renderHook(() => useLedgerMonths(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current.data?.map((r) => r.id)).toEqual(["2026-09", "2026-10"]));
  });

  it("잠금 상태에서는 조회하지 않는다", async () => {
    await saveLedgerMemo("2026-10", "b");
    useAppStore.setState({ locked: true });
    const { result } = renderHook(() => useLedgerMonths(), { wrapper: QueryWrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("금액·메모 저장 후 목록이 다시 읽힌다", async () => {
    useAppStore.setState({ locked: false });
    const { result } = renderHook(() => useLedger(), { wrapper: QueryWrapper });
    await waitFor(() => expect(result.current.months.data).toEqual([]));

    await act(() => result.current.mutations.saveAmounts.mutateAsync({ month: "2026-10", amounts: { "income.salary": 1_000_000 } }));
    await waitFor(() => expect(result.current.months.data?.[0]?.amounts).toEqual({ "income.salary": 1_000_000 }));

    await act(() => result.current.mutations.saveMemo.mutateAsync({ month: "2026-10", memo: "회고" }));
    await waitFor(() => expect(result.current.months.data?.[0]?.memo).toBe("회고"));
    expect(result.current.months.data?.[0]?.amounts).toEqual({ "income.salary": 1_000_000 });
  });
});
