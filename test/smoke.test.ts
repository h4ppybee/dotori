import { describe, it, expect } from "vitest";
describe("harness", () => {
  it("runs", () => expect(1 + 1).toBe(2));
  it("has indexedDB", () => expect(typeof indexedDB).toBe("object"));
  it("has webcrypto", () => expect(typeof crypto.subtle).toBe("object"));
});
