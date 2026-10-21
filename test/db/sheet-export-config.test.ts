import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { deriveKey, decrypt, makeSalt } from "@/lib/crypto/crypto";
import {
  getSheetExportConfig, saveSheetExportConfig, clearSheetExportConfig,
} from "@/lib/db/local-store";

afterEach(async () => { await db.delete(); await db.open(); });

const WEB_APP_URL = "https://script.google.com/macros/s/AKfy-abc_123/exec";

describe("sheetExport 설정", () => {
  it("저장 전에는 undefined", async () => {
    expect(await getSheetExportConfig()).toBeUndefined();
  });

  it("비밀키를 암호화해 저장하고 복호화할 수 있다", async () => {
    const key = await deriveKey("pp", makeSalt());
    await saveSheetExportConfig(key, { webAppUrl: WEB_APP_URL, secret: "s3cret" });
    const cfg = await getSheetExportConfig();
    expect(cfg?.webAppUrl).toBe(WEB_APP_URL);
    expect(cfg?.secretEnc).not.toContain("s3cret");
    expect(await decrypt(key, cfg!.secretEnc)).toBe("s3cret");
  });

  it("다시 저장하면 덮어쓰고, 해제하면 지운다", async () => {
    const key = await deriveKey("pp", makeSalt());
    await saveSheetExportConfig(key, { webAppUrl: WEB_APP_URL, secret: "a" });
    await saveSheetExportConfig(key, { webAppUrl: WEB_APP_URL, secret: "b" });
    expect(await db.sheetExport.count()).toBe(1);
    expect(await decrypt(key, (await getSheetExportConfig())!.secretEnc)).toBe("b");
    await clearSheetExportConfig();
    expect(await getSheetExportConfig()).toBeUndefined();
  });
});
