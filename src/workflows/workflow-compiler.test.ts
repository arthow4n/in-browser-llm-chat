import { describe, it, expect } from "vitest";
import type { Workflow } from "../db/db-schema";
import { compileWorkflow, resolvePlaceholders } from "./workflow-compiler";
import type { GraphState } from "./workflow-compiler";

// ---------------------------------------------------------------------------
// Helper: minimal GraphState factory
// ---------------------------------------------------------------------------
function makeState(overrides: Partial<GraphState> = {}): GraphState {
  return {
    messages: [],
    lastAgentId: null,
    consensusReached: false,
    forceSummarize: false,
    turnCount: 0,
    currentRound: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolvePlaceholders tests
// ---------------------------------------------------------------------------
describe("resolvePlaceholders", () => {
  it("replaces {{user_input}} with the first user message content", () => {
    const messages = [{ role: "user", content: "Tell me about AI." }];
    const result = resolvePlaceholders("Topic: {{user_input}}", messages);
    expect(result).toBe("Topic: Tell me about AI.");
  });

  it("replaces {{topic}} as an alias for the first user message", () => {
    const messages = [{ role: "user", content: "Climate Change" }];
    const result = resolvePlaceholders("Debate {{topic}} now.", messages);
    expect(result).toBe("Debate Climate Change now.");
  });

  it("falls back to empty string when no user message exists", () => {
    const result = resolvePlaceholders("Topic: {{topic}}", []);
    expect(result).toBe("Topic: ");
  });

  it("replaces custom variables from the variables map", () => {
    const result = resolvePlaceholders("Hello {{name}}!", [], { name: "Alice" });
    expect(result).toBe("Hello Alice!");
  });

  it("leaves unknown placeholders unchanged", () => {
    const result = resolvePlaceholders("Value: {{unknown_key}}", []);
    expect(result).toBe("Value: {{unknown_key}}");
  });

  it("handles templates with no placeholders unchanged", () => {
    const result = resolvePlaceholders("No placeholders here.", []);
    expect(result).toBe("No placeholders here.");
  });

  it("replaces multiple different placeholders in one pass", () => {
    const messages = [{ role: "user", content: "Space Exploration" }];
    const result = resolvePlaceholders(
      "Topic: {{topic}} - Input: {{user_input}} - Custom: {{x}}",
      messages,
      { x: "42" },
    );
    expect(result).toBe("Topic: Space Exploration - Input: Space Exploration - Custom: 42");
  });

  it("variables map overrides built-in topic placeholder", () => {
    const messages = [{ role: "user", content: "original topic" }];
    const result = resolvePlaceholders("{{topic}}", messages, { topic: "overridden topic" });
    expect(result).toBe("overridden topic");
  });
});

// ---------------------------------------------------------------------------
// compileWorkflow – entry node resolution
// ---------------------------------------------------------------------------
describe("compileWorkflow – entry node resolution", () => {
  it("uses the input node as the entry node", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "input-node", type: "input", name: "Input" },
        { id: "agent-node", type: "agent", name: "Agent" },
      ],
      edges: [{ source: "input-node", target: "agent-node" }],
    };
    const graph = compileWorkflow(workflow);
    expect(graph.entryNodeId).toBe("input-node");
  });

  it("falls back to the node with no incoming edges when no input node exists", () => {
    const workflow: Workflow = {
      id: "w2",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "start-agent", type: "agent", name: "StartAgent" },
        { id: "end-agent", type: "agent", name: "EndAgent" },
      ],
      edges: [{ source: "start-agent", target: "end-agent" }],
    };
    const graph = compileWorkflow(workflow);
    expect(graph.entryNodeId).toBe("start-agent");
  });

  it("throws when no entry node is found (all nodes have incoming edges)", () => {
    // Circular with no entry
    const workflow: Workflow = {
      id: "w3",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "a", type: "agent", name: "A" },
        { id: "b", type: "agent", name: "B" },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ],
    };
    expect(() => compileWorkflow(workflow)).toThrow(/no entry node/);
  });

  it("throws when multiple entry nodes exist", () => {
    const workflow: Workflow = {
      id: "w4",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "input-1", type: "input", name: "I1" },
        { id: "input-2", type: "input", name: "I2" },
      ],
      edges: [],
    };
    expect(() => compileWorkflow(workflow)).toThrow(/multiple entry nodes/);
  });

  it("throws when the workflow has no nodes", () => {
    const workflow: Workflow = {
      id: "w5",
      name: "Empty",
      description: "",
      isBuiltIn: false,
      nodes: [],
      edges: [],
    };
    expect(() => compileWorkflow(workflow)).toThrow(/no nodes/);
  });
});

