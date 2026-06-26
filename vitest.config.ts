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
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
