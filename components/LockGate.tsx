"use client";

import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { NumberPad } from "@/components/ui/NumberPad";
import { PinDots } from "@/components/ui/PinDots";
import { makeSalt, deriveKey, makeVerifier, checkVerifier } from "@/lib/crypto/crypto";
import { getSettings, putSettings, listMembers, upsertMember } from "@/lib/db/local-store";
import { loadSession } from "@/lib/db/session-vault";
import { useAppStore } from "@/stores/app-store";
import { useSessionGuard } from "@/lib/auth/use-session-guard";
import { AppNav } from "@/components/nav/AppNav";

const PIN_LENGTH = 6;

type Mode = "loading" | "setup" | "unlock-pin" | "unlock-passphrase";

interface LockGateProps {
  children: ReactNode;
}

/**
 * 앱 전체를 감싸는 잠금 게이트.
 * - 최초 실행(설정 없음): 6자리 PIN 설정 화면 — 넘버패드로 두 번 입력하면 자동 완료 (setup 모드)
 * - 재진입(lockType=pin): PIN 잠금 해제 화면 — 6자리가 차면 자동 검증 (unlock-pin 모드)
 * - 재진입(lockType 없음/passphrase): 기존 문자 비밀번호 화면 (unlock-passphrase 모드)
 * - 잠금 해제 시: children을 렌더링
 *
 * 보안 원칙: PIN/비밀번호 자체는 절대 저장하지 않는다. salt + verifier만 DB에 저장한다.
 * 잠금 해제 후에는 자동 잠금(10분 유휴)을 위해 비추출 세션 키를 세션 볼트에 두고,
 * 마지막 활동 후 10분이 지나면 잠근다. (lib/db/session-vault.ts, useSessionGuard)
 */
