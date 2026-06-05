import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDB } from "./index";
import "fake-indexeddb/auto";

describe("Database Schema & Initialization", () => {
  beforeEach(async () => {
    // Reset DB for clean tests
    const db = await getDB();
    await db.close();
    // we should delete the DB, but IDB object does not have delete method directly without indexedDB.deleteDatabase
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("in-browser-llm-chat-db");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    // Force re-init
    vi.resetModules();
  });

  it("should initialize all object stores correctly", async () => {
    // Re-import to reset the memoized dbPromise
    const { getDB } = await import("./index");
    const db = await getDB();

    expect(db.objectStoreNames.contains("settings")).toBe(true);
    expect(db.objectStoreNames.contains("presets")).toBe(true);
    expect(db.objectStoreNames.contains("workflows")).toBe(true);
    expect(db.objectStoreNames.contains("threads")).toBe(true);
    expect(db.objectStoreNames.contains('messages')).toBe(true);
    const tx = db.transaction(['messages', 'checkpoints', 'checkpoint_writes'], 'readonly');
    const messagesStore = tx.objectStore('messages');
    expect(messagesStore.indexNames.contains('by-thread-sequence')).toBe(true);

    expect(db.objectStoreNames.contains('checkpoints')).toBe(true);
    const checkpointsStore = tx.objectStore('checkpoints');
    expect(checkpointsStore.indexNames.contains('by-thread')).toBe(true);

    expect(db.objectStoreNames.contains('checkpoint_writes')).toBe(true);
    const checkpointWritesStore = tx.objectStore('checkpoint_writes');
    expect(checkpointWritesStore.indexNames.contains('by-thread')).toBe(true);

    await db.close();
  });
});
