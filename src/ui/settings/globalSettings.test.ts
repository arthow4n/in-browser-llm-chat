import { describe, it, expect, vi, beforeEach } from "vitest";
import { createActor } from "xstate";
import { globalSettingsMachine } from "./globalSettings.js";
import * as db from "../../db/db.js";

// Mock the DB layer
vi.mock("../../db/db.js", () => ({
  getSetting: vi.fn<(...args: unknown[]) => unknown>(),
  setSetting: vi.fn<(...args: unknown[]) => unknown>(),
  getAllPresets: vi.fn<(...args: unknown[]) => unknown>(),
  savePreset: vi.fn<(...args: unknown[]) => unknown>(),
}));

describe("globalSettingsMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads settings on startup and transitions to idle.clean", async () => {
    vi.mocked(db.getSetting).mockImplementation(async (key: string) => {
      if (key === "api_keys") return { value: { openRouter: "or-key", gemini: "gem-key" } };
      if (key === "ui_config") return { value: { theme: "dark" } };
      if (key === "injected_system_messages") return { value: [{ content: "sys", depth: 0 }] };
      return null;
    });

    const actor = createActor(globalSettingsMachine).start();

    // The machine starts in 'loading' and automatically invokes loadSettings
    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.value && typeof state.value === "object" && "idle" in state.value) {
          resolve();
        }
      });
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toEqual({ idle: "clean" });
    expect(snapshot.context.openRouterApiKey).toBe("or-key");
    expect(snapshot.context.geminiApiKey).toBe("gem-key");
    expect(snapshot.context.theme).toBe("dark");
    expect(snapshot.context.injectedSystemMessages).toHaveLength(1);
    expect(snapshot.context.isDirty).toBe(false);
  });

  it("becomes dirty when fields are edited", async () => {
    vi.mocked(db.getSetting).mockImplementation(async () => null);

    const actor = createActor(globalSettingsMachine).start();

    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.value && typeof state.value === "object" && "idle" in state.value) {
          resolve();
        }
      });
    });

    actor.send({ type: "EDIT_FIELD", field: "theme", value: "light" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toEqual({ idle: "dirty" });
    expect(snapshot.context.theme).toBe("light");
    expect(snapshot.context.isDirty).toBe(true);
  });

  it("validates depths when saving and transitions to saving", async () => {
    vi.mocked(db.getSetting).mockImplementation(async () => null);
    vi.mocked(db.getAllPresets).mockResolvedValue([]);
    vi.mocked(db.setSetting).mockResolvedValue();

    const actor = createActor(globalSettingsMachine).start();

    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.value && typeof state.value === "object" && "idle" in state.value) {
          resolve();
        }
      });
    });

    actor.send({ type: "ADD_INJECTED_MESSAGE" });
    actor.send({ type: "UPDATE_INJECTED_MESSAGE", index: 0, field: "depth", value: 5 });

    actor.send({ type: "SAVE" });

    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        // It should go validating -> saving -> idle.clean
        if (
          state.value &&
          typeof state.value === "object" &&
          "idle" in state.value &&
          state.context.isDirty === false
        ) {
          resolve();
        }
      });
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toEqual({ idle: "clean" });
    expect(db.setSetting).toHaveBeenCalledWith("injected_system_messages", {
      value: [{ content: "", depth: 5 }],
    });
  });

  it("fails validation if depths are not integers", async () => {
    vi.mocked(db.getSetting).mockImplementation(async () => null);

    const actor = createActor(globalSettingsMachine).start();

    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.value && typeof state.value === "object" && "idle" in state.value) {
          resolve();
        }
      });
    });

    actor.send({ type: "ADD_INJECTED_MESSAGE" });
    actor.send({
      type: "UPDATE_INJECTED_MESSAGE",
      index: 0,
      field: "depth",
      value: "not-a-number",
    });

    actor.send({ type: "SAVE" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toEqual({ idle: "dirty" });
    expect(snapshot.context.validationErrors.general).toBeDefined();
    expect(db.setSetting).not.toHaveBeenCalled();
  });
});
