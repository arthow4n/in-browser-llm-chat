import { setup, assign, fromPromise } from "xstate";
import { getSetting, setSetting } from "../../db/db.js";

export interface SystemMessageConfig {
  content: string;
  depth: number;
}

export interface GlobalSettingsData {
  api_keys: {
    openRouter?: string;
    gemini?: string;
  };
  ui_config: {
    theme: "light" | "dark" | "system";
  };
  injected_system_messages: SystemMessageConfig[];
}

export interface GlobalSettingsContext {
  openRouterApiKey: string;
  geminiApiKey: string;
  showOpenRouterKey: boolean;
  showGeminiKey: boolean;
  theme: "light" | "dark" | "system";
  injectedSystemMessages: SystemMessageConfig[];
  originalSettings: GlobalSettingsData | null;
  isDirty: boolean;
  validationErrors: Record<string, string>;
  errorMessage: string | null;
}

export type GlobalSettingsEvent =
  | { type: "LOAD" }
  | { type: "LOAD_SUCCESS"; settings: GlobalSettingsData }
  | { type: "LOAD_FAILURE"; error: string }
  | { type: "EDIT_FIELD"; field: "openRouterApiKey" | "geminiApiKey" | "theme"; value: string }
  | { type: "TOGGLE_KEY_VISIBILITY"; provider: "openrouter" | "gemini" }
  | { type: "ADD_INJECTED_MESSAGE" }
  | { type: "UPDATE_INJECTED_MESSAGE"; index: number; field: "content" | "depth"; value: string | number }
  | { type: "REMOVE_INJECTED_MESSAGE"; index: number }
  | { type: "SAVE" }
  | { type: "VALIDATION_SUCCESS" }
  | { type: "VALIDATION_FAILURE"; errors: Record<string, string> }
  | { type: "SAVE_SUCCESS"; settings: GlobalSettingsData }
  | { type: "SAVE_FAILURE"; error: string }
  | { type: "RESET_FIELDS" }
  | { type: "DISMISS_ERROR" };

