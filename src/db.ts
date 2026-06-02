import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "in-browser-llm-chat-db";
const DB_VERSION = 1;
const STORE_NAME = "app-state";

export interface AppStateRecord {
  id: string;
  data: any;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function getAppState(id: string): Promise<any | null> {
  const db = await getDB();
  const record = await db.get(STORE_NAME, id);
  return record ? record.data : null;
}

export async function saveAppState(id: string, data: any): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, {
    id,
    data,
    updatedAt: Date.now(),
  });
}
