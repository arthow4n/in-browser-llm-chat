import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { getPreset, savePreset, setSetting } from "../db/db-operations";
import { presetsMachine } from "./presets-machine";
import { createActor } from "xstate";
import type { ActorRefFrom } from "xstate";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import type { Preset } from "../db/db-schema";

describe("Presets CRUD State Machine", () => {
  let actor: ActorRefFrom<typeof presetsMachine> | null = null;
  let db: IDBPDatabase<InBrowserLlmChatDB> | null = null;

  beforeAll(async () => {
    resetDBConnection();
    db = await getDB();
  });

  afterAll(async () => {
    if (db) {
      db.close();
    }
    resetDBConnection();
  });

  beforeEach(async () => {
    const storeNames = Array.from(db!.objectStoreNames);
    for (const name of storeNames) {
      await db!.clear(name);
    }
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      ),
    );
  });

  afterEach(async () => {
    if (actor) {
      actor.stop();
      actor = null;
    }
    vi.unstubAllGlobals();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("loads presets from database and transitions to list state", async () => {
    // Seed database with a preset
    const preset: Preset = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Seeded Preset",
      provider: "gemini",
      model: "gemini-2.5-flash",
      temperature: 0.5,
      budgetPolicy: { maxStepsWithoutUser: 5, maxTokensPerRun: null },
    };
    await savePreset(preset);

    actor = createActor(presetsMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("list")) resolve(null);
      });
    });

    const state = actor.getSnapshot();
    expect(state.context.presets).toHaveLength(1);
    expect(state.context.presets[0].name).toBe("Seeded Preset");
  });

  it("handles creating a new preset with validation and saving", async () => {
    actor = createActor(presetsMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("list")) resolve(null);
      });
    });

    // Start creation
    actor.send({ type: "ADD_PRESET" });
    let state = actor.getSnapshot();
    expect(state.value).toBe("creating");
    expect(state.context.currentPreset).toBeDefined();
    expect(state.context.currentPreset?.name).toBe("");

    // Try saving empty (should fail validation)
    actor.send({ type: "SUBMIT_FORM" });
    state = actor.getSnapshot();
    expect(state.value).toBe("creating");
    expect(state.context.validationErrors.name).toBe("Preset name is required");

    // Edit name, model
    actor.send({ type: "UPDATE_FIELD", field: "name", value: "New Custom Preset" });
    actor.send({ type: "UPDATE_FIELD", field: "model", value: "gemini-ultra" });
    actor.send({ type: "UPDATE_FIELD", field: "temperature", value: "1.2" });
    actor.send({ type: "UPDATE_BUDGET_FIELD", field: "maxStepsWithoutUser", value: "15" });

    state = actor.getSnapshot();
    expect(state.context.currentPreset?.name).toBe("New Custom Preset");
    expect(state.context.currentPreset?.model).toBe("gemini-ultra");
    expect(state.context.currentPreset?.temperature).toBe(1.2);
    expect(state.context.currentPreset?.budgetPolicy.maxStepsWithoutUser).toBe(15);

    // Save
    actor.send({ type: "SUBMIT_FORM" });

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("list") && state.context.presets.length > 0) resolve(null);
      });
    });

    state = actor.getSnapshot();
    expect(state.context.successMessage).toBe("Preset saved successfully!");
    expect(state.context.presets).toHaveLength(1);
    expect(state.context.presets[0].name).toBe("New Custom Preset");

    // Verify it is in database
    const dbPreset = await getPreset(state.context.presets[0].id);
    expect(dbPreset).toBeDefined();
    expect(dbPreset?.name).toBe("New Custom Preset");
  });

  it("handles editing an existing preset", async () => {
    const original: Preset = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Original Preset",
      provider: "openrouter",
      model: "google/gemini-2.5-flash",
      temperature: 0.7,
      budgetPolicy: { maxStepsWithoutUser: 8, maxTokensPerRun: 1000 },
    };
    await savePreset(original);

    actor = createActor(presetsMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("list") && state.context.presets.length > 0) resolve(null);
      });
    });

    let state = actor.getSnapshot();
    const presetToEdit = state.context.presets[0];

    actor.send({ type: "EDIT_PRESET", preset: presetToEdit });
    state = actor.getSnapshot();
    expect(state.value).toBe("editing");
    expect(state.context.currentPreset?.name).toBe("Original Preset");

    actor.send({ type: "UPDATE_FIELD", field: "name", value: "Updated Preset Name" });
    actor.send({ type: "SUBMIT_FORM" });

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("list") && state.context.successMessage) resolve(null);
      });
    });

    state = actor.getSnapshot();
    expect(state.context.presets[0].name).toBe("Updated Preset Name");
  });

  it("handles deleting a preset", async () => {
    const target: Preset = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "To Delete",
      provider: "gemini",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      budgetPolicy: { maxStepsWithoutUser: 10, maxTokensPerRun: null },
    };
    await savePreset(target);

    actor = createActor(presetsMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("list") && state.context.presets.length > 0) resolve(null);
      });
    });

    actor.send({ type: "DELETE_PRESET_CLICK", preset: target });
    let state = actor.getSnapshot();
    expect(state.value).toBe("deleteConfirm");
    expect(state.context.presetToDelete).toEqual(target);

    // Cancel deletion
    actor.send({ type: "CANCEL_DELETE" });
    state = actor.getSnapshot();
    expect(state.value).toBe("list");
    expect(state.context.presetToDelete).toBeNull();

    // Trigger delete again and confirm
    actor.send({ type: "DELETE_PRESET_CLICK", preset: target });
    actor.send({ type: "CONFIRM_DELETE" });

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("list") && state.context.successMessage) resolve(null);
      });
    });

    state = actor.getSnapshot();
    expect(state.context.presets).toHaveLength(0);
    const dbPreset = await getPreset(target.id);
    expect(dbPreset).toBeUndefined();
  });

  it("performs connection testing using preset API key or global settings fallback", async () => {
    // Set global settings API key for gemini
    await setSetting("api_keys", { gemini: "global-gemini-key", openRouter: "" });

    actor = createActor(presetsMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("list")) resolve(null);
      });
    });

    // Case 1: Testing with no api key in preset, should fallback to global settings key
    actor.send({ type: "ADD_PRESET" });
    actor.send({ type: "UPDATE_FIELD", field: "provider", value: "gemini" });
    actor.send({ type: "TEST_CONNECTION" });

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        // Wait until it gets back to form (creating state)
        if (state.matches("creating") && state.context.testSuccess !== null) resolve(null);
      });
    });

    let state = actor.getSnapshot();
    expect(state.context.testSuccess).toBe(true);
    expect(state.context.testError).toBeNull();
    // Verify fetch was called with global key
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("key=global-gemini-key"));

    // Case 2: Testing with override preset API key
    actor.send({ type: "UPDATE_FIELD", field: "apiKey", value: "preset-specific-key" });
    actor.send({ type: "TEST_CONNECTION" });

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("creating") && state.context.testSuccess !== null) resolve(null);
      });
    });

    state = actor.getSnapshot();
    expect(state.context.testSuccess).toBe(true);
    // Verify fetch was called with preset-specific key
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("key=preset-specific-key"));
  });
});
