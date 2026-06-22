import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { saveThread } from "../db/db-operations";
import { checkpointCompactionMachine } from "./checkpoint-compaction-machine";
import { createActor } from "xstate";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import type { Thread, Checkpoint, CheckpointWrites, Message } from "../db/db-schema";

describe("checkpointCompactionMachine", () => {
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

  it("should handle state transitions and perform compaction deleting older checkpoints/writes and nullifying messages", async () => {
    // 1. Setup a thread
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
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: "cp-latest",
      latestCheckpointNs: "ns-1",
      tokenStats: null,
    };
    await saveThread(thread);

    // 2. Setup checkpoints
    const checkpointOld: Checkpoint = {
      threadId,
      checkpointNs: "ns-1",
      checkpointId: "cp-old",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: null,
      createdAt: Date.now(),
    };
    const checkpointLatest: Checkpoint = {
      threadId,
      checkpointNs: "ns-1",
      checkpointId: "cp-latest",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: "cp-old",
      createdAt: Date.now(),
    };
    await db!.put("checkpoints", checkpointOld);
    await db!.put("checkpoints", checkpointLatest);

    // 3. Setup checkpoint writes
    const writeOld: CheckpointWrites = {
      threadId,
      checkpointNs: "ns-1",
      checkpointId: "cp-old",
      taskId: "task-1",
      idx: 0,
      channel: "ch-1",
      value: "val-old",
      createdAt: Date.now(),
    };
    const writeLatest: CheckpointWrites = {
      threadId,
      checkpointNs: "ns-1",
      checkpointId: "cp-latest",
      taskId: "task-1",
      idx: 0,
      channel: "ch-1",
      value: "val-latest",
      createdAt: Date.now(),
    };
    await db!.put("checkpoint_writes", writeOld);
    await db!.put("checkpoint_writes", writeLatest);

    // 4. Setup messages
    const messageOld: Message = {
      id: "11111111-1111-1111-1111-111111111111",
      threadId,
      sequence: 0,
      role: "user",
      content: "Hello old",
      type: "text",
      createdAt: Date.now(),
      checkpointId: "cp-old",
      checkpointNs: "ns-1",
    };
    const messageLatest: Message = {
      id: "22222222-2222-2222-2222-222222222222",
      threadId,
      sequence: 1,
      role: "assistant",
      content: "Hello latest",
      type: "text",
      createdAt: Date.now(),
      checkpointId: "cp-latest",
      checkpointNs: "ns-1",
    };
    await db!.put("messages", messageOld);
    await db!.put("messages", messageLatest);

    // 5. Instantiate and run compaction machine actor
    const actor = createActor(checkpointCompactionMachine, {
      input: { threadId },
    });
    actor.start();

    expect(actor.getSnapshot().value).toBe("idle");

    // Transition to confirming
    actor.send({ type: "START_COMPACT" });
    expect(actor.getSnapshot().value).toBe("confirming");

    // Transition to compacting
    actor.send({ type: "CONFIRM_COMPACT" });

    // Wait for the async compactActor promise to resolve
    await new Promise<void>((resolve) => {
      actor.subscribe((state) => {
        if (state.value === "success") {
          resolve();
        }
      });
    });

    // Check checkpoints in DB
    const checkpoints = await db!.getAll("checkpoints");
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0].checkpointId).toBe("cp-latest");

    // Check writes in DB
    const writes = await db!.getAll("checkpoint_writes");
    expect(writes.length).toBe(1);
    expect(writes[0].checkpointId).toBe("cp-latest");

    // Check messages in DB
    const msgOld = await db!.get("messages", messageOld.id);
    expect(msgOld?.checkpointId).toBeNull();
    expect(msgOld?.checkpointNs).toBeNull();

    const msgLatest = await db!.get("messages", messageLatest.id);
    expect(msgLatest?.checkpointId).toBe("cp-latest");
    expect(msgLatest?.checkpointNs).toBe("ns-1");

    // Dismiss success
    actor.send({ type: "DISMISS" });
    expect(actor.getSnapshot().value).toBe("idle");
  });
});
