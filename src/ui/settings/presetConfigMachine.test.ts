import { describe, it, expect, beforeEach } from "vitest";
import { createActor, waitFor } from "xstate";
import { presetConfigMachine } from "./presetConfigMachine";
import * as db from "../../db/db";

describe("presetConfigMachine", () => {
  beforeEach(async () => {
    await db.clearPresets();
  });

  it("should initialize in loading state and transition to idle.clean for new preset", async () => {
    const actor = createActor(presetConfigMachine, {
      input: { presetId: null },
    }).start();

    expect(actor.getSnapshot().value).toBe("loading");

    await waitFor(actor, (state) => state.matches({ idle: "clean" }), { timeout: 5000 });

    expect(actor.getSnapshot().value).toEqual({ idle: "clean" });
    expect(actor.getSnapshot().context.name).toBe("New Preset");
    expect(actor.getSnapshot().context.provider).toBe("gemini");
  });

  it("should load existing preset and transition to idle.clean", async () => {
    const mockPreset: db.PresetStore = {
      id: "preset-123",
      name: "My Preset",
      provider: "openrouter",
      model: "google/gemini-2.5-flash",
      apiKey: "override-key",
      temperature: 0.8,
      budgetPolicy: { maxStepsWithoutUser: 15, maxTokensPerRun: 500 },
    };
    await db.savePreset(mockPreset);

    const actor = createActor(presetConfigMachine, {
      input: { presetId: "preset-123" },
    }).start();

    await waitFor(actor, (state) => state.matches({ idle: "clean" }), { timeout: 5000 });

    expect(actor.getSnapshot().value).toEqual({ idle: "clean" });
    expect(actor.getSnapshot().context.name).toBe("My Preset");
    expect(actor.getSnapshot().context.provider).toBe("openrouter");
    expect(actor.getSnapshot().context.apiKey).toBe("override-key");
    expect(actor.getSnapshot().context.temperature).toBe(0.8);
    expect(actor.getSnapshot().context.maxStepsWithoutUser).toBe(15);
    expect(actor.getSnapshot().context.maxTokensPerRun).toBe(500);
  });

  it("should update fields and transition to idle.dirty", async () => {
    const actor = createActor(presetConfigMachine, {
      input: { presetId: null },
    }).start();

    await waitFor(actor, (state) => state.matches({ idle: "clean" }), { timeout: 5000 });

    actor.send({ type: "EDIT_FIELD", field: "name", value: "Updated Name" });
    expect(actor.getSnapshot().value).toEqual({ idle: "dirty" });
    expect(actor.getSnapshot().context.name).toBe("Updated Name");
    expect(actor.getSnapshot().context.isDirty).toBe(true);
  });

  it("should validate and save a valid preset", async () => {
    const actor = createActor(presetConfigMachine, {
      input: { presetId: null },
    }).start();

    await waitFor(actor, (state) => state.matches({ idle: "clean" }), { timeout: 5000 });

    actor.send({ type: "EDIT_FIELD", field: "name", value: "Valid Name" });
    actor.send({ type: "SAVE" });

    await waitFor(actor, (state) => state.matches("saveSuccess"), { timeout: 5000 });

    expect(actor.getSnapshot().value).toBe("saveSuccess");
    const presets = await db.getAllPresets();
    expect(presets.length).toBe(1);
    expect(presets[0].name).toBe("Valid Name");
  });

  it("should block save and set validation errors if fields are invalid", async () => {
    const actor = createActor(presetConfigMachine, {
      input: { presetId: null },
    }).start();

    await waitFor(actor, (state) => state.matches({ idle: "clean" }), { timeout: 5000 });

    actor.send({ type: "EDIT_FIELD", field: "name", value: "   " });
    actor.send({ type: "EDIT_FIELD", field: "temperature", value: "2.5" });

    actor.send({ type: "SAVE" });

    expect(actor.getSnapshot().value).toEqual({ idle: "dirty" });
    expect(actor.getSnapshot().context.validationErrors.name).toBeDefined();
    expect(actor.getSnapshot().context.validationErrors.temperature).toBeDefined();
  });

  it("should delete a preset and transition to deleteSuccess", async () => {
    const presetId = "preset-123";
    await db.savePreset({
      id: presetId,
      name: "To Delete",
      provider: "gemini",
      model: "gemini-1.5-flash",
    });

    const actor = createActor(presetConfigMachine, {
      input: { presetId },
    }).start();

    await waitFor(actor, (state) => state.matches({ idle: "clean" }), { timeout: 5000 });

    actor.send({ type: "DELETE" });

    await waitFor(actor, (state) => state.matches("deleteSuccess"), { timeout: 5000 });

    expect(actor.getSnapshot().value).toBe("deleteSuccess");
    const deletedPreset = await db.getPreset(presetId);
    expect(deletedPreset).toBeUndefined();
  });
});
