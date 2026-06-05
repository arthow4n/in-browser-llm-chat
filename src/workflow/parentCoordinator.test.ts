import { describe, it, expect, vi, beforeEach } from "vitest";
import { createActor } from "xstate";
import { parentCoordinatorMachine } from "./parentCoordinator.js";
import { saveThread, getSetting } from "../db/db.js";

vi.mock("../db/db.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getThread: vi.fn<(...args: [string]) => Promise<unknown>>().mockImplementation(async (id: string) => {
      return {
        id,
        title: "Test Thread",
        workflowId: "wf-1",
        status: id === "thread-executing" ? "executing" : "inactive",
        activeInterrupt: null,
      };
    }),
    saveThread: vi.fn<(...args: unknown[]) => unknown>(),
    getPreset: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue({
      id: "preset-1",
      name: "Default Flash",
      provider: "gemini",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      maxTokens: 100,
    }),
    getSetting: vi.fn<(...args: [string]) => Promise<unknown>>().mockImplementation(async (key: string) => {
      if (key === "api_keys") {
        return { gemini: "test-key" };
      }
      return null;
    }),
    saveMessage: vi.fn<(...args: unknown[]) => unknown>(),
    sweepInitializingThreads: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(undefined),
    sweepDeletingThreads: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(undefined),
    getDB: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue({
      getAll: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([]),
      transaction: vi.fn<(...args: unknown[]) => unknown>().mockReturnValue({
        objectStore: vi.fn<(...args: unknown[]) => unknown>().mockReturnValue({
          getAll: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([]),
          put: vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(undefined),
        }),
        done: Promise.resolve(),
      }),
    }),
  };
});

vi.mock("./graphRunnerActor.js", () => {
  const { createMachine } = require("xstate");
  return {
    graphRunnerActor: createMachine({
      id: "graphRunnerActor",
      initial: "idle",
      states: {
        idle: {},
      },
    }),
  };
});

type StateMock = { value: unknown; context: Record<string, unknown> };

// Helper function to wait for a state condition safely without race conditions
function waitForState(
  actor: unknown,
  predicate: (state: StateMock) => boolean,
  _label?: string,
): Promise<unknown> {
  return new Promise((resolve) => {
    let sub: { unsubscribe: () => void };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sub = (actor as any).subscribe((state: StateMock) => {
      if (predicate(state)) {
        if (sub) {
          sub.unsubscribe();
        } else {
          setTimeout(() => sub?.unsubscribe(), 0);
        }
        resolve(state);
      }
    });
  });
}

