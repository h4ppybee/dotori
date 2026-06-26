import {
  exchangeToken,
  fetchAccounts,
  fetchHoldings,
  fetchPrices,
  fetchExchangeRate,
  type NormalizedHolding,
  type NormalizedPrice,
} from "../../lib/toss/toss-client.js";

export const handlers = {
  token: (b: { clientId: string; clientSecret: string }) =>
    exchangeToken(b.clientId, b.clientSecret).then((t) => ({
      accessToken: t.accessToken,
      expiresIn: t.expiresIn,
    })),
  accounts: (b: { token: string }) =>
    fetchAccounts(b.token).then((accounts) => ({ accounts })),
  holdings: (b: { token: string; accountSeq: string }) =>
    fetchHoldings(b.token, b.accountSeq).then((holdings: NormalizedHolding[]) => ({ holdings })),
  prices: (b: { token: string; symbols: { symbol: string; currency: string }[] }) =>
    fetchPrices(b.token, b.symbols).then((prices: NormalizedPrice[]) => ({ prices })),
  "exchange-rate": (b: { token: string }) =>
    fetchExchangeRate(b.token).then(({ rate }) => ({ rate })),
};
