import { createMachine, assign } from "xstate";

export interface ChatInputContext {
  text: string;
  role: "User" | "Assistant" | "System";
}

export type ChatInputEvent =
  | { type: "UPDATE_TEXT"; text: string }
  | { type: "UPDATE_ROLE"; role: "User" | "Assistant" | "System" }
  | { type: "SUBMIT" }
  | { type: "RESET" };

export const chatInputMachine = createMachine(
  {
    types: {} as { context: ChatInputContext; events: ChatInputEvent },
    id: "chatInput",
    initial: "idle",
    context: {
      text: "",
      role: "User",
    },
    states: {
      idle: {
        on: {
          UPDATE_TEXT: {
            actions: assign({
              text: ({ event }) => event.text,
            }),
          },
          UPDATE_ROLE: {
            actions: assign({
              role: ({ event }) => event.role,
            }),
          },
          SUBMIT: {
            target: "submitting",
          },
        },
      },
      submitting: {
        on: {
          RESET: {
            target: "idle",
            actions: assign({
              text: "",
            }),
          },
        },
      },
    },
  },
  {
    actions: {},
  },
);
