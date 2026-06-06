import { describe, it, expect, beforeEach, vi } from "vitest";
import { createActor } from "xstate";
import { newChatFormMachine } from "./newChatFormMachine.js";
import * as db from "../../db/db.js";

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
  beforeEach(async () => {
    await db.clearPresets();
    await db.clearWorkflows();
    const dbInstance = await db.getDB();
    await dbInstance.clear("settings");
  });

  it("starts in loading state and transitions to idle after data loads", async () => {
    await db.saveWorkflow(mockWorkflow);
    await db.savePreset(mockPreset);

    const actor = createActor(newChatFormMachine).start();
    expect(actor.getSnapshot().matches("loading")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 10));

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

    await db.saveWorkflow(mockWorkflow);
    await db.savePreset(mockPreset);
    await db.savePreset(preset2);
    await db.setSetting("default_preset_id", "p2");

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(actor.getSnapshot().context.selectedPresetId).toBe("p2");
  });

  it("transitions to error state when data loading fails", async () => {
    const spy = vi.spyOn(db, "getAllWorkflows").mockRejectedValue(new Error("DB unavailable"));

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const snap = actor.getSnapshot();
    expect(snap.matches("error")).toBe(true);
    expect(snap.context.errorMessage).toBe("DB unavailable");
    
    spy.mockRestore();
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

    await db.saveWorkflow(mockWorkflow);
    await db.saveWorkflow(workflow2);
    await db.savePreset(mockPreset);

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    actor.send({ type: "CHANGE_WORKFLOW", workflowId: "w2" });
    expect(actor.getSnapshot().context.selectedWorkflowId).toBe("w2");

    actor.send({ type: "CHANGE_PRESET", presetId: "p1" });
    expect(actor.getSnapshot().context.selectedPresetId).toBe("p1");
  });

  it("updates initial message in context", async () => {
    await db.saveWorkflow(mockWorkflow);
    await db.savePreset(mockPreset);

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    actor.send({ type: "UPDATE_MESSAGE", message: "Hello world" });
    expect(actor.getSnapshot().context.initialMessage).toBe("Hello world");
  });

  it("submitting creates a new thread and sets lastCreatedThreadId", async () => {
    await db.saveWorkflow(mockWorkflow);
    await db.savePreset(mockPreset);

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    actor.send({ type: "UPDATE_MESSAGE", message: "Let's debate AI" });
    actor.send({ type: "SUBMIT" });

    expect(actor.getSnapshot().matches("submitting")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const snap = actor.getSnapshot();
    expect(snap.matches("idle")).toBe(true);
    expect(snap.context.lastCreatedThreadId).toBeDefined();
    expect(snap.context.initialMessage).toBe("");
    expect(snap.context.errorMessage).toBeNull();
  });

  it("transitions to error state when thread creation fails", async () => {
    await db.saveWorkflow(mockWorkflow);
    await db.savePreset(mockPreset);
    const spy = vi.spyOn(db, "createNewThread").mockRejectedValue(new Error("IndexedDB write failed"));

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    actor.send({ type: "SUBMIT" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const snap = actor.getSnapshot();
    expect(snap.matches("error")).toBe(true);
    expect(snap.context.errorMessage).toBe("IndexedDB write failed");
    
    spy.mockRestore();
  });

  it("dismissing error in error state returns to idle", async () => {
    const spy = vi.spyOn(db, "getAllWorkflows").mockRejectedValue(new Error("DB error"));

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(actor.getSnapshot().matches("error")).toBe(true);
    actor.send({ type: "DISMISS_ERROR" });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.errorMessage).toBeNull();
    
    spy.mockRestore();
  });

  it("calling LOAD from error state re-enters loading", async () => {
    const spy = vi.spyOn(db, "getAllWorkflows").mockRejectedValueOnce(new Error("DB error"));

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(actor.getSnapshot().matches("error")).toBe(true);

    // On the next attempt, return data successfully
    await db.saveWorkflow(mockWorkflow);
    await db.savePreset(mockPreset);

    actor.send({ type: "LOAD" });
    expect(actor.getSnapshot().matches("loading")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().context.workflows).toEqual([mockWorkflow]);
    
    spy.mockRestore();
  });

  it("createNewThread is called with correct workflowSnapshot", async () => {
    await db.saveWorkflow(mockWorkflow);
    await db.savePreset(mockPreset);
    const spy = vi.spyOn(db, "createNewThread");

    const actor = createActor(newChatFormMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    actor.send({ type: "UPDATE_MESSAGE", message: "My topic" });
    actor.send({ type: "SUBMIT" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(spy).toHaveBeenCalledWith({
      workflowId: "w1",
      workflowSnapshot: mockWorkflow,
      activePresetId: "p1",
      initialMessage: "My topic",
    });
    
    spy.mockRestore();
  });
});
