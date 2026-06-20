import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { createActor } from "xstate";
import type { ActorRefFrom } from "xstate";
import { workflowEditorMachine } from "./workflow-editor-machine";
import type { Workflow } from "../db/db-schema";
import { getWorkflow } from "./workflows-service";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";

describe("Workflow Editor State Machine", () => {
  let actor: ActorRefFrom<typeof workflowEditorMachine> | null = null;
  let db: IDBPDatabase<InBrowserLlmChatDB> | null = null;

  beforeAll(async () => {
    resetDBConnection();
    db = await getDB();
  });

  afterAll(async () => {
    if (db) {
      db.close();
    }
    resetDBConnection();
  });

  beforeEach(async () => {
    const storeNames = Array.from(db!.objectStoreNames);
    for (const name of storeNames) {
      await db!.clear(name);
    }
  });

  afterEach(async () => {
    if (actor) {
      actor.stop();
      actor = null;
    }
  });

  const validWorkflow: Workflow = {
    id: "test-workflow",
    name: "Test Workflow",
    description: "A test workflow",
    isBuiltIn: false,
    nodes: [{ id: "n1", type: "agent", name: "Agent 1" }],
    edges: [],
  };

  it("should initialize in idle state", () => {
    actor = createActor(workflowEditorMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("should load a built-in workflow in viewing mode", () => {
    actor = createActor(workflowEditorMachine).start();
    const content = JSON.stringify(validWorkflow);
    actor.send({
      type: "LOAD_WORKFLOW",
      id: "test-workflow",
      content,
      isBuiltIn: true,
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("viewing");
    expect(snapshot.context.isBuiltIn).toBe(true);
    expect(snapshot.context.jsonContent).toBe(content);
  });

  it("should load a custom workflow in editing mode", () => {
    actor = createActor(workflowEditorMachine).start();
    const content = JSON.stringify(validWorkflow);
    actor.send({
      type: "LOAD_WORKFLOW",
      id: "test-workflow",
      content,
      isBuiltIn: false,
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toEqual({ editing: "clean" });
    expect(snapshot.context.isBuiltIn).toBe(false);
    expect(snapshot.context.jsonContent).toBe(content);
  });

  it("should validate and save custom workflow", async () => {
    actor = createActor(workflowEditorMachine).start();
    const content = JSON.stringify(validWorkflow);
    actor.send({
      type: "LOAD_WORKFLOW",
      id: "test-workflow",
      content,
      isBuiltIn: false,
    });

    actor.send({
      type: "EDIT_JSON",
      content: JSON.stringify({ ...validWorkflow, name: "Updated Test Workflow" }),
    });

    expect(actor.getSnapshot().value).toEqual({ editing: "dirty" });

    actor.send({ type: "SAVE" });

    // Wait for the asynchronous transitions to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("idle");
    expect(snapshot.context.isDirty).toBe(false);

    // Verify it is saved in db
    const saved = await getWorkflow("test-workflow");
    expect(saved).toBeDefined();
    expect(saved?.name).toBe("Updated Test Workflow");
  });

  it("should fail validation for invalid JSON syntax", async () => {
    actor = createActor(workflowEditorMachine).start();
    actor.send({
      type: "LOAD_WORKFLOW",
      id: "test-workflow",
      content: JSON.stringify(validWorkflow),
      isBuiltIn: false,
    });

    actor.send({
      type: "EDIT_JSON",
      content: "{ invalid json",
    });

    actor.send({ type: "SAVE" });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toEqual({ editing: "dirty" });
    expect(snapshot.context.validationErrors.length).toBeGreaterThan(0);
    expect(snapshot.context.validationErrors[0]).toContain("Invalid JSON syntax");
  });
});
