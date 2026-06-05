import { describe, it, expect, vi } from "vitest";
import { validateWorkflow } from "./schemas.js";
import { compileWorkflow, type CompilationContext } from "./compiler.js";
import type { WorkflowNode, WorkflowEdge } from "./schemas.js";
import { MemorySaver, Command } from "@langchain/langgraph";

describe("Workflow Structural Validation", () => {
  it("should validate a simple valid workflow", () => {
    const nodes: WorkflowNode[] = [
      { id: "input", type: "input", name: "User Input" },
      { id: "agent", type: "agent", name: "Agent Node", systemPrompt: "Hello" },
    ];
    const edges: WorkflowEdge[] = [{ from: "input", to: "agent" }];

    const result = validateWorkflow(nodes, edges);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail validation if there are multiple entry points", () => {
    const nodes: WorkflowNode[] = [
      { id: "input1", type: "input", name: "User Input 1" },
      { id: "input2", type: "input", name: "User Input 2" },
    ];
    const edges: WorkflowEdge[] = [];

    const result = validateWorkflow(nodes, edges);
    expect(result.success).toBe(false);
    expect(result.errors.join("")).toContain("multiple potential entry point nodes");
  });

  it("should fail validation if there are isolated nodes", () => {
    const nodes: WorkflowNode[] = [
      { id: "input", type: "input", name: "User Input" },
      { id: "agent1", type: "agent", name: "Agent 1" },
      { id: "agent2", type: "agent", name: "Agent 2" },
    ];
    const edges: WorkflowEdge[] = [{ from: "input", to: "agent1" }];

    const result = validateWorkflow(nodes, edges);
    expect(result.success).toBe(false);
    expect(result.errors.join("")).toContain("unreachable or isolated");
  });

  it("should fail validation if agent has tools but lacks on_tool_call edge or return edge", () => {
    const nodes: WorkflowNode[] = [
      { id: "input", type: "input", name: "User Input" },
      { id: "agent", type: "agent", name: "Agent Node", tools: ["ask_questions"] },
      { id: "tool", type: "tool", name: "Tool Node" },
    ];
    const edges: WorkflowEdge[] = [
      { from: "input", to: "agent" },
      { from: "agent", to: "tool" }, // missing condition: on_tool_call
    ];

    const result = validateWorkflow(nodes, edges);
    expect(result.success).toBe(false);
    expect(result.errors.join("")).toContain(
      "must have an outbound edge with condition 'on_tool_call'",
    );
  });
});

