import { createMachine, assign, fromPromise } from "xstate";
import { listThreads } from "../db/db-operations";
import type { Thread } from "../db/db-schema";

export interface LayoutContext {
  threads: Thread[];
  isMobileOpen: boolean;
  error: string | null;
}

export type LayoutEvent =
  | { type: "LOAD_THREADS" }
  | { type: "TOGGLE_MOBILE_SIDEBAR" }
  | { type: "CLOSE_MOBILE_SIDEBAR" }
  | { type: "REFRESH_THREADS" };

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
      error: null,
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
        },
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
    },
  },
);
