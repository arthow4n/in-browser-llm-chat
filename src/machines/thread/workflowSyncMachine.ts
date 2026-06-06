import { createMachine, assign } from "xstate";
import { getDB, getWorkflow, getThread } from "../../db/db";
import type { WorkflowStore } from "../../db/db";

type WorkflowSyncEvent =
  | { type: "START_SYNC" }
  | {
      type: "ANALYSIS_COMPLETE";
      isDestructive: boolean;
      diffDetails: { nodesMatch: boolean; edgesMatch: boolean };
    }
  | { type: "ANALYSIS_FAILURE"; error: string }
  | { type: "CONFIRM_SYNC" }
  | { type: "CANCEL_SYNC" }
  | { type: "SYNC_SUCCESS" }
  | { type: "SYNC_FAILURE"; error: string }
  | { type: "DISMISS" };

export const workflowSyncMachine = createMachine(
  {
    types: {
      events: {} as WorkflowSyncEvent,
    },
    id: "workflowSync",
    initial: "idle",
    context: {
      threadId: "",
      isDestructive: false,
      diffDetails: null as { nodesMatch: boolean; edgesMatch: boolean } | null,
      errorMessage: null as string | null,
    },
    states: {
      idle: {
        on: {
          START_SYNC: {
            target: "analyzing",
            actions: "clearError",
          },
        },
      },
      analyzing: {
        on: {
          ANALYSIS_COMPLETE: {
            target: "prompting",
            actions: assign(({ event }) => {
              if (event.type !== "ANALYSIS_COMPLETE") return {};
              return {
                isDestructive: event.isDestructive,
                diffDetails: event.diffDetails,
              };
            }),
          },
          ANALYSIS_FAILURE: {
            target: "failure",
            actions: assign(({ event }) => {
              if (event.type !== "ANALYSIS_FAILURE") return {};
              return {
                errorMessage: event.error,
              };
            }),
          },
        },
      },
      prompting: {
        initial: "softSync",
        states: {
          softSync: {
            on: {
              CONFIRM_SYNC: { target: "#workflowSync.syncing" },
              CANCEL_SYNC: { target: "#workflowSync.idle" },
            },
          },
          hardSync: {
            on: {
              CONFIRM_SYNC: { target: "#workflowSync.syncing" },
              CANCEL_SYNC: { target: "#workflowSync.idle" },
            },
          },
        },
      },
      syncing: {
        on: {
          SYNC_SUCCESS: {
            target: "success",
          },
          SYNC_FAILURE: {
            target: "failure",
            actions: assign(({ event }) => {
              if (event.type !== "SYNC_FAILURE") return {};
              return {
                errorMessage: event.error,
              };
            }),
          },
        },
      },
      success: {
        on: {
          DISMISS: { target: "idle" },
        },
      },
      failure: {
        on: {
          DISMISS: { target: "idle" },
        },
      },
    },
  },
  {
    actions: {
      clearError: assign({
        errorMessage: null,
      }),
    },
  },
);

export async function analyzeWorkflowSync(threadId: string) {
  const thread = await getThread(threadId);
  if (!thread) throw new Error("Thread not found");

  const masterWorkflow = await getWorkflow(thread.workflowId);
  if (!masterWorkflow) throw new Error("Master workflow not found");

  const snapshot = thread.workflowSnapshot as WorkflowStore;

  const nodesMatch =
    JSON.stringify(snapshot.nodes.map((n) => n.id).sort((a, b) => a.localeCompare(b))) ===
    JSON.stringify(masterWorkflow.nodes.map((n) => n.id).sort((a, b) => a.localeCompare(b)));

  const edgesMatch =
    JSON.stringify(snapshot.edges.map((e) => `${e.from}->${e.to}`).sort((a, b) => a.localeCompare(b))) ===
    JSON.stringify(masterWorkflow.edges.map((e) => `${e.from}->${e.to}`).sort((a, b) => a.localeCompare(b)));

  const isDestructive = !nodesMatch || !edgesMatch;

  return {
    isDestructive,
    diffDetails: {
      nodesMatch,
      edgesMatch,
    },
  };
}

export async function performWorkflowSync(threadId: string, isDestructive: boolean) {
  const db = await getDB();
  const thread = await getThread(threadId);
  if (!thread) throw new Error("Thread not found");

  const masterWorkflow = await getWorkflow(thread.workflowId);
  if (!masterWorkflow) throw new Error("Master workflow not found");

  const tx = db.transaction(
    ["threads", "messages", "checkpoints", "checkpoint_writes"],
    "readwrite",
  );

  thread.workflowSnapshot = masterWorkflow;

  if (isDestructive) {
    const msgStore = tx.objectStore("messages");
    const msgIdx = msgStore.index("by-thread-sequence");
    let msgCursor = await msgIdx.openCursor(
      IDBKeyRange.bound([threadId, 0], [threadId, Number.MAX_SAFE_INTEGER]),
    );
    while (msgCursor) {
      await msgCursor.delete();
      msgCursor = await msgCursor.continue();
    }

    const cpStore = tx.objectStore("checkpoints");
    const cpIdx = cpStore.index("by-thread");
    let cpCursor = await cpIdx.openCursor(IDBKeyRange.only(threadId));
    while (cpCursor) {
      await cpCursor.delete();
      cpCursor = await cpCursor.continue();
    }

    const cpwStore = tx.objectStore("checkpoint_writes");
    const cpwIdx = cpwStore.index("by-thread");
    let cpwCursor = await cpwIdx.openCursor(IDBKeyRange.only(threadId));
    while (cpwCursor) {
      await cpwCursor.delete();
      cpwCursor = await cpwCursor.continue();
    }

    thread.latestCheckpointId = null;
    thread.latestCheckpointNs = null;
    thread.tokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  await tx.objectStore("threads").put(thread);
  await tx.done;
}
