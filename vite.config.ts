/// <reference types="vitest" />
import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";

import react from "@vitejs/plugin-react";

const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const repositoryName = process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
  : "/";

const commitHash = (() => {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA;
  }
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "unknown";
  }
})();

process.env.VITE_COMMIT_HASH = process.env.VITE_COMMIT_HASH || commitHash;

export default defineConfig({
  base: isGithubActions ? repositoryName : "/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
