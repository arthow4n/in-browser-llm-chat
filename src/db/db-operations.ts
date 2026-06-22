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
  const index = store.index("threadId");
  let cursor = await index.openCursor(IDBKeyRange.only(threadId), "prev");
  while (cursor) {
    const val = cursor.value;
    if (val.checkpointNs === checkpointNs) {
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
  const index = store.index("threadId");
  const results: Checkpoint[] = [];
  let cursor = await index.openCursor(IDBKeyRange.only(threadId), "prev");
  while (cursor) {
    const val = cursor.value;
    if (val.checkpointNs === checkpointNs) {
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
  const index = store.index("threadId");
  const results: CheckpointWrites[] = [];
  let cursor = await index.openCursor(IDBKeyRange.only(threadId), "next");
  while (cursor) {
    const val = cursor.value;
    if (val.checkpointNs === checkpointNs && val.checkpointId === checkpointId) {
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

export async function editMessageAndRollback(
  threadId: string,
  messageId: string,
  editContent: string,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ["messages", "checkpoints", "checkpoint_writes", "threads"],
    "readwrite",
  );

  const messagesStore = tx.objectStore("messages");
  const checkpointsStore = tx.objectStore("checkpoints");
  const writesStore = tx.objectStore("checkpoint_writes");
  const threadsStore = tx.objectStore("threads");

  const editedMsg = await messagesStore.get(messageId);
  if (!editedMsg) {
    throw new Error(`Message ${messageId} not found`);
  }
  const idx = editedMsg.sequence;
  const editedMsgCheckpointId = editedMsg.checkpointId;

  const range = IDBKeyRange.bound([threadId, -Infinity], [threadId, Infinity]);
  const index = messagesStore.index("threadId_sequence");
  const allMessages = await index.getAll(range);

  const itemIdx = allMessages.findIndex((m) => m.id === messageId);
  if (itemIdx === -1) {
    throw new Error(`Message ${messageId} not in thread ${threadId}`);
  }

  let precedingCheckpointId: string | null = null;
  let precedingCheckpointNs: string | null = null;
  for (let i = itemIdx - 1; i >= 0; i--) {
    const m = allMessages[i];
    if (m.checkpointId && m.checkpointId !== editedMsgCheckpointId) {
      precedingCheckpointId = m.checkpointId;
      precedingCheckpointNs = m.checkpointNs;
      break;
    }
  }

  const cpIndex = checkpointsStore.index("threadId");
  const threadCheckpoints = await cpIndex.getAll(IDBKeyRange.only(threadId));

  let targetCpCreatedAt = -1;
  if (precedingCheckpointId && precedingCheckpointNs) {
    const targetCp = threadCheckpoints.find(
      (cp) =>
        cp.checkpointId === precedingCheckpointId && cp.checkpointNs === precedingCheckpointNs,
    );
    if (targetCp) {
      targetCpCreatedAt = targetCp.createdAt;
    }
  }

  const adjMap = new Map<string, Checkpoint[]>();
  for (const cp of threadCheckpoints) {
    if (cp.parentCheckpointId) {
      const children = adjMap.get(cp.parentCheckpointId) || [];
      children.push(cp);
      adjMap.set(cp.parentCheckpointId, children);
    }
  }

  const checkpointsToDelete = new Set<string>();
  const visited = new Set<string>();

  function dfs(cpId: string) {
    if (visited.has(cpId)) return;
    visited.add(cpId);
    const children = adjMap.get(cpId) || [];
    for (const child of children) {
      checkpointsToDelete.add(`${child.checkpointNs}:${child.checkpointId}`);
      dfs(child.checkpointId);
    }
  }

  if (precedingCheckpointId) {
    dfs(precedingCheckpointId);
  }

  for (const cp of threadCheckpoints) {
    const key = `${cp.checkpointNs}:${cp.checkpointId}`;
    const isDescendant = checkpointsToDelete.has(key);
    const isAfter = cp.createdAt > targetCpCreatedAt;
    if (isDescendant || isAfter) {
      await checkpointsStore.delete([threadId, cp.checkpointNs, cp.checkpointId]);
      const writesIndex = writesStore.index("threadId");
      let writesCursor = await writesIndex.openCursor(IDBKeyRange.only(threadId));
      while (writesCursor) {
        const w = writesCursor.value;
        if (w.checkpointNs === cp.checkpointNs && w.checkpointId === cp.checkpointId) {
          await writesCursor.delete();
        }
        writesCursor = await writesCursor.continue();
      }
    }
  }

  for (const m of allMessages) {
    if (m.sequence > idx) {
      await messagesStore.delete(m.id);
    } else if (m.sequence === idx) {
      m.content = editContent;
      m.checkpointId = null;
      m.checkpointNs = null;
      await messagesStore.put(m);
    }
  }

  const thread = await threadsStore.get(threadId);
  if (thread) {
    thread.latestCheckpointId = precedingCheckpointId;
    thread.latestCheckpointNs = precedingCheckpointNs;
    thread.status = "inactive";

    const remainingMessages = allMessages.filter((m) => m.sequence <= idx);
    let promptTokens = 0;
    let completionTokens = 0;
    for (const m of remainingMessages) {
      if (m.metadata?.usage) {
        promptTokens += m.metadata.usage.promptTokens || m.metadata.usage.prompt_tokens || 0;
        completionTokens +=
          m.metadata.usage.completionTokens || m.metadata.usage.completion_tokens || 0;
      }
    }
    thread.tokenStats = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };

    await threadsStore.put(thread);
  }

  await tx.done;
}

export async function deleteMessageAndRollback(threadId: string, messageId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ["messages", "checkpoints", "checkpoint_writes", "threads"],
    "readwrite",
  );

  const messagesStore = tx.objectStore("messages");
  const checkpointsStore = tx.objectStore("checkpoints");
  const writesStore = tx.objectStore("checkpoint_writes");
  const threadsStore = tx.objectStore("threads");

  const deletedMsg = await messagesStore.get(messageId);
  if (!deletedMsg) {
    throw new Error(`Message ${messageId} not found`);
  }
  const idx = deletedMsg.sequence;
  const deletedMsgCheckpointId = deletedMsg.checkpointId;

  const range = IDBKeyRange.bound([threadId, -Infinity], [threadId, Infinity]);
  const index = messagesStore.index("threadId_sequence");
  const allMessages = await index.getAll(range);

  const itemIdx = allMessages.findIndex((m) => m.id === messageId);
  if (itemIdx === -1) {
    throw new Error(`Message ${messageId} not in thread ${threadId}`);
  }

  let precedingCheckpointId: string | null = null;
  let precedingCheckpointNs: string | null = null;
  for (let i = itemIdx - 1; i >= 0; i--) {
    const m = allMessages[i];
    if (m.checkpointId && m.checkpointId !== deletedMsgCheckpointId) {
      precedingCheckpointId = m.checkpointId;
      precedingCheckpointNs = m.checkpointNs;
      break;
    }
  }

  const cpIndex = checkpointsStore.index("threadId");
  const threadCheckpoints = await cpIndex.getAll(IDBKeyRange.only(threadId));

  let targetCpCreatedAt = -1;
  if (precedingCheckpointId && precedingCheckpointNs) {
    const targetCp = threadCheckpoints.find(
      (cp) =>
        cp.checkpointId === precedingCheckpointId && cp.checkpointNs === precedingCheckpointNs,
    );
    if (targetCp) {
      targetCpCreatedAt = targetCp.createdAt;
    }
  }

  const adjMap = new Map<string, Checkpoint[]>();
  for (const cp of threadCheckpoints) {
    if (cp.parentCheckpointId) {
      const children = adjMap.get(cp.parentCheckpointId) || [];
      children.push(cp);
      adjMap.set(cp.parentCheckpointId, children);
    }
  }

  const checkpointsToDelete = new Set<string>();
  const visited = new Set<string>();

  function dfs(cpId: string) {
    if (visited.has(cpId)) return;
    visited.add(cpId);
    const children = adjMap.get(cpId) || [];
    for (const child of children) {
      checkpointsToDelete.add(`${child.checkpointNs}:${child.checkpointId}`);
      dfs(child.checkpointId);
    }
  }

  if (precedingCheckpointId) {
    dfs(precedingCheckpointId);
  }

  for (const cp of threadCheckpoints) {
    const key = `${cp.checkpointNs}:${cp.checkpointId}`;
    const isDescendant = checkpointsToDelete.has(key);
    const isAfter = cp.createdAt > targetCpCreatedAt;
    if (isDescendant || isAfter) {
      await checkpointsStore.delete([threadId, cp.checkpointNs, cp.checkpointId]);
      const writesIndex = writesStore.index("threadId");
      let writesCursor = await writesIndex.openCursor(IDBKeyRange.only(threadId));
      while (writesCursor) {
        const w = writesCursor.value;
        if (w.checkpointNs === cp.checkpointNs && w.checkpointId === cp.checkpointId) {
          await writesCursor.delete();
        }
        writesCursor = await writesCursor.continue();
      }
    }
  }

  for (const m of allMessages) {
    if (m.sequence >= idx) {
      await messagesStore.delete(m.id);
    }
  }

  const thread = await threadsStore.get(threadId);
  if (thread) {
    thread.latestCheckpointId = precedingCheckpointId;
    thread.latestCheckpointNs = precedingCheckpointNs;
    thread.status = "inactive";

    const remainingMessages = allMessages.filter((m) => m.sequence < idx);
    let promptTokens = 0;
    let completionTokens = 0;
    for (const m of remainingMessages) {
      if (m.metadata?.usage) {
        promptTokens += m.metadata.usage.promptTokens || m.metadata.usage.prompt_tokens || 0;
        completionTokens +=
          m.metadata.usage.completionTokens || m.metadata.usage.completion_tokens || 0;
      }
    }
    thread.tokenStats = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };

    await threadsStore.put(thread);
  }

  await tx.done;
}

export async function branchThread(
  parentThreadId: string,
  parentMessageId: string,
  newThreadTitle: string,
): Promise<string> {
  const db = await getDB();
  const tx = db.transaction(
    ["threads", "messages", "checkpoints", "checkpoint_writes"],
    "readwrite",
  );

  const threadsStore = tx.objectStore("threads");
  const messagesStore = tx.objectStore("messages");
  const checkpointsStore = tx.objectStore("checkpoints");
  const writesStore = tx.objectStore("checkpoint_writes");

  const parentThread = await threadsStore.get(parentThreadId);
  if (!parentThread) {
    throw new Error(`Parent thread ${parentThreadId} not found`);
  }

  const parentMessage = await messagesStore.get(parentMessageId);
  if (!parentMessage) {
    throw new Error(`Parent message ${parentMessageId} not found`);
  }

  const newThreadId = crypto.randomUUID();

  const range = IDBKeyRange.bound([parentThreadId, -Infinity], [parentThreadId, Infinity]);
  const index = messagesStore.index("threadId_sequence");
  const parentMessages = await index.getAll(range);

  const messagesToCopy = parentMessages.filter((m) => m.sequence <= parentMessage.sequence);

  for (const m of messagesToCopy) {
    const clonedMsg: Message = {
      ...m,
      id: crypto.randomUUID(),
      threadId: newThreadId,
    };
    await messagesStore.put(clonedMsg);
  }

  const checkpointPairs: { ns: string; id: string }[] = [];
  for (const m of messagesToCopy) {
    if (m.checkpointNs && m.checkpointId) {
      const exists = checkpointPairs.some(
        (p) => p.ns === m.checkpointNs && p.id === m.checkpointId,
      );
      if (!exists) {
        checkpointPairs.push({ ns: m.checkpointNs, id: m.checkpointId });
      }
    }
  }

  for (const pair of checkpointPairs) {
    const cp = await checkpointsStore.get([parentThreadId, pair.ns, pair.id]);
    if (cp) {
      const clonedCp: Checkpoint = {
        ...cp,
        threadId: newThreadId,
      };
      await checkpointsStore.put(clonedCp);
    }

    const writesIndex = writesStore.index("threadId");
    let writesCursor = await writesIndex.openCursor(IDBKeyRange.only(parentThreadId));
    while (writesCursor) {
      const w = writesCursor.value;
      if (w.checkpointNs === pair.ns && w.checkpointId === pair.id) {
        const clonedWrite: CheckpointWrites = {
          ...w,
          threadId: newThreadId,
        };
        await writesStore.put(clonedWrite);
      }
      writesCursor = await writesCursor.continue();
    }
  }

  let highestCpMsg: Message | null = null;
  for (const m of messagesToCopy) {
    if (m.checkpointId && m.checkpointNs) {
      if (!highestCpMsg || m.sequence > highestCpMsg.sequence) {
        highestCpMsg = m;
      }
    }
  }

  let promptTokens = 0;
  let completionTokens = 0;
  for (const m of messagesToCopy) {
    if (m.metadata?.usage) {
      promptTokens += m.metadata.usage.promptTokens || m.metadata.usage.prompt_tokens || 0;
      completionTokens +=
        m.metadata.usage.completionTokens || m.metadata.usage.completion_tokens || 0;
    }
  }

  const now = Date.now();
  const newThread: Thread = {
    id: newThreadId,
    title: newThreadTitle,
    workflowId: parentThread.workflowId,
    workflowSnapshot: parentThread.workflowSnapshot,
    activePresetId: parentThread.activePresetId,
    createdAt: now,
    updatedAt: now,
    parentThreadId: parentThreadId,
    parentMessageId: parentMessageId,
    status: "inactive",
    activeInterrupt: null,
    errorMessage: null,
    latestCheckpointId: highestCpMsg ? highestCpMsg.checkpointId : null,
    latestCheckpointNs: highestCpMsg ? highestCpMsg.checkpointNs : null,
    tokenStats: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
  };

  await threadsStore.put(newThread);
  await tx.done;

  return newThreadId;
}
