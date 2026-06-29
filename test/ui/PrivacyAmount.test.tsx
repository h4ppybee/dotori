import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";

const mockPrivacy = vi.fn();
vi.mock("@/lib/query/use-settings", () => ({
  usePrivacyAmounts: () => mockPrivacy(),
}));

beforeEach(() => {
  mockPrivacy.mockReset();
});

describe("PrivacyAmount", () => {
  it("프라이버시 OFF면 children을 그대로 노출하고 버튼이 없다", () => {
    mockPrivacy.mockReturnValue(false);
    render(<PrivacyAmount revealLabel="총평가금 보기"><span>₩1,234</span></PrivacyAmount>);
    expect(screen.getByText("₩1,234")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "총평가금 보기" })).toBeNull();
  });

  it("프라이버시 ON이면 초기엔 노출 버튼을 렌더한다", () => {
    mockPrivacy.mockReturnValue(true);
    render(<PrivacyAmount revealLabel="총평가금 보기"><span>₩1,234</span></PrivacyAmount>);
    expect(screen.getByRole("button", { name: "총평가금 보기" })).toBeInTheDocument();
  });

  it("프라이버시 ON에서 탭하면 선명해진다(버튼 사라짐)", () => {
    mockPrivacy.mockReturnValue(true);
    render(<PrivacyAmount revealLabel="총평가금 보기"><span>₩1,234</span></PrivacyAmount>);
    fireEvent.click(screen.getByRole("button", { name: "총평가금 보기" }));
    expect(screen.queryByRole("button", { name: "총평가금 보기" })).toBeNull();
    expect(screen.getByText("₩1,234")).toBeInTheDocument();
  });
});
