import { describe, it, expect, beforeEach } from "vitest";
import { IndexedDBSaver } from "./checkpointer";
import { closeDB, saveThread, getThread, type WorkflowStore } from "./db";
import "fake-indexeddb/auto";
import { type Checkpoint, type CheckpointTuple } from "@langchain/langgraph-checkpoint";

describe("IndexedDBSaver", () => {
  beforeEach(async () => {
    await closeDB();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("in-browser-llm-chat-db");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  const mockCheckpoint = (id: string): Checkpoint => ({
    v: 4,
    id,
    ts: new Date().toISOString(),
    channel_values: { message: "hello" },
    channel_versions: { message: 1 },
    versions_seen: { node: { message: 1 } },
  });

  const mockWorkflow: WorkflowStore = {
    id: "wf-1",
    name: "Mock Workflow",
    description: "Mock Description",
    isBuiltIn: false,
    nodes: [],
    edges: [],
  };

  it("should save and retrieve checkpoints", async () => {
    const saver = new IndexedDBSaver();
    const threadId = "test-thread";

    // Seed dummy thread in DB
    const thread = {
      id: threadId,
      title: "Test Thread",
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

    const cp = mockCheckpoint("cp-1");
    const metadata = { source: "loop" as const, step: 0, parents: {} };

    // Save checkpoint
    const config = { configurable: { thread_id: threadId, checkpoint_ns: "ns-1" } };
    const resultConfig = await saver.put(config, cp, metadata);

    expect(resultConfig.configurable).toEqual({
      thread_id: threadId,
      checkpoint_ns: "ns-1",
      checkpoint_id: "cp-1",
    });

    // Check thread record was updated
    const updatedThread = await getThread(threadId);
    expect(updatedThread?.latestCheckpointId).toBe("cp-1");
    expect(updatedThread?.latestCheckpointNs).toBe("ns-1");

    // Retrieve checkpoint tuple
    const tuple = await saver.getTuple({
      configurable: { thread_id: threadId, checkpoint_ns: "ns-1", checkpoint_id: "cp-1" },
    });

    expect(tuple).toBeDefined();
    expect(tuple?.checkpoint).toEqual(cp);
    expect(tuple?.metadata).toEqual(metadata);
    expect(tuple?.config.configurable).toEqual({
      thread_id: threadId,
      checkpoint_ns: "ns-1",
      checkpoint_id: "cp-1",
    });

    // Get tuple without checkpoint_id (should fetch latest)
    const latestTuple = await saver.getTuple({
      configurable: { thread_id: threadId, checkpoint_ns: "ns-1" },
    });
    expect(latestTuple?.checkpoint.id).toBe("cp-1");
  });

  it("should handle putWrites and retrieve pendingWrites", async () => {
    const saver = new IndexedDBSaver();
    const threadId = "test-thread-writes";

    const cp = mockCheckpoint("cp-2");
    const metadata = { source: "loop" as const, step: 1, parents: {} };

    const thread = {
      id: threadId,
      title: "Test Thread Writes",
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

    const config = { configurable: { thread_id: threadId, checkpoint_ns: "ns-1" } };
    await saver.put(config, cp, metadata);

    // Save writes
    const writeConfig = {
      configurable: { thread_id: threadId, checkpoint_ns: "ns-1", checkpoint_id: "cp-2" },
    };
    await saver.putWrites(writeConfig, [["channel-a", "value-a"]], "task-1");

    const tuple = await saver.getTuple(writeConfig);
    expect(tuple?.pendingWrites).toHaveLength(1);
    expect(tuple?.pendingWrites?.[0]).toEqual(["task-1", "channel-a", "value-a"]);
  });

  it("should support listing checkpoints and applying limit / before / filter", async () => {
    const saver = new IndexedDBSaver();
    const threadId = "test-thread-list";

    const thread = {
      id: threadId,
      title: "Test Thread List",
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

    // Put two checkpoints at different times
    const cp1 = mockCheckpoint("cp-101");
    const cp2 = mockCheckpoint("cp-102");

    const config = { configurable: { thread_id: threadId, checkpoint_ns: "ns-1" } };
    await saver.put(config, cp1, { source: "loop" as const, step: 0, parents: {} });

    // Mock delayed checkpoint creation for distinct timestamps
    await new Promise((r) => setTimeout(r, 10));
    await saver.put(
      { configurable: { thread_id: threadId, checkpoint_ns: "ns-1", checkpoint_id: "cp-101" } },
      cp2,
      { source: "loop" as const, step: 1, parents: { "ns-1": "cp-101" } },
    );

    // List all
    const all: CheckpointTuple[] = [];
    for await (const t of saver.list(config)) {
      all.push(t);
    }

    // Sorted descending by createdAt
    expect(all).toHaveLength(2);
    expect(all[0].checkpoint.id).toBe("cp-102");
    expect(all[1].checkpoint.id).toBe("cp-101");

    // List with limit
    const limited: CheckpointTuple[] = [];
    for await (const t of saver.list(config, { limit: 1 })) {
      limited.push(t);
    }
    expect(limited).toHaveLength(1);
    expect(limited[0].checkpoint.id).toBe("cp-102");

    // List with before
    const beforeConfig = {
      configurable: { thread_id: threadId, checkpoint_ns: "ns-1", checkpoint_id: "cp-102" },
    };
    const beforeList: CheckpointTuple[] = [];
    for await (const t of saver.list(config, { before: beforeConfig })) {
      beforeList.push(t);
    }
    expect(beforeList).toHaveLength(1);
    expect(beforeList[0].checkpoint.id).toBe("cp-101");
  });

  it("should delete all thread checkpoints and writes when deleteThread is called", async () => {
    const saver = new IndexedDBSaver();
    const threadId = "test-thread-delete";

    const cp = mockCheckpoint("cp-del");
    const thread = {
      id: threadId,
      title: "Test Thread Delete",
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

    const config = { configurable: { thread_id: threadId, checkpoint_ns: "ns-1" } };
    await saver.put(config, cp, { source: "loop" as const, step: 0, parents: {} });

    const writeConfig = {
      configurable: { thread_id: threadId, checkpoint_ns: "ns-1", checkpoint_id: "cp-del" },
    };
    await saver.putWrites(writeConfig, [["channel-x", "value-x"]], "task-x");

    // Verify they exist
    const tupleBefore = await saver.getTuple(writeConfig);
    expect(tupleBefore).toBeDefined();

    // Delete
    await saver.deleteThread(threadId);

    // Verify they are gone
    const tupleAfter = await saver.getTuple(writeConfig);
    expect(tupleAfter).toBeUndefined();
  });
});
