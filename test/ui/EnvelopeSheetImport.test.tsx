import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";
import { saveSheetExportConfig, listEnvelopeItems } from "@/lib/db/local-store";
import { QueryWrapper } from "@/test/utils/query";
import { EnvelopeSheetImport } from "@/components/envelope/EnvelopeSheetImport";

const WEB_APP_URL = "https://script.google.com/macros/s/abc/exec";
// 가상 예시 그리드
const values = [
  ["태그", "은행", "항목", "금액"],
  ["저축", "은행A", "청년도약적금", 50],
  ["생활비", "은행B", "용돈", 20],
  ["태그", "위치", "항목", "금액"],
  ["투자", "본인", "적립식", 30],
];

async function unlock(connected: boolean) {
  const key = await deriveKey("pp", makeSalt());
  useAppStore.setState({ locked: false, sessionKey: key });
  if (connected) {
    await saveSheetExportConfig(key, { webAppUrl: WEB_APP_URL, secret: "s3cret" });
  }
}

const renderIt = () => render(<QueryWrapper><EnvelopeSheetImport heading={<h1>통장 쪼개기</h1>} /></QueryWrapper>);

afterEach(async () => {
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null });
  vi.unstubAllGlobals();
});

describe("EnvelopeSheetImport", () => {
  it("시트 연결이 없으면 제목만 보여주고 버튼은 없다", async () => {
    await unlock(false);
    renderIt();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole("heading", { name: "통장 쪼개기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "시트에서 가져오기" })).toBeNull();
  });

  it("시트를 읽어 개수를 확인받고, 가져오기를 누르면 항목을 교체한다", async () => {
    await unlock(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, text: async () => JSON.stringify({ ok: true, values }),
    }));
    renderIt();

    fireEvent.click(await screen.findByRole("button", { name: "시트에서 가져오기" }));
    expect(await screen.findByText(/아내 2개, 남편 1개를 가져와요/)).toBeInTheDocument();
    expect(await listEnvelopeItems()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
    expect(await screen.findByText("3개 항목을 가져왔어요.")).toBeInTheDocument();
    await waitFor(async () => expect(await listEnvelopeItems()).toHaveLength(3));
  });

  it("읽기에 실패하면 오류를 보여주고 확인 창을 열지 않는다", async () => {
    await unlock(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, text: async () => JSON.stringify({ ok: false, error: "NO_SOURCE_TAB" }),
    }));
    renderIt();

    fireEvent.click(await screen.findByRole("button", { name: "시트에서 가져오기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("시트에 '통장쪼개기' 탭이 없어요.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
