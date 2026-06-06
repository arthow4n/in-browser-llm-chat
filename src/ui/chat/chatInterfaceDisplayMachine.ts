import { setup, assign } from "xstate";
import { type CompiledPayloadMessage } from "../../workflow/compiler";

export const chatInterfaceDisplayMachine = setup({
  types: {
    context: {} as {
      showSettings: boolean;
      showPayloadPreview: boolean;
      previewAgentId: string | null;
      previewPayload: CompiledPayloadMessage[] | null;
    },
    events: {} as
      | { type: "OPEN_SETTINGS" }
      | { type: "CLOSE_SETTINGS" }
      | { type: "OPEN_PAYLOAD_PREVIEW"; initialAgentId?: string | null }
      | { type: "CLOSE_PAYLOAD_PREVIEW" }
      | { type: "SET_PREVIEW_AGENT_ID"; agentId: string | null }
      | { type: "SET_PREVIEW_PAYLOAD"; payload: CompiledPayloadMessage[] | null },
  },
  actions: {
    openSettings: assign({ showSettings: true }),
    closeSettings: assign({ showSettings: false }),
    openPayloadPreview: assign({
      showPayloadPreview: true,
      previewAgentId: ({ event, context }) =>
        event.type === "OPEN_PAYLOAD_PREVIEW" && event.initialAgentId !== undefined
          ? event.initialAgentId
          : context.previewAgentId,
    }),
    closePayloadPreview: assign({ showPayloadPreview: false }),
    setPreviewAgentId: assign({
      previewAgentId: ({ event, context }) =>
        event.type === "SET_PREVIEW_AGENT_ID" ? event.agentId : context.previewAgentId,
    }),
    setPreviewPayload: assign({
      previewPayload: ({ event, context }) =>
        event.type === "SET_PREVIEW_PAYLOAD" ? event.payload : context.previewPayload,
    }),
  },
}).createMachine({
  id: "chatInterfaceDisplay",
  initial: "active",
  context: {
    showSettings: false,
    showPayloadPreview: false,
    previewAgentId: null,
    previewPayload: null,
  },
  states: {
    active: {
      on: {
        OPEN_SETTINGS: {
          actions: "openSettings",
        },
        CLOSE_SETTINGS: {
          actions: "closeSettings",
        },
        OPEN_PAYLOAD_PREVIEW: {
          actions: "openPayloadPreview",
        },
        CLOSE_PAYLOAD_PREVIEW: {
          actions: "closePayloadPreview",
        },
        SET_PREVIEW_AGENT_ID: {
          actions: "setPreviewAgentId",
        },
        SET_PREVIEW_PAYLOAD: {
          actions: "setPreviewPayload",
        },
      },
    },
  },
});
