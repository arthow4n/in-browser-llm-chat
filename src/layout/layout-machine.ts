import { createMachine, assign, fromPromise } from "xstate";
import {
  listThreads,
  saveThread,
  deleteThread,
  deleteThreadMessages,
  deleteThreadCheckpoints,
  deleteThreadCheckpointWrites,
  getSetting,
  listPresets,
} from "../db/db-operations";
import type { Thread } from "../db/db-schema";

export interface LayoutContext {
  threads: Thread[];
  isMobileOpen: boolean;
  isSettingsOpen: boolean;
  error: string | null;
  deletingThreadId: string | null;
  newCreatedThreadId: string | null;
}

export type LayoutEvent =
  | { type: "LOAD_THREADS" }
  | { type: "TOGGLE_MOBILE_SIDEBAR" }
  | { type: "CLOSE_MOBILE_SIDEBAR" }
  | { type: "REFRESH_THREADS" }
  | { type: "CREATE_THREAD" }
  | { type: "DELETE_THREAD"; id: string }
  | { type: "CLEAR_NEW_THREAD_ID" }
  | { type: "OPEN_THREAD_SETTINGS" }
  | { type: "CLOSE_THREAD_SETTINGS" };

export const layoutMachine = createMachine(
  {
    types: {} as {
      context: LayoutContext;
      events: LayoutEvent;
    },
    id: "layout",
    initial: "loading",
    context: {
      threads: [],
      isMobileOpen: false,
      isSettingsOpen: false,
      error: null,
      deletingThreadId: null,
      newCreatedThreadId: null,
    },
    states: {
      loading: {
        invoke: {
          src: "loadThreadsActor",
          onDone: {
            target: "idle",
            actions: assign({
              threads: ({ event }) => event.output,
              error: () => null,
            }),
          },
          onError: {
            target: "idle",
            actions: assign({
              error: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to load threads",
            }),
          },
        },
      },
      idle: {
        on: {
          LOAD_THREADS: {
            target: "loading",
          },
          REFRESH_THREADS: {
            target: "loading",
          },
          TOGGLE_MOBILE_SIDEBAR: {
            actions: assign({
              isMobileOpen: ({ context }) => !context.isMobileOpen,
            }),
          },
          CLOSE_MOBILE_SIDEBAR: {
            actions: assign({
              isMobileOpen: () => false,
            }),
          },
          OPEN_THREAD_SETTINGS: {
            actions: assign({
              isSettingsOpen: () => true,
            }),
          },
          CLOSE_THREAD_SETTINGS: {
            actions: assign({
              isSettingsOpen: () => false,
            }),
          },
          CREATE_THREAD: {
            target: "creatingThread",
          },
          DELETE_THREAD: {
            target: "deletingThread",
            actions: assign({
              deletingThreadId: ({ event }) => event.id,
            }),
          },
        },
      },
      creatingThread: {
        on: {
          // Ignore routing refresh event during creation to avoid interrupting state
          REFRESH_THREADS: {},
        },
        invoke: {
          src: "createThreadActor",
          onDone: {
            target: "loading",
            actions: assign({
              newCreatedThreadId: ({ event }) => event.output.id,
              error: () => null,
            }),
          },
          onError: {
            target: "idle",
            actions: assign({
              error: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to create thread",
            }),
          },
        },
      },
      deletingThread: {
        on: {
          REFRESH_THREADS: {},
        },
        invoke: {
          src: "deleteThreadActor",
          input: ({ context }) => ({ id: context.deletingThreadId! }),
          onDone: {
            target: "loading",
            actions: assign({
              deletingThreadId: () => null,
              error: () => null,
            }),
          },
          onError: {
            target: "idle",
            actions: assign({
              deletingThreadId: () => null,
              error: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to delete thread",
            }),
          },
        },
      },
    },
    on: {
      CLEAR_NEW_THREAD_ID: {
        actions: assign({
          newCreatedThreadId: () => null,
        }),
      },
    },
  },
  {
    actors: {
      loadThreadsActor: fromPromise(async () => {
        const list = await listThreads();
        // Sort threads by updatedAt descending to show latest first
        return list.sort((a, b) => b.updatedAt - a.updatedAt);
      }),
      createThreadActor: fromPromise(async () => {
        // We need to resolve starting workflow and activePresetId
        const defaultPresetId = await getSetting("default_preset_id");
        let activePresetId = defaultPresetId || "";

        if (!activePresetId) {
          const presets = await listPresets();
          if (presets.length > 0) {
            activePresetId = presets[0].id;
          } else {
            // fallback
            activePresetId =
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : "mock-preset-id";
          }
        }

        const id =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : "mock-thread-uuid";
        const now = Date.now();
        const newThread: Thread = {
          id,
          title: "New Chat",
          workflowId: "standard-1-agent", // default built-in
          workflowSnapshot: {
            id: "standard-1-agent",
            name: "Standard 1-Agent",
            description: "A standard single-agent chat conversation.",
            isBuiltIn: true,
            nodes: [
              { id: "agent", type: "llm", config: { prompt: "You are a helpful assistant." } },
            ],
            edges: [],
          },
          activePresetId,
          createdAt: now,
          updatedAt: now,
          parentThreadId: null,
          parentMessageId: null,
          status: "inactive",
          activeInterrupt: null,
          errorMessage: null,
          latestCheckpointId: null,
          latestCheckpointNs: null,
          tokenStats: null,
        };

        await saveThread(newThread);
        return newThread;
      }),
      deleteThreadActor: fromPromise(async ({ input }: { input: { id: string } }) => {
        // Cascading deletion
        await deleteThreadCheckpointWrites(input.id);
        await deleteThreadCheckpoints(input.id);
        await deleteThreadMessages(input.id);
        await deleteThread(input.id);
      }),
    },
  },
);
