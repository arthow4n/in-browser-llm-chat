import { describe, it, expect, vi, beforeEach } from "vitest";
import { createActor } from "xstate";
import { parentCoordinatorMachine } from "./parentCoordinator.js";
import { saveThread } from "../db/db.js";

vi.mock("../db/db.js", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getThread: vi.fn().mockImplementation(async (id: string) => {
      return {
        id,
        title: "Test Thread",
        workflowId: "wf-1",
        status: id === "thread-executing" ? "executing" : "inactive",
        activeInterrupt: null,
      };
    }),
    saveThread: vi.fn(),
    getPreset: vi.fn().mockResolvedValue({
      id: "preset-1",
      name: "Default Flash",
      provider: "gemini",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      maxTokens: 100,
    }),
    getSetting: vi.fn().mockImplementation((key) => {
      if (key === "api_keys") {
        return { gemini: "test-key" };
      }
      return null;
    }),
    saveMessage: vi.fn(),
    getDB: vi.fn().mockResolvedValue({
      getAll: vi.fn().mockResolvedValue([]),
      transaction: vi.fn().mockReturnValue({
        objectStore: vi.fn().mockReturnValue({
          getAll: vi.fn().mockResolvedValue([]),
          put: vi.fn().mockResolvedValue(undefined),
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

describe("parentCoordinatorMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize and transition ViewState to idle if keys are configured", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    // Wait for the ViewState to settle
    await new Promise((resolve) => {
      const sub = actor.subscribe((state) => {
        const val = state.value as any;
        if (val && val.ViewState === "idle") {
          sub.unsubscribe();
          resolve(true);
        }
      });
    });

    const snapshot = actor.getSnapshot();
    expect((snapshot.value as any).ViewState).toBe("idle");
    expect(snapshot.context.apiKeysConfigured).toBe(true);
    actor.stop();
  }, 30000);

  it("should update thread status to executing on START_EXECUTION", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    // Wait for ViewState to settle into idle (initialization complete)
    await new Promise((resolve) => {
      const sub = actor.subscribe((state) => {
        const val = state.value as any;
        if (val && val.ViewState === "idle") {
          sub.unsubscribe();
          resolve(true);
        }
      });
    });

    actor.send({ type: "ROUTE_CHANGED", threadId: "thread-inactive" });

    // Wait for it to settle into inactive with currentThreadId set
    await new Promise((resolve) => {
      const sub = actor.subscribe((state) => {
        const val = state.value as any;
        if (
          val &&
          val.ExecutionState === "inactive" &&
          state.context.currentThreadId === "thread-inactive"
        ) {
          sub.unsubscribe();
          resolve(true);
        }
      });
    });

    // Transition execution state
    actor.send({ type: "START_EXECUTION" });

    await new Promise((resolve) => {
      const sub = actor.subscribe((state) => {
        const val = state.value as any;
        if (val && val.ExecutionState === "executing") {
          sub.unsubscribe();
          resolve(true);
        }
      });
    });

    // Wait for async updateThreadStatus call to trigger saveThread
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(saveThread).toHaveBeenCalled();
    const snapshot = actor.getSnapshot();
    expect((snapshot.value as any).ExecutionState).toBe("executing");
    actor.stop();
  }, 30000);

  it("should transition to awaitingHumanInput on BUDGET_EXCEEDED", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    // Wait for ViewState to settle into idle
    await new Promise((resolve) => {
      const sub = actor.subscribe((state) => {
        const val = state.value as any;
        if (val && val.ViewState === "idle") {
          sub.unsubscribe();
          resolve(true);
        }
      });
    });

    actor.send({ type: "ROUTE_CHANGED", threadId: "thread-executing" });

    // Wait for it to settle into executing (since mock status is executing)
    await new Promise((resolve) => {
      const sub = actor.subscribe((state) => {
        const val = state.value as any;
        if (val && val.ExecutionState === "executing") {
          sub.unsubscribe();
          resolve(true);
        }
      });
    });

    actor.send({
      type: "BUDGET_EXCEEDED",
      currentTokens: 100,
      maxTokens: 50,
      stepCount: 5,
    });

    await new Promise((resolve) => {
      const sub = actor.subscribe((state) => {
        const val = state.value as any;
        if (
          val &&
          val.ExecutionState &&
          val.ExecutionState.awaitingHumanInput === "budgetExceeded"
        ) {
          sub.unsubscribe();
          resolve(true);
        }
      });
    });

    const snapshot = actor.getSnapshot();
    expect((snapshot.value as any).ExecutionState).toEqual({
      awaitingHumanInput: "budgetExceeded",
    });
    expect(snapshot.context.loopControl.activeInterrupt?.type).toBe("budget_exceeded");
    actor.stop();
  }, 30000);
});
