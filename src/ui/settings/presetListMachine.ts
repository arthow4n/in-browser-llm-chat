import { createMachine, assign, fromPromise } from "xstate";
import { getAllPresets, deletePreset, PresetStore } from "../../db/db";

interface PresetListContext {
  presets: PresetStore[];
  sortConfig: { key: keyof PresetStore; direction: "asc" | "desc" };
  pagination: { page: number; pageSize: number };
  presetToDeleteId: string | null;
  error: string | null;
}

export type PresetListEvent =
  | { type: "FETCH_PRESETS" }
  | { type: "DELETE_REQUESTED"; id: string }
  | { type: "SORT_CHANGED"; key: keyof PresetStore; direction: "asc" | "desc" }
  | { type: "PAGE_CHANGED"; page: number }
  | { type: "CANCEL_DELETE" }
  | { type: "CONFIRM_DELETE" };

export const presetListMachine = createMachine(
  {
    types: {} as { context: PresetListContext; events: PresetListEvent },
    id: "presetList",
    initial: "idle",
    context: (): PresetListContext => ({
      presets: [],
      sortConfig: { key: "name", direction: "asc" },
      pagination: { page: 1, pageSize: 10 },
      presetToDeleteId: null,
      error: null,
    }),
    states: {
      idle: {
        on: {
          FETCH_PRESETS: { target: "loading" },
          DELETE_REQUESTED: {
            target: "confirmingDeletion",
            actions: assign({
              presetToDeleteId: ({ event }) => {
                const e = event as PresetListEvent;
                if (e.type === "DELETE_REQUESTED") return e.id;
                return null;
              },
            }),
          },
          SORT_CHANGED: {
            actions: assign({
              sortConfig: ({ context, event }) => {
                const e = event as PresetListEvent;
                if (e.type === "SORT_CHANGED") {
                  return { key: e.key, direction: e.direction };
                }
                return context.sortConfig;
              },
              pagination: ({ context }) => ({
                ...context.pagination,
                page: 1,
              }),
            }),
          },
          PAGE_CHANGED: {
            actions: assign({
              pagination: ({ context, event }) => {
                const e = event as PresetListEvent;
                if (e.type === "PAGE_CHANGED") {
                  return { ...context.pagination, page: e.page };
                }
                return context.pagination;
              },
            }),
          },
        },
      },
      loading: {
        invoke: {
          src: fromPromise(async () => {
            return await getAllPresets();
          }),
          onDone: {
            target: "idle",
            actions: assign({
              presets: ({ event }) => (event as { output: PresetStore[] }).output,
              error: null,
            }),
          },
          onError: {
            target: "error",
            actions: assign({
              error: ({ event }) =>
                (event as { error?: { message?: string } }).error?.message ||
                "Failed to fetch presets",
            }),
          },
        },
      },
      deleting: {
        invoke: {
          src: fromPromise(async ({ input }) => {
            await deletePreset(input.id);
            return true;
          }),
          input: ({ context }) => ({ id: context.presetToDeleteId! }),
          onDone: {
            target: "loading", // Refetch presets after deletion
            actions: assign({ presetToDeleteId: null }),
          },
          onError: {
            target: "idle",
            actions: assign({
              error: ({ event }) =>
                (event as { error?: { message?: string } }).error?.message ||
                "Failed to delete preset",
              presetToDeleteId: null,
            }),
          },
        },
      },
      error: {
        on: {
          FETCH_PRESETS: { target: "loading" },
        },
      },
      confirmingDeletion: {
        on: {
          CANCEL_DELETE: {
            target: "idle",
            actions: assign({ presetToDeleteId: null }),
          },
          CONFIRM_DELETE: {
            target: "deleting",
            actions: assign({ error: null }),
          },
        },
      },
    },
  },
  {
    actions: {},
  },
);