describe("parentCoordinatorMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize and transition ViewState to idle if keys are configured", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    // Wait for the ViewState to settle into idle (async initialization)
    await waitForState(
      actor,
      (state) => (state.value as { ViewState?: string }).ViewState === "idle",
      "initialization",
    );

    const snapshot = actor.getSnapshot();
    expect((snapshot.value as { ViewState?: string }).ViewState).toBe("idle");
    expect(snapshot.context.apiKeysConfigured).toBe(true);
    actor.stop();
  });

  it("should update thread status to executing on START_EXECUTION", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    // Wait for ViewState to settle into idle
    await waitForState(
      actor,
      (state) => (state.value as { ViewState?: string }).ViewState === "idle",
      "initialization",
    );

    actor.send({ type: "ROUTE_CHANGED", threadId: "thread-inactive" });

    // Wait for ExecutionState to settle into inactive (async database query)
    await waitForState(
      actor,
      (state) =>
        (state.value as { ExecutionState?: string }).ExecutionState === "inactive" &&
        state.context.currentThreadId === "thread-inactive",
      "route change status",
    );

    // Transition execution state - synchronous transition
    actor.send({ type: "START_EXECUTION" });

    // Assert synchronously
    const snapshot = actor.getSnapshot();
    expect((snapshot.value as { ExecutionState?: string }).ExecutionState).toBe("executing");

    // Wait a brief moment for updateThreadStatus to write to the database (fire-and-forget async action)
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(saveThread).toHaveBeenCalled();
    actor.stop();
  });

  it("should transition to awaitingHumanInput on BUDGET_EXCEEDED", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    // Wait for ViewState to settle into idle
    await waitForState(
      actor,
      (state) => (state.value as { ViewState?: string }).ViewState === "idle",
      "initialization",
    );

    actor.send({ type: "ROUTE_CHANGED", threadId: "thread-executing" });

    // Wait for ExecutionState to settle into executing (async database status check)
    await waitForState(
      actor,
      (state) => (state.value as { ExecutionState?: string }).ExecutionState === "executing",
      "route change executing",
    );

    // Send budget exceeded - synchronous transition
    actor.send({
      type: "BUDGET_EXCEEDED",
      currentTokens: 100,
      maxTokens: 50,
      stepCount: 5,
    });

    // Assert synchronously
    const snapshot = actor.getSnapshot();
    expect((snapshot.value as { ExecutionState?: string }).ExecutionState).toEqual({
      awaitingHumanInput: "budgetExceeded",
    });
    expect((snapshot.context.loopControl.activeInterrupt as { type?: string })?.type).toBe("budget_exceeded");
    actor.stop();
  });

  it("should transition ViewState to onboarding if API keys are not configured", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce(null);

    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    // Wait for ViewState to settle into onboarding (async initialization)
    await waitForState(
      actor,
      (state) => (state.value as { ViewState?: string }).ViewState === "onboarding",
      "onboarding init",
    );

    const snapshot = actor.getSnapshot();
    expect((snapshot.value as { ViewState?: string }).ViewState).toBe("onboarding");
    expect(snapshot.context.apiKeysConfigured).toBe(false);
    actor.stop();
  });

  it("should navigate to globalSettings from onboarding and back", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce(null);

    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    // Wait for onboarding
    await waitForState(
      actor,
      (state) => (state.value as { ViewState?: string }).ViewState === "onboarding",
      "onboarding init",
    );

    // Open settings - synchronous
    actor.send({ type: "OPEN_SETTINGS" });
    expect((actor.getSnapshot().value as { ViewState?: string }).ViewState).toBe("globalSettings");

    // Close settings - synchronous
    actor.send({ type: "CLOSE_SETTINGS" });
    expect((actor.getSnapshot().value as { ViewState?: string }).ViewState).toBe("onboarding");

    actor.stop();
  });

  it("should navigate to presetConfig from idle and back", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitForState(
      actor,
      (state) => (state.value as { ViewState?: string }).ViewState === "idle",
      "initialization",
    );

    // Open preset edit - synchronous
    actor.send({ type: "OPEN_PRESET_EDIT", presetId: "preset-2" });
    expect((actor.getSnapshot().value as { ViewState?: string }).ViewState).toBe("presetConfig");
    expect(actor.getSnapshot().context.editingPresetId).toBe("preset-2");

    // Close preset edit - synchronous
    actor.send({ type: "CLOSE_PRESET_EDIT" });
    expect((actor.getSnapshot().value as { ViewState?: string }).ViewState).toBe("idle");
    expect(actor.getSnapshot().context.editingPresetId).toBeNull();

    actor.stop();
  });

  it("should navigate to workflowConfig from idle and back", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitForState(
      actor,
      (state) => (state.value as { ViewState?: string }).ViewState === "idle",
      "initialization",
    );

    // Open workflow edit - synchronous
    actor.send({ type: "OPEN_WORKFLOW_EDIT", workflowId: "wf-2" });
    expect((actor.getSnapshot().value as { ViewState?: string }).ViewState).toBe("workflowConfig");
    expect(actor.getSnapshot().context.editingWorkflowId).toBe("wf-2");

    // Close workflow edit - synchronous
    actor.send({ type: "CLOSE_WORKFLOW_EDIT" });
    expect((actor.getSnapshot().value as { ViewState?: string }).ViewState).toBe("idle");
    expect(actor.getSnapshot().context.editingWorkflowId).toBeNull();

    actor.stop();
  });

  it("should handle API_KEYS_REMOVED by transitioning ViewState to onboarding and ExecutionState to inactive", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitForState(
      actor,
      (state) => (state.value as { ViewState?: string }).ViewState === "idle",
      "initialization",
    );

    actor.send({ type: "ROUTE_CHANGED", threadId: "thread-executing" });
    await waitForState(
      actor,
      (state) => (state.value as { ExecutionState?: string }).ExecutionState === "executing",
      "route change executing",
    );

    // Trigger API key removal - synchronous
    actor.send({ type: "API_KEYS_REMOVED" });

    // Assert synchronously
    const snapshot = actor.getSnapshot();
    expect((snapshot.value as { ViewState?: string }).ViewState).toBe("onboarding");
    expect((snapshot.value as { ExecutionState?: string }).ExecutionState).toBe("inactive");
    expect(snapshot.context.apiKeysConfigured).toBe(false);
    actor.stop();
  });
});
