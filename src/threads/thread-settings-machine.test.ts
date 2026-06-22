import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { createActor } from "xstate";
import { threadSettingsMachine } from "./thread-settings-machine";
import { getDB, resetDBConnection } from "../db/db-connection";
import { saveThread, getThread, savePreset } from "../db/db-operations";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import type { Thread, Preset } from "../db/db-schema";

describe("threadSettingsMachine", () => {
  let db: IDBPDatabase<InBrowserLlmChatDB> | null = null;

  const mockPresets: Preset[] = [
    {
      id: "a2f463ce-f834-c939-f467-b83887ff66e2", // valid UUID
      name: "Preset 1",
      provider: "gemini",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      budgetPolicy: { maxStepsWithoutUser: 5, maxTokensPerRun: null },
    },
  ];

  const mockThread: Thread = {
    id: "thread-123",
    title: "Old Title",
    workflowId: "standard-1-agent",
    workflowSnapshot: null,
    activePresetId: "a2f463ce-f834-c939-f467-b83887ff66e2",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parentThreadId: null,
    parentMessageId: null,
    status: "inactive",
    activeInterrupt: null,
    errorMessage: null,
    latestCheckpointId: null,
    latestCheckpointNs: null,
    tokenStats: null,
  };

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
    for (const name of Array.from(db!.objectStoreNames)) {
      await db!.clear(name);
    }
  });

  afterEach(() => {
    // cleanup
  });

  it("can open and edit title and preset, then save successfully", async () => {
    await savePreset(mockPresets[0]);
    await saveThread(mockThread);

    const actor = createActor(threadSettingsMachine);
    actor.start();

    expect(actor.getSnapshot().value).toBe("closed");

    actor.send({
      type: "OPEN",
      threadId: "thread-123",
      threadTitle: "Old Title",
      selectedPresetId: "a2f463ce-f834-c939-f467-b83887ff66e2",
      presets: mockPresets,
    });

    expect(actor.getSnapshot().value).toStrictEqual({ opened: "idle" });
    expect(actor.getSnapshot().context.threadTitle).toBe("Old Title");

    actor.send({ type: "EDIT_TITLE" });
    expect(actor.getSnapshot().context.isEditingTitle).toBe(true);

    actor.send({ type: "UPDATE_TITLE", title: "New Awesome Title" });
    expect(actor.getSnapshot().context.threadTitle).toBe("New Awesome Title");

    actor.send({ type: "CHANGE_PRESET", presetId: "preset-2" });
    expect(actor.getSnapshot().context.selectedPresetId).toBe("preset-2");

    actor.send({ type: "SAVE" });

    // Wait for save
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(actor.getSnapshot().value).toStrictEqual({ opened: "idle" });
    expect(actor.getSnapshot().context.isEditingTitle).toBe(false);

    const updatedThread = await getThread("thread-123");
    expect(updatedThread?.title).toBe("New Awesome Title");
    expect(updatedThread?.activePresetId).toBe("preset-2");
  });
});
