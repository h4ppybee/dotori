"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Banner } from "@/components/ui/Banner";
import { formatDateTime } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import {
  useSheetExportConfig,
  useSaveSheetExportConfig,
  useClearSheetExportConfig,
  useSheetExportNow,
} from "@/lib/query/use-sheet-export";

// 웹앱 연결 준비 순서(순서가 의미 있으므로 번호 목록으로 보여준다)
const SETUP_STEPS = [
  "시트에서 확장 프로그램 → Apps Script를 열고 dotori 내보내기 스크립트를 붙여넣어요.",
  "프로젝트 설정 → 스크립트 속성에 DOTORI_SECRET을 추가하고 비밀키를 넣어요.",
  "배포 → 새 배포 → 웹앱(실행: 나, 액세스: 모든 사용자)으로 배포해요.",
  "배포 URL과 같은 비밀키를 아래에 입력해요.",
];

/**
 * 구글 시트 내보내기 설정. 웹앱 URL·비밀키 저장/해제, 지금 내보내기, 마지막 결과 표시.
 * 마지막 결과는 app-store.lastSheetExport(자동·수동 공용)에서 읽는다.
 * 연결 설정은 기기별이며, 비밀키는 세션 키로 암호화해 저장한다.
 */
export function SheetExportPanel() {
  const { data: config } = useSheetExportConfig();
  const save = useSaveSheetExportConfig();
  const clear = useClearSheetExportConfig();
  const exportNow = useSheetExportNow();
  const last = useAppStore((s) => s.lastSheetExport);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    try {
      await save.mutateAsync({ webAppUrl: url.trim(), secret: secret.trim() });
      setUrl("");
      setSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "연결하지 못했어요. 다시 시도해 주세요.");
    }
  }

  function handleClear() {
    setError(null);
    clear.mutate();
  }

  return (
    <Card>
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-2">
        구글 시트 내보내기
      </h2>
      <p className="text-[15px] text-body-soft leading-[1.5] mb-4">
        자산과 부채, 통장 쪼개기 내역을 내 구글 시트의 dotori_ 탭으로 보내요. 연결하면 자산을 갱신할 때마다 자동으로 보내요.
      </p>

      {last?.status === "ok" && (
        <Banner message={`${formatDateTime(last.at)}에 내보냈어요.`} className="mb-4" />
      )}
      {last?.status === "error" && (
        <div
          className="rounded-[16px] px-4 py-[14px] mb-4 text-[15px] leading-[1.5]"
          style={{ backgroundColor: "#FDECEE", color: "#F04452" }}
          role="alert"
        >
          {formatDateTime(last.at)} 내보내기에 실패했어요. {last.message}
        </div>
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

      {config ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 rounded-[12px] bg-surface-soft px-4 py-3">
            <span className="text-[13px] font-semibold leading-[1.45] text-body-soft">연결한 웹앱</span>
            <span className="text-[13px] text-muted leading-[1.45] break-all">{config.webAppUrl}</span>
          </div>
          <Button
            variant="secondary"
            onClick={() => exportNow.mutate()}
            disabled={exportNow.isPending}
            className="w-full"
          >
            {exportNow.isPending ? "내보내는 중..." : "지금 내보내기"}
          </Button>
          <Button
            variant="weak"
            onClick={handleClear}
            disabled={clear.isPending}
            className="w-full"
          >
            {clear.isPending ? "해제하는 중..." : "연결 해제하기"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-1 list-decimal pl-5 text-[13px] text-body-soft leading-[1.5]">
            {SETUP_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <TextInput
            inputId="sheet-url"
            label="웹앱 URL"
            value={url}
            onChange={setUrl}
            placeholder="https://script.google.com/macros/s/.../exec"
            inputMode="url"
            autoComplete="off"
          />
          <TextInput
            inputId="sheet-secret"
            label="비밀키"
            value={secret}
            onChange={setSecret}
            masked
            placeholder="DOTORI_SECRET에 넣은 값"
            autoComplete="off"
          />
          <Button variant="primary" onClick={handleSave} disabled={save.isPending} className="w-full">
            {save.isPending ? "연결하는 중..." : "연결하기"}
          </Button>
        </div>
      )}

      <p className="text-[13px] text-muted leading-[1.45] mt-4">
        시트에는 금액이 그대로 올라가요. 시트 공유 범위를 꼭 확인해 주세요.
      </p>
    </Card>
  );
}
