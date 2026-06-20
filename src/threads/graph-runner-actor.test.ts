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
