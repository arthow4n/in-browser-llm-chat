import { describe, it, expect, beforeEach, vi } from "vitest";
import { createActor, waitFor } from "xstate";
import { workflowListMachine } from "./workflowListMachine.js";
import * as db from "../../db/db.js";
import { BUILT_IN_WORKFLOWS } from "../../workflow/builtInWorkflows.js";

describe("workflowListMachine", () => {
  beforeEach(async () => {
    await db.clearWorkflows();
  });

  it("should start in loading state", () => {
    const actor = createActor(workflowListMachine).start();
    expect(actor.getSnapshot().value).toBe("loading");
  });

  it("should fetch, filter, sort and paginate workflows, then transition to idle", async () => {
    const mockWorkflows: db.WorkflowStore[] = [
      {
        id: "w2",
        name: "B Workflow",
        description: "First desc",
        isBuiltIn: false,
        nodes: [],
        edges: [],
      },
      {
        id: "w1",
        name: "A Workflow",
        description: "Second description query matches",
        isBuiltIn: true,
        nodes: [],
        edges: [],
      },
      {
        id: "w3",
        name: "C Workflow",
        description: "Third desc",
        isBuiltIn: false,
        nodes: [],
        edges: [],
      },
    ];
    for (const wf of mockWorkflows) {
      await db.saveWorkflow(wf);
    }

    const actor = createActor(workflowListMachine).start();

    // Wait for the initial invoke to complete
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 });

    expect(actor.getSnapshot().value).toBe("idle");
    // Default sorting is by name asc
    const workflows = actor.getSnapshot().context.workflows;
    const customWorkflows = workflows.filter((w) => !w.isBuiltIn);
    const builtInWorkflows = workflows.filter((w) => w.isBuiltIn);

    expect(customWorkflows).toEqual([
      mockWorkflows[0], // B Workflow
      mockWorkflows[2], // C Workflow
    ]);
    expect(builtInWorkflows).toEqual(
      [...BUILT_IN_WORKFLOWS].sort((a, b) => a.name.localeCompare(b.name)),
    );
    expect(actor.getSnapshot().context.totalCount).toBe(2 + BUILT_IN_WORKFLOWS.length);

    // Test search
    actor.send({ type: "UPDATE_SEARCH", query: "query matches" });
    expect(actor.getSnapshot().value).toBe("loading");
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.workflows).toEqual([]);
    expect(actor.getSnapshot().context.totalCount).toBe(0);

    // Reset search, change page size and sort
    actor.send({ type: "UPDATE_SEARCH", query: "" });
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 });
    actor.send({ type: "CHANGE_SORT", sortBy: "name", sortOrder: "desc" });
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 });

    const sortedWorkflows = actor.getSnapshot().context.workflows;
    expect(sortedWorkflows[0].name).toBe("Standard Agent"); // Standard Agent > Debate Workflow > C Workflow > B Workflow
    expect(sortedWorkflows[sortedWorkflows.length - 1].name).toBe("B Workflow");
  });

  it("should handle fetch errors", async () => {
    const workflowService = await import("../../workflow/workflowService.js");
    const spy = vi
      .spyOn(workflowService, "getEffectiveWorkflows")
      .mockRejectedValue(new Error("Database error"));

    const actor = createActor(workflowListMachine).start();
    await waitFor(actor, (state) => state.matches("error"), { timeout: 1000 });

    expect(actor.getSnapshot().value).toBe("error");
    expect(actor.getSnapshot().context.errorMessage).toBe("Database error");

    spy.mockRestore();
  });

  it("should handle workflow deletion success", async () => {
    const workflowId = "w2";
    await db.saveWorkflow({
      id: workflowId,
      name: "TBD",
      description: "",
      isBuiltIn: false,
      nodes: [],
      edges: [],
    });

    const actor = createActor(workflowListMachine).start();
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 }); // complete initial load

    actor.send({ type: "TRIGGER_DELETE", workflowId });
    expect(actor.getSnapshot().value).toBe("deleting");
    expect(actor.getSnapshot().context.deletingWorkflowId).toBe(workflowId);

    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 }); // complete delete & refetch
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.deletingWorkflowId).toBeNull();
    expect(await db.getWorkflow(workflowId)).toBeUndefined();
  });

  it("should handle workflow deletion error (safety guards)", async () => {
    const workflowId = "built-in-id";
    await db.saveWorkflow({
      id: workflowId,
      name: "Built-in",
      description: "",
      isBuiltIn: true,
      nodes: [],
      edges: [],
    });

    const actor = createActor(workflowListMachine).start();
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 }); // complete initial load

    actor.send({ type: "TRIGGER_DELETE", workflowId });
    await waitFor(actor, (state) => state.matches("idle"), { timeout: 1000 }); // complete delete action

    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.errorMessage).toBe("Cannot delete built-in workflows.");
    expect(actor.getSnapshot().context.deletingWorkflowId).toBeNull();
  });
});
