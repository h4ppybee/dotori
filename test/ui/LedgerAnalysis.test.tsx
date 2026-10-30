import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryWrapper } from "@/test/utils/query";
import { useAppStore } from "@/stores/app-store";
import { useLedgerStore } from "@/stores/ledger-store";
import { db } from "@/lib/db/schema";
import { deriveKey, makeSalt } from "@/lib/crypto/crypto";
import { listLedgerMonths, putSettings, saveLedgerAmounts, saveLedgerMemo } from "@/lib/db/local-store";
import LedgerAnalysisPage from "@/app/ledger/analysis/page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ledger/analysis",
  useRouter: () => ({ push: vi.fn() }),
}));

// 목록 조회 실패를 흉내 내려고 실제 구현을 감싼 vi.fn으로 바꾼다(기본은 실제 동작).
vi.mock("@/lib/db/local-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/local-store")>();
  return { ...actual, listLedgerMonths: vi.fn(actual.listLedgerMonths) };
});

const EMPTY = "두 달 이상 기록하면 흐름을 볼 수 있어요";

beforeEach(async () => {
  // Date만 가짜로 — IndexedDB·findBy 타이머는 실제 시간으로 둔다.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00"));
  const key = await deriveKey("test-pp", makeSalt());
  useAppStore.setState({ locked: false, sessionKey: key, amountsRevealed: false });
  useLedgerStore.getState().reset();
});

afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
  await db.open();
  useAppStore.setState({ locked: true, sessionKey: null, amountsRevealed: false });
});

function renderPage() {
  return render(<QueryWrapper><LedgerAnalysisPage /></QueryWrapper>);
}

// 가상 예시 금액(실제 데이터 아님).
async function seedTwoMonths() {
  await saveLedgerAmounts("2026-09", {
    "income.salary": 2_000_000,
    "expense.variable.food.dining": 100_000,
    "saving.deposit": 500_000,
  });
  await saveLedgerAmounts("2026-10", {
    "income.salary": 3_000_000,
    "expense.fixed.housing": 500_000,
    "expense.variable.food.delivery": 200_000,
    "saving.deposit": 1_000_000,
  });
}

async function flowSection() {
  return screen.findByRole("region", { name: "수입·지출·저축" });
}

async function categorySection() {
  return screen.findByRole("region", { name: "카테고리별 흐름" });
}

function chip(name: string) {
  return screen.getByRole("button", { name });
}

