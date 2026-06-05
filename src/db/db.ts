import { openDB, type DBSchema, IDBPDatabase } from "idb";
import { type WorkflowNode, type WorkflowEdge } from "../workflow/schemas";

export interface SettingsStore {
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

export interface PresetStore {
  id: string;
  name: string;
  provider: "openrouter" | "gemini";
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  reasoningLevel?: string;
  budgetPolicy?: { maxStepsWithoutUser: number; maxTokensPerRun: number | null };
}

export interface WorkflowStore {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  injectedSystemMessages?: Array<{ content: string; depth: number }>;
}

export interface ThreadStore {
  id: string;
  title: string;
  workflowId: string;
  workflowSnapshot: unknown;
  activePresetId: string;
  createdAt: number;
  updatedAt: number;
  parentThreadId: string | null;
  parentMessageId: string | null;
  status: "inactive" | "executing" | "awaiting_input" | "error" | "deleting";
  activeInterrupt: unknown;
  draftAnswers?: Record<string, unknown>;
  errorMessage: string | null;
  latestCheckpointId: string | null;
  latestCheckpointNs: string | null;
  tokenStats: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}

export interface MessageStore {
  id: string;
  threadId: string;
  sequence: number;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  type: "text" | "reasoning" | "tool_call" | "tool_result";
  toolCallId?: string;
  name?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
  checkpointId: string | null;
  checkpointNs: string | null;
}

export interface CheckpointStore {
  threadId: string;
  checkpointNs: string;
  checkpointId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkpoint: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
  parentCheckpointId: string | null;
  createdAt: number;
}

export interface CheckpointWriteStore {
  threadId: string;
  checkpointNs: string;
  checkpointId: string;
  taskId: string;
  idx: number;
  channel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  createdAt: number;
}

export interface LLMChatDB extends DBSchema {
  settings: {
    key: string;
    value: SettingsStore;
  };
  presets: {
    key: string;
    value: PresetStore;
  };
  workflows: {
    key: string;
    value: WorkflowStore;
  };
  threads: {
    key: string;
    value: ThreadStore;
  };
  messages: {
    key: string;
    value: MessageStore;
    indexes: {
      "by-thread-sequence": [string, number];
    };
  };
  checkpoints: {
    key: [string, string, string]; // [threadId, checkpointNs, checkpointId]
    value: CheckpointStore;
    indexes: {
      "by-thread": string;
    };
  };
  checkpoint_writes: {
    key: [string, string, string, string, number]; // [threadId, checkpointNs, checkpointId, taskId, idx]
    value: CheckpointWriteStore;
    indexes: {
      "by-thread": string;
    };
  };
}

const DB_NAME = "in-browser-llm-chat-db";
const DB_VERSION = 1;

export async function initDB(): Promise<IDBPDatabase<LLMChatDB>> {
  return openDB<LLMChatDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("presets")) {
        db.createObjectStore("presets", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("workflows")) {
        db.createObjectStore("workflows", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("threads")) {
        db.createObjectStore("threads", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("messages")) {
        const messageStore = db.createObjectStore("messages", { keyPath: "id" });
        messageStore.createIndex("by-thread-sequence", ["threadId", "sequence"]);
      }
      if (!db.objectStoreNames.contains("checkpoints")) {
        const checkpointStore = db.createObjectStore("checkpoints", {
          keyPath: ["threadId", "checkpointNs", "checkpointId"],
        });
        checkpointStore.createIndex("by-thread", "threadId");
      }
      if (!db.objectStoreNames.contains("checkpoint_writes")) {
        const checkpointWriteStore = db.createObjectStore("checkpoint_writes", {
          keyPath: ["threadId", "checkpointNs", "checkpointId", "taskId", "idx"],
        });
        checkpointWriteStore.createIndex("by-thread", "threadId");
      }
    },
  });
}

let dbPromise: Promise<IDBPDatabase<LLMChatDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<LLMChatDB>> {
  if (!dbPromise) {
    dbPromise = initDB();
  }
  return dbPromise;
}

