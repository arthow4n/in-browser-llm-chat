import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { createActor } from "xstate";
import { globalSettingsMachine } from "./globalSettings.js";
import { setSetting, resetDBPromise } from "../../db/db.js";

describe("globalSettingsMachine", () => {
  beforeEach(() => {
    resetDBPromise();
  });

  it("loads settings on startup and transitions to idle.clean", async () => {
    await setSetting("api_keys", { openRouter: "or-key", gemini: "gem-key" });
    await setSetting("ui_config", { theme: "dark" });
    await setSetting("injected_system_messages", [{ content: "sys", depth: 0 }]);

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
  });

  it("fails validation if depths are not integers", async () => {
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
  });
});