describe("가계부 분석 화면", () => {
  it("제목은 '분석'이고, 데이터를 불러오기 전에는 안내 문구를 그리지 않는다", async () => {
    renderPage();
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "분석", level: 1 })).toBeInTheDocument();
  });

  it("기간 칩 3개 중 12개월이 기본이고, 누르면 바뀐다", async () => {
    renderPage();
    const group = await screen.findByRole("group", { name: "기간" });
    const chips = within(group).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["6개월", "12개월", "전체"]);
    expect(within(group).getByRole("button", { name: "12개월" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(group).getByRole("button", { name: "6개월" }));
    expect(within(group).getByRole("button", { name: "6개월" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "12개월" })).toHaveAttribute("aria-pressed", "false");
  });

  it("금액이 있는 달이 2개 미만이면 차트 대신 안내한다(메모만 있는 달은 세지 않음)", async () => {
    await saveLedgerAmounts("2026-10", { "income.salary": 3_000_000 });
    await saveLedgerMemo("2026-09", "메모만");
    renderPage();
    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("두 달 이상이면 수입·지출·저축 차트와 범례 3개를 그리고, 달마다 누르기 영역이 있다", async () => {
    await seedTwoMonths();
    renderPage();
    const flow = await flowSection();
    expect(within(flow).getByRole("img", { name: /수입·지출·저축.*2025년 11월부터 2026년 10월까지/ })).toBeInTheDocument();
    const legend = within(flow).getByRole("list", { name: "범례" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["수입", "지출", "저축"]);
    expect(within(flow).getAllByRole("button", { name: /^\d{4}년 \d{1,2}월$/ })).toHaveLength(12);
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
  });

  it("6개월로 바꾸면 축이 6개월로 줄어든다", async () => {
    await seedTwoMonths();
    renderPage();
    const flow = await flowSection();
    fireEvent.click(screen.getByRole("button", { name: "6개월" }));
    expect(within(flow).getAllByRole("button", { name: /^\d{4}년 \d{1,2}월$/ })).toHaveLength(6);
    expect(within(flow).getByRole("button", { name: "2026년 5월" })).toBeInTheDocument();
    expect(within(flow).queryByRole("button", { name: "2026년 4월" })).not.toBeInTheDocument();
  });

  it("전체를 고르면 금액이 있는 가장 오래된 달부터 축을 만든다", async () => {
    await saveLedgerAmounts("2025-01", { "income.salary": 2_000_000 });
    await saveLedgerAmounts("2026-10", { "income.salary": 3_000_000 });
    renderPage();
    // 12개월 축에는 금액 있는 달이 하나뿐이라 안내가 뜬다.
    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    const flow = await flowSection();
    const months = within(flow).getAllByRole("button", { name: /^\d{4}년 \d{1,2}월$/ });
    expect(months).toHaveLength(22);
    expect(months[0]).toHaveAccessibleName("2025년 1월");
  });

  it("0원인 막대는 그리지 않는다", async () => {
    await seedTwoMonths();
    renderPage();
    const flow = await flowSection();
    // 12개월 중 수입·저축이 있는 달은 2개 → 막대 4개.
    expect(flow.querySelectorAll("[data-flow-bar='income']")).toHaveLength(2);
    expect(flow.querySelectorAll("[data-flow-bar='saving']")).toHaveLength(2);
  });

  it("목록을 불러오지 못하면 안내를 보여준다", async () => {
    vi.mocked(listLedgerMonths).mockRejectedValueOnce(new Error("fail"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("가계부를 불러오지 못했어요. 다시 열어 주세요.");
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
  });

  it("말풍선은 고른 달 버튼에 aria-describedby로 이어지고, 바깥을 누르거나 Escape로 닫힌다", async () => {
    await seedTwoMonths();
    renderPage();
    const flow = await flowSection();
    const october = within(flow).getByRole("button", { name: "2026년 10월" });
    fireEvent.click(october);
    const tip = within(flow).getByRole("tooltip");
    expect(october).toHaveAttribute("aria-describedby", tip.id);

    fireEvent.pointerDown(document.body);
    expect(within(flow).queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(october);
    expect(within(flow).getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(flow).queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("차트를 누르고 문지르면 손가락 아래 달로 말풍선이 옮겨 가고, 고른 달을 다시 탭하면 닫힌다", async () => {
    await seedTwoMonths();
    renderPage();
    const flow = await flowSection();
    const scrub = flow.querySelector<HTMLElement>("[data-chart-scrub]");
    expect(scrub).not.toBeNull();
    // jsdom에는 레이아웃이 없으므로 화면 폭을 viewBox와 같은 320px로 가정한다.
    vi.spyOn(scrub!, "getBoundingClientRect").mockReturnValue(
      { left: 0, top: 0, width: 320, height: 180, right: 320, bottom: 180, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
    );
    // 12개월 축: 슬롯 폭 24, 마지막 달(10월) 중심 x=292, 9월 중심 x=268.
    fireEvent.pointerDown(scrub!, { clientX: 292, pointerId: 1 });
    expect(within(within(flow).getByRole("tooltip")).getByText("2026년 10월")).toBeInTheDocument();
    fireEvent.pointerMove(scrub!, { clientX: 268, pointerId: 1 });
    expect(within(within(flow).getByRole("tooltip")).getByText("2026년 9월")).toBeInTheDocument();
    fireEvent.pointerUp(scrub!, { clientX: 268, pointerId: 1 });
    // 누르지 않은 채 움직이면 바뀌지 않는다.
    fireEvent.pointerMove(scrub!, { clientX: 292, pointerId: 1 });
    expect(within(within(flow).getByRole("tooltip")).getByText("2026년 9월")).toBeInTheDocument();

    fireEvent.pointerDown(scrub!, { clientX: 268, pointerId: 1 });
    fireEvent.pointerUp(scrub!, { clientX: 268, pointerId: 1 });
    expect(within(flow).queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("달 버튼은 하나만 탭 순서에 있고, ←/→로 옮겨 다닌다", async () => {
    await seedTwoMonths();
    renderPage();
    const flow = await flowSection();
    const buttons = within(flow).getAllByRole("button", { name: /^\d{4}년 \d{1,2}월$/ });
    expect(buttons.filter((b) => b.tabIndex === 0)).toEqual([buttons[0]]);

    const october = within(flow).getByRole("button", { name: "2026년 10월" });
    fireEvent.click(october);
    expect(buttons.filter((b) => b.tabIndex === 0)).toEqual([october]);

    fireEvent.keyDown(october, { key: "ArrowLeft" });
    const september = within(flow).getByRole("button", { name: "2026년 9월" });
    expect(september).toHaveAttribute("aria-pressed", "true");
    expect(september).toHaveFocus();
    expect(september.tabIndex).toBe(0);
    expect(within(within(flow).getByRole("tooltip")).getByText("2026년 9월")).toBeInTheDocument();

    fireEvent.keyDown(september, { key: "ArrowRight" });
    expect(october).toHaveFocus();
    // 끝 달에서 →는 그대로.
    fireEvent.keyDown(october, { key: "ArrowRight" });
    expect(october).toHaveFocus();
  });

  it("달을 누르면 말풍선에 그 달 수입·지출·저축이 뜨고, 다시 누르면 닫힌다", async () => {
    await seedTwoMonths();
    renderPage();
    const flow = await flowSection();
    const october = within(flow).getByRole("button", { name: "2026년 10월" });
    fireEvent.click(october);
    expect(october).toHaveAttribute("aria-pressed", "true");
    const tip = within(flow).getByRole("tooltip");
    expect(within(tip).getByText("2026년 10월")).toBeInTheDocument();
    expect(within(tip).getByText("₩3,000,000")).toBeInTheDocument();
    expect(within(tip).getByText("₩700,000")).toBeInTheDocument();
    expect(within(tip).getByText("₩1,000,000")).toBeInTheDocument();

    // 다른 달을 누르면 그 달로 바뀐다.
    fireEvent.click(within(flow).getByRole("button", { name: "2026년 9월" }));
    expect(within(within(flow).getByRole("tooltip")).getByText("₩2,000,000")).toBeInTheDocument();

    fireEvent.click(within(flow).getByRole("button", { name: "2026년 9월" }));
    expect(within(flow).queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("금액 숨기기가 켜져 있으면 말풍선 값을 가린다", async () => {
    await putSettings({ id: "app", kdfSalt: "s", verifier: "v", schemaVersion: 1, privacyAmounts: true });
    await seedTwoMonths();
    renderPage();
    const flow = await flowSection();
    fireEvent.click(within(flow).getByRole("button", { name: "2026년 10월" }));
    const tip = within(flow).getByRole("tooltip");
    expect(await within(tip).findAllByRole("button", { name: /금액 보기/ })).toHaveLength(3);
  });

  describe("카테고리별 차트", () => {
    it("기본은 식비 하나를 고르고 선 하나를 그린다", async () => {
      await seedTwoMonths();
      renderPage();
      const section = await categorySection();
      expect(within(section).getByRole("img", { name: /식비/ })).toBeInTheDocument();
      expect(chip("식비")).toHaveAttribute("aria-pressed", "true");
      expect(section.querySelectorAll("[data-ledger-line]")).toHaveLength(1);
      // 칩 라벨은 겹치지 않는다.
      expect(chip("기타(지출)")).toBeInTheDocument();
      expect(chip("기타(저축)")).toBeInTheDocument();
    });

    it("칩을 더 고르면 선이 늘고, 마지막 칩은 해제되지 않는다", async () => {
      await seedTwoMonths();
      renderPage();
      const section = await categorySection();
      fireEvent.click(chip("외식"));
      expect(chip("외식")).toHaveAttribute("aria-pressed", "true");
      expect(section.querySelectorAll("[data-ledger-line]")).toHaveLength(2);

      fireEvent.click(chip("식비"));
      expect(chip("식비")).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(chip("외식"));
      expect(chip("외식")).toHaveAttribute("aria-pressed", "true");
      expect(section.querySelectorAll("[data-ledger-line]")).toHaveLength(1);
    });

    it("4개에서 새로 고르면 가장 먼저 고른 것이 빠진다", async () => {
      await seedTwoMonths();
      renderPage();
      await categorySection();
      ["배달", "외식", "식재료", "월급"].forEach((name) => fireEvent.click(chip(name)));
      expect(chip("식비")).toHaveAttribute("aria-pressed", "false");
      ["배달", "외식", "식재료", "월급"].forEach((name) => {
        expect(chip(name)).toHaveAttribute("aria-pressed", "true");
      });
    });

    it("칩 색 점은 슬롯 색이고, 다른 칩을 빼도 남은 색은 그대로다", async () => {
      await seedTwoMonths();
      renderPage();
      await categorySection();
      const dot = (name: string) => chip(name).querySelector("[data-slot-dot]");
      expect(dot("식비")).toHaveStyle({ backgroundColor: "#A87342" });
      expect(dot("월급")).toBeNull();

      fireEvent.click(chip("외식"));
      expect(dot("외식")).toHaveStyle({ backgroundColor: "#F04452" });

      fireEvent.click(chip("식비"));
      expect(dot("외식")).toHaveStyle({ backgroundColor: "#F04452" });
      fireEvent.click(chip("배달"));
      expect(dot("배달")).toHaveStyle({ backgroundColor: "#A87342" });
    });

    it("달을 누르면 고른 카테고리의 그 달 금액이 말풍선에 뜬다", async () => {
      await seedTwoMonths();
      renderPage();
      const section = await categorySection();
      fireEvent.click(chip("외식"));
      fireEvent.click(within(section).getByRole("button", { name: "2026년 10월" }));
      const tip = within(section).getByRole("tooltip");
      expect(within(tip).getByText("식비")).toBeInTheDocument();
      expect(within(tip).getByText("₩200,000")).toBeInTheDocument();
      expect(within(tip).getByText("외식")).toBeInTheDocument();
      expect(within(tip).getByText("₩0")).toBeInTheDocument();
    });
  });
});