export const globalSettingsMachine = setup({
  types: {
    context: {} as GlobalSettingsContext,
    events: {} as GlobalSettingsEvent,
  },
  actors: {
    loadSettings: fromPromise(async () => {
      const api_keys = (await getSetting<{ openRouter?: string; gemini?: string }>("api_keys")) || { openRouter: "", gemini: "" };
      const ui_config = (await getSetting<{ theme: "light" | "dark" | "system" }>("ui_config")) || { theme: "system" };
      const injected_system_messages = (await getSetting<SystemMessageConfig[]>("injected_system_messages")) || [];
      return { api_keys, ui_config, injected_system_messages } as GlobalSettingsData;
    }),
    saveSettings: fromPromise(async ({ input }: { input: GlobalSettingsData }) => {
      await setSetting("api_keys", { value: input.api_keys });
      await setSetting("ui_config", { value: input.ui_config });
      await setSetting("injected_system_messages", { value: input.injected_system_messages });

      // Check if we need to seed default presets
      // This is simplified, actual seeding might involve querying the presets store
      const db = await import("../../db/db.js");
      const presets = await db.getAllPresets();
      if (presets.length === 0 && (input.api_keys.openRouter || input.api_keys.gemini)) {
        // Seed default presets
        const defaultGeminiId = crypto.randomUUID();
        await db.savePreset({
          id: defaultGeminiId,
          name: "Default Gemini Flash",
          provider: "gemini",
          model: "gemini-2.5-flash",
          temperature: 0.7,
          maxTokens: undefined,
          budgetPolicy: { maxStepsWithoutUser: 10, maxTokensPerRun: null },
        });
        const defaultOpenRouterId = crypto.randomUUID();
        await db.savePreset({
          id: defaultOpenRouterId,
          name: "Default OpenRouter Flash",
          provider: "openrouter",
          model: "google/gemini-2.5-flash",
          temperature: 0.7,
          maxTokens: undefined,
          budgetPolicy: { maxStepsWithoutUser: 10, maxTokensPerRun: null },
        });
        await setSetting("default_preset_id", { value: defaultGeminiId });
      }

      return input;
    }),
  },
  actions: {
    applyLoadedSettings: assign({
      openRouterApiKey: ({ event }) => (event as Extract<GlobalSettingsEvent, { settings: GlobalSettingsData }>).settings.api_keys.openRouter || "",
      geminiApiKey: ({ event }) => (event as Extract<GlobalSettingsEvent, { settings: GlobalSettingsData }>).settings.api_keys.gemini || "",
      theme: ({ event }) => (event as Extract<GlobalSettingsEvent, { settings: GlobalSettingsData }>).settings.ui_config.theme,
      injectedSystemMessages: ({ event }) => (event as Extract<GlobalSettingsEvent, { settings: GlobalSettingsData }>).settings.injected_system_messages,
      originalSettings: ({ event }) => (event as Extract<GlobalSettingsEvent, { settings: GlobalSettingsData }>).settings,
      isDirty: false,
      validationErrors: {},
      errorMessage: null,
    }),
    updateField: assign({
      openRouterApiKey: ({ context, event }) =>
        event.type === "EDIT_FIELD" && event.field === "openRouterApiKey"
          ? event.value
          : context.openRouterApiKey,
      geminiApiKey: ({ context, event }) =>
        event.type === "EDIT_FIELD" && event.field === "geminiApiKey"
          ? event.value
          : context.geminiApiKey,
      theme: ({ context, event }) =>
        event.type === "EDIT_FIELD" && event.field === "theme"
          ? (event.value as "light" | "dark" | "system")
          : context.theme,
      isDirty: true,
    }),
    toggleKeyVisibility: assign({
      showOpenRouterKey: ({ context, event }) =>
        event.type === "TOGGLE_KEY_VISIBILITY" && event.provider === "openrouter"
          ? !context.showOpenRouterKey
          : context.showOpenRouterKey,
      showGeminiKey: ({ context, event }) =>
        event.type === "TOGGLE_KEY_VISIBILITY" && event.provider === "gemini"
          ? !context.showGeminiKey
          : context.showGeminiKey,
    }),
    addInjectedMessage: assign({
      injectedSystemMessages: ({ context }) => [
        ...context.injectedSystemMessages,
        { content: "", depth: 0 },
      ],
      isDirty: true,
    }),
    updateInjectedMessage: assign({
      injectedSystemMessages: ({ context, event }) => {
        if (event.type !== "UPDATE_INJECTED_MESSAGE") return context.injectedSystemMessages;
        const newMessages = [...context.injectedSystemMessages];
        newMessages[event.index] = {
          ...newMessages[event.index],
          [event.field]: event.value,
        };
        return newMessages;
      },
      isDirty: true,
    }),
    removeInjectedMessage: assign({
      injectedSystemMessages: ({ context, event }) => {
        if (event.type !== "REMOVE_INJECTED_MESSAGE") return context.injectedSystemMessages;
        const newMessages = [...context.injectedSystemMessages];
        newMessages.splice(event.index, 1);
        return newMessages;
      },
      isDirty: true,
    }),
    resetFields: assign({
      openRouterApiKey: ({ context }) => context.originalSettings?.api_keys.openRouter || "",
      geminiApiKey: ({ context }) => context.originalSettings?.api_keys.gemini || "",
      theme: ({ context }) => context.originalSettings?.ui_config.theme || "system",
      injectedSystemMessages: ({ context }) =>
        context.originalSettings?.injected_system_messages || [],
      isDirty: false,
      validationErrors: {},
    }),
    setValidationError: assign({
      validationErrors: ({ event }) => (event.type === "VALIDATION_FAILURE" ? event.errors : {}),
    }),
    setError: assign({
      errorMessage: ({ event }) => (event as { error?: string }).error || "An error occurred",
    }),
    clearError: assign({
      errorMessage: null,
    }),
  },
}).createMachine({
  id: "globalSettings",
  initial: "loading",
  context: {
    openRouterApiKey: "",
    geminiApiKey: "",
    showOpenRouterKey: false,
    showGeminiKey: false,
    theme: "system",
    injectedSystemMessages: [],
    originalSettings: null,
    isDirty: false,
    validationErrors: {},
    errorMessage: null,
  },
  states: {
    loading: {
      invoke: {
        src: "loadSettings",
        onDone: {
          target: "idle.clean",
          actions: assign({
            openRouterApiKey: ({ event }) => (event.output as GlobalSettingsData).api_keys.openRouter || "",
            geminiApiKey: ({ event }) => (event.output as GlobalSettingsData).api_keys.gemini || "",
            theme: ({ event }) => (event.output as GlobalSettingsData).ui_config.theme,
            injectedSystemMessages: ({ event }) => (event.output as GlobalSettingsData).injected_system_messages,
            originalSettings: ({ event }) => event.output as GlobalSettingsData,
            isDirty: false,
            validationErrors: {},
            errorMessage: null,
          }),
        },
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
        TOGGLE_KEY_VISIBILITY: {
          actions: ["toggleKeyVisibility"],
        },
        ADD_INJECTED_MESSAGE: {
          target: ".dirty",
          actions: ["addInjectedMessage"],
        },
        UPDATE_INJECTED_MESSAGE: {
          target: ".dirty",
          actions: ["updateInjectedMessage"],
        },
        REMOVE_INJECTED_MESSAGE: {
          target: ".dirty",
          actions: ["removeInjectedMessage"],
        },
        RESET_FIELDS: {
          target: ".clean",
          actions: ["resetFields"],
        },
        SAVE: {
          target: "validating",
        },
      },
    },
    validating: {
      always: [
        {
          guard: ({ context }) => {
            for (let i = 0; i < context.injectedSystemMessages.length; i++) {
              if (
                isNaN(context.injectedSystemMessages[i].depth) ||
                !Number.isInteger(context.injectedSystemMessages[i].depth)
              ) {
                return false;
              }
            }
            return true;
          },
          target: "saving",
        },
        {
          target: "idle.dirty",
          actions: assign({
            validationErrors: () => ({ general: "Depths must be integers" }),
          }),
        },
      ],
    },
    saving: {
      invoke: {
        src: "saveSettings",
        input: ({ context }) => ({
          api_keys: {
            openRouter: context.openRouterApiKey,
            gemini: context.geminiApiKey,
          },
          ui_config: { theme: context.theme },
          injected_system_messages: context.injectedSystemMessages,
        }),
        onDone: {
          target: "idle.clean",
          actions: assign({
            openRouterApiKey: ({ event }) => (event.output as GlobalSettingsData).api_keys.openRouter || "",
            geminiApiKey: ({ event }) => (event.output as GlobalSettingsData).api_keys.gemini || "",
            theme: ({ event }) => (event.output as GlobalSettingsData).ui_config.theme,
            injectedSystemMessages: ({ event }) => (event.output as GlobalSettingsData).injected_system_messages,
            originalSettings: ({ event }) => event.output as GlobalSettingsData,
            isDirty: false,
            validationErrors: {},
            errorMessage: null,
          }),
        },
        onError: {
          target: "error",
          actions: ["setError"],
        },
      },
    },
    error: {
      on: {
        DISMISS_ERROR: {
          target: "idle.dirty", // fallback safely
          actions: ["clearError"],
        },
      },
    },
  },
});
