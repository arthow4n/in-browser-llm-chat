import { createMachine, assign } from "xstate";

export interface LoopControlContext {
  threadId: string;
  workflowType: "loop" | "sequential";
  currentRound: number;
  turnCount: number;
  tokenStats: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  isMobileOverlayOpen: boolean;
  isExpanded: boolean;
  errorMessage: string | null;
}

export type LoopControlEvent =
  | {
      type: "SHOW_PANEL";
      workflowType: "loop" | "sequential";
      initialStats?: Partial<LoopControlContext>;
    }
  | { type: "HIDE_PANEL" }
  | { type: "TOGGLE_MOBILE_OVERLAY" }
  | { type: "CLOSE_MOBILE_OVERLAY" }
  | { type: "TOGGLE_PANEL_EXPANDED" }
  | { type: "CLICK_PAUSE" }
  | { type: "CLICK_RESUME" }
  | { type: "CLICK_ABORT" }
  | { type: "CLICK_FORCE_CONSENSUS" }
  | { type: "CLICK_FORCE_SUMMARIZE" }
  | { type: "ACTION_SUCCESS" }
  | { type: "PARENT_STATE_CHANGED" }
  | { type: "ACTION_FAILURE"; error: string }
  | {
      type: "UPDATE_STATS";
      round: number;
      turns: number;
      tokenStats: LoopControlContext["tokenStats"];
    }
  | { type: "DISMISS_ERROR" };

export const loopControlMachine = createMachine({
  types: {} as {
    context: LoopControlContext;
    events: LoopControlEvent;
  },
  id: "loopControl",
  initial: "hidden",
  context: {
    threadId: "",
    workflowType: "sequential",
    currentRound: 1,
    turnCount: 0,
    tokenStats: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    isMobileOverlayOpen: false,
    isExpanded: true,
    errorMessage: null,
  },
  states: {
    hidden: {
      on: {
        SHOW_PANEL: {
          target: "visible",
          actions: assign(({ event }) => ({
            workflowType: event.workflowType,
            currentRound: event.initialStats?.currentRound ?? 1,
            turnCount: event.initialStats?.turnCount ?? 0,
            tokenStats: event.initialStats?.tokenStats ?? {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
            errorMessage: null,
          })),
        },
      },
    },
    visible: {
      type: "parallel",
      states: {
        mobileOverlay: {
          initial: "overlayClosed",
          states: {
            overlayClosed: {
              on: {
                TOGGLE_MOBILE_OVERLAY: {
                  target: "overlayOpened",
                  actions: assign({ isMobileOverlayOpen: () => true }),
                },
              },
            },
            overlayOpened: {
              on: {
                TOGGLE_MOBILE_OVERLAY: {
                  target: "overlayClosed",
                  actions: assign({ isMobileOverlayOpen: () => false }),
                },
                CLOSE_MOBILE_OVERLAY: {
                  target: "overlayClosed",
                  actions: assign({ isMobileOverlayOpen: () => false }),
                },
              },
            },
          },
        },
        action: {
          initial: "idle",
          states: {
            idle: {
              on: {
                CLICK_PAUSE: "requestingPause",
                CLICK_RESUME: "requestingResume",
                CLICK_ABORT: "requestingAbort",
                CLICK_FORCE_CONSENSUS: "requestingForceConsensus",
                CLICK_FORCE_SUMMARIZE: "requestingForceSummarize",
              },
            },
            requestingPause: {
              on: {
                ACTION_SUCCESS: "idle",
                PARENT_STATE_CHANGED: "idle",
                ACTION_FAILURE: {
                  target: "actionError",
                  actions: assign({ errorMessage: ({ event }) => event.error }),
                },
              },
            },
            requestingResume: {
              on: {
                ACTION_SUCCESS: "idle",
                PARENT_STATE_CHANGED: "idle",
                ACTION_FAILURE: {
                  target: "actionError",
                  actions: assign({ errorMessage: ({ event }) => event.error }),
                },
              },
            },
            requestingAbort: {
              on: {
                ACTION_SUCCESS: "idle",
                PARENT_STATE_CHANGED: "idle",
                ACTION_FAILURE: {
                  target: "actionError",
                  actions: assign({ errorMessage: ({ event }) => event.error }),
                },
              },
            },
            requestingForceConsensus: {
              on: {
                ACTION_SUCCESS: "idle",
                PARENT_STATE_CHANGED: "idle",
                ACTION_FAILURE: {
                  target: "actionError",
                  actions: assign({ errorMessage: ({ event }) => event.error }),
                },
              },
            },
            requestingForceSummarize: {
              on: {
                ACTION_SUCCESS: "idle",
                PARENT_STATE_CHANGED: "idle",
                ACTION_FAILURE: {
                  target: "actionError",
                  actions: assign({ errorMessage: ({ event }) => event.error }),
                },
              },
            },
            actionError: {
              on: {
                DISMISS_ERROR: {
                  target: "idle",
                  actions: assign({ errorMessage: () => null }),
                },
                CLICK_PAUSE: "requestingPause",
                CLICK_RESUME: "requestingResume",
                CLICK_ABORT: "requestingAbort",
                CLICK_FORCE_CONSENSUS: "requestingForceConsensus",
                CLICK_FORCE_SUMMARIZE: "requestingForceSummarize",
              },
            },
          },
        },
      },
      on: {
        HIDE_PANEL: {
          target: "hidden",
        },
        TOGGLE_PANEL_EXPANDED: {
          actions: assign({
            isExpanded: ({ context }) => !context.isExpanded,
          }),
        },
        UPDATE_STATS: {
          actions: assign(({ event }) => ({
            currentRound: event.round,
            turnCount: event.turns,
            tokenStats: event.tokenStats,
          })),
        },
      },
    },
  },
});
