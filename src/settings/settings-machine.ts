import { createMachine, assign, fromPromise } from "xstate";
import { getSetting, setSetting, listPresets, savePreset } from "../db/db-operations";
import type { Preset, InjectedSystemMessage } from "../db/db-schema";

export interface SettingsContext {
  openRouterApiKey: string;
  geminiApiKey: string;
  showOpenRouterKey: boolean;
  showGeminiKey: boolean;
  theme: "light" | "dark" | "system";
  injectedSystemMessages: Array<{ content: string; depth: number }>;
  originalSettings: {
    openRouterApiKey: string;
    geminiApiKey: string;
    theme: "light" | "dark" | "system";
    injectedSystemMessages: Array<{ content: string; depth: number }>;
  } | null;
  isDirty: boolean;
  validationErrors: Record<string, string>;
  errorMessage: string | null;
  successMessage: string | null;
  lastTestProvider: "openrouter" | "gemini" | null;
}

export type SettingsEvent =
  | { type: "LOAD" }
  | {
      type: "LOAD_SUCCESS";
      settings: {
        openRouterApiKey: string;
        geminiApiKey: string;
        theme: "light" | "dark" | "system";
        injectedSystemMessages: Array<{ content: string; depth: number }>;
      };
    }
  | { type: "LOAD_FAILURE"; error: string }
  | {
      type: "EDIT_FIELD";
      field: "openRouterApiKey" | "geminiApiKey" | "theme";
      value: string;
    }
  | { type: "TOGGLE_KEY_VISIBILITY"; provider: "openrouter" | "gemini" }
  | { type: "ADD_INJECTED_MESSAGE" }
  | {
      type: "UPDATE_INJECTED_MESSAGE";
      index: number;
      field: "content" | "depth";
      value: string | number;
    }
  | { type: "REMOVE_INJECTED_MESSAGE"; index: number }
  | { type: "TEST_CONNECTION"; provider: "openrouter" | "gemini" }
  | { type: "TEST_CONNECTION_SUCCESS" }
  | { type: "TEST_CONNECTION_FAILURE"; error: string }
  | { type: "SAVE" }
  | { type: "VALIDATION_SUCCESS" }
  | { type: "VALIDATION_FAILURE"; errors: Record<string, string> }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_FAILURE"; error: string }
  | { type: "RESET_FIELDS" }
  | { type: "DISMISS_ERROR" };

const checkIsDirty = (
  current: {
    openRouterApiKey: string;
    geminiApiKey: string;
    theme: "light" | "dark" | "system";
    injectedSystemMessages: Array<{ content: string; depth: number }>;
  },
  original: SettingsContext["originalSettings"],
): boolean => {
  if (!original) return false;
  if (current.openRouterApiKey !== original.openRouterApiKey) return true;
  if (current.geminiApiKey !== original.geminiApiKey) return true;
  if (current.theme !== original.theme) return true;
  if (current.injectedSystemMessages.length !== original.injectedSystemMessages.length) return true;

  for (let i = 0; i < current.injectedSystemMessages.length; i++) {
    const curMsg = current.injectedSystemMessages[i];
    const origMsg = original.injectedSystemMessages[i];
    if (curMsg.content !== origMsg.content || curMsg.depth !== origMsg.depth) {
      return true;
    }
  }

  return false;
};

