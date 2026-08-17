import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Acme Web",
        short_name: "Acme",
        theme_color: "#4f46e5",
        icons: [],
      },
    }),
  ],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../../packages/shared/src"),
      "@ui": resolve(__dirname, "../../packages/ui/src"),
    },
  },
});
