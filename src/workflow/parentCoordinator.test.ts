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

    // Wait for the ViewState to settle into idle (async initialization)
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
      workflowSnapshot: { id: "wf-1", name: "WF", nodes: [], edges: [] },
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

    // Wait for ViewState to settle into idle
    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    actor.send({ type: "ROUTE_CHANGED", threadId });

    // Wait for ExecutionState to settle into inactive (async database query)
    await waitFor(
      actor,
      (state) =>
        state.matches({ ExecutionState: "inactive" }) && state.context.currentThreadId === threadId,
      { timeout: 5000 },
    );

    // Transition execution state - synchronous transition
    actor.send({ type: "START_EXECUTION" });

    // Assert synchronously - with an empty workflow, it completes immediately and goes to inactive
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ ExecutionState: "inactive" })).toBe(true);

    // Wait a brief moment for updateThreadStatus to write to the database (fire-and-forget async action)
    await new Promise((resolve) => setTimeout(resolve, 50));

    const thread = await db.getThread(threadId);
    expect(thread?.status).toBe("executing");
    actor.stop();
  });

  it("should transition to awaitingHumanInput on BUDGET_EXCEEDED", async () => {
    const threadId = "thread-executing";
    await db.saveThread({
      id: threadId,
      title: "Test Thread",
      workflowId: "wf-1",
      workflowSnapshot: { id: "wf-1", name: "WF", nodes: [], edges: [] },
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

    // Wait for ViewState to settle into idle
    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    // To catch it in executing, we'd need a long running graph. Since it finishes instantly,
    // let's send BUDGET_EXCEEDED while it's in awaitingHumanInput (if it interrupted) or inactive.
    // Actually, BUDGET_EXCEEDED is handled from executing. Let's start execution and immediately send BUDGET_EXCEEDED.
    actor.send({ type: "START_EXECUTION" });
    actor.send({
      type: "BUDGET_EXCEEDED",
      currentTokens: 100,
      maxTokens: 50,
      stepCount: 5,
    });

    // Assert synchronously
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ ExecutionState: { awaitingHumanInput: "budgetExceeded" } })).toBe(
      true,
    );
    expect(snapshot.context.loopControl.activeInterrupt).toEqual(
      expect.objectContaining({ type: "budget_exceeded" }),
    );
    actor.stop();
  });

  it("should transition ViewState to onboarding if API keys are not configured", async () => {
    // Ensure no API keys are set
    const dbInstance = await db.getDB();
    await dbInstance.clear("settings");

    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    // Wait for ViewState to settle into onboarding (async initialization)
    await waitFor(actor, (state) => state.matches({ ViewState: "onboarding" }), { timeout: 5000 });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ ViewState: "onboarding" })).toBe(true);
    expect(snapshot.context.apiKeysConfigured).toBe(false);
    actor.stop();
  });

  it("should navigate to globalSettings from onboarding and back", async () => {
    // Ensure no API keys are set
    const dbInstance = await db.getDB();
    await dbInstance.clear("settings");

    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    // Wait for onboarding
    await waitFor(actor, (state) => state.matches({ ViewState: "onboarding" }), { timeout: 5000 });

    // Open settings - synchronous
    actor.send({ type: "OPEN_SETTINGS" });
    expect(actor.getSnapshot().matches({ ViewState: "globalSettings" })).toBe(true);

    // Close settings - synchronous
    actor.send({ type: "CLOSE_SETTINGS" });
    expect(actor.getSnapshot().matches({ ViewState: "onboarding" })).toBe(true);

    actor.stop();
  });

  it("should navigate to presetConfig from idle and back", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    // Open preset edit - synchronous
    actor.send({ type: "OPEN_PRESET_EDIT", presetId: "preset-2" });
    expect(actor.getSnapshot().matches({ ViewState: "presetConfig" })).toBe(true);
    expect(actor.getSnapshot().context.editingPresetId).toBe("preset-2");

    // Close preset edit - synchronous
    actor.send({ type: "CLOSE_PRESET_EDIT" });
    expect(actor.getSnapshot().matches({ ViewState: "idle" })).toBe(true);
    expect(actor.getSnapshot().context.editingPresetId).toBeNull();

    actor.stop();
  });

  it("should navigate to workflowConfig from idle and back", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    // Open workflow edit - synchronous
    actor.send({ type: "OPEN_WORKFLOW_EDIT", workflowId: "wf-2" });
    expect(actor.getSnapshot().matches({ ViewState: "workflowConfig" })).toBe(true);
    expect(actor.getSnapshot().context.editingWorkflowId).toBe("wf-2");

    // Close workflow edit - synchronous
    actor.send({ type: "CLOSE_WORKFLOW_EDIT" });
    expect(actor.getSnapshot().matches({ ViewState: "idle" })).toBe(true);
    expect(actor.getSnapshot().context.editingWorkflowId).toBeNull();

    actor.stop();
  });

  it("should handle API_KEYS_REMOVED by transitioning ViewState to onboarding and ExecutionState to inactive", async () => {
    const actor = createActor(parentCoordinatorMachine);
    actor.start();

    await waitFor(actor, (state) => state.matches({ ViewState: "idle" }), { timeout: 5000 });

    actor.send({ type: "ROUTE_CHANGED", threadId: "thread-executing" });
    await waitFor(actor, (state) => state.matches({ ExecutionState: "executing" }), {
      timeout: 5000,
    });

    // Trigger API key removal - synchronous
    actor.send({ type: "API_KEYS_REMOVED" });

    // Assert synchronously
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ ViewState: "onboarding" })).toBe(true);
    expect(snapshot.matches({ ExecutionState: "inactive" })).toBe(true);
    expect(snapshot.context.apiKeysConfigured).toBe(false);
    actor.stop();
  });
});
