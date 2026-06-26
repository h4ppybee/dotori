"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Banner } from "@/components/ui/Banner";
import { Dialog } from "@/components/ui/Dialog";
import { ConnectionForm } from "@/components/settings/ConnectionForm";
import { BackupPanel } from "@/components/settings/BackupPanel";
import { getSettings, putSettings } from "@/lib/db/local-store";
import { deriveKey, makeSalt, makeVerifier, checkVerifier } from "@/lib/crypto/crypto";
import { rekeyVault } from "@/lib/crypto/rekey";
import { db } from "@/lib/db/schema";
import { useAppStore } from "@/stores/app-store";

// ─── 비밀번호 변경 섹션 ──────────────────────────────────────────────────

function PassphraseSection() {
  const unlock = useAppStore((s) => s.unlock);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function clearFields() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(false);

    if (!current.trim()) {
      setError("현재 비밀번호를 입력해 주세요.");
      return;
    }
    if (!next.trim()) {
      setError("새 비밀번호를 입력해 주세요.");
      return;
    }
    if (next !== confirm) {
      setError("새 비밀번호와 확인이 일치하지 않아요.");
      return;
    }
    if (next.length < 8) {
      setError("비밀번호는 8자 이상으로 설정해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const settings = await getSettings();
      if (!settings) {
        setError("설정을 불러올 수 없어요. 앱을 다시 시작해 주세요.");
        return;
      }

      const oldKey = await deriveKey(current, settings.kdfSalt);
      const valid = await checkVerifier(oldKey, settings.verifier);
      if (!valid) {
        setError("현재 비밀번호가 일치하지 않아요.");
        return;
      }

      const newSalt = makeSalt();
      const newKey = await deriveKey(next, newSalt);
      await rekeyVault(oldKey, newKey);
      await putSettings({
        ...settings,
        kdfSalt: newSalt,
        verifier: await makeVerifier(newKey),
      });
      // 세션 키를 새 키로 교체 — 잠금 해제 상태를 유지한다
      unlock(newKey);

      clearFields();
      setSuccess(true);
    } catch {
      setError("비밀번호 변경 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-4">
        비밀번호 변경
      </h2>

      {success && (
        <Banner message="비밀번호를 바꿨어요." className="mb-4" />
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
          label="현재 비밀번호"
          value={current}
          onChange={setCurrent}
          masked
          placeholder="현재 비밀번호"
        />
        <TextInput
          inputId="pp-next"
          label="새 비밀번호"
          value={next}
          onChange={setNext}
          masked
          placeholder="8자 이상"
        />
        <TextInput
          inputId="pp-confirm"
          label="새 비밀번호 확인"
          value={confirm}
          onChange={setConfirm}
          masked
          placeholder="새 비밀번호를 다시 입력"
        />
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full"
        >
          {loading ? "변경 중..." : "변경하기"}
        </Button>
      </div>
    </Card>
  );
}

// ─── 데이터 전체 삭제 섹션 ────────────────────────────────────────────────────

function DeleteAllSection() {
  const lock = useAppStore((s) => s.lock);
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAll() {
    setDeleting(true);
    try {
      await db.delete();
      await db.open();
      lock();
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
          <PassphraseSection />
          <DeleteAllSection />
        </div>
      </div>
    </div>
  );
}
