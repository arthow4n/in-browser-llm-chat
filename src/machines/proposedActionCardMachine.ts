import { createMachine, assign, assertEvent } from "xstate";

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
          actions: assign(({ event }) => {
            assertEvent(event, "START_APPROVAL");
            return {
              toolCallId: event.payload.toolCallId,
              actionType: event.payload.actionType,
              payload: event.payload.payload,
              originalPayload: event.payload.originalPayload,
            };
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
