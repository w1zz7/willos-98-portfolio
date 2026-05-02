import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest config — pure-function quant primitives + backtest + regression.
// Kept minimal because there are no React-specific tests yet; if/when those
// land, layer on @testing-library/react and jsdom (would require a separate
// devDependency install + `environment: "jsdom"` here).
export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.ts"],
    environment: "node",
    globals: false,
    reporters: "default",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
