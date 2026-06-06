import { createMachine, assign } from "xstate";

export interface ProposedActionContext {
  toolCallId: string;
  actionType: "create" | "update";
  payload: any;
  originalPayload?: any;
}

export type ProposedActionEvent =
  | {
      type: "START_APPROVAL";
      payload: {
        toolCallId: string;
        actionType: "create" | "update";
        payload: any;
        originalPayload?: any;
      };
    }
  | { type: "APPROVE" }
  | { type: "DENY" };

export const proposedActionCardMachine = createMachine({
  id: "proposedActionCard",
  types: {} as {
    context: ProposedActionContext;
    events: ProposedActionEvent;
  },
  initial: "idle",
  context: {
    toolCallId: "",
    actionType: "create",
    payload: null,
  },
  states: {
    idle: {
      on: {
        START_APPROVAL: {
          target: "awaitingApproval",
          actions: assign({
            toolCallId: ({ event }) =>
              (event as Extract<ProposedActionEvent, { type: "START_APPROVAL" }>).payload
                .toolCallId,
            actionType: ({ event }) =>
              (event as Extract<ProposedActionEvent, { type: "START_APPROVAL" }>).payload
                .actionType,
            payload: ({ event }) =>
              (event as Extract<ProposedActionEvent, { type: "START_APPROVAL" }>).payload.payload,
            originalPayload: ({ event }) =>
              (event as Extract<ProposedActionEvent, { type: "START_APPROVAL" }>).payload
                .originalPayload,
          }),
        },
      },
    },
    awaitingApproval: {
      on: {
        APPROVE: {
          target: "approved",
        },
        DENY: {
          target: "denied",
        },
      },
    },
    approved: {
      type: "final",
    },
    denied: {
      type: "final",
    },
  },
});
