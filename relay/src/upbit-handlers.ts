import {
  fetchUpbitAccounts,
  fetchUpbitTickers,
  fetchUpbitMarketNames,
} from "../../lib/upbit/upbit-client.js";

export const upbitHandlers = {
  accounts: (b: { accessKey: string; secretKey: string }) =>
    fetchUpbitAccounts(b.accessKey, b.secretKey).then((rows) => ({ rows })),
  tickers: (b: { markets: string[] }) =>
    fetchUpbitTickers(b.markets).then((prices) => ({ prices })),
  markets: () => fetchUpbitMarketNames().then((names) => ({ names })),
};
