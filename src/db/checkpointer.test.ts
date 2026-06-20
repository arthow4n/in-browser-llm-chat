import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDB, resetDBConnection } from "./db-connection";
import { IndexedDBCheckpointer } from "./checkpointer";
import type { CheckpointTuple } from "./db-schema";

describe("IndexedDBCheckpointer", () => {
  let checkpointer: IndexedDBCheckpointer;
  const threadId = "44444444-4444-4444-4444-444444444444";
  const ns = "test-namespace";

  beforeEach(async () => {
    resetDBConnection();
    const db = await getDB();
    const storeNames = Array.from(db.objectStoreNames);
    for (const name of storeNames) {
      await db.clear(name);
    }
    checkpointer = new IndexedDBCheckpointer();
  });

  afterEach(async () => {
    const db = await getDB();
    db.close();
    resetDBConnection();
  });

  it("should save and load checkpoints and update thread metadata", async () => {
    const checkpointId = "cp-1";
    const checkpointState = { currentNodeId: "node-a", variables: { x: 1 } };
    const metadata = { timestamp: 100 };
    const parentCheckpointId = null;

    // Seed the thread first so saveCheckpoint can find and update it
    const db = await getDB();
    await db.put("threads", {
      id: threadId,
      title: "Test Thread",
      workflowId: "workflow-1",
      workflowSnapshot: {},
      activePresetId: "11111111-1111-1111-1111-111111111111",
      createdAt: 1000,
      updatedAt: 2000,
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    });

    await checkpointer.saveCheckpoint(
      threadId,
      ns,
      checkpointId,
      checkpointState,
      metadata,
      parentCheckpointId,
    );

    // Assert thread record updated
    const thread = await db.get("threads", threadId);
    expect(thread?.latestCheckpointId).toBe(checkpointId);
    expect(thread?.latestCheckpointNs).toBe(ns);

    const latest = await checkpointer.getLatestCheckpoint(threadId, ns);
    expect(latest).toBeDefined();
    expect(latest?.checkpointId).toBe(checkpointId);
    expect(latest?.checkpointNs).toBe(ns);
    expect(latest?.checkpoint).toEqual(checkpointState);
    expect(latest?.metadata).toEqual(metadata);
    expect(latest?.parentCheckpointId).toBeNull();
    expect(latest?.pendingWrites).toEqual([]);

    const specific = await checkpointer.getCheckpoint(threadId, ns, checkpointId);
    expect(specific).toEqual(latest);
  });

  it("should save writes and bundle them with checkpoints", async () => {
    const checkpointId = "cp-1";
    const writes = [["channel-1", "val-1"], { channel: "channel-2", value: "val-2" }, "raw-val-3"];

    await checkpointer.saveCheckpoint(threadId, ns, checkpointId, {}, {}, null);
    await checkpointer.saveWrites(threadId, ns, checkpointId, writes, "task-1");

    const loaded = await checkpointer.getCheckpoint(threadId, ns, checkpointId);
    expect(loaded?.pendingWrites).toEqual([
      ["channel-1", "val-1"],
      ["channel-2", "val-2"],
      ["default", "raw-val-3"],
    ]);
  });

  it("should list checkpoints sorted and support filters and load writes", async () => {
    await checkpointer.saveCheckpoint(threadId, ns, "cp-1", {}, { step: 1 }, null);
    await checkpointer.saveWrites(threadId, ns, "cp-1", [["chan", "val-1"]], "task-1");
    await new Promise((r) => setTimeout(r, 10));
    await checkpointer.saveCheckpoint(threadId, ns, "cp-2", {}, { step: 2 }, "cp-1");
    await new Promise((r) => setTimeout(r, 10));
    await checkpointer.saveCheckpoint(threadId, ns, "cp-3", {}, { step: 3 }, "cp-2");

    const list: CheckpointTuple[] = [];
    for await (const cp of checkpointer.listCheckpoints(threadId, ns)) {
      list.push(cp);
    }

    expect(list).toHaveLength(3);
    // cp-3 should be first (latest)
    expect(list[0].checkpointId).toBe("cp-3");
    expect(list[1].checkpointId).toBe("cp-2");
    expect(list[2].checkpointId).toBe("cp-1");
    expect(list[2].pendingWrites).toEqual([["chan", "val-1"]]);

    // Test limit
    const limitedList: CheckpointTuple[] = [];
    for await (const cp of checkpointer.listCheckpoints(threadId, ns, 2)) {
      limitedList.push(cp);
    }
    expect(limitedList).toHaveLength(2);
    expect(limitedList[0].checkpointId).toBe("cp-3");
    expect(limitedList[1].checkpointId).toBe("cp-2");

    // Test beforeCheckpointId
    const filteredList: CheckpointTuple[] = [];
    for await (const cp of checkpointer.listCheckpoints(threadId, ns, undefined, "cp-3")) {
      filteredList.push(cp);
    }
    expect(filteredList).toHaveLength(2);
    expect(filteredList[0].checkpointId).toBe("cp-2");
    expect(filteredList[1].checkpointId).toBe("cp-1");
  });
});
