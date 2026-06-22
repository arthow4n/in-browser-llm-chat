import { createMachine, assign, fromPromise } from "xstate";
import { getThread, saveThread } from "../db/db-operations";
import type { Preset } from "../db/db-schema";

export interface ThreadSettingsContext {
  threadId: string;
  threadTitle: string;
  selectedPresetId: string;
  isEditingTitle: boolean;
  presets: Preset[];
  errorMessage: string | null;
  threadStatus: string;
}

export type ThreadSettingsEvent =
  | {
      type: "OPEN";
      threadId: string;
      threadTitle: string;
      selectedPresetId: string;
      presets: Preset[];
      threadStatus: string;
    }
  | { type: "CLOSE" }
  | { type: "EDIT_TITLE" }
  | { type: "CANCEL_EDIT_TITLE" }
  | { type: "UPDATE_TITLE"; title: string }
  | { type: "CHANGE_PRESET"; presetId: string }
  | { type: "SAVE" }
  | { type: "DISMISS_ERROR" };

export const threadSettingsMachine = createMachine(
  {
    types: {} as {
      context: ThreadSettingsContext;
      events: ThreadSettingsEvent;
    },
    id: "threadSettings",
    initial: "closed",
    context: {
      threadId: "",
      threadTitle: "",
      selectedPresetId: "",
      isEditingTitle: false,
      presets: [],
      errorMessage: null,
      threadStatus: "inactive",
    },
    states: {
      closed: {
        on: {
          OPEN: {
            target: "opened.idle",
            actions: assign({
              threadId: ({ event }) => event.threadId,
              threadTitle: ({ event }) => event.threadTitle,
              selectedPresetId: ({ event }) => event.selectedPresetId,
              presets: ({ event }) => event.presets,
              threadStatus: ({ event }) => event.threadStatus,
              isEditingTitle: () => false,
              errorMessage: () => null,
            }),
          },
        },
      },
      opened: {
        initial: "idle",
        states: {
          idle: {
            on: {
              EDIT_TITLE: {
                actions: assign({ isEditingTitle: () => true }),
              },
              CANCEL_EDIT_TITLE: {
                actions: assign({ isEditingTitle: () => false }),
              },
              UPDATE_TITLE: {
                actions: assign({ threadTitle: ({ event }) => event.title }),
              },
              CHANGE_PRESET: {
                actions: assign({ selectedPresetId: ({ event }) => event.presetId }),
              },
              SAVE: "saving",
              CLOSE: {
                target: "#threadSettings.closed",
              },
            },
          },
          saving: {
            invoke: {
              src: "saveThreadSettingsActor",
              input: ({ context }) => ({
                threadId: context.threadId,
                title: context.threadTitle,
                presetId: context.selectedPresetId,
              }),
              onDone: {
                target: "idle",
                actions: assign({
                  isEditingTitle: () => false,
                  errorMessage: () => null,
                }),
              },
              onError: {
                target: "error",
                actions: assign({
                  errorMessage: ({ event }) =>
                    event.error instanceof Error ? event.error.message : "Failed to save settings",
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
              CLOSE: {
                target: "#threadSettings.closed",
              },
              SAVE: "saving",
              EDIT_TITLE: {
                actions: assign({ isEditingTitle: () => true }),
              },
              CANCEL_EDIT_TITLE: {
                actions: assign({ isEditingTitle: () => false }),
              },
              UPDATE_TITLE: {
                actions: assign({ threadTitle: ({ event }) => event.title }),
              },
              CHANGE_PRESET: {
                actions: assign({ selectedPresetId: ({ event }) => event.presetId }),
              },
            },
          },
        },
        on: {
          CLOSE: {
            target: "closed",
          },
        },
      },
    },
  },
  {
    actors: {
      saveThreadSettingsActor: fromPromise(
        async ({ input }: { input: { threadId: string; title: string; presetId: string } }) => {
          const thread = await getThread(input.threadId);
          if (!thread) {
            throw new Error(`Thread with ID ${input.threadId} not found`);
          }
          thread.title = input.title;
          thread.activePresetId = input.presetId;
          thread.updatedAt = Date.now();
          await saveThread(thread);
        },
      ),
    },
  },
);
