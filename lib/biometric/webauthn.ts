import { toB64Url, fromB64Url } from "@/lib/biometric/prf-key";

/** 사용자가 취소했거나, 제스처가 없어 거부됐거나, 패스키가 사라진 경우(브라우저가 모두 NotAllowedError로 준다). */
export class BiometricCancelledError extends Error {}
/** 기기·브라우저가 PRF 확장을 지원하지 않는 경우. */
export class BiometricUnsupportedError extends Error {}

// TS lib.dom의 PRF 타입이 버전마다 달라 필요한 모양만 로컬로 정의한다.
interface PrfOutput {
  enabled?: boolean;
  results?: { first?: ArrayBuffer };
}
type PkcStatic = {
  isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
  getClientCapabilities?: () => Promise<Record<string, boolean>>;
  signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void>;
};

const pkc = (): PkcStatic | undefined =>
  (globalThis as { PublicKeyCredential?: PkcStatic }).PublicKeyCredential;

function mapError(e: unknown): never {
  if (e instanceof DOMException && e.name === "NotAllowedError") {
    throw new BiometricCancelledError(e.message);
  }
  throw e;
}

/** Face ID 같은 플랫폼 생체 인증기 + PRF 지원 여부. capabilities API가 없으면 최종 판정은 등록 시 create 결과로 한다. */
export async function isBiometricAvailable(): Promise<boolean> {
  const P = pkc();
  if (!P?.isUserVerifyingPlatformAuthenticatorAvailable || typeof navigator === "undefined" || !navigator.credentials) {
    return false;
  }
  try {
    if (!(await P.isUserVerifyingPlatformAuthenticatorAvailable())) {
      return false;
    }
    if (!P.getClientCapabilities) {
      return true;
    }
    const caps = await P.getClientCapabilities();
    return caps["extension:prf"] !== false;
  } catch {
    return false;
  }
}

/**
 * 플랫폼 패스키를 만든다. user.id는 기기별 고정값이라 다시 등록하면 키체인 항목이 덮어써진다.
 * create 결과에 PRF 값이 있으면 함께 돌려주고(Face ID 1회로 등록 완료), 없으면 prf=null.
 */
export async function createCredential(
  salt: Uint8Array<ArrayBuffer>,
  userId: Uint8Array<ArrayBuffer>,
): Promise<{ credentialId: string; prf: Uint8Array<ArrayBuffer> | null }> {
  const rpId = location.hostname;
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { id: rpId, name: "dotori" },
        user: { id: userId, name: "dotori", displayName: "dotori" },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
        timeout: 60_000,
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential;
  } catch (e) {
    mapError(e);
  }
  const credentialId = toB64Url(new Uint8Array(cred.rawId));
  const prf = (cred.getClientExtensionResults() as { prf?: PrfOutput }).prf;
  if (!prf || prf.enabled === false) {
    void pkc()?.signalUnknownCredential?.({ rpId, credentialId }).catch(() => {});
    throw new BiometricUnsupportedError("PRF not supported");
  }
  return { credentialId, prf: prf.results?.first ? new Uint8Array(prf.results.first) : null };
}

/** Face ID 인증을 거쳐 PRF 32바이트를 받는다. */
export async function getPrfSecret(credentialId: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  let cred: PublicKeyCredential;
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        rpId: location.hostname,
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: fromB64Url(credentialId) }],
        userVerification: "required",
        timeout: 60_000,
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential;
  } catch (e) {
    mapError(e);
  }
  const first = (cred.getClientExtensionResults() as { prf?: PrfOutput }).prf?.results?.first;
  if (!first) {
    throw new BiometricUnsupportedError("PRF result missing");
  }
  return new Uint8Array(first);
}
