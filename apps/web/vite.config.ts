import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import pkg from "./package.json";

let commitSha = "";
try {
  commitSha = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  commitSha = process.env.GITHUB_SHA?.substring(0, 7) || process.env.COMMIT_SHA || "";
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT_SHA__: JSON.stringify(commitSha),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/docs": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
