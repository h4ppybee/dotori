"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { NumberPad } from "@/components/ui/NumberPad";
import { PinDots } from "@/components/ui/PinDots";
import { makeSalt, deriveKey, makeVerifier, checkVerifier } from "@/lib/crypto/crypto";
import { getSettings, putSettings, listMembers, upsertMember, getBiometricConfig } from "@/lib/db/local-store";
import { isBiometricAvailable, BiometricCancelledError } from "@/lib/biometric/webauthn";
import {
  unlockWithBiometric,
  disableBiometric,
  startEnrollment,
  hasOfferedBiometric,
  markBiometricOffered,
  BiometricInvalidError,
} from "@/lib/biometric/biometric-unlock";
import type { BiometricConfig } from "@/lib/types";
import { loadSession, AUTO_LOCK_MS } from "@/lib/db/session-vault";
import { useAppStore } from "@/stores/app-store";
import { useSessionGuard } from "@/lib/auth/use-session-guard";
import { AppNav } from "@/components/nav/AppNav";

const PIN_LENGTH = 6;

type Mode = "loading" | "setup" | "unlock-pin" | "unlock-passphrase" | "offer-biometric";

/** 잠금 수단별 안내 문구 조각 — 기존 문자 비밀번호 사용자에게 "PIN"이라고 말하지 않도록 나눈다. */
const SECRET_WORDS = {
  pin: { name: "PIN", subject: "PIN이", by: "PIN으로", object: "PIN을" },
  passphrase: { name: "비밀번호", subject: "비밀번호가", by: "비밀번호로", object: "비밀번호를" },
} as const;

interface LockGateProps {
  children: ReactNode;
}

