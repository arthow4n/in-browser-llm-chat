import { createMachine, assign, fromPromise } from "xstate";
import {
  getThread,
  saveThread,
  deleteThreadMessages,
  deleteThreadCheckpoints,
  deleteThreadCheckpointWrites,
} from "../db/db-operations";
import { getWorkflow } from "../workflows/workflows-service";
import type { Workflow } from "../db/db-schema";

export interface WorkflowSyncingContext {
  threadId: string;
  isDestructive: boolean;
  diffDetails: { reason: string } | null;
  errorMessage: string | null;
}

export type WorkflowSyncingEvent =
  | { type: "START_SYNC" }
  | { type: "CONFIRM_SYNC" }
  | { type: "CANCEL_SYNC" }
  | { type: "DISMISS" };

export function diffWorkflows(
  snapshot: Workflow,
  master: Workflow,
): { isDestructive: boolean; diffDetails: { reason: string } | null } {
  // Compare node IDs
  const snapNodeIds = snapshot.nodes.map((n) => n.id).sort();
  const masterNodeIds = master.nodes.map((n) => n.id).sort();

  if (
    snapNodeIds.length !== masterNodeIds.length ||
    !snapNodeIds.every((id, i) => id === masterNodeIds[i])
  ) {
    return {
      isDestructive: true,
      diffDetails: { reason: "Nodes list changed (added, removed, or renamed)." },
    };
  }

  // Compare node types
  for (const node of snapshot.nodes) {
    const masterNode = master.nodes.find((n) => n.id === node.id);
    if (!masterNode || masterNode.type !== node.type) {
      return {
        isDestructive: true,
        diffDetails: { reason: `Node type for '${node.id}' changed.` },
      };
    }
  }

  // Compare edges (transitions structure)
  const snapEdges = snapshot.edges
    .map((e) => `${e.source}->${e.target}:${e.condition || ""}`)
    .sort();
  const masterEdges = master.edges
    .map((e) => `${e.source}->${e.target}:${e.condition || ""}`)
    .sort();

  if (
    snapEdges.length !== masterEdges.length ||
    !snapEdges.every((edge, i) => edge === masterEdges[i])
  ) {
    return {
      isDestructive: true,
      diffDetails: { reason: "Edges/transitions structure changed." },
    };
  }

  return {
    isDestructive: false,
    diffDetails: { reason: "Only configurations, prompts, or presets changed." },
  };
}

export const workflowSyncingMachine = createMachine(
  {
    types: {} as {
      context: WorkflowSyncingContext;
      events: WorkflowSyncingEvent;
    },
    id: "workflowSyncing",
    initial: "idle",
    context: ({ input }) => ({
      threadId: (input as { threadId?: string })?.threadId || "",
      isDestructive: false,
      diffDetails: null,
      errorMessage: null,
    }),
    states: {
      idle: {
        on: {
          START_SYNC: {
            target: "analyzing",
          },
        },
      },
      analyzing: {
        on: {
          CANCEL_SYNC: {
            target: "idle",
          },
        },
        invoke: {
          src: "analyzeWorkflowActor",
          input: ({ context }) => ({ threadId: context.threadId }),
          onDone: [
            {
              guard: ({ event }) => event.output.isDestructive,
              target: "promptingHardSync",
              actions: assign({
                isDestructive: () => true,
                diffDetails: ({ event }) => event.output.diffDetails,
                errorMessage: () => null,
              }),
            },
            {
              target: "promptingSoftSync",
              actions: assign({
                isDestructive: () => false,
                diffDetails: ({ event }) => event.output.diffDetails,
                errorMessage: () => null,
              }),
            },
          ],
          onError: {
            target: "failure",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Analysis failed",
            }),
          },
        },
      },
      promptingSoftSync: {
        on: {
          CONFIRM_SYNC: "syncing",
          CANCEL_SYNC: "idle",
        },
      },
      promptingHardSync: {
        on: {
          CONFIRM_SYNC: "syncing",
          CANCEL_SYNC: "idle",
        },
      },
      syncing: {
        invoke: {
          src: "performSyncActor",
          input: ({ context }) => ({
            threadId: context.threadId,
            isDestructive: context.isDestructive,
          }),
          onDone: {
            target: "success",
          },
          onError: {
            target: "failure",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Sync failed",
            }),
          },
        },
      },
      success: {
        after: {
          3000: {
            target: "idle",
          },
        },
        on: {
          DISMISS: {
            target: "idle",
          },
        },
      },
      failure: {
        on: {
          DISMISS: {
            target: "idle",
          },
        },
      },
    },
  },
  {
    actors: {
      analyzeWorkflowActor: fromPromise(async ({ input }: { input: { threadId: string } }) => {
        const thread = await getThread(input.threadId);
        if (!thread) {
          throw new Error(`Thread with ID ${input.threadId} not found`);
        }
        if (!thread.workflowSnapshot) {
          throw new Error("Thread does not have a workflow snapshot to sync");
        }
        const masterWorkflow = await getWorkflow(thread.workflowId);
        if (!masterWorkflow) {
          throw new Error(`Master workflow with ID ${thread.workflowId} not found`);
        }
        return diffWorkflows(thread.workflowSnapshot, masterWorkflow);
      }),
      performSyncActor: fromPromise(
        async ({ input }: { input: { threadId: string; isDestructive: boolean } }) => {
          const thread = await getThread(input.threadId);
          if (!thread) {
            throw new Error(`Thread with ID ${input.threadId} not found`);
          }
          const masterWorkflow = await getWorkflow(thread.workflowId);
          if (!masterWorkflow) {
            throw new Error(`Master workflow with ID ${thread.workflowId} not found`);
          }

          thread.workflowSnapshot = structuredClone(masterWorkflow);
          thread.updatedAt = Date.now();

          if (input.isDestructive) {
            // Delete messages, checkpoints, and checkpoint writes
            await deleteThreadCheckpointWrites(input.threadId);
            await deleteThreadCheckpoints(input.threadId);
            await deleteThreadMessages(input.threadId);

            thread.latestCheckpointId = null;
            thread.latestCheckpointNs = null;
            thread.tokenStats = null;
            thread.status = "inactive";
            thread.activeInterrupt = null;
            thread.errorMessage = null;
          }

          await saveThread(thread);
        },
      ),
    },
  },
);
