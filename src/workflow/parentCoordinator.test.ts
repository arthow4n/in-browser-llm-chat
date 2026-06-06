import { describe, it, expect, vi, beforeEach } from "vitest";
import { createActor, waitFor } from "xstate";
import { parentCoordinatorMachine } from "./parentCoordinator.js";
import * as db from "../db/db.js";

describe("parentCoordinatorMachine", () => {
  beforeEach(async () => {
    const dbInstance = await db.getDB();
    await dbInstance.clear("threads");
    await dbInstance.clear("presets");
    await dbInstance.clear("settings");
    vi.clearAllMocks();
  });

  it("should initialize and transition ViewState to idle if keys are configured", async () => {
    await db.setSetting("api_keys", { gemini: "test-key" });
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ ViewState: "idle" })).toBe(true);
    expect(snapshot.context.apiKeysConfigured).toBe(true);
    actor.stop();
  });

  it("should update thread status to executing on START_EXECUTION", async () => {
    const threadId = "thread-inactive";
    await db.saveThread({
      id: threadId,
      title: "Test Thread",
      workflowId: "wf-1",
      workflowSnapshot: {
        id: "wf-1",
        name: "WF",
        description: "WF Description",
        isBuiltIn: false,
        nodes: [{ id: "input", type: "input", name: "User Input" }],
        edges: [],
      },
      activePresetId: "p1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    });
    await db.setSetting("api_keys", { gemini: "test-key" });

    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    actor.send({ type: "ROUTE_CHANGED", threadId });

    await waitFor(
      actor,
      (state) =>
        state.matches({ ExecutionState: "inactive" }) && state.context.currentThreadId === threadId,
      { timeout: 5000 },
    );

    let wasExecuting = false;
    actor.subscribe((state) => {
      if (state.matches({ ExecutionState: "executing" })) {
        wasExecuting = true;
      }
    });

    actor.send({ type: "START_EXECUTION" });

    await waitFor(actor, (state) => state.matches({ ExecutionState: "awaitingHumanInput" }), {
      timeout: 5000,
    });

    expect(wasExecuting).toBe(true);
    actor.stop();
  });

  it("should transition to awaitingHumanInput on BUDGET_EXCEEDED", async () => {
    const threadId = "thread-executing";
    await db.saveThread({
      id: threadId,
      title: "Test Thread",
      workflowId: "wf-1",
      workflowSnapshot: {
        id: "wf-1",
        name: "WF",
        description: "WF Description",
        isBuiltIn: false,
        nodes: [{ id: "input", type: "input", name: "User Input" }],
        edges: [],
      },
      activePresetId: "p1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "executing",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    });
    await db.setSetting("api_keys", { gemini: "test-key" });

    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    actor.send({ type: "START_EXECUTION" });
    actor.send({
      type: "BUDGET_EXCEEDED",
      currentTokens: 100,
      maxTokens: 50,
      stepCount: 5,
    });

    await waitFor(
      actor,
      (state) => state.matches({ ExecutionState: { awaitingHumanInput: "budgetExceeded" } }),
      { timeout: 5000 },
    );

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.loopControl.activeInterrupt).toEqual(
      expect.objectContaining({ type: "budget_exceeded" }),
    );
    actor.stop();
  });

  it("should transition ViewState to onboarding if API keys are not configured", async () => {
    const dbInstance = await db.getDB();
    await dbInstance.clear("settings");

    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "onboarding" }), { timeout: 5000 });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ ViewState: "onboarding" })).toBe(true);
    expect(snapshot.context.apiKeysConfigured).toBe(false);
    actor.stop();
  });

  it("should navigate to globalSettings from onboarding and back", async () => {
    const dbInstance = await db.getDB();
    await dbInstance.clear("settings");

    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "onboarding" }), { timeout: 5000 });

    actor.send({ type: "OPEN_SETTINGS" });
    expect(actor.getSnapshot().matches({ ViewState: "globalSettings" })).toBe(true);

    actor.send({ type: "CLOSE_SETTINGS" });
    expect(actor.getSnapshot().matches({ ViewState: "onboarding" })).toBe(true);

    actor.stop();
  });

  it("should navigate to presetConfig from idle and back", async () => {
    await db.setSetting("api_keys", { gemini: "test-key" });
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    actor.send({ type: "OPEN_PRESET_EDIT", presetId: "preset-2" });
    expect(actor.getSnapshot().matches({ ViewState: "presetConfig" })).toBe(true);
    expect(actor.getSnapshot().context.editingPresetId).toBe("preset-2");

    actor.send({ type: "CLOSE_PRESET_EDIT" });
    expect(actor.getSnapshot().matches({ ViewState: "idle" })).toBe(true);
    expect(actor.getSnapshot().context.editingPresetId).toBeNull();

    actor.stop();
  });

  it("should navigate to workflowConfig from idle and back", async () => {
    await db.setSetting("api_keys", { gemini: "test-key" });
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    actor.send({ type: "OPEN_WORKFLOW_EDIT", workflowId: "wf-2" });
    expect(actor.getSnapshot().matches({ ViewState: "workflowConfig" })).toBe(true);
    expect(actor.getSnapshot().context.editingWorkflowId).toBe("wf-2");

    actor.send({ type: "CLOSE_WORKFLOW_EDIT" });
    expect(actor.getSnapshot().matches({ ViewState: "idle" })).toBe(true);
    expect(actor.getSnapshot().context.editingWorkflowId).toBeNull();

    actor.stop();
  });

  it("should handle API_KEYS_REMOVED by transitioning ViewState to onboarding and ExecutionState to inactive", async () => {
    await db.setSetting("api_keys", { gemini: "test-key" });
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    actor.send({ type: "ROUTE_CHANGED", threadId: "thread-executing" });
    await waitFor(
      actor,
      (state) =>
        state.matches({ ExecutionState: "inactive" }) &&
        state.context.currentThreadId === "thread-executing",
      { timeout: 5000 },
    );

    actor.send({ type: "API_KEYS_REMOVED" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ ViewState: "onboarding" })).toBe(true);
    expect(snapshot.matches({ ExecutionState: "inactive" })).toBe(true);
    expect(snapshot.context.apiKeysConfigured).toBe(false);
    actor.stop();
  });
});