export async function testApiConnection(
  provider: "openrouter" | "gemini",
  apiKey: string,
): Promise<void> {
  if (!apiKey) {
    throw new Error("API key is required");
  }
  if (provider === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Gemini API returned status ${res.status}`);
    }
  } else {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `OpenRouter API returned status ${res.status}`);
    }
  }
}

export const settingsFormMachine = createMachine(
  {
    types: {} as {
      context: SettingsContext;
      events: SettingsEvent;
    },
    id: "settingsForm",
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
      successMessage: null,
      lastTestProvider: null,
    },
    states: {
      loading: {
        invoke: {
          src: "loadSettingsActor",
          onDone: {
            target: "idle.clean",
            actions: assign(({ event }) => ({
              openRouterApiKey: event.output.openRouterApiKey,
              geminiApiKey: event.output.geminiApiKey,
              theme: event.output.theme,
              injectedSystemMessages: event.output.injectedSystemMessages,
              originalSettings: {
                openRouterApiKey: event.output.openRouterApiKey,
                geminiApiKey: event.output.geminiApiKey,
                theme: event.output.theme,
                injectedSystemMessages: event.output.injectedSystemMessages.map(
                  (m: InjectedSystemMessage) => ({ ...m }),
                ),
              },
              isDirty: false,
            })),
          },
          onError: {
            target: "error",
            actions: assign({
              errorMessage: ({ event }) => {
                if (event.error instanceof Error) return event.error.message;
                if (typeof event.error === "string") return event.error;
                return "Failed to load settings";
              },
            }),
          },
        },
      },
      idle: {
        initial: "clean",
        states: {
          clean: {},
          dirty: {},
          checkDirty: {
            always: [
              {
                guard: ({ context }) => context.isDirty,
                target: "dirty",
              },
              {
                target: "clean",
              },
            ],
          },
        },
        on: {
          EDIT_FIELD: {
            actions: [
              assign(({ context, event }) => {
                const updated = {
                  openRouterApiKey: context.openRouterApiKey,
                  geminiApiKey: context.geminiApiKey,
                  theme: context.theme,
                  injectedSystemMessages: context.injectedSystemMessages,
                };
                if (event.field === "theme") {
                  updated.theme = event.value as "light" | "dark" | "system";
                } else if (event.field === "openRouterApiKey") {
                  updated.openRouterApiKey = event.value;
                } else if (event.field === "geminiApiKey") {
                  updated.geminiApiKey = event.value;
                }
                const isDirty = checkIsDirty(updated, context.originalSettings);
                return {
                  ...updated,
                  isDirty,
                };
              }),
            ],
            target: ".checkDirty",
          },
          TOGGLE_KEY_VISIBILITY: {
            actions: assign(({ context, event }) => {
              if (event.provider === "gemini") {
                return { showGeminiKey: !context.showGeminiKey };
              } else {
                return { showOpenRouterKey: !context.showOpenRouterKey };
              }
            }),
          },
          ADD_INJECTED_MESSAGE: {
            actions: assign(({ context }) => {
              const updatedMessages = [
                ...context.injectedSystemMessages,
                { content: "", depth: 0 },
              ];
              const updated = {
                openRouterApiKey: context.openRouterApiKey,
                geminiApiKey: context.geminiApiKey,
                theme: context.theme,
                injectedSystemMessages: updatedMessages,
              };
              const isDirty = checkIsDirty(updated, context.originalSettings);
              return {
                injectedSystemMessages: updatedMessages,
                isDirty,
              };
            }),
            target: ".checkDirty",
          },
          UPDATE_INJECTED_MESSAGE: {
            actions: assign(({ context, event }) => {
              const updatedMessages = context.injectedSystemMessages.map((msg, idx) => {
                if (idx === event.index) {
                  if (event.field === "depth") {
                    const num =
                      typeof event.value === "number"
                        ? event.value
                        : parseInt(event.value as string, 10);
                    return { ...msg, depth: isNaN(num) ? 0 : num };
                  } else {
                    return { ...msg, content: event.value as string };
                  }
                }
                return msg;
              });
              const updated = {
                openRouterApiKey: context.openRouterApiKey,
                geminiApiKey: context.geminiApiKey,
                theme: context.theme,
                injectedSystemMessages: updatedMessages,
              };
              const isDirty = checkIsDirty(updated, context.originalSettings);
              return {
                injectedSystemMessages: updatedMessages,
                isDirty,
              };
            }),
            target: ".checkDirty",
          },
          REMOVE_INJECTED_MESSAGE: {
            actions: assign(({ context, event }) => {
              const updatedMessages = context.injectedSystemMessages.filter(
                (_, idx) => idx !== event.index,
              );
              const updated = {
                openRouterApiKey: context.openRouterApiKey,
                geminiApiKey: context.geminiApiKey,
                theme: context.theme,
                injectedSystemMessages: updatedMessages,
              };
              const isDirty = checkIsDirty(updated, context.originalSettings);
              return {
                injectedSystemMessages: updatedMessages,
                isDirty,
              };
            }),
            target: ".checkDirty",
          },
          TEST_CONNECTION: {
            target: "testingConnection",
            actions: assign({
              lastTestProvider: ({ event }) => event.provider,
              errorMessage: () => null,
              successMessage: () => null,
            }),
          },
          SAVE: {
            target: "validating",
            actions: assign({
              validationErrors: () => ({}),
              errorMessage: () => null,
            }),
          },
          RESET_FIELDS: {
            target: ".clean",
            actions: assign(({ context }) => {
              if (!context.originalSettings) return {};
              return {
                openRouterApiKey: context.originalSettings.openRouterApiKey,
                geminiApiKey: context.originalSettings.geminiApiKey,
                theme: context.originalSettings.theme,
                injectedSystemMessages: context.originalSettings.injectedSystemMessages.map(
                  (m) => ({ ...m }),
                ),
                isDirty: false,
                validationErrors: {},
                errorMessage: null,
              };
            }),
          },
        },
      },
      testingConnection: {
        invoke: {
          src: "testConnectionActor",
          input: ({ context }) => ({
            provider: context.lastTestProvider!,
            apiKey:
              context.lastTestProvider === "gemini"
                ? context.geminiApiKey
                : context.openRouterApiKey,
          }),
          onDone: {
            target: "idle",
            actions: assign({
              successMessage: "Connection test successful!",
            }),
          },
          onError: {
            target: "idle",
            actions: assign({
              errorMessage: ({ event }) => {
                if (event.error instanceof Error) return event.error.message;
                if (typeof event.error === "string") return event.error;
                return "Connection test failed";
              },
            }),
          },
        },
      },
      validating: {
        always: [
          {
            guard: "hasValidationErrors",
            target: "idle.dirty",
            actions: assign(({ context }) => {
              const errors: Record<string, string> = {};
              context.injectedSystemMessages.forEach((msg, idx) => {
                if (!Number.isInteger(msg.depth)) {
                  errors[`depth_${idx}`] = "Depth must be a valid integer";
                }
              });
              return { validationErrors: errors };
            }),
          },
          {
            target: "saving",
          },
        ],
      },
      saving: {
        invoke: {
          src: "saveSettingsActor",
          input: ({ context }) => ({
            openRouterApiKey: context.openRouterApiKey,
            geminiApiKey: context.geminiApiKey,
            theme: context.theme,
            injectedSystemMessages: context.injectedSystemMessages,
          }),
          onDone: {
            target: "idle.clean",
            actions: assign(({ context }) => ({
              originalSettings: {
                openRouterApiKey: context.openRouterApiKey,
                geminiApiKey: context.geminiApiKey,
                theme: context.theme,
                injectedSystemMessages: context.injectedSystemMessages.map((m) => ({ ...m })),
              },
              isDirty: false,
              successMessage: "Settings saved successfully!",
            })),
          },
          onError: {
            target: "error",
            actions: assign({
              errorMessage: ({ event }) => {
                if (event.error instanceof Error) return event.error.message;
                if (typeof event.error === "string") return event.error;
                return "Failed to save settings";
              },
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
          LOAD: {
            target: "loading",
          },
          SAVE: {
            target: "validating",
          },
        },
      },
    },
  },
  {
    actors: {
      loadSettingsActor: fromPromise(async () => {
        const apiKeys = await getSetting("api_keys");
        const uiConfig = await getSetting("ui_config");
        const injected = await getSetting("injected_system_messages");

        return {
          openRouterApiKey: apiKeys?.openRouter || "",
          geminiApiKey: apiKeys?.gemini || "",
          theme: uiConfig?.theme || "system",
          injectedSystemMessages: injected || [],
        };
      }),
      testConnectionActor: fromPromise(
        async ({ input }: { input: { provider: "openrouter" | "gemini"; apiKey: string } }) => {
          await testApiConnection(input.provider, input.apiKey);
        },
      ),
      saveSettingsActor: fromPromise(
        async ({
          input,
        }: {
          input: {
            openRouterApiKey: string;
            geminiApiKey: string;
            theme: "light" | "dark" | "system";
            injectedSystemMessages: InjectedSystemMessage[];
          };
        }) => {
          await setSetting("api_keys", {
            openRouter: input.openRouterApiKey,
            gemini: input.geminiApiKey,
          });
          await setSetting("ui_config", {
            theme: input.theme,
          });
          await setSetting("injected_system_messages", input.injectedSystemMessages);

          if (input.theme === "light") {
            document.documentElement.classList.remove("dark");
            document.documentElement.classList.add("light");
          } else if (input.theme === "dark") {
            document.documentElement.classList.remove("light");
            document.documentElement.classList.add("dark");
          } else {
            const isDark =
              typeof window !== "undefined" && window.matchMedia
                ? window.matchMedia("(prefers-color-scheme: dark)").matches
                : false;
            document.documentElement.classList.toggle("dark", isDark);
            document.documentElement.classList.toggle("light", !isDark);
          }

          const existingPresets = await listPresets();
          const hasKeys = input.openRouterApiKey || input.geminiApiKey;
          if (hasKeys && existingPresets.length === 0) {
            const geminiPresetId =
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : "00000000-0000-4000-8000-000000000001";
            const openrouterPresetId =
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : "00000000-0000-4000-8000-000000000002";

            const geminiPreset: Preset = {
              id: geminiPresetId,
              name: "Default Gemini Flash",
              provider: "gemini",
              model: "gemini-2.5-flash",
              apiKey: "",
              temperature: 0.7,
              budgetPolicy: {
                maxStepsWithoutUser: 10,
                maxTokensPerRun: null,
              },
            };

            const openrouterPreset: Preset = {
              id: openrouterPresetId,
              name: "Default OpenRouter Flash",
              provider: "openrouter",
              model: "google/gemini-2.5-flash",
              apiKey: "",
              temperature: 0.7,
              budgetPolicy: {
                maxStepsWithoutUser: 10,
                maxTokensPerRun: null,
              },
            };

            await savePreset(geminiPreset);
            await savePreset(openrouterPreset);

            await setSetting("default_preset_id", geminiPresetId);
          }
        },
      ),
    },
    guards: {
      hasValidationErrors: ({ context }) => {
        return context.injectedSystemMessages.some((msg) => !Number.isInteger(msg.depth));
      },
    },
  },
);
