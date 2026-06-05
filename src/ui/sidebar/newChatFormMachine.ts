import { createMachine, assign, fromPromise } from "xstate";
import {
  getAllWorkflows,
  getAllPresets,
  getWorkflow,
  getSetting,
  createNewThread,
  type WorkflowStore,
  type PresetStore,
} from "../../db/db.js";

export interface NewChatFormContext {
  selectedWorkflowId: string;
  selectedPresetId: string;
  initialMessage: string;
  workflows: WorkflowStore[];
  presets: PresetStore[];
  /** Set to the newly created thread ID immediately after successful submission */
  lastCreatedThreadId: string | null;
  errorMessage: string | null;
}

export type NewChatFormEvent =
  | { type: "LOAD" }
  | { type: "CHANGE_WORKFLOW"; workflowId: string }
  | { type: "CHANGE_PRESET"; presetId: string }
  | { type: "UPDATE_MESSAGE"; message: string }
  | { type: "SUBMIT" }
  | { type: "DISMISS_ERROR" };

/**
 * Loads all workflows and presets and returns them with sensible defaults.
 * The default workflow is the first built-in one (Standard 1-agent), falling
 * back to the first available. The default preset is read from the settings
 * store, falling back to the first available.
 */
async function loadFormData(): Promise<{
  workflows: WorkflowStore[];
  presets: PresetStore[];
  defaultWorkflowId: string;
  defaultPresetId: string;
}> {
  const [workflows, presets, defaultPresetId] = await Promise.all([
    getAllWorkflows(),
    getAllPresets(),
    getSetting<string>("default_preset_id"),
  ]);

  const defaultWorkflow = workflows.find((w) => w.isBuiltIn) ?? workflows[0];
  const defaultPreset =
    (defaultPresetId ? presets.find((p) => p.id === defaultPresetId) : undefined) ?? presets[0];

  return {
    workflows,
    presets,
    defaultWorkflowId: defaultWorkflow?.id ?? "",
    defaultPresetId: defaultPreset?.id ?? "",
  };
}

async function submitThread(input: {
  selectedWorkflowId: string;
  selectedPresetId: string;
  initialMessage: string;
}): Promise<{ newThreadId: string }> {
  const { selectedWorkflowId, selectedPresetId, initialMessage } = input;

  if (!selectedWorkflowId) {
    throw new Error("No workflow selected");
  }
  if (!selectedPresetId) {
    throw new Error("No preset selected");
  }

  const workflow = await getWorkflow(selectedWorkflowId);
  if (!workflow) {
    throw new Error("Selected workflow not found");
  }

  const result = await createNewThread({
    workflowId: selectedWorkflowId,
    workflowSnapshot: workflow,
    activePresetId: selectedPresetId,
    initialMessage: initialMessage.trim() || undefined,
  });

  return { newThreadId: result.threadId };
}

export const newChatFormMachine = createMachine(
  {
    types: {} as { context: NewChatFormContext; events: NewChatFormEvent },
    id: "newChatForm",
    initial: "loading",
    context: (): NewChatFormContext => ({
      selectedWorkflowId: "",
      selectedPresetId: "",
      initialMessage: "",
      workflows: [],
      presets: [],
      lastCreatedThreadId: null,
      errorMessage: null,
    }),
    states: {
      loading: {
        invoke: {
          src: "loadFormData",
          onDone: {
            target: "idle",
            actions: assign(({ event }) => ({
              workflows: event.output.workflows,
              presets: event.output.presets,
              selectedWorkflowId: event.output.defaultWorkflowId,
              selectedPresetId: event.output.defaultPresetId,
              errorMessage: null,
            })),
          },
          onError: {
            target: "error",
            actions: assign(({ event }) => {
              const err = event.error;
              const msg =
                err &&
                typeof err === "object" &&
                "message" in err &&
                typeof err.message === "string"
                  ? err.message
                  : "Failed to load workflows and presets";
              return { errorMessage: msg };
            }),
          },
        },
      },
      idle: {
        on: {
          CHANGE_WORKFLOW: {
            actions: assign(({ event }) => ({ selectedWorkflowId: event.workflowId })),
          },
          CHANGE_PRESET: {
            actions: assign(({ event }) => ({ selectedPresetId: event.presetId })),
          },
          UPDATE_MESSAGE: {
            actions: assign(({ event }) => ({ initialMessage: event.message })),
          },
          SUBMIT: { target: "submitting" },
          DISMISS_ERROR: {
            actions: assign({ errorMessage: () => null }),
          },
        },
      },
      submitting: {
        invoke: {
          src: "submitThread",
          input: ({ context }) => ({
            selectedWorkflowId: context.selectedWorkflowId,
            selectedPresetId: context.selectedPresetId,
            initialMessage: context.initialMessage,
          }),
          onDone: {
            target: "idle",
            actions: assign(({ event }) => ({
              initialMessage: "",
              errorMessage: null,
              lastCreatedThreadId: event.output.newThreadId,
            })),
          },
          onError: {
            target: "error",
            actions: assign(({ event }) => {
              const err = event.error;
              const msg =
                err &&
                typeof err === "object" &&
                "message" in err &&
                typeof err.message === "string"
                  ? err.message
                  : "Failed to create thread";
              return { errorMessage: msg };
            }),
          },
        },
      },
      error: {
        on: {
          LOAD: { target: "loading" },
          CHANGE_WORKFLOW: {
            actions: assign(({ event }) => ({ selectedWorkflowId: event.workflowId })),
          },
          CHANGE_PRESET: {
            actions: assign(({ event }) => ({ selectedPresetId: event.presetId })),
          },
          UPDATE_MESSAGE: {
            actions: assign(({ event }) => ({ initialMessage: event.message })),
          },
          SUBMIT: { target: "submitting" },
          DISMISS_ERROR: {
            target: "idle",
            actions: assign({ errorMessage: () => null }),
          },
        },
      },
    },
  },
  {
    actors: {
      loadFormData: fromPromise(loadFormData),
      submitThread: fromPromise(
        ({
          input,
        }: {
          input: { selectedWorkflowId: string; selectedPresetId: string; initialMessage: string };
        }) => submitThread(input),
      ),
    },
  },
);
