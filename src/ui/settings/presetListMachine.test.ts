import { describe, it, expect, beforeEach, vi } from "vitest";
import { createActor } from "xstate";
import { presetListMachine } from "./presetListMachine";
import * as db from "../../db/db";
import "fake-indexeddb/auto";

vi.mock("../../db/db", async () => {
  const actual = await vi.importActual("../../db/db");
  return {
    ...actual,
    getAllPresets: vi.fn(),
    deletePreset: vi.fn(),
  };
});

describe("presetListMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should start in idle state", () => {
    const actor = createActor(presetListMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("should fetch presets and transition to idle", async () => {
    const mockPresets = [
      { id: "1", name: "Preset 1", provider: "gemini", model: "gemini-pro" },
      { id: "2", name: "Preset 2", provider: "openrouter", model: "gpt-4" },
    ];
    (db.getAllPresets as any).mockResolvedValue(mockPresets);

    const actor = createActor(presetListMachine).start();
    actor.send({ type: "FETCH_PRESETS" });

    expect(actor.getSnapshot().value).toBe("loading");

    // Wait for the invoke to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.presets).toEqual(mockPresets);
  });

  it("should handle fetch errors", async () => {
    (db.getAllPresets as any).mockRejectedValue(new Error("Fetch failed"));

    const actor = createActor(presetListMachine).start();
    actor.send({ type: "FETCH_PRESETS" });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe("error");
    expect(actor.getSnapshot().context.error).toBe("Fetch failed");
  });

  it("should handle preset deletion success", async () => {
    (db.deletePreset as any).mockResolvedValue(undefined);
    (db.getAllPresets as any).mockResolvedValue([]);

    const actor = createActor(presetListMachine).start();
    actor.send({ type: "DELETE_REQUESTED", id: "preset-123" });

    expect(actor.getSnapshot().value).toBe("confirmingDeletion");
    expect(actor.getSnapshot().context.presetToDeleteId).toBe("preset-123");

    actor.send({ type: "CONFIRM_DELETE" });

    expect(actor.getSnapshot().value).toBe("deleting");

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.presetToDeleteId).toBeNull();
  });

  it("should handle preset deletion error (safety guards)", async () => {
    (db.deletePreset as any).mockRejectedValue(
      new Error("Cannot delete the global default preset."),
    );

    const actor = createActor(presetListMachine).start();
    actor.send({ type: "DELETE_REQUESTED", id: "default-id" });
    actor.send({ type: "CONFIRM_DELETE" });

    await new Promise((resolve) => setTimeout(resolve, 0));

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
