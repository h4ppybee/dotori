import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

describe("ServiceWorkerRegister", () => {
  it("navigator.serviceWorker가 없어도 null을 반환하고 에러를 발생시키지 않는다", () => {
    // jsdom에는 navigator.serviceWorker가 없음
    const { container } = render(<ServiceWorkerRegister />);
    expect(container.firstChild).toBeNull();
  });
});
