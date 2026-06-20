import { createMachine, assign, fromPromise } from "xstate";
import { getSetting } from "../db/db-operations";

export interface AppContext {
  theme: "light" | "dark" | "system";
  hasApiKeys: boolean;
}

export type AppEvent =
  | { type: "LOAD" }
  | { type: "SETTINGS_SAVED"; theme: "light" | "dark" | "system"; hasApiKeys: boolean }
  | { type: "CHANGE_THEME"; theme: "light" | "dark" | "system" };

export function applyDocumentTheme(theme: "light" | "dark" | "system") {
  if (typeof window === "undefined") return;
  if (theme === "light") {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  } else if (theme === "dark") {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  } else {
    const isDark = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }
}

export const appMachine = createMachine(
  {
    types: {} as {
      context: AppContext;
      events: AppEvent;
    },
    id: "app",
    initial: "loading",
    context: {
      theme: "system",
      hasApiKeys: false,
    },
    states: {
      loading: {
        invoke: {
          src: "loadInitialSettings",
          onDone: [
            {
              guard: ({ event }) => event.output.hasApiKeys,
              target: "app",
              actions: [
                assign(({ event }) => ({
                  theme: event.output.theme,
                  hasApiKeys: true,
                })),
                "applyTheme",
              ],
            },
            {
              target: "onboarding",
              actions: [
                assign(({ event }) => ({
                  theme: event.output.theme,
                  hasApiKeys: false,
                })),
                "applyTheme",
              ],
            },
          ],
          onError: {
            target: "onboarding",
            actions: [
              assign({
                theme: () => "system" as const,
                hasApiKeys: () => false,
              }),
              "applyTheme",
            ],
          },
        },
      },
      onboarding: {
        on: {
          SETTINGS_SAVED: [
            {
              guard: ({ event }) => event.hasApiKeys,
              target: "app",
              actions: [
                assign(({ event }) => ({
                  theme: event.theme,
                  hasApiKeys: true,
                })),
                "applyTheme",
              ],
            },
            {
              actions: [
                assign(({ event }) => ({
                  theme: event.theme,
                  hasApiKeys: false,
                })),
                "applyTheme",
              ],
            },
          ],
          CHANGE_THEME: {
            actions: [assign(({ event }) => ({ theme: event.theme })), "applyTheme"],
          },
        },
      },
      app: {
        on: {
          SETTINGS_SAVED: [
            {
              guard: ({ event }) => !event.hasApiKeys,
              target: "onboarding",
              actions: [
                assign(({ event }) => ({
                  theme: event.theme,
                  hasApiKeys: false,
                })),
                "applyTheme",
              ],
            },
            {
              actions: [
                assign(({ event }) => ({
                  theme: event.theme,
                  hasApiKeys: true,
                })),
                "applyTheme",
              ],
            },
          ],
          CHANGE_THEME: {
            actions: [assign(({ event }) => ({ theme: event.theme })), "applyTheme"],
          },
        },
      },
    },
  },
  {
    actions: {
      applyTheme: ({ context, event }) => {
        const theme =
          event.type === "SETTINGS_SAVED" || event.type === "CHANGE_THEME"
            ? event.theme
            : context.theme;
        applyDocumentTheme(theme);
      },
    },
    actors: {
      loadInitialSettings: fromPromise(async () => {
        const apiKeys = await getSetting("api_keys");
        const uiConfig = await getSetting("ui_config");
        const hasApiKeys = !!(apiKeys?.openRouter || apiKeys?.gemini);
        return {
          theme: uiConfig?.theme || "system",
          hasApiKeys,
        };
      }),
    },
  },
);
