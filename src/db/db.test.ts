import { describe, it, expect, beforeEach } from "vitest";
import { type WorkflowStore } from "./db";
import {
  getDB,
  closeDB,
  getSetting,
  setSetting,
  deleteSetting,
  getAllSettings,
  getPreset,
  savePreset,
  deletePreset,
  getAllPresets,
  getWorkflow,
  saveWorkflow,
  deleteWorkflow,
  getThread,
  saveThread,
  deleteThread,
  getMessage,
  saveMessage,
  deleteMessage,
  getMessagesForThread,
  getCheckpoint,
  saveCheckpoint,
  getCheckpointWrite,
  saveCheckpointWrite,
  sweepInitializingThreads,
  sweepDeletingThreads,
  rollbackThreadHistory,
  _activeDeletions,
} from "./db";
import "fake-indexeddb/auto";

describe("Database Schema & Initialization", () => {
  beforeEach(async () => {
    await closeDB();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("in-browser-llm-chat-db");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  it("should initialize all object stores correctly", async () => {
    const db = await getDB();

    expect(db.objectStoreNames.contains("settings")).toBe(true);
    expect(db.objectStoreNames.contains("presets")).toBe(true);
    expect(db.objectStoreNames.contains("workflows")).toBe(true);
    expect(db.objectStoreNames.contains("threads")).toBe(true);
    expect(db.objectStoreNames.contains("messages")).toBe(true);
    const tx = db.transaction(["messages", "checkpoints", "checkpoint_writes"], "readonly");
    const messagesStore = tx.objectStore("messages");
    expect(messagesStore.indexNames.contains("by-thread-sequence")).toBe(true);

    expect(db.objectStoreNames.contains("checkpoints")).toBe(true);
    const checkpointsStore = tx.objectStore("checkpoints");
    expect(checkpointsStore.indexNames.contains("by-thread")).toBe(true);

    expect(db.objectStoreNames.contains("checkpoint_writes")).toBe(true);
    const checkpointWritesStore = tx.objectStore("checkpoint_writes");
    expect(checkpointWritesStore.indexNames.contains("by-thread")).toBe(true);

    await closeDB();
  });
});

describe("Database CRUD Helper Functions", () => {
  beforeEach(async () => {
    await closeDB();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("in-browser-llm-chat-db");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  it("should perform settings CRUD correctly", async () => {
    await setSetting("test_key", "test_value");
    const val = await getSetting("test_key");
    expect(val).toBe("test_value");

    const all = await getAllSettings();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual({ key: "test_key", value: "test_value" });

    await deleteSetting("test_key");
    const valAfter = await getSetting("test_key");
    expect(valAfter).toBeUndefined();
  });

  it("should perform presets CRUD correctly and enforce deletion safety", async () => {
    const preset = {
      id: "preset-1",
      name: "Default Gemini Flash",
      provider: "gemini" as const,
      model: "gemini-2.5-flash",
    };

    await savePreset(preset);
    const saved = await getPreset("preset-1");
    expect(saved).toEqual(preset);

    const all = await getAllPresets();
    expect(all).toHaveLength(1);

    // 1. Check default preset deletion safety
    await setSetting("default_preset_id", "preset-1");
    await expect(deletePreset("preset-1")).rejects.toThrow(
      "Cannot delete the global default preset.",
    );
    await deleteSetting("default_preset_id");

    // 2. Check thread referencing safety
    const thread = {
      id: "thread-1",
      title: "My Thread",
      workflowId: "workflow-1",
      workflowSnapshot: {},
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
    await expect(deletePreset("preset-1")).rejects.toThrow(
      "Cannot delete preset: referenced by threads",
    );

    // Clear reference
    thread.activePresetId = "another-preset";
    await saveThread(thread);

    // 3. Check workflow node referencing safety
    const workflow = {
      id: "workflow-1",
      name: "My Workflow",
      description: "Desc",
      isBuiltIn: false,
      nodes: [{ id: "agent-node", type: "agent", name: "Agent A", presetId: "preset-1" }],
      edges: [],
    };
    await saveWorkflow(workflow as WorkflowStore);
    await expect(deletePreset("preset-1")).rejects.toThrow(
      "Cannot delete preset: referenced by workflows",
    );

    // Directly delete thread from store first to avoid workflow deletion safety guard error
    const db = await getDB();
    await db.delete("threads", "thread-1");

    // Delete referencing workflow
    await deleteWorkflow("workflow-1");

    await deletePreset("preset-1");
    const deleted = await getPreset("preset-1");
    expect(deleted).toBeUndefined();
  });

  it("should perform workflows CRUD and enforce deletion safety", async () => {
    const customWorkflow = {
      id: "workflow-custom",
      name: "Custom Workflow",
      description: "My custom definition",
      isBuiltIn: false,
      nodes: [],
      edges: [],
    };

    const builtInWorkflow = {
      id: "workflow-builtin",
      name: "Built-In Workflow",
      description: "System definition",
      isBuiltIn: true,
      nodes: [],
      edges: [],
    };

    await saveWorkflow(customWorkflow);
    await saveWorkflow(builtInWorkflow);

    // 1. Built-in deletion safety
    await expect(deleteWorkflow("workflow-builtin")).rejects.toThrow(
      "Cannot delete built-in workflows.",
    );

    // 2. Thread referencing safety
    const thread = {
      id: "thread-1",
      title: "My Thread",
      workflowId: "workflow-custom",
      workflowSnapshot: {},
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

    await expect(deleteWorkflow("workflow-custom")).rejects.toThrow(
      "Cannot delete workflow: referenced by threads",
    );

    // Clean up referencing thread
    const db = await getDB();
    await db.delete("threads", "thread-1");

    await deleteWorkflow("workflow-custom");
    const deleted = await getWorkflow("workflow-custom");
    expect(deleted).toBeUndefined();
  });

  it("should perform threads CRUD and handle cascading deletions asynchronously", async () => {
    const thread = {
      id: "thread-1",
      title: "My Thread",
      workflowId: "workflow-1",
      workflowSnapshot: {},
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
    const saved = await getThread("thread-1");
    expect(saved).toEqual(thread);

    // Save associated messages, checkpoints, checkpoint writes
    const message = {
      id: "msg-1",
      threadId: "thread-1",
      sequence: 1,
      role: "user" as const,
      content: "Hello",
      type: "text" as const,
      createdAt: Date.now(),
      checkpointId: "cp-1",
      checkpointNs: "ns-1",
    };
    await saveMessage(message);

    const checkpoint = {
      threadId: "thread-1",
      checkpointNs: "ns-1",
      checkpointId: "cp-1",
      checkpoint: { state: "test" },
      metadata: {},
      parentCheckpointId: null,
      createdAt: Date.now(),
    };
    await saveCheckpoint(checkpoint);

    const write = {
      threadId: "thread-1",
      checkpointNs: "ns-1",
      checkpointId: "cp-1",
      taskId: "task-1",
      idx: 0,
      channel: "channel-1",
      value: "value-1",
      createdAt: Date.now(),
    };
    await saveCheckpointWrite(write);

    // Start cascading deletion
    await deleteThread("thread-1");

    // Thread status is set to "deleting" optimistically
    const threadStatus = await getThread("thread-1");
    expect(threadStatus?.status).toBe("deleting");

    // Wait for the cascading deletion promise
    const deletionPromise = _activeDeletions.get("thread-1")?.promise;
    expect(deletionPromise).toBeDefined();
    await deletionPromise;

    // Check all stores are cleared
    expect(await getThread("thread-1")).toBeUndefined();
    expect(await getMessage("msg-1")).toBeUndefined();
    expect(await getCheckpoint("thread-1", "ns-1", "cp-1")).toBeUndefined();
    expect(await getCheckpointWrite("thread-1", "ns-1", "cp-1", "task-1", 0)).toBeUndefined();
  });

  it("should support messages, checkpoints, and checkpoint writes CRUD", async () => {
    const msg = {
      id: "msg-1",
      threadId: "thread-1",
      sequence: 1,
      role: "user" as const,
      content: "Hello",
      type: "text" as const,
      createdAt: Date.now(),
      checkpointId: null,
      checkpointNs: null,
    };

    await saveMessage(msg);
    const savedMsg = await getMessage("msg-1");
    expect(savedMsg).toEqual(msg);

    const msgs = await getMessagesForThread("thread-1");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual(msg);

    await deleteMessage("msg-1");
    expect(await getMessage("msg-1")).toBeUndefined();
  });

  it("should sweep initializing and deleting threads correctly", async () => {
    const thread1 = {
      id: "thread-executing",
      title: "Executing Thread",
      workflowId: "workflow-1",
      workflowSnapshot: {},
      activePresetId: "preset-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "executing" as const,
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };

    const thread2 = {
      id: "thread-deleting",
      title: "Deleting Thread",
      workflowId: "workflow-1",
      workflowSnapshot: {},
      activePresetId: "preset-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "deleting" as const,
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };

    await saveThread(thread1);
    await saveThread(thread2);

    // 1. Test initializing sweep (reverting executing to inactive)
    await sweepInitializingThreads();
    const swept1 = await getThread("thread-executing");
    expect(swept1?.status).toBe("inactive");

    // 2. Test deleting sweep (resuming cascading deletion)
    await sweepDeletingThreads();
    const deletionPromise = _activeDeletions.get("thread-deleting")?.promise;
    expect(deletionPromise).toBeDefined();
    await deletionPromise;

    expect(await getThread("thread-deleting")).toBeUndefined();
  });

  it("should perform thread rollback and truncation logic correctly", async () => {
    // Save thread
    const thread = {
      id: "thread-rollback",
      title: "Rollback Thread",
      workflowId: "workflow-1",
      workflowSnapshot: {},
      activePresetId: "preset-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive" as const,
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: "cp-3",
      latestCheckpointNs: "ns-1",
      tokenStats: { promptTokens: 300, completionTokens: 300, totalTokens: 600 },
    };
    await saveThread(thread);

    // Save messages: sequence 0 (checkpoint 1), sequence 1 (checkpoint 2), sequence 2 (checkpoint 3)
    const msg0 = {
      id: "m0",
      threadId: "thread-rollback",
      sequence: 0,
      role: "user" as const,
      content: "Hello 0",
      type: "text" as const,
      createdAt: Date.now(),
      checkpointId: "cp-1",
      checkpointNs: "ns-1",
      metadata: { usage: { prompt_tokens: 100, completion_tokens: 100 } },
    };
    const msg1 = {
      id: "m1",
      threadId: "thread-rollback",
      sequence: 1,
      role: "assistant" as const,
      content: "Hello 1",
      type: "text" as const,
      createdAt: Date.now(),
      checkpointId: "cp-2",
      checkpointNs: "ns-1",
      metadata: { usage: { prompt_tokens: 100, completion_tokens: 100 } },
    };
    const msg2 = {
      id: "m2",
      threadId: "thread-rollback",
      sequence: 2,
      role: "user" as const,
      content: "Hello 2",
      type: "text" as const,
      createdAt: Date.now(),
      checkpointId: "cp-3",
      checkpointNs: "ns-1",
      metadata: { usage: { prompt_tokens: 100, completion_tokens: 100 } },
    };

    await saveMessage(msg0);
    await saveMessage(msg1);
    await saveMessage(msg2);

    // Save checkpoints
    const cp1 = {
      threadId: "thread-rollback",
      checkpointNs: "ns-1",
      checkpointId: "cp-1",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: null,
      createdAt: 1000,
    };
    const cp2 = {
      threadId: "thread-rollback",
      checkpointNs: "ns-1",
      checkpointId: "cp-2",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: "cp-1",
      createdAt: 2000,
    };
    const cp3 = {
      threadId: "thread-rollback",
      checkpointNs: "ns-1",
      checkpointId: "cp-3",
      checkpoint: {},
      metadata: {},
      parentCheckpointId: "cp-2",
      createdAt: 3000,
    };

    await saveCheckpoint(cp1);
    await saveCheckpoint(cp2);
    await saveCheckpoint(cp3);

    // Save checkpoint writes
    const w1 = {
      threadId: "thread-rollback",
      checkpointNs: "ns-1",
      checkpointId: "cp-1",
      taskId: "t1",
      idx: 0,
      channel: "c1",
      value: "v1",
      createdAt: 1000,
    };
    const w2 = {
      threadId: "thread-rollback",
      checkpointNs: "ns-1",
      checkpointId: "cp-2",
      taskId: "t2",
      idx: 0,
      channel: "c2",
      value: "v2",
      createdAt: 2000,
    };
    const w3 = {
      threadId: "thread-rollback",
      checkpointNs: "ns-1",
      checkpointId: "cp-3",
      taskId: "t3",
      idx: 0,
      channel: "c3",
      value: "v3",
      createdAt: 3000,
    };

    await saveCheckpointWrite(w1);
    await saveCheckpointWrite(w2);
    await saveCheckpointWrite(w3);

    // Perform rollback editing at sequence 2 (isEdit = true)
    // Should delete sequence > 2 (none), and roll back latest checkpoint to the predecessor of cp-3 (which is cp-2)
    // checkpoints > cp-2 should be deleted (cp-3)
    await rollbackThreadHistory("thread-rollback", 2, true);

    const afterEditThread = await getThread("thread-rollback");
    expect(afterEditThread?.latestCheckpointId).toBe("cp-2");

    expect(await getCheckpoint("thread-rollback", "ns-1", "cp-3")).toBeUndefined();
    expect(await getCheckpointWrite("thread-rollback", "ns-1", "cp-3", "t3", 0)).toBeUndefined();
    expect(await getCheckpoint("thread-rollback", "ns-1", "cp-2")).toBeDefined();

    // Messages should remain sequence 0, 1, 2
    const remainingMsgs = await getMessagesForThread("thread-rollback");
    expect(remainingMsgs).toHaveLength(3);

    // Perform rollback deleting sequence 1 (isEdit = false)
    // Should delete sequence >= 1 (m1, m2), and roll back latest checkpoint to cp-1
    await rollbackThreadHistory("thread-rollback", 1, false);

    const afterDeleteThread = await getThread("thread-rollback");
    expect(afterDeleteThread?.latestCheckpointId).toBe("cp-1");

    expect(await getCheckpoint("thread-rollback", "ns-1", "cp-2")).toBeUndefined();
    expect(await getCheckpointWrite("thread-rollback", "ns-1", "cp-2", "t2", 0)).toBeUndefined();

    // Check tokens recalculated (only m0 left, having usage prompt: 100, completion: 100)
    expect(afterDeleteThread?.tokenStats).toEqual({
      promptTokens: 100,
      completionTokens: 100,
      totalTokens: 200,
    });

    const finalMsgs = await getMessagesForThread("thread-rollback");
    expect(finalMsgs).toHaveLength(1);
    expect(finalMsgs[0].id).toBe("m0");
  });
});
