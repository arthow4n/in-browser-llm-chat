import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function (pi: ExtensionAPI) {
  const MAX_REQUESTS = 14;
  const WINDOW_MS = 60 * 1000;
  const statePath = path.join(__dirname, "state.json");

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function ensureStateFile() {
    try {
      await fs.access(statePath);
    } catch {
      await fs.writeFile(statePath, JSON.stringify([]));
    }
  }

  pi.on("before_provider_request", async (_event, ctx) => {
    await ensureStateFile();

    let waitTime = 0;

    // Use lockfile to ensure atomic read/write across processes
    const release = await lockfile.lock(statePath);
    try {
      const data = await fs.readFile(statePath, "utf-8");
      const requestTimestamps: number[] = JSON.parse(data);
      const now = Date.now();

      // Remove timestamps outside the current window
      while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - WINDOW_MS) {
        requestTimestamps.shift();
      }

      if (requestTimestamps.length >= MAX_REQUESTS) {
        const oldestTimestamp = requestTimestamps[0];
        waitTime = oldestTimestamp + WINDOW_MS - now;

        // Reserve the slot by adding the timestamp we expect to have after sleeping
        const expectedTimestamp = Math.max(now, oldestTimestamp + WINDOW_MS);
        requestTimestamps.push(expectedTimestamp);
      } else {
        requestTimestamps.push(now);
      }

      await fs.writeFile(statePath, JSON.stringify(requestTimestamps));
    } finally {
      await release();
    }

    if (waitTime > 0) {
      ctx.ui.notify(
        `Throttling LLM requests (Rate limit: ${MAX_REQUESTS} req/min). Waiting ${Math.round(waitTime / 1000)}s...`,
        "info",
      );
      await sleep(waitTime);
    }
  });
}
