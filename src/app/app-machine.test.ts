import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { setSetting } from "../db/db-operations";
import { appMachine } from "./app-machine";
import { createActor } from "xstate";
import type { ActorRefFrom } from "xstate";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";

describe("App State Machine", () => {
  let actor: ActorRefFrom<typeof appMachine> | null = null;
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
  });

  afterEach(async () => {
    if (actor) {
      actor.stop();
      actor = null;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("starts in loading and transitions to onboarding when no API keys exist", async () => {
    actor = createActor(appMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("onboarding")) {
          resolve(null);
        }
      });
    });

    const state = actor.getSnapshot();
    expect(state.value).toBe("onboarding");
    expect(state.context.hasApiKeys).toBe(false);
  });

  it("transitions to app state when API keys exist", async () => {
    // Populate DB with an API key
    await setSetting("api_keys", { openRouter: "some-key", gemini: "" });

    actor = createActor(appMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("app")) {
          resolve(null);
        }
      });
    });

    const state = actor.getSnapshot();
    expect(state.value).toBe("app");
    expect(state.context.hasApiKeys).toBe(true);
  });

  it("handles SETTINGS_SAVED and transitions between onboarding and app", async () => {
    actor = createActor(appMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("onboarding")) resolve(null);
      });
    });

    // Save settings with keys
    actor.send({
      type: "SETTINGS_SAVED",
      theme: "dark",
      hasApiKeys: true,
    });

    let state = actor.getSnapshot();
    expect(state.value).toBe("app");
    expect(state.context.hasApiKeys).toBe(true);
    expect(state.context.theme).toBe("dark");

    // Clear keys / save settings without keys
    actor.send({
      type: "SETTINGS_SAVED",
      theme: "light",
      hasApiKeys: false,
    });

    state = actor.getSnapshot();
    expect(state.value).toBe("onboarding");
    expect(state.context.hasApiKeys).toBe(false);
    expect(state.context.theme).toBe("light");
  });

  it("handles CHANGE_THEME events", async () => {
    await setSetting("api_keys", { openRouter: "", gemini: "some-gemini-key" });

    actor = createActor(appMachine);
    actor.start();

    await new Promise((resolve) => {
      actor!.subscribe((state) => {
        if (state.matches("app")) resolve(null);
      });
    });

    actor.send({ type: "CHANGE_THEME", theme: "light" });

    const state = actor.getSnapshot();
    expect(state.context.theme).toBe("light");
  });
});