// Custom helper to reset memoized db promise for tests
export function resetDBPromise(): void {
  dbPromise = null;
}

export async function closeDB(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // Ignore errors if database failed to open
    }
    dbPromise = null;
  }
}

// -------------------------------------------------------------
// Settings Store CRUD Helpers
// -------------------------------------------------------------

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const record = await db.get("settings", key);
  return record ? record.value : undefined;
}

export async function setSetting<T = unknown>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key, value });
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDB();
  await db.delete("settings", key);
}

export async function getAllSettings(): Promise<SettingsStore[]> {
  const db = await getDB();
  return db.getAll("settings");
}

// -------------------------------------------------------------
// Presets Store CRUD Helpers
// -------------------------------------------------------------

export async function getPreset(id: string): Promise<PresetStore | undefined> {
  const db = await getDB();
  return db.get("presets", id);
}

export async function savePreset(preset: PresetStore): Promise<void> {
  const db = await getDB();
  await db.put("presets", preset);
}

export async function deletePreset(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["settings", "threads", "workflows", "presets"], "readwrite");

  // 1. Safety Guard: Do not allow deleting the global default preset
  const defaultPresetSetting = await tx.objectStore("settings").get("default_preset_id");
  if (defaultPresetSetting && defaultPresetSetting.value === id) {
    throw new Error("Cannot delete the global default preset.");
  }

  // 2. Safety Guard: Do not allow deleting a preset referenced by any thread (activePresetId)
  const threads = await tx.objectStore("threads").getAll();
  const referencingThreads = threads.filter((t) => t.activePresetId === id);
  if (referencingThreads.length > 0) {
    const threadTitles = referencingThreads.map((t) => t.title).join(", ");
    throw new Error(`Cannot delete preset: referenced by threads (${threadTitles}).`);
  }

  // 3. Safety Guard: Do not allow deleting a preset referenced by any workflow node
  const workflows = await tx.objectStore("workflows").getAll();
  const referencingWorkflows: string[] = [];
  for (const wf of workflows) {
    const hasPreset = wf.nodes?.some((node) => node.presetId === id);

    if (hasPreset) {
      referencingWorkflows.push(wf.name);
    }
  }
  if (referencingWorkflows.length > 0) {
    throw new Error(
      `Cannot delete preset: referenced by workflows (${referencingWorkflows.join(", ")}).`,
    );
  }

  await tx.objectStore("presets").delete(id);
  await tx.done;
}

export async function getAllPresets(): Promise<PresetStore[]> {
  const db = await getDB();
  return db.getAll("presets");
}

// -------------------------------------------------------------
// Workflows Store CRUD Helpers
// -------------------------------------------------------------

export async function getWorkflow(id: string): Promise<WorkflowStore | undefined> {
  const db = await getDB();
  return db.get("workflows", id);
}

export async function saveWorkflow(workflow: WorkflowStore): Promise<void> {
  const db = await getDB();
  await db.put("workflows", workflow);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["workflows", "threads"], "readwrite");

  const workflow = await tx.objectStore("workflows").get(id);
  if (!workflow) {
    return;
  }

  // 1. Safety Guard: Do not allow deleting a built-in workflow
  if (workflow.isBuiltIn) {
    throw new Error("Cannot delete built-in workflows.");
  }

  // 2. Safety Guard: Do not allow deleting a workflow referenced by any thread
  const threads = await tx.objectStore("threads").getAll();
  const referencingThreads = threads.filter((t) => t.workflowId === id);
  if (referencingThreads.length > 0) {
    const threadTitles = referencingThreads.map((t) => t.title).join(", ");
    throw new Error(`Cannot delete workflow: referenced by threads (${threadTitles}).`);
  }

  await tx.objectStore("workflows").delete(id);
  await tx.done;
}

export async function getAllWorkflows(): Promise<WorkflowStore[]> {
  const db = await getDB();
  return db.getAll("workflows");
}

