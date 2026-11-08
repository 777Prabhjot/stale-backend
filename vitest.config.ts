import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the tsconfig `paths` (Vitest doesn't read them).
    alias: [
      { find: /^@shared\/(.*)$/, replacement: fileURLToPath(new URL("./src/shared/$1", import.meta.url)) },
    ],
  },
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // All test files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
