import { describe, it, expect, beforeEach } from "vitest";
import {
  closeDB,
  saveThread,
  saveMessage,
  rollbackThreadHistory,
  getThread,
  getMessagesForThread,
  getDB,
  type WorkflowStore,
} from "./db";
import "fake-indexeddb/auto";

describe("rollbackThreadHistory Checkpoint Purging", () => {
  beforeEach(async () => {
    await closeDB();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("in-browser-llm-chat-db");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  const mockWorkflow: WorkflowStore = {
    id: "wf-1",
    name: "Mock Workflow",
    description: "Mock Description",
    isBuiltIn: false,
    nodes: [],
    edges: [],
  };

  it("should purge checkpoints and writes after a target sequence", async () => {
    const threadId = "test-rollback-thread";
    const db = await getDB();

    // 1. Setup Thread
    const thread = {
      id: threadId,
      title: "Test Rollback",
      workflowId: "wf-1",
      workflowSnapshot: mockWorkflow,
      activePresetId: "preset-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive" as const,
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };
    await saveThread(thread);

    // 2. Create sequence of messages and checkpoints
    // Message 0 -> Checkpoint 0
    // Message 1 -> Checkpoint 1
    // Message 2 -> Checkpoint 2
    const messages = [
      {
        id: "m0",
        sequence: 0,
        checkpointId: "cp0",
        checkpointNs: "ns0",
        role: "user" as const,
        content: "m0",
        type: "text" as const,
        createdAt: Date.now(),
        threadId,
      },
      {
        id: "m1",
        sequence: 1,
        checkpointId: "cp1",
        checkpointNs: "ns1",
        role: "assistant" as const,
        content: "m1",
        type: "text" as const,
        createdAt: Date.now(),
        threadId,
      },
      {
        id: "m2",
        sequence: 2,
        checkpointId: "cp2",
        checkpointNs: "ns2",
        role: "user" as const,
        content: "m2",
        type: "text" as const,
        createdAt: Date.now(),
        threadId,
      },
    ];

    for (const m of messages) {
      await saveMessage(m);
    }

    // Manual seed of checkpoints in DB to have control over timestamps and parent IDs
    const tx = db.transaction(["checkpoints", "checkpoint_writes"], "readwrite");
    const cpStore = tx.objectStore("checkpoints");
    const cwStore = tx.objectStore("checkpoint_writes");

    const now = Date.now();
    await cpStore.put({
      threadId,
      checkpointNs: "ns0",
      checkpointId: "cp0",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: null,
      createdAt: now - 300,
    });

    await cpStore.put({
      threadId,
      checkpointNs: "ns1",
      checkpointId: "cp1",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: "cp0",
      createdAt: now - 200,
    });

    await cpStore.put({
      threadId,
      checkpointNs: "ns2",
      checkpointId: "cp2",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: "cp1",
      createdAt: now - 100,
    });

    // Add writes for each checkpoint
    await cwStore.put({
      threadId,
      checkpointNs: "ns0",
      checkpointId: "cp0",
      taskId: "t0",
      idx: 0,
      channel: "c0",
      value: {},
      createdAt: now - 300,
    });
    await cwStore.put({
      threadId,
      checkpointNs: "ns1",
      checkpointId: "cp1",
      taskId: "t1",
      idx: 0,
      channel: "c1",
      value: {},
      createdAt: now - 200,
    });
    await cwStore.put({
      threadId,
      checkpointNs: "ns2",
      checkpointId: "cp2",
      taskId: "t2",
      idx: 0,
      channel: "c2",
      value: {},
      createdAt: now - 100,
    });
    await tx.done;

    // 3. Rollback to sequence 0 (isEdit = true means keep sequence 0)
    await rollbackThreadHistory(threadId, 0, true);

    // Verify messages
    const remainingMessages = await getMessagesForThread(threadId);
    expect(remainingMessages).toHaveLength(1);
    expect(remainingMessages[0].id).toBe("m0");

    // Verify checkpoints
    const checkpoints = await db.getAllFromIndex("checkpoints", "by-thread", threadId);
    expect(checkpoints).toHaveLength(0);

    // Verify writes
    const writes = await db.getAllFromIndex("checkpoint_writes", "by-thread", threadId);
    expect(writes).toHaveLength(0);

    // Verify thread latest checkpoints
    const updatedThread = await getThread(threadId);
    expect(updatedThread?.latestCheckpointId).toBeNull();
    expect(updatedThread?.latestCheckpointNs).toBeNull();
  });

  it("should keep preceding checkpoint when rolling back to a later message", async () => {
    const threadId = "test-rollback-keep";
    const db = await getDB();

    const thread = {
      id: threadId,
      title: "Test Rollback Keep",
      workflowId: "wf-1",
      workflowSnapshot: mockWorkflow,
      activePresetId: "preset-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive" as const,
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };
    await saveThread(thread);

    const messages = [
      {
        id: "m0",
        sequence: 0,
        checkpointId: "cp0",
        checkpointNs: "ns0",
        role: "user" as const,
        content: "m0",
        type: "text" as const,
        createdAt: Date.now(),
        threadId,
      },
      {
        id: "m1",
        sequence: 1,
        checkpointId: "cp1",
        checkpointNs: "ns1",
        role: "assistant" as const,
        content: "m1",
        type: "text" as const,
        createdAt: Date.now(),
        threadId,
      },
      {
        id: "m2",
        sequence: 2,
        checkpointId: "cp2",
        checkpointNs: "ns2",
        role: "user" as const,
        content: "m2",
        type: "text" as const,
        createdAt: Date.now(),
        threadId,
      },
    ];

    for (const m of messages) {
      await saveMessage(m);
    }

    const tx = db.transaction(["checkpoints", "checkpoint_writes"], "readwrite");
    const cpStore = tx.objectStore("checkpoints");
    const cwStore = tx.objectStore("checkpoint_writes");

    const now = Date.now();
    await cpStore.put({
      threadId,
      checkpointNs: "ns0",
      checkpointId: "cp0",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: null,
      createdAt: now - 300,
    });
    await cpStore.put({
      threadId,
      checkpointNs: "ns1",
      checkpointId: "cp1",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: "cp0",
      createdAt: now - 200,
    });
    await cpStore.put({
      threadId,
      checkpointNs: "ns2",
      checkpointId: "cp2",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: "cp1",
      createdAt: now - 100,
    });

    await cwStore.put({
      threadId,
      checkpointNs: "ns0",
      checkpointId: "cp0",
      taskId: "t0",
      idx: 0,
      channel: "c0",
      value: {},
      createdAt: now - 300,
    });
    await cwStore.put({
      threadId,
      checkpointNs: "ns1",
      checkpointId: "cp1",
      taskId: "t1",
      idx: 0,
      channel: "c1",
      value: {},
      createdAt: now - 200,
    });
    await cwStore.put({
      threadId,
      checkpointNs: "ns2",
      checkpointId: "cp2",
      taskId: "t2",
      idx: 0,
      channel: "c2",
      value: {},
      createdAt: now - 100,
    });
    await tx.done;

    // Rollback to sequence 1 (isEdit = true means keep sequence 1)
    await rollbackThreadHistory(threadId, 1, true);

    // Verify checkpoints
    const checkpoints = await db.getAllFromIndex("checkpoints", "by-thread", threadId);
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].checkpointId).toBe("cp0");

    // Verify writes
    const writes = await db.getAllFromIndex("checkpoint_writes", "by-thread", threadId);
    expect(writes).toHaveLength(1);
    expect(writes[0].checkpointId).toBe("cp0");

    // Verify thread latest checkpoints
    const updatedThread = await getThread(threadId);
    expect(updatedThread?.latestCheckpointId).toBe("cp0");
    expect(updatedThread?.latestCheckpointNs).toBe("ns0");
  });
});