// -------------------------------------------------------------
// Threads Store CRUD Helpers (including cascading delete pipeline)
// -------------------------------------------------------------

export const _activeDeletions = new Map<string, { promise: Promise<void>; resolve: () => void }>();

const scheduleCallback =
  typeof window !== "undefined" && typeof window.requestIdleCallback === "function"
    ? (cb: () => void) => {
        window.requestIdleCallback(cb, { timeout: 1000 });
      }
    : (cb: () => void) => setTimeout(cb, 0);

async function runDeletionStep(threadId: string): Promise<void> {
  const db = await getDB();

  // Phase 3: Delete Messages (up to 500)
  {
    const tx = db.transaction("messages", "readwrite");
    const index = tx.objectStore("messages").index("by-thread-sequence");
    const range = IDBKeyRange.bound([threadId, 0], [threadId, Number.MAX_SAFE_INTEGER]);
    let cursor = await index.openCursor(range);
    let count = 0;
    while (cursor && count < 500) {
      await cursor.delete();
      count++;
      cursor = await cursor.continue();
    }
    await tx.done;
    if (count > 0 && cursor) {
      scheduleCallback(() => runDeletionStep(threadId));
      return;
    }
  }

  // Phase 4: Delete Checkpoint Writes (up to 500)
  {
    const tx = db.transaction("checkpoint_writes", "readwrite");
    const index = tx.objectStore("checkpoint_writes").index("by-thread");
    const range = IDBKeyRange.only(threadId);
    let cursor = await index.openCursor(range);
    let count = 0;
    while (cursor && count < 500) {
      await cursor.delete();
      count++;
      cursor = await cursor.continue();
    }
    await tx.done;
    if (count > 0 && cursor) {
      scheduleCallback(() => runDeletionStep(threadId));
      return;
    }
  }

  // Phase 5: Delete Checkpoints (up to 500)
  {
    const tx = db.transaction("checkpoints", "readwrite");
    const index = tx.objectStore("checkpoints").index("by-thread");
    const range = IDBKeyRange.only(threadId);
    let cursor = await index.openCursor(range);
    let count = 0;
    while (cursor && count < 500) {
      await cursor.delete();
      count++;
      cursor = await cursor.continue();
    }
    await tx.done;
    if (count > 0 && cursor) {
      scheduleCallback(() => runDeletionStep(threadId));
      return;
    }
  }

  // Phase 6: Finalize Thread Purge
  {
    const tx = db.transaction("threads", "readwrite");
    await tx.objectStore("threads").delete(threadId);
    await tx.done;
  }

  // Finalize active deletion promise tracking
  const active = _activeDeletions.get(threadId);
  if (active) {
    active.resolve();
    _activeDeletions.delete(threadId);
  }
}

export async function deleteThread(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("threads", "readwrite");
  const thread = await tx.objectStore("threads").get(id);
  if (!thread) {
    return;
  }

  thread.status = "deleting";
  await tx.objectStore("threads").put(thread);
  await tx.done;

  let resolveFn: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
  });
  _activeDeletions.set(id, { promise, resolve: resolveFn });

  scheduleCallback(() => runDeletionStep(id));
}

export async function getThread(id: string): Promise<ThreadStore | undefined> {
  const db = await getDB();
  return db.get("threads", id);
}

export async function saveThread(thread: ThreadStore): Promise<void> {
  const db = await getDB();
  await db.put("threads", thread);
}

export async function getAllThreads(): Promise<ThreadStore[]> {
  const db = await getDB();
  const threads = await db.getAll("threads");
  return threads.filter((t) => t.status !== "deleting").sort((a, b) => b.updatedAt - a.updatedAt);
}

// -------------------------------------------------------------
// Messages Store CRUD Helpers
// -------------------------------------------------------------

export async function getMessage(id: string): Promise<MessageStore | undefined> {
  const db = await getDB();
  return db.get("messages", id);
}

export async function saveMessage(message: MessageStore): Promise<void> {
  const db = await getDB();
  await db.put("messages", message);
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("messages", id);
}

