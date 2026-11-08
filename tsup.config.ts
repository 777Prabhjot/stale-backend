import { defineConfig } from "tsup";

/*
 * Bundles our own code (including src/shared and the generated Prisma client) into dist/.
 * npm packages stay external and are loaded from node_modules at runtime.
 */
export default defineConfig({
  entry: { server: "src/server.ts", vercel: "src/vercel.ts" },
  format: "esm",
  outExtension: () => ({ js: ".mjs" }),
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
});
