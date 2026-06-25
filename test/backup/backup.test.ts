import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { upsertConnection, upsertManualHolding } from "@/lib/db/local-store";
import { putSettings } from "@/lib/db/local-store";
import { exportAll, importAll } from "@/lib/backup/backup";

afterEach(async () => { await db.delete(); await db.open(); });

describe("exportAll / importAll", () => {
  it("내보내기 후 DB를 비우고 덮어쓰기로 불러오면 데이터가 동일하게 복원된다", async () => {
    // seed
    await upsertConnection({ memberId: "m1", type: "MANUAL", label: "미래에셋" });
    await upsertManualHolding({ connectionId: "c1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 10, avgBuyPrice: 70000, sector: "반도체" });
    await putSettings({ id: "app", kdfSalt: "salt1", verifier: "ver1", schemaVersion: 1 });

    const json = await exportAll();

    // DB 초기화 후 복원
    await db.delete();
    await db.open();

    await importAll(json, { mode: "overwrite" });

    expect(await db.connections.count()).toBe(1);
    expect(await db.holdings.count()).toBe(1);
    const settings = await db.settings.get("app");
    expect(settings?.kdfSalt).toBe("salt1");
  });

  it("schemaVersion이 다르면 '백업 버전이 호환되지 않아요' 오류를 던진다", async () => {
    const bad = JSON.stringify({ schemaVersion: 999, exportedAt: Date.now(), data: {} });
    await expect(importAll(bad, { mode: "overwrite" })).rejects.toThrow("백업 버전이 호환되지 않아요");
  });

  it("JSON 파싱 실패 시 '백업 파일을 읽을 수 없어요' 오류를 던진다", async () => {
    await expect(importAll("not json", { mode: "overwrite" })).rejects.toThrow("백업 파일을 읽을 수 없어요");
  });

  it("merge 모드는 기존 row를 대체하고 새 row를 추가하며 무관한 row는 유지된다", async () => {
    // 기존 데이터 세팅
    await upsertManualHolding({ id: "h1", connectionId: "c1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 5, avgBuyPrice: 60000, sector: "반도체" });
    await upsertManualHolding({ id: "h2", connectionId: "c1", market: "KOSPI", symbol: "000660",
      name: "SK하이닉스", currency: "KRW", quantity: 3, avgBuyPrice: 100000, sector: "반도체" });

    // 외부 백업: h1을 수정, h3을 추가
    const mergePayload = JSON.stringify({
      schemaVersion: 1,
      exportedAt: Date.now(),
      data: {
        holdings: [
          { id: "h1", connectionId: "c1", market: "KOSPI", symbol: "005930",
            name: "삼성전자", currency: "KRW", quantity: 20, avgBuyPrice: 65000,
            sector: "반도체", source: "MANUAL", updatedAt: Date.now() },
          { id: "h3", connectionId: "c1", market: "KOSPI", symbol: "035420",
            name: "NAVER", currency: "KRW", quantity: 1, avgBuyPrice: 200000,
            sector: "인터넷", source: "MANUAL", updatedAt: Date.now() },
        ],
      },
    });

    await importAll(mergePayload, { mode: "merge" });

    expect(await db.holdings.count()).toBe(3); // h1(updated) + h2(kept) + h3(added)
    const h1 = await db.holdings.get("h1");
    expect(h1?.quantity).toBe(20); // 대체됨
    const h2 = await db.holdings.get("h2");
    expect(h2?.quantity).toBe(3); // 유지됨
    const h3 = await db.holdings.get("h3");
    expect(h3?.name).toBe("NAVER"); // 추가됨
  });
});
