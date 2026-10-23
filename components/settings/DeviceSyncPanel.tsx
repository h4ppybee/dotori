"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Banner } from "@/components/ui/Banner";
import { Dialog } from "@/components/ui/Dialog";
import { formatDateTime } from "@/lib/format";
import { useAppStore } from "@/stores/app-store";
import { useSheetExportConfig } from "@/lib/query/use-sheet-export";
import {
  useDeviceSyncConfig, useStartFirstDevice, usePrepareConnect, useConnectDevice, useSyncNow,
  useDisableDeviceSync, useRestartWithNewKey, useRevealConnectionInfo,
} from "@/lib/query/use-device-sync";
import { defaultDeviceName } from "@/lib/device-sync/device-name";

interface ConnectionInfo {
  webAppUrl: string;
  secret: string;
  keyText: string;
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="rounded-[16px] px-4 py-[14px] text-[15px] leading-[1.5]"
      style={{ backgroundColor: "#FDECEE", color: "#F04452" }}
      role="alert"
    >
      {message}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] bg-surface-soft px-4 py-3">
      <span className="text-[13px] font-semibold leading-[1.45] text-body-soft">{label}</span>
      <span className="text-[15px] leading-[1.5] text-ink break-all tabular-nums">{value}</span>
    </div>
  );
}

// 복사 버튼과 맞춘 안내: 복사는 다른 기기에 바로 붙여넣는 용도로만 쓰고, 어딘가에 보관하지 않게 한다.
const SECRET_NOTICE = "복사했다면 다른 기기에 붙여넣은 뒤 클립보드를 비워 주세요. 채팅이나 메모 앱에는 남기지 않는 게 안전해요.";

