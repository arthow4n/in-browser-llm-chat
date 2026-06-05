import { createMachine, assign, sendTo, fromPromise } from "xstate";
import {
  getThread,
  saveThread,
  getSetting,
  saveMessage,
  type ThreadStore,
  type MessageStore,
  getDB,
  sweepInitializingThreads,
  sweepDeletingThreads,
} from "../db/db.js";
import { graphRunnerActor } from "./graphRunnerActor.js";

// Helper to check if API keys are configured
export async function checkApiKeysConfigured(): Promise<boolean> {
  const apiKeys = await getSetting("api_keys");
  if (apiKeys && (apiKeys.openRouter || apiKeys.gemini)) {
    return true;
  }
  const db = await getDB();
  const presets = await db.getAll("presets");
  return presets.some((p) => p.apiKey && p.apiKey.trim() !== "");
}

// Helper to update thread status in IndexedDB
export async function updateThreadStatus(
  threadId: string | null,
  status: ThreadStore["status"],
  extra?: Partial<ThreadStore>,
) {
  if (!threadId) return;
  try {
    const thread = await getThread(threadId);
    if (thread) {
      thread.status = status;
      if (extra) {
        Object.assign(thread, extra);
      }
      await saveThread(thread);
    }
  } catch (err) {
    console.error("ERROR IN updateThreadStatus:", err);
  }
}

export interface CoordinatorContext {
  currentThreadId: string | null;
  activeWorkflowId: string | null;
  activePresetId: string | null;
  editingPresetId: string | null;
  editingWorkflowId: string | null;
  loopControl: {
    currentRound: number;
    turnCount: number;
    tokenStats: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
    activeInterrupt: any | null;
  };
  errorMessage: string | null;
  apiKeysConfigured: boolean;
  graphRunnerActorRef: any | null;
}

export type CoordinatorEvent =
  | { type: "INITIALIZE_CHECKPOINT" }
  | { type: "API_KEYS_CONFIGURED" }
  | { type: "API_KEYS_REMOVED" }
  | { type: "ROUTE_CHANGED"; threadId: string | null }
  | { type: "START_EXECUTION" }
  | { type: "SUBMIT_MESSAGE"; message: MessageStore }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "CANCEL_EXECUTION" }
  | { type: "FORCE_CONSENSUS" }
  | { type: "FORCE_SUMMARIZE" }
  | { type: "RESUME_WITH_BUDGET_OVERRIDE"; stepOverride?: number; tokenOverride?: number | null }
  | { type: "SUBMIT_TOOL_RESPONSE"; response: any }
  | { type: "SUBMIT_APPROVAL"; response: any }
  | { type: "RETRY_STEP" }
  | { type: "CHANGE_PRESET_AND_RESUME"; presetId: string }
  | { type: "DISMISS_ERROR" }
  | { type: "COMPLETE" }
  | { type: "ERROR"; error: string | null }
  | { type: "INTERRUPT"; details: any }
  | { type: "BUDGET_EXCEEDED"; currentTokens: number; maxTokens: number | null; stepCount: number }
  | { type: "STEP"; steps: number; tokens: number }
  | { type: "RECEIVE_TOKEN"; token: string; reasoning: string; delta: string }
  | { type: "RETRY_INIT" }
  | { type: "OPEN_SETTINGS" }
  | { type: "CLOSE_SETTINGS" }
  | { type: "OPEN_PRESET_EDIT"; presetId: string }
  | { type: "CLOSE_PRESET_EDIT" }
  | { type: "OPEN_WORKFLOW_EDIT"; workflowId: string }
  | { type: "CLOSE_WORKFLOW_EDIT" };

