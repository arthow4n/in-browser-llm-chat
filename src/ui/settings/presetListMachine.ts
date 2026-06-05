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
            actions: assign(({ event }) => {
              if (event.type === "DELETE_REQUESTED") return { presetToDeleteId: event.id };
              return {};
            }),
          },
          SORT_CHANGED: {
            actions: assign(({ context, event }) => {
              if (event.type === "SORT_CHANGED") {
                return {
                  sortConfig: { key: event.key, direction: event.direction },
                  pagination: { ...context.pagination, page: 1 },
                };
              }
              return {};
            }),
          },
          PAGE_CHANGED: {
            actions: assign(({ context, event }) => {
              if (event.type === "PAGE_CHANGED") {
                return {
                  pagination: { ...context.pagination, page: event.page },
                };
              }
              return {};
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
            actions: assign(({ event }) => {
              if (Array.isArray(event.output)) {
                return { presets: event.output, error: null };
              }
              return { error: null };
            }),
          },
          onError: {
            target: "error",
            actions: assign(({ event }) => {
              const err = event.error;
              const message =
                err &&
                typeof err === "object" &&
                "message" in err &&
                typeof err.message === "string"
                  ? err.message
                  : "Failed to fetch presets";
              return { error: message };
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
            actions: assign(({ event }) => {
              const err = event.error;
              const message =
                err &&
                typeof err === "object" &&
                "message" in err &&
                typeof err.message === "string"
                  ? err.message
                  : "Failed to delete preset";
              return {
                error: message,
                presetToDeleteId: null,
              };
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
