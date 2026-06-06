import { createMachine, assign } from "xstate";
import { getThread, saveThread } from "../../db/db";
import type { PresetStore } from "../../db/db";

export const threadSettingsMachine = createMachine(
  {
    id: "threadSettings",
    initial: "closed",
    context: {
      threadId: "",
      threadTitle: "",
      selectedPresetId: "",
      isEditingTitle: false,
      presets: [] as PresetStore[],
      errorMessage: null,
    },
    states: {
      closed: {
        on: {
          OPEN: {
            target: "opened",
            actions: assign({
              threadId: ({ event }) => (event as any).threadId,
              threadTitle: ({ event }) => (event as any).threadTitle,
              selectedPresetId: ({ event }) => (event as any).selectedPresetId,
              presets: ({ event }) => (event as any).presets,
              errorMessage: null,
              isEditingTitle: false,
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
                actions: assign({ isEditingTitle: true }),
              },
              CANCEL_EDIT_TITLE: {
                actions: assign({ isEditingTitle: false }),
              },
              UPDATE_TITLE: {
                actions: assign({
                  threadTitle: ({ event }) => (event as any).title,
                }),
              },
              CHANGE_PRESET: {
                actions: assign({
                  selectedPresetId: ({ event }) => (event as any).presetId,
                }),
              },
              SAVE: {
                target: "saving",
              },
              TRIGGER_SYNC: {
                actions: "notifySync",
              },
              TRIGGER_COMPACTION: {
                actions: "notifyCompaction",
              },
              TRIGGER_DELETE: {
                actions: "notifyDelete",
                target: "#threadSettings.closed",
              },
            },
          },
          saving: {
            on: {
              SAVE_SUCCESS: {
                target: "idle",
                actions: assign({
                  isEditingTitle: false,
                }),
              },
              SAVE_FAILURE: {
                target: "error",
                actions: assign({
                  errorMessage: ({ event }) => (event as any).error,
                }),
              },
            },
          },
          error: {
            on: {
              DISMISS_ERROR: {
                target: "idle",
                actions: assign({
                  errorMessage: null,
                }),
              },
              SAVE: {
                target: "saving",
              },
            },
          },
        },
        on: {
          CLOSE: {
            target: "#threadSettings.closed",
          },
        },
      },
    },
  },
  {
    actions: {
      notifySync: () => {},
      notifyCompaction: () => {},
      notifyDelete: () => {},
    },
  },
);

export async function saveThreadSettings(threadId: string, title: string, presetId: string) {
  const thread = await getThread(threadId);
  if (!thread) throw new Error("Thread not found");

  thread.title = title;
  thread.activePresetId = presetId;
  thread.updatedAt = Date.now();

  await saveThread(thread);
}