export const parentCoordinatorMachine = createMachine(
  {
    id: "parentCoordinator",
    type: "parallel",
    context: () =>
      ({
        currentThreadId: null,
        activeWorkflowId: null,
        activePresetId: null,
        editingPresetId: null,
        editingWorkflowId: null,
        loopControl: {
          currentRound: 0,
          turnCount: 0,
          tokenStats: null,
          activeInterrupt: null,
        },
        errorMessage: null,
        apiKeysConfigured: false,
        graphRunnerActorRef: null,
      }) as CoordinatorContext,
    states: {
      ViewState: {
        initial: "initializing",
        states: {
          initializing: {
            invoke: {
              src: fromPromise(async () => {
                const keysConfigured = await checkApiKeysConfigured();
                // Sweep initializing and deleting threads
                await sweepInitializingThreads();
                await sweepDeletingThreads();

                // Load default preset if any
                const defaultPresetId = await getSetting("default_preset_id");
                return { keysConfigured, defaultPresetId };
              }),
              onDone: {
                actions: assign(({ event }) => ({
                  apiKeysConfigured: event.output.keysConfigured,
                  activePresetId: event.output.defaultPresetId || null,
                })),
                target: "checkingKeys",
              },
              onError: {
                target: "error",
                actions: assign({
                  errorMessage: ({ event }) =>
                    (event.error as any)?.message || "Failed to initialize DB",
                }),
              },
            },
          },
          checkingKeys: {
            always: [
              {
                guard: ({ context }) => !context.apiKeysConfigured,
                target: "onboarding",
              },
              {
                guard: ({ context }) => !!context.currentThreadId,
                target: "chatting",
              },
              {
                target: "idle",
              },
            ],
          },
          onboarding: {
            on: {
              OPEN_SETTINGS: { target: "globalSettings" },
            },
          },
          idle: {
            on: {
              OPEN_SETTINGS: { target: "globalSettings" },
              OPEN_PRESET_EDIT: {
                target: "presetConfig",
                actions: assign({ editingPresetId: ({ event }) => (event as any).presetId }),
              },
              OPEN_WORKFLOW_EDIT: {
                target: "workflowConfig",
                actions: assign({ editingWorkflowId: ({ event }) => (event as any).workflowId }),
              },
              ROUTE_CHANGED: {
                target: "checkingKeys",
                actions: assign({
                  currentThreadId: ({ event }) => (event as any).threadId,
                }),
              },
            },
          },
          chatting: {
            on: {
              OPEN_SETTINGS: { target: "globalSettings" },
              OPEN_PRESET_EDIT: {
                target: "presetConfig",
                actions: assign({ editingPresetId: ({ event }) => (event as any).presetId }),
              },
              OPEN_WORKFLOW_EDIT: {
                target: "workflowConfig",
                actions: assign({ editingWorkflowId: ({ event }) => (event as any).workflowId }),
              },
              ROUTE_CHANGED: {
                target: "checkingKeys",
                actions: assign({
                  currentThreadId: ({ event }) => (event as any).threadId,
                }),
              },
              API_KEYS_REMOVED: {
                target: "onboarding",
                actions: assign({ apiKeysConfigured: false }),
              },
            },
          },
          presetConfig: {
            on: {
              CLOSE_PRESET_EDIT: {
                target: "checkingKeys",
                actions: assign({ editingPresetId: () => null }),
              },
              ROUTE_CHANGED: {
                target: "checkingKeys",
                actions: assign({
                  currentThreadId: ({ event }) => (event as any).threadId,
                }),
              },
              API_KEYS_REMOVED: {
                target: "onboarding",
                actions: assign({ apiKeysConfigured: false }),
              },
            },
          },
          workflowConfig: {
            on: {
              CLOSE_WORKFLOW_EDIT: {
                target: "checkingKeys",
                actions: assign({ editingWorkflowId: () => null }),
              },
              ROUTE_CHANGED: {
                target: "checkingKeys",
                actions: assign({
                  currentThreadId: ({ event }) => (event as any).threadId,
                }),
              },
              API_KEYS_REMOVED: {
                target: "onboarding",
                actions: assign({ apiKeysConfigured: false }),
              },
            },
          },
          globalSettings: {
            on: {
              CLOSE_SETTINGS: {
                target: "checkingKeys",
              },
              ROUTE_CHANGED: {
                target: "checkingKeys",
                actions: assign({
                  currentThreadId: ({ event }) => (event as any).threadId,
                }),
              },
              API_KEYS_REMOVED: {
                target: "onboarding",
                actions: assign({ apiKeysConfigured: false }),
              },
            },
          },
          error: {
            on: {
              RETRY_INIT: {
                target: "initializing",
              },
            },
          },
        },
      },
      ExecutionState: {
        initial: "inactive",
        states: {
          inactive: {
            entry: [
              ({ context }) => {
                updateThreadStatus(context.currentThreadId, "inactive");
              },
            ],
            on: {
              START_EXECUTION: {
                target: "executing",
              },
              SUBMIT_MESSAGE: {
                target: "executing",
                actions: [
                  async ({ event }) => {
                    const message = (event as any).message;
                    await saveMessage(message);
                  },
                ],
              },
              FORCE_CONSENSUS: {
                target: "executing",
              },
              FORCE_SUMMARIZE: {
                target: "executing",
              },
              ROUTE_CHANGED: {
                guard: ({ context }) => context.apiKeysConfigured,
                target: "checkingStatus",
                actions: assign({
                  currentThreadId: ({ event }) => (event as any).threadId,
                }),
              },
              INITIALIZE_CHECKPOINT: {
                guard: ({ context }) => context.apiKeysConfigured,
                target: "checkingStatus",
              },
              API_KEYS_CONFIGURED: {
                target: "checkingStatus",
                actions: assign({ apiKeysConfigured: true }),
              },
            },
          },
          checkingStatus: {
            invoke: {
              src: fromPromise(async ({ input }) => {
                if (!input.threadId) {
                  return { status: "inactive", activeInterrupt: null };
                }
                const thread = await getThread(input.threadId);
                if (!thread) {
                  return { status: "inactive", activeInterrupt: null };
                }
                return { status: thread.status, activeInterrupt: thread.activeInterrupt };
              }),
              input: ({ context }) => ({ threadId: context.currentThreadId }),
              onDone: [
                {
                  guard: ({ event }) =>
                    event.output.status === "awaiting_input" || !!event.output.activeInterrupt,
                  target: "awaitingHumanInput",
                  actions: assign({
                    loopControl: ({ context, event }) => ({
                      ...context.loopControl,
                      activeInterrupt: event.output.activeInterrupt,
                    }),
                  }),
                },
                {
                  guard: ({ event }) => event.output.status === "executing",
                  target: "executing",
                },
                {
                  guard: ({ event }) => event.output.status === "error",
                  target: "error",
                },
                {
                  target: "inactive",
                },
              ],
              onError: {
                target: "error",
                actions: assign({
                  errorMessage: ({ event }) =>
                    (event.error as any)?.message || "Failed to check status",
                }),
              },
            },
          },
          executing: {
            entry: [
              ({ context }) => {
                updateThreadStatus(context.currentThreadId, "executing");
              },
            ],
            invoke: {
              id: "graphRunnerActor",
              src: graphRunnerActor,
              input: ({ context }) => ({ threadId: context.currentThreadId! }),
              // On done/error of the actor promise
              onDone: {
                target: "inactive",
              },
              onError: {
                target: "error",
                actions: assign({
                  errorMessage: ({ event }) => (event.error as any)?.message || "Execution error",
                }),
              },
            },
            on: {
              PAUSE: {
                actions: [sendTo("graphRunnerActor", { type: "PAUSE" })],
              },
              CANCEL_EXECUTION: {
                target: "inactive",
              },
              FORCE_CONSENSUS: {
                actions: [sendTo("graphRunnerActor", { type: "PAUSE" })], // or handle specifically
              },
              FORCE_SUMMARIZE: {
                actions: [sendTo("graphRunnerActor", { type: "PAUSE" })], // or handle specifically
              },
              COMPLETE: {
                target: "inactive",
              },
              ERROR: {
                target: "error",
                actions: assign({
                  errorMessage: ({ event }) => (event as any).error || "Execution failed",
                }),
              },
              INTERRUPT: {
                target: "awaitingHumanInput",
                actions: assign({
                  loopControl: ({ context, event }) => ({
                    ...context.loopControl,
                    activeInterrupt: (event as any).details,
                  }),
                }),
              },
              BUDGET_EXCEEDED: {
                target: "awaitingHumanInput.budgetExceeded",
                actions: assign({
                  loopControl: ({ context, event }) => ({
                    ...context.loopControl,
                    activeInterrupt: {
                      type: "budget_exceeded",
                      budgetDetails: {
                        currentTokens: (event as any).currentTokens,
                        maxTokens: (event as any).maxTokens,
                        stepCount: (event as any).stepCount,
                      },
                    },
                  }),
                }),
              },
              STEP: {
                actions: assign({
                  loopControl: ({ context, event }) => ({
                    ...context.loopControl,
                    currentRound: (event as any).steps,
                    // we can update cumulative tokenStats if passed, or manage internally
                  }),
                }),
              },
              ROUTE_CHANGED: {
                target: "checkingStatus",
                actions: [
                  assign({
                    currentThreadId: ({ event }) => (event as any).threadId,
                  }),
                ],
              },
              INITIALIZE_CHECKPOINT: {
                target: "checkingStatus",
              },
              API_KEYS_REMOVED: {
                target: "inactive",
              },
            },
          },
          awaitingHumanInput: {
            entry: [
              ({ context }) => {
                updateThreadStatus(context.currentThreadId, "awaiting_input");
              },
            ],
            initial: "checkingType",
            states: {
              checkingType: {
                always: [
                  {
                    guard: ({ context }) =>
                      context.loopControl.activeInterrupt?.type === "budget_exceeded",
                    target: "budgetExceeded",
                  },
                  {
                    target: "idle",
                  },
                ],
              },
              idle: {
                on: {
                  RESUME: {
                    target: "#parentCoordinator.ExecutionState.executing",
                  },
                  SUBMIT_TOOL_RESPONSE: {
                    target: "#parentCoordinator.ExecutionState.executing",
                    // Wait, we also want to send the response to the graphRunnerActor if it's running.
                    // But wait, the graphRunnerActor has been stopped when we exited executing?
                    // Ah! In awaitingHumanInput, is the child actor stopped?
                    // "If the parent coordinator is in ExecutionState.awaitingHumanInput, the active thread's status in the database remains 'awaiting_input' (preserving the pending interrupt state), but the active child runner actor is still stopped/cleaned up to prevent resource leaks."
                    // Yes! The child actor is stopped. When we transition back to executing, it will be re-invoked and initialized.
                    // When it is re-invoked, it initializes from the DB where the activeInterrupt is stored.
                    // Wait, how does it get the tool response?
                    // The tool response is written to the DB or handled before resuming!
                    // Let's check how the child actor handles SUBMIT_TOOL_RESPONSE:
                    // If the child actor is not running, wait: the tool card itself writes the responses to the DB, or updates the DB, and then triggers SUBMIT_TOOL_RESPONSE or RESUME.
                    // Yes! The tool card/form writes responses to the DB or thread's draftAnswers/checkpoints, and then transitions back to executing.
                  },
                  SUBMIT_APPROVAL: {
                    target: "#parentCoordinator.ExecutionState.executing",
                  },
                },
              },
              budgetExceeded: {
                on: {
                  RESUME_WITH_BUDGET_OVERRIDE: {
                    target: "#parentCoordinator.ExecutionState.executing",
                  },
                },
              },
            },
            on: {
              CANCEL_EXECUTION: {
                target: "inactive",
              },
              API_KEYS_REMOVED: {
                target: "inactive",
              },
              ROUTE_CHANGED: {
                target: "checkingStatus",
                actions: assign({
                  currentThreadId: ({ event }) => (event as any).threadId,
                }),
              },
              INITIALIZE_CHECKPOINT: {
                target: "checkingStatus",
              },
            },
          },
          error: {
            entry: [
              ({ context }) => {
                updateThreadStatus(context.currentThreadId, "error", {
                  errorMessage: context.errorMessage,
                });
              },
            ],
            on: {
              DISMISS_ERROR: {
                target: "inactive",
              },
              RETRY_STEP: {
                target: "executing",
              },
              RESUME: {
                target: "executing",
              },
              ROUTE_CHANGED: {
                target: "checkingStatus",
                actions: assign({
                  currentThreadId: ({ event }) => (event as any).threadId,
                }),
              },
              INITIALIZE_CHECKPOINT: {
                target: "checkingStatus",
              },
            },
          },
        },
      },
    },
  },
  {
    actions: {},
  },
);
