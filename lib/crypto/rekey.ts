import { encrypt, decrypt } from "@/lib/crypto/crypto";
import { db } from "@/lib/db/schema";

/**
 * 패스프레이즈 변경 시 볼트의 모든 암호화된 값을 새 키로 재암호화한다.
 *
 * - db.connections: clientSecretEnc가 있는 행 전부 재암호화.
 * - db.tokenCache: accessTokenEnc 재암호화. 복호화 실패 시(stale) 행 삭제.
 * - db.sheetExport: secretEnc 재암호화(설정이 있을 때만). 복호화·암호화 실패 시(stale)
 *   행 삭제 — 사용자가 설정에서 다시 연결하면 된다.
 * 실패 시 전체를 중단하지 않는다 — tokenCache·sheetExport는 최선 노력(best-effort).
 */
export async function rekeyVault(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
  await rekeyConnections(oldKey, newKey);
  await rekeyTokenCache(oldKey, newKey);
  await rekeySheetExport(oldKey, newKey);
}

async function rekeyConnections(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
  const conns = await db.connections.toArray();
  for (const conn of conns) {
    if (!conn.clientSecretEnc) {
      continue;
    }
    const plain = await decrypt(oldKey, conn.clientSecretEnc);
    const reEncrypted = await encrypt(newKey, plain);
    await db.connections.update(conn.id, { clientSecretEnc: reEncrypted });
  }
}

async function rekeyTokenCache(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
  const tokens = await db.tokenCache.toArray();
  for (const token of tokens) {
    try {
      const plain = await decrypt(oldKey, token.accessTokenEnc);
      const reEncrypted = await encrypt(newKey, plain);
      await db.tokenCache.update(token.connectionId, { accessTokenEnc: reEncrypted });
    } catch {
      // stale 토큰 — 복호화 불가 → 행 삭제
      await db.tokenCache.delete(token.connectionId);
    }
  }
}

async function rekeySheetExport(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
  const cfg = await db.sheetExport.get("sheet");
  if (!cfg) {
    return;
  }
  try {
    const plain = await decrypt(oldKey, cfg.secretEnc);
    await db.sheetExport.update("sheet", { secretEnc: await encrypt(newKey, plain) });
  } catch {
    // stale 설정 — 복호화(또는 재암호화) 불가 → 행 삭제(사용자가 다시 연결하면 된다)
    await db.sheetExport.delete("sheet");
  }
}
