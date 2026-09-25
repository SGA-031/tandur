import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Tandur",
        short_name: "Tandur",
        description: "Dompet subsidi sarana produksi pertanian",
        lang: "id",
        start_url: "/",
        display: "standalone",
        background_color: "#F7F3EA",
        theme_color: "#2A6642",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/wallet\//, /^\/verify\//, /^\/ledger\//],
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
    }),
  ],
  server: { port: 5171, host: true },
  preview: { port: 5171 },
});
