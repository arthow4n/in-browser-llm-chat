import { describe, it, expect, beforeEach, vi } from "vitest";
import { createActor } from "xstate";
import { newChatFormMachine } from "./newChatFormMachine.js";
import * as db from "../../db/db.js";
import "fake-indexeddb/auto";

vi.mock("../../db/db", async () => {
  const actual = await vi.importActual("../../db/db");
  return {
    ...actual,
    getAllWorkflows: vi.fn<typeof db.getAllWorkflows>(),
    getAllPresets: vi.fn<typeof db.getAllPresets>(),
    getSetting: vi.fn<typeof db.getSetting>(),
    getWorkflow: vi.fn<typeof db.getWorkflow>(),
    createNewThread: vi.fn<typeof db.createNewThread>(),
  };
});

const mockWorkflow: db.WorkflowStore = {
  id: "w1",
  name: "Standard Agent",
  description: "A simple single-agent workflow",
  isBuiltIn: true,
  nodes: [],
  edges: [],
};

const mockPreset: db.PresetStore = {
  id: "p1",
  name: "Default Gemini Flash",
  provider: "gemini",
  model: "gemini-2.5-flash",
};

describe("newChatFormMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in loading state and transitions to idle after data loads", async () => {
    vi.mocked(db.getAllWorkflows).mockResolvedValue([mockWorkflow]);
    vi.mocked(db.getAllPresets).mockResolvedValue([mockPreset]);
    vi.mocked(db.getSetting).mockResolvedValue(undefined);

    const actor = createActor(newChatFormMachine).start();
    expect(actor.getSnapshot().matches("loading")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const snap = actor.getSnapshot();
    expect(snap.matches("idle")).toBe(true);
    expect(snap.context.workflows).toEqual([mockWorkflow]);
    expect(snap.context.presets).toEqual([mockPreset]);
    expect(snap.context.selectedWorkflowId).toBe("w1");
    expect(snap.context.selectedPresetId).toBe("p1");
  });

  it("selects the default preset from settings when available", async () => {
    const preset2: db.PresetStore = {
      id: "p2",
      name: "OpenRouter Flash",
      provider: "openrouter",
      model: "google/gemini-2.5-flash",
    };

    vi.mocked(db.getAllWorkflows).mockResolvedValue([mockWorkflow]);
    vi.mocked(db.getAllPresets).mockResolvedValue([mockPreset, preset2]);
    vi.mocked(db.getSetting).mockResolvedValue("p2");

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().context.selectedPresetId).toBe("p2");
  });

  it("transitions to error state when data loading fails", async () => {
    vi.mocked(db.getAllWorkflows).mockRejectedValue(new Error("DB unavailable"));
    vi.mocked(db.getAllPresets).mockResolvedValue([]);
    vi.mocked(db.getSetting).mockResolvedValue(undefined);

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snap = actor.getSnapshot();
    expect(snap.matches("error")).toBe(true);
    expect(snap.context.errorMessage).toBe("DB unavailable");
  });

  it("allows changing workflow and preset selections", async () => {
    const workflow2: db.WorkflowStore = {
      id: "w2",
      name: "Debate Workflow",
      description: "A debate workflow",
      isBuiltIn: true,
      nodes: [],
      edges: [],
    };

    vi.mocked(db.getAllWorkflows).mockResolvedValue([mockWorkflow, workflow2]);
    vi.mocked(db.getAllPresets).mockResolvedValue([mockPreset]);
    vi.mocked(db.getSetting).mockResolvedValue(undefined);

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: "CHANGE_WORKFLOW", workflowId: "w2" });
    expect(actor.getSnapshot().context.selectedWorkflowId).toBe("w2");

    actor.send({ type: "CHANGE_PRESET", presetId: "p1" });
    expect(actor.getSnapshot().context.selectedPresetId).toBe("p1");
  });

  it("updates initial message in context", async () => {
    vi.mocked(db.getAllWorkflows).mockResolvedValue([mockWorkflow]);
    vi.mocked(db.getAllPresets).mockResolvedValue([mockPreset]);
    vi.mocked(db.getSetting).mockResolvedValue(undefined);

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: "UPDATE_MESSAGE", message: "Hello world" });
    expect(actor.getSnapshot().context.initialMessage).toBe("Hello world");
  });

  it("submitting creates a new thread and sets lastCreatedThreadId", async () => {
    vi.mocked(db.getAllWorkflows).mockResolvedValue([mockWorkflow]);
    vi.mocked(db.getAllPresets).mockResolvedValue([mockPreset]);
    vi.mocked(db.getSetting).mockResolvedValue(undefined);
    vi.mocked(db.getWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(db.createNewThread).mockResolvedValue({ threadId: "new-thread-id" });

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: "UPDATE_MESSAGE", message: "Let's debate AI" });
    actor.send({ type: "SUBMIT" });

    expect(actor.getSnapshot().matches("submitting")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const snap = actor.getSnapshot();
    expect(snap.matches("idle")).toBe(true);
    expect(snap.context.lastCreatedThreadId).toBe("new-thread-id");
    expect(snap.context.initialMessage).toBe("");
    expect(snap.context.errorMessage).toBeNull();
  });

  it("transitions to error state when thread creation fails", async () => {
    vi.mocked(db.getAllWorkflows).mockResolvedValue([mockWorkflow]);
    vi.mocked(db.getAllPresets).mockResolvedValue([mockPreset]);
    vi.mocked(db.getSetting).mockResolvedValue(undefined);
    vi.mocked(db.getWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(db.createNewThread).mockRejectedValue(new Error("IndexedDB write failed"));

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: "SUBMIT" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snap = actor.getSnapshot();
    expect(snap.matches("error")).toBe(true);
    expect(snap.context.errorMessage).toBe("IndexedDB write failed");
  });

  it("dismissing error in error state returns to idle", async () => {
    vi.mocked(db.getAllWorkflows).mockRejectedValue(new Error("DB error"));
    vi.mocked(db.getAllPresets).mockResolvedValue([]);
    vi.mocked(db.getSetting).mockResolvedValue(undefined);

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().matches("error")).toBe(true);
    actor.send({ type: "DISMISS_ERROR" });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.errorMessage).toBeNull();
  });

  it("calling LOAD from error state re-enters loading", async () => {
    vi.mocked(db.getAllWorkflows).mockRejectedValueOnce(new Error("DB error"));
    vi.mocked(db.getAllPresets).mockResolvedValue([]);
    vi.mocked(db.getSetting).mockResolvedValue(undefined);

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().matches("error")).toBe(true);

    // On the next attempt, return data successfully
    vi.mocked(db.getAllWorkflows).mockResolvedValue([mockWorkflow]);
    vi.mocked(db.getAllPresets).mockResolvedValue([mockPreset]);

    actor.send({ type: "LOAD" });
    expect(actor.getSnapshot().matches("loading")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.workflows).toEqual([mockWorkflow]);
  });

  it("createNewThread is called with correct workflowSnapshot", async () => {
    vi.mocked(db.getAllWorkflows).mockResolvedValue([mockWorkflow]);
    vi.mocked(db.getAllPresets).mockResolvedValue([mockPreset]);
    vi.mocked(db.getSetting).mockResolvedValue(undefined);
    vi.mocked(db.getWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(db.createNewThread).mockResolvedValue({ threadId: "t-new" });

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    actor.send({ type: "UPDATE_MESSAGE", message: "My topic" });
    actor.send({ type: "SUBMIT" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(db.createNewThread).toHaveBeenCalledWith({
      workflowId: "w1",
      workflowSnapshot: mockWorkflow,
      activePresetId: "p1",
      initialMessage: "My topic",
    });
  });
});