export async function getMessagesForThread(threadId: string): Promise<MessageStore[]> {
  const db = await getDB();
  const index = db
    .transaction("messages", "readonly")
    .objectStore("messages")
    .index("by-thread-sequence");
  const range = IDBKeyRange.bound([threadId, 0], [threadId, Number.MAX_SAFE_INTEGER]);
  return index.getAll(range);
}

// -------------------------------------------------------------
// Checkpoints Store CRUD Helpers
// -------------------------------------------------------------

export async function getCheckpoint(
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
): Promise<CheckpointStore | undefined> {
  const db = await getDB();
  return db.get("checkpoints", [threadId, checkpointNs, checkpointId]);
}

export async function saveCheckpoint(checkpoint: CheckpointStore): Promise<void> {
  const db = await getDB();
  await db.put("checkpoints", checkpoint);
}

export async function deleteCheckpoint(
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
): Promise<void> {
  const db = await getDB();
  await db.delete("checkpoints", [threadId, checkpointNs, checkpointId]);
}

// -------------------------------------------------------------
// Checkpoint Writes Store CRUD Helpers
// -------------------------------------------------------------

export async function getCheckpointWrite(
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
  taskId: string,
  idx: number,
): Promise<CheckpointWriteStore | undefined> {
  const db = await getDB();
  return db.get("checkpoint_writes", [threadId, checkpointNs, checkpointId, taskId, idx]);
}

export async function saveCheckpointWrite(write: CheckpointWriteStore): Promise<void> {
  const db = await getDB();
  await db.put("checkpoint_writes", write);
}

export async function deleteCheckpointWrite(
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
  taskId: string,
  idx: number,
): Promise<void> {
  const db = await getDB();
  await db.delete("checkpoint_writes", [threadId, checkpointNs, checkpointId, taskId, idx]);
}

// -------------------------------------------------------------
// Sweep Helpers
// -------------------------------------------------------------

export async function sweepInitializingThreads(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("threads", "readwrite");
  const store = tx.objectStore("threads");
  const threads = await store.getAll();
  for (const t of threads) {
    if (t.status === "executing") {
      t.status = "inactive";
      await store.put(t);
    }
  }
  await tx.done;
}

export async function sweepDeletingThreads(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("threads", "readonly");
  const threads = await tx.objectStore("threads").getAll();
  const deletingThreads = threads.filter((t) => t.status === "deleting");
  for (const t of deletingThreads) {
    let resolveFn: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    _activeDeletions.set(t.id, { promise, resolve: resolveFn });
    scheduleCallback(() => runDeletionStep(t.id));
  }
}

// -------------------------------------------------------------
// History Rollback & Truncation Helper
// -------------------------------------------------------------

function isDescendant(
  checkpoint: CheckpointStore,
  precedingId: string,
  checkpointsMap: Map<string, CheckpointStore>,
): boolean {
  let current: CheckpointStore | undefined = checkpoint;
  while (current && current.parentCheckpointId) {
    if (current.parentCheckpointId === precedingId) {
      return true;
    }
    current = checkpointsMap.get(current.parentCheckpointId);
  }
  return false;
}

