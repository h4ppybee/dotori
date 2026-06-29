import { defineConfig } from "vitest/config";

// relay는 루트(jsdom + React) 설정을 상속하지 않는 독립 Node 패키지다.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
});
