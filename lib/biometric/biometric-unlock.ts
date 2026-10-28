import { encrypt, decrypt } from "@/lib/crypto/crypto";
import { getBiometricConfig, saveBiometricConfig, clearBiometricConfig } from "@/lib/db/local-store";
import type { BiometricConfig } from "@/lib/types";
import { derivePrfKey, toB64, fromB64 } from "@/lib/biometric/prf-key";
import { createCredential, getPrfSecret, forgetCredential } from "@/lib/biometric/webauthn";

/** 등록된 PIN/비밀번호 복호화에 실패한 경우(다른 패스키·다른 PRF 값 등). 등록 행을 지우고 재등록을 안내해야 한다. */
export class BiometricInvalidError extends Error {}

const USER_ID_KEY = "dotori.biometricUserId";
const OFFERED_KEY = "dotori.biometricOffered";

// localStorage는 사생활 보호 모드 등에서 throw할 수 있어 모두 try/catch로 감싼다.
function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    // 저장 실패 — 다음에 다시 만들거나 다시 묻는 정도라 무시한다
  }
}

/** 패스키 user.id — 기기마다 고정해 재등록 시 키체인 항목을 덮어쓴다. */
export function getDeviceUserId(): Uint8Array<ArrayBuffer> {
  const saved = lsGet(USER_ID_KEY);
  if (saved) {
    try {
      const decoded = fromB64(saved);
      if (decoded.length === 16) {
        return decoded;
      }
    } catch {
      // 손상된 값 — 아래에서 새로 만든다
    }
  }
  const id = crypto.getRandomValues(new Uint8Array(16));
  lsSet(USER_ID_KEY, toB64(id));
  return id;
}

// 사생활 보호 모드처럼 localStorage에 못 남기는 환경에서도 같은 페이지 세션 안에서는 다시 묻지 않도록 메모리에도 둔다.
let offeredInMemory = false;

export const hasOfferedBiometric = () => offeredInMemory || lsGet(OFFERED_KEY) === "1";
export function markBiometricOffered(): void {
  offeredInMemory = true;
  lsSet(OFFERED_KEY, "1");
}
export function clearBiometricOffered(): void {
  offeredInMemory = false;
  try {
    localStorage.removeItem(OFFERED_KEY);
  } catch {
    // 무시
  }
}

async function save(credentialId: string, salt: Uint8Array<ArrayBuffer>, prf: Uint8Array<ArrayBuffer>, secret: string): Promise<void> {
  const key = await derivePrfKey(prf);
  await saveBiometricConfig({
    credentialId,
    prfSalt: toB64(salt),
    secretEnc: await encrypt(key, secret),
    createdAt: Date.now(),
  });
}

export type EnrollmentResult =
  | { status: "done" }
  | { status: "needs-confirm"; finish: () => Promise<void>; cancel: () => void };

/**
 * Face ID 등록을 시작한다. create 결과에 PRF가 있으면 바로 저장(done)한다.
 * 없으면 사용자 제스처가 이미 소모됐으므로 needs-confirm을 돌려주고,
 * 화면이 "한 번 더 확인해 주세요" 버튼 탭에서 finish()를 부르게 한다.
 * 그 단계를 버리거나 finish가 실패하면 cancel()로 이미 만든 패스키를 정리한다(최선 노력, throw하지 않음).
 */
export async function startEnrollment(secret: string): Promise<EnrollmentResult> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const { credentialId, prf } = await createCredential(salt, getDeviceUserId());
  if (prf) {
    await save(credentialId, salt, prf, secret);
    return { status: "done" };
  }
  return {
    status: "needs-confirm",
    finish: async () => {
      await save(credentialId, salt, await getPrfSecret(credentialId, salt), secret);
    },
    cancel: () => forgetCredential(credentialId),
  };
}

/**
 * Face ID로 저장된 PIN/비밀번호를 꺼낸다. 등록이 없으면 null. 취소는 BiometricCancelledError,
 * 복호화 실패(다른 PRF 값 등)는 BiometricInvalidError로 던진다.
 * cfg를 미리 읽어 넘기면(LockGate가 제스처 보존을 위해 state에 둔 설정) DB 재조회 없이 바로 진행한다.
 */
export async function unlockWithBiometric(cfg?: BiometricConfig): Promise<string | null> {
  const config = cfg ?? (await getBiometricConfig());
  if (!config) {
    return null;
  }
  const prf = await getPrfSecret(config.credentialId, fromB64(config.prfSalt));
  const key = await derivePrfKey(prf);
  try {
    return await decrypt(key, config.secretEnc);
  } catch (e) {
    throw new BiometricInvalidError(e instanceof Error ? e.message : "decrypt failed");
  }
}

export const disableBiometric = () => clearBiometricConfig();
