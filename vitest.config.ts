import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
    // git worktree(.worktrees/*)가 repo 안에 있을 때 테스트가 중복 수집되지 않도록 제외
    // relay/는 독립 패키지(자체 vitest)라 루트 테스트 수집에서 제외 — relay 테스트는 `cd relay && npm test`
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "relay/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