// ---------------------------------------------------------------------------
// compileWorkflow – compiled node kinds
// ---------------------------------------------------------------------------
describe("compileWorkflow – compiled node kinds", () => {
  it("compiles an agent node with expected kind and fields", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "entry", type: "input", name: "Entry" },
        {
          id: "a1",
          type: "agent",
          name: "MyAgent",
          systemPrompt: "Be helpful.",
          presetId: "preset-123",
          tools: ["ask_questions"],
          maxHistoryMessages: 10,
          loopHeader: true,
        },
        { id: "tool1", type: "tool", name: "Tool" },
      ],
      edges: [
        { source: "entry", target: "a1" },
        { source: "a1", target: "tool1", condition: "on_tool_call" },
        { source: "a1", target: "entry" },
        { source: "tool1", target: "a1", condition: "on_tool_result" },
      ],
    };
    const graph = compileWorkflow(workflow);
    const node = graph.nodes.get("a1")!;
    const agentAction = node.action as Extract<typeof node.action, { kind: "agent" }>;
    expect(agentAction.kind).toBe("agent");
    expect(agentAction.nodeName).toBe("MyAgent");
    expect(agentAction.systemPrompt).toBe("Be helpful.");
    expect(agentAction.presetId).toBe("preset-123");
    expect(agentAction.tools).toEqual(["ask_questions"]);
    expect(agentAction.maxHistoryMessages).toBe(10);
    expect(agentAction.loopHeader).toBe(true);
  });

  it("compiles an input node with kind 'input'", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "inp", type: "input", name: "Input" },
        { id: "ag", type: "agent", name: "Agent" },
      ],
      edges: [{ source: "inp", target: "ag" }],
    };
    const graph = compileWorkflow(workflow);
    expect(graph.nodes.get("inp")!.action.kind).toBe("input");
  });

  it("compiles a tool node with kind 'tool'", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "entry", type: "input", name: "Entry" },
        { id: "ag", type: "agent", name: "Agent", tools: ["ask_questions"] },
        { id: "t1", type: "tool", name: "Tool" },
      ],
      edges: [
        { source: "entry", target: "ag" },
        { source: "ag", target: "t1", condition: "on_tool_call" },
        { source: "ag", target: "entry" },
        { source: "t1", target: "ag", condition: "on_tool_result" },
      ],
    };
    const graph = compileWorkflow(workflow);
    expect(graph.nodes.get("t1")!.action.kind).toBe("tool");
  });

  it("compiles a consensus_check node with default maxLoopLimit of 5", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "entry", type: "input", name: "Entry" },
        { id: "ag", type: "agent", name: "Agent" },
        {
          id: "cc",
          type: "consensus_check",
          name: "Check",
          systemPrompt: "Evaluate consensus.",
        },
        { id: "sum", type: "summary", name: "Summary" },
      ],
      edges: [
        { source: "entry", target: "ag" },
        { source: "ag", target: "cc" },
        { source: "cc", target: "sum", condition: "on_consensus" },
        { source: "cc", target: "ag", condition: "on_no_consensus" },
      ],
    };
    const graph = compileWorkflow(workflow);
    const node = graph.nodes.get("cc")!;
    const ccAction = node.action as Extract<typeof node.action, { kind: "consensus_check" }>;
    expect(ccAction.kind).toBe("consensus_check");
    expect(ccAction.maxLoopLimit).toBe(5);
    expect(ccAction.systemPrompt).toBe("Evaluate consensus.");
  });

  it("respects custom maxLoopLimit on consensus_check nodes", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "entry", type: "input", name: "Entry" },
        { id: "ag", type: "agent", name: "Agent" },
        { id: "cc", type: "consensus_check", name: "Check", maxLoopLimit: 10 },
        { id: "sum", type: "summary", name: "Summary" },
      ],
      edges: [
        { source: "entry", target: "ag" },
        { source: "ag", target: "cc" },
        { source: "cc", target: "sum", condition: "on_consensus" },
        { source: "cc", target: "ag", condition: "on_no_consensus" },
      ],
    };
    const graph = compileWorkflow(workflow);
    const node = graph.nodes.get("cc")!;
    const ccAction = node.action as Extract<typeof node.action, { kind: "consensus_check" }>;
    expect(ccAction.maxLoopLimit).toBe(10);
  });

  it("compiles a summary node with kind 'summary'", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "ag", type: "agent", name: "Agent" },
        { id: "sum", type: "summary", name: "Summarizer", systemPrompt: "Summarize." },
      ],
      edges: [{ source: "ag", target: "sum" }],
    };
    const graph = compileWorkflow(workflow);
    const node = graph.nodes.get("sum")!;
    const sumAction = node.action as Extract<typeof node.action, { kind: "summary" }>;
    expect(sumAction.kind).toBe("summary");
    expect(sumAction.systemPrompt).toBe("Summarize.");
    expect(sumAction.nodeName).toBe("Summarizer");
  });

  it("throws on unknown node type", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [{ id: "weird", type: "unknown_type", name: "Weird" }],
      edges: [],
    };
    expect(() => compileWorkflow(workflow)).toThrow(/unknown node type/);
  });
});