export function LockGate({ children }: LockGateProps) {
  const locked = useAppStore((s) => s.locked);

  const [mode, setMode] = useState<Mode>("loading");

  // 잠금 해제 상태에서 활동 기반 슬라이딩 자동 잠금을 감시한다.
  useSessionGuard();

  // PIN 입력값 (setup·unlock-pin 공용). firstPin은 setup 확인 단계에서만 사용.
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState<string | null>(null);

  // 기존 문자 비밀번호 입력값 (unlock-passphrase)
  const [passphrase, setPassphrase] = useState("");

  // 에러 메시지
  const [error, setError] = useState<string | null>(null);

  // 제출 중 상태
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 유효한 세션이 남아 있으면(10분 이내) 비밀번호 없이 자동 잠금 해제한다.
      const session = await loadSession(Date.now());
      if (cancelled) {
        return;
      }
      if (session != null) {
        useAppStore.getState().unlock(session.key);
        return;
      }
      const settings = await getSettings();
      if (cancelled) {
        return;
      }
      if (settings == null) {
        setMode("setup");
        return;
      }
      setMode(settings.lockType === "pin" ? "unlock-pin" : "unlock-passphrase");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 이미 잠금 해제된 경우 AppNav가 children과 하단 네비게이션을 조립한다.
  // (동적 하단 패딩·상세화면 네비 숨김은 모두 AppNav가 책임진다.)
  if (!locked) {
    return <AppNav>{children}</AppNav>;
  }

  if (mode === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-[15px] text-muted">잠깐, 불러오는 중이에요...</p>
      </div>
    );
  }

  /** setup: 확인 단계까지 일치하면 salt/verifier를 만들고 잠금을 해제한다. */
  async function completeSetup(confirmedPin: string) {
    setSubmitting(true);
    try {
      const salt = makeSalt();
      const key = await deriveKey(confirmedPin, salt);
      const verifier = await makeVerifier(key);

      await putSettings({
        id: "app",
        kdfSalt: salt,
        verifier,
        schemaVersion: 1,
        lockType: "pin",
      });

      const members = await listMembers();
      if (members.length === 0) {
        await upsertMember({ id: crypto.randomUUID(), name: "나" });
      }

      useAppStore.getState().unlock(key);
    } catch {
      setError("설정 중 문제가 생겼어요. 다시 시도해 주세요.");
      setPin("");
      setFirstPin(null);
    } finally {
      setSubmitting(false);
    }
  }

  /** unlock-pin: 6자리가 차면 자동으로 검증한다. */
  async function verifyPin(enteredPin: string) {
    setSubmitting(true);
    try {
      const settings = await getSettings();
      if (settings == null) {
        setError("설정 정보를 찾지 못했어요. 앱을 다시 시작해 주세요.");
        setPin("");
        return;
      }

      const key = await deriveKey(enteredPin, settings.kdfSalt);
      const valid = await checkVerifier(key, settings.verifier);

      if (valid) {
        useAppStore.getState().unlock(key);
      } else {
        setError("PIN이 일치하지 않아요. 다시 입력해 주세요.");
        setPin("");
      }
    } catch {
      setError("잠금 해제 중 문제가 생겼어요. 다시 시도해 주세요.");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  /** 넘버패드 숫자 입력 — 6자리가 차는 순간 모드에 따라 자동 진행한다. */
  function handleDigit(digit: string) {
    if (submitting || pin.length >= PIN_LENGTH) {
      return;
    }
    setError(null);

    const next = pin + digit;
    if (next.length < PIN_LENGTH) {
      setPin(next);
      return;
    }

    // 6자리 완성
    if (mode === "unlock-pin") {
      setPin("");
      void verifyPin(next);
      return;
    }

    // setup — 1단계면 확인 단계로, 확인 단계면 비교 후 완료
    if (firstPin == null) {
      setPin("");
      setFirstPin(next);
      return;
    }
    if (firstPin === next) {
      setPin("");
      void completeSetup(next);
      return;
    }
    setError("PIN이 일치하지 않아요. 처음부터 다시 입력해 주세요.");
    setPin("");
    setFirstPin(null);
  }

  function handleDelete() {
    if (submitting) {
      return;
    }
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }

  async function handlePassphraseUnlock(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (passphrase.trim() === "") {
      setError("비밀번호를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const settings = await getSettings();
      if (settings == null) {
        setError("설정 정보를 찾지 못했어요. 앱을 다시 시작해 주세요.");
        setSubmitting(false);
        return;
      }

      const key = await deriveKey(passphrase, settings.kdfSalt);
      const valid = await checkVerifier(key, settings.verifier);

      if (valid) {
        useAppStore.getState().unlock(key);
      } else {
        setError("비밀번호가 일치하지 않아요. 다시 입력해 주세요.");
      }
    } catch {
      setError("잠금 해제 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const isSetup = mode === "setup";
  const isConfirmStage = isSetup && firstPin != null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[400px]">
        <Card variant="hero" className="flex flex-col gap-6">
          {/* 타이틀 */}
          <div className="flex flex-col gap-2">
            <Image
              src="/web-app-manifest-192x192.png"
              alt=""
              width={64}
              height={64}
              priority
              className="-ml-2"
            />
            <h1 className="text-[24px] font-bold leading-[1.35] tracking-[-0.3px] text-ink">
              {isSetup ? "dotori에 오신 걸 환영해요" : "dotori"}
            </h1>
            {isSetup && (
              <p className="text-[15px] font-normal leading-[1.5] text-body">
                {isConfirmStage
                  ? "한 번 더 입력해요"
                  : "데이터를 안전하게 보호할 PIN 6자리를 설정해요."}
              </p>
            )}
          </div>

          {mode === "unlock-passphrase" ? (
            /* 기존 문자 비밀번호 사용자 — 텍스트 입력 유지 */
            <form
              onSubmit={handlePassphraseUnlock}
              className="flex flex-col gap-4"
              noValidate
            >
              <TextInput
                inputId="lock-passphrase"
                label="비밀번호"
                value={passphrase}
                onChange={(v) => {
                  setPassphrase(v);
                  setError(null);
                }}
                masked
                placeholder="비밀번호를 입력해요"
                autoFocus
                autoComplete="current-password"
              />

              {/* 인라인 에러 */}
              {error != null && (
                <p
                  role="alert"
                  className="text-[13px] font-normal leading-[1.45] text-[#F04452]"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-2"
                disabled={submitting}
              >
                {submitting ? "처리 중이에요..." : "잠금 해제하기"}
              </Button>

              <p className="text-[13px] font-normal leading-[1.45] text-muted text-center">
                설정에서 PIN으로 바꿀 수 있어요.
              </p>
            </form>
          ) : (
            /* PIN 설정(setup)·PIN 잠금 해제(unlock-pin) — 넘버패드 */
            <div className="flex flex-col gap-6">
              <PinDots length={PIN_LENGTH} filled={pin.length} />

              {/* 인라인 에러 */}
              {error != null && (
                <p
                  role="alert"
                  className="text-[13px] font-normal leading-[1.45] text-[#F04452] text-center"
                >
                  {error}
                </p>
              )}

              <NumberPad
                onPress={handleDigit}
                onDelete={handleDelete}
                disabled={submitting}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
