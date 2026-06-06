import { setup, assign } from "xstate";
import { type CompiledPayloadMessage } from "../../workflow/types";

export interface ApiPayloadPreviewContext {
  activeAgentId: string | null;
  payload: CompiledPayloadMessage[] | null;
  errorMessage: string | null;
}

export type ApiPayloadPreviewEvent =
  | { type: "LOAD_PAYLOAD"; payload: CompiledPayloadMessage[] }
  | { type: "SELECT_AGENT"; agentId: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLOSE" }
  | { type: "DISMISS_ERROR" };

export const apiPayloadPreviewMachine = setup({
  types: {} as {
    context: ApiPayloadPreviewContext;
    events: ApiPayloadPreviewEvent;
  },
}).createMachine({
  id: "apiPayloadPreview",
  initial: "idle",
  context: {
    activeAgentId: null,
    payload: null,
    errorMessage: null,
  },
  states: {
    idle: {
      on: {
        LOAD_PAYLOAD: {
          target: "viewing",
          actions: assign({
            payload: ({ event }) => event.payload,
            errorMessage: null,
          }),
        },
        SET_ERROR: {
          actions: assign({
            errorMessage: ({ event }) => event.error,
          }),
        },
      },
    },
    viewing: {
      on: {
        SELECT_AGENT: {
          actions: assign({
            activeAgentId: ({ event }) => event.agentId,
          }),
        },
        LOAD_PAYLOAD: {
          actions: assign({
            payload: ({ event }) => event.payload,
            errorMessage: null,
          }),
        },
        SET_ERROR: {
          actions: assign({
            errorMessage: ({ event }) => event.error,
          }),
        },
      },
    },
  },
});
