import { createMachine, assign } from "xstate";
import { getThread, saveThread } from "../../db/db";
import type { PresetStore } from "../../db/db";

type ThreadSettingsEvent =
  | {
      type: "OPEN";
      threadId: string;
      threadTitle: string;
      selectedPresetId: string;
      presets: PresetStore[];
    }
  | { type: "EDIT_TITLE" }
  | { type: "CANCEL_EDIT_TITLE" }
  | { type: "UPDATE_TITLE"; title: string }
  | { type: "CHANGE_PRESET"; presetId: string }
  | { type: "SAVE" }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_FAILURE"; error: string }
  | { type: "DISMISS_ERROR" }
  | { type: "TRIGGER_SYNC" }
  | { type: "TRIGGER_COMPACTION" }
  | { type: "TRIGGER_DELETE" }
  | { type: "CLOSE" };

export const threadSettingsMachine = createMachine(
  {
    types: {
      events: {} as ThreadSettingsEvent,
    },
    id: "threadSettings",
    initial: "closed",
    context: {
      threadId: "",
      threadTitle: "",
      selectedPresetId: "",
      isEditingTitle: false,
      presets: [] as PresetStore[],
      errorMessage: null as string | null,
    },
    states: {
      closed: {
        on: {
          OPEN: {
            target: "opened",
            actions: assign(({ event }) => {
              if (event.type !== "OPEN") return {};
              return {
                threadId: event.threadId,
                threadTitle: event.threadTitle,
                selectedPresetId: event.selectedPresetId,
                presets: event.presets,
                errorMessage: null,
                isEditingTitle: false,
              };
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
                actions: assign(({ event }) => {
                  if (event.type !== "UPDATE_TITLE") return {};
                  return {
                    threadTitle: event.title,
                  };
                }),
              },
              CHANGE_PRESET: {
                actions: assign(({ event }) => {
                  if (event.type !== "CHANGE_PRESET") return {};
                  return {
                    selectedPresetId: event.presetId,
                  };
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
                actions: assign(({ event }) => {
                  if (event.type !== "SAVE_FAILURE") return {};
                  return {
                    errorMessage: event.error,
                  };
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
