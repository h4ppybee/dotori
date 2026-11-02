import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { db } from "@/lib/db/schema";
import { useAppStore } from "@/stores/app-store";
import { saveSheetExportConfig, saveSyncConfig } from "@/lib/db/local-store";
import { renderWithQuery } from "@/test/utils/query";
import { makeSessionKey, TEST_SECRET, TEST_WEB_APP_URL } from "@/test/device-sync/helpers";

vi.mock("@/lib/device-sync/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/device-sync/engine")>()),
  startFirstDevice: vi.fn(),
}));

import { startFirstDevice } from "@/lib/device-sync/engine";
import { DeviceSyncPanel } from "@/components/settings/DeviceSyncPanel";

afterEach(async () => {
  vi.clearAllMocks();
  useAppStore.setState({ locked: true, sessionKey: null, lastDeviceSync: null, syncConflict: null });
  await db.delete();
  await db.open();
});

async function unlockWithSheet(withSheet: boolean) {
  const key = await makeSessionKey();
  useAppStore.setState({ locked: false, sessionKey: key });
  if (withSheet) {
    await saveSheetExportConfig(key, { webAppUrl: TEST_WEB_APP_URL, secret: TEST_SECRET });
  }
  return key;
}

describe("DeviceSyncPanel", () => {
  it("시트 연결이 없으면 먼저 연결하라고 안내한다", async () => {
    await unlockWithSheet(false);
    renderWithQuery(<DeviceSyncPanel />);
    expect(screen.getByRole("heading", { level: 2, name: "기기 동기화" })).toBeInTheDocument();
    expect(await screen.findByText(/구글 시트 내보내기.*먼저 연결/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 기기에서 처음 시작하기" })).not.toBeInTheDocument();
  });

  it("동기화 설정이 남아 있는데 시트 연결이 없으면 멈춘 이유를 안내한다", async () => {
    const key = await unlockWithSheet(false);
    await saveSyncConfig(key, {
      syncKeyText: "TEST-KEY0-TEXT", keyId: "0011223344556677", deviceName: "테스트 기기",
      lastRevision: 1, lastSyncedHash: "h",
    });
    renderWithQuery(<DeviceSyncPanel />);
    expect(await screen.findByText("시트 연결이 해제돼 동기화가 멈췄어요. 시트 연결을 다시 하면 이어서 동기화돼요."))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "지금 동기화하기" })).not.toBeInTheDocument();
  });

  it("꺼져 있으면 시작·연결 버튼과 기본 기기 이름을 보여준다", async () => {
    await unlockWithSheet(true);
    renderWithQuery(<DeviceSyncPanel />);
    expect(await screen.findByRole("button", { name: "이 기기에서 처음 시작하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다른 기기에서 연결하기" })).toBeInTheDocument();
    expect((screen.getByLabelText("이 기기 이름") as HTMLInputElement).value).not.toBe("");
  });

  it("처음 시작에 성공하면 동기화 키를 보여준다", async () => {
    await unlockWithSheet(true);
    vi.mocked(startFirstDevice).mockResolvedValue({ status: "ok", keyText: "TEST-KEY0-TEXT" });
    renderWithQuery(<DeviceSyncPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "이 기기에서 처음 시작하기" }));
    expect(await screen.findByText("TEST-KEY0-TEXT")).toBeInTheDocument();
  });

  it("이미 다른 기기가 시작했으면 연결 입력으로 안내한다", async () => {
    await unlockWithSheet(true);
    vi.mocked(startFirstDevice).mockResolvedValue({ status: "alreadyStarted" });
    renderWithQuery(<DeviceSyncPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "이 기기에서 처음 시작하기" }));
    expect(await screen.findByText(/이미 다른 기기에서 시작했어요/)).toBeInTheDocument();
    expect(screen.getByLabelText("동기화 키")).toBeInTheDocument();
  });

  it("켜져 있으면 기기 이름·출처·지금 동기화·끄기를 보여준다", async () => {
    const key = await unlockWithSheet(true);
    await saveSyncConfig(key, {
      syncKeyText: "TEST-KEY0-TEXT", keyId: "0011223344556677", deviceName: "테스트 기기",
      lastRevision: 1, lastSyncedHash: "h",
    });
    useAppStore.setState({
      lastDeviceSync: { at: 1, status: "ok", remote: { revision: 1, savedAt: "2026-01-01T00:00:00.000Z", deviceName: "다른 기기" } },
    });
    renderWithQuery(<DeviceSyncPanel />);
    expect(await screen.findByRole("button", { name: "지금 동기화하기" })).toBeInTheDocument();
    expect(screen.getByText("테스트 기기")).toBeInTheDocument();
    expect(screen.getByText(/^다른 기기 · /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "동기화 끄기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새 키로 다시 시작하기" })).toBeInTheDocument();
  });
});
