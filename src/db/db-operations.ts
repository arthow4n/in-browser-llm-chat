import { getDB } from "./db-connection";
import type {
  Setting,
  SettingsKey,
  ApiKeysValue,
  UiConfigValue,
  DefaultPresetIdValue,
  InjectedSystemMessagesValue,
  Preset,
  Workflow,
  Thread,
  Message,
  Checkpoint,
  CheckpointWrites,
} from "./db-schema";

// --- Settings Operations ---
export async function getSetting(key: "api_keys"): Promise<ApiKeysValue | undefined>;
export async function getSetting(key: "ui_config"): Promise<UiConfigValue | undefined>;
export async function getSetting(
  key: "default_preset_id",
): Promise<DefaultPresetIdValue | undefined>;
export async function getSetting(
  key: "injected_system_messages",
): Promise<InjectedSystemMessagesValue | undefined>;
export async function getSetting(key: SettingsKey): Promise<Setting["value"] | undefined> {
  const db = await getDB();
  const record = await db.get("settings", key);
  return record ? record.value : undefined;
}

export async function setSetting(key: "api_keys", value: ApiKeysValue): Promise<void>;
export async function setSetting(key: "ui_config", value: UiConfigValue): Promise<void>;
export async function setSetting(
  key: "default_preset_id",
  value: DefaultPresetIdValue,
): Promise<void>;
export async function setSetting(
  key: "injected_system_messages",
  value: InjectedSystemMessagesValue,
): Promise<void>;
export async function setSetting(key: SettingsKey, value: Setting["value"]): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key, value } as Setting);
}

export async function deleteSetting(key: SettingsKey): Promise<void> {
  const db = await getDB();
  await db.delete("settings", key);
}

// --- Presets Operations ---
export async function getPreset(id: string): Promise<Preset | undefined> {
  const db = await getDB();
  return db.get("presets", id);
}

export async function savePreset(preset: Preset): Promise<void> {
  const db = await getDB();
  await db.put("presets", preset);
}

export async function deletePreset(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("presets", id);
}

export async function listPresets(): Promise<Preset[]> {
  const db = await getDB();
  return db.getAll("presets");
}

// --- Workflows Operations ---
export async function getWorkflow(id: string): Promise<Workflow | undefined> {
  const db = await getDB();
  return db.get("workflows", id);
}

export async function saveWorkflow(workflow: Workflow): Promise<void> {
  const db = await getDB();
  await db.put("workflows", workflow);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("workflows", id);
}

export async function listWorkflows(): Promise<Workflow[]> {
  const db = await getDB();
  return db.getAll("workflows");
}

// --- Threads Operations ---
export async function getThread(id: string): Promise<Thread | undefined> {
  const db = await getDB();
  return db.get("threads", id);
}

export async function saveThread(thread: Thread): Promise<void> {
  const db = await getDB();
  await db.put("threads", thread);
}

export async function deleteThread(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("threads", id);
}

export async function listThreads(): Promise<Thread[]> {
  const db = await getDB();
  return db.getAll("threads");
}

// --- Messages Operations ---
export async function getMessage(id: string): Promise<Message | undefined> {
  const db = await getDB();
  return db.get("messages", id);
}

export async function saveMessage(message: Message): Promise<void> {
  const db = await getDB();
  await db.put("messages", message);
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("messages", id);
}

export async function getThreadMessages(threadId: string): Promise<Message[]> {
  const db = await getDB();
  // Using the threadId_sequence compound index ensures it's sorted by sequence ascending.
  // Note: key range is from [threadId, -Infinity] to [threadId, Infinity]
  const range = IDBKeyRange.bound([threadId, -Infinity], [threadId, Infinity]);
  return db.getAllFromIndex("messages", "threadId_sequence", range);
}

export async function deleteThreadMessages(threadId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("messages", "readwrite");
  const index = tx.store.index("threadId");
  let cursor = await index.openCursor(IDBKeyRange.only(threadId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// --- Checkpoints Operations ---
export async function getCheckpoint(
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
): Promise<Checkpoint | undefined> {
  const db = await getDB();
  return db.get("checkpoints", [threadId, checkpointNs, checkpointId]);
}

export async function saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
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

export async function getLatestCheckpoint(
  threadId: string,
  checkpointNs: string,
): Promise<Checkpoint | undefined> {
  const db = await getDB();
  const tx = db.transaction("checkpoints", "readonly");
  const store = tx.objectStore("checkpoints");
  let cursor = await store.openCursor(null, "prev");
  while (cursor) {
    const val = cursor.value;
    if (val.threadId === threadId && val.checkpointNs === checkpointNs) {
      return val;
    }
    cursor = await cursor.continue();
  }
  return undefined;
}

export async function listCheckpoints(
  threadId: string,
  checkpointNs: string,
): Promise<Checkpoint[]> {
  const db = await getDB();
  const tx = db.transaction("checkpoints", "readonly");
  const store = tx.objectStore("checkpoints");
  const results: Checkpoint[] = [];
  let cursor = await store.openCursor(null, "prev");
  while (cursor) {
    const val = cursor.value;
    if (val.threadId === threadId && val.checkpointNs === checkpointNs) {
      results.push(val);
    }
    cursor = await cursor.continue();
  }
  return results;
}

export async function deleteThreadCheckpoints(threadId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("checkpoints", "readwrite");
  const index = tx.store.index("threadId");
  let cursor = await index.openCursor(IDBKeyRange.only(threadId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// --- Checkpoint Writes Operations ---
export async function getCheckpointWrite(
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
  taskId: string,
  idx: number,
): Promise<CheckpointWrites | undefined> {
  const db = await getDB();
  return db.get("checkpoint_writes", [threadId, checkpointNs, checkpointId, taskId, idx]);
}

export async function saveCheckpointWrite(write: CheckpointWrites): Promise<void> {
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

export async function getCheckpointWrites(
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
): Promise<CheckpointWrites[]> {
  const db = await getDB();
  const tx = db.transaction("checkpoint_writes", "readonly");
  const store = tx.objectStore("checkpoint_writes");
  const results: CheckpointWrites[] = [];
  let cursor = await store.openCursor(null, "next");
  while (cursor) {
    const val = cursor.value;
    if (
      val.threadId === threadId &&
      val.checkpointNs === checkpointNs &&
      val.checkpointId === checkpointId
    ) {
      results.push(val);
    }
    cursor = await cursor.continue();
  }
  return results;
}

export async function deleteThreadCheckpointWrites(threadId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("checkpoint_writes", "readwrite");
  const index = tx.store.index("threadId");
  let cursor = await index.openCursor(IDBKeyRange.only(threadId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
