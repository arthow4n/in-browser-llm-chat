import { setup, assign, fromPromise } from "xstate";

export interface ApiKeyValidatorContext {
  provider: "openrouter" | "gemini";
  apiKey: string;
  abortController: AbortController | null;
  errorMessage: string | null;
}

export type ApiKeyValidatorEvent =
  | { type: "START_VALIDATION"; apiKey: string }
  | { type: "VALIDATION_SUCCESS" }
  | { type: "VALIDATION_FAILURE"; error: string }
  | { type: "INPUT_CHANGED" };

export interface ApiKeyValidatorInput {
  provider: "openrouter" | "gemini";
}

export const apiKeyValidatorMachine = setup({
  types: {} as {
    context: ApiKeyValidatorContext;
    events: ApiKeyValidatorEvent;
    input: ApiKeyValidatorInput;
  },
  actors: {
    validateKey: fromPromise(
      async ({
        input,
      }: {
        input: { provider: "openrouter" | "gemini"; apiKey: string; signal: AbortSignal };
      }) => {
        const { provider, apiKey, signal } = input;
        if (!apiKey.trim()) {
          throw new Error("API key is empty");
        }

        if (provider === "gemini") {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
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
              model: "google/gemini-2.5-flash", // Just a valid model name
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1,
            }),
            signal,
          });
          if (!response.ok) {
            throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
          }
          await response.json();
        }
        return true;
      },
    ),
  },
  actions: {
    abortActiveRequest: ({ context }) => {
      if (context.abortController) {
        context.abortController.abort();
      }
    },
    updateKeyAndController: assign({
      apiKey: ({ event }) => (event.type === "START_VALIDATION" ? event.apiKey : ""),
      abortController: () => new AbortController(),
      errorMessage: null,
    }),
    setSuccess: assign({
      errorMessage: null,
    }),
    setError: assign({
      errorMessage: ({ event }) =>
        event.type === "VALIDATION_FAILURE" ? event.error : "Unknown error",
    }),
    clearController: assign({
      abortController: null,
    }),
  },
}).createMachine({
  id: "apiKeyValidator",
  initial: "idle",
  context: ({ input }) => ({
    provider: input.provider,
    apiKey: "",
    abortController: null,
    errorMessage: null,
  }),
  states: {
    idle: {
      on: {
        START_VALIDATION: {
          target: "validating",
          actions: ["abortActiveRequest", "updateKeyAndController"],
        },
      },
    },
    validating: {
      invoke: {
        src: "validateKey",
        input: ({ context }) => ({
          provider: context.provider,
          apiKey: context.apiKey,
          signal: context.abortController!.signal,
        }),
        onDone: {
          target: "valid",
          actions: ["setSuccess", "clearController"],
        },
        onError: {
          target: "invalid",
          actions: [
            assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Validation failed",
            }),
            "clearController",
          ],
        },
      },
      on: {
        START_VALIDATION: {
          target: "validating",
          actions: ["abortActiveRequest", "updateKeyAndController"],
          reenter: true,
        },
        INPUT_CHANGED: {
          target: "idle",
          actions: ["abortActiveRequest", "clearController"],
        },
      },
    },
    valid: {
      on: {
        START_VALIDATION: {
          target: "validating",
          actions: ["abortActiveRequest", "updateKeyAndController"],
        },
        INPUT_CHANGED: {
          target: "idle",
        },
      },
    },
    invalid: {
      on: {
        START_VALIDATION: {
          target: "validating",
          actions: ["abortActiveRequest", "updateKeyAndController"],
        },
        INPUT_CHANGED: {
          target: "idle",
        },
      },
    },
  },
});