// ---------------------------------------------------------------------------
// compileWorkflow – routing
// ---------------------------------------------------------------------------
describe("compileWorkflow – routing", () => {
  it("agent without tools routes to unconditional edge", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "ag", type: "agent", name: "A" },
        { id: "inp", type: "input", name: "Input" },
      ],
      edges: [{ source: "ag", target: "inp" }],
    };
    const graph = compileWorkflow(workflow);
    const agNode = graph.nodes.get("ag")!;
    expect(agNode.route(makeState())).toBe("inp");
  });

  it("agent with tools routes to on_tool_call edge when last message is a tool call", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "ag", type: "agent", name: "A", tools: ["ask_questions"] },
        { id: "tl", type: "tool", name: "Tool" },
        { id: "inp", type: "input", name: "Input" },
      ],
      edges: [
        { source: "ag", target: "tl", condition: "on_tool_call" },
        { source: "ag", target: "inp" },
        { source: "tl", target: "ag", condition: "on_tool_result" },
      ],
    };
    const graph = compileWorkflow(workflow);
    const agNode = graph.nodes.get("ag")!;

    const stateWithToolCall = makeState({
      messages: [{ role: "assistant", tool_calls: [{ id: "tc-1" }] }],
    });
    expect(agNode.route(stateWithToolCall)).toBe("tl");
  });

  it("agent with tools routes to unconditional edge when last message is NOT a tool call", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "ag", type: "agent", name: "A", tools: ["ask_questions"] },
        { id: "tl", type: "tool", name: "Tool" },
        { id: "inp", type: "input", name: "Input" },
      ],
      edges: [
        { source: "ag", target: "tl", condition: "on_tool_call" },
        { source: "ag", target: "inp" },
        { source: "tl", target: "ag", condition: "on_tool_result" },
      ],
    };
    const graph = compileWorkflow(workflow);
    const agNode = graph.nodes.get("ag")!;

    const stateNoToolCall = makeState({
      messages: [{ role: "assistant", content: "Just text." }],
    });
    expect(agNode.route(stateNoToolCall)).toBe("inp");
  });

  it("tool node routes back to the agent matching lastAgentId via on_tool_result edge", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "entry", type: "input", name: "Entry" },
        { id: "ag1", type: "agent", name: "A1", tools: ["t1"] },
        { id: "ag2", type: "agent", name: "A2", tools: ["t1"] },
        { id: "t1", type: "tool", name: "Tool" },
      ],
      edges: [
        { source: "entry", target: "ag1" },
        { source: "ag1", target: "t1", condition: "on_tool_call" },
        { source: "ag1", target: "ag2" },
        { source: "ag2", target: "t1", condition: "on_tool_call" },
        { source: "ag2", target: "entry" },
        { source: "t1", target: "ag1", condition: "on_tool_result" },
        { source: "t1", target: "ag2", condition: "on_tool_result" },
      ],
    };
    const graph = compileWorkflow(workflow);
    const toolNode = graph.nodes.get("t1")!;

    expect(toolNode.route(makeState({ lastAgentId: "ag1" }))).toBe("ag1");
    expect(toolNode.route(makeState({ lastAgentId: "ag2" }))).toBe("ag2");
  });

  it("consensus_check routes on_consensus when consensusReached is true", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "entry", type: "input", name: "Entry" },
        { id: "ag", type: "agent", name: "Agent" },
        { id: "cc", type: "consensus_check", name: "CC" },
        { id: "sum", type: "summary", name: "Sum" },
      ],
      edges: [
        { source: "entry", target: "ag" },
        { source: "ag", target: "cc" },
        { source: "cc", target: "sum", condition: "on_consensus" },
        { source: "cc", target: "ag", condition: "on_no_consensus" },
      ],
    };
    const graph = compileWorkflow(workflow);
    const ccNode = graph.nodes.get("cc")!;

    expect(ccNode.route(makeState({ consensusReached: true }))).toBe("sum");
  });

  it("consensus_check routes on_consensus when forceSummarize is true", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "entry", type: "input", name: "Entry" },
        { id: "ag", type: "agent", name: "Agent" },
        { id: "cc", type: "consensus_check", name: "CC" },
        { id: "sum", type: "summary", name: "Sum" },
      ],
      edges: [
        { source: "entry", target: "ag" },
        { source: "ag", target: "cc" },
        { source: "cc", target: "sum", condition: "on_consensus" },
        { source: "cc", target: "ag", condition: "on_no_consensus" },
      ],
    };
    const graph = compileWorkflow(workflow);
    const ccNode = graph.nodes.get("cc")!;

    expect(ccNode.route(makeState({ forceSummarize: true }))).toBe("sum");
  });

  it("consensus_check routes on_consensus when currentRound >= maxLoopLimit", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "entry", type: "input", name: "Entry" },
        { id: "ag", type: "agent", name: "Agent" },
        { id: "cc", type: "consensus_check", name: "CC", maxLoopLimit: 3 },
        { id: "sum", type: "summary", name: "Sum" },
      ],
      edges: [
        { source: "entry", target: "ag" },
        { source: "ag", target: "cc" },
        { source: "cc", target: "sum", condition: "on_consensus" },
        { source: "cc", target: "ag", condition: "on_no_consensus" },
      ],
    };
    const graph = compileWorkflow(workflow);
    const ccNode = graph.nodes.get("cc")!;

    // At round 3, should terminate (>= maxLoopLimit of 3)
    expect(ccNode.route(makeState({ currentRound: 3 }))).toBe("sum");
    // At round 2, should continue
    expect(ccNode.route(makeState({ currentRound: 2 }))).toBe("ag");
  });

  it("consensus_check routes on_no_consensus when loop should continue", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "entry", type: "input", name: "Entry" },
        { id: "ag", type: "agent", name: "Agent" },
        { id: "cc", type: "consensus_check", name: "CC" },
        { id: "sum", type: "summary", name: "Sum" },
      ],
      edges: [
        { source: "entry", target: "ag" },
        { source: "ag", target: "cc" },
        { source: "cc", target: "sum", condition: "on_consensus" },
        { source: "cc", target: "ag", condition: "on_no_consensus" },
      ],
    };
    const graph = compileWorkflow(workflow);
    const ccNode = graph.nodes.get("cc")!;

    expect(ccNode.route(makeState({ currentRound: 1 }))).toBe("ag");
  });

  it("input node routes to the unconditional edge target", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "inp", type: "input", name: "Input" },
        { id: "ag", type: "agent", name: "Agent" },
      ],
      edges: [{ source: "inp", target: "ag" }],
    };
    const graph = compileWorkflow(workflow);
    const inpNode = graph.nodes.get("inp")!;
    expect(inpNode.route(makeState())).toBe("ag");
  });

  it("terminal node with no outgoing edges returns null", () => {
    const workflow: Workflow = {
      id: "w1",
      name: "Test",
      description: "",
      isBuiltIn: false,
      nodes: [
        { id: "ag", type: "agent", name: "Agent" },
        { id: "sum", type: "summary", name: "Summary" },
      ],
      edges: [{ source: "ag", target: "sum" }],
    };
    const graph = compileWorkflow(workflow);
    const sumNode = graph.nodes.get("sum")!;
    // summary has no outgoing edges → null signals graph end
    expect(sumNode.route(makeState())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// compileWorkflow – standard 1-agent workflow (integration)
// ---------------------------------------------------------------------------
describe("compileWorkflow – standard 1-agent workflow", () => {
  it("compiles the built-in standard-1-agent workflow without errors", () => {
    const workflow: Workflow = {
      id: "standard-1-agent",
      name: "Standard 1-Agent",
      description: "A standard single-agent chat conversation.",
      isBuiltIn: true,
      nodes: [
        { id: "agent", type: "agent", name: "Agent", systemPrompt: "You are a helpful assistant." },
      ],
      edges: [],
    };
    const graph = compileWorkflow(workflow);
    expect(graph.entryNodeId).toBe("agent");
    expect(graph.nodes.size).toBe(1);
    const agNode = graph.nodes.get("agent")!;
    expect(agNode.action.kind).toBe("agent");
    // Terminal node: no outgoing edges → returns null
    expect(agNode.route(makeState())).toBeNull();
  });
});
