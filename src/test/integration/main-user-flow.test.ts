import { describe, beforeEach, it, expect } from "vitest";
import { createActor } from "xstate";
import { clearDatabase, getSetting, getAllPresets, createNewThread, getThread } from "../../db/db";
import { globalSettingsMachine } from "../../ui/settings/globalSettings";
import { BUILT_IN_WORKFLOWS } from "../../workflow/builtInWorkflows";

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

  it("should programmatically create a new chat thread associated with a workflow and preset", async () => {
    // 1. Setup: Seed API keys and presets
    const actor = createActor(globalSettingsMachine).start();
    await new Promise<void>((resolve) => {
      const subscription = actor.subscribe((state) => {
        if (state.matches("idle")) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });

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
    actor.send({ type: "SAVE" });

    await new Promise<void>((resolve) => {
      const subscription = actor.subscribe((state) => {
        if (state.matches({ idle: "clean" })) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });

    // 2. Get a seeded preset and the standard workflow
    const presets = await getAllPresets();
    const preset = presets[0];
    expect(preset).toBeDefined();

    const standardWorkflow = BUILT_IN_WORKFLOWS.find((wf) => wf.id === "builtin-standard-workflow");
    expect(standardWorkflow).toBeDefined();

    // 3. Create a new thread
    const { threadId } = await createNewThread({
      workflowId: standardWorkflow!.id,
      workflowSnapshot: standardWorkflow!,
      activePresetId: preset!.id,
      initialMessage: "Hello world",
    });

    expect(threadId).toBeDefined();

    // 4. Assert the thread is correctly persisted in the DB
    const thread = await getThread(threadId);
    expect(thread).toBeDefined();
    expect(thread?.workflowId).toBe(standardWorkflow!.id);
    expect(thread?.activePresetId).toBe(preset!.id);
    expect(thread?.title).toBe("Hello world");
    expect(thread?.status).toBe("inactive");
  });
});
