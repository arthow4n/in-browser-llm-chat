import { setup, assign, fromPromise } from "xstate";
import { getSetting } from "../../db/db";

export interface PresetConnectionTesterContext {
  provider: "openrouter" | "gemini";
  model: string;
  apiKey?: string;
  latency: number | null;
  errorMessage: string | null;
  abortController: AbortController | null;
}

export type PresetConnectionTesterEvent =
  | {
      type: "TEST_CONNECTION";
      provider: "openrouter" | "gemini";
      model: string;
      apiKey?: string;
    }
  | { type: "CANCEL_TEST" };

export interface PresetConnectionTestResult {
  provider: "openrouter" | "gemini";
  model: string;
  latency: number;
}

export const presetConnectionTesterMachine = setup({
  types: {
    context: {} as PresetConnectionTesterContext,
    events: {} as PresetConnectionTesterEvent,
  },
  actors: {
    runTest: fromPromise(
      async ({
        input,
      }: {
        input: {
          provider: "openrouter" | "gemini";
          model: string;
          apiKey?: string;
          signal: AbortSignal;
        };
      }): Promise<PresetConnectionTestResult> => {
        const { provider, model, signal } = input;
        let apiKey = input.apiKey?.trim();

        // Fallback to global API key if not specified
        if (!apiKey) {
          const globalKeys = await getSetting<{ openRouter?: string; gemini?: string }>("api_keys");
          apiKey =
            provider === "gemini" ? globalKeys?.gemini?.trim() : globalKeys?.openRouter?.trim();
        }

        if (!apiKey) {
          throw new Error("No API key configured (neither preset override nor global key found)");
        }

        const start = performance.now();

        if (provider === "gemini") {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: "ping" }] }],
                generationConfig: { maxOutputTokens: 1 },
              }),
              signal,
            },
          );

          if (!response.ok) {
            let errorDetail = "";
            try {
              const errJson = await response.json();
              errorDetail = errJson.error?.message || response.statusText;
            } catch {
              errorDetail = response.statusText;
            }
            throw new Error(`Gemini API error: ${response.status} - ${errorDetail}`);
          }
          await response.json();
        } else {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1,
            }),
            signal,
          });

          if (!response.ok) {
            let errorDetail = "";
            try {
              const errJson = await response.json();
              errorDetail = errJson.error?.message || response.statusText;
            } catch {
              errorDetail = response.statusText;
            }
            throw new Error(`OpenRouter API error: ${response.status} - ${errorDetail}`);
          }
          await response.json();
        }

        const latency = Math.round(performance.now() - start);
        return { provider, model, latency };
      },
    ),
  },
  actions: {
    abortActiveRequest: ({ context }) => {
      if (context.abortController) {
        context.abortController.abort();
      }
    },
    updateParamsAndController: assign({
      provider: ({ event }) => (event.type === "TEST_CONNECTION" ? event.provider : "gemini"),
      model: ({ event }) => (event.type === "TEST_CONNECTION" ? event.model : ""),
      apiKey: ({ event }) => (event.type === "TEST_CONNECTION" ? event.apiKey : ""),
      abortController: () => new AbortController(),
      errorMessage: null,
      latency: null,
    }),
    clearController: assign({
      abortController: null,
    }),
  },
}).createMachine({
  id: "presetConnectionTester",
  initial: "idle",
  context: {
    provider: "gemini",
    model: "",
    apiKey: "",
    latency: null,
    errorMessage: null,
    abortController: null,
  },
  states: {
    idle: {
      on: {
        TEST_CONNECTION: {
          target: "testing",
          actions: ["abortActiveRequest", "updateParamsAndController"],
        },
      },
    },
    testing: {
      id: "testingState",
      invoke: {
        id: "testingActor",
        src: "runTest",
        input: ({ context }) => ({
          provider: context.provider,
          model: context.model,
          apiKey: context.apiKey,
          signal: context.abortController!.signal,
        }),
        onDone: {
          target: "success",
          actions: assign({
            latency: ({ event }) => (event.output as PresetConnectionTestResult).latency,
            errorMessage: null,
            abortController: null,
          }),
        },
        onError: {
          target: "failure",
          actions: assign({
            errorMessage: ({ event }) => (event.error as Error).message || "Connection test failed",
            latency: null,
            abortController: null,
          }),
        },
      },
      on: {
        TEST_CONNECTION: {
          target: "testing",
          actions: ["abortActiveRequest", "updateParamsAndController"],
          reenter: true,
        },
        CANCEL_TEST: {
          target: "idle",
          actions: ["abortActiveRequest", "clearController"],
        },
      },
    },
    success: {
      on: {
        TEST_CONNECTION: {
          target: "testing",
          actions: ["abortActiveRequest", "updateParamsAndController"],
        },
      },
    },
    failure: {
      on: {
        TEST_CONNECTION: {
          target: "testing",
          actions: ["abortActiveRequest", "updateParamsAndController"],
        },
      },
    },
  },
});
