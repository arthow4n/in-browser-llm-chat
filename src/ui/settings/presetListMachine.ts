import { createMachine, assign, fromPromise } from "xstate";
import { getAllPresets, deletePreset, PresetStore } from "../../db/db";

interface PresetListContext {
  presets: PresetStore[];
  sortConfig: { key: keyof PresetStore; direction: "asc" | "desc" };
  pagination: { page: number; pageSize: number };
  presetToDeleteId: string | null;
  error: string | null;
}

export const presetListMachine = createMachine(
  {
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
              presetToDeleteId: ({ event }) => (event as any).id,
            }),
          },
          SORT_CHANGED: {
            actions: assign({
              sortConfig: ({ event }) => ({
                key: (event as any).key,
                direction: (event as any).direction,
              }),
              pagination: ({ context }) => ({
                ...context.pagination,
                page: 1,
              }),
            }),
            target: "loading",
          },
          PAGE_CHANGED: {
            actions: assign({
              pagination: ({ context, event }) => ({
                ...context.pagination,
                page: (event as any).page,
              }),
            }),
            target: "loading",
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
              presets: ({ event }) => (event as any).output,
              error: null,
            }),
          },
          onError: {
            target: "error",
            actions: assign({
              error: ({ event }) => (event.error as any)?.message || "Failed to fetch presets",
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
              error: ({ event }) => (event.error as any)?.message || "Failed to delete preset",
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