describe("Workflow Compiler and Execution", () => {
  it("should compile and execute a basic graph", async () => {
    const nodes: WorkflowNode[] = [
      { id: "input", type: "input", name: "User Input" },
      {
        id: "agent",
        type: "agent",
        name: "Agent Node",
        systemPrompt: "You are talking about {{topic}}",
      },
    ];
    const edges: WorkflowEdge[] = [{ from: "input", to: "agent" }];

    const callLLMMock = vi.fn<any>().mockResolvedValue({
      content: "Summary of topic",
    });

    const context = {
      callLLM: callLLMMock,
    } as unknown as CompilationContext;

    const graph = compileWorkflow(nodes, edges, context);
    const compiled = graph.compile({ checkpointer: new MemorySaver() });

    // Start execution (first step will pause at input node)
    const config = { configurable: { thread_id: "thread-1" } };
    const state1 = await compiled.getState(config);
    expect(state1.values.messages).toBeUndefined();

    // Run graph, it should hit the interrupt in input node
    const run1 = await compiled.stream(
      {
        messages: [],
      },
      { ...config, streamMode: "values" },
    );

    for await (const _chunk of run1) {
      // Consume stream
    }

    // Since input has an interrupt, the state should halt
    const stateAfterInterrupt = await compiled.getState(config);
    expect(stateAfterInterrupt.next).toContain("input");

    // Resume execution by passing user input
    const run2 = await compiled.stream(new Command({ resume: "Discuss cats" }), config);
    for await (const _chunk of run2) {
      // Consume stream
    }

    // Now it should have executed input and agent
    const stateFinal = await compiled.getState(config);
    expect(stateFinal.next).toHaveLength(0); // Finished execution

    expect(stateFinal.values.messages).toHaveLength(2);
    expect(stateFinal.values.messages[0].role).toBe("user");
    expect(stateFinal.values.messages[0].content).toBe("Discuss cats");
    expect(stateFinal.values.messages[1].role).toBe("assistant");
    expect(stateFinal.values.messages[1].content).toBe("Summary of topic");

    // Verify dynamic placeholder substitution
    expect(callLLMMock).toHaveBeenCalledWith(
      undefined,
      "You are talking about Discuss cats",
      expect.any(Array),
      expect.any(Array),
    );
  });

  it("should validate and execute loop headers and round count increments", async () => {
    const nodes: WorkflowNode[] = [
      { id: "input", type: "input", name: "User Input" },
      {
        id: "agent_a",
        type: "agent",
        name: "Agent A",
        loopHeader: true,
        excludeToolsBeforeRound: { special_tool: 2 },
        tools: ["special_tool"],
      },
      { id: "evaluator", type: "consensus_check", name: "Consensus Evaluator", maxLoopLimit: 3 },
      { id: "summary", type: "summary", name: "Summary" },
    ];
    const edges: WorkflowEdge[] = [
      { from: "input", to: "agent_a" },
      { from: "agent_a", to: "evaluator" },
      { from: "evaluator", to: "agent_a", condition: "on_no_consensus" },
      { from: "evaluator", to: "summary", condition: "on_consensus" },
    ];

    const callLLMToolsHistory: (string[] | undefined)[] = [];
    const callLLMMock = vi
      .fn<any>()
      .mockImplementation(async (_preset, _systemPrompt, _messages, tools) => {
        callLLMToolsHistory.push(tools as string[] | undefined);
        return {
          content: JSON.stringify({ consensusReached: false, reasoning: "no consensus yet" }),
        };
      });

    const context = {
      callLLM: callLLMMock,
      warn: vi.fn<any>(),
    } as unknown as CompilationContext;

    const graph = compileWorkflow(nodes, edges, context);
    const compiled = graph.compile({ checkpointer: new MemorySaver() });
    const config = { configurable: { thread_id: "thread-loop-test" } };

    // 1. Start execution -> stops at input
    await compiled.stream({ messages: [] }, { ...config, streamMode: "values" });

    // 2. Resume input -> executes agent_a (round 1), evaluator -> loops back to agent_a -> stops at input?
    // Wait, evaluator loops back to agent_a. So agent_a executes again.
    // Let's stream with the Command to resume.
    const run = await compiled.stream(new Command({ resume: "Topic of debate" }), {
      ...config,
      streamMode: "values",
    });
    for await (const _ of run) {
    }

    const state = await compiled.getState(config);
    // Since maxLoopLimit is 3, it should run:
    // Round 1 (agent_a) -> evaluator (round 1, no consensus)
    // Round 2 (agent_a) -> evaluator (round 2, no consensus)
    // Round 3 (agent_a) -> evaluator (round 3, terminates by limit) -> summary -> finished.
    expect(state.next).toHaveLength(0); // completed
    expect(state.values.currentRound).toBe(3);

    expect(callLLMToolsHistory).toHaveLength(4);
    expect(callLLMToolsHistory[0]).not.toContain("special_tool");
    expect(callLLMToolsHistory[1]).toContain("special_tool");
    expect(callLLMToolsHistory[2]).toContain("special_tool");
    expect(callLLMToolsHistory[3]).toBeUndefined();
  });

  it("should handle consensus check LLM failure and default to false", async () => {
    const nodes: WorkflowNode[] = [
      {
        id: "evaluator",
        type: "consensus_check",
        name: "Consensus Evaluator",
        systemPrompt: "evaluate",
      },
    ];
    const edges: WorkflowEdge[] = [];
    const warnMock = vi.fn<any>();
    const context = {
      callLLM: vi.fn<any>().mockResolvedValue({ content: "invalid-json" }),
      warn: warnMock,
    } as unknown as CompilationContext;

    const graph = compileWorkflow(nodes, edges, context);
    const compiled = graph.compile();
    const res = await compiled.invoke({ messages: [] });

    expect(res.consensusReached).toBe(false);
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining("JSON parsing failed"));
  });

  it("should handle interactive tools and interrupts", async () => {
    const nodes: WorkflowNode[] = [
      { id: "input", type: "input", name: "User Input" },
      { id: "agent", type: "agent", name: "Agent", tools: ["ask_questions"] },
      { id: "tool", type: "tool", name: "Tool Node" },
    ];
    const edges: WorkflowEdge[] = [
      { from: "input", to: "agent" },
      { from: "agent", to: "tool", condition: "on_tool_call" },
      { from: "agent", to: "input" }, // unconditional fallback
      { from: "tool", to: "agent", condition: "on_tool_result" },
    ];

    const callLLMMock = vi
      .fn<any>()
      .mockResolvedValueOnce({
        content: "calling tool",
        tool_calls: [{ id: "tc-1", name: "ask_questions", args: { questions: [] } }],
      })
      .mockResolvedValueOnce({
        content: "all done",
      });

    const context = {
      callLLM: callLLMMock,
    } as unknown as CompilationContext;

    const graph = compileWorkflow(nodes, edges, context);
    const compiled = graph.compile({ checkpointer: new MemorySaver() });
    const config = { configurable: { thread_id: "thread-tool-test" } };

    // Start execution -> stops at input
    await compiled.stream({ messages: [] }, { ...config, streamMode: "values" });

    // Resume input -> runs input, agent -> triggers tool call -> enters tool node -> interrupts
    const run = await compiled.stream(new Command({ resume: "start" }), {
      ...config,
      streamMode: "values",
    });
    for await (const _ of run) {
    }

    const state1 = await compiled.getState(config);
    expect(state1.next).toContain("tool");
    expect(state1.tasks[0].interrupts[0].value.type).toBe("tool");

    // Resume the tool node with tool result -> runs tool, agent -> goes to input -> interrupts
    const run2 = await compiled.stream(new Command({ resume: { answers: { q1: "yes" } } }), config);
    for await (const _ of run2) {
    }

    const state2 = await compiled.getState(config);
    expect(state2.next).toContain("input");
    expect(state2.values.messages).toHaveLength(4); // input (text), agent (tool_call), tool (tool_result), agent (text)
    expect(state2.values.messages[2].role).toBe("tool");
    expect(state2.values.messages[2].content).toContain("answers");
  });
});
