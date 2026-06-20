import { createMachine, assign } from "xstate";

export interface ChatInputContext {
  inputText: string;
  selectedRole: "user" | "assistant" | "system";
}

export type ChatInputEvent =
  | { type: "ENABLE" }
  | { type: "DISABLE" }
  | { type: "INPUT_CHANGED"; text: string }
  | { type: "ROLE_CHANGED"; role: "user" | "assistant" | "system" }
  | { type: "SUBMIT" }
  | { type: "SUBMIT_SUCCESS" }
  | { type: "SUBMIT_FAILURE" };

export const chatInputMachine = createMachine({
  types: {} as {
    context: ChatInputContext;
    events: ChatInputEvent;
  },
  id: "chatInput",
  initial: "disabled",
  context: {
    inputText: "",
    selectedRole: "user",
  },
  states: {
    disabled: {
      on: {
        ENABLE: {
          target: "ready",
        },
        INPUT_CHANGED: {
          actions: assign({
            inputText: ({ event }) => event.text,
          }),
        },
        ROLE_CHANGED: {
          actions: assign({
            selectedRole: ({ event }) => event.role,
          }),
        },
      },
    },
    ready: {
      initial: "empty",
      on: {
        DISABLE: {
          target: "disabled",
        },
        ROLE_CHANGED: {
          actions: assign({
            selectedRole: ({ event }) => event.role,
          }),
        },
      },
      states: {
        empty: {
          always: {
            guard: ({ context }) => context.inputText.trim().length > 0,
            target: "hasText",
          },
          on: {
            INPUT_CHANGED: {
              actions: assign({
                inputText: ({ event }) => event.text,
              }),
              target: "hasText",
            },
          },
        },
        hasText: {
          always: {
            guard: ({ context }) => context.inputText.trim().length === 0,
            target: "empty",
          },
          on: {
            INPUT_CHANGED: {
              actions: assign({
                inputText: ({ event }) => event.text,
              }),
              target: "empty",
            },
            SUBMIT: {
              target: "#chatInput.submitting",
            },
          },
        },
      },
    },
    submitting: {
      on: {
        SUBMIT_SUCCESS: {
          actions: assign({
            inputText: () => "",
          }),
          target: "disabled",
        },
        SUBMIT_FAILURE: {
          target: "ready.hasText",
        },
        DISABLE: {
          target: "disabled",
        },
      },
    },
  },
});
