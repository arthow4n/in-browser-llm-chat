import { describe, beforeEach, it, expect } from "vitest";
import { createActor } from "xstate";
import { clearDatabase, getSetting, getAllPresets } from "../../db/db";
import { globalSettingsMachine } from "../../ui/settings/globalSettings";

describe("Main User Flow Integration Test", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("should correctly save API keys using globalSettingsMachine", async () => {
    const actor = createActor(globalSettingsMachine).start();

    // Wait for the machine to finish loading
    await new Promise<void>((resolve) => {
      const subscription = actor.subscribe((state) => {
        if (state.matches("idle")) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });

    // Set API keys
    actor.send({
      type: "EDIT_FIELD",
      field: "openRouterApiKey",
      value: "mock-openrouter-key",
    });
    actor.send({
      type: "EDIT_FIELD",
      field: "geminiApiKey",
      value: "mock-gemini-key",
    });

    // Trigger save
    actor.send({ type: "SAVE" });

    // Wait for the machine to return to idle.clean state
    await new Promise<void>((resolve) => {
      const subscription = actor.subscribe((state) => {
        if (state.matches({ idle: "clean" })) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });

    // Query IndexedDB and assert
    const apiKeys = await getSetting<{ openRouter?: string; gemini?: string }>("api_keys");
    expect(apiKeys).toEqual({
      openRouter: "mock-openrouter-key",
      gemini: "mock-gemini-key",
    });
  });

  it("should seed default presets when saving settings for the first time with API keys", async () => {
    const actor = createActor(globalSettingsMachine).start();

    // Wait for the machine to finish loading
    await new Promise<void>((resolve) => {
      const subscription = actor.subscribe((state) => {
        if (state.matches("idle")) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });

    // Set API keys
    actor.send({
      type: "EDIT_FIELD",
      field: "openRouterApiKey",
      value: "mock-openrouter-key",
    });
    actor.send({
      type: "EDIT_FIELD",
      field: "geminiApiKey",
      value: "mock-gemini-key",
    });

    // Trigger save
    actor.send({ type: "SAVE" });

    // Wait for the machine to return to idle.clean state
    await new Promise<void>((resolve) => {
      const subscription = actor.subscribe((state) => {
        if (state.matches({ idle: "clean" })) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });

    // Query presets and assert
    const presets = await getAllPresets();
    expect(presets).toHaveLength(2);

    const geminiPreset = presets.find((p) => p.name === "Default Gemini Flash");
    expect(geminiPreset).toBeDefined();
    expect(geminiPreset?.provider).toBe("gemini");
    expect(geminiPreset?.model).toBe("gemini-2.5-flash");

    const openRouterPreset = presets.find((p) => p.name === "Default OpenRouter Flash");
    expect(openRouterPreset).toBeDefined();
    expect(openRouterPreset?.provider).toBe("openrouter");
    expect(openRouterPreset?.model).toBe("google/gemini-2.5-flash");

    // Verify default preset ID is set
    const defaultPresetId = await getSetting<string>("default_preset_id");
    expect(defaultPresetId).toBeDefined();
    expect(presets.some((p) => p.id === defaultPresetId)).toBe(true);
  });
});
