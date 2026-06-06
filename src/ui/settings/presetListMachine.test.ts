import { describe, it, expect, beforeEach, vi } from "vitest";
import { createActor, waitFor } from "xstate";
import { presetListMachine } from "./presetListMachine";
import * as db from "../../db/db";

describe("presetListMachine", () => {
  beforeEach(async () => {
    await db.clearPresets();
    const dbInstance = await db.getDB();
    await dbInstance.clear("settings");
  });

  it("should start in idle state", () => {
    const actor = createActor(presetListMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("should fetch presets and transition to idle", async () => {
    const mockPresets: db.PresetStore[] = [
      {
        id: "1",
        name: "Preset 1",
        provider: "gemini",
        model: "gemini-pro",
        apiKey: "",
        temperature: 0.7,
        budgetPolicy: { maxStepsWithoutUser: 10, maxTokensPerRun: 1000 },
      },
      {
        id: "2",
        name: "Preset 2",
        provider: "openrouter",
        model: "gpt-4",
        apiKey: "",
        temperature: 0.7,
        budgetPolicy: { maxStepsWithoutUser: 10, maxTokensPerRun: 1000 },
      },
    ];
    for (const p of mockPresets) {
      await db.savePreset(p);
    }

    const actor = createActor(presetListMachine).start();
    actor.send({ type: "FETCH_PRESETS" });

    expect(actor.getSnapshot().value).toBe("loading");

    // Wait for the invoke to complete
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 });

    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.presets).toEqual(mockPresets);
  });

  it("should handle fetch errors", async () => {
    const spy = vi.spyOn(db, "getAllPresets").mockRejectedValue(new Error("Fetch failed"));

    const actor = createActor(presetListMachine).start();
    actor.send({ type: "FETCH_PRESETS" });

    await waitFor(actor, (state) => state.matches("error"), { timeout: 1000 });

    expect(actor.getSnapshot().value).toBe("error");
    expect(actor.getSnapshot().context.error).toBe("Fetch failed");

    spy.mockRestore();
  });

  it("should handle preset deletion success", async () => {
    const presetId = "preset-123";
    await db.savePreset({ id: presetId, name: "TBD", provider: "gemini", model: "m" });

    const actor = createActor(presetListMachine).start();
    actor.send({ type: "DELETE_REQUESTED", id: presetId });

    expect(actor.getSnapshot().value).toBe("confirmingDeletion");
    expect(actor.getSnapshot().context.presetToDeleteId).toBe(presetId);

    actor.send({ type: "CONFIRM_DELETE" });

    expect(actor.getSnapshot().value).toBe("deleting");

    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 });

    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.presetToDeleteId).toBeNull();
    expect(await db.getPreset(presetId)).toBeUndefined();
  });

  it("should handle preset deletion error (safety guards)", async () => {
    const presetId = "default-id";
    await db.savePreset({ id: presetId, name: "Default", provider: "gemini", model: "m" });
    await db.setSetting("default_preset_id", presetId);

    const actor = createActor(presetListMachine).start();
    actor.send({ type: "DELETE_REQUESTED", id: presetId });
    actor.send({ type: "CONFIRM_DELETE" });

    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 });

    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.error).toBe("Cannot delete the global default preset.");
    expect(actor.getSnapshot().context.presetToDeleteId).toBeNull();
  });

  it("should update sortConfig", () => {
    const actor = createActor(presetListMachine).start();
    actor.send({ type: "SORT_CHANGED", key: "name", direction: "desc" });

    expect(actor.getSnapshot().context.sortConfig).toEqual({ key: "name", direction: "desc" });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("should update pagination", () => {
    const actor = createActor(presetListMachine).start();
    actor.send({ type: "PAGE_CHANGED", page: 2 });

    expect(actor.getSnapshot().context.pagination.page).toBe(2);
    expect(actor.getSnapshot().value).toBe("idle");
  });
});