/**
 * 앱 전체를 감싸는 잠금 게이트.
 * - 최초 실행(설정 없음): 6자리 PIN 설정 화면 — 넘버패드로 두 번 입력하면 자동 완료 (setup 모드)
 * - 재진입(lockType=pin): PIN 잠금 해제 화면 — 6자리가 차면 자동 검증 (unlock-pin 모드)
 * - 재진입(lockType 없음/passphrase): 기존 문자 비밀번호 화면 (unlock-passphrase 모드)
 * - 잠금 해제 시: children을 렌더링
 * - Face ID(등록돼 있을 때): 잠금 화면 진입·포그라운드 복귀 시 한 번 자동 시도하고, 기본은 "Face ID로 열기" 버튼 탭
 *   자동 시도는 넘버패드·비밀번호 입력을 막지 않으며, 그사이 PIN·비밀번호 입력을 시작하면 늦게 온 Face ID 결과는 버린다
 * - PIN·비밀번호로 연 직후: 지원 기기·미등록·제안 기록 없음이면 Face ID 등록을 한 번 제안한다 (offer-biometric 모드)
 * - 모드는 마운트 때와 잠금으로 바뀔 때마다 다시 판정한다(세션 복원 후 자동 잠금 시 "불러오는 중"에 멈추지 않게)
 *
 * 보안 원칙: PIN/비밀번호는 평문으로 저장하지 않는다. 잠금 확인용으로는 salt + verifier만 DB에 저장한다.
 * Face ID를 켠 경우에만 PRF 파생 키로 암호화한 PIN/비밀번호를 biometric 테이블에 둔다. (lib/biometric)
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

  // Face ID — 기기 지원 여부와 등록 설정. 설정을 state에 미리 두어 버튼 탭의 첫 await가
  // credentials.get이 되게 한다(iOS는 그 전에 다른 await가 끼면 사용자 제스처를 잃는다).
  const [bioSupported, setBioSupported] = useState(false);
  const [bioConfig, setBioConfig] = useState<BiometricConfig | undefined>(undefined);
  // 등록 제안 중에만 검증된 secret·key를 메모리에 둔다.
  const [pending, setPending] = useState<{ secret: string; key: CryptoKey } | null>(null);
  // create에서 PRF를 못 받아 한 번 더 확인이 필요할 때의 마무리·포기 함수
  const [enrollConfirm, setEnrollConfirm] = useState<{ finish: () => Promise<void>; cancel: () => void } | null>(null);
  // 같은 잠금 주기 안에서 자동 시도는 한 번만, 버튼 탭 취소는 연속 횟수를 센다.
  const autoTriedRef = useRef(false);
  const bioFailRef = useRef(0);
  const prevLockedRef = useRef(locked);
  // 검증·Face ID·등록 작업이 진행 중인지. submitting(state)은 화면 표시용이고, 동시 실행 차단은
  // 렌더 시점 값에 묶이지 않는 이 ref로 한다(자동 시도 클로저가 오래된 submitting을 볼 수 있다).
  const inFlightRef = useRef(false);
  // PIN·비밀번호 입력 세대 — 입력을 시작하면 올려서, 그 전에 시작한 Face ID 시도의 결과를 버린다(PIN이 항상 이긴다).
  // Face ID 시도끼리는 결과를 버리지 않는다: iOS 홈 화면 앱은 제스처 없는 자동 요청을 보류했다가 다음 탭 때
  // 그 창을 먼저 띄우므로, 새 시도가 이전 결과를 버리면 통과해도 열리지 않는 엇갈림이 생긴다.
  const bioGenRef = useRef(0);
  // 가장 최근 Face ID 시도 번호 — 오류 문구는 최근 시도에서만 띄운다(이전 시도의 취소·실패는 조용히).
  const bioAttemptRef = useRef(0);
  // 보류 중인 자동 요청 취소용 — 버튼 탭·PIN 입력·잠금 해제 때 abort해 요청이 겹치지 않게 한다.
  const autoAbortRef = useRef<AbortController | null>(null);
  // 응답을 기다리는 Face ID 요청 수(자동·버튼 공용). Face ID 시트 자체가 hidden/visible을 일으키므로
  // 요청 중의 hidden은 백그라운드 전환으로 보지 않는다.
  const bioPendingRef = useRef(0);
  // 현재 잠금 수단 — 안내 문구를 PIN/비밀번호로 나눈다.
  const [secretKind, setSecretKind] = useState<keyof typeof SECRET_WORDS>("pin");

  /** 설정·Face ID 등록 상태를 읽어 잠금 화면 모드를 정한다. */
  const resolveMode = useCallback(async (isCancelled: () => boolean) => {
    const settings = await getSettings();
    if (isCancelled()) {
      return;
    }
    setPin("");
    setFirstPin(null);
    setError(null);
    if (settings == null) {
      // 설정이 없으면 Face ID 등록도 의미가 없다 — 이전 상태가 남지 않게 비운다.
      setBioSupported(false);
      setBioConfig(undefined);
      setMode("setup");
      return;
    }
    // 등록 여부는 지원 판정과 따로 읽는다 — iOS 홈 화면 앱은 막 켜질 때 판정이 일시적으로 false일 수 있는데,
    // 이미 등록했다면 이 기기는 지원하는 것이므로 "Face ID로 열기"를 숨기지 않는다.
    const [supported, config] = await Promise.all([isBiometricAvailable(), getBiometricConfig()]);
    if (isCancelled()) {
      return;
    }
    setBioSupported(supported);
    setBioConfig(config);
    setSecretKind(settings.lockType === "pin" ? "pin" : "passphrase");
    setMode(settings.lockType === "pin" ? "unlock-pin" : "unlock-passphrase");
  }, []);

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
      await resolveMode(() => cancelled);
    })();

    return () => {
      cancelled = true;
    };
  }, [resolveMode]);

  // 잠금 상태 전환 감시.
  // - 풀리면: 자동 시도·연속 실패 가드를 초기화한다(잠길 때 하면 자동 시도 effect가 먼저 돌아 건너뛸 수 있다).
  // - false→true로 잠기면: 현재 mode와 상관없이 다시 판정한다. 세션 복원으로 열렸다면 mode가
  //   loading에 머물러 있어 "불러오는 중"에 멈추던 문제를 막고, 직전 등록 제안 카드가 잠깐 보이는 것도 막는다.
  useEffect(() => {
    const wasLocked = prevLockedRef.current;
    prevLockedRef.current = locked;
    if (!locked) {
      autoTriedRef.current = false;
      bioFailRef.current = 0;
      abortAutoBiometric();
      return;
    }
    if (wasLocked) {
      // 마운트 직후 첫 실행 — 위 마운트 effect가 판정한다.
      return;
    }
    let cancelled = false;
    // 잠기는 순간 이전 화면(등록 제안 등)을 지우고 다시 판정한다 — 나머지 setState는 resolveMode의 await 이후다.
    setMode("loading");
    void resolveMode(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [locked, resolveMode]);

  // Face ID 자동 시도(보조 동작). 잠금 화면 진입·포그라운드 복귀 시 한 번만 시도하고,
  // iOS가 제스처 없는 호출을 거부하면 조용히 버튼 대기로 넘어간다.
  useEffect(() => {
    if (!locked || bioConfig == null || (mode !== "unlock-pin" && mode !== "unlock-passphrase")) {
      return;
    }
    const tryAuto = () => {
      if (autoTriedRef.current || bioPendingRef.current > 0 || document.visibilityState !== "visible") {
        return;
      }
      autoTriedRef.current = true;
      void handleBiometric(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // 백그라운드로 가면 돌아왔을 때 다시 시도할 수 있게 한다.
        // 단, Face ID 요청 중이면 시트가 띄운 hidden일 수 있어 그대로 둔다(취소 후 다시 뜨는 반복 방지).
        if (bioPendingRef.current === 0) {
          autoTriedRef.current = false;
        }
        return;
      }
      tryAuto();
    };
    tryAuto();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // handleBiometric은 매 렌더 새로 만들어지지만 시도 자체는 ref로 1회 제한한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, bioConfig, mode]);

  // 등록 제안 화면은 아직 잠긴 상태(locked=true)라 자동 잠금(useSessionGuard)이 돌지 않는다.
  // 방치하면 누구나 "괜찮아요"로 열 수 있고 검증된 PIN이 메모리에 남으므로, 10분이 지나거나
  // 백그라운드로 가면 제안을 버리고 잠금 화면으로 돌아간다. Face ID 시트가 떠 있는 동안은 건드리지 않는다.
  useEffect(() => {
    if (mode !== "offer-biometric") {
      return;
    }
    const expire = () => {
      if (inFlightRef.current) {
        return;
      }
      // 한 번 더 확인 단계에서 버리면 이미 만든 패스키를 정리한다.
      enrollConfirm?.cancel();
      setPending(null);
      setEnrollConfirm(null);
      setMode("loading");
      // mode 변경으로 이 effect가 정리돼도 판정은 끝까지 해야 하므로 취소하지 않는다.
      void resolveMode(() => false);
    };
    const timer = window.setTimeout(expire, AUTO_LOCK_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        expire();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // enrollConfirm이 생기면(한 번 더 확인 단계) 제한 시간을 다시 센다.
  }, [mode, enrollConfirm, resolveMode]);

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

  /** 진행 중인 작업이 없으면 시작 표시를 하고 true. 이미 진행 중이면 false(동시 실행 차단). */
  function beginWork(): boolean {
    if (inFlightRef.current) {
      return false;
    }
    inFlightRef.current = true;
    setSubmitting(true);
    return true;
  }

  function endWork() {
    inFlightRef.current = false;
    setSubmitting(false);
  }

  /** setup: 확인 단계까지 일치하면 salt/verifier를 만들고 잠금을 해제한다. */
  async function completeSetup(confirmedPin: string) {
    if (!beginWork()) {
      return;
    }
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

      // 확인용으로 들고 있던 평문 PIN을 지운 뒤 연다.
      setFirstPin(null);
      useAppStore.getState().unlock(key);
    } catch {
      setError("설정 중 문제가 생겼어요. 다시 시도해 주세요.");
      setPin("");
      setFirstPin(null);
    } finally {
      endWork();
    }
  }

  /** 보류 중인 자동 Face ID 요청을 취소한다. */
  function abortAutoBiometric() {
    autoAbortRef.current?.abort();
    autoAbortRef.current = null;
  }

  /** 진행 중인 자동 Face ID 시도의 결과를 버리게 한다 — PIN·비밀번호 입력이 항상 이긴다. */
  function supersedeBiometric() {
    bioGenRef.current += 1;
    abortAutoBiometric();
  }

  /** unlock-pin: 6자리가 차면 자동으로 검증한다. */
  async function verifyPin(enteredPin: string) {
    supersedeBiometric();
    if (!beginWork()) {
      return;
    }
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
        await afterVerified(enteredPin, key);
      } else {
        setError("PIN이 일치하지 않아요. 다시 입력해 주세요.");
        setPin("");
      }
    } catch {
      setError("잠금 해제 중 문제가 생겼어요. 다시 시도해 주세요.");
      setPin("");
    } finally {
      endWork();
    }
  }

  /** PIN·비밀번호 검증이 끝난 뒤: 조건이 맞으면 Face ID 등록을 한 번 제안하고, 아니면 바로 연다. */
  async function afterVerified(secret: string, key: CryptoKey) {
    if (bioConfig != null || hasOfferedBiometric()) {
      useAppStore.getState().unlock(key);
      return;
    }
    // iOS 홈 화면 앱은 막 켜질 때 지원 판정이 일시적으로 false로 나올 수 있다.
    // 진입 때 false였다면 지금 다시 확인하고, 그때 읽지 않은 등록 여부도 함께 읽는다.
    if (!bioSupported) {
      const supported = await isBiometricAvailable();
      const config = supported ? await getBiometricConfig() : undefined;
      setBioSupported(supported);
      setBioConfig(config);
      if (!supported || config != null) {
        useAppStore.getState().unlock(key);
        return;
      }
    }
    setPending({ secret, key });
    setMode("offer-biometric");
  }

  /** 등록 제안 종료 — 결과와 상관없이 제안 기록을 남기고 연다. */
  function finishOffer() {
    const p = pending;
    markBiometricOffered();
    setPending(null);
    setEnrollConfirm(null);
    if (p) {
      useAppStore.getState().unlock(p.key);
    }
  }

  /** "괜찮아요" — 한 번 더 확인 단계였다면 이미 만든 패스키를 정리하고 연다. */
  function declineOffer() {
    enrollConfirm?.cancel();
    finishOffer();
  }

  async function handleEnableFromOffer() {
    if (!pending || !beginWork()) {
      return;
    }
    try {
      const res = await startEnrollment(pending.secret);
      if (res.status === "needs-confirm") {
        setEnrollConfirm({ finish: res.finish, cancel: res.cancel });
        return;
      }
    } catch {
      // 취소·미지원·기타 — 설정에서 다시 켤 수 있으니 잠금 해제는 그대로 진행한다
    } finally {
      endWork();
    }
    finishOffer();
  }

  async function handleConfirmFinish() {
    if (enrollConfirm == null || !beginWork()) {
      return;
    }
    try {
      await enrollConfirm.finish();
    } catch {
      // 위와 같음 — 등록을 마치지 못했으니 만든 패스키는 정리한다
      enrollConfirm.cancel();
    } finally {
      endWork();
    }
    finishOffer();
  }

  /** 망가진 Face ID 등록을 지운다. 지우지 못해도 다음 시도에서 같은 안내가 다시 나온다. */
  async function dropBiometric() {
    try {
      await disableBiometric();
    } catch {
      // 무시
    }
    setBioConfig(undefined);
  }

  /**
   * Face ID로 저장된 PIN/비밀번호를 꺼내 기존 검증 경로로 연다. auto=true면 자동 시도.
   * 자동 시도는 화면을 막지 않는다(submitting·inFlight를 세우지 않음). 대신 시도마다 세대를 매기고,
   * 그사이 버튼 탭·PIN 입력으로 세대가 바뀌면 결과를 버린다. 버튼 탭은 기존처럼 화면을 막는다.
   */
  async function handleBiometric(auto: boolean) {
    if (bioConfig == null || inFlightRef.current) {
      return;
    }
    if (!auto && !beginWork()) {
      return;
    }
    // 버튼 탭이면 보류 중인 자동 요청을 먼저 취소해 요청이 겹치지 않게 한다.
    if (!auto) {
      abortAutoBiometric();
    }
    const controller = auto ? new AbortController() : null;
    if (controller) {
      autoAbortRef.current = controller;
    }
    const gen = bioGenRef.current;
    // PIN 입력이 시작됐거나 다른 시도로 이미 열렸으면 이 결과는 쓰지 않는다.
    const stale = () => gen !== bioGenRef.current || !useAppStore.getState().locked;
    bioAttemptRef.current += 1;
    const attempt = bioAttemptRef.current;
    const isLatest = () => attempt === bioAttemptRef.current;
    setError(null);
    const words = SECRET_WORDS[secretKind];
    bioPendingRef.current += 1;
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        bioPendingRef.current -= 1;
      }
    };
    try {
      // 첫 await가 credentials.get이어야 한다(제스처 보존).
      const secret = await unlockWithBiometric(bioConfig, controller?.signal);
      settle();
      if (stale()) {
        return;
      }
      if (secret == null) {
        setBioConfig(undefined);
        return;
      }
      const settings = await getSettings();
      const key = settings ? await deriveKey(secret, settings.kdfSalt) : null;
      const valid = settings != null && key != null && (await checkVerifier(key, settings.verifier));
      if (stale()) {
        return;
      }
      if (!valid || key == null) {
        await dropBiometric();
        setError(`${words.subject} 바뀌어 Face ID를 쓸 수 없어요. ${words.by} 연 뒤 설정에서 Face ID를 다시 켜 주세요.`);
        return;
      }
      bioFailRef.current = 0;
      useAppStore.getState().unlock(key);
    } catch (e) {
      settle();
      // 이전 시도의 취소·실패는 조용히 넘긴다 — 지금 기다리는 시도가 따로 있다.
      if (stale() || !isLatest()) {
        return;
      }
      if (e instanceof BiometricCancelledError) {
        // 자동 시도 거부는 조용히 넘기고 연속 실패에도 넣지 않는다.
        if (auto) {
          return;
        }
        bioFailRef.current += 1;
        if (bioFailRef.current >= 3) {
          setError(`Face ID로 열 수 없어요. ${words.by} 연 뒤 설정에서 다시 켜 주세요.`);
        }
        return;
      }
      if (e instanceof BiometricInvalidError) {
        // 복호화 실패 — 등록이 망가진 것으로 보고 지운다
        await dropBiometric();
        setError(`Face ID를 다시 켜 주세요. 지금은 ${words.by} 열어 주세요.`);
        return;
      }
      setError(`Face ID로 열지 못했어요. ${words.object} 입력해 주세요.`);
    } finally {
      settle();
      if (controller && autoAbortRef.current === controller) {
        autoAbortRef.current = null;
      }
      if (!auto) {
        endWork();
      }
    }
  }

  /** 넘버패드 숫자 입력 — 6자리가 차는 순간 모드에 따라 자동 진행한다. */
  function handleDigit(digit: string) {
    if (inFlightRef.current || pin.length >= PIN_LENGTH) {
      return;
    }
    // PIN 입력을 시작하면 기다리던 자동 Face ID 결과는 버린다.
    supersedeBiometric();
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

    supersedeBiometric();
    if (!beginWork()) {
      return;
    }
    try {
      const settings = await getSettings();
      if (settings == null) {
        setError("설정 정보를 찾지 못했어요. 앱을 다시 시작해 주세요.");
        return;
      }

      const key = await deriveKey(passphrase, settings.kdfSalt);
      const valid = await checkVerifier(key, settings.verifier);

      if (valid) {
        setPassphrase("");
        await afterVerified(passphrase, key);
      } else {
        setError("비밀번호가 일치하지 않아요. 다시 입력해 주세요.");
      }
    } catch {
      setError("잠금 해제 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      endWork();
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

          {mode === "offer-biometric" ? (
            /* PIN·비밀번호로 연 직후 Face ID 등록 제안 */
            <div className="flex flex-col gap-4">
              {/* 화면 전환을 보조기기가 읽도록 질문을 status로 알린다 */}
              <p role="status" className="text-[17px] font-bold leading-[1.45] text-ink">
                다음부터 Face ID로 열까요?
              </p>
              <p className="text-[15px] font-normal leading-[1.5] text-body">
                {SECRET_WORDS[secretKind].name} 대신 얼굴로 바로 열 수 있어요. 설정에서 언제든 끌 수 있어요.
              </p>
              {enrollConfirm ? (
                <Button variant="primary" className="w-full" disabled={submitting} onClick={handleConfirmFinish}>
                  한 번 더 확인해 주세요
                </Button>
              ) : (
                <Button variant="primary" className="w-full" disabled={submitting} onClick={handleEnableFromOffer}>
                  Face ID 켜기
                </Button>
              )}
              <Button variant="weak" className="w-full" disabled={submitting} onClick={declineOffer}>
                괜찮아요
              </Button>
            </div>
          ) : mode === "unlock-passphrase" ? (
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
                  // 비밀번호 입력을 시작하면 기다리던 자동 Face ID 결과는 버린다.
                  supersedeBiometric();
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

              {bioConfig != null && (
                <Button
                  type="button"
                  variant="text"
                  className="w-full"
                  disabled={submitting}
                  onClick={() => void handleBiometric(false)}
                >
                  Face ID로 열기
                </Button>
              )}

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

              {mode === "unlock-pin" && bioConfig != null && (
                <Button
                  variant="text"
                  className="w-full"
                  disabled={submitting}
                  onClick={() => void handleBiometric(false)}
                >
                  Face ID로 열기
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
