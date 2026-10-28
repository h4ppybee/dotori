import { vi } from "vitest";

export interface FakeOptions {
  available?: boolean;              // 플랫폼 UV 인증기 유무
  prfCapability?: boolean | null;   // getClientCapabilities의 extension:prf (null이면 API 없음)
  prfOnCreate?: "results" | "enabled-only" | "disabled";
  prfSecret?: Uint8Array;           // get/create가 돌려줄 PRF 값
  failGetWith?: string;             // 지정 시 get이 이 이름의 DOMException으로 실패
}

/** navigator.credentials·PublicKeyCredential을 가짜로 바꾼다. 반환값으로 호출 기록을 본다. */
export function installFakeWebAuthn(opts: FakeOptions = {}) {
  const secret = opts.prfSecret ?? new Uint8Array(32).fill(9);
  const rawId = new Uint8Array([1, 2, 3, 4]).buffer;
  const create = vi.fn(async (_o?: CredentialCreationOptions) => ({
    rawId,
    getClientExtensionResults: () => {
      if (opts.prfOnCreate === "disabled") {
        return { prf: { enabled: false } };
      }
      if (opts.prfOnCreate === "enabled-only") {
        return { prf: { enabled: true } };
      }
      return { prf: { enabled: true, results: { first: secret.buffer.slice(0) } } };
    },
  }));
  const get = vi.fn(async (_o?: CredentialRequestOptions) => {
    if (opts.failGetWith) {
      throw new DOMException("fail", opts.failGetWith);
    }
    return { rawId, getClientExtensionResults: () => ({ prf: { results: { first: secret.buffer.slice(0) } } }) };
  });
  const PKC = {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(async () => opts.available ?? true),
    getClientCapabilities: opts.prfCapability === null
      ? undefined
      : vi.fn(async () => ({ "extension:prf": opts.prfCapability ?? true })),
    signalUnknownCredential: vi.fn(async () => {}),
  };
  vi.stubGlobal("PublicKeyCredential", PKC);
  Object.defineProperty(navigator, "credentials", { value: { create, get }, configurable: true });
  return { create, get, PKC };
}

export function uninstallFakeWebAuthn() {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "credentials", { value: undefined, configurable: true });
}
