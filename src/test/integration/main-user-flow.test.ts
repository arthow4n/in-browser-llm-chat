import { describe, beforeEach, it, expect } from "vitest";
import { createActor } from "xstate";
import {
  clearDatabase,
  getSetting,
  getAllPresets,
  createNewThread,
  getThread,
  getMessagesForThread,
  getCheckpoint,
} from "../../db/db";
import { globalSettingsMachine } from "../../ui/settings/globalSettings";
import { BUILT_IN_WORKFLOWS } from "../../workflow/builtInWorkflows";
import { graphRunnerActor } from "../../workflow/graphRunnerActor";

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

  it("should trigger execution of the graphRunnerActor for a new thread", async () => {
    // 1. Setup: Seed API keys and presets
    const settingsActor = createActor(globalSettingsMachine).start();
    await new Promise<void>((resolve) => {
      const subscription = settingsActor.subscribe((state) => {
        if (state.matches("idle")) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });

    settingsActor.send({
      type: "EDIT_FIELD",
      field: "openRouterApiKey",
      value: "mock-openrouter-key",
    });
    settingsActor.send({
      type: "EDIT_FIELD",
      field: "geminiApiKey",
      value: "mock-gemini-key",
    });
    settingsActor.send({ type: "SAVE" });

    await new Promise<void>((resolve) => {
      const subscription = settingsActor.subscribe((state) => {
        if (state.matches({ idle: "clean" })) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });

    // 2. Get a seeded preset and the standard workflow
    const presets = await getAllPresets();
    const preset = presets[0];
    const standardWorkflow = BUILT_IN_WORKFLOWS.find((wf) => wf.id === "builtin-standard-workflow");

    // 3. Create a new thread
    const { threadId } = await createNewThread({
      workflowId: standardWorkflow!.id,
      workflowSnapshot: standardWorkflow!,
      activePresetId: preset!.id,
      initialMessage: "Hello world",
    });

    // 4. Spawn the graphRunnerActor
    const runnerActor = createActor(graphRunnerActor, {
      input: { threadId },
    }).start();

    // 5. Send a START event
    // In the current implementation, the actor starts automatically from initializing -> ready -> running.requesting.
    // However, we send START as requested by the task.
    runnerActor.send({ type: "START" });

    // Wait for the actor to reach a terminal state (completed, failed, or interrupted)
    await new Promise<void>((resolve) => {
      const subscription = runnerActor.subscribe((state) => {
        if (
          state.matches("completed") ||
          state.matches("failed") ||
          state.matches("interrupted") ||
          state.matches("paused")
        ) {
          console.log("Actor reached state:", state.value);
          if (state.matches("failed")) {
            console.log("Actor error:", state.context.errorMessage);
          }
          subscription.unsubscribe();
          resolve();
        }
      });
    });

    // Verify the actor was spawned and reached a terminal state
    expect(runnerActor.getSnapshot().value).not.toBe("running.requesting");

    // We check if the thread status has been updated to 'executing' or 'awaiting_input' or 'inactive' etc.
    const thread = await getThread(threadId);
    expect(["executing", "awaiting_input", "inactive", "error"]).toContain(thread?.status);

    // Verify messages
    const messages = await getMessagesForThread(threadId);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello world");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toMatch(/mocked (OpenRouter|Gemini) response/);

    // Verify checkpoints
    expect(thread).toBeDefined();
    console.log("Thread checkpoints:", {
      id: thread?.latestCheckpointId,
      ns: thread?.latestCheckpointNs,
    });
    expect(thread?.latestCheckpointId).toBeDefined();
    expect(thread?.latestCheckpointNs).toBeDefined();

    const checkpoint = await getCheckpoint(
      threadId,
      thread!.latestCheckpointNs!,
      thread!.latestCheckpointId!,
    );
    expect(checkpoint).toBeDefined();

    // Cleanup: stop the actor to avoid leaking promises in tests
    runnerActor.stop();
  });
});
