import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberPad } from "@/components/ui/NumberPad";

describe("NumberPad", () => {
  it("0~9 숫자 키를 모두 렌더링한다", () => {
    render(<NumberPad onPress={() => {}} onDelete={() => {}} />);
    for (const digit of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
      expect(screen.getByRole("button", { name: digit })).toBeInTheDocument();
    }
  });

  it("숫자 키를 누르면 해당 숫자로 onPress를 호출한다", () => {
    const onPress = vi.fn();
    render(<NumberPad onPress={onPress} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    expect(onPress).toHaveBeenCalledWith("7");
  });

  it("지우기 키를 누르면 onDelete를 호출한다", () => {
    const onDelete = vi.fn();
    render(<NumberPad onPress={() => {}} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("disabled면 onPress·onDelete를 호출하지 않는다", () => {
    const onPress = vi.fn();
    const onDelete = vi.fn();
    render(<NumberPad onPress={onPress} onDelete={onDelete} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    expect(onPress).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
