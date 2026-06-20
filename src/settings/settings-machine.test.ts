import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { getSetting, listPresets } from "../db/db-operations";
import { settingsFormMachine } from "./settings-machine";
import { createActor } from "xstate";
import type { ActorRefFrom } from "xstate";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";

describe("Settings Form State Machine", () => {
  let actor: ActorRefFrom<typeof settingsFormMachine> | null = null;
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

  it("loads default settings from empty database and transitions to idle.clean", async () => {
    actor = createActor(settingsFormMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("idle")) {
          resolve(null);
        }
      });
    });

    const state = actor.getSnapshot();
    expect(state.value).toEqual({ idle: "clean" });
    expect(state.context.geminiApiKey).toBe("");
    expect(state.context.openRouterApiKey).toBe("");
    expect(state.context.theme).toBe("system");
    expect(state.context.injectedSystemMessages).toEqual([]);
    expect(state.context.isDirty).toBe(false);
  });

  it("handles editing fields, updating dirty state, and saving", async () => {
    actor = createActor(settingsFormMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("idle")) resolve(null);
      });
    });

    actor.send({ type: "EDIT_FIELD", field: "geminiApiKey", value: "new-gemini-key" });

    let state = actor.getSnapshot();
    expect(state.value).toEqual({ idle: "dirty" });
    expect(state.context.geminiApiKey).toBe("new-gemini-key");
    expect(state.context.isDirty).toBe(true);

    actor.send({ type: "SAVE" });

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches({ idle: "clean" })) resolve(null);
      });
    });

    state = actor.getSnapshot();
    expect(state.context.isDirty).toBe(false);
    expect(state.context.successMessage).toBe("Settings saved successfully!");

    const savedKeys = await getSetting("api_keys");
    expect(savedKeys).toEqual({ openRouter: "", gemini: "new-gemini-key" });

    const presets = await listPresets();
    expect(presets).toHaveLength(2);
    const geminiPreset = presets.find((p) => p.provider === "gemini");
    expect(geminiPreset?.name).toBe("Default Gemini Flash");
    expect(geminiPreset?.model).toBe("gemini-2.5-flash");

    const openrouterPreset = presets.find((p) => p.provider === "openrouter");
    expect(openrouterPreset?.name).toBe("Default OpenRouter Flash");
    expect(openrouterPreset?.model).toBe("google/gemini-2.5-flash");

    const defaultPresetId = await getSetting("default_preset_id");
    expect(defaultPresetId).toBe(geminiPreset?.id);
  });

  it("toggles key visibility", async () => {
    actor = createActor(settingsFormMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("idle")) resolve(null);
      });
    });

    let state = actor.getSnapshot();
    expect(state.context.showGeminiKey).toBe(false);

    actor.send({ type: "TOGGLE_KEY_VISIBILITY", provider: "gemini" });
    state = actor.getSnapshot();
    expect(state.context.showGeminiKey).toBe(true);
  });

  it("manages injected system messages list", async () => {
    actor = createActor(settingsFormMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("idle")) resolve(null);
      });
    });

    actor.send({ type: "ADD_INJECTED_MESSAGE" });
    let state = actor.getSnapshot();
    expect(state.context.injectedSystemMessages).toHaveLength(1);
    expect(state.context.injectedSystemMessages[0]).toEqual({ content: "", depth: 0 });
    expect(state.context.isDirty).toBe(true);

    actor.send({
      type: "UPDATE_INJECTED_MESSAGE",
      index: 0,
      field: "content",
      value: "hello world",
    });
    state = actor.getSnapshot();
    expect(state.context.injectedSystemMessages[0].content).toBe("hello world");

    actor.send({
      type: "UPDATE_INJECTED_MESSAGE",
      index: 0,
      field: "depth",
      value: -1,
    });
    state = actor.getSnapshot();
    expect(state.context.injectedSystemMessages[0].depth).toBe(-1);

    actor.send({ type: "REMOVE_INJECTED_MESSAGE", index: 0 });
    state = actor.getSnapshot();
    expect(state.context.injectedSystemMessages).toHaveLength(0);
  });

  it("fails validation if system message depth is not an integer", async () => {
    actor = createActor(settingsFormMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("idle")) resolve(null);
      });
    });

    actor.send({ type: "ADD_INJECTED_MESSAGE" });
    actor.send({
      type: "UPDATE_INJECTED_MESSAGE",
      index: 0,
      field: "depth",
      value: 1.5,
    });

    actor.send({ type: "SAVE" });

    let state = actor.getSnapshot();
    expect(state.value).toEqual({ idle: "dirty" });
    expect(state.context.validationErrors.depth_0).toBe("Depth must be a valid integer");
  });

  it("handles test connection flow", async () => {
    actor = createActor(settingsFormMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("idle")) resolve(null);
      });
    });

    actor.send({ type: "EDIT_FIELD", field: "geminiApiKey", value: "test-key" });
    actor.send({ type: "TEST_CONNECTION", provider: "gemini" });

    let state = actor.getSnapshot();
    expect(state.value).toBe("testingConnection");
    expect(state.context.lastTestProvider).toBe("gemini");

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("idle")) resolve(null);
      });
    });

    state = actor.getSnapshot();
    expect(state.context.successMessage).toBe("Connection test successful!");
  });
});
