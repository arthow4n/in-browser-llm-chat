import {
  indexedDB,
  IDBKeyRange,
  IDBIndex,
  IDBObjectStore,
  IDBDatabase,
  IDBTransaction,
  IDBCursor,
  IDBRequest,
  IDBFactory,
} from "fake-indexeddb";

// Mock IndexedDB globals for testing in Node/Vitest environment
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.IDBIndex = IDBIndex;
globalThis.IDBObjectStore = IDBObjectStore;
globalThis.IDBDatabase = IDBDatabase;
globalThis.IDBTransaction = IDBTransaction;
globalThis.IDBCursor = IDBCursor;
globalThis.IDBRequest = IDBRequest;
globalThis.IDBFactory = IDBFactory;
