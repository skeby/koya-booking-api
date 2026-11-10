import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test file shares one database and calls /reset, so run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
