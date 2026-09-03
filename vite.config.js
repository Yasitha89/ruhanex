import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
});
