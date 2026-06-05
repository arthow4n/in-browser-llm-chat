import { describe, it, expect, beforeEach, vi } from "vitest";
import { createActor } from "xstate";
import { workflowListMachine } from "./workflowListMachine.js";
import * as db from "../../db/db.js";
import "fake-indexeddb/auto";

vi.mock("../../db/db", async () => {
  const actual = await vi.importActual("../../db/db");
  return {
    ...actual,
    getAllWorkflows: vi.fn<() => Promise<db.WorkflowStore[]>>(),
    deleteWorkflow: vi.fn<(id: string) => Promise<void>>(),
  };
});

describe("workflowListMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(db.getAllWorkflows).mockResolvedValue(mockWorkflows);

    const actor = createActor(workflowListMachine).start();

    // Wait for the initial invoke to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe("idle");
    // Default sorting is by name asc
    expect(actor.getSnapshot().context.workflows).toEqual([
      mockWorkflows[1], // A Workflow
      mockWorkflows[0], // B Workflow
      mockWorkflows[2], // C Workflow
    ]);
    expect(actor.getSnapshot().context.totalCount).toBe(3);

    // Test search
    actor.send({ type: "UPDATE_SEARCH", query: "query matches" });
    expect(actor.getSnapshot().value).toBe("loading");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.workflows).toEqual([mockWorkflows[1]]);
    expect(actor.getSnapshot().context.totalCount).toBe(1);

    // Reset search, change page size and sort
    actor.send({ type: "UPDATE_SEARCH", query: "" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    actor.send({ type: "CHANGE_SORT", sortBy: "name", sortOrder: "desc" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actor.getSnapshot().context.workflows).toEqual([
      mockWorkflows[2], // C Workflow
      mockWorkflows[0], // B Workflow
      mockWorkflows[1], // A Workflow
    ]);
  });

  it("should handle fetch errors", async () => {
    vi.mocked(db.getAllWorkflows).mockRejectedValue(new Error("Database error"));

    const actor = createActor(workflowListMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actor.getSnapshot().value).toBe("error");
    expect(actor.getSnapshot().context.errorMessage).toBe("Database error");
  });

  it("should handle workflow deletion success", async () => {
    vi.mocked(db.deleteWorkflow).mockResolvedValue(undefined);
    vi.mocked(db.getAllWorkflows).mockResolvedValue([]);

    const actor = createActor(workflowListMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0)); // complete initial load

    actor.send({ type: "TRIGGER_DELETE", workflowId: "w2" });
    expect(actor.getSnapshot().value).toBe("deleting");
    expect(actor.getSnapshot().context.deletingWorkflowId).toBe("w2");

    await new Promise((resolve) => setTimeout(resolve, 0)); // complete delete & refetch
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.deletingWorkflowId).toBeNull();
  });

  it("should handle workflow deletion error (safety guards)", async () => {
    vi.mocked(db.deleteWorkflow).mockRejectedValue(new Error("Cannot delete built-in workflows."));

    const actor = createActor(workflowListMachine).start();
    await new Promise((resolve) => setTimeout(resolve, 0)); // complete initial load

    actor.send({ type: "TRIGGER_DELETE", workflowId: "built-in-id" });
    await new Promise((resolve) => setTimeout(resolve, 0)); // complete delete action

    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.errorMessage).toBe("Cannot delete built-in workflows.");
    expect(actor.getSnapshot().context.deletingWorkflowId).toBeNull();
  });
});
