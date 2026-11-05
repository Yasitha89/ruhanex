import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

// Build the application as one JavaScript bundle.
// Route lazy-loading and dynamic imports have also been removed from src/.
export default defineConfig({
  plugins: [react()],
  build: {
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    https: {
      key: fs.readFileSync(
        new URL("./.cert/localhost-key.pem", import.meta.url),
      ),
      cert: fs.readFileSync(new URL("./.cert/localhost.pem", import.meta.url)),
    },
    proxy: {
      "/api": {
        target: "https://ruhanex.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
