"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Switch } from "@/components/ui/Switch";
import { useSettings } from "@/lib/query/use-settings";
import { useBiometricConfig, BIOMETRIC_CONFIG_KEY } from "@/lib/query/use-biometric";
import { deriveKey, checkVerifier } from "@/lib/crypto/crypto";
import { isBiometricAvailable, BiometricCancelledError, BiometricUnsupportedError } from "@/lib/biometric/webauthn";
import { startEnrollment, disableBiometric, markBiometricOffered } from "@/lib/biometric/biometric-unlock";

/**
 * 설정 — Face ID로 잠금 해제 켜기/끄기.
 * 켤 때는 iOS 사용자 제스처를 지키려고 두 단계로 나눈다: 1단계 "PIN 확인"은 현재 PIN/비밀번호를
 * verifier로만 검증하고, 2단계 "Face ID 켜기" 탭에서 await 없이 바로 startEnrollment를 호출한다.
 * 지원하지 않는 기기에서는 렌더링하지 않는다. (lib/biometric)
 */
export function BiometricPanel() {
  const [supported, setSupported] = useState(false);
  const { data: settings } = useSettings();
  const { data: config } = useBiometricConfig();
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);

  const [asking, setAsking] = useState(false);
  const [secret, setSecret] = useState("");
  const [verified, setVerified] = useState(false);
  const [finish, setFinish] = useState<(() => Promise<void>) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isPinLock = settings?.lockType === "pin";
  const enabled = config != null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isBiometricAvailable();
      if (!cancelled) {
        setSupported(ok);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!supported) {
    return null;
  }

  function closeAsking() {
    setAsking(false);
    setSecret("");
    setVerified(false);
    setFinish(null);
  }

  function handleToggle(next: boolean) {
    setError(null);
    if (next) {
      closeAsking();
      setAsking(true);
      return;
    }
    // 아직 등록 전(asking 중이라 스위치만 켜져 보이는 상태)이면 끌 등록이 없다 — 폼만 닫는다.
    if (!enabled) {
      closeAsking();
      return;
    }
    void handleDisable();
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await disableBiometric();
    } catch {
      setError("Face ID를 끄지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: BIOMETRIC_CONFIG_KEY });
    }
  }

  async function finishSuccess() {
    markBiometricOffered();
    closeAsking();
    await queryClient.invalidateQueries({ queryKey: BIOMETRIC_CONFIG_KEY });
  }

  function handleFail(e: unknown, opts: { endFlow: boolean }) {
    if (e instanceof BiometricCancelledError) {
      setError("Face ID 등록을 취소했어요.");
    } else if (e instanceof BiometricUnsupportedError) {
      setError("이 기기는 Face ID 잠금 해제를 지원하지 않아요.");
    } else {
      setError("Face ID를 켜지 못했어요. 다시 시도해 주세요.");
    }
    if (opts.endFlow) {
      setAsking(false);
      setSecret("");
      setVerified(false);
      setFinish(null);
    }
  }

  // 1단계: 현재 PIN/비밀번호를 verifier로만 검증한다. 패스키 생성은 아직 하지 않는다.
  async function handleVerify() {
    setError(null);
    if (settings == null) {
      setError("설정을 불러올 수 없어요. 앱을 다시 시작해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const key = await deriveKey(secret, settings.kdfSalt);
      const ok = await checkVerifier(key, settings.verifier);
      if (!ok) {
        setError(isPinLock ? "PIN이 일치하지 않아요." : "비밀번호가 일치하지 않아요.");
        return;
      }
      setVerified(true);
    } catch {
      setError("확인 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  // 2단계: 탭 즉시(await 없이) startEnrollment를 호출해 iOS의 사용자 제스처를 그대로 넘긴다.
  async function handleEnable() {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setError(null);
    setBusy(true);
    try {
      const res = await startEnrollment(secret);
      if (res.status === "needs-confirm") {
        setFinish(() => res.finish);
        return;
      }
      await finishSuccess();
    } catch (e) {
      handleFail(e, { endFlow: true });
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }

  // "한 번 더 확인해 주세요" 탭 — 생성 시점에 PRF 결과가 없어 사용자 제스처가 소모된 경우.
  async function handleFinish() {
    if (inFlightRef.current || finish == null) {
      return;
    }
    inFlightRef.current = true;
    setError(null);
    setBusy(true);
    try {
      await finish();
      await finishSuccess();
    } catch (e) {
      handleFail(e, { endFlow: true });
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }

  return (
    <Card>
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-4">
        Face ID
      </h2>

      {error != null && (
        <div
          className="rounded-[16px] px-4 py-[14px] mb-4 text-[15px] leading-[1.5]"
          style={{ backgroundColor: "#FDECEE", color: "#F04452" }}
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-[15px] font-medium leading-[1.5] text-ink">Face ID로 잠금 해제</span>
          <span className="text-[13px] text-body-soft leading-[1.5]">PIN 대신 얼굴로 바로 열어요.</span>
        </div>
        <Switch
          checked={enabled || asking}
          onChange={handleToggle}
          label="Face ID로 잠금 해제"
          disabled={busy}
        />
      </div>

      {asking && (
        <div className="flex flex-col gap-3 mt-4">
          {!verified && (
            <>
              <TextInput
                inputId="biometric-secret"
                label={isPinLock ? "현재 PIN" : "현재 비밀번호"}
                value={secret}
                onChange={(v) => {
                  setSecret(v);
                  setError(null);
                }}
                masked
                placeholder={isPinLock ? "숫자 6자리" : "현재 비밀번호"}
                inputMode={isPinLock ? "numeric" : undefined}
                maxLength={isPinLock ? 6 : undefined}
              />
              <Button
                variant="primary"
                className="w-full"
                disabled={busy || secret === ""}
                onClick={() => void handleVerify()}
              >
                {isPinLock ? "PIN 확인" : "비밀번호 확인"}
              </Button>
            </>
          )}
          {verified && finish == null && (
            <Button variant="primary" className="w-full" disabled={busy} onClick={() => void handleEnable()}>
              Face ID 켜기
            </Button>
          )}
          {finish != null && (
            <Button variant="primary" className="w-full" disabled={busy} onClick={() => void handleFinish()}>
              한 번 더 확인해 주세요
            </Button>
          )}
          <Button variant="weak" className="w-full" disabled={busy} onClick={closeAsking}>
            닫기
          </Button>
        </div>
      )}
    </Card>
  );
}
