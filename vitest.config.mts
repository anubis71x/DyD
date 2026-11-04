import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd()) } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
