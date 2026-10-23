import { useAppStore } from "@/stores/app-store";
import { saveSheetExportConfig, saveSyncConfig } from "@/lib/db/local-store";
import { generateSyncKey, formatSyncKey, keyIdOf, type SyncKeyBytes } from "@/lib/device-sync/key";
import { collectSyncData, canonicalize, hashCanonical } from "@/lib/device-sync/collect";

export const TEST_WEB_APP_URL = "https://script.google.com/macros/s/test-deployment/exec";
export const TEST_SECRET = "test-secret";

export const makeSessionKey = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]) as Promise<CryptoKey>;

/** 시트 연결만 된 기기(동기화 꺼짐). 잠금 해제 상태로 만든다. */
export async function seedSheetOnly(): Promise<CryptoKey> {
  const sessionKey = await makeSessionKey();
  await saveSheetExportConfig(sessionKey, { webAppUrl: TEST_WEB_APP_URL, secret: TEST_SECRET });
  useAppStore.setState({ locked: false, sessionKey });
  return sessionKey;
}

/** 시트 연결 + 동기화가 켜진 기기. */
export async function seedSyncedDevice(opts: {
  key?: SyncKeyBytes;
  lastRevision?: number;
  lastSyncedHash?: string | null;
  deviceName?: string;
} = {}): Promise<{ sessionKey: CryptoKey; key: SyncKeyBytes }> {
  const sessionKey = await seedSheetOnly();
  const key = opts.key ?? generateSyncKey();
  await saveSyncConfig(sessionKey, {
    syncKeyText: formatSyncKey(key),
    keyId: await keyIdOf(key),
    deviceName: opts.deviceName ?? "이 기기",
    lastRevision: opts.lastRevision ?? 0,
    lastSyncedHash: opts.lastSyncedHash === undefined ? null : opts.lastSyncedHash,
  });
  return { sessionKey, key };
}

export async function localHash(): Promise<string> {
  return hashCanonical(canonicalize(await collectSyncData()));
}
