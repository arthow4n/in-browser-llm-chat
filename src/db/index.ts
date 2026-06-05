import { openDB, DBSchema, IDBPDatabase } from "idb";

export interface SettingsStore {
  key: string;
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
  nodes: any[];
  edges: any[];
  injectedSystemMessages?: Array<{ content: string; depth: number }>;
}

export interface ThreadStore {
  id: string;
  title: string;
  workflowId: string;
  workflowSnapshot: any;
  activePresetId: string;
  createdAt: number;
  updatedAt: number;
  parentThreadId: string | null;
  parentMessageId: string | null;
  status: "inactive" | "executing" | "awaiting_input" | "error" | "deleting";
  activeInterrupt: any | null;
  draftAnswers?: Record<string, any>;
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
  metadata?: any;
  checkpointId: string | null;
  checkpointNs: string | null;
}

export interface CheckpointStore {
  threadId: string;
  checkpointNs: string;
  checkpointId: string;
  checkpoint: any;
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
