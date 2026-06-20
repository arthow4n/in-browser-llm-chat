import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { saveThread } from "../db/db-operations";
import type { Thread, Workflow } from "../db/db-schema";
import {
  getWorkflow,
  saveWorkflow,
  deleteWorkflow,
  listWorkflows,
  BUILT_IN_WORKFLOWS,
} from "./workflows-service";

describe("Workflows CRUD Service", () => {
  beforeEach(async () => {
    resetDBConnection();
    const db = await getDB();
    const storeNames = Array.from(db.objectStoreNames);
    for (const name of storeNames) {
      await db.clear(name);
    }
  });

  afterEach(async () => {
    const db = await getDB();
    db.close();
    resetDBConnection();
  });

  it("should get a built-in workflow", async () => {
    const wf = await getWorkflow("standard-1-agent");
    expect(wf).toBeDefined();
    expect(wf?.isBuiltIn).toBe(true);
    expect(wf?.id).toBe("standard-1-agent");
  });

  it("should perform CRUD on custom workflows", async () => {
    const customId = "custom-wf-1";
    const newWorkflow: Workflow = {
      id: customId,
      name: "Custom Workflow",
      description: "A custom user workflow.",
      isBuiltIn: false,
      nodes: [{ id: "custom-agent", type: "agent", name: "Custom Agent" }],
      edges: [],
    };

    await saveWorkflow(newWorkflow);

    const retrieved = await getWorkflow(customId);
    expect(retrieved).toEqual(newWorkflow);

    const allWorkflows = await listWorkflows();
    // Should contain built-ins + custom workflow
    expect(allWorkflows.length).toBe(BUILT_IN_WORKFLOWS.length + 1);
    expect(allWorkflows.find((w) => w.id === customId)).toBeDefined();

    await deleteWorkflow(customId);
    const afterDelete = await getWorkflow(customId);
    expect(afterDelete).toBeUndefined();
  });

  it("should prevent modification/deletion of built-in workflows", async () => {
    await expect(deleteWorkflow("standard-1-agent")).rejects.toThrow(
      "Cannot delete built-in workflows.",
    );

    const updatedBuiltIn: Workflow = {
      id: "standard-1-agent",
      name: "Mutated Standard 1-Agent",
      description: "Mutated description.",
      isBuiltIn: true,
      nodes: [],
      edges: [],
    };

    await expect(saveWorkflow(updatedBuiltIn)).rejects.toThrow("Cannot modify built-in workflows.");
  });

  it("should prevent deletion of a custom workflow that is currently in use by an active thread", async () => {
    const customId = "custom-wf-in-use";
    const customWf: Workflow = {
      id: customId,
      name: "Custom WF In Use",
      description: "Used by a thread.",
      isBuiltIn: false,
      nodes: [{ id: "n1", type: "agent", name: "Agent" }],
      edges: [],
    };

    await saveWorkflow(customWf);

    const threadId = "44444444-4444-4444-4444-444444444444";
    const activeThread: Thread = {
      id: threadId,
      title: "Active Chat using Custom WF",
      workflowId: customId,
      workflowSnapshot: customWf,
      activePresetId: "11111111-1111-1111-1111-111111111111",
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
    };

    await saveThread(activeThread);

    await expect(deleteWorkflow(customId)).rejects.toThrow(
      /Cannot delete workflow currently in use by active threads/,
    );

    // After deleting the thread, the workflow should be deletable
    // (Note that thread deletion triggers cascading deletes for messages, etc., but here we just delete the thread itself)
    const db = await getDB();
    await db.delete("threads", threadId);

    await expect(deleteWorkflow(customId)).resolves.not.toThrow();
  });

  it("should return the built-in debate workflow and protect it from deletion/modification", async () => {
    const debateWf = await getWorkflow("debate");
    expect(debateWf).toBeDefined();
    expect(debateWf?.isBuiltIn).toBe(true);
    expect(debateWf?.id).toBe("debate");

    // Should have an input node
    expect(debateWf?.nodes.some((n) => n.id === "input" && n.type === "input")).toBe(true);

    // Should have both debaters with declare_consensus tool
    const debaterA = debateWf?.nodes.find((n) => n.id === "Debater_A");
    expect(debaterA?.tools).toContain("declare_consensus");

    const debaterB = debateWf?.nodes.find((n) => n.id === "Debater_B");
    expect(debaterB?.tools).toContain("declare_consensus");

    // Should have a tool node for declare_consensus
    expect(debateWf?.nodes.some((n) => n.id === "debate_tool" && n.type === "tool")).toBe(true);

    // Should have two consensus_check evaluators
    const evaluators = debateWf?.nodes.filter((n) => n.type === "consensus_check") ?? [];
    expect(evaluators).toHaveLength(2);

    // Should have a summarizer
    expect(debateWf?.nodes.some((n) => n.id === "summarizer" && n.type === "summary")).toBe(true);

    // Deletion must be rejected
    await expect(deleteWorkflow("debate")).rejects.toThrow("Cannot delete built-in workflows.");

    // Modification must be rejected
    await expect(
      saveWorkflow({ ...(debateWf as Workflow), name: "Hacked Debate" }),
    ).rejects.toThrow("Cannot modify built-in workflows.");
  });
});
