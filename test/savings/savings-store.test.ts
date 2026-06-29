import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import * as store from "@/lib/db/local-store";

afterEach(async () => { await db.delete(); await db.open(); });

describe("savings local-store", () => {
  it("새 계좌를 추가하면 카테고리별 sortOrder가 0부터 증가한다", async () => {
    const a = await store.upsertSavings({ category: "DEPOSIT", name: "청약", amount: 100 });
    const b = await store.upsertSavings({ category: "DEPOSIT", name: "적금", amount: 200 });
    const c = await store.upsertSavings({ category: "ETC", name: "보증금", amount: 300 });
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);
    expect(c.sortOrder).toBe(0); // 카테고리별로 독립
    expect(await store.listSavings()).toHaveLength(3);
  });

  it("기존 계좌를 id로 수정하면 sortOrder/생성을 유지하고 값만 바뀐다", async () => {
    const a = await store.upsertSavings({ category: "CHECKING", name: "파킹", amount: 100 });
    const updated = await store.upsertSavings({ id: a.id, amount: 999 });
    expect(updated.id).toBe(a.id);
    expect(updated.amount).toBe(999);
    expect(updated.sortOrder).toBe(a.sortOrder);
    expect(await store.listSavings()).toHaveLength(1);
  });

  it("USD 통화를 보관한다", async () => {
    const a = await store.upsertSavings({
      category: "BOND", name: "미국 국채", amount: 1000, currency: "USD",
    });
    const row = (await store.listSavings()).find((x) => x.id === a.id);
    expect(row?.currency).toBe("USD");
  });

  it("삭제하면 목록에서 빠진다", async () => {
    const a = await store.upsertSavings({ category: "ETC", name: "x", amount: 1 });
    await store.deleteSavings(a.id);
    expect(await store.listSavings()).toHaveLength(0);
  });

  it("편집 모드 일괄 저장은 여러 행 금액을 한 번에 반영한다", async () => {
    const a = await store.upsertSavings({ category: "DEPOSIT", name: "A", amount: 100 });
    const b = await store.upsertSavings({ category: "DEPOSIT", name: "B", amount: 200 });
    await store.bulkUpdateSavings([
      { ...a, amount: 111 },
      { ...b, amount: 222 },
    ]);
    const rows = await store.listSavings();
    expect(rows.find((x) => x.id === a.id)?.amount).toBe(111);
    expect(rows.find((x) => x.id === b.id)?.amount).toBe(222);
  });
});
