import { createMachine, assign, fromPromise } from "xstate";
import { getThread, compactThreadCheckpoints } from "../db/db-operations";

export interface CheckpointCompactionContext {
  threadId: string;
  errorMessage: string | null;
}

export type CheckpointCompactionEvent =
  | { type: "START_COMPACT" }
  | { type: "CONFIRM_COMPACT" }
  | { type: "CANCEL_COMPACT" }
  | { type: "DISMISS" };

export const checkpointCompactionMachine = createMachine(
  {
    types: {} as {
      context: CheckpointCompactionContext;
      events: CheckpointCompactionEvent;
    },
    id: "checkpointCompaction",
    initial: "idle",
    context: ({ input }) => ({
      threadId: (input as { threadId?: string })?.threadId || "",
      errorMessage: null,
    }),
    states: {
      idle: {
        on: {
          START_COMPACT: {
            target: "confirming",
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
        invoke: {
          src: "compactActor",
          input: ({ context }) => ({
            threadId: context.threadId,
          }),
          onDone: {
            target: "success",
          },
          onError: {
            target: "failure",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Compaction failed",
            }),
          },
        },
      },
      success: {
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
            actions: assign({ errorMessage: () => null }),
          },
        },
      },
    },
  },
  {
    actors: {
      compactActor: fromPromise(async ({ input }: { input: { threadId: string } }) => {
        const thread = await getThread(input.threadId);
        if (!thread) {
          throw new Error(`Thread with ID ${input.threadId} not found`);
        }
        await compactThreadCheckpoints(input.threadId, thread.latestCheckpointId);
      }),
    },
  },
);
