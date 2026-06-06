import { createMachine, assign } from "xstate";
import { getDB, getThread } from "../../db/db";

type CheckpointCompactionEvent =
  | { type: "START_COMPACT" }
  | { type: "CONFIRM_COMPACT" }
  | { type: "CANCEL_COMPACT" }
  | { type: "COMPACT_SUCCESS" }
  | { type: "COMPACT_FAILURE"; error: string }
  | { type: "DISMISS" };

export const checkpointCompactionMachine = createMachine(
  {
    types: {
      events: {} as CheckpointCompactionEvent,
    },
    id: "checkpointCompaction",
    initial: "idle",
    context: {
      threadId: "",
      errorMessage: null as string | null,
    },
    states: {
      idle: {
        on: {
          START_COMPACT: {
            target: "confirming",
            actions: "clearError",
          },
        },
      },
      confirming: {
        on: {
          CONFIRM_COMPACT: {
            target: "compacting",
          },
          CANCEL_COMPACT: {
            target: "idle",
          },
        },
      },
      compacting: {
        on: {
          COMPACT_SUCCESS: {
            target: "success",
          },
          COMPACT_FAILURE: {
            target: "failure",
            actions: assign(({ event }) => {
              if (event.type !== "COMPACT_FAILURE") return {};
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

export async function performCheckpointCompaction(threadId: string) {
  const db = await getDB();
  const thread = await getThread(threadId);
  if (!thread) throw new Error("Thread not found");

  const tx = db.transaction(
    ["threads", "messages", "checkpoints", "checkpoint_writes"],
    "readwrite",
  );

  const latestId = thread.latestCheckpointId;
  const latestNs = thread.latestCheckpointNs;

  const checkpointsStore = tx.objectStore("checkpoints");
  const checkpoints = await checkpointsStore.index("by-thread").getAll(threadId);

  for (const cp of checkpoints) {
    if (cp.checkpointId !== latestId || cp.checkpointNs !== latestNs) {
      await checkpointsStore.delete([threadId, cp.checkpointNs, cp.checkpointId]);
    }
  }

  const writesStore = tx.objectStore("checkpoint_writes");
  const writes = await writesStore.index("by-thread").getAll(threadId);
  for (const w of writes) {
    if (w.checkpointId !== latestId || w.checkpointNs !== latestNs) {
      await writesStore.delete([threadId, w.checkpointNs, w.checkpointId, w.taskId, w.idx]);
    }
  }

  const messagesStore = tx.objectStore("messages");
  const messages = await messagesStore.index("by-thread-sequence").getAll([threadId, 0]);
  for (const m of messages) {
    if (m.checkpointId !== latestId || m.checkpointNs !== latestNs) {
      const updatedMsg = { ...m, checkpointId: null, checkpointNs: null };
      await messagesStore.put(updatedMsg);
    }
  }

  await tx.done;
}
