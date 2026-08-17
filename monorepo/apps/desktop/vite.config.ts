import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: { entry: "electron/main.ts" },
      preload: { input: "electron/preload.ts" },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../../packages/shared/src"),
      "@ui": resolve(__dirname, "../../packages/ui/src"),
    },
  },
});
