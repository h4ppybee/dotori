import { describe, it, expect } from "vitest";
import { defaultDeviceName } from "@/lib/device-sync/device-name";

const UA = {
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
};

describe("defaultDeviceName", () => {
  it("OS와 브라우저로 기본 이름을 만든다", () => {
    expect(defaultDeviceName(UA.macChrome)).toBe("Mac Chrome");
    expect(defaultDeviceName(UA.iphoneSafari)).toBe("iPhone Safari");
    expect(defaultDeviceName(UA.androidChrome)).toBe("Android Chrome");
    expect(defaultDeviceName(UA.windowsEdge)).toBe("Windows Edge");
  });

  it("알 수 없으면 일반 이름", () => {
    expect(defaultDeviceName("")).toBe("기기 브라우저");
  });
});
