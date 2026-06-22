import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { createActor } from "xstate";
import { workflowSyncingMachine } from "./workflow-syncing-machine";
import { getDB, resetDBConnection } from "../db/db-connection";
import { saveThread, getThread } from "../db/db-operations";
import { saveWorkflow } from "../workflows/workflows-service";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import type { Thread, Workflow } from "../db/db-schema";

describe("workflowSyncingMachine", () => {
  let db: IDBPDatabase<InBrowserLlmChatDB> | null = null;
  const mockThreadId = "thread-123";

  const mockBaseWorkflow: Workflow = {
    id: "wf-1",
    name: "My Workflow",
    description: "Simple workflow",
    isBuiltIn: false,
    nodes: [{ id: "node-1", type: "agent", name: "Agent 1", systemPrompt: "Hello" }],
    edges: [],
  };

  const mockThread: Thread = {
    id: mockThreadId,
    title: "Thread Title",
    workflowId: "wf-1",
    workflowSnapshot: mockBaseWorkflow,
    activePresetId: "a2f463ce-f834-c939-f467-b83887ff66e2", // must be valid UUID
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parentThreadId: null,
    parentMessageId: null,
    status: "inactive",
    activeInterrupt: null,
    errorMessage: null,
    latestCheckpointId: "cp-1",
    latestCheckpointNs: "ns-1",
    tokenStats: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
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
    // cleanup if needed
  });

  it("performs soft sync when only prompts/configs are changed", async () => {
    const changedWorkflow: Workflow = {
      ...mockBaseWorkflow,
      nodes: [{ id: "node-1", type: "agent", name: "Agent 1", systemPrompt: "Hello modified!" }],
    };

    // Save mock workflow and thread in database
    await saveWorkflow(changedWorkflow);
    await saveThread(mockThread);

    const actor = createActor(workflowSyncingMachine, {
      input: {
        threadId: mockThreadId,
      },
    });

    actor.start();
    expect(actor.getSnapshot().value).toBe("idle");

    // Move to analyzing
    actor.send({ type: "START_SYNC" });

    // Wait for analysis to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(actor.getSnapshot().value).toBe("promptingSoftSync");
    expect(actor.getSnapshot().context.isDestructive).toBe(false);

    // Confirm sync
    actor.send({ type: "CONFIRM_SYNC" });

    // Wait for sync to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(actor.getSnapshot().value).toBe("success");

    const updatedThread = await getThread(mockThreadId);
    expect(updatedThread?.workflowSnapshot?.nodes[0].systemPrompt).toBe("Hello modified!");
  });

  it("performs hard sync when topology (nodes list) is changed", async () => {
    const destructiveWorkflow: Workflow = {
      ...mockBaseWorkflow,
      nodes: [
        { id: "node-1", type: "agent", name: "Agent 1", systemPrompt: "Hello" },
        { id: "node-2", type: "agent", name: "Agent 2", systemPrompt: "World" },
      ],
      edges: [{ source: "node-1", target: "node-2" }],
    };

    await saveWorkflow(destructiveWorkflow);
    await saveThread(mockThread);

    const actor = createActor(workflowSyncingMachine, {
      input: {
        threadId: mockThreadId,
      },
    });

    actor.start();
    actor.send({ type: "START_SYNC" });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(actor.getSnapshot().value).toBe("promptingHardSync");
    expect(actor.getSnapshot().context.isDestructive).toBe(true);

    actor.send({ type: "CONFIRM_SYNC" });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(actor.getSnapshot().value).toBe("success");

    const updatedThread = await getThread(mockThreadId);
    expect(updatedThread?.latestCheckpointId).toBeNull();
    expect(updatedThread?.tokenStats).toBeNull();
  });
});