export async function rollbackThreadHistory(
  threadId: string,
  idx: number,
  isEdit: boolean,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ["threads", "messages", "checkpoints", "checkpoint_writes"],
    "readwrite",
  );

  const messagesStore = tx.objectStore("messages");
  const threadStore = tx.objectStore("threads");

  // Load the target thread
  const thread = await threadStore.get(threadId);
  if (!thread) {
    throw new Error(`Thread ${threadId} not found.`);
  }

  // Load all messages for the thread
  const allMessages = await messagesStore
    .index("by-thread-sequence")
    .getAll(IDBKeyRange.bound([threadId, 0], [threadId, Number.MAX_SAFE_INTEGER]));

  const targetMessage = allMessages.find((m) => m.sequence === idx);
  const deletedCheckpointId = targetMessage?.checkpointId;
  const deletedCheckpointNs = targetMessage?.checkpointNs;

  // Split messages into remaining vs toDelete
  const remainingMessages = allMessages.filter((m) =>
    isEdit ? m.sequence <= idx : m.sequence < idx,
  );
  const messagesToDelete = allMessages.filter((m) =>
    isEdit ? m.sequence > idx : m.sequence >= idx,
  );

  // 1. Identify the preceding checkpoint
  let precedingCheckpointId: string | null = null;
  let precedingCheckpointNs: string | null = null;

  // Search backward starting from idx - 1 down to 0
  const sortedRemaining = [...remainingMessages].sort((a, b) => b.sequence - a.sequence);
  for (const m of sortedRemaining) {
    if (m.checkpointId !== null && m.checkpointId !== undefined) {
      if (m.checkpointNs !== deletedCheckpointNs || m.checkpointId !== deletedCheckpointId) {
        precedingCheckpointId = m.checkpointId;
        precedingCheckpointNs = m.checkpointNs;
        break;
      }
    }
  }

  // 2. Set the thread's latestCheckpointId and latestCheckpointNs
  thread.latestCheckpointId = precedingCheckpointId;
  thread.latestCheckpointNs = precedingCheckpointNs;

  // 3. Delete matching checkpoints and checkpoint writes
  const checkpointsStore = tx.objectStore("checkpoints");
  const checkpointWritesStore = tx.objectStore("checkpoint_writes");

  const allCheckpoints = await checkpointsStore.index("by-thread").getAll(threadId);

  let precedingCreatedAt = -1;
  if (precedingCheckpointId && precedingCheckpointNs) {
    const prec = await checkpointsStore.get([
      threadId,
      precedingCheckpointNs,
      precedingCheckpointId,
    ]);
    if (prec) {
      precedingCreatedAt = prec.createdAt;
    }
  }

  const checkpointsMap = new Map<string, CheckpointStore>();
  for (const cp of allCheckpoints) {
    checkpointsMap.set(cp.checkpointId, cp);
  }

  for (const cp of allCheckpoints) {
    let shouldDelete = false;
    if (precedingCheckpointId === null) {
      // If preceding checkpoint is null, delete ALL checkpoints
      shouldDelete = true;
    } else {
      if (cp.createdAt > precedingCreatedAt) {
        shouldDelete = true;
      } else if (isDescendant(cp, precedingCheckpointId, checkpointsMap)) {
        shouldDelete = true;
      }
    }

    if (shouldDelete) {
      // Delete checkpoint
      await checkpointsStore.delete([threadId, cp.checkpointNs, cp.checkpointId]);

      // Delete corresponding checkpoint writes
      const writes = await checkpointWritesStore.index("by-thread").getAll(threadId);
      for (const w of writes) {
        if (w.checkpointNs === cp.checkpointNs && w.checkpointId === cp.checkpointId) {
          await checkpointWritesStore.delete([
            threadId,
            w.checkpointNs,
            w.checkpointId,
            w.taskId,
            w.idx,
          ]);
        }
      }
    }
  }

  // 4. Calculate token stats from remaining messages
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  function isUsageRecord(val: unknown): val is Record<string, number> {
    return typeof val === "object" && val !== null;
  }

  for (const msg of remainingMessages) {
    const usage = msg.metadata?.usage;
    if (isUsageRecord(usage)) {
      const pt = usage.prompt_tokens ?? usage.promptTokens ?? 0;
      const ct = usage.completion_tokens ?? usage.completionTokens ?? 0;
      const tt = usage.total_tokens ?? usage.totalTokens ?? pt + ct;
      promptTokens += pt;
      completionTokens += ct;
      totalTokens += tt;
    }
  }

  thread.tokenStats = { promptTokens, completionTokens, totalTokens };

  // Update thread record
  await threadStore.put(thread);

  // Delete matching messages
  for (const m of messagesToDelete) {
    await messagesStore.delete(m.id);
  }

  await tx.done;
}
