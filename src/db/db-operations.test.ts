import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDB, resetDBConnection } from "./db-connection";
import {
  getSetting,
  setSetting,
  deleteSetting,
  getPreset,
  savePreset,
  deletePreset,
  listPresets,
  getWorkflow,
  saveWorkflow,
  deleteWorkflow,
  listWorkflows,
  getThread,
  saveThread,
  deleteThread,
  listThreads,
  getMessage,
  saveMessage,
  getThreadMessages,
  deleteThreadMessages,
  getCheckpoint,
  saveCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,
  deleteThreadCheckpoints,
  getCheckpointWrite,
  saveCheckpointWrite,
  getCheckpointWrites,
  deleteThreadCheckpointWrites,
} from "./db-operations";
import type { Preset, Workflow, Thread, Message, Checkpoint, CheckpointWrites } from "./db-schema";

describe("IndexedDB Database Schema and Operations", () => {
  beforeEach(async () => {
    resetDBConnection();
    // Start with a clean database for each test
    const db = await getDB();
    const storeNames = Array.from(db.objectStoreNames);
    for (const name of storeNames) {
      await db.clear(name);
    }
  });

  afterEach(async () => {
    const db = await getDB();
    db.close();
    resetDBConnection();
  });

  it("should initialize the database with correct stores", async () => {
    const db = await getDB();
    expect(db.name).toBe("in-browser-llm-chat-db");
    expect(db.objectStoreNames.contains("settings")).toBe(true);
    expect(db.objectStoreNames.contains("presets")).toBe(true);
    expect(db.objectStoreNames.contains("workflows")).toBe(true);
    expect(db.objectStoreNames.contains("threads")).toBe(true);
    expect(db.objectStoreNames.contains("messages")).toBe(true);
    expect(db.objectStoreNames.contains("checkpoints")).toBe(true);
    expect(db.objectStoreNames.contains("checkpoint_writes")).toBe(true);
  });

  describe("Settings Store", () => {
    it("should set, get, and delete settings", async () => {
      // Test api_keys
      await setSetting("api_keys", { openRouter: "key1", gemini: "key2" });
      const apiKeys = await getSetting("api_keys");
      expect(apiKeys).toEqual({ openRouter: "key1", gemini: "key2" });

      // Test ui_config
      await setSetting("ui_config", { theme: "dark" });
      const theme = await getSetting("ui_config");
      expect(theme).toEqual({ theme: "dark" });

      // Test delete
      await deleteSetting("ui_config");
      const deletedTheme = await getSetting("ui_config");
      expect(deletedTheme).toBeUndefined();
    });
  });

  describe("Presets Store", () => {
    it("should perform CRUD on presets", async () => {
      const id = "11111111-1111-1111-1111-111111111111";
      const preset: Preset = {
        id,
        name: "Test Preset",
        provider: "gemini",
        model: "gemini-1.5-pro",
        temperature: 0.7,
        budgetPolicy: {
          maxStepsWithoutUser: 5,
          maxTokensPerRun: 1000,
        },
      };

      await savePreset(preset);
      const retrieved = await getPreset(id);
      expect(retrieved).toEqual(preset);

      const presetsList = await listPresets();
      expect(presetsList).toHaveLength(1);
      expect(presetsList[0]).toEqual(preset);

      await deletePreset(id);
      const afterDelete = await getPreset(id);
      expect(afterDelete).toBeUndefined();
    });
  });

  describe("Workflows Store", () => {
    it("should perform CRUD on workflows", async () => {
      const id = "workflow-1";
      const workflow: Workflow = {
        id,
        name: "Debate",
        description: "Debate Workflow",
        isBuiltIn: false,
        nodes: [{ id: "node-1", type: "agent" }],
        edges: [{ source: "node-1", target: "node-2" }],
      };

      await saveWorkflow(workflow);
      const retrieved = await getWorkflow(id);
      expect(retrieved).toEqual(workflow);

      const workflowsList = await listWorkflows();
      expect(workflowsList).toHaveLength(1);

      await deleteWorkflow(id);
      const afterDelete = await getWorkflow(id);
      expect(afterDelete).toBeUndefined();
    });
  });

  describe("Threads Store", () => {
    it("should perform CRUD on threads", async () => {
      const id = "22222222-2222-2222-2222-222222222222";
      const thread: Thread = {
        id,
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
      };

      await saveThread(thread);
      const retrieved = await getThread(id);
      expect(retrieved).toEqual(thread);

      const threadsList = await listThreads();
      expect(threadsList).toHaveLength(1);

      await deleteThread(id);
      const afterDelete = await getThread(id);
      expect(afterDelete).toBeUndefined();
    });
  });

  describe("Messages Store", () => {
    it("should perform CRUD and support ordered listing and thread deletion", async () => {
      const threadId = "22222222-2222-2222-2222-222222222222";
      const msg1: Message = {
        id: "33333333-3333-3333-3333-333333333331",
        threadId,
        sequence: 1,
        role: "user",
        content: "Hello",
        type: "text",
        createdAt: 100,
        checkpointId: null,
        checkpointNs: null,
      };

      const msg2: Message = {
        id: "33333333-3333-3333-3333-333333333332",
        threadId,
        sequence: 0, // Should come first when sorted
        role: "system",
        content: "System Prompt",
        type: "text",
        createdAt: 50,
        checkpointId: null,
        checkpointNs: null,
      };

      await saveMessage(msg1);
      await saveMessage(msg2);

      const retrieved1 = await getMessage(msg1.id);
      expect(retrieved1).toEqual(msg1);

      // Verify thread messages are ordered by sequence ascending
      const messages = await getThreadMessages(threadId);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(msg2); // sequence 0
      expect(messages[1]).toEqual(msg1); // sequence 1

      // Test thread message deletion
      await deleteThreadMessages(threadId);
      const messagesAfterDelete = await getThreadMessages(threadId);
      expect(messagesAfterDelete).toHaveLength(0);
    });
  });

  describe("Checkpoints Store", () => {
    it("should perform CRUD, latest retrieval, listing, and cascading deletion", async () => {
      const threadId = "22222222-2222-2222-2222-222222222222";
      const ns = "ns-1";

      const cp1: Checkpoint = {
        threadId,
        checkpointNs: ns,
        checkpointId: "cp-1",
        checkpoint: { currentNodeId: "node-1" },
        metadata: { step: 1 },
        parentCheckpointId: null,
        createdAt: 1000,
      };

      const cp2: Checkpoint = {
        threadId,
        checkpointNs: ns,
        checkpointId: "cp-2",
        checkpoint: { currentNodeId: "node-2" },
        metadata: { step: 2 },
        parentCheckpointId: "cp-1",
        createdAt: 2000, // Latest checkpoint
      };

      await saveCheckpoint(cp1);
      await saveCheckpoint(cp2);

      const retrieved = await getCheckpoint(threadId, ns, "cp-1");
      expect(retrieved).toEqual(cp1);

      // Verify getLatestCheckpoint returns cp2 because its createdAt is higher
      const latest = await getLatestCheckpoint(threadId, ns);
      expect(latest).toEqual(cp2);

      // Verify listCheckpoints returns checkpoints sorted by createdAt descending
      const list = await listCheckpoints(threadId, ns);
      expect(list).toHaveLength(2);
      expect(list[0]).toEqual(cp2);
      expect(list[1]).toEqual(cp1);

      // Delete thread checkpoints
      await deleteThreadCheckpoints(threadId);
      const afterDeleteList = await listCheckpoints(threadId, ns);
      expect(afterDeleteList).toHaveLength(0);
    });
  });

  describe("Checkpoint Writes Store", () => {
    it("should perform CRUD, fetch writes, and cascading deletion", async () => {
      const threadId = "22222222-2222-2222-2222-222222222222";
      const ns = "ns-1";
      const checkpointId = "cp-1";

      const write1: CheckpointWrites = {
        threadId,
        checkpointNs: ns,
        checkpointId,
        taskId: "task-1",
        idx: 0,
        channel: "chan-1",
        value: "val-1",
        createdAt: 1000,
      };

      const write2: CheckpointWrites = {
        threadId,
        checkpointNs: ns,
        checkpointId,
        taskId: "task-1",
        idx: 1,
        channel: "chan-1",
        value: "val-2",
        createdAt: 1100,
      };

      await saveCheckpointWrite(write1);
      await saveCheckpointWrite(write2);

      const retrieved = await getCheckpointWrite(threadId, ns, checkpointId, "task-1", 0);
      expect(retrieved).toEqual(write1);

      const writes = await getCheckpointWrites(threadId, ns, checkpointId);
      expect(writes).toHaveLength(2);
      expect(writes).toContainEqual(write1);
      expect(writes).toContainEqual(write2);

      await deleteThreadCheckpointWrites(threadId);
      const writesAfterDelete = await getCheckpointWrites(threadId, ns, checkpointId);
      expect(writesAfterDelete).toHaveLength(0);
    });
  });
});
