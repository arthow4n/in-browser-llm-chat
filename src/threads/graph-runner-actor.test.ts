import { describe, it, expect } from "vitest";
import type { Message } from "../db/db-schema";
import { compileMessages } from "./graph-runner-actor";

describe("compileMessages", () => {
  const sampleMessages: Message[] = [
    {
      id: "msg-1",
      threadId: "thread-1",
      sequence: 1,
      role: "user",
      content: "Hello there",
      type: "text",
      createdAt: 1000,
      checkpointId: null,
      checkpointNs: null,
    },
    {
      id: "msg-2",
      threadId: "thread-1",
      sequence: 2,
      role: "assistant",
      name: "DebaterA",
      content: "I argue X",
      type: "text",
      createdAt: 2000,
      checkpointId: null,
      checkpointNs: null,
    },
    {
      id: "msg-3",
      threadId: "thread-1",
      sequence: 3,
      role: "assistant",
      name: "DebaterB",
      content: "I argue Y",
      type: "text",
      createdAt: 3000,
      checkpointId: null,
      checkpointNs: null,
    },
  ];

  it("should classify active agent messages as assistant and others as user", () => {
    const activeNode = {
      id: "node-a",
      name: "DebaterA",
    };
    const { compiledMessages } = compileMessages(sampleMessages, activeNode, [], [], "openrouter");
    expect(compiledMessages).toHaveLength(3);
    expect(compiledMessages[0].role).toBe("user"); // raw user
    expect(compiledMessages[1].role).toBe("assistant"); // DebaterA (active agent)
    expect(compiledMessages[2].role).toBe("user"); // DebaterB (other agent)
  });

  it("should prefix other agents' messages with their name when compiling to user role", () => {
    const activeNode = {
      id: "node-a",
      name: "DebaterA",
    };
    const { compiledMessages } = compileMessages(sampleMessages, activeNode, [], [], "openrouter");
    expect(compiledMessages[2].content).toBe("[DebaterB]: I argue Y");
  });

  it("should prune context based on maxHistoryMessages", () => {
    const activeNode = {
      id: "node-a",
      name: "DebaterA",
      maxHistoryMessages: 2,
    };
    const { compiledMessages } = compileMessages(sampleMessages, activeNode, [], [], "openrouter");
    expect(compiledMessages).toHaveLength(2);
    expect(compiledMessages[0].content).toBe("I argue X"); // from index 1 (DebaterA message)
  });

  it("should compile and inject system messages at appropriate depths", () => {
    const activeNode = {
      id: "node-a",
      name: "DebaterA",
      systemPrompt: "System Prompt 1",
    };
    const globalSys = [{ content: "Global Sys", depth: -1 }];
    const { compiledMessages } = compileMessages(
      sampleMessages,
      activeNode,
      globalSys,
      [],
      "openrouter",
    );
    // System Prompt 1 goes to index 0.
    // Global Sys depth -1 goes to L - 1 = 3 - 1 = index 2.
    // Length before sys was 3. So final compiled output has the systems inline for openrouter
    expect(compiledMessages[0].role).toBe("system");
    expect(compiledMessages[0].content).toBe("System Prompt 1");

    const sysMsg2 = compiledMessages.find((m) => m.content === "Global Sys");
    expect(sysMsg2).toBeDefined();
    expect(sysMsg2?.role).toBe("system");
  });

  it("should handle Gemini instruction extraction for system role at index 0", () => {
    const activeNode = {
      id: "node-a",
      name: "DebaterA",
      systemPrompt: "Main instruction",
    };
    const { compiledMessages, systemInstruction } = compileMessages(
      sampleMessages,
      activeNode,
      [],
      [],
      "gemini",
    );
    expect(systemInstruction).toBe("Main instruction");
    // Ensure the system message at index 0 is not in compiledMessages list
    expect(compiledMessages[0].role).not.toBe("system");
  });

  it("should calculate target index, deduplicate and merge system messages at correct depths", () => {
    const activeNode = {
      id: "node-a",
      name: "DebaterA",
      systemPrompt: "Active Node Prompt", // depth 0 (workflow)
    };

    // Global and workflow messages with some duplicates and depth specs
    const globalSys = [
      { content: "Global Msg 1", depth: 1 },
      { content: "Duplicate Content", depth: 2 }, // global duplicate
      { content: "Global Msg 2", depth: -1 }, // depth -1 is index L - 1 = 3 - 1 = 2
    ];

    const workflowSys = [
      { content: "Workflow Msg 1", depth: 1 },
      { content: "Duplicate Content", depth: 0 }, // workflow duplicate (should take precedence and be kept because workflow > global)
    ];

    const { compiledMessages } = compileMessages(
      sampleMessages,
      activeNode,
      globalSys,
      workflowSys,
      "openrouter",
    );

    // Initial messages: L = 3 (index 0, 1, 2).
    // Let's analyze:
    // Sched:
    // 1. Active Node Prompt (depth 0, workflow, order -1)
    // 2. Duplicate Content (depth 0, workflow, order 1) -> Same content! Let's check deduplication.
    //    Both are workflow: Active Node Prompt has content "Active Node Prompt", Duplicate Content has "Duplicate Content". No duplicate.
    // 3. Workflow Msg 1 (depth 1, workflow, order 0)
    // 4. Global Msg 1 (depth 1, global, order 0)
    // 5. Duplicate Content (depth 2, global, order 1) -> Same content as Duplicate Content (depth 0, workflow, order 1).
    //    Precedence: workflow duplicate (depth 0) takes precedence over global duplicate (depth 2).
    //    So "Duplicate Content" is resolved to depth 0 (target index 0), and the global one at depth 2 is discarded.
    // 6. Global Msg 2 (depth -1 -> target index 2, global, order 2)

    // Resolved list:
    // - "Active Node Prompt" @ index 0 (workflow)
    // - "Duplicate Content" @ index 0 (workflow)
    // - "Workflow Msg 1" @ index 1 (workflow)
    // - "Global Msg 1" @ index 1 (global)
    // - "Global Msg 2" @ index 2 (global)

    // Merging:
    // Index 0: "Active Node Prompt" and "Duplicate Content" are both workflow. Sorted by order: -1 then 1.
    //          Merged content: "Active Node Prompt\n\nDuplicate Content"
    // Index 1: "Workflow Msg 1" (workflow) and "Global Msg 1" (global). Workflow first.
    //          Merged content: "Workflow Msg 1\n\nGlobal Msg 1"
    // Index 2: "Global Msg 2" (global).
    //          Merged content: "Global Msg 2"

    // Verify system messages spliced into finalHistory (5 items total in final: merged 0, M0, merged 1, M1, merged 2, M2)
    // Actually, splice inserts from back to front:
    // L was 3: [M0, M1, M2]
    // Insert at 2: [M0, M1, System(Global Msg 2), M2]
    // Insert at 1: [M0, System(Workflow Msg 1\n\nGlobal Msg 1), M1, System(Global Msg 2), M2]
    // Insert at 0: [System(Active Node Prompt\n\nDuplicate Content), M0, System(Workflow Msg 1\n\nGlobal Msg 1), M1, System(Global Msg 2), M2]

    expect(compiledMessages).toHaveLength(6);
    expect(compiledMessages[0].role).toBe("system");
    expect(compiledMessages[0].content).toBe("Active Node Prompt\n\nDuplicate Content");

    expect(compiledMessages[2].role).toBe("system");
    expect(compiledMessages[2].content).toBe("Workflow Msg 1\n\nGlobal Msg 1");

    expect(compiledMessages[4].role).toBe("system");
    expect(compiledMessages[4].content).toBe("Global Msg 2");
  });

  it("should keep duplicate of same type with shallower depth", () => {
    const activeNode = {
      id: "node-a",
      name: "DebaterA",
    };
    // Two global system messages with same content: shallower depth (depth 0 / targetIndex 0) should be kept
    const globalSys = [
      { content: "Same", depth: 2 }, // targetIndex 2
      { content: "Same", depth: 0 }, // targetIndex 0
    ];
    const { compiledMessages } = compileMessages(
      sampleMessages,
      activeNode,
      globalSys,
      [],
      "openrouter",
    );
    // Depth 0 kept, depth 2 discarded.
    // Merged at index 0: "Same".
    expect(compiledMessages[0].role).toBe("system");
    expect(compiledMessages[0].content).toBe("Same");
    // Ensure there is no "Same" at index 3 (which was target index 2 before insertion)
    expect(compiledMessages.filter((m) => m.content === "Same")).toHaveLength(1);
  });
});

