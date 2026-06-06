import { describe, it, expect, beforeEach } from "vitest";
import { createActor, waitFor } from "xstate";
import { workflowEditorMachine } from "./workflowEditorMachine.js";
import * as db from "../../db/db.js";

describe("workflowEditorMachine", () => {
  beforeEach(async () => {
    await db.clearWorkflows();
  });

  it("should initialize in loading state", () => {
    const actor = createActor(workflowEditorMachine, {
      input: { workflowId: null },
    }).start();
    expect(actor.getSnapshot().matches("loading")).toBe(true);
  });

  it("should load a default template if workflowId is null, and transition to editing.clean", async () => {
    const actor = createActor(workflowEditorMachine, {
      input: { workflowId: null },
    }).start();

    await waitFor(actor, (state) => state.matches({ editing: "clean" }), { timeout: 1000 });

    expect(actor.getSnapshot().matches({ editing: "clean" })).toBe(true);
    expect(actor.getSnapshot().context.workflowId).toBeNull();
    expect(actor.getSnapshot().context.isBuiltIn).toBe(false);
    expect(actor.getSnapshot().context.isDirty).toBe(false);

    const content = JSON.parse(actor.getSnapshot().context.jsonContent);
    expect(content.name).toBe("New Custom Workflow");
  });

  it("should transition to viewing when a built-in workflow is loaded", async () => {
    const workflowId = "built-in-1";
    await db.saveWorkflow({
      id: workflowId,
      name: "Debate Workflow",
      description: "Inf loop",
      isBuiltIn: true,
      nodes: [],
      edges: [],
    });

    const actor = createActor(workflowEditorMachine, {
      input: { workflowId },
    }).start();

    await waitFor(actor, (state) => state.matches("viewing"), { timeout: 1000 });

    expect(actor.getSnapshot().matches("viewing")).toBe(true);
    expect(actor.getSnapshot().context.isBuiltIn).toBe(true);
  });

  it("should support cloning a built-in workflow", async () => {
    const workflowId = "built-in-1";
    await db.saveWorkflow({
      id: workflowId,
      name: "Debate Workflow",
      description: "Inf loop",
      isBuiltIn: true,
      nodes: [
        { id: "input", type: "input", name: "Input" },
        { id: "agent", type: "agent", name: "Agent" },
      ],
      edges: [{ from: "input", to: "agent" }],
    });

    const actor = createActor(workflowEditorMachine, {
      input: { workflowId },
    }).start();

    await waitFor(actor, (state) => state.matches("viewing"), { timeout: 1000 });

    actor.send({ type: "CLONE_WORKFLOW" });

    await waitFor(actor, (state) => state.matches({ editing: "clean" }), { timeout: 1000 });

    expect(actor.getSnapshot().matches({ editing: "clean" })).toBe(true);
    expect(actor.getSnapshot().context.isBuiltIn).toBe(false);
    expect(actor.getSnapshot().context.isDirty).toBe(false);
    expect(typeof actor.getSnapshot().context.workflowId).toBe("string");

    const parsed = JSON.parse(actor.getSnapshot().context.jsonContent);
    expect(parsed.name).toBe("Copy of Debate Workflow");
  });

  it("should handle JSON edit actions and track dirtiness", async () => {
    const actor = createActor(workflowEditorMachine, {
      input: { workflowId: null },
    }).start();

    await waitFor(actor, (state) => state.matches({ editing: "clean" }), { timeout: 1000 });

    const originalContent = actor.getSnapshot().context.originalContent;

    actor.send({ type: "EDIT_JSON", content: "invalid json" });
    expect(actor.getSnapshot().matches({ editing: "dirty" })).toBe(true);
    expect(actor.getSnapshot().context.isDirty).toBe(true);

    // Revert back
    actor.send({ type: "EDIT_JSON", content: originalContent });
    expect(actor.getSnapshot().matches({ editing: "clean" })).toBe(true);
    expect(actor.getSnapshot().context.isDirty).toBe(false);
  });

  it("should fail validation for invalid JSON", async () => {
    const actor = createActor(workflowEditorMachine, {
      input: { workflowId: null },
    }).start();

    await waitFor(actor, (state) => state.matches({ editing: "clean" }), { timeout: 1000 });

    actor.send({ type: "EDIT_JSON", content: "{" });
    actor.send({ type: "SAVE" });

    expect(actor.getSnapshot().matches({ editing: "dirty" })).toBe(true);
    expect(actor.getSnapshot().context.validationErrors.length).toBeGreaterThan(0);
    expect(actor.getSnapshot().context.validationErrors[0]).toContain("JSON Syntax Error");
  });

  it("should fail validation for schema validation errors (Zod/Structural)", async () => {
    const actor = createActor(workflowEditorMachine, {
      input: { workflowId: null },
    }).start();

    await waitFor(actor, (state) => state.matches({ editing: "clean" }), { timeout: 1000 });

    const invalidConfig = {
      name: "",
      description: "My custom workflow",
      nodes: [],
      edges: [],
    };

    actor.send({ type: "EDIT_JSON", content: JSON.stringify(invalidConfig, null, 2) });
    actor.send({ type: "SAVE" });

    expect(actor.getSnapshot().matches({ editing: "dirty" })).toBe(true);
    expect(actor.getSnapshot().context.validationErrors.length).toBeGreaterThan(0);
  });

  it("should perform structural validation checks and report failures (e.g. isolated nodes)", async () => {
    const actor = createActor(workflowEditorMachine, {
      input: { workflowId: null },
    }).start();

    await waitFor(actor, (state) => state.matches({ editing: "clean" }), { timeout: 1000 });

    const invalidStructuralConfig = {
      name: "Bad Graph",
      description: "Has isolated node",
      nodes: [
        { id: "input", type: "input", name: "Input Node" },
        { id: "agent", type: "agent", name: "Agent Node", systemPrompt: "Hello", tools: [] },
        { id: "isolated", type: "agent", name: "Isolated Node", systemPrompt: "Hello", tools: [] },
      ],
      edges: [{ from: "input", to: "agent" }],
    };

    actor.send({ type: "EDIT_JSON", content: JSON.stringify(invalidStructuralConfig, null, 2) });
    actor.send({ type: "SAVE" });

    expect(actor.getSnapshot().matches({ editing: "dirty" })).toBe(true);
    expect(actor.getSnapshot().context.validationErrors).toContain(
      "Node 'isolated' is unreachable or isolated from the entry point.",
    );
  });

  it("should save successfully when workflow is valid", async () => {
    const actor = createActor(workflowEditorMachine, {
      input: { workflowId: null },
    }).start();

    await waitFor(actor, (state) => state.matches({ editing: "clean" }), { timeout: 1000 });

    const validConfig = {
      name: "My Valid Custom Workflow",
      description: "A valid workflow",
      nodes: [
        { id: "input", type: "input", name: "Input Node" },
        { id: "agent", type: "agent", name: "Agent Node", systemPrompt: "Hello", tools: [] },
      ],
      edges: [{ from: "input", to: "agent" }],
    };

    actor.send({ type: "EDIT_JSON", content: JSON.stringify(validConfig, null, 2) });
    actor.send({ type: "SAVE" });

    // Wait for validation and saving transitions
    await waitFor(actor, (state) => state.matches({ editing: "clean" }), { timeout: 1000 });

    expect(actor.getSnapshot().matches({ editing: "clean" })).toBe(true);
    expect(actor.getSnapshot().context.isDirty).toBe(false);
    expect(actor.getSnapshot().context.workflowId).toBeDefined();

    const allWorkflows = await db.getAllWorkflows();
    expect(allWorkflows.length).toBe(1);
    expect(allWorkflows[0].name).toBe("My Valid Custom Workflow");
  });
});
