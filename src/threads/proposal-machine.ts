import { createMachine, assign, fromPromise } from "xstate";
import { getDB } from "../db/db-connection";
import type { Message } from "../db/db-schema";

export interface ProposalContext {
  threadId: string;
  toolCallId: string;
  toolName: string;
  proposalData: Record<string, unknown>;
  errorMessage: string | null;
}

export type ProposalEvent =
  | {
      type: "LOAD_PROPOSAL";
      threadId: string;
      toolCallId: string;
      toolName: string;
      proposalData: Record<string, unknown>;
    }
  | { type: "APPROVE" }
  | { type: "REJECT"; reason: string }
  | { type: "SUBMIT_SUCCESS"; message: unknown }
  | { type: "SUBMIT_FAILURE"; error: string };

export async function submitProposalResponseTransaction(
  threadId: string,
  toolCallId: string,
  toolName: string,
  approved: boolean,
  reason?: string,
) {
  const db = await getDB();
  const tx = db.transaction(["threads", "messages"], "readwrite");
  const threadsStore = tx.objectStore("threads");
  const messagesStore = tx.objectStore("messages");

  const thread = await threadsStore.get(threadId);
  if (!thread) {
    throw new Error(`Thread ${threadId} not found`);
  }

  if (thread.activeInterrupt?.toolCallId === toolCallId) {
    thread.activeInterrupt = null;
  }
  thread.status = "executing";
  thread.updatedAt = Date.now();
  await threadsStore.put(thread);

  const index = messagesStore.index("threadId");
  const messages: Message[] = [];
  let cursor = await index.openCursor(IDBKeyRange.only(threadId));
  while (cursor) {
    messages.push(cursor.value);
    cursor = await cursor.continue();
  }
  const nextSeq = messages.length > 0 ? Math.max(...messages.map((m) => m.sequence)) + 1 : 1;

  const toolPayload = {
    approved,
    reason: reason || "",
  };

  const toolMsg = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tool-msg-${Date.now()}`,
    threadId,
    sequence: nextSeq,
    role: "tool" as const,
    name: toolName,
    content: JSON.stringify(toolPayload),
    type: "text" as const,
    createdAt: Date.now(),
    checkpointId: null,
    checkpointNs: null,
    toolCallId,
  };
  await messagesStore.put(toolMsg);

  await tx.done;
  return toolMsg;
}

export const proposalMachine = createMachine(
  {
    types: {} as {
      context: ProposalContext;
      events: ProposalEvent;
    },
    id: "proposal",
    initial: "idle",
    context: {
      threadId: "",
      toolCallId: "",
      toolName: "",
      proposalData: {},
      errorMessage: null,
    },
    states: {
      idle: {
        on: {
          LOAD_PROPOSAL: {
            target: "active",
            actions: assign({
              threadId: ({ event }) => event.threadId,
              toolCallId: ({ event }) => event.toolCallId,
              toolName: ({ event }) => event.toolName,
              proposalData: ({ event }) => event.proposalData,
              errorMessage: () => null,
            }),
          },
        },
      },
      active: {
        on: {
          APPROVE: {
            target: "submitting",
          },
          REJECT: {
            target: "rejecting",
            actions: assign({
              errorMessage: () => null,
            }),
          },
        },
      },
      submitting: {
        invoke: {
          src: "submitApprovalActor",
          input: ({ context }) => ({
            threadId: context.threadId,
            toolCallId: context.toolCallId,
            toolName: context.toolName,
          }),
          onDone: {
            target: "approved",
          },
          onError: {
            target: "active",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Approval submission failed",
            }),
          },
        },
      },
      rejecting: {
        invoke: {
          src: "submitRejectionActor",
          input: ({ context, event }) => ({
            threadId: context.threadId,
            toolCallId: context.toolCallId,
            toolName: context.toolName,
            reason: event.type === "REJECT" ? event.reason : "",
          }),
          onDone: {
            target: "rejected",
          },
          onError: {
            target: "active",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Rejection submission failed",
            }),
          },
        },
      },
      approved: {
        type: "final",
      },
      rejected: {
        type: "final",
      },
    },
  },
  {
    actors: {
      submitApprovalActor: fromPromise(
        async ({
          input,
        }: {
          input: {
            threadId: string;
            toolCallId: string;
            toolName: string;
          };
        }) => {
          const { threadId, toolCallId, toolName } = input;
          return submitProposalResponseTransaction(threadId, toolCallId, toolName, true);
        },
      ),
      submitRejectionActor: fromPromise(
        async ({
          input,
        }: {
          input: {
            threadId: string;
            toolCallId: string;
            toolName: string;
            reason: string;
          };
        }) => {
          const { threadId, toolCallId, toolName, reason } = input;
          return submitProposalResponseTransaction(threadId, toolCallId, toolName, false, reason);
        },
      ),
    },
  },
);
