import { createMachine, assign, fromPromise } from "xstate";
import {
  getStorageUsage,
  listThreads,
  exportDatabase,
  importDatabase,
  factoryResetDatabase,
  deleteThreadCascadingBatched,
} from "../db/db-operations";

export interface StorageContext {
  storageUsage: number | null;
  threadsList: Array<{ id: string; title: string; tokenStats: unknown }>;
  selectedThreads: Array<string>;
  exportBlobUrl: string | null;
  errorMessage: string | null;
  resetConfirmationText: string;
}

export type StorageEvent =
  | { type: "LOAD" }
  | { type: "TOGGLE_THREAD_SELECTION"; threadId: string }
  | { type: "BULK_DELETE_THREADS" }
  | { type: "EXPORT_DATA" }
  | { type: "IMPORT_DATA"; file: File }
  | { type: "TRIGGER_FACTORY_RESET" }
  | { type: "CANCEL_FACTORY_RESET" }
  | { type: "CONFIRM_FACTORY_RESET" }
  | { type: "UPDATE_RESET_CONFIRMATION_TEXT"; text: string }
  | { type: "DISMISS_ERROR" };

export const storageManagementMachine = createMachine(
  {
    types: {} as {
      context: StorageContext;
      events: StorageEvent;
    },
    id: "storageManagement",
    initial: "loading",
    context: {
      storageUsage: null,
      threadsList: [],
      selectedThreads: [],
      exportBlobUrl: null,
      errorMessage: null,
      resetConfirmationText: "",
    },
    states: {
      loading: {
        invoke: {
          src: "loadDataActor",
          onDone: {
            target: "idle",
            actions: assign(({ event }) => ({
              storageUsage: event.output.usage,
              threadsList: event.output.threads,
              errorMessage: null,
            })),
          },
          onError: {
            target: "error",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error
                  ? event.error.message
                  : "Failed to load storage metrics",
            }),
          },
        },
      },
      idle: {
        on: {
          LOAD: "loading",
          TOGGLE_THREAD_SELECTION: {
            actions: assign(({ context, event }) => {
              const selected = [...context.selectedThreads];
              const index = selected.indexOf(event.threadId);
              if (index > -1) {
                selected.splice(index, 1);
              } else {
                selected.push(event.threadId);
              }
              return { selectedThreads: selected };
            }),
          },
          BULK_DELETE_THREADS: {
            target: "deletingThreads",
          },
          EXPORT_DATA: {
            target: "exporting",
          },
          IMPORT_DATA: {
            target: "importing",
          },
          TRIGGER_FACTORY_RESET: {
            target: "confirmingFactoryReset",
          },
        },
      },
      deletingThreads: {
        invoke: {
          src: "bulkDeleteActor",
          input: ({ context }) => ({ threadIds: context.selectedThreads }),
          onDone: {
            target: "loading",
            actions: assign({
              selectedThreads: () => [],
            }),
          },
          onError: {
            target: "error",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to delete threads",
            }),
          },
        },
      },
      exporting: {
        invoke: {
          src: "exportDataActor",
          onDone: {
            target: "idle",
            actions: [
              assign(({ event }) => ({
                exportBlobUrl: event.output,
              })),
              "triggerDownload",
            ],
          },
          onError: {
            target: "error",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to export data",
            }),
          },
        },
      },
      importing: {
        invoke: {
          src: "importDataActor",
          input: ({ event }) => {
            if (event.type !== "IMPORT_DATA") throw new Error("Invalid event type");
            return { file: event.file };
          },
          onDone: {
            target: "importComplete",
            actions: "triggerReload",
          },
          onError: {
            target: "error",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to import database",
            }),
          },
        },
      },
      importComplete: {
        type: "final",
      },
      confirmingFactoryReset: {
        on: {
          UPDATE_RESET_CONFIRMATION_TEXT: {
            actions: assign({ resetConfirmationText: ({ event }) => event.text }),
          },
          CANCEL_FACTORY_RESET: {
            target: "idle",
            actions: assign({ resetConfirmationText: () => "" }),
          },
          CONFIRM_FACTORY_RESET: {
            target: "factoryResetting",
            actions: assign({ resetConfirmationText: () => "" }),
          },
        },
      },
      factoryResetting: {
        invoke: {
          src: "factoryResetActor",
          onDone: {
            actions: "triggerReload",
          },
          onError: {
            target: "error",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error
                  ? event.error.message
                  : "Failed to perform factory reset",
            }),
          },
        },
      },
      error: {
        on: {
          DISMISS_ERROR: {
            target: "idle",
            actions: assign({ errorMessage: () => null }),
          },
          LOAD: "loading",
        },
      },
    },
  },
  {
    actions: {
      triggerDownload: ({ context }) => {
        if (context.exportBlobUrl && typeof window !== "undefined") {
          const a = document.createElement("a");
          a.href = context.exportBlobUrl;
          a.download = `llm_chat_backup_${Date.now()}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      },
      triggerReload: () => {
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      },
    },
    actors: {
      loadDataActor: fromPromise(async () => {
        const usage = await getStorageUsage();
        const list = await listThreads();
        const threads = list
          .filter((t) => t.status !== "deleting")
          .map((t) => ({
            id: t.id,
            title: t.title,
            tokenStats: t.tokenStats,
          }));
        return { usage, threads };
      }),
      exportDataActor: fromPromise(async () => {
        return await exportDatabase();
      }),
      importDataActor: fromPromise(async ({ input }: { input: { file: File } }) => {
        return new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const text = e.target?.result as string;
              await importDatabase(text);
              resolve();
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsText(input.file);
        });
      }),
      bulkDeleteActor: fromPromise(async ({ input }: { input: { threadIds: string[] } }) => {
        for (const id of input.threadIds) {
          await deleteThreadCascadingBatched(id);
        }
      }),
      factoryResetActor: fromPromise(async () => {
        await factoryResetDatabase();
      }),
    },
  },
);
