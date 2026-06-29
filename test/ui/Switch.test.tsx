import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Switch } from "@/components/ui/Switch";

describe("Switch", () => {
  it("role=switch와 aria-checked를 반영한다", () => {
    render(<Switch checked onChange={() => {}} label="금액 숨기기" />);
    const sw = screen.getByRole("switch", { name: "금액 숨기기" });
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("클릭하면 반대값으로 onChange를 호출한다", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="토글" />);
    fireEvent.click(screen.getByRole("switch", { name: "토글" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("disabled면 onChange를 호출하지 않는다", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="토글" disabled />);
    fireEvent.click(screen.getByRole("switch", { name: "토글" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ON이면 브랜드 색 트랙(bg-primary)을 쓴다", () => {
    render(<Switch checked onChange={() => {}} label="토글" />);
    expect(screen.getByRole("switch", { name: "토글" })).toHaveClass("bg-primary");
  });
});
