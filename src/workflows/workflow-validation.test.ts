import { describe, it, expect } from "vitest";
import { validateWorkflowStructure } from "./workflow-validation";
import type { Workflow } from "../db/db-schema";

describe("Workflow Structural Validation", () => {
  it("should validate a correct single-agent workflow", () => {
    const wf: Workflow = {
      id: "wf1",
      name: "Single Agent",
      description: "description",
      isBuiltIn: false,
      nodes: [
        { id: "input-node", type: "input", name: "User Input" },
        { id: "agent-node", type: "agent", name: "Agent" },
      ],
      edges: [{ source: "input-node", target: "agent-node" }],
    };
    const errors = validateWorkflowStructure(wf);
    expect(errors).toEqual([]);
  });

  it("should detect duplicate node IDs", () => {
    const wf: Workflow = {
      id: "wf1",
      name: "Duplicate",
      description: "description",
      isBuiltIn: false,
      nodes: [
        { id: "agent-node", type: "agent", name: "Agent 1" },
        { id: "agent-node", type: "agent", name: "Agent 2" },
      ],
      edges: [],
    };
    const errors = validateWorkflowStructure(wf);
    expect(errors).toContain('Duplicate node ID: "agent-node"');
  });

  it("should detect invalid edge references", () => {
    const wf: Workflow = {
      id: "wf1",
      name: "Invalid Edge",
      description: "description",
      isBuiltIn: false,
      nodes: [{ id: "input-node", type: "input", name: "User Input" }],
      edges: [{ source: "input-node", target: "non-existent" }],
    };
    const errors = validateWorkflowStructure(wf);
    expect(errors).toContain('Edge at index 0 has invalid target ID: "non-existent"');
  });

  it("should detect unreachable nodes", () => {
    const wf: Workflow = {
      id: "wf1",
      name: "Unreachable",
      description: "description",
      isBuiltIn: false,
      nodes: [
        { id: "input-node", type: "input", name: "User Input" },
        { id: "agent1", type: "agent", name: "Agent 1" },
        { id: "agent2", type: "agent", name: "Agent 2" },
      ],
      edges: [{ source: "input-node", target: "agent1" }],
    };
    const errors = validateWorkflowStructure(wf);
    expect(errors).toContain('Node "agent2" is unreachable from the entry node "input-node".');
  });

  it("should detect multiple entry points", () => {
    const wf: Workflow = {
      id: "wf1",
      name: "Multiple Entry",
      description: "description",
      isBuiltIn: false,
      nodes: [
        { id: "input1", type: "input", name: "User Input 1" },
        { id: "input2", type: "input", name: "User Input 2" },
      ],
      edges: [],
    };
    const errors = validateWorkflowStructure(wf);
    expect(errors.join(" ")).toContain('Found multiple: "input1", "input2"');
  });

  it("should check agent-tool wiring", () => {
    const wf: Workflow = {
      id: "wf1",
      name: "Agent Tool Wiring",
      description: "description",
      isBuiltIn: false,
      nodes: [
        { id: "input-node", type: "input", name: "User Input" },
        { id: "agent-node", type: "agent", name: "Agent", tools: ["ask_questions"] },
        { id: "tool-node", type: "tool", name: "Ask Questions Tool" },
      ],
      edges: [
        { source: "input-node", target: "agent-node" },
        { source: "agent-node", target: "tool-node", condition: "on_tool_call" },
        // Missing the back edge from tool-node to agent-node
      ],
    };
    const errors = validateWorkflowStructure(wf);
    expect(errors.join(" ")).toContain(
      'Tool node "tool-node" lacks an "on_tool_result" back-edge to calling agent node "agent-node".',
    );
  });

  it("should enforce loop exit capabilities", () => {
    const wf: Workflow = {
      id: "wf1",
      name: "Loop Without Exit",
      description: "description",
      isBuiltIn: false,
      nodes: [
        { id: "input-node", type: "input", name: "User Input" },
        { id: "agent1", type: "agent", name: "Agent 1" },
        { id: "agent2", type: "agent", name: "Agent 2" },
      ],
      edges: [
        { source: "input-node", target: "agent1" },
        { source: "agent1", target: "agent2" },
        { source: "agent2", target: "agent1" },
      ],
    };
    const errors = validateWorkflowStructure(wf);
    expect(errors.join(" ")).toContain("Loop detected without any loop exit capabilities");
  });
});
