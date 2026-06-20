import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Setting,
  Preset,
  Workflow,
  Thread,
  Message,
  Checkpoint,
  CheckpointWrites,
} from "./db-schema";

export interface InBrowserLlmChatDB extends DBSchema {
  settings: {
    key: string;
    value: Setting;
  };
  presets: {
    key: string;
    value: Preset;
  };
  workflows: {
    key: string;
    value: Workflow;
  };
  threads: {
    key: string;
    value: Thread;
  };
  messages: {
    key: string;
    value: Message;
    indexes: {
      threadId: string;
      threadId_sequence: [string, number];
    };
  };
  checkpoints: {
    key: [string, string, string]; // [threadId, checkpointNs, checkpointId]
    value: Checkpoint;
    indexes: {
      threadId: string;
    };
  };
  checkpoint_writes: {
    key: [string, string, string, string, number]; // [threadId, checkpointNs, checkpointId, taskId, idx]
    value: CheckpointWrites;
    indexes: {
      threadId: string;
    };
  };
}

export const DB_NAME = "in-browser-llm-chat-db";
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<InBrowserLlmChatDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<InBrowserLlmChatDB>> {
  if (!dbPromise) {
    dbPromise = openDB<InBrowserLlmChatDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // settings
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }

        // presets
        if (!db.objectStoreNames.contains("presets")) {
          db.createObjectStore("presets", { keyPath: "id" });
        }

        // workflows
        if (!db.objectStoreNames.contains("workflows")) {
          db.createObjectStore("workflows", { keyPath: "id" });
        }

        // threads
        if (!db.objectStoreNames.contains("threads")) {
          db.createObjectStore("threads", { keyPath: "id" });
        }

        // messages
        if (!db.objectStoreNames.contains("messages")) {
          const messageStore = db.createObjectStore("messages", { keyPath: "id" });
          messageStore.createIndex("threadId", "threadId", { unique: false });
          messageStore.createIndex("threadId_sequence", ["threadId", "sequence"], {
            unique: false,
          });
        }

        // checkpoints
        if (!db.objectStoreNames.contains("checkpoints")) {
          const checkpointStore = db.createObjectStore("checkpoints", {
            keyPath: ["threadId", "checkpointNs", "checkpointId"],
          });
          checkpointStore.createIndex("threadId", "threadId", { unique: false });
        }

        // checkpoint_writes
        if (!db.objectStoreNames.contains("checkpoint_writes")) {
          const writesStore = db.createObjectStore("checkpoint_writes", {
            keyPath: ["threadId", "checkpointNs", "checkpointId", "taskId", "idx"],
          });
          writesStore.createIndex("threadId", "threadId", { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Resets the cached DB connection. Useful in testing.
 */
export function resetDBConnection(): void {
  dbPromise = null;
}
