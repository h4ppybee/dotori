import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryWrapper } from "@/test/utils/query";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/schema";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";
import { listLedgerMonths, putSettings, saveLedgerAmounts, saveLedgerMemo } from "@/lib/db/local-store";
import LedgerPage from "@/app/ledger/page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ledger",
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(async () => {
  // Date만 가짜로 — IndexedDB·findBy 타이머는 실제 시간으로 둔다.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00"));
  const key = await deriveKey("test-pp", makeSalt());
  useAppStore.setState({ locked: false, sessionKey: key, amountsRevealed: false });
});

afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null, amountsRevealed: false });
});

function renderPage() {
  return render(<QueryWrapper><LedgerPage /></QueryWrapper>);
}

// 가상 예시 금액(실제 데이터 아님).
async function seedOctober() {
  await saveLedgerAmounts("2026-10", {
    "income.salary": 3_000_000,
    "expense.fixed.housing": 500_000,
    "expense.variable.food.delivery": 200_000,
    "saving.deposit": 1_000_000,
  });
}

describe("가계부 월별 화면", () => {
  it("데이터를 불러오기 전에는 목록을 그리지 않는다", async () => {
    renderPage();
    expect(screen.queryByRole("region", { name: "수입" })).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "수입" })).toBeInTheDocument();
  });

  it("이번 달이 기본이고, 이전 달로 이동할 수 있으며 다음 달 이후로는 못 간다", async () => {
    renderPage();
    expect(await screen.findByText("2026년 10월")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음 달" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음 달" })).toBeEnabled();
  });

  it("요약 카드에 수입·지출·저축 합계와 남은 돈을 보여준다", async () => {
    await seedOctober();
    renderPage();
    const summary = await screen.findByRole("region", { name: "이번 달 요약" });
    expect(within(summary).getByText("₩3,000,000")).toBeInTheDocument();
    expect(within(summary).getByText("₩700,000")).toBeInTheDocument();
    expect(within(summary).getByText("₩1,000,000")).toBeInTheDocument();
    expect(within(summary).getByText("₩1,300,000")).toBeInTheDocument();
  });

  it("0원 잎도 보기 모드에서 보인다", async () => {
    renderPage();
    const income = await screen.findByRole("region", { name: "수입" });
    expect(within(income).getByText("부수입")).toBeInTheDocument();
    expect(within(income).getAllByText("₩0").length).toBeGreaterThan(0);
  });

  it("편집 → 잎 입력 → 위 노드 합계 즉시 갱신 → 저장하기로 DB에 반영한다(메모 유지)", async () => {
    await seedOctober();
    await saveLedgerMemo("2026-10", "회고");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "편집" }));

    const delivery = screen.getByRole("textbox", { name: "배달" });
    fireEvent.focus(delivery);
    fireEvent.change(delivery, { target: { value: "230000" } });

    const expense = screen.getByRole("region", { name: "지출" });
    expect(within(expense).getByText("₩730,000")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "저장하기" }));
    expect(await screen.findByRole("button", { name: "편집" })).toBeInTheDocument();
    const [row] = await listLedgerMonths();
    expect(row.amounts["expense.variable.food.delivery"]).toBe(230_000);
    expect(row.amounts["income.salary"]).toBe(3_000_000);
    expect(row.memo).toBe("회고");
  });

  it("편집 중에는 월 이동이 비활성이고, 취소하면 변경을 버린다", async () => {
    await seedOctober();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "편집" }));
    expect(screen.getByRole("button", { name: "이전 달" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음 달" })).toBeDisabled();

    const salary = screen.getByRole("textbox", { name: "월급" });
    fireEvent.focus(salary);
    fireEvent.change(salary, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    const summary = screen.getByRole("region", { name: "이번 달 요약" });
    expect(within(summary).getByText("₩3,000,000")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "월급" })).not.toBeInTheDocument();
    const [row] = await listLedgerMonths();
    expect(row.amounts["income.salary"]).toBe(3_000_000);
  });

  it("입력칸은 포커스 중 숫자만, blur 후 천 단위 쉼표로 보이고 0은 빈칸이다", async () => {
    await seedOctober();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "편집" }));
    const salary = screen.getByRole<HTMLInputElement>("textbox", { name: "월급" });
    expect(salary.value).toBe("3,000,000");
    expect(salary).toHaveAttribute("inputmode", "numeric");
    fireEvent.focus(salary);
    expect(salary.value).toBe("3000000");
    fireEvent.change(salary, { target: { value: "1,234" } });
    expect(salary.value).toBe("1234");
    fireEvent.blur(salary);
    expect(salary.value).toBe("1,234");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "부수입" }).value).toBe("");
  });

  it("이번 달이 비고 지난달에 대상 값이 있으면 가져오기가 보이고, 누르면 수입·고정지출·저축만 채워 편집에 들어간다", async () => {
    await saveLedgerAmounts("2026-09", {
      "income.salary": 3_000_000,
      "expense.fixed.housing": 500_000,
      "expense.variable.food.delivery": 200_000,
      "saving.invest": 300_000,
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "지난달에서 가져오기" }));

    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "월급" }).value).toBe("3,000,000");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "주거비" }).value).toBe("500,000");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "투자" }).value).toBe("300,000");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "배달" }).value).toBe("");
    expect(screen.getByRole("button", { name: "지난달에서 가져오기" })).toBeDisabled();
    // 저장 전까지는 확정이 아니다.
    expect((await listLedgerMonths()).map((r) => r.id)).toEqual(["2026-09"]);
  });

  it("이번 달에 금액이 있거나 지난달이 비면 가져오기를 보여주지 않는다", async () => {
    await seedOctober();
    renderPage();
    await screen.findByRole("region", { name: "수입" });
    expect(screen.queryByRole("button", { name: "지난달에서 가져오기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.queryByRole("button", { name: "지난달에서 가져오기" })).not.toBeInTheDocument();
  });

  it("금액 숨기기가 켜져 있으면 금액을 가리고, 편집을 누르면 드러낸다", async () => {
    await putSettings({ id: "app", kdfSalt: "s", verifier: "v", schemaVersion: 1, privacyAmounts: true });
    await seedOctober();
    renderPage();
    expect((await screen.findAllByRole("button", { name: /금액 보기/ })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    expect(screen.queryAllByRole("button", { name: /금액 보기/ })).toHaveLength(0);
  });

  describe("월간 회고", () => {
    it("blur하면 저장하고 '저장했어요'를 보여준다", async () => {
      renderPage();
      const memo = await screen.findByPlaceholderText("이번 달은 어땠나요?");
      fireEvent.change(memo, { target: { value: "외식을 줄였어요" } });
      fireEvent.blur(memo);
      expect(await screen.findByText("저장했어요")).toBeInTheDocument();
      const [row] = await listLedgerMonths();
      expect(row).toMatchObject({ id: "2026-10", memo: "외식을 줄였어요", amounts: {} });
    });

    it("마지막 저장값과 같으면 저장하지 않는다", async () => {
      const { unmount } = renderPage();
      const memo = await screen.findByPlaceholderText("이번 달은 어땠나요?");
      fireEvent.change(memo, { target: { value: "잠깐" } });
      fireEvent.change(memo, { target: { value: "" } });
      fireEvent.blur(memo);
      unmount();
      await new Promise((r) => setTimeout(r, 50));
      expect(await listLedgerMonths()).toHaveLength(0);
      expect(screen.queryByText("저장했어요")).not.toBeInTheDocument();
    });

    it("화면이 사라지면(언마운트) 저장한다", async () => {
      const { unmount } = renderPage();
      const memo = await screen.findByPlaceholderText("이번 달은 어땠나요?");
      fireEvent.change(memo, { target: { value: "언마운트 저장" } });
      unmount();
      await waitFor(async () => {
        expect((await listLedgerMonths())[0]?.memo).toBe("언마운트 저장");
      });
    });

    it("앱이 백그라운드로 가면(visibilitychange hidden) 저장한다", async () => {
      renderPage();
      const memo = await screen.findByPlaceholderText("이번 달은 어땠나요?");
      fireEvent.change(memo, { target: { value: "숨김 저장" } });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      try {
        document.dispatchEvent(new Event("visibilitychange"));
        await waitFor(async () => {
          expect((await listLedgerMonths())[0]?.memo).toBe("숨김 저장");
        });
      } finally {
        Reflect.deleteProperty(document, "visibilityState");
      }
    });

    it("입력을 멈추고 1초가 지나면 저장한다", async () => {
      renderPage();
      const memo = await screen.findByPlaceholderText("이번 달은 어땠나요?");
      fireEvent.change(memo, { target: { value: "디바운스 저장" } });
      expect(await listLedgerMonths()).toHaveLength(0);
      await waitFor(
        async () => {
          expect((await listLedgerMonths())[0]?.memo).toBe("디바운스 저장");
        },
        { timeout: 2500 },
      );
    });

    it("달을 바꾸면 그 달의 회고로 바뀐다", async () => {
      await saveLedgerMemo("2026-09", "9월 회고");
      await saveLedgerMemo("2026-10", "10월 회고");
      renderPage();
      expect(await screen.findByDisplayValue("10월 회고")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "이전 달" }));
      expect(await screen.findByDisplayValue("9월 회고")).toBeInTheDocument();
    });
  });
});
