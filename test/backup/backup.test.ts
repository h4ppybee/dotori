import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { upsertConnection, upsertManualHolding } from "@/lib/db/local-store";
import { putSettings } from "@/lib/db/local-store";
import { putPrice, putFx } from "@/lib/db/local-store";
import { exportAll, importAll } from "@/lib/backup/backup";

afterEach(async () => { await db.delete(); await db.open(); });

const makeSnap = (id: string, createdAt: number) => ({
  id, createdAt, netWorthKrw: 0, totalAssetsKrw: 0, totalDebtKrw: 0,
  stocks: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
  pension: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
  coin: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
  savings: { totalKrw: 0, rows: [] },
  debt: { totalKrw: 0, rows: [] },
});

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
    // settings는 백업에서 제외되므로 복원되지 않는다
    expect(await db.settings.get("app")).toBeUndefined();
  });

  it("export는 API 연결·AUTO 행·priceCache·fxRates·settings를 제외한다", async () => {
    // API 설정
    await upsertConnection({ id: "api1", memberId: "m1", type: "TOSS_API", label: "토스",
      clientId: "cid", clientSecretEnc: "enc" });
    // 수동 연결 + 수동 보유
    await upsertConnection({ id: "man1", memberId: "m1", type: "MANUAL", label: "미래에셋" });
    await upsertManualHolding({ id: "h1", connectionId: "man1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 10, avgBuyPrice: 70000, sector: "반도체" });
    // AUTO 보유
    await db.holdings.put({ id: "hAuto", connectionId: "api1", market: "KOSPI", symbol: "000660",
      name: "SK하이닉스", sector: "반도체", currency: "KRW", quantity: 5, avgBuyPrice: 100000,
      source: "AUTO", updatedAt: 1 });
    // AUTO 저축/코인
    await db.savings.put({ id: "sAuto", category: "CHECKING", name: "업비트 원화", amount: 100,
      sortOrder: 0, updatedAt: 1, source: "AUTO", connectionId: "api1" });
    await db.coin.put({ id: "cAuto", name: "비트코인", quantity: 1, buyPrice: 1, currentPrice: 1,
      sortOrder: 0, updatedAt: 1, source: "AUTO", connectionId: "api1" });
    // 캐시 + settings
    await putPrice({ symbol: "005930", currency: "KRW", lastPrice: 71000, asOf: 1 });
    await putFx({ pair: "USDKRW", rate: 1300, asOf: 1 });
    await putSettings({ id: "app", kdfSalt: "salt1", verifier: "ver1", schemaVersion: 1 });

    const parsed = JSON.parse(await exportAll()) as {
      schemaVersion: number;
      data: Record<string, unknown[] | undefined>;
    };

    expect(parsed.schemaVersion).toBe(8);
    expect((parsed.data.connections as { id: string }[]).map((c) => c.id)).toEqual(["man1"]);
    expect((parsed.data.holdings as { id: string }[]).map((h) => h.id)).toEqual(["h1"]);
    expect(parsed.data.savings).toEqual([]);
    expect(parsed.data.coin).toEqual([]);
    expect(parsed.data.priceCache).toBeUndefined();
    expect(parsed.data.fxRates).toBeUndefined();
    expect(parsed.data.settings).toBeUndefined();
  });

  it("저축·연금·코인도 내보내고 덮어쓰기로 복원된다 (schemaVersion 5)", async () => {
    await db.savings.put({ id: "s1", category: "DEPOSIT", name: "청약", amount: 1000, sortOrder: 0, updatedAt: 1, source: "MANUAL" });
    await db.pension.put({ id: "p1", category: "PERSONAL", name: "TIGER", symbol: "360750", quantity: 10, buyPrice: 100, currentPrice: 110, sortOrder: 0, updatedAt: 1 });
    await db.coin.put({ id: "c1", name: "비트코인", quantity: 0.02, buyPrice: 100, currentPrice: 80, sortOrder: 0, updatedAt: 1, source: "MANUAL" });
    await db.debts.put({ id: "d1", category: "MORTGAGE", name: "주택담보대출", lender: "국민", balance: 120_000_000, interestRate: 3.5, monthlyPayment: 700_000, sortOrder: 0, updatedAt: 1 });

    const json = await exportAll();
    expect(JSON.parse(json).schemaVersion).toBe(8);

    await db.delete();
    await db.open();
    await importAll(json, { mode: "overwrite" });

    expect(await db.savings.count()).toBe(1);
    expect((await db.pension.get("p1"))?.symbol).toBe("360750");
    expect((await db.coin.get("c1"))?.currentPrice).toBe(80);
    expect(await db.debts.count()).toBe(1);
    expect((await db.debts.get("d1"))?.balance).toBe(120_000_000);
  });

  it("저축·연금·코인이 없는 구버전(v1) 백업도 오류 없이 불러온다", async () => {
    const v1 = JSON.stringify({ schemaVersion: 1, exportedAt: Date.now(), data: { holdings: [] } });
    await importAll(v1, { mode: "overwrite" });
    expect(await db.savings.count()).toBe(0);
    expect(await db.pension.count()).toBe(0);
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

  it("내보내기 결과에 tokenCache는 포함하지 않는다 (휘발성 토큰은 백업 대상이 아님)", async () => {
    await db.tokenCache.put({ connectionId: "c1", accessTokenEnc: "enc", expiresAt: Date.now() + 3_600_000 });

    const json = await exportAll();
    const parsed = JSON.parse(json) as { data: { tokenCache?: unknown[] } };

    expect(parsed.data.tokenCache).toBeUndefined();
  });

  it("tokenCache가 들어있는 (구버전) 백업을 불러와도 tokenCache는 복원하지 않는다", async () => {
    const payload = JSON.stringify({
      schemaVersion: 1,
      exportedAt: Date.now(),
      data: {
        tokenCache: [
          { connectionId: "c1", accessTokenEnc: "stale", expiresAt: Date.now() + 3_600_000 },
        ],
      },
    });

    await importAll(payload, { mode: "overwrite" });
    expect(await db.tokenCache.count()).toBe(0);

    await importAll(payload, { mode: "merge" });
    expect(await db.tokenCache.count()).toBe(0);
  });

  it("overwrite는 API 연결·AUTO 행·priceCache를 보존하고 MANUAL 행만 교체한다", async () => {
    await upsertConnection({ id: "api1", memberId: "m1", type: "UPBIT_API", label: "업비트",
      clientId: "cid", clientSecretEnc: "enc" });
    await db.holdings.put({ id: "hAuto", connectionId: "api1", market: "KOSPI", symbol: "000660",
      name: "SK하이닉스", sector: "반도체", currency: "KRW", quantity: 5, avgBuyPrice: 100000,
      source: "AUTO", updatedAt: 1 });
    await putPrice({ symbol: "005930", currency: "KRW", lastPrice: 71000, asOf: 1 });
    await upsertManualHolding({ id: "hOld", connectionId: "man1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 1, avgBuyPrice: 1, sector: "반도체" });

    const backup = JSON.stringify({
      schemaVersion: 4, exportedAt: 1,
      data: { holdings: [
        { id: "hNew", connectionId: "man2", market: "KOSPI", symbol: "035420", name: "NAVER",
          sector: "인터넷", currency: "KRW", quantity: 2, avgBuyPrice: 200000, source: "MANUAL", updatedAt: 1 },
      ] },
    });

    await importAll(backup, { mode: "overwrite" });

    expect(await db.connections.get("api1")).toBeDefined();
    expect(await db.holdings.get("hAuto")).toBeDefined();
    expect(await db.priceCache.count()).toBe(1);
    expect(await db.holdings.get("hOld")).toBeUndefined();
    expect(await db.holdings.get("hNew")).toBeDefined();
  });

  it("구버전 백업의 API 연결·AUTO 행·settings는 import에서 무시된다", async () => {
    const legacy = JSON.stringify({
      schemaVersion: 3, exportedAt: 1,
      data: {
        connections: [
          { id: "api1", memberId: "m1", type: "TOSS_API", label: "토스", clientSecretEnc: "enc",
            createdAt: 1, updatedAt: 1 },
          { id: "man1", memberId: "m1", type: "MANUAL", label: "미래에셋", createdAt: 1, updatedAt: 1 },
        ],
        holdings: [
          { id: "hAuto", connectionId: "api1", market: "KOSPI", symbol: "000660", name: "SK하이닉스",
            sector: "반도체", currency: "KRW", quantity: 5, avgBuyPrice: 100000, source: "AUTO", updatedAt: 1 },
        ],
        priceCache: [{ key: "005930|KRW", symbol: "005930", currency: "KRW", lastPrice: 1, asOf: 1 }],
        fxRates: [{ pair: "USDKRW", rate: 1300, asOf: 1 }],
        settings: [{ id: "app", kdfSalt: "backupSalt", verifier: "v", schemaVersion: 1 }],
      },
    });

    await importAll(legacy, { mode: "overwrite" });

    expect(await db.connections.get("man1")).toBeDefined();
    expect(await db.connections.get("api1")).toBeUndefined();
    expect(await db.holdings.count()).toBe(0);
    expect(await db.priceCache.count()).toBe(0);
    expect(await db.fxRates.count()).toBe(0);
    expect(await db.settings.get("app")).toBeUndefined();
  });

  it("merge도 구버전 백업의 API 연결·AUTO 행·settings를 무시하고 MANUAL만 병합한다", async () => {
    // 기존(유지되어야 할) 수동 데이터
    await upsertManualHolding({ id: "hKeep", connectionId: "man1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 1, avgBuyPrice: 1, sector: "반도체" });

    const legacy = JSON.stringify({
      schemaVersion: 3, exportedAt: 1,
      data: {
        connections: [
          { id: "api1", memberId: "m1", type: "TOSS_API", label: "토스", clientSecretEnc: "enc",
            createdAt: 1, updatedAt: 1 },
          { id: "man2", memberId: "m1", type: "MANUAL", label: "미래에셋", createdAt: 1, updatedAt: 1 },
        ],
        holdings: [
          { id: "hAuto", connectionId: "api1", market: "KOSPI", symbol: "000660", name: "SK하이닉스",
            sector: "반도체", currency: "KRW", quantity: 5, avgBuyPrice: 100000, source: "AUTO", updatedAt: 1 },
          { id: "hManual", connectionId: "man2", market: "KOSPI", symbol: "035420", name: "NAVER",
            sector: "인터넷", currency: "KRW", quantity: 2, avgBuyPrice: 200000, source: "MANUAL", updatedAt: 1 },
        ],
        settings: [{ id: "app", kdfSalt: "backupSalt", verifier: "v", schemaVersion: 1 }],
      },
    });

    await importAll(legacy, { mode: "merge" });

    // 기존 수동 데이터 유지 + 새 MANUAL 병합, API/AUTO/settings 무시
    expect(await db.holdings.get("hKeep")).toBeDefined();
    expect(await db.holdings.get("hManual")).toBeDefined();
    expect(await db.holdings.get("hAuto")).toBeUndefined();
    expect(await db.connections.get("man2")).toBeDefined();
    expect(await db.connections.get("api1")).toBeUndefined();
    expect(await db.settings.get("app")).toBeUndefined();
  });

  it("assetSnapshots를 export/import 라운드트립한다", async () => {
    await db.assetSnapshots.put({ ...makeSnap("s1", 10), savings: { totalKrw: 100, rows: [{ name: "예금", amountKrw: 100 }] } });
    const json = await exportAll();
    await db.delete(); await db.open();
    await importAll(json, { mode: "merge" });
    const got = await db.assetSnapshots.get("s1");
    expect(got?.savings.rows[0].name).toBe("예금");
  });

  it("overwrite 모드는 기존 assetSnapshots를 지우고 백업본으로 교체한다", async () => {
    await db.assetSnapshots.put(makeSnap("old", 1));
    const json = JSON.stringify({
      schemaVersion: 5, exportedAt: 1,
      data: { assetSnapshots: [makeSnap("new", 2)] },
    });
    await importAll(json, { mode: "overwrite" });
    expect(await db.assetSnapshots.get("old")).toBeUndefined();
    expect(await db.assetSnapshots.get("new")).toBeDefined();
  });

  it("assetSnapshots 없는 v4 백업도 불러온다", async () => {
    const json = JSON.stringify({ schemaVersion: 4, exportedAt: 1, data: {} });
    await expect(importAll(json, { mode: "merge" })).resolves.toBeUndefined();
  });

  it("goal을 export/import 라운드트립한다", async () => {
    await db.goal.put({ id: "goal", targetNetWorthKrw: 100_000_000, targetDate: "2027-01-01", createdAt: 1 });
    const json = await exportAll();
    await db.goal.clear();
    await importAll(json, { mode: "overwrite" });
    const restored = await db.goal.get("goal");
    expect(restored?.targetNetWorthKrw).toBe(100_000_000);
  });

  it("envelope 항목·config를 export/import 라운드트립한다", async () => {
    await db.envelopeItems.put({ id: "e1", profile: "wife", tag: "저축", account: "신한", name: "청년도약", amountKrw: 700_000, sortOrder: 0, createdAt: 1 });
    await db.envelopeConfig.put({ id: "envelope", customTags: ["경조사"], customAccounts: ["카카오뱅크"] });
    const json = await exportAll();
    await db.envelopeItems.clear();
    await db.envelopeConfig.clear();
    await importAll(json, { mode: "overwrite" });
    expect((await db.envelopeItems.get("e1"))?.amountKrw).toBe(700_000);
    expect((await db.envelopeConfig.get("envelope"))?.customTags).toEqual(["경조사"]);
  });

  it("가계부(ledgerMonths)를 export/import 라운드트립한다 (schemaVersion 8)", async () => {
    await db.ledgerMonths.put({ id: "2026-10", amounts: { "income.salary": 3_000_000 }, memo: "회고", updatedAt: 1 });
    const json = await exportAll();
    const parsed = JSON.parse(json) as { schemaVersion: number; data: { ledgerMonths?: unknown[] } };
    expect(parsed.schemaVersion).toBe(8);
    expect(parsed.data.ledgerMonths).toHaveLength(1);

    await db.ledgerMonths.clear();
    await importAll(json, { mode: "overwrite" });
    const row = await db.ledgerMonths.get("2026-10");
    expect(row?.amounts["income.salary"]).toBe(3_000_000);
    expect(row?.memo).toBe("회고");
  });

  it("ledgerMonths 없는 v7 백업도 불러온다 — overwrite는 가계부를 비우고 merge는 유지한다", async () => {
    const v7 = JSON.stringify({ schemaVersion: 7, exportedAt: 1, data: {} });
    await db.ledgerMonths.put({ id: "2026-10", amounts: {}, memo: "유지", updatedAt: 1 });

    await importAll(v7, { mode: "merge" });
    expect(await db.ledgerMonths.get("2026-10")).toBeDefined();

    await importAll(v7, { mode: "overwrite" });
    expect(await db.ledgerMonths.count()).toBe(0);
  });

  it("시트 내보내기 설정은 백업에 포함되지 않고, 덮어쓰기 불러오기 후에도 유지된다", async () => {
    await db.sheetExport.put({
      id: "sheet", webAppUrl: "https://script.google.com/macros/s/x/exec",
      secretEnc: "iv.ciphertext-marker", updatedAt: 1,
    });
    const json = await exportAll();
    expect(json).not.toContain("ciphertext-marker");
    expect(json).not.toContain("sheetExport");

    await importAll(json, { mode: "overwrite" });
    expect((await db.sheetExport.get("sheet"))?.secretEnc).toBe("iv.ciphertext-marker");
  });

  it("Face ID 등록(biometric)은 백업에 포함되지 않고, 덮어쓰기 불러오기 후에도 유지된다", async () => {
    await db.biometric.put({
      id: "biometric", credentialId: "cred-marker", prfSalt: "salt",
      secretEnc: "iv.ciphertext-marker", createdAt: 1,
    });
    const json = await exportAll();
    expect(json).not.toContain("ciphertext-marker");
    expect(json).not.toContain("biometric");

    await importAll(json, { mode: "overwrite" });
    expect((await db.biometric.get("biometric"))?.secretEnc).toBe("iv.ciphertext-marker");
  });
});
