import { describe, it, expect, beforeEach, vi } from "vitest";
import { createActor } from "xstate";
import { presetConnectionTesterMachine } from "./presetConnectionTester";
import * as db from "../../db/db";

vi.mock("../../db/db", async () => {
  const actual = await vi.importActual("../../db/db");
  return {
    ...actual,
    getSetting: vi.fn<(key: string) => Promise<unknown>>(),
  };
});

describe("presetConnectionTesterMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn<typeof fetch>();
  });

  it("should start in idle state", () => {
    const actor = createActor(presetConnectionTesterMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("should handle connection success for Gemini with preset key", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ candidates: [] })));

    const actor = createActor(presetConnectionTesterMachine).start();
    actor.send({
      type: "TEST_CONNECTION",
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "custom-gemini-key",
    });

    expect(actor.getSnapshot().value).toBe("testing");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(actor.getSnapshot().value).toBe("success");
    expect(actor.getSnapshot().context.latency).toBeTypeOf("number");
    expect(actor.getSnapshot().context.errorMessage).toBeNull();
  });

  it("should handle connection success with global fallback key", async () => {
    vi.mocked(db.getSetting).mockResolvedValue({ gemini: "global-gemini-key" });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ candidates: [] })));

    const actor = createActor(presetConnectionTesterMachine).start();
    actor.send({
      type: "TEST_CONNECTION",
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "", // empty so it falls back
    });

    expect(actor.getSnapshot().value).toBe("testing");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(actor.getSnapshot().value).toBe("success");
    expect(db.getSetting).toHaveBeenCalledWith("api_keys");
  });

  it("should handle connection error if no key is configured", async () => {
    vi.mocked(db.getSetting).mockResolvedValue(null);

    const actor = createActor(presetConnectionTesterMachine).start();
    actor.send({
      type: "TEST_CONNECTION",
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(actor.getSnapshot().value).toBe("failure");
    expect(actor.getSnapshot().context.errorMessage).toContain("No API key configured");
  });

  it("should handle API errors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 403,
        statusText: "Forbidden",
      }),
    );

    const actor = createActor(presetConnectionTesterMachine).start();
    actor.send({
      type: "TEST_CONNECTION",
      provider: "openrouter",
      model: "google/gemini-2.5-flash",
      apiKey: "invalid-key",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

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
  });
});
