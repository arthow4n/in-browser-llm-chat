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

  it("should validate the built-in Debate Workflow with zero errors", () => {
    const debateWorkflow: Workflow = {
      id: "debate",
      name: "Debate",
      description:
        "A multi-agent debate workflow. Seed the debate with a topic, then let two agents debate in a loop until consensus is reached or the round limit is hit.",
      isBuiltIn: true,
      nodes: [
        { id: "input", type: "input", name: "Topic Input" },
        {
          id: "initiator",
          type: "agent",
          name: "Initiator",
          systemPrompt: "Moderate the debate on {{topic}}.",
        },
        {
          id: "Debater_A",
          type: "agent",
          name: "Debater A",
          systemPrompt: "Argue for {{topic}}.",
          loopHeader: true,
          tools: ["declare_consensus"],
          excludeToolsBeforeRound: { declare_consensus: 3 },
        },
        {
          id: "Debater_B",
          type: "agent",
          name: "Debater B",
          systemPrompt: "Argue against {{topic}}.",
          tools: ["declare_consensus"],
          excludeToolsBeforeRound: { declare_consensus: 3 },
        },
        { id: "debate_tool", type: "tool", name: "Debate Tool Executor" },
        {
          id: "Consensus_Evaluator_A",
          type: "consensus_check",
          name: "Consensus Evaluator A",
          systemPrompt: '{"consensusReached": false}',
          maxLoopLimit: 5,
        },
        {
          id: "Consensus_Evaluator_B",
          type: "consensus_check",
          name: "Consensus Evaluator B",
          systemPrompt: '{"consensusReached": false}',
          maxLoopLimit: 5,
        },
        {
          id: "summarizer",
          type: "summary",
          name: "Summarizer",
          systemPrompt: "Summarize the debate.",
        },
      ],
      edges: [
        { source: "input", target: "initiator" },
        { source: "initiator", target: "Debater_A" },
        { source: "Debater_A", target: "debate_tool", condition: "on_tool_call" },
        { source: "Debater_A", target: "Consensus_Evaluator_A" },
        { source: "Debater_B", target: "debate_tool", condition: "on_tool_call" },
        { source: "Debater_B", target: "Consensus_Evaluator_B" },
        { source: "debate_tool", target: "Debater_A", condition: "on_tool_result" },
        { source: "debate_tool", target: "Debater_B", condition: "on_tool_result" },
        { source: "Consensus_Evaluator_A", target: "Debater_B", condition: "on_no_consensus" },
        { source: "Consensus_Evaluator_A", target: "summarizer", condition: "on_consensus" },
        { source: "Consensus_Evaluator_B", target: "Debater_A", condition: "on_no_consensus" },
        { source: "Consensus_Evaluator_B", target: "summarizer", condition: "on_consensus" },
      ],
    };
    const errors = validateWorkflowStructure(debateWorkflow);
    expect(errors).toEqual([]);
  });
});
