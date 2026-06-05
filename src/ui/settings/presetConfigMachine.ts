import { setup, assign, fromPromise } from "xstate";
import { getPreset, savePreset, deletePreset, PresetStore } from "../../db/db";

export interface PresetConfigContext {
  presetId: string | null;
  name: string;
  provider: "openrouter" | "gemini";
  model: string;
  apiKey: string;
  temperature: number | undefined;
  maxTokens: number | undefined;
  reasoningLevel: string;
  maxStepsWithoutUser: number;
  maxTokensPerRun: number | null;
  isDirty: boolean;
  validationErrors: Record<string, string>;
  errorMessage: string | null;
  originalPreset: PresetStore | null;
}

export type PresetConfigEvent =
  | { type: "LOAD" }
  | { type: "EDIT_FIELD"; field: string; value: string }
  | { type: "SAVE" }
  | { type: "DELETE" }
  | { type: "RESET_FIELDS" }
  | { type: "DISMISS_ERROR" };

export const presetConfigMachine = setup({
  types: {} as {
    context: PresetConfigContext;
    events: PresetConfigEvent;
    input: { presetId: string | null };
  },
  actors: {
    loadPreset: fromPromise(async ({ input }: { input: { presetId: string | null } }) => {
      if (!input.presetId) {
        return null;
      }
      const preset = await getPreset(input.presetId);
      if (!preset) {
        throw new Error("Preset not found in database");
      }
      return preset;
    }),
    savePresetActor: fromPromise(async ({ input }: { input: PresetStore }) => {
      await savePreset(input);
      return input;
    }),
    deletePresetActor: fromPromise(async ({ input }: { input: { id: string } }) => {
      await deletePreset(input.id);
    }),
  },
  actions: {
    updateField: assign({
      name: ({ context, event }) =>
        event.type === "EDIT_FIELD" && event.field === "name" ? event.value : context.name,
      provider: ({ context, event }) => {
        if (
          event.type === "EDIT_FIELD" &&
          event.field === "provider" &&
          (event.value === "gemini" || event.value === "openrouter")
        ) {
          // Reset model when provider changes to a default for that provider
          return event.value;
        }
        return context.provider;
      },
      model: ({ context, event }) => {
        if (event.type === "EDIT_FIELD" && event.field === "model") {
          return event.value;
        }
        if (event.type === "EDIT_FIELD" && event.field === "provider") {
          return event.value === "gemini" ? "gemini-2.5-flash" : "google/gemini-2.5-flash";
        }
        return context.model;
      },
      apiKey: ({ context, event }) =>
        event.type === "EDIT_FIELD" && event.field === "apiKey" ? event.value : context.apiKey,
      temperature: ({ context, event }) => {
        if (event.type === "EDIT_FIELD" && event.field === "temperature") {
          if (event.value === "") return undefined;
          const num = parseFloat(event.value);
          return isNaN(num) ? context.temperature : num;
        }
        return context.temperature;
      },
      maxTokens: ({ context, event }) => {
        if (event.type === "EDIT_FIELD" && event.field === "maxTokens") {
          if (event.value === "") return undefined;
          const num = parseInt(event.value, 10);
          return isNaN(num) ? context.maxTokens : num;
        }
        return context.maxTokens;
      },
      reasoningLevel: ({ context, event }) =>
        event.type === "EDIT_FIELD" && event.field === "reasoningLevel"
          ? event.value
          : context.reasoningLevel,
      maxStepsWithoutUser: ({ context, event }) => {
        if (event.type === "EDIT_FIELD" && event.field === "maxStepsWithoutUser") {
          const num = parseInt(event.value, 10);
          return isNaN(num) ? context.maxStepsWithoutUser : num;
        }
        return context.maxStepsWithoutUser;
      },
      maxTokensPerRun: ({ context, event }) => {
        if (event.type === "EDIT_FIELD" && event.field === "maxTokensPerRun") {
          if (event.value === "" || event.value === null) return null;
          const num = parseInt(event.value, 10);
          return isNaN(num) ? context.maxTokensPerRun : num;
        }
        return context.maxTokensPerRun;
      },
      isDirty: () => true,
    }),
    resetFields: assign({
      name: ({ context }) => context.originalPreset?.name ?? "New Preset",
      provider: ({ context }) => context.originalPreset?.provider ?? "gemini",
      model: ({ context }) => context.originalPreset?.model ?? "gemini-2.5-flash",
      apiKey: ({ context }) => context.originalPreset?.apiKey ?? "",
      temperature: ({ context }) => context.originalPreset?.temperature,
      maxTokens: ({ context }) => context.originalPreset?.maxTokens,
      reasoningLevel: ({ context }) => context.originalPreset?.reasoningLevel ?? "",
      maxStepsWithoutUser: ({ context }) =>
        context.originalPreset?.budgetPolicy?.maxStepsWithoutUser ?? 10,
      maxTokensPerRun: ({ context }) =>
        context.originalPreset?.budgetPolicy?.maxTokensPerRun ?? null,
      isDirty: false,
      validationErrors: {},
    }),
    setValidationError: assign({
      validationErrors: ({ context }) => {
        const errors: Record<string, string> = {};
        if (!context.name.trim()) {
          errors.name = "Name is required";
        }
        if (!context.model.trim()) {
          errors.model = "Model ID is required";
        }
        if (
          context.temperature !== undefined &&
          (context.temperature < 0 || context.temperature > 2)
        ) {
          errors.temperature = "Temperature must be between 0 and 2";
        }
        if (context.maxTokens !== undefined && context.maxTokens <= 0) {
          errors.maxTokens = "Max tokens must be a positive integer";
        }
        if (context.maxStepsWithoutUser <= 0) {
          errors.maxStepsWithoutUser = "Max steps must be greater than 0";
        }
        if (context.maxTokensPerRun !== null && context.maxTokensPerRun <= 0) {
          errors.maxTokensPerRun = "Max tokens per run must be a positive integer";
        }
        return errors;
      },
    }),
    setError: assign({
      errorMessage: ({ event }) => {
        if (event && typeof event === "object" && "error" in event) {
          const err = event.error;
          if (err instanceof Error) {
            return err.message;
          }
          if (
            err &&
            typeof err === "object" &&
            "message" in err &&
            typeof err.message === "string"
          ) {
            return err.message;
          }
          if (typeof err === "string") {
            return err;
          }
        }
        return "An error occurred";
      },
    }),
    clearError: assign({
      errorMessage: null,
    }),
  },
}).createMachine({
  id: "presetConfig",
  initial: "loading",
  context: ({ input }) => ({
    presetId: input.presetId,
    name: "New Preset",
    provider: "gemini",
    model: "gemini-2.5-flash",
    apiKey: "",
    temperature: 0.7,
    maxTokens: undefined,
    reasoningLevel: "",
    maxStepsWithoutUser: 10,
    maxTokensPerRun: null,
    isDirty: false,
    validationErrors: {},
    errorMessage: null,
    originalPreset: null,
  }),
  states: {
    loading: {
      invoke: {
        src: "loadPreset",
        input: ({ context }) => ({ presetId: context.presetId }),
        onDone: [
          {
            guard: ({ event }) => event.output !== null,
            target: "idle.clean",
            actions: assign({
              originalPreset: ({ event }) => event.output!,
              name: ({ event }) => event.output!.name,
              provider: ({ event }) => event.output!.provider,
              model: ({ event }) => event.output!.model,
              apiKey: ({ event }) => event.output!.apiKey ?? "",
              temperature: ({ event }) => event.output!.temperature,
              maxTokens: ({ event }) => event.output!.maxTokens,
              reasoningLevel: ({ event }) => event.output!.reasoningLevel ?? "",
              maxStepsWithoutUser: ({ event }) =>
                event.output!.budgetPolicy?.maxStepsWithoutUser ?? 10,
              maxTokensPerRun: ({ event }) => event.output!.budgetPolicy?.maxTokensPerRun ?? null,
              isDirty: false,
            }),
          },
          {
            target: "idle.clean",
            actions: assign({
              originalPreset: null,
              name: "New Preset",
              provider: "gemini",
              model: "gemini-2.5-flash",
              apiKey: "",
              temperature: 0.7,
              maxTokens: undefined,
              reasoningLevel: "",
              maxStepsWithoutUser: 10,
              maxTokensPerRun: null,
              isDirty: false,
            }),
          },
        ],
        onError: {
          target: "error",
          actions: ["setError"],
        },
      },
    },
    idle: {
      initial: "clean",
      states: {
        clean: {},
        dirty: {},
      },
      on: {
        EDIT_FIELD: {
          target: ".dirty",
          actions: ["updateField"],
        },
        RESET_FIELDS: {
          target: ".clean",
          actions: ["resetFields"],
        },
        SAVE: {
          target: "validating",
        },
        DELETE: {
          guard: ({ context }) => context.presetId !== null,
          target: "deleting",
        },
      },
    },
    validating: {
      always: [
        {
          guard: ({ context }) => {
            const hasName = !!context.name.trim();
            const hasModel = !!context.model.trim();
            const validTemp =
              context.temperature === undefined ||
              (context.temperature >= 0 && context.temperature <= 2);
            const validMaxTokens = context.maxTokens === undefined || context.maxTokens > 0;
            const validSteps = context.maxStepsWithoutUser > 0;
            const validTokensPerRun =
              context.maxTokensPerRun === null || context.maxTokensPerRun > 0;
            return (
              hasName && hasModel && validTemp && validMaxTokens && validSteps && validTokensPerRun
            );
          },
          target: "saving",
        },
        {
          target: "idle.dirty",
          actions: ["setValidationError"],
        },
      ],
    },
    saving: {
      invoke: {
        src: "savePresetActor",
        input: ({ context }) => ({
          id: context.presetId || crypto.randomUUID(),
          name: context.name,
          provider: context.provider,
          model: context.model,
          apiKey: context.apiKey ? context.apiKey : undefined,
          temperature: context.temperature,
          maxTokens: context.maxTokens,
          reasoningLevel: context.reasoningLevel ? context.reasoningLevel : undefined,
          budgetPolicy: {
            maxStepsWithoutUser: context.maxStepsWithoutUser,
            maxTokensPerRun: context.maxTokensPerRun,
          },
        }),
        onDone: {
          target: "saveSuccess",
        },
        onError: {
          target: "error",
          actions: ["setError"],
        },
      },
    },
    deleting: {
      invoke: {
        src: "deletePresetActor",
        input: ({ context }) => ({ id: context.presetId! }),
        onDone: {
          target: "deleteSuccess",
        },
        onError: {
          target: "error",
          actions: ["setError"],
        },
      },
    },
    saveSuccess: {
      type: "final",
    },
    deleteSuccess: {
      type: "final",
    },
    error: {
      on: {
        DISMISS_ERROR: {
          target: "idle.dirty",
          actions: ["clearError"],
        },
      },
    },
  },
});
