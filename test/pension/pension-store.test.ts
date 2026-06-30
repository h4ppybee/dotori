import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import * as store from "@/lib/db/local-store";

afterEach(async () => { await db.delete(); await db.open(); });

describe("pension local-store", () => {
  it("카테고리별 sortOrder가 0부터 증가한다", async () => {
    const a = await store.upsertPension({ category: "PERSONAL", name: "A", quantity: 1, buyPrice: 1, currentPrice: 1 });
    const b = await store.upsertPension({ category: "PERSONAL", name: "B", quantity: 1, buyPrice: 1, currentPrice: 1 });
    const c = await store.upsertPension({ category: "RETIREMENT", name: "C", quantity: 1, buyPrice: 1, currentPrice: 1 });
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);
    expect(c.sortOrder).toBe(0);
    expect(await store.listPension()).toHaveLength(3);
  });

  it("id로 수정하면 sortOrder를 유지하고 현재가만 바꾼다", async () => {
    const a = await store.upsertPension({ category: "PERSONAL", name: "A", quantity: 1, buyPrice: 1, currentPrice: 1 });
    const u = await store.upsertPension({ id: a.id, currentPrice: 99 });
    expect(u.id).toBe(a.id);
    expect(u.currentPrice).toBe(99);
    expect(u.sortOrder).toBe(a.sortOrder);
  });

  it("일괄 저장은 여러 행 현재가를 한 번에 반영한다", async () => {
    const a = await store.upsertPension({ category: "PERSONAL", name: "A", quantity: 1, buyPrice: 1, currentPrice: 1 });
    const b = await store.upsertPension({ category: "PERSONAL", name: "B", quantity: 1, buyPrice: 1, currentPrice: 1 });
    await store.bulkUpdatePension([{ ...a, currentPrice: 11 }, { ...b, currentPrice: 22 }]);
    const rows = await store.listPension();
    expect(rows.find((x) => x.id === a.id)?.currentPrice).toBe(11);
    expect(rows.find((x) => x.id === b.id)?.currentPrice).toBe(22);
  });
});

describe("coin local-store", () => {
  it("sortOrder가 0부터 증가하고 삭제된다", async () => {
    const a = await store.upsertCoin({ name: "비트코인", quantity: 0.02, buyPrice: 1, currentPrice: 1 });
    const b = await store.upsertCoin({ name: "이더리움", quantity: 1, buyPrice: 1, currentPrice: 1 });
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);
    await store.deleteCoin(a.id);
    expect(await store.listCoin()).toHaveLength(1);
  });

  it("일괄 저장으로 현재가를 반영한다", async () => {
    const a = await store.upsertCoin({ name: "비트코인", quantity: 1, buyPrice: 1, currentPrice: 1 });
    await store.bulkUpdateCoin([{ ...a, currentPrice: 50 }]);
    expect((await store.listCoin())[0].currentPrice).toBe(50);
  });
});
