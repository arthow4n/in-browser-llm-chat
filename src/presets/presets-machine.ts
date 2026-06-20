import { createMachine, assign, fromPromise } from "xstate";
import { listPresets, savePreset, deletePreset, getSetting } from "../db/db-operations";
import type { Preset } from "../db/db-schema";
import { testApiConnection } from "../settings/settings-machine";

export interface PresetsContext {
  presets: Preset[];
  currentPreset: Preset | null;
  presetToDelete: Preset | null;
  validationErrors: Record<string, string>;
  errorMessage: string | null;
  successMessage: string | null;
  testSuccess: boolean | null;
  testError: string | null;
  isTesting: boolean;
}

export type PresetsEvent =
  | { type: "LOAD" }
  | { type: "ADD_PRESET" }
  | { type: "EDIT_PRESET"; preset: Preset }
  | { type: "CANCEL_FORM" }
  | {
      type: "UPDATE_FIELD";
      field:
        | "name"
        | "provider"
        | "model"
        | "apiKey"
        | "temperature"
        | "maxTokens"
        | "reasoningLevel";
      value: unknown;
    }
  | {
      type: "UPDATE_BUDGET_FIELD";
      field: "maxStepsWithoutUser" | "maxTokensPerRun";
      value: unknown;
    }
  | { type: "SUBMIT_FORM" }
  | { type: "DELETE_PRESET_CLICK"; preset: Preset }
  | { type: "CONFIRM_DELETE" }
  | { type: "CANCEL_DELETE" }
  | { type: "TEST_CONNECTION" }
  | { type: "DISMISS_ALERT" };

const defaultBudgetPolicy = {
  maxStepsWithoutUser: 10,
  maxTokensPerRun: null,
};

const createDefaultPreset = (): Preset => ({
  id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "",
  name: "",
  provider: "gemini",
  model: "gemini-2.5-flash",
  apiKey: "",
  temperature: 0.7,
  maxTokens: null,
  reasoningLevel: "",
  budgetPolicy: { ...defaultBudgetPolicy },
});

