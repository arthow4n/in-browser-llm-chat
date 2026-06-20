import { createMachine, assign } from "xstate";

export interface GraphRunnerContext {
  threadId: string;
  workflowSnapshot: unknown;
  presetConfig: {
    budgetPolicy?: {
      maxStepsWithoutUser: number;
      maxTokensPerRun: number | null;
    };
  } | null;
  abortController: AbortController | null;
  currentStepIndex: number;
  stepsInCurrentRun: number;
  tokensInCurrentRun: number;
  budgetOverride: { maxStepsWithoutUser: number; maxTokensPerRun: number | null } | null;
  errorMessage: string | null;
}

export type GraphRunnerEvent =
  | { type: "START" }
  | { type: "RECEIVE_TOKEN"; token: string; reasoning: string; delta: string }
  | {
      type: "STEP_COMPLETE";
      message: unknown;
      checkpointId: string;
      usage?: { promptTokens: number; completionTokens: number };
    }
  | { type: "PAUSE" }
  | { type: "STOP" }
  | { type: "TIMEOUT" }
  | { type: "INTERRUPT"; interruptDetails: unknown }
  | { type: "SUBMIT_TOOL_RESPONSE"; toolResponse: unknown }
  | { type: "RESUME_WITH_BUDGET_OVERRIDE"; stepOverride: number; tokenOverride: number | null }
  | { type: "COMPLETE" }
  | { type: "ERROR"; errorDetails: string };

export const graphRunnerMachine = createMachine(
  {
    types: {} as {
      context: GraphRunnerContext;
      events: GraphRunnerEvent;
    },
    id: "graphRunner",
    initial: "initializing",
    context: {
      threadId: "",
      workflowSnapshot: null,
      presetConfig: null,
      abortController: null,
      currentStepIndex: 0,
      stepsInCurrentRun: 0,
      tokensInCurrentRun: 0,
      budgetOverride: null,
      errorMessage: null,
    },
    states: {
      initializing: {
        on: {
          START: "running",
          ERROR: {
            target: "failed",
            actions: assign({
              errorMessage: ({ event }) => event.errorDetails,
            }),
          },
        },
      },
      running: {
        initial: "requesting",
        states: {
          requesting: {
            on: {
              RECEIVE_TOKEN: "streaming",
              STEP_COMPLETE: "#graphRunner.evaluatingStep",
              INTERRUPT: "#graphRunner.interrupted",
              ERROR: "#graphRunner.failed",
            },
          },
          streaming: {
            on: {
              RECEIVE_TOKEN: {
                actions: [], // handled via side-effects or event bubbling
              },
              STEP_COMPLETE: "#graphRunner.evaluatingStep",
              INTERRUPT: "#graphRunner.interrupted",
              ERROR: "#graphRunner.failed",
            },
          },
        },
        on: {
          PAUSE: "paused",
          TIMEOUT: "failed",
        },
      },
      evaluatingStep: {
        always: [
          {
            guard: "isBudgetExceeded",
            target: "interrupted.budgetExceeded",
          },
          {
            target: "running",
          },
        ],
      },
      paused: {
        on: {
          START: "running",
        },
      },
      interrupted: {
        initial: "awaitingToolInput",
        states: {
          awaitingToolInput: {
            on: {
              SUBMIT_TOOL_RESPONSE: {
                target: "#graphRunner.running.requesting",
                actions: assign({
                  stepsInCurrentRun: () => 0,
                  tokensInCurrentRun: () => 0,
                  budgetOverride: () => null,
                }),
              },
            },
          },
          awaitingApproval: {
            on: {
              SUBMIT_TOOL_RESPONSE: {
                target: "#graphRunner.running.requesting",
                actions: assign({
                  stepsInCurrentRun: () => 0,
                  tokensInCurrentRun: () => 0,
                  budgetOverride: () => null,
                }),
              },
            },
          },
          budgetExceeded: {
            on: {
              RESUME_WITH_BUDGET_OVERRIDE: {
                target: "#graphRunner.running.requesting",
                actions: assign({
                  budgetOverride: ({ event }) => ({
                    maxStepsWithoutUser: event.stepOverride,
                    maxTokensPerRun: event.tokenOverride,
                  }),
                }),
              },
            },
          },
        },
        on: {
          STOP: "completed",
        },
      },
      completed: {
        type: "final",
      },
      failed: {
        on: {
          START: {
            target: "initializing",
            actions: assign({
              errorMessage: () => null,
            }),
          },
        },
      },
    },
  },
  {
    guards: {
      isBudgetExceeded: ({ context }) => {
        const budget = context.budgetOverride || context.presetConfig?.budgetPolicy;
        if (!budget) return false;
        const stepLimit = budget.maxStepsWithoutUser;
        const tokenLimit = budget.maxTokensPerRun;

        if (context.stepsInCurrentRun >= stepLimit) {
          return true;
        }
        if (tokenLimit !== null && context.tokensInCurrentRun >= tokenLimit) {
          return true;
        }
        return false;
      },
    },
  },
);
