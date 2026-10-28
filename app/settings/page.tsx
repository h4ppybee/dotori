"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Banner } from "@/components/ui/Banner";
import { Dialog } from "@/components/ui/Dialog";
import { Switch } from "@/components/ui/Switch";
import { ConnectionForm } from "@/components/settings/ConnectionForm";
import { BackupPanel } from "@/components/settings/BackupPanel";
import { SheetExportPanel } from "@/components/settings/SheetExportPanel";
import { BiometricPanel } from "@/components/settings/BiometricPanel";
import { getSettings, putSettings, getBiometricConfig } from "@/lib/db/local-store";
import { useSettings } from "@/lib/query/use-settings";
import { BIOMETRIC_CONFIG_KEY } from "@/lib/query/use-biometric";
import { useQueryClient } from "@tanstack/react-query";
import { deriveKey, makeSalt, makeVerifier, checkVerifier } from "@/lib/crypto/crypto";
import { rekeyVault } from "@/lib/crypto/rekey";
import { disableBiometric, clearBiometricOffered } from "@/lib/biometric/biometric-unlock";
import { db } from "@/lib/db/schema";
import { useAppStore } from "@/stores/app-store";

// ─── 프라이버시 섹션 ──────────────────────────────────────────────────────────

function PrivacySection() {
  const { data: settings } = useSettings();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const enabled = settings?.privacyAmounts ?? false;

  async function handleToggle(next: boolean) {
    if (!settings || saving) {
      return;
    }
    setSaving(true);
    try {
      await putSettings({ ...settings, privacyAmounts: next });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-2">
        프라이버시
      </h2>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-[15px] font-medium leading-[1.5] text-ink">
            금액 숨기기
          </span>
          <span className="text-[13px] text-body-soft leading-[1.5]">
            켜면 총평가금이 가려지고, 탭하면 보여요.
          </span>
        </div>
        <Switch
          checked={enabled}
          onChange={handleToggle}
          label="금액 숨기기"
          disabled={!settings || saving}
        />
      </div>
    </Card>
  );
}

// ─── PIN 설정/변경 섹션 ──────────────────────────────────────────────────

function PinSection() {
  const unlock = useAppStore((s) => s.unlock);
  const { data: settings } = useSettings();
  const queryClient = useQueryClient();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // lockType 없음(undefined)은 기존 문자 비밀번호 사용자로 간주한다
  const isPinLock = settings?.lockType === "pin";

  function clearFields() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function handleSubmit() {
    setError(null);
    setSuccessMessage(null);

    if (!current.trim()) {
      setError(isPinLock ? "현재 PIN을 입력해 주세요." : "현재 비밀번호를 입력해 주세요.");
      return;
    }
    if (!/^\d{6}$/.test(next)) {
      setError("PIN은 숫자 6자리로 입력해 주세요.");
      return;
    }
    if (next !== confirm) {
      setError("새 PIN과 확인이 일치하지 않아요.");
      return;
    }

    setLoading(true);
    try {
      const stored = await getSettings();
      if (!stored) {
        setError("설정을 불러올 수 없어요. 앱을 다시 시작해 주세요.");
        return;
      }

      const oldKey = await deriveKey(current, stored.kdfSalt);
      const valid = await checkVerifier(oldKey, stored.verifier);
      if (!valid) {
        setError(isPinLock ? "현재 PIN이 일치하지 않아요." : "현재 비밀번호가 일치하지 않아요.");
        return;
      }

      // Face ID에 저장된 PIN은 이전 값이 된다 — 새 PIN 저장 전에 먼저 지운다(실패하면 변경 중단).
      const hadBiometric = (await getBiometricConfig()) != null;
      try {
        await disableBiometric();
        // rekeyVault·putSettings가 이어서 실패해도 등록 해제 자체는 반영됐으니 바로 무효화한다.
        await queryClient.invalidateQueries({ queryKey: BIOMETRIC_CONFIG_KEY });
      } catch {
        setError("Face ID 해제에 실패해 PIN을 바꾸지 못했어요. 다시 시도해 주세요.");
        return;
      }

      const newSalt = makeSalt();
      const newKey = await deriveKey(next, newSalt);
      await rekeyVault(oldKey, newKey);
      await putSettings({
        ...stored,
        kdfSalt: newSalt,
        verifier: await makeVerifier(newKey),
        lockType: "pin",
      });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      // 세션 키를 새 키로 교체 — 잠금 해제 상태를 유지한다
      unlock(newKey);

      clearFields();
      const base = isPinLock ? "PIN을 바꿨어요." : "PIN을 설정했어요.";
      setSuccessMessage(hadBiometric ? `${base} Face ID는 다시 켜 주세요.` : base);
    } catch {
      setError("PIN 설정 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-4">
        {isPinLock ? "PIN 변경" : "PIN 설정"}
      </h2>

      {successMessage != null && (
        <Banner message={successMessage} className="mb-4" />
      )}
      {error != null && (
        <div
          className="rounded-[16px] px-4 py-[14px] mb-4 text-[15px] leading-[1.5]"
          style={{ backgroundColor: "#FDECEE", color: "#F04452" }}
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <TextInput
          inputId="pp-current"
          label={isPinLock ? "현재 PIN" : "현재 비밀번호"}
          value={current}
          onChange={setCurrent}
          masked
          placeholder={isPinLock ? "숫자 6자리" : "현재 비밀번호"}
          inputMode={isPinLock ? "numeric" : undefined}
          maxLength={isPinLock ? 6 : undefined}
        />
        <TextInput
          inputId="pp-next"
          label="새 PIN"
          value={next}
          onChange={setNext}
          masked
          placeholder="숫자 6자리"
          inputMode="numeric"
          maxLength={6}
        />
        <TextInput
          inputId="pp-confirm"
          label="새 PIN 확인"
          value={confirm}
          onChange={setConfirm}
          masked
          placeholder="새 PIN을 다시 입력"
          inputMode="numeric"
          maxLength={6}
        />
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full"
        >
          {loading
            ? (isPinLock ? "변경 중..." : "설정 중...")
            : (isPinLock ? "PIN 바꾸기" : "PIN 설정하기")}
        </Button>
      </div>
    </Card>
  );
}

// ─── 데이터 전체 삭제 섹션 ────────────────────────────────────────────────────

function DeleteAllSection() {
  const lock = useAppStore((s) => s.lock);
  const clearLastSheetExport = useAppStore((s) => s.clearLastSheetExport);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAll() {
    setDeleting(true);
    try {
      await db.delete();
      await db.open();
      lock();
      // 시트 내보내기 설정도 함께 사라졌으니 지난 성공/실패 기록이 남지 않게 지운다.
      clearLastSheetExport();
      // Face ID 등록도 함께 사라졌다 — 다시 설치한 것처럼 등록 제안을 한 번 더 보여 준다.
      clearBiometricOffered();
      await queryClient.invalidateQueries({ queryKey: BIOMETRIC_CONFIG_KEY });
      router.push("/");
    } catch {
      setDeleting(false);
      setDialogOpen(false);
    }
  }

  return (
    <Card>
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-2">
        로컬 데이터 전체 삭제
      </h2>
      <p className="text-[15px] text-body-soft leading-[1.5] mb-4">
        삭제 전에 위 &apos;데이터 백업&apos;에서 내보내기를 먼저 해두면 복구할 수 있어요.
      </p>
      <Button
        variant="weak"
        onClick={() => setDialogOpen(true)}
        className="w-full"
        style={{ color: "#F04452" }}
      >
        모든 데이터 삭제
      </Button>

      <Dialog
        open={dialogOpen}
        title="모든 데이터를 삭제할까요?"
        onClose={() => setDialogOpen(false)}
        actionLabel={deleting ? "삭제 중..." : "삭제하기"}
        onAction={handleDeleteAll}
        actionVariant="primary"
      >
        되돌릴 수 없어요. 삭제 전에 백업 파일을 먼저 내려받아 두세요.
      </Dialog>
    </Card>
  );
}

// ─── 설정 페이지 ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pb-16">
        {/* 헤더 */}
        <div className="py-6">
          <h1 className="text-[24px] font-bold leading-[1.35] tracking-[-0.3px] text-ink">
            설정
          </h1>
        </div>

        {/* 섹션들 */}
        <div className="flex flex-col gap-4">
          <ConnectionForm />
          <BackupPanel />
          <SheetExportPanel />
          <PrivacySection />
          <PinSection />
          <BiometricPanel />
          <DeleteAllSection />
        </div>
      </div>
    </div>
  );
}
