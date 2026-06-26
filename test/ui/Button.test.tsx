import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("children을 렌더링한다", () => {
    render(<Button>저장하기</Button>);
    expect(screen.getByText("저장하기")).toBeInTheDocument();
  });

  it("onClick을 호출한다", () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>클릭</Button>);
    fireEvent.click(screen.getByText("클릭"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("disabled 상태에서는 onClick을 호출하지 않는다", () => {
    const handler = vi.fn();
    render(<Button onClick={handler} disabled>비활성</Button>);
    fireEvent.click(screen.getByText("비활성"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("primary variant가 기본 variant이다", () => {
    render(<Button>기본</Button>);
    const btn = screen.getByText("기본");
    expect(btn).toHaveClass("bg-primary");
  });

  it("secondary variant 클래스가 적용된다", () => {
    render(<Button variant="secondary">보조</Button>);
    const btn = screen.getByText("보조");
    expect(btn).toHaveClass("bg-primary-surface");
  });

  it("weak variant 클래스가 적용된다", () => {
    render(<Button variant="weak">약한</Button>);
    const btn = screen.getByText("약한");
    expect(btn).toHaveClass("bg-surface-strong");
  });
});
