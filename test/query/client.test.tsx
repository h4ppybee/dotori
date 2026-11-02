import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { stop } = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock("@/lib/device-sync/engine", () => ({ startDeviceSync: vi.fn(() => stop) }));

import { startDeviceSync } from "@/lib/device-sync/engine";
import { QueryProvider } from "@/lib/query/client";

describe("QueryProvider", () => {
  it("기기 동기화 엔진을 한 번 등록하고, 언마운트하면 해제한다", () => {
    const { unmount } = render(<QueryProvider><p>내용</p></QueryProvider>);
    expect(screen.getByText("내용")).toBeInTheDocument();
    expect(startDeviceSync).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
