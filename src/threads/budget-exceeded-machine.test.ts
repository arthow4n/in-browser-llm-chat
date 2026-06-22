import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { saveThread, getThread } from "../db/db-operations";
import { budgetExceededMachine } from "./budget-exceeded-machine";
import { createActor } from "xstate";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import type { Thread } from "../db/db-schema";

describe("budgetExceededMachine", () => {
  let db: IDBPDatabase<InBrowserLlmChatDB> | null = null;
  const threadId = "88888888-8888-8888-8888-888888888888";

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

  it("should initialize context, allow resuming with budget override, and update DB thread state", async () => {
    const thread: Thread = {
      id: threadId,
      title: "Test Thread",
      workflowId: "test-wf",
      workflowSnapshot: {},
      activePresetId: "44444444-4444-4444-4444-444444444444",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "awaiting_input",
      activeInterrupt: {
        type: "budget_exceeded",
        budgetDetails: {
          currentTokens: 120,
          maxTokens: 100,
          stepCount: 3,
        },
      },
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };
    await saveThread(thread);

    const actor = createActor(budgetExceededMachine);
    actor.start();

    expect(actor.getSnapshot().value).toBe("idle");

    actor.send({
      type: "LOAD_BUDGET_INTERRUPT",
      threadId,
      currentTokens: 120,
      maxTokens: 100,
      stepCount: 3,
    });

    expect(actor.getSnapshot().value).toBe("prompting");
    expect(actor.getSnapshot().context.threadId).toBe(threadId);
    expect(actor.getSnapshot().context.currentTokens).toBe(120);

    actor.send({ type: "INCREASE_BUDGET" });

    // Wait for the async resumption database transaction actor to complete
    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.value === "completedResume") {
          resolve();
        }
      });
    });

    // Check database thread updates
    const updatedThread = await getThread(threadId);
    expect(updatedThread?.status).toBe("executing");
    expect(updatedThread?.activeInterrupt).toBeNull();
  });

  it("should support aborting, setting thread to inactive and clearing interrupt in DB", async () => {
    const thread: Thread = {
      id: threadId,
      title: "Test Thread",
      workflowId: "test-wf",
      workflowSnapshot: {},
      activePresetId: "44444444-4444-4444-4444-444444444444",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "awaiting_input",
      activeInterrupt: {
        type: "budget_exceeded",
        budgetDetails: {
          currentTokens: 120,
          maxTokens: 100,
          stepCount: 3,
        },
      },
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };
    await saveThread(thread);

    const actor = createActor(budgetExceededMachine);
    actor.start();

    actor.send({
      type: "LOAD_BUDGET_INTERRUPT",
      threadId,
      currentTokens: 120,
      maxTokens: 100,
      stepCount: 3,
    });

    actor.send({ type: "ABORT" });

    // Wait for the async abortion transaction to complete
    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.value === "completedAbort") {
          resolve();
        }
      });
    });

    const updatedThread = await getThread(threadId);
    expect(updatedThread?.status).toBe("inactive");
    expect(updatedThread?.activeInterrupt).toBeNull();
  });
});
