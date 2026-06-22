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
