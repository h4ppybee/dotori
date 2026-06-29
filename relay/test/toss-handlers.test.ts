import { describe, it, expect, vi, afterEach } from "vitest";
import { handlers } from "../src/toss-handlers";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toss-handlers", () => {
  it("token: exchangeToken 위임 → {accessToken, expiresIn}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ access_token: "tok", expires_in: 3600 })),
    );
    const res = await handlers.token({ clientId: "id", clientSecret: "sec" });
    expect(res).toEqual({ accessToken: "tok", expiresIn: 3600 });
  });

  it("accounts: fetchAccounts 위임 → {accounts}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ result: [{ accountSeq: "A1" }, { accountSeq: "A2" }] })),
    );
    const res = await handlers.accounts({ token: "tok" });
    expect(res).toEqual({ accounts: ["A1", "A2"] });
  });

  it("exchange-rate: fetchExchangeRate 위임 → {rate}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ result: { rate: 1380.5 } })),
    );
    const res = await handlers["exchange-rate"]({ token: "tok" });
    expect(res).toEqual({ rate: 1380.5 });
  });
});
