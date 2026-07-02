"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Banner } from "@/components/ui/Banner";
import { exportAll, importAll } from "@/lib/backup/backup";
import { useQueryClient } from "@tanstack/react-query";

type ImportMode = "merge" | "overwrite";

/**
 * JSON 내보내기 / 불러오기 섹션.
 * 내보내기: Blob 다운로드.
 * 불러오기: 파일 선택 → 병합/덮어쓰기 선택 다이얼로그 → importAll 실행.
 */
export function BackupPanel() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingJson, setPendingJson] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function clearMessages() {
    setSuccessMsg(null);
    setErrorMsg(null);
  }

  async function handleExport() {
    clearMessages();
    setExporting(true);
    try {
      const json = await exportAll();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
      const a = document.createElement("a");
      a.href = url;
      a.download = `dotori-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMsg("백업 파일을 내려받았어요.");
    } catch {
      setErrorMsg("내보내기 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    clearMessages();
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") {
        setPendingJson(text);
        setImportMode("merge");
        setDialogOpen(true);
      }
    };
    reader.readAsText(file);
    // 파일 인풋 초기화 (같은 파일 재선택 허용)
    e.target.value = "";
  }

  async function handleImportConfirm() {
    if (!pendingJson) {
      return;
    }
    setImporting(true);
    setDialogOpen(false);
    try {
      await importAll(pendingJson, { mode: importMode });
      setPendingJson(null);
      // salt·API 설정이 불변이라 재잠금 불필요. 불러온 수동 데이터로 UI만 갱신한다.
      await queryClient.invalidateQueries();
      setSuccessMsg("불러오기를 마쳤어요.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setErrorMsg(`불러오기에 실패했어요. ${msg}`);
    } finally {
      setImporting(false);
    }
  }

  function handleDialogClose() {
    setDialogOpen(false);
    setPendingJson(null);
  }

  return (
    <Card>
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-4">
        데이터 백업
      </h2>

      {successMsg != null && (
        <Banner message={successMsg} className="mb-4" />
      )}
      {errorMsg != null && (
        <div
          className="rounded-[16px] px-4 py-[14px] mb-4 text-[15px] leading-[1.5]"
          style={{ backgroundColor: "#FDECEE", color: "#F04452" }}
          role="alert"
        >
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[15px] text-body-soft leading-[1.5]">
            직접 입력한 데이터를 JSON 파일로 저장해요. API 연동 설정과 자동으로 불러온 자산은 제외돼요.
          </p>
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={exporting}
            className="w-full mt-1"
          >
            {exporting ? "준비 중..." : "내보내기"}
          </Button>
        </div>

        <div
          className="border-t border-hairline"
          aria-hidden="true"
        />

        <div className="flex flex-col gap-1">
          <p className="text-[15px] text-body-soft leading-[1.5]">
            저장해 둔 JSON 파일을 불러와요.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
            aria-label="백업 파일 선택"
          />
          <Button
            variant="weak"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="w-full mt-1"
          >
            {importing ? "불러오는 중..." : "불러오기"}
          </Button>
        </div>
      </div>

      {/* 병합/덮어쓰기 선택 다이얼로그 */}
      <Dialog
        open={dialogOpen}
        title="어떻게 불러올까요?"
        onClose={handleDialogClose}
        actionLabel={importMode === "overwrite" ? "덮어쓰기" : "병합하기"}
        onAction={handleImportConfirm}
        actionVariant="primary"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                value="merge"
                checked={importMode === "merge"}
                onChange={() => setImportMode("merge")}
                className="accent-primary w-4 h-4"
              />
              <div>
                <p className="text-[15px] font-semibold text-ink leading-[1.4]">병합</p>
                <p className="text-[13px] text-muted leading-[1.45]">
                  직접 입력한 기존 데이터를 유지하고 백업 파일의 내용을 추가해요.
                </p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                value="overwrite"
                checked={importMode === "overwrite"}
                onChange={() => setImportMode("overwrite")}
                className="accent-primary w-4 h-4"
              />
              <div>
                <p className="text-[15px] font-semibold text-ink leading-[1.4]">덮어쓰기</p>
                <p className="text-[13px] text-muted leading-[1.45]">
                  직접 입력한 데이터를 백업 파일로 교체해요.
                </p>
              </div>
            </label>
          </div>
          <p className="text-[13px] text-muted leading-[1.45]">
            API 연동 설정과 자동으로 불러온 자산은 그대로 유지돼요.
          </p>
        </div>
      </Dialog>
    </Card>
  );
}
