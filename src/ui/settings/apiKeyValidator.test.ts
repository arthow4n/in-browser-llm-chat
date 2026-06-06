import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createActor } from "xstate";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { apiKeyValidatorMachine } from "./apiKeyValidator.js";

const server = setupServer(
  http.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("key") === "valid-gemini") {
        return HttpResponse.json({
          candidates: [{ content: { parts: [{ text: "pong" }] } }],
        });
      }
      return new HttpResponse(null, { status: 401, statusText: "Unauthorized" });
    },
  ),
  http.post("https://openrouter.ai/api/v1/chat/completions", ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (auth === "Bearer valid-openrouter") {
      return HttpResponse.json({
        choices: [{ message: { content: "pong" } }],
      });
    }
    return new HttpResponse(null, { status: 401, statusText: "Unauthorized" });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe("apiKeyValidatorMachine", () => {
  it("transitions to valid when Gemini API key is valid", async () => {
    const actor = createActor(apiKeyValidatorMachine, {
      input: { provider: "gemini" },
    }).start();

    expect(actor.getSnapshot().matches("idle")).toBe(true);

    actor.send({ type: "START_VALIDATION", apiKey: "valid-gemini" });
    expect(actor.getSnapshot().matches("validating")).toBe(true);

    // Wait for the async invoke to finish
    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches("valid") || state.matches("invalid")) {
          resolve();
        }
      });
    });

    expect(actor.getSnapshot().matches("valid")).toBe(true);
    expect(actor.getSnapshot().context.errorMessage).toBeNull();
  });

  it("transitions to invalid when Gemini API key is invalid", async () => {
    const actor = createActor(apiKeyValidatorMachine, {
      input: { provider: "gemini" },
    }).start();

    actor.send({ type: "START_VALIDATION", apiKey: "invalid-gemini" });

    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches("valid") || state.matches("invalid")) {
          resolve();
        }
      });
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("invalid")).toBe(true);
    expect(snapshot.context.errorMessage).toContain("Gemini API error: 401 Unauthorized");
  });

  it("transitions to valid when OpenRouter API key is valid", async () => {
    const actor = createActor(apiKeyValidatorMachine, {
      input: { provider: "openrouter" },
    }).start();

    actor.send({ type: "START_VALIDATION", apiKey: "valid-openrouter" });

    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches("valid") || state.matches("invalid")) {
          resolve();
        }
      });
    });

    expect(actor.getSnapshot().matches("valid")).toBe(true);
  });

  it("transitions to idle on INPUT_CHANGED", async () => {
    const actor = createActor(apiKeyValidatorMachine, {
      input: { provider: "openrouter" },
    }).start();

    actor.send({ type: "START_VALIDATION", apiKey: "valid-openrouter" });

    // Wait for it to become valid
    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.matches("valid")) {
          resolve();
        }
      });
    });

    actor.send({ type: "INPUT_CHANGED", apiKey: "" });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
  });
});
