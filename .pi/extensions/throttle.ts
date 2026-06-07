import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const MAX_REQUESTS = 14;
  const WINDOW_MS = 60 * 1000;
  const requestTimestamps: number[] = [];

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  pi.on("before_provider_request", async (_event, ctx) => {
    let now = Date.now();

    // Remove timestamps outside the current window
    while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - WINDOW_MS) {
      requestTimestamps.shift();
    }

    if (requestTimestamps.length >= MAX_REQUESTS) {
      const oldestTimestamp = requestTimestamps[0];
      const waitTime = oldestTimestamp + WINDOW_MS - now;

      // Reserve the slot by adding the timestamp we expect to have after sleeping
      const expectedTimestamp = Math.max(now, oldestTimestamp + WINDOW_MS);
      requestTimestamps.push(expectedTimestamp);

      if (waitTime > 0) {
        ctx.ui.notify(
          `Throttling LLM requests (Rate limit: ${MAX_REQUESTS} req/min). Waiting ${Math.round(waitTime / 1000)}s...`,
          "info",
        );
        await sleep(waitTime);
      }
    } else {
      requestTimestamps.push(now);
    }
  });
}
