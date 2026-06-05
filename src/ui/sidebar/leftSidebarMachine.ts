import { createMachine, assign, fromPromise } from "xstate";
import { getPaginatedThreads, deleteThread, type ThreadStore } from "../../db/db.js";

export interface LeftSidebarContext {
  threads: ThreadStore[];
  searchQuery: string;
  activeThreadId: string | null;
  deletingThreadId: string | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
  errorMessage: string | null;
}

export type LeftSidebarEvent =
  | { type: "LOAD_INITIAL_THREADS" }
  | { type: "LOAD_INITIAL_SUCCESS"; threads: ThreadStore[]; hasMore: boolean }
  | { type: "LOAD_INITIAL_FAILURE"; error: string }
  | { type: "LOAD_MORE" }
  | { type: "LOAD_MORE_SUCCESS"; threads: ThreadStore[]; hasMore: boolean }
  | { type: "LOAD_MORE_FAILURE"; error: string }
  | { type: "FILTER_THREADS"; query: string }
  | { type: "TRIGGER_DELETE"; threadId: string }
  | { type: "CONFIRM_DELETE" }
  | { type: "CANCEL_DELETE" }
  | { type: "DELETE_SUCCESS" }
  | { type: "DELETE_FAILURE"; error: string }
  | { type: "SET_ACTIVE_THREAD"; threadId: string | null }
  | { type: "DISMISS_ERROR" };

export const leftSidebarMachine = createMachine({
  types: {} as { context: LeftSidebarContext; events: LeftSidebarEvent },
  id: "leftSidebar",
  initial: "loadingInitial",
  context: (): LeftSidebarContext => ({
    threads: [],
    searchQuery: "",
    activeThreadId: null,
    deletingThreadId: null,
    page: 1,
    pageSize: 50,
    hasMore: false,
    errorMessage: null,
  }),
  states: {
    loadingInitial: {
      invoke: {
        src: fromPromise(
          async ({
            input,
          }: {
            input: {
              searchQuery: string;
              pageSize: number;
            };
          }) => {
            const { searchQuery, pageSize } = input;
            const result = await getPaginatedThreads(searchQuery, 1, pageSize);
            return result;
          },
        ),
        input: ({ context }) => ({
          searchQuery: context.searchQuery,
          pageSize: context.pageSize,
        }),
        onDone: {
          target: "idle",
          actions: assign({
            threads: ({ event }) => event.output.threads,
            hasMore: ({ event }) => event.output.hasMore,
            page: () => 1,
            errorMessage: () => null,
          }),
        },
        onError: {
          target: "idle",
          actions: assign(({ event }) => {
            const err = event.error;
            const msg =
              err && typeof err === "object" && "message" in err && typeof err.message === "string"
                ? err.message
                : "Failed to load threads";
            return { errorMessage: msg };
          }),
        },
      },
    },
    idle: {
      on: {
        LOAD_INITIAL_THREADS: { target: "loadingInitial" },
        LOAD_MORE: {
          guard: ({ context }) => context.hasMore,
          target: "loadingMore",
        },
        FILTER_THREADS: {
          target: "loadingInitial",
          actions: assign(({ event }) => {
            if (event.type === "FILTER_THREADS") {
              return { searchQuery: event.query, page: 1 };
            }
            return {};
          }),
        },
        TRIGGER_DELETE: {
          target: "confirmingDelete",
          actions: assign(({ event }) => {
            if (event.type === "TRIGGER_DELETE") {
              return { deletingThreadId: event.threadId };
            }
            return {};
          }),
        },
        SET_ACTIVE_THREAD: {
          actions: assign(({ event }) => {
            if (event.type === "SET_ACTIVE_THREAD") {
              return { activeThreadId: event.threadId };
            }
            return {};
          }),
        },
        DISMISS_ERROR: {
          actions: assign({ errorMessage: () => null }),
        },
      },
    },
    loadingMore: {
      invoke: {
        src: fromPromise(
          async ({
            input,
          }: {
            input: {
              searchQuery: string;
              page: number;
              pageSize: number;
            };
          }) => {
            const { searchQuery, page, pageSize } = input;
            const result = await getPaginatedThreads(searchQuery, page + 1, pageSize);
            return result;
          },
        ),
        input: ({ context }) => ({
          searchQuery: context.searchQuery,
          page: context.page,
          pageSize: context.pageSize,
        }),
        onDone: {
          target: "idle",
          actions: assign({
            threads: ({ context, event }) => [...context.threads, ...event.output.threads],
            hasMore: ({ event }) => event.output.hasMore,
            page: ({ context }) => context.page + 1,
            errorMessage: () => null,
          }),
        },
        onError: {
          target: "idle",
          actions: assign(({ event }) => {
            const err = event.error;
            const msg =
              err && typeof err === "object" && "message" in err && typeof err.message === "string"
                ? err.message
                : "Failed to load more threads";
            return { errorMessage: msg };
          }),
        },
      },
    },
    confirmingDelete: {
      on: {
        CONFIRM_DELETE: {
          target: "deleting",
          actions: assign(({ context }) => {
            // Optimistic UI updates by setting the thread status to "deleting"
            const updatedThreads = context.threads.map((t) => {
              if (t.id === context.deletingThreadId) {
                return { ...t, status: "deleting" as const };
              }
              return t;
            });
            return { threads: updatedThreads };
          }),
        },
        CANCEL_DELETE: {
          target: "idle",
          actions: assign({ deletingThreadId: () => null }),
        },
      },
    },
    deleting: {
      invoke: {
        src: fromPromise(
          async ({
            input,
          }: {
            input: {
              id: string;
            };
          }) => {
            await deleteThread(input.id);
          },
        ),
        input: ({ context }) => ({
          id: context.deletingThreadId!,
        }),
        onDone: {
          target: "loadingInitial",
          actions: assign({
            deletingThreadId: () => null,
          }),
        },
        onError: {
          target: "idle",
          actions: assign(({ event }) => {
            const err = event.error;
            const msg =
              err && typeof err === "object" && "message" in err && typeof err.message === "string"
                ? err.message
                : "Failed to delete thread";
            return { errorMessage: msg, deletingThreadId: null };
          }),
        },
      },
    },
  },
});
