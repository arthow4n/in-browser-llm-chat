import { createMachine, assign } from 'xstate';
import { getDB, getWorkflow, getThread } from '../../db/db';
import type { WorkflowStore } from '../../db/db';

export const workflowSyncMachine = createMachine({
  id: 'workflowSync',
  initial: 'idle',
  context: {
    threadId: '',
    isDestructive: false,
    diffDetails: null,
    errorMessage: null,
  },
  states: {
    idle: {
      on: {
        START_SYNC: {
          target: 'analyzing',
          actions: 'clearError',
        },
      },
    },
    analyzing: {
      on: {
        ANALYSIS_COMPLETE: {
          target: 'prompting',
          actions: assign({
            isDestructive: ({ event }) => (event as any).isDestructive,
            diffDetails: ({ event }) => (event as any).diffDetails,
          }),
        },
        ANALYSIS_FAILURE: {
          target: 'failure',
          actions: assign({
            errorMessage: ({ event }) => (event as any).error,
          }),
        },
      },
    },
    prompting: {
      initial: 'softSync',
      states: {
        softSync: {
          on: {
            CONFIRM_SYNC: { target: 'syncing' },
            CANCEL_SYNC: { target: '#workflowSync.idle' },
          },
        },
        hardSync: {
          on: {
            CONFIRM_SYNC: { target: 'syncing' },
            CANCEL_SYNC: { target: '#workflowSync.idle' },
          },
        },
      },
    },
    syncing: {
      on: {
        SYNC_SUCCESS: {
          target: 'success',
        },
        SYNC_FAILURE: {
          target: 'failure',
          actions: assign({
            errorMessage: ({ event }) => (event as any).error,
          }),
        },
      },
    },
    success: {
      on: {
        DISMISS: { target: 'idle' },
      },
    },
    failure: {
      on: {
        DISMISS: { target: 'idle' },
      },
    },
  },
}, {
  actions: {
    clearError: assign({
      errorMessage: null,
    }),
  },
});

export async function analyzeWorkflowSync(threadId: string) {
  const thread = await getThread(threadId);
  if (!thread) throw new Error('Thread not found');

  const masterWorkflow = await getWorkflow(thread.workflowId);
  if (!masterWorkflow) throw new Error('Master workflow not found');

  const snapshot = thread.workflowSnapshot as WorkflowStore;

  const nodesMatch =
    JSON.stringify(snapshot.nodes.map(n => n.id).sort()) ===
    JSON.stringify(masterWorkflow.nodes.map(n => n.id).sort());

  const edgesMatch =
    JSON.stringify(snapshot.edges.map(e => ({ from: e.from, to: e.to })).sort()) ===
    JSON.stringify(masterWorkflow.edges.map(e => ({ from: e.from, to: e.to })).sort());

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
  if (!thread) throw new Error('Thread not found');

  const masterWorkflow = await getWorkflow(thread.workflowId);
  if (!masterWorkflow) throw new Error('Master workflow not found');

  const tx = db.transaction(['threads', 'messages', 'checkpoints', 'checkpoint_writes'], 'readwrite');

  thread.workflowSnapshot = masterWorkflow;

  if (isDestructive) {
    const msgStore = tx.objectStore('messages');
    const msgIdx = msgStore.index('by-thread-sequence');
    let msgCursor = await msgIdx.openCursor(IDBKeyRange.bound([threadId, 0], [threadId, Number.MAX_SAFE_INTEGER]));
    while (msgCursor) {
      await msgCursor.delete();
      msgCursor = await msgCursor.continue();
    }

    const cpStore = tx.objectStore('checkpoints');
    const cpIdx = cpStore.index('by-thread');
    let cpCursor = await cpIdx.openCursor(IDBKeyRange.only(threadId));
    while (cpCursor) {
      await cpCursor.delete();
      cpCursor = await cpCursor.continue();
    }

    const cpwStore = tx.objectStore('checkpoint_writes');
    const cpwIdx = cpwStore.index('by-thread');
    let cpwCursor = await cpwIdx.openCursor(IDBKeyRange.only(threadId));
    while (cpwCursor) {
      await cpwCursor.delete();
      cpwCursor = await cpwCursor.continue();
    }

    thread.latestCheckpointId = null;
    thread.latestCheckpointNs = null;
    thread.tokenStats = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  await tx.objectStore('threads').put(thread);
  await tx.done;
}
