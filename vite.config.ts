import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths so the build works on GitHub Pages under any repo name.
  base: "./",
  build: {
    // Ship the stylesheet as written; the minifier adds color-scheme helper variables.
    cssMinify: false,
    // Two pages share the stylesheet, the data and the saved villages.
    rollupOptions: { input: { main: "index.html", combat: "combat.html" } },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