function KeyNotice({ keyText }: { keyText: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(keyText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <InfoRow label="동기화 키" value={keyText} />
      <Button variant="text" onClick={handleCopy} className="w-full">
        {copied ? "복사했어요" : "키 복사하기"}
      </Button>
      <p className="text-[13px] text-muted leading-[1.45]">
        다른 기기에서 연결할 때 이 키가 필요해요. {SECRET_NOTICE}
      </p>
    </div>
  );
}

function formatSavedAt(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : formatDateTime(t);
}

/**
 * 기기 동기화 설정. 시트 내보내기 연결(같은 웹앱 URL·비밀키)이 있을 때만 쓸 수 있다.
 * - 시트 미연결: 안내 문구(동기화 설정이 남아 있으면 "동기화가 멈췄어요" 안내)
 * - 꺼짐: 기기 이름 + "이 기기에서 처음 시작하기" / "다른 기기에서 연결하기"
 * - 켜짐: 마지막 동기화·출처 기기·오류, 지금 동기화, 연결 정보 보기, 새 키로 다시 시작, 끄기
 * 결과 표시는 app-store.lastDeviceSync(엔진이 기록). 충돌 선택은 앱 레벨 SyncConflictDialog가 맡는다.
 */
export function DeviceSyncPanel() {
  const { data: sheet } = useSheetExportConfig();
  const { data: config } = useDeviceSyncConfig();
  // 두 설정을 모두 읽기 전에는 상태별 본문을 그리지 않는다(읽는 동안 "먼저 연결" 안내가 깜빡이지 않게).
  const loaded = sheet !== undefined && config !== undefined;
  const last = useAppStore((s) => s.lastDeviceSync);

  const [deviceName, setDeviceName] = useState(() =>
    typeof navigator === "undefined" ? "" : defaultDeviceName(navigator.userAgent),
  );
  const [connecting, setConnecting] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const startFirst = useStartFirstDevice();
  const prepare = usePrepareConnect();
  const connect = useConnectDevice();
  const syncNow = useSyncNow();
  const disable = useDisableDeviceSync();
  const restart = useRestartWithNewKey();
  const reveal = useRevealConnectionInfo();

  const name = deviceName.trim();
  const connectBusy = prepare.isPending || connect.isPending;

  async function handleStartFirst() {
    setError(null);
    if (name === "") {
      setError("기기 이름을 입력해 주세요.");
      return;
    }
    const result = await startFirst.mutateAsync(name);
    if (result.status === "alreadyStarted") {
      setError("이미 다른 기기에서 시작했어요. 그 기기의 동기화 키로 연결해 주세요.");
      setConnecting(true);
      return;
    }
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setCreatedKey(result.keyText);
  }

  async function runConnect() {
    setConfirmReplace(false);
    const outcome = await connect.mutateAsync({ keyText: keyInput, deviceName: name });
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    if (outcome.status !== "applied") {
      setError("받을 데이터를 찾지 못했어요. 다른 기기에서 먼저 동기화해 주세요.");
      return;
    }
    setKeyInput("");
    setConnecting(false);
  }

  async function handleConnect() {
    setError(null);
    if (name === "") {
      setError("기기 이름을 입력해 주세요.");
      return;
    }
    const result = await prepare.mutateAsync(keyInput);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    if (result.hasLocalData) {
      setConfirmReplace(true);
      return;
    }
    await runConnect();
  }

  async function handleReveal() {
    setError(null);
    if (info) {
      setInfo(null);
      return;
    }
    try {
      const revealed = await reveal.mutateAsync();
      // null = 그사이 동기화나 시트 연결이 꺼졌거나 잠긴 경우 — 빈 화면 대신 이유를 알려준다.
      if (revealed === null) {
        setError("연결 정보를 읽지 못했어요. 잠금을 다시 해제한 뒤 시도해 주세요.");
        return;
      }
      setInfo(revealed);
    } catch {
      setError("연결 정보를 읽지 못했어요. 잠금을 다시 해제한 뒤 시도해 주세요.");
    }
  }

  async function handleRestart() {
    setConfirmRestart(false);
    setError(null);
    const result = await restart.mutateAsync();
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    if (result.status === "ok") {
      setInfo(null);
      setCreatedKey(result.keyText);
    }
  }

  async function handleDisable() {
    setConfirmDisable(false);
    setError(null);
    const result = await disable.mutateAsync();
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setCreatedKey(null);
    setInfo(null);
  }

  return (
    <Card>
      <h2 className="text-[19px] font-bold leading-[1.4] tracking-[-0.2px] text-ink mb-2">
        기기 동기화
      </h2>
      <p className="text-[15px] text-body-soft leading-[1.5] mb-4">
        직접 입력한 자산을 내 다른 기기, 가족 기기와 함께 써요. 이 기기에서 암호화한 뒤 내 구글 드라이브에 저장해요.
      </p>

      {!loaded ? null : !sheet ? (
        // 동기화 설정이 남아 있는데 시트 연결이 없으면 엔진이 skipped로 멈춘 상태다 — 이유와 복구 방법을 알려준다.
        <p className="text-[13px] text-muted leading-[1.45]">
          {config
            ? "시트 연결이 해제돼 동기화가 멈췄어요. 시트 연결을 다시 하면 이어서 동기화돼요."
            : "위 '구글 시트 내보내기'를 먼저 연결하면 같은 웹앱으로 동기화할 수 있어요."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {error != null && <ErrorBox message={error} />}
          {createdKey != null && <KeyNotice keyText={createdKey} />}

          {config ? (
            <>
              {last?.status === "ok" && <Banner message={`${formatDateTime(last.at)}에 동기화했어요.`} />}
              {last?.status === "error" && (
                <ErrorBox message={`${formatDateTime(last.at)} 동기화에 실패했어요. ${last.message ?? ""}`} />
              )}
              {last?.status === "conflict" && (
                <ErrorBox message="다른 기기에서 바꾼 내용과 달라요. 지금 동기화하면 어떤 내용을 쓸지 고를 수 있어요." />
              )}
              <InfoRow label="이 기기" value={config.deviceName} />
              {last?.remote && (
                <InfoRow label="마지막 저장" value={`${last.remote.deviceName} · ${formatSavedAt(last.remote.savedAt)}`} />
              )}
              <Button
                variant="secondary"
                onClick={() => syncNow.mutate()}
                disabled={syncNow.isPending}
                className="w-full"
              >
                {syncNow.isPending ? "동기화하는 중..." : "지금 동기화하기"}
              </Button>
              <Button variant="weak" onClick={handleReveal} disabled={reveal.isPending} className="w-full">
                {info ? "연결 정보 숨기기" : "다른 기기 연결 정보 보기"}
              </Button>
              {info && (
                <div className="flex flex-col gap-2">
                  <InfoRow label="웹앱 URL" value={info.webAppUrl} />
                  <InfoRow label="비밀키" value={info.secret} />
                  <InfoRow label="동기화 키" value={info.keyText} />
                  <p className="text-[13px] text-muted leading-[1.45]">
                    다른 기기의 시트 내보내기와 기기 동기화에 이 값을 그대로 넣어요. {SECRET_NOTICE}
                  </p>
                </div>
              )}
              <Button variant="weak" onClick={() => setConfirmRestart(true)} disabled={restart.isPending} className="w-full">
                새 키로 다시 시작하기
              </Button>
              <Button variant="weak" onClick={() => setConfirmDisable(true)} disabled={disable.isPending} className="w-full">
                동기화 끄기
              </Button>
            </>
          ) : (
            <>
              <TextInput
                inputId="sync-device-name"
                label="이 기기 이름"
                value={deviceName}
                onChange={setDeviceName}
                placeholder="예: Mac Chrome"
                autoComplete="off"
                maxLength={40}
              />
              {connecting ? (
                <>
                  <TextInput
                    inputId="sync-key"
                    label="동기화 키"
                    value={keyInput}
                    onChange={setKeyInput}
                    placeholder="XXXX-XXXX-…"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                  <Button variant="primary" onClick={handleConnect} disabled={connectBusy} className="w-full">
                    {connectBusy ? "연결하는 중..." : "연결하기"}
                  </Button>
                  <Button
                    variant="weak"
                    onClick={() => {
                      setConnecting(false);
                      setError(null);
                    }}
                    className="w-full"
                  >
                    처음 화면으로
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="primary" onClick={handleStartFirst} disabled={startFirst.isPending} className="w-full">
                    {startFirst.isPending ? "시작하는 중..." : "이 기기에서 처음 시작하기"}
                  </Button>
                  <Button
                    variant="weak"
                    onClick={() => {
                      setConnecting(true);
                      setError(null);
                    }}
                    className="w-full"
                  >
                    다른 기기에서 연결하기
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      )}

      <Dialog
        open={confirmReplace}
        title="이 기기 데이터를 바꿀까요?"
        onClose={() => setConfirmReplace(false)}
        actionLabel="받아서 바꾸기"
        onAction={() => void runConnect()}
      >
        다른 기기에서 저장한 내용으로 이 기기에서 직접 입력한 데이터를 바꿔요. API 연동과 자동으로 불러온 자산은 그대로 둬요.
      </Dialog>
      <Dialog
        open={confirmRestart}
        title="새 키로 다시 시작할까요?"
        onClose={() => setConfirmRestart(false)}
        actionLabel="다시 시작하기"
        onAction={() => void handleRestart()}
      >
        이 기기 내용으로 새로 시작하고 새 동기화 키를 만들어요. 다른 기기는 새 키로 다시 연결해야 해요.
      </Dialog>
      <Dialog
        open={confirmDisable}
        title="이 기기의 동기화를 끌까요?"
        onClose={() => setConfirmDisable(false)}
        actionLabel="끄기"
        onAction={() => void handleDisable()}
      >
        이 기기의 데이터와 다른 기기는 그대로예요. 다시 켜려면 동기화 키가 필요해요.
      </Dialog>
    </Card>
  );
}
