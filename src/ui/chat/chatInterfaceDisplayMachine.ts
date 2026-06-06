import { setup, assign } from "xstate";
import { type CompiledPayloadMessage } from "../../workflow/types";
import { type ThreadStore, type MessageStore, type PresetStore } from "../../db/db";
import { type WorkflowNode } from "../../workflow/schemas";

export const chatInterfaceDisplayMachine = setup({
  types: {
    context: {} as {
      showSettings: boolean;
      showPayloadPreview: boolean;
      previewAgentId: string | null;
      previewPayload: CompiledPayloadMessage[] | null;
      thread: ThreadStore | undefined | null;
      messages: MessageStore[];
      draftAnswers: Record<string, unknown>;
      presets: PresetStore[];
      nodes: WorkflowNode[];
      globalInjectedMessages: Array<{ content: string; depth: number }>;
    },
    events: {} as
      | { type: "OPEN_SETTINGS" }
      | { type: "CLOSE_SETTINGS" }
      | { type: "OPEN_PAYLOAD_PREVIEW"; initialAgentId?: string | null }
      | { type: "CLOSE_PAYLOAD_PREVIEW" }
      | { type: "SET_PREVIEW_AGENT_ID"; agentId: string | null }
      | { type: "SET_PREVIEW_PAYLOAD"; payload: CompiledPayloadMessage[] | null }
      | { type: "SET_THREAD"; thread: ThreadStore | undefined | null }
      | { type: "SET_MESSAGES"; messages: MessageStore[] }
      | { type: "SET_DRAFT_ANSWERS"; draftAnswers: Record<string, unknown> }
      | { type: "SET_PRESETS"; presets: PresetStore[] }
      | { type: "SET_NODES"; nodes: WorkflowNode[] }
      | {
          type: "SET_GLOBAL_INJECTED_MESSAGES";
          messages: Array<{ content: string; depth: number }>;
        },
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
    setThread: assign({
      thread: ({ event, context }) => (event.type === "SET_THREAD" ? event.thread : context.thread),
    }),
    setMessages: assign({
      messages: ({ event, context }) =>
        event.type === "SET_MESSAGES" ? event.messages : context.messages,
    }),
    setDraftAnswers: assign({
      draftAnswers: ({ event, context }) =>
        event.type === "SET_DRAFT_ANSWERS" ? event.draftAnswers : context.draftAnswers,
    }),
    setPresets: assign({
      presets: ({ event, context }) =>
        event.type === "SET_PRESETS" ? event.presets : context.presets,
    }),
    setNodes: assign({
      nodes: ({ event, context }) => (event.type === "SET_NODES" ? event.nodes : context.nodes),
    }),
    setGlobalInjectedMessages: assign({
      globalInjectedMessages: ({ event, context }) =>
        event.type === "SET_GLOBAL_INJECTED_MESSAGES"
          ? event.messages
          : context.globalInjectedMessages,
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
    thread: null,
    messages: [],
    draftAnswers: {},
    presets: [],
    nodes: [],
    globalInjectedMessages: [],
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
        SET_THREAD: {
          actions: "setThread",
        },
        SET_MESSAGES: {
          actions: "setMessages",
        },
        SET_DRAFT_ANSWERS: {
          actions: "setDraftAnswers",
        },
        SET_PRESETS: {
          actions: "setPresets",
        },
        SET_NODES: {
          actions: "setNodes",
        },
        SET_GLOBAL_INJECTED_MESSAGES: {
          actions: "setGlobalInjectedMessages",
        },
      },
    },
  },
});
