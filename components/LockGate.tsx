"use client";

import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { makeSalt, deriveKey, makeVerifier, checkVerifier } from "@/lib/crypto/crypto";
import { getSettings, putSettings, listMembers, upsertMember } from "@/lib/db/local-store";
import { useAppStore } from "@/stores/app-store";

type Mode = "loading" | "setup" | "unlock";

interface LockGateProps {
  children: ReactNode;
}

/**
 * 앱 전체를 감싸는 패스프레이즈 잠금 게이트.
 * - 최초 실행(설정 없음): 패스프레이즈 설정 화면 (setup 모드)
 * - 재진입(설정 있음): 패스프레이즈 입력 화면 (unlock 모드)
 * - 잠금 해제 시: children을 렌더링
 *
 * 보안 원칙: 패스프레이즈 자체는 절대 저장하지 않는다.
 * salt + verifier만 DB에 저장하고, CryptoKey는 메모리(useAppStore)에만 존재한다.
 */
export function LockGate({ children }: LockGateProps) {
  const locked = useAppStore((s) => s.locked);
  const unlock = useAppStore((s) => s.unlock);

  const [mode, setMode] = useState<Mode>("loading");

  // 패스프레이즈 입력값
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");

  // 에러 메시지
  const [error, setError] = useState<string | null>(null);

  // 제출 중 상태
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getSettings().then((settings) => {
      if (cancelled) {
        return;
      }
      setMode(settings == null ? "setup" : "unlock");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 이미 잠금 해제된 경우 children 렌더링
  if (!locked) {
    return <>{children}</>;
  }

  if (mode === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-[15px] text-muted">잠깐, 불러오는 중이에요...</p>
      </div>
    );
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (passphrase.trim() === "") {
      setError("패스프레이즈를 입력해 주세요.");
      return;
    }

    if (passphrase !== confirm) {
      setError("패스프레이즈가 일치하지 않아요. 두 칸을 동일하게 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const salt = makeSalt();
      const key = await deriveKey(passphrase, salt);
      const verifier = await makeVerifier(key);

      await putSettings({ id: "app", kdfSalt: salt, verifier, schemaVersion: 1 });

      const members = await listMembers();
      if (members.length === 0) {
        await upsertMember({ id: crypto.randomUUID(), name: "나" });
      }

      useAppStore.getState().unlock(key);
    } catch {
      setError("설정 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (passphrase.trim() === "") {
      setError("패스프레이즈를 입력해 주세요.");
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
        setError("패스프레이즈가 일치하지 않아요. 다시 입력해 주세요.");
      }
    } catch {
      setError("잠금 해제 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const isSetup = mode === "setup";

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[400px]">
        <Card variant="hero" className="flex flex-col gap-6">
          {/* 타이틀 */}
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-bold leading-[1.35] tracking-[-0.3px] text-ink">
              {isSetup ? "dotori에 오신 걸 환영해요" : "dotori"}
            </h1>
            <p className="text-[15px] font-normal leading-[1.5] text-body">
              {isSetup
                ? "데이터를 안전하게 보호할 패스프레이즈를 설정해요."
                : "패스프레이즈를 입력하면 포트폴리오를 볼 수 있어요."}
            </p>
          </div>

          {/* 폼 */}
          <form
            onSubmit={isSetup ? handleSetup : handleUnlock}
            className="flex flex-col gap-4"
            noValidate
          >
            <TextInput
              inputId="lock-passphrase"
              label="패스프레이즈"
              value={passphrase}
              onChange={(v) => {
                setPassphrase(v);
                setError(null);
              }}
              masked
              placeholder="패스프레이즈를 입력해요"
              autoFocus
              autoComplete={isSetup ? "new-password" : "current-password"}
            />

            {isSetup && (
              <TextInput
                inputId="lock-passphrase-confirm"
                label="패스프레이즈 확인"
                value={confirm}
                onChange={(v) => {
                  setConfirm(v);
                  setError(null);
                }}
                masked
                placeholder="한 번 더 입력해요"
                autoComplete="new-password"
              />
            )}

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
              {submitting
                ? "처리 중이에요..."
                : isSetup
                  ? "시작하기"
                  : "잠금 해제하기"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