export const presetsMachine = createMachine(
  {
    types: {} as {
      context: PresetsContext;
      events: PresetsEvent;
    },
    id: "presets",
    initial: "loading",
    context: {
      presets: [],
      currentPreset: null,
      presetToDelete: null,
      validationErrors: {},
      errorMessage: null,
      successMessage: null,
      testSuccess: null,
      testError: null,
      isTesting: false,
    },
    states: {
      loading: {
        invoke: {
          src: "loadPresetsActor",
          onDone: {
            target: "list",
            actions: assign({
              presets: ({ event }) => event.output,
            }),
          },
          onError: {
            target: "list",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to load presets",
            }),
          },
        },
      },
      list: {
        on: {
          ADD_PRESET: {
            target: "creating",
            actions: assign({
              currentPreset: () => createDefaultPreset(),
              validationErrors: () => ({}),
              testSuccess: () => null,
              testError: () => null,
            }),
          },
          EDIT_PRESET: {
            target: "editing",
            actions: assign({
              currentPreset: ({ event }) => ({
                ...event.preset,
                budgetPolicy: { ...event.preset.budgetPolicy },
              }),
              validationErrors: () => ({}),
              testSuccess: () => null,
              testError: () => null,
            }),
          },
          DELETE_PRESET_CLICK: {
            target: "deleteConfirm",
            actions: assign({
              presetToDelete: ({ event }) => event.preset,
            }),
          },
        },
      },
      creating: {
        on: {
          CANCEL_FORM: {
            target: "list",
            actions: assign({
              currentPreset: () => null,
              validationErrors: () => ({}),
            }),
          },
          UPDATE_FIELD: {
            actions: assign(({ context, event }) => {
              if (!context.currentPreset) return {};
              const currentPreset = { ...context.currentPreset };

              if (event.field === "temperature") {
                const val = parseFloat(event.value as string);
                currentPreset.temperature = isNaN(val) ? 0 : val;
              } else if (event.field === "maxTokens") {
                if (event.value === "" || event.value === null || event.value === undefined) {
                  currentPreset.maxTokens = null;
                } else {
                  const val = parseInt(event.value as string, 10);
                  currentPreset.maxTokens = isNaN(val) ? null : val;
                }
              } else if (
                event.field === "name" ||
                event.field === "model" ||
                event.field === "reasoningLevel"
              ) {
                currentPreset[event.field] = (event.value as string) || "";
              } else if (event.field === "apiKey") {
                currentPreset.apiKey = (event.value as string) || undefined;
              } else if (event.field === "provider") {
                currentPreset.provider = event.value as "gemini" | "openrouter";
              }

              // Update default model if provider changes
              if (event.field === "provider") {
                currentPreset.model =
                  event.value === "gemini" ? "gemini-2.5-flash" : "google/gemini-2.5-flash";
              }

              return { currentPreset };
            }),
          },
          UPDATE_BUDGET_FIELD: {
            actions: assign(({ context, event }) => {
              if (!context.currentPreset) return {};
              const currentPreset = { ...context.currentPreset };
              const budgetPolicy = { ...currentPreset.budgetPolicy };

              if (event.field === "maxStepsWithoutUser") {
                const val = parseInt(event.value as string, 10);
                budgetPolicy.maxStepsWithoutUser = isNaN(val) ? 0 : val;
              } else if (event.field === "maxTokensPerRun") {
                if (event.value === "" || event.value === null || event.value === undefined) {
                  budgetPolicy.maxTokensPerRun = null;
                } else {
                  const val = parseInt(event.value as string, 10);
                  budgetPolicy.maxTokensPerRun = isNaN(val) ? null : val;
                }
              }

              currentPreset.budgetPolicy = budgetPolicy;
              return { currentPreset };
            }),
          },
          SUBMIT_FORM: {
            target: "validating",
          },
          TEST_CONNECTION: {
            target: "testingConnection",
          },
        },
      },
      editing: {
        on: {
          CANCEL_FORM: {
            target: "list",
            actions: assign({
              currentPreset: () => null,
              validationErrors: () => ({}),
            }),
          },
          UPDATE_FIELD: {
            actions: assign(({ context, event }) => {
              if (!context.currentPreset) return {};
              const currentPreset = { ...context.currentPreset };

              if (event.field === "temperature") {
                const val = parseFloat(event.value as string);
                currentPreset.temperature = isNaN(val) ? 0 : val;
              } else if (event.field === "maxTokens") {
                if (event.value === "" || event.value === null || event.value === undefined) {
                  currentPreset.maxTokens = null;
                } else {
                  const val = parseInt(event.value as string, 10);
                  currentPreset.maxTokens = isNaN(val) ? null : val;
                }
              } else if (
                event.field === "name" ||
                event.field === "model" ||
                event.field === "reasoningLevel"
              ) {
                currentPreset[event.field] = (event.value as string) || "";
              } else if (event.field === "apiKey") {
                currentPreset.apiKey = (event.value as string) || undefined;
              } else if (event.field === "provider") {
                currentPreset.provider = event.value as "gemini" | "openrouter";
              }

              // Update default model if provider changes
              if (event.field === "provider") {
                currentPreset.model =
                  event.value === "gemini" ? "gemini-2.5-flash" : "google/gemini-2.5-flash";
              }

              return { currentPreset };
            }),
          },
          UPDATE_BUDGET_FIELD: {
            actions: assign(({ context, event }) => {
              if (!context.currentPreset) return {};
              const currentPreset = { ...context.currentPreset };
              const budgetPolicy = { ...currentPreset.budgetPolicy };

              if (event.field === "maxStepsWithoutUser") {
                const val = parseInt(event.value as string, 10);
                budgetPolicy.maxStepsWithoutUser = isNaN(val) ? 0 : val;
              } else if (event.field === "maxTokensPerRun") {
                if (event.value === "" || event.value === null || event.value === undefined) {
                  budgetPolicy.maxTokensPerRun = null;
                } else {
                  const val = parseInt(event.value as string, 10);
                  budgetPolicy.maxTokensPerRun = isNaN(val) ? null : val;
                }
              }

              currentPreset.budgetPolicy = budgetPolicy;
              return { currentPreset };
            }),
          },
          SUBMIT_FORM: {
            target: "validating",
          },
          TEST_CONNECTION: {
            target: "testingConnection",
          },
        },
      },
      validating: {
        always: [
          {
            guard: "hasErrors",
            target: "backToForm",
            actions: assign({
              validationErrors: ({ context }) => validatePreset(context.currentPreset),
            }),
          },
          {
            target: "saving",
          },
        ],
      },
      backToForm: {
        always: [
          {
            guard: ({ context }) =>
              !!context.currentPreset?.id &&
              context.presets.some((p) => p.id === context.currentPreset?.id),
            target: "editing",
          },
          {
            target: "creating",
          },
        ],
      },
      saving: {
        invoke: {
          src: "savePresetActor",
          input: ({ context }) => context.currentPreset!,
          onDone: {
            target: "loading",
            actions: assign({
              currentPreset: () => null,
              successMessage: () => "Preset saved successfully!",
              errorMessage: () => null,
            }),
          },
          onError: {
            target: "backToForm",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to save preset",
            }),
          },
        },
      },
      deleteConfirm: {
        on: {
          CONFIRM_DELETE: {
            target: "deleting",
          },
          CANCEL_DELETE: {
            target: "list",
            actions: assign({
              presetToDelete: () => null,
            }),
          },
        },
      },
      deleting: {
        invoke: {
          src: "deletePresetActor",
          input: ({ context }) => context.presetToDelete!.id,
          onDone: {
            target: "loading",
            actions: assign({
              presetToDelete: () => null,
              successMessage: () => "Preset deleted successfully!",
              errorMessage: () => null,
            }),
          },
          onError: {
            target: "list",
            actions: assign({
              presetToDelete: () => null,
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to delete preset",
            }),
          },
        },
      },
      testingConnection: {
        entry: assign({
          isTesting: () => true,
          testSuccess: () => null,
          testError: () => null,
        }),
        invoke: {
          src: "testConnectionActor",
          input: ({ context }) => context.currentPreset!,
          onDone: {
            target: "backToForm",
            actions: assign({
              isTesting: () => false,
              testSuccess: () => true,
              testError: () => null,
            }),
          },
          onError: {
            target: "backToForm",
            actions: assign({
              isTesting: () => false,
              testSuccess: () => false,
              testError: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Connection test failed",
            }),
          },
        },
      },
    },
    on: {
      DISMISS_ALERT: {
        actions: assign({
          errorMessage: () => null,
          successMessage: () => null,
          testSuccess: () => null,
          testError: () => null,
        }),
      },
      LOAD: {
        target: ".loading",
      },
    },
  },
  {
    actors: {
      loadPresetsActor: fromPromise(async () => {
        return await listPresets();
      }),
      savePresetActor: fromPromise(async ({ input }: { input: Preset }) => {
        // Ensure id is set (if not already set e.g. custom fallback)
        if (!input.id) {
          input.id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "";
        }
        await savePreset(input);
      }),
      deletePresetActor: fromPromise(async ({ input }: { input: string }) => {
        await deletePreset(input);
      }),
      testConnectionActor: fromPromise(async ({ input }: { input: Preset }) => {
        let apiKey = input.apiKey;
        if (!apiKey) {
          // Fallback to global settings key
          const globalKeys = await getSetting("api_keys");
          apiKey = input.provider === "gemini" ? globalKeys?.gemini : globalKeys?.openRouter;
        }
        if (!apiKey) {
          throw new Error(
            `No API key configured for preset or Global Settings (${input.provider === "gemini" ? "Gemini" : "OpenRouter"})`,
          );
        }
        await testApiConnection(input.provider, apiKey);
      }),
    },
    guards: {
      hasErrors: ({ context }) => {
        const errors = validatePreset(context.currentPreset);
        return Object.keys(errors).length > 0;
      },
    },
  },
);

function validatePreset(preset: Preset | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!preset) return errors;

  if (!preset.name.trim()) {
    errors.name = "Preset name is required";
  }

  if (!preset.model.trim()) {
    errors.model = "Model is required";
  }

  if (preset.temperature < 0 || preset.temperature > 2) {
    errors.temperature = "Temperature must be between 0.0 and 2.0";
  }

  if (
    preset.maxTokens !== null &&
    preset.maxTokens !== undefined &&
    (preset.maxTokens <= 0 || !Number.isInteger(preset.maxTokens))
  ) {
    errors.maxTokens = "Max tokens must be a positive integer";
  }

  if (
    preset.budgetPolicy.maxStepsWithoutUser <= 0 ||
    !Number.isInteger(preset.budgetPolicy.maxStepsWithoutUser)
  ) {
    errors.maxStepsWithoutUser = "Max steps must be a positive integer";
  }

  if (
    preset.budgetPolicy.maxTokensPerRun !== null &&
    (preset.budgetPolicy.maxTokensPerRun <= 0 ||
      !Number.isInteger(preset.budgetPolicy.maxTokensPerRun))
  ) {
    errors.maxTokensPerRun = "Max tokens per run must be a positive integer";
  }

  return errors;
}
