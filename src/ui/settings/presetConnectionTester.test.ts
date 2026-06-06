import { describe, it, expect, beforeEach } from "vitest";
import { createActor, waitFor } from "xstate";
import { presetConnectionTesterMachine } from "./presetConnectionTester";
import * as db from "../../db/db";
import { http, HttpResponse } from "msw";
import { server } from "../../test/msw-setup";

describe("presetConnectionTesterMachine", () => {
  beforeEach(async () => {
    // Clear settings before each test
    const dbInstance = await db.getDB();
    await dbInstance.clear("settings");
  });

  it("should start in idle state", () => {
    const actor = createActor(presetConnectionTesterMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("should handle connection success for Gemini with preset key", async () => {
    server.use(
      http.post(/generativelanguage\.googleapis\.com\/v1beta\/models\/.*:generateContent/, () => {
        return HttpResponse.json({ candidates: [] });
      }),
    );

    const actor = createActor(presetConnectionTesterMachine).start();
    actor.send({
      type: "TEST_CONNECTION",
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "custom-gemini-key",
    });

    expect(actor.getSnapshot().value).toBe("testing");

    await waitFor(actor, (state) => state.value === "success", { timeout: 1000 });

    expect(actor.getSnapshot().value).toBe("success");
    expect(actor.getSnapshot().context.latency).toBeTypeOf("number");
    expect(actor.getSnapshot().context.errorMessage).toBeNull();
  });

  it("should handle connection success with global fallback key", async () => {
    await db.setSetting("api_keys", { gemini: "global-gemini-key" });
    server.use(
      http.post(/generativelanguage\.googleapis\.com\/v1beta\/models\/.*:generateContent/, () => {
        return HttpResponse.json({ candidates: [] });
      }),
    );

    const actor = createActor(presetConnectionTesterMachine).start();
    actor.send({
      type: "TEST_CONNECTION",
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "", // empty so it falls back
    });

    expect(actor.getSnapshot().value).toBe("testing");

    await waitFor(actor, (state) => state.value === "success", { timeout: 1000 });

    expect(actor.getSnapshot().value).toBe("success");
  });

  it("should handle connection error if no key is configured", async () => {
    const actor = createActor(presetConnectionTesterMachine).start();
    actor.send({
      type: "TEST_CONNECTION",
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "",
    });

    await waitFor(actor, (state) => state.value === "failure", { timeout: 1000 });

    expect(actor.getSnapshot().value).toBe("failure");
    expect(actor.getSnapshot().context.errorMessage).toContain("No API key configured");
  });

  it("should handle API errors", async () => {
    server.use(
      http.post("https://openrouter.ai/api/v1/chat/completions", () => {
        return new HttpResponse(JSON.stringify({ error: { message: "Invalid API key" } }), {
          status: 403,
          statusText: "Forbidden",
        });
      }),
    );

    const actor = createActor(presetConnectionTesterMachine).start();
    actor.send({
      type: "TEST_CONNECTION",
      provider: "openrouter",
      model: "google/gemini-2.5-flash",
      apiKey: "invalid-key",
    });

    await waitFor(actor, (state) => state.value === "failure", { timeout: 1000 });

    expect(actor.getSnapshot().value).toBe("failure");
    expect(actor.getSnapshot().context.errorMessage).toContain(
      "OpenRouter API error: 403 - Invalid API key",
    );
  });

  it("should allow cancelling the active test", async () => {
    const actor = createActor(presetConnectionTesterMachine).start();
    actor.send({
      type: "TEST_CONNECTION",
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "some-key",
    });

    expect(actor.getSnapshot().value).toBe("testing");
    actor.send({ type: "CANCEL_TEST" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.errorMessage).toBeNull();
    expect(actor.getSnapshot().context.latency).toBeNull();
  });
});