import { createActor } from "xstate";
import { graphRunnerMachine } from "./graph-runner-actor";
import type { Preset } from "../db/db-schema";

describe("graphRunnerMachine budget enforcement", () => {
  const mockPreset: Preset = {
    id: "preset-1",
    name: "Mock Preset",
    provider: "gemini",
    model: "gemini-1.5-flash",
    temperature: 0.7,
    budgetPolicy: {
      maxStepsWithoutUser: 3,
      maxTokensPerRun: 100,
    },
  };

  it("should detect budget limit exceeded and transition to budgetExceeded state", () => {
    const actor = createActor(graphRunnerMachine, {
      input: {},
    });
    actor.start();

    // Move to running
    actor.send({ type: "START" });
    expect(actor.getSnapshot().value).toEqual({ running: "requesting" });

    // Step 1: Complete step under budget
    actor.send({
      type: "STEP_COMPLETE",
      message: {},
      checkpointId: "cp-1",
      usage: { promptTokens: 10, completionTokens: 20 },
    });
    // Should transition back to requesting since steps (1 < 3) and tokens (30 < 100) are under budget
    expect(actor.getSnapshot().value).toEqual({ running: "requesting" });
    expect(actor.getSnapshot().context.stepsInCurrentRun).toBe(1);
    expect(actor.getSnapshot().context.tokensInCurrentRun).toBe(30);

    // Step 2: Complete step that pushes steps to 2 and tokens to 80
    actor.send({
      type: "STEP_COMPLETE",
      message: {},
      checkpointId: "cp-2",
      usage: { promptTokens: 20, completionTokens: 30 },
    });
    expect(actor.getSnapshot().value).toEqual({ running: "requesting" });
    expect(actor.getSnapshot().context.stepsInCurrentRun).toBe(2);
    expect(actor.getSnapshot().context.tokensInCurrentRun).toBe(80);

    // Provide presetConfig to enable isBudgetExceeded guard checks
    actor.getSnapshot().context.presetConfig = mockPreset;

    // Step 3: Complete step that pushes steps to 3 (which hits maxStepsWithoutUser = 3)
    actor.send({
      type: "STEP_COMPLETE",
      message: {},
      checkpointId: "cp-3",
      usage: { promptTokens: 5, completionTokens: 5 },
    });

    // Should transition to interrupted.budgetExceeded
    expect(actor.getSnapshot().value).toEqual({ interrupted: "budgetExceeded" });
    expect(actor.getSnapshot().context.stepsInCurrentRun).toBe(3);
    expect(actor.getSnapshot().context.tokensInCurrentRun).toBe(90);
  });

  it("should support RESUME_WITH_BUDGET_OVERRIDE, resetting run metrics", () => {
    const actor = createActor(graphRunnerMachine, {
      input: {},
    });
    actor.start();
    actor.getSnapshot().context.presetConfig = mockPreset;

    actor.send({ type: "START" });

    // Send STEP_COMPLETE with big tokens that exceeds maxTokensPerRun (100)
    actor.send({
      type: "STEP_COMPLETE",
      message: {},
      checkpointId: "cp-1",
      usage: { promptTokens: 50, completionTokens: 60 },
    });

    expect(actor.getSnapshot().value).toEqual({ interrupted: "budgetExceeded" });
    expect(actor.getSnapshot().context.tokensInCurrentRun).toBe(110);

    // Resume with override
    actor.send({
      type: "RESUME_WITH_BUDGET_OVERRIDE",
      stepOverride: 5,
      tokenOverride: 200,
    });

    // Verify counters reset and transition back to running.requesting
    expect(actor.getSnapshot().value).toEqual({ running: "requesting" });
    expect(actor.getSnapshot().context.stepsInCurrentRun).toBe(0);
    expect(actor.getSnapshot().context.tokensInCurrentRun).toBe(0);
    expect(actor.getSnapshot().context.budgetOverride).toEqual({
      maxStepsWithoutUser: 5,
      maxTokensPerRun: 200,
    });
  });
});
