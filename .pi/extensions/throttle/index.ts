import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ThrottleState {
  maxRequests: number;
  timestamps: number[];
}

export default function (pi: ExtensionAPI) {
  const DEFAULT_MAX_REQUESTS = 14;
  const WINDOW_MS = 60 * 1000;
  const statePath = path.join(__dirname, "state.json");

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function ensureStateFile() {
    try {
      const data = await fs.readFile(statePath, "utf-8");
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        const timestamps = Array.isArray(parsed) ? parsed : [];
        await fs.writeFile(statePath, JSON.stringify({ maxRequests: DEFAULT_MAX_REQUESTS, timestamps }));
      }
    } catch {
      await fs.writeFile(statePath, JSON.stringify({ maxRequests: DEFAULT_MAX_REQUESTS, timestamps: [] }));
    }
  }

  async function withLock<T>(fn: (state: ThrottleState) => Promise<{ newState: ThrottleState; result: T }>): Promise<T> {
    await ensureStateFile();
    const release = await lockfile.lock(statePath);
    try {
      const data = await fs.readFile(statePath, "utf-8");
      const state: ThrottleState = JSON.parse(data);
      const { newState, result } = await fn(state);
      await fs.writeFile(statePath, JSON.stringify(newState));
      return result;
    } finally {
      await release();
    }
  }

  pi.registerCommand("throttle-rpm", {
    description: "Change the LLM request rate limit (RPM)",
    handler: async (args, ctx) => {
      const rpm = parseInt(args, 10);
      if (isNaN(rpm) || rpm <= 0) {
        ctx.ui.notify("Please provide a positive number for RPM.", "error");
        return;
      }

      await withLock(async (state) => {
        return {
          newState: { ...state, maxRequests: rpm },
          result: rpm,
        };
      });

      ctx.ui.notify(`LLM rate limit updated to ${rpm} req/min.`, "info");
    },
  });

  pi.on("before_provider_request", async (_event, ctx) => {
    let waitTime = 0;
    let currentMax = DEFAULT_MAX_REQUESTS;

    await withLock(async (state) => {
      currentMax = state.maxRequests;
      const timestamps = [...state.timestamps];
      const now = Date.now();

      // Remove timestamps outside the current window
      while (timestamps.length > 0 && timestamps[0] <= now - WINDOW_MS) {
        timestamps.shift();
      }

      if (timestamps.length >= currentMax) {
        const oldestTimestamp = timestamps[0];
        waitTime = oldestTimestamp + WINDOW_MS - now;

        // Reserve the slot by adding the timestamp we expect to have after sleeping
        const expectedTimestamp = Math.max(now, oldestTimestamp + WINDOW_MS);
        timestamps.push(expectedTimestamp);
      } else {
        timestamps.push(now);
      }

      return {
        newState: { ...state, timestamps },
        result: waitTime,
      };
    });

    if (waitTime > 0) {
      ctx.ui.notify(
        `Throttling LLM requests (Rate limit: ${currentMax} req/min). Waiting ${Math.round(waitTime / 1000)}s...`,
        "info",
      );
      await sleep(waitTime);
    }
  });
}
