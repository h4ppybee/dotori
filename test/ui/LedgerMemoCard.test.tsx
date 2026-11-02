import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeTestQueryClient } from "@/test/utils/query";
import { db } from "@/lib/db/schema";
import { saveLedgerMemo } from "@/lib/db/local-store";
import { LedgerMemoCard } from "@/components/ledger/LedgerMemoCard";

vi.mock("@/lib/db/local-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/local-store")>();
  return { ...actual, saveLedgerMemo: vi.fn(actual.saveLedgerMemo) };
});

afterEach(async () => {
  vi.clearAllMocks();
  await db.delete();
  await db.open();
});

const MONTH = "2026-10";

function renderCard(initialMemo: string) {
  const client = makeTestQueryClient();
  const ui = (memo: string) => (
    <QueryClientProvider client={client}>
      <LedgerMemoCard month={MONTH} initialMemo={memo} />
    </QueryClientProvider>
  );
  const result = render(ui(initialMemo));
  return { ...result, rerenderWith: (memo: string) => result.rerender(ui(memo)) };
}

const textarea = () => screen.getByLabelText("월간 회고") as HTMLTextAreaElement;

describe("LedgerMemoCard — 기기 동기화로 회고가 바뀔 때", () => {
  it("입력 중이 아니면 받은 회고로 바꾸고, 이후 blur가 옛 값으로 덮어쓰지 않는다", async () => {
    const { rerenderWith } = renderCard("이전 회고");
    expect(textarea().value).toBe("이전 회고");

    rerenderWith("다른 기기 회고");

    expect(textarea().value).toBe("다른 기기 회고");
    fireEvent.blur(textarea());
    expect(saveLedgerMemo).not.toHaveBeenCalled();
  });

  it("사용자가 먼저 입력했으면 입력한 글을 지키고 그대로 저장한다", async () => {
    const { rerenderWith } = renderCard("이전 회고");
    fireEvent.change(textarea(), { target: { value: "내가 쓰는 중" } });

    rerenderWith("다른 기기 회고");

    expect(textarea().value).toBe("내가 쓰는 중");
    fireEvent.blur(textarea());
    await waitFor(() => expect(saveLedgerMemo).toHaveBeenCalledWith(MONTH, "내가 쓰는 중"));
  });

  it("입력했다가 원래 값으로 되돌리고 blur하면, 이후 받은 회고를 반영한다", async () => {
    const { rerenderWith } = renderCard("이전 회고");
    fireEvent.change(textarea(), { target: { value: "잠깐 고침" } });
    fireEvent.change(textarea(), { target: { value: "이전 회고" } });
    fireEvent.blur(textarea());
    expect(saveLedgerMemo).not.toHaveBeenCalled();

    rerenderWith("다른 기기 회고");

    expect(textarea().value).toBe("다른 기기 회고");
  });

  it("저장한 뒤 받은 회고는 다시 반영한다", async () => {
    const { rerenderWith } = renderCard("이전 회고");
    fireEvent.change(textarea(), { target: { value: "저장할 글" } });
    fireEvent.blur(textarea());
    await waitFor(() => expect(saveLedgerMemo).toHaveBeenCalledTimes(1));

    rerenderWith("다른 기기 회고");

    expect(textarea().value).toBe("다른 기기 회고");
  });
});
